/**
 * agent 块端到端测试
 * 真实链路：parse → executor → agent-block → loop（SDK mock）→ context → 后续块渲染
 * 覆盖：agent 输出被后续引用、if/for 指令区内 agent、debug 轨迹
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RunOptions, FlowConfig } from '../types/index.js';

// SDK 层 mock（真实 agent-block/loop/registry 链路）
const mockOpenAICreate = vi.hoisted(() => vi.fn());

vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = { completions: { create: mockOpenAICreate } };
    constructor() {}
  },
}));

// 避免 spinner 与 history 副作用
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

const { executeDocument } = await import('../core/executor.js');
const { parseMarkdown } = await import('../core/parser.js');

function fullOptions(overrides: Partial<RunOptions> = {}): RunOptions {
  return {
    output: 'stdout',
    dryRun: false,
    stepMode: false,
    failFast: false,
    debug: false,
    release: false,
    quiet: true,
    varArgs: {},
    runYes: true,
    ...overrides,
  };
}

const config: FlowConfig = {
  llm: { provider: 'openai', apiKey: 'test-key', model: 'gpt-4o' },
  dataSources: {},
  execution: { timeout: 60 },
};

function openaiFinal(text: string) {
  return { choices: [{ message: { content: text, tool_calls: null } }], usage: { prompt_tokens: 5, completion_tokens: 3 } };
}

describe('agent block end-to-end', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should let a subsequent block reference the agent output', async () => {
    mockOpenAICreate.mockResolvedValueOnce(openaiFinal('42'));

    const doc = parseMarkdown(`# 计算任务

\`\`\`agent {goal: "计算", output: "answer"}
计算 6*7
\`\`\`

答案是：{{answer}}
`);

    const result = await executeDocument(doc, fullOptions(), config);

    expect(mockOpenAICreate).toHaveBeenCalledOnce();
    expect(result.content).toContain('答案是：42');
  });

  it('should render agent output through a template block', async () => {
    mockOpenAICreate.mockResolvedValueOnce(openaiFinal('调研完成'));

    const doc = parseMarkdown(`\`\`\`agent {goal: "调研", output: "summary"}
调研主题
\`\`\`

\`\`\`template {output: "report"}
结果：{{summary}}
\`\`\`

最终：{{report}}
`);

    const result = await executeDocument(doc, fullOptions(), config);

    expect(result.content).toContain('最终：结果：调研完成');
  });

  it('should execute an agent inside a true if region', async () => {
    mockOpenAICreate.mockResolvedValueOnce(openaiFinal('分支内的 agent 结果'));

    const doc = parseMarkdown(`<!-- if: {{enabled}} -->
\`\`\`agent {goal: "执行", output: "branch"}
做分支任务
\`\`\`

分支输出：{{branch}}
<!-- endif -->
`);

    const result = await executeDocument(doc, fullOptions({ varArgs: { enabled: 'true' } }), config);

    expect(result.content).toContain('分支输出：分支内的 agent 结果');
  });

  it('should not execute an agent inside a false if region', async () => {
    const doc = parseMarkdown(`<!-- if: {{enabled}} -->
\`\`\`agent {goal: "执行", output: "branch"}
做分支任务
\`\`\`

分支输出：{{branch}}
<!-- endif -->
`);

    // 空字符串按真值规则视为 falsy（ADR-004）
    const result = await executeDocument(doc, fullOptions({ varArgs: { enabled: '' } }), config);

    expect(mockOpenAICreate).not.toHaveBeenCalled();
    expect(result.content).not.toContain('分支内的 agent 结果');
  });

  it('should run an agent inside a for region once per iteration', async () => {
    mockOpenAICreate.mockResolvedValue(openaiFinal('每轮答案'));

    const doc = parseMarkdown(`<!-- for: item in items -->
\`\`\`agent {goal: "处理", output: "per_item"}
处理 {{item}}
\`\`\`

{{per_item}}
<!-- endfor -->
`);

    const result = await executeDocument(doc, fullOptions({ varArgs: { items: JSON.stringify(['a', 'b', 'c']) } }), config);

    expect(mockOpenAICreate).toHaveBeenCalledTimes(3);
    expect(result.content).toContain('每轮答案');
  });

  it('should include the step trace in debug output', async () => {
    mockOpenAICreate.mockResolvedValueOnce(openaiFinal('最终结果'));

    const doc = parseMarkdown(`\`\`\`agent {goal: "调研", output: "r"}
任务
\`\`\`
`);

    const result = await executeDocument(doc, fullOptions({ debug: true }), config);

    expect(result.content).toContain('最终结果');
    expect(result.content).toContain('agent 步骤轨迹');
  });
});
