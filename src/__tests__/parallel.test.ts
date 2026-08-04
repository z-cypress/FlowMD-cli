/**
 * Parallel block execution tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseMarkdown } from '../core/parser.js';
import { executeDocument } from '../core/executor.js';
import type { FlowConfig, RunOptions } from '../types/index.js';

// Mock AI block to track calls
let aiCallCount = 0;
let aiCallOrder: string[] = [];

vi.mock('../core/blocks/ai-block.js', () => ({
  executeAIBlock: vi.fn().mockImplementation(async (content: string, config: { output?: string }) => {
    aiCallCount++;
    const label = config.output || `call-${aiCallCount}`;
    aiCallOrder.push(label);
    // Simulate async work
    await new Promise(r => setTimeout(r, 10));
    return { success: true, output: `result-${label}`, duration: 10 };
  }),
}));

// Mock other blocks
vi.mock('../core/blocks/data-block.js', () => ({
  executeDataBlock: vi.fn().mockResolvedValue({ success: true, output: '1', duration: 5 }),
}));

vi.mock('../core/blocks/run-block.js', () => ({
  executeRunBlock: vi.fn().mockResolvedValue({ success: true, output: 'ok', duration: 5 }),
}));

vi.mock('../core/blocks/template-block.js', () => ({
  executeTemplateBlock: vi.fn().mockImplementation(async (content: string, _config: unknown, context: { render: (s: string) => string }) => {
    return { success: true, output: context.render(content), duration: 1 };
  }),
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

describe('parallel block execution', () => {
  beforeEach(() => {
    aiCallCount = 0;
    aiCallOrder = [];
    vi.clearAllMocks();
  });

  it('should execute blocks in parallel', async () => {
    const content = [
      '<!-- parallel -->',
      '```ai {output: "a"}',
      'prompt a',
      '```',
      '```ai {output: "b"}',
      'prompt b',
      '```',
      '<!-- endparallel -->',
    ].join('\n');

    const doc = parseMarkdown(content);
    const result = await executeDocument(doc, defaultOptions, defaultConfig);

    expect(result.hasError).toBe(false);
    expect(aiCallCount).toBe(2);
  });

  it('should handle parallel with sequential blocks around it', async () => {
    const content = [
      '```ai {output: "before"}',
      'before prompt',
      '```',
      '<!-- parallel -->',
      '```ai {output: "p1"}',
      'parallel 1',
      '```',
      '```ai {output: "p2"}',
      'parallel 2',
      '```',
      '<!-- endparallel -->',
      '```ai {output: "after"}',
      'after prompt',
      '```',
    ].join('\n');

    const doc = parseMarkdown(content);
    const result = await executeDocument(doc, defaultOptions, defaultConfig);

    expect(result.hasError).toBe(false);
    expect(aiCallCount).toBe(4);
  });

  it('should keep parallel/endparallel directive comments in default mode', async () => {
    const content = [
      '<!-- parallel -->',
      '```ai {output: "a"}',
      'prompt',
      '```',
      '<!-- endparallel -->',
    ].join('\n');

    const doc = parseMarkdown(content);
    const result = await executeDocument(doc, defaultOptions, defaultConfig);

    expect(result.content).toContain('<!-- parallel -->');
    expect(result.content).toContain('<!-- endparallel -->');
  });

  it('should strip parallel/endparallel in release mode', async () => {
    const content = [
      '<!-- parallel -->',
      '```ai {output: "a"}',
      'prompt',
      '```',
      '<!-- endparallel -->',
    ].join('\n');

    const doc = parseMarkdown(content);
    const result = await executeDocument(doc, { ...defaultOptions, release: true }, defaultConfig);

    expect(result.content).not.toContain('<!-- parallel -->');
    expect(result.content).not.toContain('<!-- endparallel -->');
  });

  it('should handle nested parallel', async () => {
    const content = [
      '<!-- parallel -->',
      '```ai {output: "a"}',
      'prompt a',
      '```',
      '<!-- parallel -->',
      '```ai {output: "b1"}',
      'prompt b1',
      '```',
      '```ai {output: "b2"}',
      'prompt b2',
      '```',
      '<!-- endparallel -->',
      '<!-- endparallel -->',
    ].join('\n');

    const doc = parseMarkdown(content);
    const result = await executeDocument(doc, defaultOptions, defaultConfig);

    expect(result.hasError).toBe(false);
    expect(aiCallCount).toBe(3);
  });

  it('should report error when endparallel is missing', async () => {
    const content = [
      '<!-- parallel -->',
      '```ai {output: "a"}',
      'prompt',
      '```',
    ].join('\n');

    const doc = parseMarkdown(content);
    const result = await executeDocument(doc, defaultOptions, defaultConfig);

    expect(result.hasError).toBe(true);
  });

  it('should report error for orphan endparallel', async () => {
    const content = [
      '<!-- endparallel -->',
    ].join('\n');

    const doc = parseMarkdown(content);
    const result = await executeDocument(doc, defaultOptions, defaultConfig);

    expect(result.hasError).toBe(true);
  });
});
