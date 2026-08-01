/**
 * Python 沙箱（子进程）集成测试
 * 使用真实 python3 验证执行、stdin 变量、退出码与超时
 */

import { describe, it, expect } from 'vitest';
import { runPython } from '../core/blocks/run/python-sandbox.js';

describe('runPython', () => {
  it('should execute a script and capture stdout', async () => {
    const result = await runPython('print("hello")\nprint("world")');

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('hello\nworld\n');
  });

  it('should pass vars as JSON on stdin', async () => {
    const script = [
      'import json, sys',
      'data = json.load(sys.stdin)',
      'print(json.dumps({"n": data["name"], "l": len(data["nums"])}))',
    ].join('\n');

    const result = await runPython(script, { name: 'FlowMD', nums: [1, 2, 3] });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('{"n": "FlowMD", "l": 3}\n');
  });

  it('should report non-zero exit code', async () => {
    const result = await runPython('import sys; sys.exit(3)');

    expect(result.exitCode).toBe(3);
  });

  it('should capture stderr', async () => {
    const result = await runPython('import sys; print("oops", file=sys.stderr)');

    expect(result.stderr).toContain('oops');
  });

  it('should kill on timeout', async () => {
    await expect(runPython('while True: pass', {}, { timeoutMs: 500 })).rejects.toThrow(/timed out/);
  }, 10000);
});
