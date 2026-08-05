/**
 * executeSingleBlock 单块执行测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeSingleBlock } from '../core/executor.js';
import type { FlowConfig, RunOptions } from '../types/index.js';

vi.mock('../core/blocks/template-block.js', () => ({
  executeTemplateBlock: vi.fn().mockImplementation(
    async (content: string, _meta: Record<string, string>, context: { render: (s: string) => string }) => {
      return { success: true, output: context.render(content), duration: 5 };
    }
  ),
}));

vi.mock('../core/blocks/data-block.js', () => ({
  executeDataBlock: vi.fn().mockResolvedValue({ success: true, output: '1', duration: 5 }),
}));

vi.mock('../core/blocks/ai-block.js', () => ({
  executeAIBlock: vi.fn().mockResolvedValue({ success: true, output: 'ai-out', duration: 5 }),
}));

vi.mock('../core/blocks/run-block.js', () => ({
  executeRunBlock: vi.fn().mockResolvedValue({ success: true, output: 'ok', duration: 5 }),
}));

vi.mock('../utils/history.js', () => ({
  recordExecution: vi.fn(),
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
  debug: false,
  release: false,
  quiet: true,
  varArgs: {},
};

describe('executeSingleBlock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should execute a single template block', async () => {
    const md = '```template {output: "x"}\nHello {{name}}\n```\n\n{{x}}';
    const result = await executeSingleBlock(
      md,
      0,
      { ...defaultOptions, varArgs: { name: 'FlowMD' } },
      defaultConfig
    );
    expect(result.success).toBe(true);
    expect(result.type).toBe('template');
    expect(result.output).toContain('Hello FlowMD');
  });

  it('should execute a later block by index', async () => {
    const md = [
      '```template {output: "a"}',
      'first',
      '```',
      '```template {output: "b"}',
      'second',
      '```',
    ].join('\n');
    const result = await executeSingleBlock(md, 1, defaultOptions, defaultConfig);
    expect(result.success).toBe(true);
    expect(result.output).toContain('second');
  });

  it('should return failure for out-of-range index', async () => {
    const md = '```template\nHi\n```';
    const result = await executeSingleBlock(md, 3, defaultOptions, defaultConfig);
    expect(result.success).toBe(false);
    expect(result.error).toContain('超出范围');
  });
});
