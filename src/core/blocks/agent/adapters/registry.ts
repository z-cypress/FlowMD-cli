/**
 * agent 适配器注册表（ADR-020）
 * adapter 名 → AgentAdapter，内置 chat（ReAct 循环）与 direct（单次调用）；
 * 第三方 provider 实现 AgentAdapter 后可在此注册接入
 */

import type { AgentAdapter } from '../types.js';
import { runAgentLoop } from '../loop.js';
import { createDirectAdapter } from './direct.js';

/** 内置适配器名集合（与 validate.REGISTERED_ADAPTERS 保持一致） */
export const REGISTERED_ADAPTER_NAMES: readonly string[] = ['chat', 'direct'];

/**
 * 创建适配器注册表
 * @returns adapter 名 → AgentAdapter 的 Map
 */
export function createAdapterRegistry(): Map<string, AgentAdapter> {
  const registry = new Map<string, AgentAdapter>();
  const chat: AgentAdapter = {
    name: 'chat',
    description: 'ReAct 多步循环（思考 + 工具 + 观察），默认',
    execute: runAgentLoop,
  };
  registry.set(chat.name, chat);
  const direct = createDirectAdapter();
  registry.set(direct.name, direct);
  return registry;
}
