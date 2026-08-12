/**
 * Executor unit tests
 * Tests dependency detection, fail-fast, and variable missing reporting
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { join } from 'node:path';
import type { ParsedDocument, RunOptions, FlowConfig, ExecutableBlock } from '../types/index.js';

// Mock all block executors
vi.mock('../core/blocks/ai-block.js', () => ({
  executeAIBlock: vi.fn().mockImplementation(
    async (_content: string, config: Record<string, string>, context: { set: (k: string, v: unknown) => void }) => {
      if (config.output) context.set(config.output, 'ai result');
      return {
        success: true,
        output: 'ai result',
        duration: 100,
      };
    }
  ),
}));

vi.mock('../core/blocks/data-block.js', () => ({
  executeDataBlock: vi.fn().mockResolvedValue({
    success: true,
    output: '[{"id":1}]',
    duration: 50,
  }),
}));

vi.mock('../core/blocks/template-block.js', () => ({
  executeTemplateBlock: vi.fn().mockImplementation(
    (content: string, config: Record<string, string>, context: { dump: () => Record<string, unknown> }) => {
      // Simple rendering: replace {{var}} with context values
      const data = context.dump();
      let output = content;
      for (const [key, value] of Object.entries(data)) {
        output = output.replace(new RegExp(`\\{\\{${key}\\}\\}`), String(value));
      }
      return Promise.resolve({ success: true, output, duration: 10 });
    }
  ),
}));

vi.mock('../core/blocks/agent/agent-block.js', () => ({
  executeAgentBlock: vi.fn().mockResolvedValue({
    success: true,
    output: 'agent result',
    duration: 10,
  }),
  formatAgentStep: (step: { stepNumber: number; action: string }) => `步骤 ${step.stepNumber}: ${step.action}`,
  formatAgentTrace: () => '',
  formatAgentTraceSummary: () => '',
}));

// Mock ora to avoid spinner side effects in tests
vi.mock('ora', () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    text: '',
  })),
}));

// Mock fs for varFile tests
const mockReadFileSync = vi.hoisted(() => vi.fn());
vi.mock('node:fs', () => ({
  readFileSync: mockReadFileSync,
  default: {},
}));

// Mock cache module（缓存逻辑单测见 cache.test.ts；这里验证 executor 的接线）
const cacheState = vi.hoisted(() => ({ record: null as unknown }));
vi.mock('../core/cache.js', () => ({
  cacheKey: vi.fn(() => 'test-hash'),
  readCache: vi.fn(() => cacheState.record),
  writeCache: vi.fn(),
}));

// Mock history to avoid real SQLite writes in executor tests
vi.mock('../utils/history.js', () => ({
  recordExecution: vi.fn(),
}));

// Import after mocks
const { executeDocument } = await import('../core/executor.js');
const { executeAIBlock } = await import('../core/blocks/ai-block.js');
const { executeDataBlock } = await import('../core/blocks/data-block.js');

function makeDoc(blocks: ExecutableBlock[], vars: string[] = []): ParsedDocument {
  return {
    blocks,
    rawContent: blocks.map((b) => b.content).join('\n'),
    variables: vars,
  };
}

function makeBlock(
  type: 'ai' | 'data' | 'template',
  content: string,
  meta: Record<string, string> = {},
  sourceEnd = 0
): ExecutableBlock {
  return {
    type,
    content,
    lang: type,
    meta,
    position: 0,
    sourceStart: 0,
    sourceEnd,
  };
}

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

describe('executeDocument', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = 0;
  });

  describe('basic execution', () => {
    it('should execute all blocks in order', async () => {
      const doc = makeDoc([
        makeBlock('data', 'SELECT * FROM users'),
        makeBlock('ai', 'Analyze {{data}}'),
        makeBlock('template', 'Result: {{analysis}}'),
      ]);

      const result = await executeDocument(doc, defaultOptions, defaultConfig);
      expect(result.content).toBeDefined();
    });
  });

  describe('dependency detection', () => {
    it('should skip blocks that depend on failed output variables', async () => {
      // Make the AI block fail with output "insights"
      vi.mocked(executeAIBlock).mockResolvedValueOnce({
        success: false,
        output: null,
        error: 'API limit',
        duration: 100,
      });

      const doc = makeDoc([
        makeBlock('ai', 'Generate insights', { output: 'insights' }),
        makeBlock('template', 'Report: {{insights}}'),
      ]);

      const result = await executeDocument(doc, defaultOptions, defaultConfig);
      // Template block should be skipped because "insights" failed
      expect(result.content).toBeDefined();
      // Only the AI block should have been called (template skipped)
      expect(executeAIBlock).toHaveBeenCalledTimes(1);
    });

    it('should not skip blocks with unrelated dependencies', async () => {
      // Make the first AI block fail
      vi.mocked(executeAIBlock)
        .mockResolvedValueOnce({
          success: false,
          output: null,
          error: 'API limit',
          duration: 100,
        })
        .mockResolvedValueOnce({
          success: true,
          output: 'independent result',
          duration: 100,
        });

      const doc = makeDoc([
        makeBlock('ai', 'Generate insights', { output: 'insights' }),
        makeBlock('ai', 'Independent analysis', { output: 'analysis' }),
      ]);

      await executeDocument(doc, defaultOptions, defaultConfig);
      // Both AI blocks should have been called (second is independent)
      expect(executeAIBlock).toHaveBeenCalledTimes(2);
    });
  });

  describe('fail-fast', () => {
    it('should stop on first error when failFast is true', async () => {
      vi.mocked(executeAIBlock)
        .mockResolvedValueOnce({
          success: false,
          output: null,
          error: 'API limit',
          duration: 100,
        })
        .mockResolvedValueOnce({
          success: true,
          output: 'result',
          duration: 100,
        });

      const doc = makeDoc([
        makeBlock('ai', 'First block', { output: 'x' }),
        makeBlock('ai', 'Second block', { output: 'y' }),
      ]);

      await executeDocument(doc, { ...defaultOptions, failFast: true }, defaultConfig);
      // Only first block should execute, second should be skipped
      expect(executeAIBlock).toHaveBeenCalledTimes(1);
    });

    it('should continue on error when failFast is false', async () => {
      vi.mocked(executeAIBlock)
        .mockResolvedValueOnce({
          success: false,
          output: null,
          error: 'API limit',
          duration: 100,
        })
        .mockResolvedValueOnce({
          success: true,
          output: 'result',
          duration: 100,
        });

      const doc = makeDoc([
        makeBlock('ai', 'First block', { output: 'x' }),
        makeBlock('ai', 'Second block', { output: 'y' }),
      ]);

      await executeDocument(doc, { ...defaultOptions, failFast: false }, defaultConfig);
      // Both blocks should execute
      expect(executeAIBlock).toHaveBeenCalledTimes(2);
    });
  });

  describe('dry run', () => {
    it('should skip all blocks in dry run mode', async () => {
      const doc = makeDoc([
        makeBlock('ai', 'Test'),
        makeBlock('data', 'SELECT 1'),
      ]);

      await executeDocument(doc, { ...defaultOptions, dryRun: true }, defaultConfig);
      expect(executeAIBlock).not.toHaveBeenCalled();
      expect(executeDataBlock).not.toHaveBeenCalled();
    });
  });

  describe('result cache', () => {
    beforeEach(() => {
      // 复位 ai mock：清掉其它用例泄漏的 mockResolvedValueOnce 队列并重建基实现
      vi.mocked(executeAIBlock).mockReset();
      vi.mocked(executeAIBlock).mockImplementation(
        async (_content: string, config: Record<string, string>, context: { set: (k: string, v: unknown) => void }) => {
          if (config.output) context.set(config.output, 'ai result');
          return { success: true, output: 'ai result', duration: 100 };
        }
      );
    });

    it('should reuse cached ai result on identical re-execution', async () => {
      const doc = makeDoc([
        makeBlock('ai', 'hello', { output: 'greeting' }),
        makeBlock('template', 'Hello {{greeting}}'),
      ]);
      doc.rawContent = '```ai {output: "greeting"}\nhello\n```\n\nHello {{greeting}}';

      // 第一次执行：缓存未命中 → 真实调用并写入缓存
      cacheState.record = null;
      const result1 = await executeDocument(
        doc,
        { ...defaultOptions, quiet: true, cache: true },
        defaultConfig
      );
      expect(result1.content).toContain('ai result');
      expect(executeAIBlock).toHaveBeenCalledTimes(1);

      // 第二次执行：命中缓存 → 不再调用真实执行器，直接复用结果
      cacheState.record = { output: 'ai result', value: 'ai result', duration: 100 };
      const result2 = await executeDocument(
        doc,
        { ...defaultOptions, quiet: true, cache: true },
        defaultConfig
      );
      expect(result2.content).toContain('ai result');
      expect(executeAIBlock).toHaveBeenCalledTimes(1);
    });

    it('should not use cache when flag is off', async () => {
      const doc = makeDoc([makeBlock('ai', 'world', { output: 'greeting' })]);
      doc.rawContent = '```ai {output: "greeting"}\nworld\n```';

      // 第一次执行：缓存未命中 → 真实调用
      cacheState.record = null;
      await executeDocument(doc, { ...defaultOptions, quiet: true, cache: true }, defaultConfig);
      // 第二次不带 cache flag：即使存在缓存记录也重新执行
      cacheState.record = { output: 'ai result', value: 'ai result', duration: 100 };
      await executeDocument(doc, { ...defaultOptions, quiet: true }, defaultConfig);
      expect(executeAIBlock).toHaveBeenCalledTimes(2);
    });
  });

  describe('release mode', () => {
    it('should strip template block from output', async () => {
      const rawContent = [
        '# Test',
        '',
        '```template',
        'Content: {{date}}',
        '```',
        '',
        '## Footer',
      ].join('\n');

      const doc: ParsedDocument = {
        blocks: [
          {
            type: 'template',
            content: 'Content: {{date}}',
            lang: 'template',
            meta: {},
            position: 0,
            sourceStart: 0,
            sourceEnd: 0,
          },
        ],
        rawContent,
        variables: ['date'],
      };

      const result = await executeDocument(doc, { ...defaultOptions, release: true }, defaultConfig);
      expect(result.content).not.toContain('```template');
      expect(result.content).not.toContain('```');
      expect(result.content).toContain('# Test');
      expect(result.content).toContain('## Footer');
    });

    it('should strip multiple blocks and keep surrounding content', async () => {
      const rawContent = [
        '# Report',
        '',
        '```template',
        'Block A',
        '```',
        '',
        '正文内容',
        '',
        '```template',
        'Block B',
        '```',
        '',
        '---',
      ].join('\n');

      const doc: ParsedDocument = {
        blocks: [
          { type: 'template', content: 'Block A', lang: 'template', meta: {}, position: 0, sourceStart: 0, sourceEnd: 0 },
          { type: 'template', content: 'Block B', lang: 'template', meta: {}, position: 1, sourceStart: 0, sourceEnd: 0 },
        ],
        rawContent,
        variables: [],
      };

      const result = await executeDocument(doc, { ...defaultOptions, release: true }, defaultConfig);
      expect(result.content).not.toContain('```');
      expect(result.content).toContain('# Report');
      expect(result.content).toContain('正文内容');
      expect(result.content).toContain('---');
    });
  });

  describe('template block source preservation', () => {
    it('should preserve Handlebars syntax inside template block source', async () => {
      const rawContent = [
        '# Doc',
        '',
        '```template',
        '{{#each items}}',
        '{{this.name}}',
        '{{/each}}',
        '```',
        '',
        'Done {{date}}',
      ].join('\n');

      const doc: ParsedDocument = {
        blocks: [
          {
            type: 'template',
            content: '{{#each items}}\n{{this.name}}\n{{/each}}',
            lang: 'template',
            meta: {},
            position: 0,
            sourceStart: 7,
            sourceEnd: 65,
          },
        ],
        rawContent,
        variables: ['date'],
      };

      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const result = await executeDocument(doc, { ...defaultOptions, quiet: true }, defaultConfig);
      spy.mockRestore();

      // template 块源码（Handlebars 语法）应原样保留，不被朴素变量替换破坏
      expect(result.content).toContain('{{#each items}}');
      expect(result.content).toContain('{{this.name}}');
      expect(result.content).toContain('{{/each}}');
      // 块外的 {{date}} 仍应正常渲染
      expect(result.content).toMatch(/Done 202\d/);
    });
  });

  describe('system variables', () => {
    it('should inject date variable', async () => {
      const doc = makeDoc([makeBlock('template', 'Today: {{date}}')]);
      // rawContent must contain the variable reference for rendering
      doc.rawContent = 'Today: {{date}}';
      doc.variables = ['date'];

      const result = await executeDocument(doc, defaultOptions, defaultConfig);
      expect(result.content).toContain('Today: 202');
    });

    it('should inject datetime variable', async () => {
      const doc = makeDoc([makeBlock('template', 'Now: {{datetime}}')]);
      doc.rawContent = 'Now: {{datetime}}';
      doc.variables = ['datetime'];

      const result = await executeDocument(doc, defaultOptions, defaultConfig);
      expect(result.content).toMatch(/Now: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
    });

    it('should inject timestamp variable', async () => {
      const doc = makeDoc([makeBlock('template', 'Ts: {{timestamp}}')]);
      doc.rawContent = 'Ts: {{timestamp}}';
      doc.variables = ['timestamp'];

      const result = await executeDocument(doc, defaultOptions, defaultConfig);
      expect(result.content).toMatch(/Ts: \d{10,}/);
    });
  });

  describe('varArgs injection', () => {
    it('should inject varArgs into context', async () => {
      const doc = makeDoc([makeBlock('template', 'Hello {{name}}')]);
      doc.rawContent = 'Hello {{name}}';
      doc.variables = ['name'];

      const result = await executeDocument(
        doc,
        { ...defaultOptions, varArgs: { name: 'FlowMD' } },
        defaultConfig
      );
      expect(result.content).toContain('Hello FlowMD');
    });

    it('should prefer varArgs over system variables', async () => {
      const doc = makeDoc([makeBlock('template', 'Date: {{date}}')]);
      doc.rawContent = 'Date: {{date}}';
      doc.variables = ['date'];

      const result = await executeDocument(
        doc,
        { ...defaultOptions, varArgs: { date: '2026-01-01' } },
        defaultConfig
      );
      expect(result.content).toContain('Date: 2026-01-01');
    });

    it('should support dotted varArgs keys', async () => {
      const doc = makeDoc([makeBlock('template', 'Hello {{user.name}}')]);
      doc.rawContent = 'Hello {{user.name}}';
      doc.variables = ['user.name'];

      const result = await executeDocument(
        doc,
        { ...defaultOptions, varArgs: { 'user.name': 'Alice' } },
        defaultConfig
      );
      expect(result.content).toContain('Hello Alice');
    });
  });

  describe('varFile .env format', () => {
    it('should parse .env format in --var-file', async () => {
      mockReadFileSync.mockReturnValue(
        'NAME=FlowMD\nVERSION=1.0.0\n# comment\nDB_HOST=localhost\nDB_PORT=5432\n'
      );

      const doc = makeDoc([makeBlock('template', 'App: {{NAME}}-{{VERSION}}, DB: {{DB_HOST}}:{{DB_PORT}}')]);
      doc.rawContent = 'App: {{NAME}}-{{VERSION}}, DB: {{DB_HOST}}:{{DB_PORT}}';
      doc.variables = ['NAME', 'VERSION', 'DB_HOST', 'DB_PORT'];

      const result = await executeDocument(
        doc,
        { ...defaultOptions, varFile: '/path/to/config.env' },
        defaultConfig
      );
      expect(result.content).toContain('App: FlowMD-1.0.0, DB: localhost:5432');
    });

    it('should handle KEY=VALUE pairs with quotes in var-file', async () => {
      mockReadFileSync.mockReturnValue(
        'TITLE="Hello World"\nGREETING=\'Hi there\'\nNUMBER=42\n'
      );

      const doc = makeDoc([makeBlock('template', '{{TITLE}} - {{GREETING}} - {{NUMBER}}')]);
      doc.rawContent = '{{TITLE}} - {{GREETING}} - {{NUMBER}}';
      doc.variables = ['TITLE', 'GREETING', 'NUMBER'];

      const result = await executeDocument(
        doc,
        { ...defaultOptions, varFile: '/path/to/config.env' },
        defaultConfig
      );
      expect(result.content).toContain('Hello World - Hi there - 42');
    });
  });

  describe('run block integration', () => {
    it('should execute a js run block and render its output', async () => {
      const rawContent = [
        '# Doc',
        '',
        '```run {runtime: "js", output: "greeting"}',
        'console.log(JSON.stringify({ hello: "world" }))',
        '```',
        '',
        '{{greeting}}',
      ].join('\n');

      const doc: ParsedDocument = {
        blocks: [
          {
            type: 'run',
            content: 'console.log(JSON.stringify({ hello: "world" }))',
            lang: 'run {runtime: "js", output: "greeting"}',
            meta: { runtime: 'js', output: 'greeting' },
            position: 0,
            sourceStart: 0,
            sourceEnd: 0,
          },
        ],
        rawContent,
        variables: ['greeting'],
      };

      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const result = await executeDocument(
        doc,
        { ...defaultOptions, quiet: true, runYes: true },
        defaultConfig
      );
      spy.mockRestore();

      expect(result.hasError).toBe(false);
      expect(result.content).toContain('"hello": "world"');
    });

    it('should mark hasError when a run block script fails', async () => {
      const doc: ParsedDocument = {
        blocks: [
          {
            type: 'run',
            content: 'throw new Error("boom")',
            lang: 'run {runtime: "js"}',
            meta: { runtime: 'js' },
            position: 0,
            sourceStart: 0,
            sourceEnd: 0,
          },
        ],
        rawContent: '```run {runtime: "js"}\nthrow new Error("boom")\n```',
        variables: [],
      };

      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const result = await executeDocument(
        doc,
        { ...defaultOptions, quiet: true, runYes: true },
        defaultConfig
      );
      spy.mockRestore();

      expect(result.hasError).toBe(true);
    });

    it('should strip run blocks from output in release mode', async () => {
      const rawContent = [
        '# Doc',
        '',
        '```run {runtime: "js"}',
        'console.log(1)',
        '```',
        '',
        'Body',
      ].join('\n');

      const doc: ParsedDocument = {
        blocks: [
          {
            type: 'run',
            content: 'console.log(1)',
            lang: 'run {runtime: "js"}',
            meta: { runtime: 'js' },
            position: 0,
            sourceStart: 0,
            sourceEnd: 0,
          },
        ],
        rawContent,
        variables: [],
      };

      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const result = await executeDocument(
        doc,
        { ...defaultOptions, quiet: true, release: true, runYes: true },
        defaultConfig
      );
      spy.mockRestore();

      expect(result.content).not.toContain('```run');
      expect(result.content).toContain('# Doc');
     expect(result.content).toContain('Body');
   });
 
    it('should strip agent blocks from output in release mode', async () => {
      const rawContent = [
        '# Report',
        '',
        '```agent {goal: "g", output: "r"}',
        'task',
        '```',
        '',
        'Tail',
      ].join('\n');

      const doc: ParsedDocument = {
        blocks: [
          {
            type: 'agent',
            content: 'task',
            lang: 'agent {goal: "g", output: "r"}',
            meta: { goal: 'g', output: 'r' },
            position: 0,
            sourceStart: 0,
            sourceEnd: 0,
          },
        ],
        rawContent,
        variables: [],
      };

      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const result = await executeDocument(
        doc,
        { ...defaultOptions, quiet: true, release: true, runYes: true },
        defaultConfig
      );
      spy.mockRestore();

      expect(result.content).not.toContain('```agent');
      expect(result.content).toContain('# Report');
      expect(result.content).toContain('Tail');
    });
 
    it('should strip doc blocks from output in release mode', async () => {
      const rawContent = [
        '# Doc',
        '',
        '```doc {path: "./sub.md", output: "sub"}',
        '```',
        '',
        'Tail',
      ].join('\n');

      const doc: ParsedDocument = {
        blocks: [
          {
            type: 'doc',
            content: '',
            lang: 'doc {path: "./sub.md", output: "sub"}',
            meta: { path: './sub.md', output: 'sub' },
            position: 0,
            sourceStart: 0,
            sourceEnd: 0,
          },
        ],
        rawContent,
        variables: [],
      };

      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const result = await executeDocument(
        doc,
        { ...defaultOptions, quiet: true, release: true },
        defaultConfig
      );
      spy.mockRestore();

      expect(result.content).not.toContain('```doc');
      expect(result.content).toContain('# Doc');
      expect(result.content).toContain('Tail');
    });
  });

  describe('pre-execution validation', () => {
    it('should warn about blocks without output', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const doc = makeDoc([makeBlock('template', 'test', {})]);
      doc.rawContent = '```template\ntest\n```';
      doc.variables = [];

      await executeDocument(doc, { ...defaultOptions, stepMode: false }, defaultConfig);
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('output 参数'));
      spy.mockRestore();
    });

    it('should warn about undefined variables', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const doc = makeDoc([makeBlock('template', '{{missing}}', { output: 'x' })]);
      doc.rawContent = '{{missing}}';
      doc.variables = ['missing'];

      await executeDocument(doc, { ...defaultOptions }, defaultConfig);
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('变量被引用'));
      spy.mockRestore();
    });
  });

describe('include YAML', () => {
  it('should inject YAML variables from include block', async () => {
    const yamlContent = 'key: hello\nnumber: 42\n';
    mockReadFileSync.mockImplementation((p: string) => {
      if (p.endsWith('.yaml')) return yamlContent;
      return '';
    });

    const doc: ParsedDocument = {
      blocks: [
        {
          type: 'include',
          content: '',
          lang: 'include {path: "vars.yaml"}',
          meta: { path: 'vars.yaml' },
          position: 0,
          sourceStart: 0,
          sourceEnd: 0,
        },
        {
          type: 'template',
          content: '{{key}}-{{number}}',
          lang: 'template',
          meta: {},
          position: 1,
          sourceStart: 0,
          sourceEnd: 0,
        },
      ],
      rawContent: '{{key}}-{{number}}',
      variables: ['key', 'number'],
    };

    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await executeDocument(doc, { ...defaultOptions, quiet: true, currentFile: join(process.cwd(), 'test.md') }, defaultConfig);
    spy.mockRestore();
    expect(result.content).toContain('hello');
    expect(result.content).toContain('42');
  });

  it('should reject invalid include extension', async () => {
    const doc: ParsedDocument = {
      blocks: [
        {
          type: 'include',
          content: '',
          lang: 'include {path: "data.xlsx"}',
          meta: { path: 'data.xlsx' },
          position: 0,
          sourceStart: 0,
          sourceEnd: 0,
        },
        {
          type: 'template',
          content: 'done',
          lang: 'template',
          meta: {},
          position: 1,
          sourceStart: 0,
          sourceEnd: 0,
        },
      ],
      rawContent: 'done',
      variables: [],
    };

    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await executeDocument(doc, { ...defaultOptions, quiet: true, currentFile: join(process.cwd(), 'test.md') }, defaultConfig);
    spy.mockRestore();
    expect(result.content).toBeDefined();
  });
});

describe('include .md', () => {
  it('should expand .md include blocks and execute sub-blocks', async () => {
    const subMdContent = [
      '# Sub Document',
      '',
      '```ai {output: "greeting"}',
      'Say hello',
      '```',
      '',
      '{{greeting}}',
    ].join('\n');

    mockReadFileSync.mockImplementation((p: string) => {
      if (p.endsWith('.md')) return subMdContent;
      return '';
    });

    const doc: ParsedDocument = {
      blocks: [
        {
          type: 'include',
          content: '',
          lang: 'include {path: "sub.md"}',
          meta: { path: 'sub.md' },
          position: 0,
          sourceStart: 0,
          sourceEnd: 0,
        },
        {
          type: 'template',
          content: 'Final: {{greeting}}',
          lang: 'template',
          meta: {},
          position: 1,
          sourceStart: 0,
          sourceEnd: 0,
        },
      ],
      rawContent: 'Final: {{greeting}}',
      variables: ['greeting'],
    };

    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await executeDocument(doc, { ...defaultOptions, quiet: true, currentFile: join(process.cwd(), 'main.md') }, defaultConfig);
    spy.mockRestore();
    expect(result.content).toContain('Final:');
    expect(executeAIBlock).toHaveBeenCalled();
  });
});

describe('error recovery', () => {
  it('should continue executing independent blocks when one fails', async () => {
    vi.mocked(executeAIBlock)
      .mockResolvedValueOnce({
        success: false,
        output: null,
        error: 'API limit',
        duration: 100,
      })
      .mockResolvedValueOnce({
        success: true,
        output: 'independent',
        duration: 100,
      });

    const doc = makeDoc([
      makeBlock('ai', 'Fail block', { output: 'failed' }),
      makeBlock('ai', 'Independent block', { output: 'ok' }),
    ]);

    await executeDocument(doc, { ...defaultOptions, quiet: true }, defaultConfig);
    expect(executeAIBlock).toHaveBeenCalledTimes(2);
  });

  it('should skip blocks that depend on failed outputs', async () => {
    vi.mocked(executeAIBlock).mockResolvedValueOnce({
      success: false,
      output: null,
      error: 'API limit',
      duration: 100,
    });

    const doc = makeDoc([
      makeBlock('ai', 'Fail block', { output: 'data' }),
      makeBlock('template', 'Dependent: {{data}}'),
    ]);

    await executeDocument(doc, { ...defaultOptions, quiet: true }, defaultConfig);
    expect(executeAIBlock).toHaveBeenCalledTimes(1);
  });

  it('should skip dependent block, then continue independent block', async () => {
    vi.mocked(executeAIBlock)
      .mockResolvedValueOnce({
        success: false,
        output: null,
        error: 'API limit',
        duration: 100,
      })
      .mockResolvedValueOnce({
        success: true,
        output: 'independent',
        duration: 100,
      });

    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const doc = makeDoc([
      makeBlock('ai', 'Fail block', { output: 'data' }),
      makeBlock('template', 'Dependent: {{data}}'),
      makeBlock('ai', 'Independent', { output: 'ok' }),
    ]);

    const result = await executeDocument(doc, { ...defaultOptions, quiet: true }, defaultConfig);
    spy.mockRestore();
    // 失败块 1 执行，依赖块 2 跳过，独立块 3 执行
    expect(executeAIBlock).toHaveBeenCalledTimes(2);
    expect(result.hasError).toBe(true);
  });

  it('should group identical errors in failure summary', async () => {
    vi.mocked(executeAIBlock)
      .mockResolvedValueOnce({
        success: false,
        output: null,
        error: 'API limit',
        duration: 100,
      })
      .mockResolvedValueOnce({
        success: false,
        output: null,
        error: 'API limit',
        duration: 100,
      });

    const logCalls: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      logCalls.push(args.join(' '));
    });
    const doc = makeDoc([
      makeBlock('ai', 'Fail 1', { output: 'a' }),
      makeBlock('ai', 'Fail 2', { output: 'b' }),
    ]);

    await executeDocument(doc, { ...defaultOptions }, defaultConfig);
    spy.mockRestore();

    const grouped = logCalls.find((c) => c.includes('1,2'));
    expect(grouped).toBeDefined();
    expect(grouped).toContain('API limit');
  });

  it('should return hasError true when a block fails', async () => {
    vi.mocked(executeAIBlock).mockResolvedValueOnce({
      success: false,
      output: null,
      error: 'API limit',
      duration: 100,
    });

    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const doc = makeDoc([makeBlock('ai', 'Fail block', { output: 'x' })]);

    const result = await executeDocument(doc, { ...defaultOptions, quiet: true }, defaultConfig);
    spy.mockRestore();
    expect(result.hasError).toBe(true);
  });

  it('should return hasError false when all blocks succeed', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const doc = makeDoc([makeBlock('ai', 'OK block', { output: 'x' })]);

    const result = await executeDocument(doc, { ...defaultOptions, quiet: true }, defaultConfig);
    spy.mockRestore();
    expect(result.hasError).toBe(false);
  });

  it('should print failure summary with failed block info', async () => {
    vi.mocked(executeAIBlock).mockResolvedValueOnce({
      success: false,
      output: null,
      error: 'API limit',
      duration: 100,
    });

    const logCalls: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      logCalls.push(args.join(' '));
    });
    const doc = makeDoc([makeBlock('ai', 'Fail block', { output: 'x' })]);

    await executeDocument(doc, { ...defaultOptions }, defaultConfig);
    spy.mockRestore();

    const summary = logCalls.find((c) => c.includes('执行完成'));
    expect(summary).toBeDefined();
    expect(summary).toContain('0/1');
    expect(summary).toContain('失败');
  });

  it('should print variable snapshot in debug mode', async () => {
    vi.mocked(executeAIBlock).mockImplementationOnce(
      async (_content: string, config: Record<string, string>, context: { set: (k: string, v: unknown) => void }) => {
        if (config.output) context.set(config.output, 'summary text');
        return { success: true, output: 'summary text', duration: 10 };
      }
    );

    const logCalls: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      logCalls.push(args.join(' '));
    });
    const doc = makeDoc([makeBlock('ai', 'Sum up', { output: 'summary' })]);

    await executeDocument(doc, { ...defaultOptions, debug: true }, defaultConfig);
    spy.mockRestore();

    const snapshot = logCalls.find((c) => c.includes('summary ='));
    expect(snapshot).toBeDefined();
    expect(snapshot).toContain('summary');
    expect(snapshot).toContain('summary text');
  });

  it('should not print variable snapshot in non-debug mode', async () => {
    vi.mocked(executeAIBlock).mockResolvedValueOnce({
      success: true,
      output: 'x',
      duration: 10,
    });

    const logCalls: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      logCalls.push(args.join(' '));
    });
    const doc = makeDoc([makeBlock('ai', 'Sum up', { output: 'summary' })]);

    await executeDocument(doc, defaultOptions, defaultConfig);
    spy.mockRestore();

    expect(logCalls.find((c) => c.includes('变量快照'))).toBeUndefined();
  });
});

});
