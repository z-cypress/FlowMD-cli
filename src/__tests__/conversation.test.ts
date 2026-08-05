/**
 * Multi-turn conversation memory tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExecutionContext } from '../core/context.js';
import { parseMarkdown } from '../core/parser.js';
import { executeDocument } from '../core/executor.js';
import type { FlowConfig, RunOptions } from '../types/index.js';

let aiCallCount = 0;
let capturedMessages: Array<{ role: string; content: string }[]> = [];

vi.mock('../core/blocks/ai-block.js', () => ({
  executeAIBlock: vi.fn().mockImplementation(async (
    _content: string,
    config: { output?: string; conversation?: string },
    context: ExecutionContext
  ) => {
    aiCallCount++;
    // Simulate: get conversation history, capture messages, return result
    const history = config.conversation ? context.getConversation(config.conversation) : [];
    capturedMessages.push([...history, { role: 'user', content: `response-${aiCallCount}` }]);

    // Save to conversation
    if (config.conversation) {
      context.appendToConversation(config.conversation, 'user', `prompt-${aiCallCount}`);
      context.appendToConversation(config.conversation, 'assistant', `response-${aiCallCount}`);
    }

    if (config.output) {
      context.set(config.output, `response-${aiCallCount}`);
    }

    return { success: true, output: `response-${aiCallCount}`, duration: 10 };
  }),
}));

vi.mock('../core/blocks/data-block.js', () => ({
  executeDataBlock: vi.fn().mockResolvedValue({ success: true, output: '1', duration: 5 }),
}));

vi.mock('../core/blocks/run-block.js', () => ({
  executeRunBlock: vi.fn().mockResolvedValue({ success: true, output: 'ok', duration: 5 }),
}));

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

describe('conversation memory', () => {
  beforeEach(() => {
    aiCallCount = 0;
    capturedMessages = [];
    vi.clearAllMocks();
  });

  it('should carry conversation history across blocks', async () => {
    const content = [
      '```ai {output: "a", conversation: "chat"}',
      'first prompt',
      '```',
      '```ai {output: "b", conversation: "chat"}',
      'second prompt',
      '```',
    ].join('\n');

    const doc = parseMarkdown(content);
    const result = await executeDocument(doc, defaultOptions, defaultConfig);

    expect(result.hasError).toBe(false);
    expect(aiCallCount).toBe(2);
    // Second call's capturedMessages includes 2 history turns + current prompt
    expect(capturedMessages[1].length).toBe(3); // user prompt + assistant response + current
    expect(capturedMessages[1][0].role).toBe('user');
    expect(capturedMessages[1][0].content).toBe('prompt-1');
    expect(capturedMessages[1][1].role).toBe('assistant');
    expect(capturedMessages[1][1].content).toBe('response-1');
  });

  it('should not affect blocks with different conversation names', async () => {
    const content = [
      '```ai {output: "a", conversation: "chat1"}',
      'first',
      '```',
      '```ai {output: "b", conversation: "chat2"}',
      'second',
      '```',
    ].join('\n');

    const doc = parseMarkdown(content);
    const result = await executeDocument(doc, defaultOptions, defaultConfig);

    expect(result.hasError).toBe(false);
    expect(aiCallCount).toBe(2);
    // chat2 should have empty history (different from chat1)
    // capturedMessages[1] only has the current prompt (no history)
    expect(capturedMessages[1].length).toBe(1);
    expect(capturedMessages[1][0].content).toBe('response-2');
  });

  it('should work without conversation parameter', async () => {
    const content = [
      '```ai {output: "a"}',
      'prompt',
      '```',
    ].join('\n');

    const doc = parseMarkdown(content);
    const result = await executeDocument(doc, defaultOptions, defaultConfig);

    expect(result.hasError).toBe(false);
    expect(aiCallCount).toBe(1);
  });
});
