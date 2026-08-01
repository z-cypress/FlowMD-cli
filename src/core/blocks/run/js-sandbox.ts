/**
 * JS 沙箱（isolated-vm）
 * 在进程内 V8 isolate 中隔离执行脚本，零能力（无 fs/网络/进程 API）
 */

import ivm from 'isolated-vm';
import type { SandboxResult, SandboxOptions } from './types.js';

/** 注入沙箱全局作用域 + console 转发，再执行用户脚本 */
const WRAPPER = `
  const __vars = $0;
  for (const [k, v] of Object.entries(__vars)) {
    globalThis[k] = v;
  }
  console = {
    log: (...args) => $1.apply(undefined, args),
    error: (...args) => $2.apply(undefined, args),
    warn: (...args) => $2.apply(undefined, args),
  };
  ${'${script}'}
`;

/**
 * 在 isolated-vm isolate 中执行 JS 脚本
 * @param script - 脚本内容
 * @param vars - 注入到沙箱全局作用域的变量
 * @param options - 沙箱选项
 * @returns 沙箱执行结果
 */
export async function runJs(
  script: string,
  vars: Record<string, unknown> = {},
  options: SandboxOptions = {}
): Promise<SandboxResult> {
  const memoryMB = options.memoryMB ?? 128;
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];

  const logRef = new ivm.Reference((...args: unknown[]) => {
    stdoutChunks.push(args.map(String).join(' ') + '\n');
  });
  const errRef = new ivm.Reference((...args: unknown[]) => {
    stderrChunks.push(args.map(String).join(' ') + '\n');
  });

  const isolate = new ivm.Isolate({ memoryLimit: memoryMB });
  try {
    const context = await isolate.createContext();
    const wrapped = WRAPPER.replace('${script}', script);
    const timeout = options.timeoutMs && options.timeoutMs > 0 ? options.timeoutMs : undefined;
    await context.evalClosure(
      wrapped,
      [vars, logRef, errRef],
      { timeout, arguments: { copy: true } }
    );

    return { stdout: stdoutChunks.join(''), stderr: stderrChunks.join(''), exitCode: 0 };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(message, { cause: error });
  } finally {
    isolate.dispose();
  }
}
