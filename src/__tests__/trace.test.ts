/**
 * Trace observability tests
 */

import { describe, it, expect, vi } from 'vitest';
import { parseMarkdown } from '../core/parser.js';
import { executeDocument } from '../core/executor.js';
import { TraceCollector } from '../core/trace.js';
import type { FlowConfig, RunOptions } from '../types/index.js';

vi.mock('../core/blocks/ai-block.js', () => ({
  executeAIBlock: vi.fn().mockImplementation(
    async (_content: string, meta: Record<string, string>, context: { set: (k: string, v: unknown) => void }) => {
      if (meta.output) context.set(meta.output, 'result');
      return { success: true, output: 'result', duration: 10, usage: { input: 100, output: 50 } };
    }
  ),
}));

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

vi.mock('../utils/history.js', () => ({
  recordExecution: vi.fn(),
}));

const defaultConfig: FlowConfig = {
  llm: { provider: 'openai', apiKey: 'test', model: 'gpt-4o' },
  dataSources: {},
  execution: { timeout: 30 },
};

const baseOptions: RunOptions = {
  output: 'stdout',
  dryRun: false,
  stepMode: false,
  failFast: false,
  debug: false,
  release: false,
  quiet: true,
  varArgs: {},
};

describe('trace collector', () => {
  it('should collect and serialize spans', () => {
    const collector = new TraceCollector();
    collector.startSpan('ai:x', { block_type: 'ai' });
    collector.endSpan('ok', { input_tokens: 10 });
    collector.startSpan('data:y', { block_type: 'data' });
    collector.endSpan('error', { error: 'boom' });

    const spans = collector.toSpans();
    expect(spans.length).toBe(2);
    expect(spans[0].name).toBe('ai:x');
    expect(spans[0].attributes.input_tokens).toBe(10);
    expect(spans[1].status).toBe('error');

    const json = collector.toJSON();
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('should emit spans during document execution with --trace', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const content = [
      '```ai {output: "a"}',
      'prompt a',
      '```',
      '```ai {output: "b"}',
      'prompt b',
      '```',
    ].join('\n');

    const doc = parseMarkdown(content);
    const result = await executeDocument(doc, { ...baseOptions, trace: true }, defaultConfig);

    expect(result.hasError).toBe(false);
    // 检查是否有 trace JSON 输出到 console.log
    const jsonOutput = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    const parsed = JSON.parse(jsonOutput);
    expect(parsed.length).toBe(2);
    expect(parsed[0].attributes.block_type).toBe('ai');
    logSpy.mockRestore();
  });
});
