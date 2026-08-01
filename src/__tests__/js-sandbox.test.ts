/**
 * JS 沙箱（isolated-vm）集成测试
 * 使用真实 isolated-vm 验证隔离执行、变量注入、零能力与超时
 */

import { describe, it, expect } from 'vitest';
import { runJs } from '../core/blocks/run/js-sandbox.js';

describe('runJs', () => {
  it('should execute a script and capture stdout', async () => {
    const result = await runJs('console.log("hello"); console.log("world");');

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('hello\nworld\n');
  });

  it('should inject vars into the global scope', async () => {
    const result = await runJs('console.log(JSON.stringify({ n: name, l: nums.length }))', {
      name: 'FlowMD',
      nums: [1, 2, 3],
    });

    expect(result.stdout).toBe('{"n":"FlowMD","l":3}\n');
  });

  it('should forward console.error to stderr', async () => {
    const result = await runJs('console.error("boom")');

    expect(result.stderr).toBe('boom\n');
  });

  it('should reject when script throws', async () => {
    await expect(runJs('throw new Error("oops")')).rejects.toThrow();
  });

  it('should provide zero capability (no require/fs/network)', async () => {
    await expect(runJs('require("fs")')).rejects.toThrow();
    await expect(runJs('process.exit(0)')).rejects.toThrow();
  });

  it('should reject on infinite loop with timeout', async () => {
    await expect(runJs('while(true){}', {}, { timeoutMs: 500 })).rejects.toThrow();
  }, 10000);

  it('should reject on syntax error', async () => {
    await expect(runJs('const = 1;')).rejects.toThrow();
  });
});
