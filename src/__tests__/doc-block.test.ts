/**
 * doc 块（跨文档协作）端到端测试
 * 真实链路：父文档 → doc 块 → 隔离子文档执行（template/ai 块）→ 命名空间回传
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RunOptions, FlowConfig } from '../types/index.js';

const mockOpenAICreate = vi.hoisted(() => vi.fn());
vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = { completions: { create: mockOpenAICreate } };
    constructor() {}
  },
}));

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

const { executeDocument } = await import('../core/executor.js');
const { parseMarkdown } = await import('../core/parser.js');

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
  llm: { provider: 'openai', apiKey: 'test-key', model: 'gpt-4o' },
  dataSources: {},
  execution: { timeout: 60 },
};

describe('doc block', () => {
  const originalCwd = process.cwd();
  let tempDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    tempDir = mkdtempSync(join(tmpdir(), 'flowmd-doc-'));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should run a sub-document and pass back the rendered content', async () => {
    writeFileSync(join(tempDir, 'sub.md'), '```template {output: "greeting"}\n你好 {{name}}\n```\n\n问候：{{greeting}}');

    const doc = parseMarkdown('```doc {path: "./sub.md", input: ["name"], output: "sub"}\n```\n\n结果：{{sub}}');

    const result = await executeDocument(doc, fullOptions({ varArgs: { name: 'World' } }), config);

    expect(result.hasError).toBe(false);
    expect(result.content).toContain('问候：你好 World');
  });

  it('should namespace sub-document variables under the output name', async () => {
    writeFileSync(join(tempDir, 'sub.md'), '```template {output: "conclusion"}\n{{name}} 的分析结论\n```');

    const doc = parseMarkdown('```doc {path: "./sub.md", input: ["name"], output: "analysis"}\n```\n\n{{analysis.conclusion}}');

    const result = await executeDocument(doc, fullOptions({ varArgs: { name: 'FlowMD' } }), config);

    expect(result.content).toContain('FlowMD 的分析结论');
  });

  it('should run sub-document agent/ai blocks and pass back their outputs', async () => {
    mockOpenAICreate.mockResolvedValue({
      choices: [{ message: { content: '子调研结果', tool_calls: null } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    });
    writeFileSync(join(tempDir, 'research.md'), '```ai {output: "finding"}\n调研\n```\n\n{{finding}}');

    const doc = parseMarkdown('```doc {path: "./research.md", output: "r"}\n```\n\n发现：{{r.finding}}');

    const result = await executeDocument(doc, fullOptions(), config);

    expect(result.content).toContain('发现：子调研结果');
    expect(result.content).toContain('子调研结果');
  });

  it('should isolate the sub-context (non-declared parent vars are invisible)', async () => {
    writeFileSync(join(tempDir, 'sub.md'), '```template {output: "leak"}\n{{secret}}\n```\n\n泄露：{{leak}}');
    // input 只声明 name，secret 不应进入子上下文
    const doc = parseMarkdown('```doc {path: "./sub.md", input: ["name"], output: "sub"}\n```\n\n{{sub}}');

    const result = await executeDocument(doc, fullOptions({ varArgs: { name: 'x', secret: 'SECRET' } }), config);

    expect(result.content).not.toContain('SECRET');
  });

  it('should fail when a declared input variable is undefined', async () => {
    writeFileSync(join(tempDir, 'sub.md'), '# sub\n');

    const doc = parseMarkdown('```doc {path: "./sub.md", input: ["missing"], output: "sub"}\n```');

    const result = await executeDocument(doc, fullOptions(), config);

    expect(result.hasError).toBe(true);
  });

  it('should reject non-.md paths', async () => {
    writeFileSync(join(tempDir, 'sub.txt'), 'x');

    const doc = parseMarkdown('```doc {path: "./sub.txt", output: "sub"}\n```');

    const result = await executeDocument(doc, fullOptions(), config);

    expect(result.hasError).toBe(true);
  });

  it('should reject a missing path parameter', async () => {
    const doc = parseMarkdown('```doc {output: "sub"}\n```');

    const result = await executeDocument(doc, fullOptions(), config);

    expect(result.hasError).toBe(true);
  });

  it('should detect circular references across documents', async () => {
    writeFileSync(join(tempDir, 'a.md'), '```doc {path: "./b.md", output: "b"}\n```');
    writeFileSync(join(tempDir, 'b.md'), '```doc {path: "./a.md", output: "a"}\n```');

    const doc = parseMarkdown('```doc {path: "./a.md", output: "a"}\n```');

    const result = await executeDocument(doc, fullOptions(), config);

    expect(result.hasError).toBe(true);
  });

  it('should support nested doc blocks', async () => {
    writeFileSync(join(tempDir, 'inner.md'), '```template {output: "inner"}\n内层\n```\n\n{{inner}}');
    writeFileSync(join(tempDir, 'outer.md'), '```doc {path: "./inner.md", output: "inner_ns"}\n```\n\n外层包裹 {{inner_ns}}');

    const doc = parseMarkdown('```doc {path: "./outer.md", output: "outer"}\n```\n\n{{outer}}');

    // release 模式剥离代码块，便于断言渲染结果
    const result = await executeDocument(doc, fullOptions({ release: true }), config);

    expect(result.content).toContain('外层包裹');
    expect(result.content).toContain('内层');
  });

  it('should mark the doc block failed when the sub-document has failures', async () => {
    mockOpenAICreate.mockRejectedValue(new Error('API limit'));
    writeFileSync(join(tempDir, 'bad.md'), '```ai {output: "x"}\n任务\n```');

    const doc = parseMarkdown('```doc {path: "./bad.md", output: "bad"}\n```');

    const result = await executeDocument(doc, fullOptions(), config);

    expect(result.hasError).toBe(true);
  });
});
