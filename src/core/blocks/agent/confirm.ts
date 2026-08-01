/**
 * agent 块运行时确认模块（ADR-016）
 * 按（goal + 工具集）记忆用户对自主执行的同意，持久化到 .flow/config.yml 的 agent.confirmedAgents
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { confirm } from '../../../utils/prompt.js';
import { t } from '../../../utils/i18n.js';

/** 确认流程控制标志 */
export interface AgentConfirmFlags {
  /** --yes：跳过本次确认（不持久化） */
  yes?: boolean;
  /** --strict：每次执行都强制确认（不持久化） */
  strict?: boolean;
}

/** 配置文件路径（惰性计算，便于测试切换工作目录） */
function getConfigPath(): string {
  return join(process.cwd(), '.flow', 'config.yml');
}

/** 读取已确认的 agent 键列表 */
function readConfirmedAgents(): string[] {
  try {
    if (!existsSync(getConfigPath())) return [];
    const data = parseYaml(readFileSync(getConfigPath(), 'utf-8')) as Record<string, unknown>;
    const agent = data.agent as Record<string, unknown> | undefined;
    const confirmed = agent?.confirmedAgents;
    return Array.isArray(confirmed)
      ? confirmed.filter((x): x is string => typeof x === 'string')
      : [];
  } catch {
    return [];
  }
}

/** 将 agent 键持久化为已确认 */
function persistAgent(key: string): void {
  let data: Record<string, unknown> = {};
  const configPath = getConfigPath();
  try {
    if (existsSync(configPath)) {
      data = parseYaml(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
    }
  } catch {
    // 配置解析失败时按空配置处理
  }

  const agent = (data.agent as Record<string, unknown>) ?? {};
  const confirmed = Array.isArray(agent.confirmedAgents)
    ? (agent.confirmedAgents as string[])
    : [];
  if (!confirmed.includes(key)) {
    confirmed.push(key);
  }
  agent.confirmedAgents = confirmed;
  data.agent = agent;

  mkdirSync(join(process.cwd(), '.flow'), { recursive: true });
  writeFileSync(configPath, stringifyYaml(data, { lineWidth: 120 }), 'utf-8');
}

/**
 * 生成确认键：goal + 排序后的工具集，同类 agent 只确认一次
 * @param goal - 任务目标
 * @param tools - 工具白名单
 * @returns 确认键
 */
export function agentConfirmKey(goal: string, tools: string[]): string {
  return `${goal}::${[...tools].sort().join(',')}`;
}

/**
 * 确保 agent 执行已获用户授权
 * 已确认 / --yes 直接通过；否则弹确认，接受后持久化（--strict 例外）
 * @param goal - 任务目标
 * @param tools - 工具白名单
 * @param flags - 确认控制标志
 * @returns 是否获得授权
 */
export async function ensureAgentConfirmed(
  goal: string,
  tools: string[],
  flags?: AgentConfirmFlags
): Promise<boolean> {
  if (flags?.yes) return true;
  if (flags?.strict) {
    return confirm(t('agent.confirmPrompt', { goal }));
  }
  if (readConfirmedAgents().includes(agentConfirmKey(goal, tools))) return true;

  const ok = await confirm(t('agent.confirmPrompt', { goal }));
  if (ok) {
    persistAgent(agentConfirmKey(goal, tools));
  }
  return ok;
}
