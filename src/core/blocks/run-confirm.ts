/**
 * run 块运行时确认模块
 * 按 runtime 记忆用户对代码执行的同意，持久化到 .flow/config.yml 的 run.confirmedRuntimes
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { confirm } from '../../utils/prompt.js';
import { t } from '../../utils/i18n.js';

/** 确认流程控制标志 */
export interface RunConfirmFlags {
  /** --yes：跳过本次确认（不持久化） */
  yes?: boolean;
  /** --strict：每次执行都强制确认（不持久化） */
  strict?: boolean;
}

/** 配置文件路径（惰性计算，便于测试切换工作目录） */
function getConfigPath(): string {
  return join(process.cwd(), '.flow', 'config.yml');
}

/** 读取已确认的 runtime 列表 */
function readConfirmedRuntimes(): string[] {
  try {
    if (!existsSync(getConfigPath())) return [];
    const data = parseYaml(readFileSync(getConfigPath(), 'utf-8')) as Record<string, unknown>;
    const run = data.run as Record<string, unknown> | undefined;
    const confirmed = run?.confirmedRuntimes;
    return Array.isArray(confirmed)
      ? confirmed.filter((x): x is string => typeof x === 'string')
      : [];
  } catch {
    return [];
  }
}

/** 将 runtime 持久化为已确认 */
function persistRuntime(runtime: string): void {
  let data: Record<string, unknown> = {};
  const configPath = getConfigPath();
  try {
    if (existsSync(configPath)) {
      data = parseYaml(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
    }
  } catch {
    // 配置解析失败时按空配置处理
  }

  const run = (data.run as Record<string, unknown>) ?? {};
  const confirmed = Array.isArray(run.confirmedRuntimes)
    ? (run.confirmedRuntimes as string[])
    : [];
  if (!confirmed.includes(runtime)) {
    confirmed.push(runtime);
  }
  run.confirmedRuntimes = confirmed;
  data.run = run;

  mkdirSync(join(process.cwd(), '.flow'), { recursive: true });
  writeFileSync(configPath, stringifyYaml(data, { lineWidth: 120 }), 'utf-8');
}

/**
 * 确保 runtime 已获用户确认
 * 已确认 / --yes 直接通过；否则弹确认，接受后持久化（--strict 例外）
 * @param runtime - 运行环境名称
 * @param flags - 确认控制标志
 * @returns 是否获得确认
 */
export async function ensureRuntimeConfirmed(
  runtime: string,
  flags?: RunConfirmFlags
): Promise<boolean> {
  if (flags?.yes) return true;
  if (flags?.strict) {
    return confirm(t('run.confirmPrompt', { runtime }));
  }
  if (readConfirmedRuntimes().includes(runtime)) return true;

  const ok = await confirm(t('run.confirmPrompt', { runtime }));
  if (ok) {
    persistRuntime(runtime);
  }
  return ok;
}
