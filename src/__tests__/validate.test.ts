/**
 * flowmd validate 命令单元测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateCommand } from '../commands/validate.js';

describe('validateCommand', () => {
  let tempDir: string;
  const originalCwd = process.cwd();

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'flowmd-validate-'));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should report undefined variables', async () => {
    const logs: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((...args) => logs.push(args.join(' ')));
    writeFileSync('doc.md', '# T\n\n```ai {output: "x"}\nprompt\n```\n\n{{missing}}', 'utf-8');

    await validateCommand('doc.md');
    spy.mockRestore();

    expect(logs.some((l) => l.includes('ai'))).toBe(true);
    expect(logs.some((l) => l.includes('missing'))).toBe(true);
  });

  it('should fail with exit code 1 on control flow syntax error', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    writeFileSync('bad.md', '# T\n\n<!-- if: {{a}} > 1 -->\ntext\n', 'utf-8');

    await validateCommand('bad.md');
    spy.mockRestore();

    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });

  it('should pass when all blocks have output and variables are defined', async () => {
    const logs: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((...args) => logs.push(args.join(' ')));
    writeFileSync('good.md', '```data {output: "rows"}\nSELECT 1\n```\n\n{{rows}}', 'utf-8');

    await validateCommand('good.md');
    spy.mockRestore();

    expect(logs.some((l) => l.includes('校验通过'))).toBe(true);
  });
});
