/**
 * 共享 LLM 客户端缓存
 * ai 块与 agent 块共用，按（API Key 哈希 + baseURL）缓存客户端
 */

import { createHash } from 'node:crypto';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import type { LLMConfig } from '../../types/index.js';

/** 客户端缓存键 */
type ClientCacheKey = string;

/** OpenAI 客户端缓存 */
const openaiClients = new Map<ClientCacheKey, OpenAI>();

/** Anthropic 客户端缓存 */
const anthropicClients = new Map<ClientCacheKey, Anthropic>();

/**
 * 对 API Key 做哈希，避免明文出现在缓存键中
 * @param apiKey - API Key
 * @returns 哈希后的键片段
 */
function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex').slice(0, 16);
}

/**
 * 获取或创建 OpenAI 客户端
 * @param llmConfig - LLM 配置
 * @returns OpenAI 客户端
 */
export function getOpenAIClient(llmConfig: LLMConfig): OpenAI {
  const key = `${hashApiKey(llmConfig.apiKey)}:${llmConfig.baseURL || ''}`;
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
export function getAnthropicClient(llmConfig: LLMConfig): Anthropic {
  const key = hashApiKey(llmConfig.apiKey);
  let client = anthropicClients.get(key);
  if (!client) {
    client = new Anthropic({
      apiKey: llmConfig.apiKey,
    });
    anthropicClients.set(key, client);
  }
  return client;
}
