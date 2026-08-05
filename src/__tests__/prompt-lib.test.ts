/**
 * Prompt library tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ExecutionContext } from '../core/context.js';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Mock LLM responses
const mockOpenAICreate = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    choices: [{ message: { content: 'Mocked response' } }],
    usage: { prompt_tokens: 10, completion_tokens: 20 },
  })
);

vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = { completions: { create: mockOpenAICreate } };
    constructor() {}
  },
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Mocked response' }],
        usage: { input_tokens: 10, output_tokens: 20 },
      }),
    };
    constructor() {}
  },
}));

const { executeAIBlock } = await import('../core/blocks/ai-block.js');

describe('prompt library', () => {
  let tempDir: string;
  let context: ExecutionContext;
  const openaiConfig = {
    provider: 'openai' as const,
    apiKey: 'test-key',
    model: 'gpt-4o',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    tempDir = join(tmpdir(), `flowmd-prompt-test-${Date.now()}`);
    mkdirSync(join(tempDir, '.flow', 'prompts'), { recursive: true });
    context = new ExecutionContext();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should load prompt from .flow/prompts/<name>.md', async () => {
    writeFileSync(join(tempDir, '.flow', 'prompts', 'sales.md'), 'Analyze {{topic}} data', 'utf-8');

    context.set('topic', 'Q3 sales');

    const result = await executeAIBlock(
      'ignored',
      { output: 'analysis', prompt: 'sales' },
      context,
      openaiConfig,
      undefined,
      undefined,
      undefined,
      tempDir
    );

    expect(result.success).toBe(true);
    const call = mockOpenAICreate.mock.calls[0][0];
    expect(call.messages[0].content).toBe('Analyze Q3 sales data');
  });

  it('should fail when prompt file not found', async () => {
    const result = await executeAIBlock(
      'content',
      { output: 'x', prompt: 'nonexistent' },
      context,
      openaiConfig,
      undefined,
      undefined,
      undefined,
      tempDir
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('nonexistent');
  });

  it('should use inline content when no prompt param', async () => {
    context.set('name', 'Alice');

    const result = await executeAIBlock(
      'Hello {{name}}',
      { output: 'greeting' },
      context,
      openaiConfig
    );

    expect(result.success).toBe(true);
    const call = mockOpenAICreate.mock.calls[0][0];
    expect(call.messages[0].content).toBe('Hello Alice');
  });
});
