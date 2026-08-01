/**
 * agent 块执行器集成测试（executor 层）
 * 覆盖分发、output 写入、debug 轨迹插入、块记录 trace、依赖跳过、模式兼容（agent-block 层 mock）
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ExecutableBlock, RunOptions, FlowConfig } from '../types/index.js';
import type { BlockExecState } from '../core/executor.js';

// agent-block 层是系统边界（内部会调 LLM），这里 mock 掉并保留格式化导出
const mockExecuteAgentBlock = vi.hoisted(() => vi.fn());

vi.mock('../core/blocks/agent/agent-block.js', () => ({
  executeAgentBlock: mockExecuteAgentBlock,
  formatAgentStep: (s: { stepNumber: number; action: string }) => `步骤 ${s.stepNumber}: ${s.action}`,
  formatAgentTrace: (r: { steps?: Array<{ stepNumber: number }> }) =>
    r.steps && r.steps.length > 0 ? `\n\n> 轨迹:${r.steps.length} 步\n` : '',
  formatAgentTraceSummary: (steps: Array<{ action: string }>) => steps.map((s) => s.action).join('|'),
}));

// Mock ora 与 history，避免副作用
vi.mock('ora', () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    text: '',
  })),
}));

vi.mock('../utils/history.js', () => ({
  recordExecution: vi.fn(),
}));

const { executeOneBlock } = await import('../core/executor.js');
const { ExecutionContext } = await import('../core/context.js');

const sampleStep = {
  stepNumber: 1, thought: '思考', action: 'final_answer', observation: '', duration: 10,
};

function makeBlock(overrides: Partial<ExecutableBlock> = {}): ExecutableBlock {
  return {
    type: 'agent',
    content: '任务描述',
    lang: 'agent {goal: "调研", output: "report"}',
    meta: { goal: '调研', output: 'report' },
    position: 0,
    sourceStart: 0,
    sourceEnd: 20,
    ...overrides,
  };
}

function makeState(options: Partial<RunOptions> = {}): BlockExecState {
  return {
    context: new ExecutionContext(),
    options: {
      output: 'stdout',
      dryRun: false,
      stepMode: false,
      failFast: false,
      debug: false,
      release: false,
      quiet: true,
      varArgs: {},
      ...options,
    } as RunOptions,
    config: {
      llm: { provider: 'openai', apiKey: 'k', model: 'gpt-4o' },
      dataSources: {},
      execution: { timeout: 60 },
    } as FlowConfig,
    visitedPaths: new Set(),
    failedOutputs: new Set(),
    failedBlocks: [],
    blockRecords: [],
    insertResults: [],
    hasError: false,
    totalBlocks: 1,
  };
}

describe('executeOneBlock (agent)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should dispatch agent blocks and store the output variable', async () => {
    mockExecuteAgentBlock.mockImplementation(
      (_content: string, meta: Record<string, string>, context: ExecutionContext) => {
        context.set(String(meta.output), '最终报告');
        return Promise.resolve({
          success: true, output: '最终报告', duration: 100, steps: [sampleStep],
        });
      }
    );

    const state = makeState();
    const { action } = await executeOneBlock(makeBlock(), state);

    expect(action).toBe('continue');
    expect(mockExecuteAgentBlock).toHaveBeenCalledOnce();
    expect(state.context.get('report')).toBe('最终报告');
    // 传入 LLM 配置与 projectRoot
    const [, , , llmConfig, , , options] = mockExecuteAgentBlock.mock.calls[0];
    expect(llmConfig.model).toBe('gpt-4o');
    expect(options.projectRoot).toBe(process.cwd());
  });

  it('should skip execution in dry-run mode', async () => {
    const state = makeState({ dryRun: true });
    await executeOneBlock(makeBlock(), state);

    expect(mockExecuteAgentBlock).not.toHaveBeenCalled();
  });

  it('should insert a step trace in debug mode', async () => {
    mockExecuteAgentBlock.mockResolvedValue({
      success: true, output: '结果', duration: 50, steps: [sampleStep],
    });

    const state = makeState({ debug: true });
    await executeOneBlock(makeBlock(), state);

    expect(state.insertResults).toHaveLength(1);
    expect(state.insertResults[0].output).toContain('结果');
    expect(state.insertResults[0].output).toContain('轨迹');
  });

  it('should record the trace summary in block records', async () => {
    mockExecuteAgentBlock.mockResolvedValue({
      success: true, output: '结果', duration: 50, steps: [sampleStep],
    });

    const state = makeState();
    await executeOneBlock(makeBlock(), state);

    expect(state.blockRecords[0].trace).toContain('final_answer');
  });

  it('should skip an agent block whose dependency failed', async () => {
    const state = makeState();
    state.failedOutputs.add('input_data');
    const block = makeBlock({ content: '任务描述 {{input_data}}' });

    await executeOneBlock(block, state);

    expect(mockExecuteAgentBlock).not.toHaveBeenCalled();
  });

  it('should stop on fail-fast when the agent fails', async () => {
    mockExecuteAgentBlock.mockResolvedValue({
      success: false, output: null, error: 'boom', duration: 20,
    });

    const state = makeState({ failFast: true });
    const { action } = await executeOneBlock(makeBlock(), state);

    expect(action).toBe('stop');
    expect(state.hasError).toBe(true);
  });

  it('should continue on failure when fail-fast is disabled', async () => {
    mockExecuteAgentBlock.mockResolvedValue({
      success: false, output: null, error: 'boom', duration: 20,
    });

    const state = makeState();
    const { action } = await executeOneBlock(makeBlock(), state);

    expect(action).toBe('continue');
    expect(state.failedBlocks).toHaveLength(1);
  });
});
