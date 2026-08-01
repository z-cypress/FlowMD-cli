/**
 * 控制流执行集成测试（if/elif/else + for + collect）
 * 通过 parseMarkdown → executeDocument 全流程验证
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RunOptions, FlowConfig } from '../types/index.js';
import { parseMarkdown } from '../core/parser.js';

// Mock AI block executor（避免真实 API 调用，但模拟 context.render 变量替换）
vi.mock('../core/blocks/ai-block.js', () => ({
  executeAIBlock: vi.fn().mockImplementation(
    async (content: string, meta: Record<string, string>, context: { render: (s: string) => string; set: (k: string, v: unknown) => void }) => {
      const rendered = context.render(content);
      const output = `ai:${rendered}`;
      if (meta?.output) context.set(meta.output, output);
      return { success: true, output, duration: 10 };
    }
  ),
}));

// Mock data block executor
vi.mock('../core/blocks/data-block.js', () => ({
  executeDataBlock: vi.fn().mockImplementation(
    async (content: string, meta: Record<string, string>, context: { set: (k: string, v: unknown) => void }) => {
      const output = `data:${content}`;
      if (meta?.output) context.set(meta.output, output);
      return { success: true, output, duration: 10 };
    }
  ),
}));

// Mock template block executor（简单替换 {{var}}）
vi.mock('../core/blocks/template-block.js', () => ({
  executeTemplateBlock: vi.fn().mockImplementation(
    async (content: string, meta: Record<string, string>, context: { dump: () => Record<string, unknown>; set: (k: string, v: unknown) => void }) => {
      const data = context.dump();
      let output = content;
      for (const [key, value] of Object.entries(data)) {
        output = output.replace(new RegExp(`\\{\\{${key}\\}\\}`), String(value));
      }
      if (meta?.output) context.set(meta.output, output);
      return { success: true, output, duration: 10 };
    }
  ),
}));

// Mock ora
vi.mock('ora', () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    text: '',
  })),
}));

// Mock history
vi.mock('../utils/history.js', () => ({
  recordExecution: vi.fn(),
}));

const { executeDocument } = await import('../core/executor.js');
const { executeAIBlock } = await import('../core/blocks/ai-block.js');

const defaultConfig: FlowConfig = {
  llm: { provider: 'openai', apiKey: 'test', model: 'gpt-4o' },
  dataSources: {},
  execution: { timeout: 30 },
};

const defaultOptions: RunOptions = {
  output: 'stdout',
  dryRun: false,
  stepMode: false,
  failFast: false,
};

function spyConsole(): () => void {
  const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
  const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  return () => {
    spy.mockRestore();
    errSpy.mockRestore();
  };
}

describe('control flow if', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should execute then branch when condition is true', async () => {
    const restore = spyConsole();
    const doc = parseMarkdown(
      [
        'Score: {{score}}',
        '',
        '<!-- if: {{score}} > 80 -->',
        '优秀',
        '```ai {output: "feedback"}',
        'give praise',
        '```',
        '<!-- endif -->',
      ].join('\n')
    );
    // 注入 score 变量
    doc.variables = ['score'];
    const result = await executeDocument(
      doc,
      { ...defaultOptions, varArgs: { score: '90' } },
      defaultConfig
    );
    restore();
    expect(executeAIBlock).toHaveBeenCalledTimes(1);
    expect(result.content).toContain('优秀');
  });

  it('should execute else branch when condition is false', async () => {
    const restore = spyConsole();
    const doc = parseMarkdown(
      [
        '<!-- if: {{score}} > 80 -->',
        '优秀',
        '```ai {output: "feedback"}',
        'give praise',
        '```',
        '<!-- else -->',
        '需要改进',
        '```ai {output: "feedback"}',
        'give advice',
        '```',
        '<!-- endif -->',
      ].join('\n')
    );
    doc.variables = ['score'];
    const result = await executeDocument(
      doc,
      { ...defaultOptions, varArgs: { score: '70' } },
      defaultConfig
    );
    restore();
    expect(executeAIBlock).toHaveBeenCalledTimes(1);
    expect(result.content).toContain('需要改进');
    expect(result.content).not.toContain('优秀');
  });

  it('should not execute inactive branch blocks', async () => {
    const restore = spyConsole();
    const doc = parseMarkdown(
      [
        '<!-- if: {{score}} > 80 -->',
        '```ai {output: "a"}',
        'praise',
        '```',
        '<!-- else -->',
        '```ai {output: "b"}',
        'advice',
        '```',
        '<!-- endif -->',
      ].join('\n')
    );
    doc.variables = ['score'];
    await executeDocument(
      doc,
      { ...defaultOptions, varArgs: { score: '90' } },
      defaultConfig
    );
    restore();
    expect(executeAIBlock).toHaveBeenCalledTimes(1);
  });

  it('should support elif chains', async () => {
    const restore = spyConsole();
    const doc = parseMarkdown(
      [
        '<!-- if: {{score}} > 90 -->',
        'A',
        '<!-- elif: {{score}} > 80 -->',
        'B',
        '<!-- elif: {{score}} > 60 -->',
        'C',
        '<!-- else -->',
        'D',
        '<!-- endif -->',
      ].join('\n')
    );
    doc.variables = ['score'];
    const result = await executeDocument(
      doc,
      { ...defaultOptions, varArgs: { score: '85' } },
      defaultConfig
    );
    restore();
    expect(result.content).toContain('B');
    expect(result.content).not.toContain('A');
    expect(result.content).not.toContain('C');
    expect(result.content).not.toContain('D');
  });

  it('should treat undefined variable as falsy and go to else', async () => {
    const restore = spyConsole();
    const doc = parseMarkdown(
      [
        '<!-- if: {{score}} > 80 -->',
        '优秀',
        '<!-- else -->',
        '无分数',
        '<!-- endif -->',
      ].join('\n')
    );
    doc.variables = ['score'];
    const result = await executeDocument(doc, { ...defaultOptions }, defaultConfig);
    restore();
    expect(result.content).toContain('无分数');
    expect(result.content).not.toContain('优秀');
  });

  it('should resolve deep paths in conditions', async () => {
    const restore = spyConsole();
    const doc = parseMarkdown(
      [
        '```run {runtime: "js", output: "user"}',
        'console.log(JSON.stringify({ profile: { age: 30 } }))',
        '```',
        '',
        '<!-- if: {{user.profile.age}} > 18 -->',
        '成年',
        '<!-- else -->',
        '未成年',
        '<!-- endif -->',
      ].join('\n')
    );
    doc.variables = ['user'];
    const result = await executeDocument(
      doc,
      { ...defaultOptions, runYes: true },
      defaultConfig
    );
    restore();
    expect(result.content).toContain('成年');
    expect(result.content).not.toContain('未成年');
  });

  it('should skip region entirely when no branch matches and no else', async () => {
    const restore = spyConsole();
    const doc = parseMarkdown(
      [
        'Before',
        '<!-- if: {{score}} > 80 -->',
        '优秀',
        '<!-- endif -->',
        'After',
      ].join('\n')
    );
    doc.variables = ['score'];
    const result = await executeDocument(
      doc,
      { ...defaultOptions, varArgs: { score: '70' } },
      defaultConfig
    );
    restore();
    expect(result.content).toContain('Before');
    expect(result.content).toContain('After');
    expect(result.content).not.toContain('优秀');
  });
});

describe('control flow for', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should execute body blocks once per iteration', async () => {
    const restore = spyConsole();
    const doc = parseMarkdown(
      [
        '<!-- for: item in items -->',
        '```ai {output: "analysis"}',
        'analyze {{item}}',
        '```',
        '{{analysis}}',
        '<!-- endfor -->',
      ].join('\n')
    );
    doc.variables = ['items', 'analysis'];
    const result = await executeDocument(
      doc,
      {
        ...defaultOptions,
        varArgs: { items: JSON.stringify(['a', 'b', 'c']) },
      },
      defaultConfig
    );
    restore();
    // 每轮重执行块
    expect(executeAIBlock).toHaveBeenCalledTimes(3);
    // 每轮重渲染正文
    expect(result.content).toContain('ai:analyze a');
    expect(result.content).toContain('ai:analyze b');
    expect(result.content).toContain('ai:analyze c');
    // 循环体正文不重复叠加（每个迭代结果只出现一次）
    const matches = result.content.match(/ai:analyze a/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  it('should render body text per iteration and keep source once per iteration', async () => {
    const restore = spyConsole();
    const doc = parseMarkdown(
      [
        '<!-- for: item in items -->',
        '```template',
        '{{item}}',
        '```',
        'item: {{item}}',
        '<!-- endfor -->',
      ].join('\n')
    );
    doc.variables = ['items'];
    const result = await executeDocument(
      doc,
      {
        ...defaultOptions,
        varArgs: { items: JSON.stringify(['x', 'y']) },
      },
      defaultConfig
    );
    restore();
    // 循环体正文每轮重复渲染
    const itemCount = result.content.match(/item: x/g) ?? [];
    const itemCountY = result.content.match(/item: y/g) ?? [];
    expect(itemCount).toHaveLength(1);
    expect(itemCountY).toHaveLength(1);
  });

  it('should clear loop variable after loop', async () => {
    const restore = spyConsole();
    const doc = parseMarkdown(
      [
        '<!-- for: item in items -->',
        '{{item}}',
        '<!-- endfor -->',
        'after: {{item}}',
      ].join('\n')
    );
    doc.variables = ['items', 'item'];
    const result = await executeDocument(
      doc,
      {
        ...defaultOptions,
        varArgs: { items: JSON.stringify(['x', 'y']) },
      },
      defaultConfig
    );
    restore();
    expect(result.content).toContain('x');
    expect(result.content).toContain('y');
    // 循环后变量清除，引用保持占位符
    expect(result.content).toContain('after: {{item}}');
  });

  it('should support collect to accumulate outputs', async () => {
    const restore = spyConsole();
    const doc = parseMarkdown(
      [
        '<!-- for: item in items {collect: "analyses"} -->',
        '```ai {output: "analysis"}',
        'analyze {{item}}',
        '```',
        '<!-- endfor -->',
        '',
        '总览: {{analyses.length}}',
      ].join('\n')
    );
    doc.variables = ['items', 'analyses'];
    const result = await executeDocument(
      doc,
      {
        ...defaultOptions,
        varArgs: { items: JSON.stringify(['a', 'b']) },
      },
      defaultConfig
    );
    restore();
    expect(result.content).toContain('总览: 2');
  });

  it('should not warn about collect variable as undefined', async () => {
    const logs: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((...args) => logs.push(args.join(' ')));
    const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const doc = parseMarkdown(
      [
        '<!-- for: item in items {collect: "results"} -->',
        '```ai {output: "r"}',
        'analyze',
        '```',
        '<!-- endfor -->',
        '共 {{results.length}} 条',
      ].join('\n')
    );
    doc.variables = ['items', 'results'];
    await executeDocument(
      doc,
      { ...defaultOptions, varArgs: { items: JSON.stringify(['a']) } },
      defaultConfig
    );
    spy.mockRestore();
    errSpy.mockRestore();
    expect(logs.some((l) => l.includes('results'))).toBe(false);
  });

  it('should treat non-array list as empty', async () => {
    const restore = spyConsole();
    const doc = parseMarkdown(
      [
        '<!-- for: item in items -->',
        '{{item}}',
        '<!-- endfor -->',
        'Done',
      ].join('\n')
    );
    doc.variables = ['items'];
    const result = await executeDocument(
      doc,
      { ...defaultOptions, varArgs: { items: 'not-an-array' } },
      defaultConfig
    );
    restore();
    expect(result.content).toContain('Done');
    // 循环体不执行
    expect(executeAIBlock).not.toHaveBeenCalled();
  });
});

describe('control flow nesting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should support if inside for', async () => {
    const restore = spyConsole();
    const doc = parseMarkdown(
      [
        '<!-- for: item in items -->',
        '<!-- if: {{item}} != "skip" -->',
        '[{{item}}]',
        '<!-- endif -->',
        '<!-- endfor -->',
      ].join('\n')
    );
    doc.variables = ['items'];
    const result = await executeDocument(
      doc,
      {
        ...defaultOptions,
        varArgs: { items: JSON.stringify(['a', 'skip', 'c']) },
      },
      defaultConfig
    );
    restore();
    expect(result.content).toContain('[a]');
    expect(result.content).toContain('[c]');
    expect(result.content).not.toContain('[skip]');
  });

  it('should support for inside if', async () => {
    const restore = spyConsole();
    const doc = parseMarkdown(
      [
        '<!-- if: {{enabled}} == true -->',
        '<!-- for: item in items -->',
        '{{item}}',
        '<!-- endfor -->',
        '<!-- endif -->',
      ].join('\n')
    );
    doc.variables = ['enabled', 'items'];
    const result = await executeDocument(
      doc,
      {
        ...defaultOptions,
        varArgs: { enabled: 'true', items: JSON.stringify([1, 2]) },
      },
      defaultConfig
    );
    restore();
    expect(result.content).toContain('1');
    expect(result.content).toContain('2');
  });
});

describe('control flow modes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should skip execution in dry-run mode', async () => {
    const restore = spyConsole();
    const doc = parseMarkdown(
      [
        '<!-- if: {{x}} == 1 -->',
        '```ai {output: "a"}',
        'test',
        '```',
        '<!-- endif -->',
      ].join('\n')
    );
    doc.variables = ['x'];
    await executeDocument(
      doc,
      { ...defaultOptions, dryRun: true, varArgs: { x: '1' } },
      defaultConfig
    );
    restore();
    expect(executeAIBlock).not.toHaveBeenCalled();
  });

  it('should insert debug results for active branch blocks', async () => {
    const restore = spyConsole();
    const doc = parseMarkdown(
      [
        '<!-- if: {{x}} == 1 -->',
        '```ai {output: "a"}',
        'hello',
        '```',
        '<!-- else -->',
        '```ai {output: "b"}',
        'world',
        '```',
        '<!-- endif -->',
      ].join('\n')
    );
    doc.variables = ['x'];
    const result = await executeDocument(
      doc,
      { ...defaultOptions, debug: true, varArgs: { x: '1' } },
      defaultConfig
    );
    restore();
    expect(result.content).toContain('ai:hello');
    expect(result.content).not.toContain('ai:world');
  });

  it('should strip directive comments in release mode', async () => {
    const restore = spyConsole();
    const doc = parseMarkdown(
      [
        '<!-- if: {{x}} == 1 -->',
        '激活内容',
        '<!-- endif -->',
        '收尾',
      ].join('\n')
    );
    doc.variables = ['x'];
    const result = await executeDocument(
      doc,
      { ...defaultOptions, release: true, varArgs: { x: '1' } },
      defaultConfig
    );
    restore();
    expect(result.content).not.toContain('<!-- if:');
    expect(result.content).not.toContain('<!-- endif -->');
    expect(result.content).toContain('激活内容');
    expect(result.content).toContain('收尾');
  });

  it('should keep directive comments in default mode', async () => {
    const restore = spyConsole();
    const doc = parseMarkdown(
      [
        '<!-- if: {{x}} == 1 -->',
        '激活内容',
        '<!-- endif -->',
      ].join('\n')
    );
    doc.variables = ['x'];
    const result = await executeDocument(
      doc,
      { ...defaultOptions, varArgs: { x: '1' } },
      defaultConfig
    );
    restore();
    expect(result.content).toContain('<!-- if:');
    expect(result.content).toContain('<!-- endif -->');
  });

  it('should stop on first error in fail-fast mode', async () => {
    vi.mocked(executeAIBlock)
      .mockResolvedValueOnce({
        success: false,
        output: null,
        error: 'API limit',
        duration: 10,
      });

    const restore = spyConsole();
    const doc = parseMarkdown(
      [
        '<!-- for: item in items -->',
        '```ai {output: "a"}',
        'fail',
        '```',
        '<!-- endfor -->',
      ].join('\n')
    );
    doc.variables = ['items'];
    const result = await executeDocument(
      doc,
      {
        ...defaultOptions,
        failFast: true,
        varArgs: { items: JSON.stringify([1, 2, 3]) },
      },
      defaultConfig
    );
    restore();
    expect(executeAIBlock).toHaveBeenCalledTimes(1);
    expect(result.hasError).toBe(true);
  });
});

describe('control flow validation errors', () => {
  it('should report unmatched endif as error', async () => {
    const restore = spyConsole();
    const doc = parseMarkdown('正文\n<!-- endif -->');
    const result = await executeDocument(doc, { ...defaultOptions }, defaultConfig);
    restore();
    expect(result.hasError).toBe(true);
  });

  it('should report missing endfor as error', async () => {
    const restore = spyConsole();
    const doc = parseMarkdown('<!-- for: x in list -->\n{{x}}');
    const result = await executeDocument(doc, { ...defaultOptions }, defaultConfig);
    restore();
    expect(result.hasError).toBe(true);
  });
});
