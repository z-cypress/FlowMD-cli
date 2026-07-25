/**
 * FlowMD AI 块执行器
 * 调用 LLM API（OpenAI、Anthropic）处理提示词
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import type { ExecutionContext } from '../context.js';
import type { LLMConfig, BlockResult } from '../../types/index.js';
import { getErrorMessage } from '../../utils/error-formatter.js';

/** AI 块配置 */
interface AIBlockConfig {
  /** 模型名称（可选） */
  model?: string;
  /** 输出变量名（可选） */
  output?: string;
  /** 温度参数（可选） */
  temperature?: number;
}

/** 客户端缓存键 */
type ClientCacheKey = string;

/** OpenAI 客户端缓存 */
const openaiClients = new Map<ClientCacheKey, OpenAI>();

/** Anthropic 客户端缓存 */
const anthropicClients = new Map<ClientCacheKey, Anthropic>();

/**
 * 获取或创建 OpenAI 客户端
 * @param llmConfig - LLM 配置
 * @returns OpenAI 客户端
 */
function getOpenAIClient(llmConfig: LLMConfig): OpenAI {
  const key = `${llmConfig.apiKey}:${llmConfig.baseURL || ''}`;
  let client = openaiClients.get(key);
  if (!client) {
    client = new OpenAI({
      apiKey: llmConfig.apiKey,
      baseURL: llmConfig.baseURL,
    });
    openaiClients.set(key, client);
  }
  return client;
}

/**
 * 获取或创建 Anthropic 客户端
 * @param llmConfig - LLM 配置
 * @returns Anthropic 客户端
 */
function getAnthropicClient(llmConfig: LLMConfig): Anthropic {
  const key = llmConfig.apiKey;
  let client = anthropicClients.get(key);
  if (!client) {
    client = new Anthropic({
      apiKey: llmConfig.apiKey,
    });
    anthropicClients.set(key, client);
  }
  return client;
}

/**
 * 执行 AI 块，调用配置的 LLM
 * @param content - 提示词内容（可包含 {{变量}}）
 * @param config - 块级配置
 * @param context - 变量上下文，用于渲染
 * @param llmConfig - LLM 提供商配置
 * @returns 块执行结果
 */
export async function executeAIBlock(
  content: string,
  config: AIBlockConfig,
  context: ExecutionContext,
  llmConfig: LLMConfig,
  models?: Record<string, Partial<LLMConfig>>
): Promise<BlockResult> {
  const startTime = Date.now();

  try {
    // 如果 model 参数匹配命名模型预设，合并预设配置
    const resolvedConfig = { ...llmConfig };
    if (config.model && models && models[config.model]) {
      const preset = models[config.model];
      if (preset.provider) resolvedConfig.provider = preset.provider;
      if (preset.model) resolvedConfig.model = preset.model;
      if (preset.temperature !== undefined) resolvedConfig.temperature = preset.temperature;
      if (preset.baseURL) resolvedConfig.baseURL = preset.baseURL;
      // 预设切换了提供商时，解析对应的 API Key
      if (preset.provider && preset.provider !== llmConfig.provider) {
        resolvedConfig.apiKey = preset.provider === 'openai'
          ? (process.env.OPENAI_API_KEY || '')
          : (process.env.ANTHROPIC_API_KEY || '');
      }
    }

    // 验证 API Key
    if (!resolvedConfig.apiKey) {
      return {
        success: false,
        output: null,
        error: `API Key 未配置。请设置环境变量 ${resolvedConfig.provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY'}，或运行 flow init 配置`,
        duration: Date.now() - startTime,
      };
    }

    // 渲染提示词中的变量
    const renderedPrompt = context.render(content);

    // 根据提供商调用 LLM
    let resultText: string;

    if (resolvedConfig.provider === 'openai') {
      resultText = await callOpenAI(renderedPrompt, config, resolvedConfig);
    } else if (resolvedConfig.provider === 'anthropic') {
      resultText = await callAnthropic(renderedPrompt, config, resolvedConfig);
    } else {
      return {
        success: false,
        output: null,
        error: `不支持的 LLM 提供商: ${resolvedConfig.provider}`,
        duration: Date.now() - startTime,
      };
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
 * 调用 OpenAI API
 * @param prompt - 渲染后的提示词
 * @param config - 块级配置
 * @param llmConfig - LLM 配置
 * @returns 生成的文本
 */
async function callOpenAI(
  prompt: string,
  config: AIBlockConfig,
  llmConfig: LLMConfig
): Promise<string> {
  const client = getOpenAIClient(llmConfig);

  // 确保 temperature 是数字类型
  const temperature = typeof config.temperature === 'string' 
    ? parseFloat(config.temperature) 
    : (config.temperature ?? llmConfig.temperature ?? 0.7);

  const response = await client.chat.completions.create({
    model: config.model || llmConfig.model,
    temperature: temperature,
    messages: [{ role: 'user', content: prompt }],
  });

  return response.choices[0].message.content || '';
}

/**
 * 调用 Anthropic API
 * @param prompt - 渲染后的提示词
 * @param config - 块级配置
 * @param llmConfig - LLM 配置
 * @returns 生成的文本
 */
async function callAnthropic(
  prompt: string,
  config: AIBlockConfig,
  llmConfig: LLMConfig
): Promise<string> {
  const client = getAnthropicClient(llmConfig);

  // 确保 temperature 是数字类型
  const temperature = typeof config.temperature === 'string' 
    ? parseFloat(config.temperature) 
    : (config.temperature ?? llmConfig.temperature ?? 0.7);

  const response = await client.messages.create({
    model: config.model || llmConfig.model,
    max_tokens: 4096,
    temperature: temperature,
    messages: [{ role: 'user', content: prompt }],
  });

  // 从响应内容中提取文本
  const textBlock = response.content.find((block) => block.type === 'text');
  return textBlock?.text || '';
}
