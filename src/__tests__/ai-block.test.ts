/**
 * AI block executor unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExecutionContext } from '../core/context.js';
import type { LLMConfig } from '../types/index.js';

// Hoisted spies，便于断言发给 SDK 的请求参数
const mockOpenAICreate = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ choices: [{ message: { content: 'Mocked AI response' } }] })
);
const mockAnthropicCreate = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'Mocked Anthropic response' }] })
);

// Mock OpenAI and Anthropic modules
vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = {
      completions: {
        create: mockOpenAICreate,
      },
    };
    constructor() {}
  },
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = {
      create: mockAnthropicCreate,
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

  describe('streaming', () => {
    it('should stream OpenAI output when stream: true', async () => {
      // 模拟 SDK 流式响应：async iterable of chunks
      mockOpenAICreate.mockResolvedValueOnce(
        (async function* () {
          yield { choices: [{ delta: { content: '流' } }] };
          yield { choices: [{ delta: { content: '式' } }] };
          yield { choices: [{ delta: { content: '输' } }] };
          yield { choices: [{ delta: { content: '出' } }] };
          yield { choices: [{ delta: {} }] };
        })()
      );

      const deltas: string[] = [];
      const result = await executeAIBlock(
        'Test',
        { stream: 'true' },
        context,
        openaiConfig,
        undefined,
        undefined,
        (d) => deltas.push(d)
      );

      expect(result.success).toBe(true);
      expect(result.output).toBe('流式输出');
      expect(deltas.join('')).toBe('流式输出');
      // 流式模式应传 stream: true
      expect(mockOpenAICreate.mock.calls.at(-1)?.[0]?.stream).toBe(true);
    });

    it('should stream Anthropic output when stream: true', async () => {
      mockAnthropicCreate.mockResolvedValueOnce(
        (async function* () {
          yield { type: 'content_block_delta', delta: { type: 'text_delta', text: '文' } };
          yield { type: 'content_block_delta', delta: { type: 'text_delta', text: '本' } };
          yield { type: 'content_block_stop' };
        })()
      );

      const deltas: string[] = [];
      const result = await executeAIBlock(
        'Test',
        { stream: 'true' },
        context,
        anthropicConfig,
        undefined,
        undefined,
        (d) => deltas.push(d)
      );

      expect(result.success).toBe(true);
      expect(result.output).toBe('文本');
      expect(deltas.join('')).toBe('文本');
      expect(mockAnthropicCreate.mock.calls.at(-1)?.[0]?.stream).toBe(true);
    });

    it('should treat stream: false as non-streaming', async () => {
      const result = await executeAIBlock(
        'Hello AI',
        { stream: 'false' },
        context,
        openaiConfig
      );
      expect(result.success).toBe(true);
      expect(result.output).toBe('Mocked AI response');
      expect(mockOpenAICreate.mock.calls.at(-1)?.[0]?.stream).toBeUndefined();
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

  describe('model presets', () => {
    it('should resolve model name from presets', async () => {
      const models = {
        fast: { model: 'gpt-4o-mini', temperature: 0.3 },
      };
      const result = await executeAIBlock(
        'Test',
        { model: 'fast' },
        context,
        openaiConfig,
        models
      );
      expect(result.success).toBe(true);
    });

    it('should send resolved preset model (not the preset name) to the API', async () => {
      const models = {
        fast: { model: 'gpt-4o-mini', temperature: 0.3 },
      };
      const result = await executeAIBlock(
        'Test',
        { model: 'fast' },
        context,
        openaiConfig,
        models
      );
      expect(result.success).toBe(true);
      const sentModel = mockOpenAICreate.mock.calls.at(-1)?.[0]?.model;
      expect(sentModel).toBe('gpt-4o-mini');
    });

    it('should send direct block model name when not a preset', async () => {
      const models = { fast: { model: 'gpt-4o-mini' } };
      const result = await executeAIBlock(
        'Test',
        { model: 'gpt-4o' },
        context,
        openaiConfig,
        models
      );
      expect(result.success).toBe(true);
      const sentModel = mockOpenAICreate.mock.calls.at(-1)?.[0]?.model;
      expect(sentModel).toBe('gpt-4o');
    });

    it('should fall back to direct model name if not in presets', async () => {
      const models = { fast: { model: 'gpt-4o-mini' } };
      const result = await executeAIBlock(
        'Test',
        { model: 'gpt-4o' },
        context,
        openaiConfig,
        models
      );
      expect(result.success).toBe(true);
    });

    it('should handle empty models config', async () => {
      const result = await executeAIBlock(
        'Test',
        { model: 'gpt-4o' },
        context,
        openaiConfig,
        undefined
      );
      expect(result.success).toBe(true);
    });
  });
});
