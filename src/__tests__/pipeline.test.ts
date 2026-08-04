/**
 * pipeline 命令单元测试
 * 覆盖变量跨文档串联、按文档输出、fail-fast 停止、缺文件容错
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipelineCommand } from '../commands/pipeline.js';
import type { RunOptions, FlowConfig } from '../types/index.js';

vi.mock('ora', () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    text: '',
  })),
}));

vi.mock('../utils/history.js', () => ({
  recordExecution: vi.fn(),
}));

function fullOptions(overrides: Partial<RunOptions> = {}): RunOptions {
  return {
    output: 'stdout',
    dryRun: false,
    stepMode: false,
    failFast: false,
    debug: false,
    release: false,
    quiet: true,
    varArgs: {},
    ...overrides,
  };
}

const config: FlowConfig = {
  llm: { provider: 'openai', apiKey: 'test', model: 'gpt-4o' },
  dataSources: {},
  execution: { timeout: 60 },
};

describe('pipelineCommand', () => {
  const originalCwd = process.cwd();
  let tempDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    tempDir = mkdtempSync(join(tmpdir(), 'flowmd-pipeline-'));
    process.chdir(tempDir);
    process.exitCode = 0;
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should thread variables from the first document into the second', async () => {
    writeFileSync(join(tempDir, 'a.md'), '```template {output: "greeting"}\n你好 {{name}}\n```');
    writeFileSync(join(tempDir, 'b.md'), '# 第二步\n\n问候：{{greeting}}');

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await pipelineCommand(['a.md', 'b.md'], fullOptions({ varArgs: { name: 'World' } }), config);
    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    logSpy.mockRestore();

    expect(output).toContain('问候：你好 World');
  });

  it('should keep accumulating variables across more than two documents', async () => {
    writeFileSync(join(tempDir, 'a.md'), '```template {output: "first"}\n甲\n```');
    writeFileSync(join(tempDir, 'b.md'), '```template {output: "second"}\n乙\n```');
    writeFileSync(join(tempDir, 'c.md'), '# 汇总\n\n{{first}}-{{second}}');

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await pipelineCommand(['a.md', 'b.md', 'c.md'], fullOptions(), config);
    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    logSpy.mockRestore();

    expect(output).toContain('甲-乙');
  });

  it('should write a timestamped new output file per document', async () => {
    writeFileSync(join(tempDir, 'a.md'), '```template {output: "v"}\nA\n```');
    writeFileSync(join(tempDir, 'b.md'), 'B: {{v}}');

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await pipelineCommand(['a.md', 'b.md'], fullOptions({ output: 'new' }), config);
    logSpy.mockRestore();

    const files = readdirSync(tempDir);
    expect(files.some((f) => f.startsWith('a_') && f.endsWith('.md'))).toBe(true);
    expect(files.some((f) => f.startsWith('b_') && f.endsWith('.md'))).toBe(true);
  });

  it('should stop at the first failing document with fail-fast', async () => {
    writeFileSync(join(tempDir, 'bad.md'), '```data {from: "missing", output: "x"}\nSELECT 1\n```');
    writeFileSync(join(tempDir, 'ok.md'), '# 不应执行');

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await pipelineCommand(['bad.md', 'ok.md'], fullOptions({ failFast: true, output: 'new' }), config);
    logSpy.mockRestore();

    const files = readdirSync(tempDir);
    expect(files.some((f) => f.startsWith('ok_'))).toBe(false);
    expect(process.exitCode).toBe(1);
  });

  it('should continue past a failing document without fail-fast and set exit code', async () => {
    writeFileSync(join(tempDir, 'bad.md'), '```data {from: "missing", output: "x"}\nSELECT 1\n```');
    writeFileSync(join(tempDir, 'ok.md'), '# 正常');

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await pipelineCommand(['bad.md', 'ok.md'], fullOptions({ output: 'new' }), config);
    logSpy.mockRestore();

    const files = readdirSync(tempDir);
    expect(files.some((f) => f.startsWith('ok_'))).toBe(true);
    expect(process.exitCode).toBe(1);
  });

  it('should report a missing file without throwing', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(pipelineCommand(['missing.md'], fullOptions(), config)).resolves.not.toThrow();

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('should skip documents when --when condition is false', async () => {
    writeFileSync(join(tempDir, 'a.md'), '```template {output: "ok_flag"}\n真\n```');
    writeFileSync(join(tempDir, 'b.md'), '# 不应执行 b');
    writeFileSync(join(tempDir, 'c.md'), '# 应执行 c');

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    // a 产出 ok_flag="真"，b 条件 {{ok_flag}} == "假" 为假 → b 被跳过
    await pipelineCommand(['a.md', 'b.md'], fullOptions({ output: 'stdout' }), config, '{{ok_flag}} == "假"');
    logSpy.mockRestore();

    expect(process.exitCode).toBe(0);
  });

  it('should execute a document when --when condition is true', async () => {
    writeFileSync(join(tempDir, 'a.md'), '```template {output: "ok_flag"}\n真\n```');
    writeFileSync(join(tempDir, 'b.md'), '# B 内容\n\n{{ok_flag}}');

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    // a 产出 ok_flag="真"，b 条件 {{ok_flag}} == "真" 通过 → 执行并生成输出文件
    await pipelineCommand(['a.md', 'b.md'], fullOptions({ output: 'new' }), config, '{{ok_flag}} == "真"');
    logSpy.mockRestore();

    const files = readdirSync(tempDir);
    expect(files.some((f) => f.startsWith('b_') && f.endsWith('.md'))).toBe(true);
    expect(process.exitCode).toBe(0);
  });
});
