/**
 * FlowMD AI 块执行器
 * 调用 LLM API（OpenAI、Anthropic）处理提示词
 */

import { getOpenAIClient, getAnthropicClient } from '../llm/clients.js';
import type { ExecutionContext } from '../context.js';
import type { LLMConfig, BlockResult } from '../../types/index.js';
import { getErrorMessage } from '../../utils/error-formatter.js';
import { t } from '../../utils/i18n.js';

/** AI 块配置 */
interface AIBlockConfig {
  /** 模型名称（可选） */
  model?: string;
  /** 输出变量名（可选） */
  output?: string;
  /** 温度参数（可选） */
  temperature?: number;
  /** 最大输出 Token 数（可选） */
  max_tokens?: number;
  /** 流式输出（可选，true 时逐段回调 onToken） */
  stream?: boolean | string;
  /** 结构化输出格式（可选，"json" | "json-array"） */
  format?: string;
}

/**
 * 执行 AI 块，调用配置的 LLM
 * @param content - 提示词内容（可包含 {{变量}}）
 * @param config - 块级配置
 * @param context - 变量上下文，用于渲染
 * @param llmConfig - LLM 提供商配置
 * @param models - 命名模型预设
 * @param signal - 可选的中止信号（超时/取消时触发）
 * @param onToken - 可选的回调，流式模式下逐段收到生成的文本
 * @returns 块执行结果
 */
export async function executeAIBlock(
  content: string,
  config: AIBlockConfig,
  context: ExecutionContext,
  llmConfig: LLMConfig,
  models?: Record<string, Partial<LLMConfig>>,
  signal?: AbortSignal,
  onToken?: (delta: string) => void
): Promise<BlockResult> {
  const startTime = Date.now();

  try {
    // 解析实际使用的模型：块级 model 参数 → 命名预设 → 全局默认
    const resolvedConfig = { ...llmConfig };
    if (config.model) {
      const preset = models?.[config.model];
      if (preset) {
        if (preset.provider) resolvedConfig.provider = preset.provider;
        if (preset.temperature !== undefined) resolvedConfig.temperature = preset.temperature;
        if (preset.max_tokens !== undefined) config.max_tokens = preset.max_tokens;
        if (preset.baseURL) resolvedConfig.baseURL = preset.baseURL;
        // 预设切换了提供商时，解析对应的 API Key
        if (preset.provider && preset.provider !== llmConfig.provider) {
          resolvedConfig.apiKey = preset.provider === 'openai'
            ? (process.env.OPENAI_API_KEY || '')
            : (process.env.ANTHROPIC_API_KEY || '');
        }
        resolvedConfig.model = preset.model || resolvedConfig.model;
      } else {
        // 直接使用块级指定的模型名
        resolvedConfig.model = config.model;
      }
    }

    // 验证 API Key
    if (!resolvedConfig.apiKey) {
      return {
        success: false,
        output: null,
        error: t('error.ai.noApiKey', { envVar: resolvedConfig.provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY' }),
        duration: Date.now() - startTime,
      };
    }

    // 渲染提示词中的变量
    const renderedPrompt = context.render(content);

    // 根据提供商调用 LLM
    let resultText: string;

    if (resolvedConfig.provider === 'openai') {
      resultText = await callOpenAI(renderedPrompt, config, resolvedConfig, signal, onToken);
    } else if (resolvedConfig.provider === 'anthropic') {
      resultText = await callAnthropic(renderedPrompt, config, resolvedConfig, signal, onToken);
    } else {
      return {
        success: false,
        output: null,
        error: t('error.ai.badProvider', { provider: resolvedConfig.provider }),
        duration: Date.now() - startTime,
      };
    }

    // 结构化输出：自动解析 JSON
    const formatMode = config.format;
    if (formatMode === 'json' || formatMode === 'json-array') {
      try {
        const parsed = JSON.parse(resultText);
        if (formatMode === 'json-array' && !Array.isArray(parsed)) {
          return {
            success: false,
            output: null,
            error: t('error.ai.formatNotArray', { format: formatMode }),
            duration: Date.now() - startTime,
          };
        }
        // 存入解析后的对象（而非原始文本）
        if (config.output) {
          context.set(config.output, parsed);
        }
        return {
          success: true,
          output: JSON.stringify(parsed, null, 2),
          duration: Date.now() - startTime,
        };
      } catch (parseErr) {
        return {
          success: false,
          output: null,
          error: t('error.ai.jsonParseFailed', { error: getErrorMessage(parseErr), raw: resultText.slice(0, 200) }),
          duration: Date.now() - startTime,
        };
      }
    }

    // 如果指定了输出变量名，将结果存入上下文
    if (config.output) {
      context.set(config.output, resultText);
    }

    return {
      success: true,
      output: resultText,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      output: null,
      error: getErrorMessage(error),
      duration: Date.now() - startTime,
    };
  }
}

/**
 * 解析流式标志（meta 值为字符串 "true"/"false" 或布尔）
 * @param value - 原始值
 * @returns 是否为流式
 */
function isStreaming(value: boolean | string | undefined): boolean {
  if (value === undefined) return false;
  if (typeof value === 'boolean') return value;
  return value === 'true';
}

/**
 * 调用 OpenAI API
 * @param prompt - 渲染后的提示词
 * @param config - 块级配置
 * @param llmConfig - LLM 配置（含解析后的模型）
 * @param signal - 可选的中止信号
 * @param onToken - 可选的回调，流式模式下逐段收到生成的文本
 * @returns 生成的文本
 */
async function callOpenAI(
  prompt: string,
  config: AIBlockConfig,
  llmConfig: LLMConfig,
  signal?: AbortSignal,
  onToken?: (delta: string) => void
): Promise<string> {
  const client = getOpenAIClient(llmConfig);

  // 确保 temperature 是数字类型
  const temperature = typeof config.temperature === 'string'
    ? parseFloat(config.temperature)
    : (config.temperature ?? llmConfig.temperature ?? 0.7);

  const maxTokens = typeof config.max_tokens === 'string'
    ? parseInt(config.max_tokens, 10)
    : config.max_tokens;

  const params = {
    model: llmConfig.model,
    temperature: temperature,
    max_tokens: maxTokens,
    messages: [{ role: 'user' as const, content: prompt }],
  };

  // 流式模式：逐段累积并回调
  if (isStreaming(config.stream)) {
    const stream = await client.chat.completions.create(
      { ...params, stream: true },
      { signal }
    );
    let text = '';
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || '';
      if (delta) {
        text += delta;
        onToken?.(delta);
      }
    }
    return text;
  }

  const response = await client.chat.completions.create(params, { signal });

  return response.choices[0].message.content || '';
}

/**
 * 调用 Anthropic API
 * @param prompt - 渲染后的提示词
 * @param config - 块级配置
 * @param llmConfig - LLM 配置（含解析后的模型）
 * @param signal - 可选的中止信号
 * @param onToken - 可选的回调，流式模式下逐段收到生成的文本
 * @returns 生成的文本
 */
async function callAnthropic(
  prompt: string,
  config: AIBlockConfig,
  llmConfig: LLMConfig,
  signal?: AbortSignal,
  onToken?: (delta: string) => void
): Promise<string> {
  const client = getAnthropicClient(llmConfig);

  // 确保 temperature 是数字类型
  const temperature = typeof config.temperature === 'string'
    ? parseFloat(config.temperature)
    : (config.temperature ?? llmConfig.temperature ?? 0.7);

  const maxTokens = typeof config.max_tokens === 'string'
    ? parseInt(config.max_tokens, 10)
    : (config.max_tokens ?? 4096);

  const params = {
    model: llmConfig.model,
    max_tokens: maxTokens,
    temperature: temperature,
    messages: [{ role: 'user' as const, content: prompt }],
  };

  // 流式模式：逐段累积并回调（Anthropic SDK 事件流）
  if (isStreaming(config.stream)) {
    const stream = await client.messages.create(
      { ...params, stream: true },
      { signal }
    );
    let text = '';
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        const delta = event.delta.text || '';
        if (delta) {
          text += delta;
          onToken?.(delta);
        }
      }
    }
    return text;
  }

  const response = await client.messages.create(params, { signal });

  // 从响应内容中提取文本
  const textBlock = response.content.find((block) => block.type === 'text');
  return textBlock?.text || '';
}
