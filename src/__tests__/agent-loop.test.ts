/**
 * agent ReAct 循环单元测试
 * 覆盖 openai/anthropic tool-use 分发、工具执行回填、终止条件、异常恢复（SDK 层 mock）
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LLMConfig } from '../types/index.js';
import type { ToolHandler } from '../core/blocks/agent/types.js';

// Hoisted spies：分别 mock 两家 SDK 的 create 调用
const mockOpenAICreate = vi.hoisted(() => vi.fn());
const mockAnthropicCreate = vi.hoisted(() => vi.fn());

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

// Import after mocks are set up
const { runAgentLoop } = await import('../core/blocks/agent/loop.js');
const { createToolRegistry } = await import('../core/blocks/agent/tools/registry.js');

const openaiConfig: LLMConfig = { provider: 'openai', apiKey: 'test-key', model: 'gpt-4o' };
const anthropicConfig: LLMConfig = { provider: 'anthropic', apiKey: 'test-key', model: 'claude-3-opus' };

/** 构造一个可控的假工具 */
function fakeTool(name = 'fake_tool'): ToolHandler {
  return {
    name,
    description: '一个假工具',
    inputSchema: { type: 'object', properties: { n: { type: 'number' } }, required: [] },
    execute: vi.fn(async (args: Record<string, unknown>) => ({ ok: true, result: `got:${String(args.n ?? 0)}` })),
  };
}

/** openai 最终答案响应 */
function openaiFinal(text: string, usage = { prompt_tokens: 10, completion_tokens: 5 }) {
  return { choices: [{ message: { content: text, tool_calls: null } }], usage };
}

/** openai 工具调用响应 */
function openaiToolCall(name: string, args: string, id = 'call_1') {
  return {
    choices: [{ message: { content: '思考中', tool_calls: [{ id, type: 'function', function: { name, arguments: args } }] } }],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  };
}

describe('runAgentLoop (openai)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return the final answer on a single turn', async () => {
    mockOpenAICreate.mockResolvedValueOnce(openaiFinal('调研完成'));

    const result = await runAgentLoop({
      goal: '调研',
      task: '收集信息',
      config: openaiConfig,
      tools: new Map(),
    });

    expect(result.success).toBe(true);
    expect(result.output).toBe('调研完成');
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].action).toBe('final_answer');
    expect(result.tokenUsage.input).toBe(10);
    expect(result.tokenUsage.output).toBe(5);
  });

  it('should route tool calls and continue until final answer', async () => {
    mockOpenAICreate
      .mockResolvedValueOnce(openaiToolCall('code_execution', JSON.stringify({ runtime: 'js', script: 'console.log(6*7)' })))
      .mockResolvedValueOnce(openaiFinal('结果是 42'));

    const registry = createToolRegistry({ projectRoot: process.cwd() });
    const result = await runAgentLoop({
      goal: '计算',
      task: '算 6*7',
      config: openaiConfig,
      tools: registry,
    });

    expect(result.success).toBe(true);
    expect(result.output).toBe('结果是 42');
    expect(result.steps).toHaveLength(2);
    // 第一步观察应包含真实沙箱输出 42
    expect(result.steps[0].observation).toContain('42');
    expect(result.steps[0].action).toContain('code_execution');
  });

  it('should execute declared tools via the registry', async () => {
    const tool = fakeTool();
    mockOpenAICreate
      .mockResolvedValueOnce(openaiToolCall('fake_tool', JSON.stringify({ n: 7 })))
      .mockResolvedValueOnce(openaiFinal('done'));

    const result = await runAgentLoop({
      goal: 'g', task: 't', config: openaiConfig,
      tools: new Map([['fake_tool', tool]]),
    });

    expect(result.success).toBe(true);
    expect(tool.execute).toHaveBeenCalledWith({ n: 7 });
    expect(result.steps[0].observation).toBe('got:7');
  });

  it('should tolerate an unknown tool by recording the error as observation', async () => {
    mockOpenAICreate
      .mockResolvedValueOnce(openaiToolCall('nonexistent', '{}', 'call_x'))
      .mockResolvedValueOnce(openaiFinal('继续完成'));

    const result = await runAgentLoop({
      goal: 'g', task: 't', config: openaiConfig,
      tools: new Map(),
    });

    expect(result.success).toBe(true);
    expect(result.output).toBe('继续完成');
    expect(result.steps[0].observation).toContain('unknown tool');
  });

  it('should tolerate illegal tool arguments (parse failure) and continue', async () => {
    mockOpenAICreate
      .mockResolvedValueOnce(openaiToolCall('code_execution', 'not-json'))
      .mockResolvedValueOnce(openaiFinal('ok'));

    const registry = createToolRegistry({ projectRoot: process.cwd() });
    const result = await runAgentLoop({
      goal: 'g', task: 't', config: openaiConfig, tools: registry,
    });

    expect(result.success).toBe(true);
    // 参数解析失败 → 空对象 → code_execution 缺 script → 观察为错误，循环继续
    expect(result.steps[0].observation).toContain('error');
  });

  it('should fail when max_steps is exhausted', async () => {
    mockOpenAICreate.mockResolvedValue(openaiToolCall('fake_tool', JSON.stringify({ n: 1 })));

    const result = await runAgentLoop({
      goal: 'g', task: 't', config: openaiConfig,
      tools: new Map([['fake_tool', fakeTool()]]),
      maxSteps: 3,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('3');
    expect(mockOpenAICreate).toHaveBeenCalledTimes(3);
  });

  it('should abort immediately when signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    const result = await runAgentLoop({
      goal: 'g', task: 't', config: openaiConfig,
      tools: new Map(), signal: controller.signal,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(mockOpenAICreate).not.toHaveBeenCalled();
  });
});

describe('runAgentLoop (anthropic)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should translate tool_use and merge tool_result into a single user message', async () => {
    mockAnthropicCreate
      .mockResolvedValueOnce({
        content: [{ type: 'tool_use', id: 'toolu_1', name: 'fake_tool', input: { n: 5 } }],
        usage: { input_tokens: 10, output_tokens: 5 },
      })
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: 'anthropic 完成' }],
        usage: { input_tokens: 20, output_tokens: 5 },
      });

    const result = await runAgentLoop({
      goal: 'g', task: 't', config: anthropicConfig,
      tools: new Map([['fake_tool', fakeTool()]]),
    });

    expect(result.success).toBe(true);
    expect(result.output).toBe('anthropic 完成');

    // 第二轮调用：消息含 tool_result（已合并进单条 user 消息）
    const secondCall = mockAnthropicCreate.mock.calls[1][0];
    const lastMessage = secondCall.messages[secondCall.messages.length - 1];
    expect(lastMessage.role).toBe('user');
    expect(lastMessage.content[0].type).toBe('tool_result');
    expect(lastMessage.content[0].tool_use_id).toBe('toolu_1');
  });

  it('should fail on max_steps for anthropic too', async () => {
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: 'tool_use', id: 'toolu_1', name: 'fake_tool', input: { n: 1 } }],
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    const result = await runAgentLoop({
      goal: 'g', task: 't', config: anthropicConfig,
      tools: new Map([['fake_tool', fakeTool()]]),
      maxSteps: 2,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('2');
  });
});
