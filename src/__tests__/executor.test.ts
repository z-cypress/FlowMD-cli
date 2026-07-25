/**
 * Executor unit tests
 * Tests dependency detection, fail-fast, and variable missing reporting
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ParsedDocument, RunOptions, FlowConfig, ExecutableBlock } from '../types/index.js';

// Mock all block executors
vi.mock('../core/blocks/ai-block.js', () => ({
  executeAIBlock: vi.fn().mockResolvedValue({
    success: true,
    output: 'ai result',
    duration: 100,
  }),
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
  });

  describe('basic execution', () => {
    it('should execute all blocks in order', async () => {
      const doc = makeDoc([
        makeBlock('data', 'SELECT * FROM users'),
        makeBlock('ai', 'Analyze {{data}}'),
        makeBlock('template', 'Result: {{analysis}}'),
      ]);

      const result = await executeDocument(doc, defaultOptions, defaultConfig);
      expect(result).toBeDefined();
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
      expect(result).toBeDefined();
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
      expect(result).not.toContain('```template');
      expect(result).not.toContain('```');
      expect(result).toContain('# Test');
      expect(result).toContain('## Footer');
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
      expect(result).not.toContain('```');
      expect(result).toContain('# Report');
      expect(result).toContain('正文内容');
      expect(result).toContain('---');
    });
  });

  describe('system variables', () => {
    it('should inject date variable', async () => {
      const doc = makeDoc([makeBlock('template', 'Today: {{date}}')]);
      // rawContent must contain the variable reference for rendering
      doc.rawContent = 'Today: {{date}}';
      doc.variables = ['date'];

      const result = await executeDocument(doc, defaultOptions, defaultConfig);
      expect(result).toContain('Today: 202');
    });

    it('should inject datetime variable', async () => {
      const doc = makeDoc([makeBlock('template', 'Now: {{datetime}}')]);
      doc.rawContent = 'Now: {{datetime}}';
      doc.variables = ['datetime'];

      const result = await executeDocument(doc, defaultOptions, defaultConfig);
      expect(result).toMatch(/Now: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
    });

    it('should inject timestamp variable', async () => {
      const doc = makeDoc([makeBlock('template', 'Ts: {{timestamp}}')]);
      doc.rawContent = 'Ts: {{timestamp}}';
      doc.variables = ['timestamp'];

      const result = await executeDocument(doc, defaultOptions, defaultConfig);
      expect(result).toMatch(/Ts: \d{10,}/);
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
      expect(result).toContain('Hello FlowMD');
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
      expect(result).toContain('Date: 2026-01-01');
    });
  });
});
