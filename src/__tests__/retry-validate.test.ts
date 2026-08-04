/**
 * Block-level retry and output validation tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExecutionContext } from '../core/context.js';
import { parseMarkdown } from '../core/parser.js';
import { executeDocument } from '../core/executor.js';
import type { FlowConfig, RunOptions } from '../types/index.js';

// Mock AI block to control success/failure
let aiCallCount = 0;
let aiResults: Array<{ success: boolean; output: string; error?: string }> = [];

vi.mock('../core/blocks/ai-block.js', () => ({
  executeAIBlock: vi.fn().mockImplementation(async () => {
    const result = aiResults[aiCallCount] ?? aiResults[aiResults.length - 1];
    aiCallCount++;
    return { ...result, duration: 10 };
  }),
}));

// Mock data block
vi.mock('../core/blocks/data-block.js', () => ({
  executeDataBlock: vi.fn().mockResolvedValue({ success: true, output: '1', duration: 5 }),
}));

// Mock run block
vi.mock('../core/blocks/run-block.js', () => ({
  executeRunBlock: vi.fn().mockResolvedValue({ success: true, output: 'ok', duration: 5 }),
}));

// Mock template block
vi.mock('../core/blocks/template-block.js', () => ({
  executeTemplateBlock: vi.fn().mockImplementation(async (content: string, _config: unknown, context: ExecutionContext) => {
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

describe('retry and validate', () => {
  beforeEach(() => {
    aiCallCount = 0;
    aiResults = [];
    vi.clearAllMocks();
  });

  describe('retry', () => {
    it('should retry on failure and succeed', async () => {
      aiResults = [
        { success: false, output: '', error: 'rate limit' },
        { success: true, output: 'ok' },
      ];

      const doc = parseMarkdown('```ai {output: "x", retry: 1}\nprompt\n```');
      const result = await executeDocument(doc, { ...defaultOptions }, defaultConfig);

      expect(result.hasError).toBe(false);
      expect(aiCallCount).toBe(2);
    });

    it('should exhaust all retries and report failure', async () => {
      aiResults = [
        { success: false, output: '', error: 'fail 1' },
        { success: false, output: '', error: 'fail 2' },
        { success: false, output: '', error: 'fail 3' },
      ];

      const doc = parseMarkdown('```ai {output: "x", retry: 2}\nprompt\n```');
      const result = await executeDocument(doc, { ...defaultOptions }, defaultConfig);

      expect(result.hasError).toBe(true);
      expect(aiCallCount).toBe(3); // 1 initial + 2 retries
    });

    it('should not retry when retry is 0 (default)', async () => {
      aiResults = [
        { success: false, output: '', error: 'fail' },
      ];

      const doc = parseMarkdown('```ai {output: "x"}\nprompt\n```');
      const result = await executeDocument(doc, { ...defaultOptions }, defaultConfig);

      expect(result.hasError).toBe(true);
      expect(aiCallCount).toBe(1);
    });
  });

  describe('validate', () => {
    it('should pass validation with valid JSON', async () => {
      aiResults = [
        { success: true, output: '{"a":1}' },
      ];

      const doc = parseMarkdown('```ai {output: "x", validate: "json"}\nprompt\n```');
      const result = await executeDocument(doc, { ...defaultOptions }, defaultConfig);

      expect(result.hasError).toBe(false);
    });

    it('should fail validation with invalid JSON', async () => {
      aiResults = [
        { success: true, output: 'not json' },
        { success: true, output: 'still not json' },
        { success: true, output: 'nope' },
      ];

      const doc = parseMarkdown('```ai {output: "x", validate: "json", retry: 2}\nprompt\n```');
      const result = await executeDocument(doc, { ...defaultOptions }, defaultConfig);

      expect(result.hasError).toBe(true);
      expect(aiCallCount).toBe(3);
    });

    it('should validate non-empty', async () => {
      aiResults = [
        { success: true, output: '' },
        { success: true, output: 'content' },
      ];

      const doc = parseMarkdown('```ai {output: "x", validate: "non-empty", retry: 1}\nprompt\n```');
      const result = await executeDocument(doc, { ...defaultOptions }, defaultConfig);

      expect(result.hasError).toBe(false);
      expect(aiCallCount).toBe(2);
    });

    it('should validate json-array', async () => {
      aiResults = [
        { success: true, output: '[1,2,3]' },
      ];

      const doc = parseMarkdown('```ai {output: "x", validate: "json-array"}\nprompt\n```');
      const result = await executeDocument(doc, { ...defaultOptions }, defaultConfig);

      expect(result.hasError).toBe(false);
    });

    it('should fail json-array validation for non-array', async () => {
      aiResults = [
        { success: true, output: '{"a":1}' },
        { success: true, output: '{"b":2}' },
      ];

      const doc = parseMarkdown('```ai {output: "x", validate: "json-array", retry: 1}\nprompt\n```');
      const result = await executeDocument(doc, { ...defaultOptions }, defaultConfig);

      expect(result.hasError).toBe(true);
      expect(aiCallCount).toBe(2);
    });
  });

  describe('retry + validate combined', () => {
    it('should retry when validation fails', async () => {
      aiResults = [
        { success: true, output: 'bad' },    // validate:json fails
        { success: true, output: '{"ok":1}' }, // validate:json passes
      ];

      const doc = parseMarkdown('```ai {output: "x", retry: 2, validate: "json"}\nprompt\n```');
      const result = await executeDocument(doc, { ...defaultOptions }, defaultConfig);

      expect(result.hasError).toBe(false);
      expect(aiCallCount).toBe(2);
    });
  });
});
