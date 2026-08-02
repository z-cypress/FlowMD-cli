/**
 * 自然语言生成文档（v2.0）
 * 根据用户描述调用 LLM 生成一份可执行的 FlowMD 文档
 */

import { getLLMConfig } from '../utils/config.js';
import { getOpenAIClient, getAnthropicClient } from './llm/clients.js';
import { t } from '../utils/i18n.js';
import type { LLMConfig } from '../types/index.js';

/** 生成选项 */
export interface GenerateDocumentOptions {
  /** LLM 提供商覆盖（openai | anthropic），默认取配置 */
  provider?: string;
  /** 模型名覆盖，默认取配置 */
  model?: string;
  /** 中止信号 */
  signal?: AbortSignal;
}

/** 文档生成器 system prompt：约束输出可执行的 FlowMD 文档 */
const GENERATOR_PROMPT = `你是 FlowMD 文档生成器。
FlowMD 通过执行 Markdown 中的特殊代码块来生成文档。请根据用户的描述生成一份可直接用 flowmd run 执行的 .flow.md 文档。

规则：
1. 只输出 Markdown 内容本身，不要输出任何解释、前言或围栏包裹（不要用 \`\`\` 包围整个文档）
2. 根据任务合理使用代码块：
   - ai 块：需要 LLM 生成/分析内容，如 \`\`\`ai {output: "name"} 提示词 \`\`\`
   - data 块：需要查询数据库，如 \`\`\`data {from: "default", output: "name"} SELECT ... \`\`\`
   - template 块：用 Handlebars 排版最终输出
   - run 块：需要执行脚本计算
   - agent 块：需要自主多步调研/任务
3. 代码块产生的变量用 {{变量名}} 在正文中引用
4. 使用中文，结构清晰，标题层级合理`;

/**
 * 根据描述生成 FlowMD 文档
 * @param description - 自然语言描述
 * @param options - 生成选项
 * @returns 生成的 Markdown 文档
 */
export async function generateDocument(
  description: string,
  options: GenerateDocumentOptions = {}
): Promise<string> {
  const config = getLLMConfig();
  const resolved: LLMConfig = { ...config };
  if (options.provider) {
    resolved.provider = options.provider as 'openai' | 'anthropic';
    resolved.apiKey = options.provider === 'openai'
      ? (process.env.OPENAI_API_KEY || '')
      : (process.env.ANTHROPIC_API_KEY || '');
  }
  if (options.model) {
    resolved.model = options.model;
  }

  if (!resolved.apiKey) {
    throw new Error(t('error.ai.noApiKey', { envVar: resolved.provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY' }));
  }

  if (resolved.provider === 'openai') {
    return callOpenAIGenerate(resolved, description, options.signal);
  }
  return callAnthropicGenerate(resolved, description, options.signal);
}

/**
 * 调用 OpenAI 生成文档
 * @param config - LLM 配置
 * @param description - 用户描述
 * @param signal - 中止信号
 * @returns 生成的 Markdown
 */
async function callOpenAIGenerate(
  config: LLMConfig,
  description: string,
  signal?: AbortSignal
): Promise<string> {
  const client = getOpenAIClient(config);
  const response = await client.chat.completions.create({
    model: config.model,
    temperature: 0.7,
    messages: [
      { role: 'system', content: GENERATOR_PROMPT },
      { role: 'user', content: description },
    ],
  }, { signal });
  return response.choices[0]?.message?.content ?? '';
}

/**
 * 调用 Anthropic 生成文档
 * @param config - LLM 配置
 * @param description - 用户描述
 * @param signal - 中止信号
 * @returns 生成的 Markdown
 */
async function callAnthropicGenerate(
  config: LLMConfig,
  description: string,
  signal?: AbortSignal
): Promise<string> {
  const client = getAnthropicClient(config);
  const response = await client.messages.create({
    model: config.model,
    max_tokens: config.max_tokens ?? 4096,
    system: GENERATOR_PROMPT,
    messages: [{ role: 'user', content: description }],
  }, { signal });
  const textBlock = response.content.find((block) => block.type === 'text');
  return textBlock?.text ?? '';
}
