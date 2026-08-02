/**
 * agent 块执行器单元测试
 * 覆盖配置校验、API Key、授权确认、循环装配、output 写入（loop/registry/confirm 层 mock）
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ExecutionContext } from '../core/context.js';

// 系统边界 mock：循环、注册表、确认、成本
const mockRunAgentLoop = vi.hoisted(() => vi.fn());
const mockEnsureAgentConfirmed = vi.hoisted(() => vi.fn());
const mockCheckCostBudget = vi.hoisted(() => vi.fn());

vi.mock('../core/blocks/agent/loop.js', () => ({
  runAgentLoop: mockRunAgentLoop,
  DEFAULT_MAX_STEPS: 10,
}));

vi.mock('../core/blocks/agent/tools/registry.js', () => ({
  createToolRegistry: vi.fn(() => new Map()),
}));

vi.mock('../core/blocks/agent/confirm.js', () => ({
  ensureAgentConfirmed: mockEnsureAgentConfirmed,
}));

vi.mock('../core/blocks/agent/cost.js', () => ({
  checkCostBudget: mockCheckCostBudget,
}));

// Import after mocks
const { executeAgentBlock } = await import('../core/blocks/agent/agent-block.js');
const { ExecutionContext } = await import('../core/context.js');

const llmConfig = {
  provider: 'openai' as const,
  apiKey: 'test-key',
  model: 'gpt-4o',
};

const agentResult = {
  success: true,
  output: '最终报告',
  steps: [{ stepNumber: 1, thought: 't', action: 'final_answer', observation: '', duration: 5 }],
  totalDuration: 100,
  tokenUsage: { input: 10, output: 5 },
};

describe('executeAgentBlock', () => {
  let context: ExecutionContext;

  beforeEach(() => {
    vi.clearAllMocks();
    context = new ExecutionContext();
    mockEnsureAgentConfirmed.mockResolvedValue(true);
    mockCheckCostBudget.mockResolvedValue(true);
  });

  it('should reject invalid config (missing goal)', async () => {
    const result = await executeAgentBlock('任务', { output: 'o' }, context, llmConfig);

    expect(result.success).toBe(false);
    expect(result.error).toContain('goal');
    expect(mockRunAgentLoop).not.toHaveBeenCalled();
  });

  it('should reject an unknown tool at parse time', async () => {
    const result = await executeAgentBlock(
      '任务',
      { goal: 'g', output: 'o', tools: ['unknown_tool'] },
      context,
      llmConfig
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('unknown_tool');
  });

  it('should reject missing API key', async () => {
    const result = await executeAgentBlock('任务', { goal: 'g', output: 'o' }, context, {
      provider: 'openai',
      apiKey: '',
      model: 'gpt-4o',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(mockRunAgentLoop).not.toHaveBeenCalled();
  });

  it('should return failure when confirmation is declined', async () => {
    mockEnsureAgentConfirmed.mockResolvedValue(false);

    const result = await executeAgentBlock('任务', { goal: 'g', output: 'o' }, context, llmConfig);

    expect(result.success).toBe(false);
    expect(mockRunAgentLoop).not.toHaveBeenCalled();
  });

  it('should run the loop and store the output variable', async () => {
    mockRunAgentLoop.mockResolvedValue(agentResult);

    const result = await executeAgentBlock('任务', { goal: 'g', output: 'report' }, context, llmConfig);

    expect(result.success).toBe(true);
    expect(context.get('report')).toBe('最终报告');
    expect(result.steps).toHaveLength(1);
    expect(mockEnsureAgentConfirmed).toHaveBeenCalledWith('g', [], undefined);
  });

  it('should render task variables from the context', async () => {
    mockRunAgentLoop.mockResolvedValue(agentResult);
    context.set('topic', 'AI');

    await executeAgentBlock('调研 {{topic}}', { goal: 'g', output: 'o' }, context, llmConfig);

    const params = mockRunAgentLoop.mock.calls[0][0];
    expect(params.goal).toBe('g');
    expect(params.task).toBe('调研 AI');
  });

  it('should pass max_steps / timeout / temperature / tools to the loop', async () => {
    mockRunAgentLoop.mockResolvedValue(agentResult);

    await executeAgentBlock('任务', {
      goal: 'g',
      output: 'o',
      tools: ['file_read'],
      max_steps: '5',
      timeout: '30',
      temperature: '0.2',
    }, context, llmConfig);

    const params = mockRunAgentLoop.mock.calls[0][0];
    expect(params.maxSteps).toBe(5);
    expect(params.timeoutMs).toBe(30000);
    expect(params.temperature).toBe(0.2);
    expect(params.tools instanceof Map).toBe(true);
  });

  it('should return failure result when the loop fails', async () => {
    mockRunAgentLoop.mockResolvedValue({
      success: false,
      output: '',
      error: 'agent 执行超时',
      steps: [],
      totalDuration: 100,
      tokenUsage: { input: 1, output: 1 },
    });

    const result = await executeAgentBlock('任务', { goal: 'g', output: 'o' }, context, llmConfig);

    expect(result.success).toBe(false);
    expect(result.output).toBeNull();
    expect(result.error).toBe('agent 执行超时');
    expect(context.get('o')).toBeUndefined();
  });

  it('should pass allowedDomains to the tool registry', async () => {
    mockRunAgentLoop.mockResolvedValue(agentResult);
    const { createToolRegistry } = await import('../core/blocks/agent/tools/registry.js');

    await executeAgentBlock('任务', { goal: 'g', output: 'o' }, context, llmConfig, undefined, undefined, {
      allowedDomains: ['api.example.com'],
    });

    expect(createToolRegistry).toHaveBeenCalledWith(
      expect.objectContaining({ allowedDomains: ['api.example.com'] })
    );
  });

  it('should pass searchEndpoint to the tool registry', async () => {
    mockRunAgentLoop.mockResolvedValue(agentResult);
    const { createToolRegistry } = await import('../core/blocks/agent/tools/registry.js');

    await executeAgentBlock('任务', { goal: 'g', output: 'o' }, context, llmConfig, undefined, undefined, {
      searchEndpoint: 'https://search.example.com/api',
    });

    expect(createToolRegistry).toHaveBeenCalledWith(
      expect.objectContaining({ searchEndpoint: 'https://search.example.com/api' })
    );
  });

  it('should fail when the cost budget check is declined', async () => {
    mockCheckCostBudget.mockResolvedValue(false);

    const result = await executeAgentBlock('任务', { goal: 'g', output: 'o' }, context, llmConfig, undefined, undefined, {
      maxEstimatedTokens: 1000,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(mockRunAgentLoop).not.toHaveBeenCalled();
  });

  it('should run the cost check with the estimated parameters', async () => {
    mockRunAgentLoop.mockResolvedValue(agentResult);

    await executeAgentBlock('任务描述', {
      goal: 'g', output: 'o', tools: ['file_read'], max_steps: '4',
    }, context, llmConfig, undefined, undefined, { maxEstimatedTokens: 5000 });

    const costParams = mockCheckCostBudget.mock.calls[0][0];
    expect(costParams.goal).toBe('g');
    expect(costParams.maxSteps).toBe(4);
    expect(costParams.limit).toBe(5000);
    // 注册表被 mock 为空 Map，工具描述为拼接字符串
    expect(typeof costParams.toolDescriptions).toBe('string');
  });
});
