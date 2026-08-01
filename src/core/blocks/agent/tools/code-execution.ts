/**
 * agent 工具：code_execution（复用 run 块沙箱）
 * 安全边界（ADR-016）：js 走 isolated-vm 强隔离、python 走子进程弱隔离，
 * 脚本自包含（不注入 context 变量）
 */

import { runJs } from '../../run/js-sandbox.js';
import { runPython } from '../../run/python-sandbox.js';
import { SUPPORTED_RUNTIMES } from '../../run/types.js';
import type { ToolHandler, ToolHandlerResult } from '../types.js';

/**
 * 创建 code_execution 工具
 * @param signal - 可选的中止信号（贯通 agent 块级 AbortSignal）
 * @returns 工具处理器
 */
export function createCodeExecutionTool(signal?: AbortSignal): ToolHandler {
  return {
    name: 'code_execution',
    description:
      '在沙箱中执行脚本代码（js 强隔离 / python 弱隔离）。参数 runtime：js|python，script：脚本内容。脚本自包含，无法访问文件系统与网络。',
    inputSchema: {
      type: 'object',
      properties: {
        runtime: { type: 'string', enum: ['js', 'python'], description: '脚本运行时' },
        script: { type: 'string', description: '要执行的脚本代码' },
      },
      required: ['script'],
    },
    async execute(args: Record<string, unknown>): Promise<ToolHandlerResult> {
      const runtime = typeof args.runtime === 'string' ? args.runtime.toLowerCase() : 'js';
      const script = typeof args.script === 'string' ? args.script : '';
      if (!SUPPORTED_RUNTIMES.has(runtime)) {
        return { ok: false, error: `unsupported runtime: ${runtime} (supported: js / python)` };
      }
      if (!script.trim()) {
        return { ok: false, error: 'script is required' };
      }
      try {
        const result = runtime === 'js'
          ? await runJs(script, {}, { signal })
          : await runPython(script, {}, { signal });
        if (result.exitCode !== 0) {
          return { ok: false, error: (result.stderr || result.stdout || '(no output)').trim() };
        }
        return { ok: true, result: result.stdout || '(empty output)' };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}
