/**
 * agent 块配置校验（解析期白名单校验，ADR-015/016）
 * 纯函数：返回错误消息列表，空数组表示合法
 */

import { t } from '../../../utils/i18n.js';
import type { AgentBlockConfig } from './types.js';

/** 支持的 provider（v2.0-alpha 内置 openai / anthropic，pi-agent 等为扩展点） */
export const SUPPORTED_AGENT_PROVIDERS = ['openai', 'anthropic'] as const;

/** v2.0 已注册工具（完整实现见 ADR-016/018） */
export const REGISTERED_TOOLS = ['code_execution', 'file_read', 'file_write', 'api_call', 'browser', 'web_search'] as const;

/**
 * 从 meta 中取字符串值（数组值取首个，非字符串返回 undefined）
 * @param meta - 块元数据
 * @param key - 键名
 * @returns 字符串值或 undefined
 */
function metaString(meta: Record<string, string | string[]>, key: string): string | undefined {
  const value = meta[key];
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value[0];
  return undefined;
}

/**
 * 将 meta 归一化为 AgentBlockConfig（数值字段按原始字符串校验，此处仅取原始形态）
 * @param meta - 块元数据
 * @returns 归一化后的配置
 */
function toConfig(meta: Record<string, string | string[]>): AgentBlockConfig {
  const rawTools = meta.tools;
  const tools = Array.isArray(rawTools)
    ? rawTools
    : typeof rawTools === 'string' && rawTools.trim()
      ? [rawTools]
      : [];
  return {
    goal: metaString(meta, 'goal'),
    output: metaString(meta, 'output'),
    provider: metaString(meta, 'provider'),
    tools,
    max_steps: meta.max_steps !== undefined ? Number(meta.max_steps) : undefined,
    timeout: meta.timeout !== undefined ? Number(meta.timeout) : undefined,
    temperature: meta.temperature !== undefined ? Number(meta.temperature) : undefined,
  };
}

/**
 * 校验数值参数是否为合法的正数（非数字字符串也会被标记为非法）
 * @param raw - 原始字符串值
 * @param integerOnly - 是否只允许整数
 * @param min - 允许的最小值（含）
 * @param max - 允许的最大值（含）
 * @returns 是否合法
 */
function isNumberInRange(raw: string | string[] | undefined, integerOnly: boolean, min: number, max?: number): boolean {
  if (raw === undefined) return true;
  const text = (Array.isArray(raw) ? raw[0] : raw).trim();
  if (!/^-?\d+(\.\d+)?$/.test(text)) return false;
  const n = Number(text);
  if (!Number.isFinite(n)) return false;
  if (integerOnly && !Number.isInteger(n)) return false;
  if (n < min) return false;
  if (max !== undefined && n > max) return false;
  return true;
}

/**
 * 校验 agent 块配置，返回错误消息列表（空数组表示合法）
 * @param meta - 块元数据
 * @param registeredTools - 已注册工具列表（默认 v2.0-alpha 集合）
 * @returns 错误消息数组
 */
export function validateAgentConfig(
  meta: Record<string, string | string[]>,
  registeredTools: string[] = [...REGISTERED_TOOLS]
): string[] {
  const errors: string[] = [];
  const config = toConfig(meta);

  if (!config.goal) {
    errors.push(t('error.agent.goalRequired'));
  }

  if (!config.output) {
    errors.push(t('error.agent.outputRequired'));
  }

  if (config.provider && !SUPPORTED_AGENT_PROVIDERS.includes(config.provider as (typeof SUPPORTED_AGENT_PROVIDERS)[number])) {
    errors.push(t('error.agent.badProvider', { provider: config.provider }));
  }

  for (const tool of config.tools ?? []) {
    if (!registeredTools.includes(tool)) {
      errors.push(t('error.agent.unknownTool', { tool }));
    }
  }

  if (!isNumberInRange(meta.max_steps, true, 1)) {
    errors.push(t('error.agent.badMaxSteps'));
  }

  if (!isNumberInRange(meta.timeout, false, 1)) {
    errors.push(t('error.agent.badTimeout'));
  }

  if (!isNumberInRange(meta.temperature, false, 0, 2)) {
    errors.push(t('error.agent.badTemperature'));
  }

  return errors;
}
