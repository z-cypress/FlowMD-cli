/**
 * AI block executor unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExecutionContext } from '../core/context.js';
import type { LLMConfig } from '../types/index.js';

// Mock OpenAI and Anthropic modules
vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'Mocked AI response' } }],
        }),
      },
    };
    constructor() {}
  },
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Mocked Anthropic response' }],
      }),
    };
    constructor() {}
  },
}));

// Import after mocks are set up
const { executeAIBlock } = await import('../core/blocks/ai-block.js');

describe('executeAIBlock', () => {
  let context: ExecutionContext;
  let openaiConfig: LLMConfig;
  let anthropicConfig: LLMConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    context = new ExecutionContext();

    openaiConfig = {
      provider: 'openai',
      apiKey: 'test-openai-key',
      model: 'gpt-4o',
      temperature: 0.7,
    };

    anthropicConfig = {
      provider: 'anthropic',
      apiKey: 'test-anthropic-key',
      model: 'claude-3-opus-20240229',
      temperature: 0.7,
    };
  });

  describe('OpenAI provider', () => {
    it('should call OpenAI and return result', async () => {
      const result = await executeAIBlock(
        'Hello AI',
        {},
        context,
        openaiConfig
      );

      expect(result.success).toBe(true);
      expect(result.output).toBe('Mocked AI response');
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should render variables in prompt', async () => {
      context.set('name', 'Alice');

      const result = await executeAIBlock(
        'Hello {{name}}',
        {},
        context,
        openaiConfig
      );

      expect(result.success).toBe(true);
    });

    it('should use block-specific model if provided', async () => {
      const result = await executeAIBlock(
        'Test',
        { model: 'gpt-4-turbo' },
        context,
        openaiConfig
      );

      expect(result.success).toBe(true);
    });

    it('should store result in context if output is specified', async () => {
      await executeAIBlock(
        'Test',
        { output: 'summary' },
        context,
        openaiConfig
      );

      expect(context.get('summary')).toBe('Mocked AI response');
    });
  });

  describe('Anthropic provider', () => {
    it('should call Anthropic and return result', async () => {
      const result = await executeAIBlock(
        'Hello AI',
        {},
        context,
        anthropicConfig
      );

      expect(result.success).toBe(true);
      expect(result.output).toBe('Mocked Anthropic response');
    });

    it('should store result in context if output is specified', async () => {
      await executeAIBlock(
        'Test',
        { output: 'result' },
        context,
        anthropicConfig
      );

      expect(context.get('result')).toBe('Mocked Anthropic response');
    });
  });

  describe('error handling', () => {
    it('should handle unsupported provider', async () => {
      const invalidConfig: LLMConfig = {
        provider: 'unsupported' as 'openai',
        apiKey: 'test',
        model: 'test',
      };

      const result = await executeAIBlock(
        'Test',
        {},
        context,
        invalidConfig
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('不支持的 LLM 提供商');
    });
  });

  describe('configuration', () => {
    it('should use default temperature if not specified', async () => {
      const configWithoutTemp: LLMConfig = {
        provider: 'openai',
        apiKey: 'test',
        model: 'gpt-4o',
      };

      const result = await executeAIBlock(
        'Test',
        {},
        context,
        configWithoutTemp
      );

      expect(result.success).toBe(true);
    });

    it('should use block temperature over config temperature', async () => {
      const result = await executeAIBlock(
        'Test',
        { temperature: 0.3 },
        context,
        openaiConfig
      );

      expect(result.success).toBe(true);
    });
  });
});
