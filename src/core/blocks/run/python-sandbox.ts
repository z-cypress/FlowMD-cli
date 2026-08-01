/**
 * Python 沙箱（子进程）
 * 弱隔离：子进程 + 资源限制兜底，变量经 stdin 以 JSON 传入
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SandboxResult, SandboxOptions } from './types.js';

/**
 * 在子进程中执行 Python 脚本
 * 脚本通过 `json.load(sys.stdin)` 读取传入变量
 * @param script - 脚本内容
 * @param vars - 传入变量（JSON 序列化后写入 stdin）
 * @param options - 沙箱选项
 * @returns 沙箱执行结果
 */
export async function runPython(
  script: string,
  vars: Record<string, unknown> = {},
  options: SandboxOptions = {}
): Promise<SandboxResult> {
  const dir = mkdtempSync(join(tmpdir(), 'flowmd-run-'));
  const scriptFile = join(dir, 'script.py');
  writeFileSync(scriptFile, script);

  return new Promise<SandboxResult>((resolve, reject) => {
    let child: ReturnType<typeof spawn>;
    try {
      // 内存限制通过 ulimit 施加（脚本路径为受控临时路径，无注入面）
      const memKb = options.memoryMB ? Math.max(1, Math.floor(options.memoryMB * 1024)) : null;
      const cmd = memKb
        ? `ulimit -v ${memKb} 2>/dev/null; exec python3 -u '${scriptFile}'`
        : `python3 -u '${scriptFile}'`;
      child = spawn(cmd, { shell: true, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (error) {
      rmSync(dir, { recursive: true, force: true });
      reject(error instanceof Error ? error : new Error(String(error)));
      return;
    }

    let stdout = '';
    let stderr = '';
    let settled = false;

    const signal: AbortSignal | undefined = options.signal;
    let signalListener: (() => void) | null = null;

    const cleanup = (): void => {
      if (timer) clearTimeout(timer);
      if (signal && signalListener) signal.removeEventListener('abort', signalListener);
      rmSync(dir, { recursive: true, force: true });
    };

    const finish = (result: SandboxResult): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    const timer = options.timeoutMs && options.timeoutMs > 0
      ? setTimeout(() => {
          if (!settled) {
            child.kill('SIGKILL');
            fail(new Error(`Script execution timed out after ${Math.round(options.timeoutMs! / 1000)}s`));
          }
        }, options.timeoutMs)
      : null;

    signalListener = (): void => {
      if (!settled) {
        child.kill('SIGKILL');
        fail(new Error('Script execution aborted'));
      }
    };
    if (signal) {
      if (signal.aborted) {
        child.kill('SIGKILL');
        fail(new Error('Script execution aborted'));
        return;
      }
      signal.addEventListener('abort', signalListener);
    }

    // 传入变量（JSON）
    try {
      child.stdin!.write(JSON.stringify(vars));
      child.stdin!.end();
    } catch (error) {
      fail(error instanceof Error ? error : new Error(String(error)));
      return;
    }

    child.stdout!.on('data', (data: Buffer) => { stdout += data.toString(); });
    child.stderr!.on('data', (data: Buffer) => { stderr += data.toString(); });
    child.on('error', (error) => fail(error));
    child.on('close', (code, signalCode) => {
      finish({ stdout, stderr, exitCode: code ?? (signalCode ? 1 : 0) });
    });
  });
}
