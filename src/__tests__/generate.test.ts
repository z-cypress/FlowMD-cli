/**
 * 自然语言生成文档模块测试
 * 覆盖 openai/anthropic 分发、provider/model 覆盖、API Key 缺失（SDK 与 config mock）
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { LLMConfig } from '../types/index.js';

const mockOpenAICreate = vi.hoisted(() => vi.fn());
const mockAnthropicCreate = vi.hoisted(() => vi.fn());
const mockLlmConfig = vi.hoisted(() => ({
  provider: 'openai',
  apiKey: 'test-key',
  model: 'gpt-4o',
}));

vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = { completions: { create: mockOpenAICreate } };
    constructor() {}
  },
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: mockAnthropicCreate };
    constructor() {}
  },
}));

vi.mock('../utils/config.js', () => ({
  getLLMConfig: (): LLMConfig => ({ ...mockLlmConfig }),
}));

const { generateDocument } = await import('../core/generate.js');

describe('generateDocument', () => {
  const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLlmConfig.provider = 'openai';
    mockLlmConfig.apiKey = 'test-key';
    mockLlmConfig.model = 'gpt-4o';
    process.env.ANTHROPIC_API_KEY = 'anthropic-key';
  });

  afterEach(() => {
    if (originalAnthropicKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
  });

  it('should generate a document via openai with the description', async () => {
    mockOpenAICreate.mockResolvedValueOnce({ choices: [{ message: { content: '# 周报\n```ai\n内容\n```' } }] });

    const doc = await generateDocument('生成一份周报');

    expect(doc).toContain('# 周报');
    const [request] = mockOpenAICreate.mock.calls[0];
    expect(request.messages[0].role).toBe('system');
    expect(request.messages[1]).toEqual({ role: 'user', content: '生成一份周报' });
    expect(request.model).toBe('gpt-4o');
  });

  it('should override the model', async () => {
    mockOpenAICreate.mockResolvedValueOnce({ choices: [{ message: { content: 'x' } }] });

    await generateDocument('描述', { model: 'gpt-4o-mini' });

    expect(mockOpenAICreate.mock.calls[0][0].model).toBe('gpt-4o-mini');
  });

  it('should generate via anthropic when provider is overridden', async () => {
    mockAnthropicCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: '# 调研报告' }],
    });

    const doc = await generateDocument('调研', { provider: 'anthropic', model: 'claude-3-opus' });

    expect(doc).toBe('# 调研报告');
    const [request] = mockAnthropicCreate.mock.calls[0];
    expect(request.system).toBeDefined();
    expect(request.messages[0].content).toBe('调研');
    expect(request.model).toBe('claude-3-opus');
  });

  it('should throw a clear error when the API key is missing', async () => {
    mockLlmConfig.apiKey = '';

    await expect(generateDocument('描述')).rejects.toThrow('API Key');
  });

  it('should return empty content when the LLM returns nothing', async () => {
    mockOpenAICreate.mockResolvedValueOnce({ choices: [{ message: { content: '' } }] });

    expect(await generateDocument('描述')).toBe('');
  });
});
