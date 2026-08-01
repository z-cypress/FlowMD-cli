/**
 * FlowMD run 块执行器
 * 在沙箱中执行任意脚本代码（js 用 isolated-vm 强隔离，python 子进程弱隔离）
 */

import type { ExecutionContext } from '../context.js';
import type { BlockResult } from '../../types/index.js';
import { getErrorMessage } from '../../utils/error-formatter.js';
import { t } from '../../utils/i18n.js';
import { runJs } from './run/js-sandbox.js';
import { runPython } from './run/python-sandbox.js';
import { ensureRuntimeConfirmed } from './run-confirm.js';
import type { RunConfirmFlags } from './run-confirm.js';
import { SUPPORTED_RUNTIMES } from './run/types.js';
import type { SandboxOptions } from './run/types.js';

/** run 块配置 */
export interface RunBlockConfig {
  /** 运行环境：js | python */
  runtime?: string | string[];
  /** 显式声明传入沙箱的变量列表 */
  vars?: string[];
  /** 输出变量名（可选） */
  output?: string;
  /** 超时秒数（可选，覆盖全局默认） */
  timeout?: string;
  /** 内存上限 MB（可选） */
  memory?: string;
  /** 权限声明（v1.2 仅校验，不支持注入） */
  permissions?: string[];
}

/** v1.2 预留的权限集合（仅解析校验，未知值报错） */
const RESERVED_PERMISSIONS = new Set<string>();

/**
 * 从 stdout 解析结果：可解析为 JSON 则结构化，否则作为纯文本
 * @param stdout - 沙箱标准输出
 * @returns 结果值
 */
function parseStdout(stdout: string): unknown {
  const trimmed = stdout.trim();
  if (!trimmed) return '';
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

/**
 * 执行 run 块，在沙箱中运行脚本
 * @param content - 脚本内容
 * @param config - 块级配置
 * @param context - 变量上下文，用于解析 vars 与存入 output
 * @param signal - 可选的中止信号
 * @param confirmFlags - 确认流程控制标志（--yes / --strict）
 * @returns 块执行结果
 */
export async function executeRunBlock(
  content: string,
  config: RunBlockConfig,
  context: ExecutionContext,
  signal?: AbortSignal,
  confirmFlags?: RunConfirmFlags
): Promise<BlockResult> {
  const startTime = Date.now();

  try {
    // 校验 runtime
    const runtime = String(config.runtime ?? '').trim().toLowerCase();
    if (!SUPPORTED_RUNTIMES.has(runtime)) {
      return {
        success: false,
        output: null,
        error: t('error.run.unknownRuntime', { runtime: runtime || '(empty)' }),
        duration: Date.now() - startTime,
      };
    }

    // 首次执行安全确认（按 runtime 记忆）
    const confirmed = await ensureRuntimeConfirmed(runtime, confirmFlags);
    if (!confirmed) {
      return {
        success: false,
        output: null,
        error: t('error.run.confirmDeclined', { runtime }),
        duration: Date.now() - startTime,
      };
    }

    // 校验权限声明（v1.2 仅预留）
    const permissions = config.permissions ?? [];
    const unknownPermissions = permissions.filter((p) => !RESERVED_PERMISSIONS.has(p));
    if (unknownPermissions.length > 0) {
      return {
        success: false,
        output: null,
        error: t('error.run.unknownPermission', { perms: unknownPermissions.join(', ') }),
        duration: Date.now() - startTime,
      };
    }

    // 解析显式声明的变量（最小暴露）
    const vars: Record<string, unknown> = {};
    for (const name of config.vars ?? []) {
      const value = context.get(name);
      if (value === undefined) {
        return {
          success: false,
          output: null,
          error: t('error.run.undefinedVar', { var: name }),
          duration: Date.now() - startTime,
        };
      }
      vars[name] = value;
    }

    const sandboxOptions: SandboxOptions = {
      timeoutMs: config.timeout ? parseInt(config.timeout, 10) * 1000 : undefined,
      memoryMB: config.memory ? parseInt(config.memory, 10) : undefined,
      signal,
    };

    const result = runtime === 'js'
      ? await runJs(content, vars, sandboxOptions)
      : await runPython(content, vars, sandboxOptions);

    // 非零退出码 → 失败
    if (result.exitCode !== 0) {
      const detail = (result.stderr || result.stdout || '').trim();
      return {
        success: false,
        output: null,
        error: t('error.run.exitCode', { code: result.exitCode, detail: detail || '(no output)' }),
        duration: Date.now() - startTime,
      };
    }

    // 结果：JSON 可解析则结构化，否则文本
    const value = parseStdout(result.stdout);

    if (config.output) {
      context.set(config.output, value);
    }

    return {
      success: true,
      output: typeof value === 'string' ? value : JSON.stringify(value),
      duration: Date.now() - startTime,
    };
  } catch (error) {
    // 超时错误统一走 i18n（isolated-vm / python 子进程各自抛出英文原文）
    const rawMessage = getErrorMessage(error);
    const isTimeout = /timed out|execution timeout/i.test(rawMessage);
    return {
      success: false,
      output: null,
      error: isTimeout ? t('error.run.timeout') : rawMessage,
      duration: Date.now() - startTime,
    };
  }
}
