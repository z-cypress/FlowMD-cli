/**
 * agent 成本预估与预算确认单元测试
 * 覆盖估算函数与超限确认（prompt 层 mock）
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { estimateAgentTokens, checkCostBudget } from '../core/blocks/agent/cost.js';

const mockConfirm = vi.hoisted(() => vi.fn());

vi.mock('../utils/prompt.js', () => ({
  confirm: mockConfirm,
  askQuestion: vi.fn(),
}));

describe('estimateAgentTokens', () => {
  it('should scale with prompt length and steps', () => {
    const base = estimateAgentTokens({ goal: 'g', task: 't', toolDescriptions: 'd', maxSteps: 1 });
    const bigger = estimateAgentTokens({ goal: 'g', task: 't'.repeat(400), toolDescriptions: 'd', maxSteps: 1 });
    const moreSteps = estimateAgentTokens({ goal: 'g', task: 't', toolDescriptions: 'd', maxSteps: 5 });

    expect(bigger).toBeGreaterThan(base);
    expect(moreSteps).toBeGreaterThan(base);
  });
});

describe('checkCostBudget', () => {
  const params = { goal: 'g', task: 't', toolDescriptions: 'd', maxSteps: 1, limit: 100000 };

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfirm.mockResolvedValue(true);
  });

  it('should pass immediately when no limit is set', async () => {
    expect(await checkCostBudget({ ...params, limit: 0 })).toBe(true);
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('should pass without prompting when under the limit', async () => {
    expect(await checkCostBudget(params)).toBe(true);
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('should prompt when the estimate exceeds the limit and accept', async () => {
    mockConfirm.mockResolvedValue(true);
    const ok = await checkCostBudget({ ...params, limit: 1 });

    expect(mockConfirm).toHaveBeenCalledOnce();
    expect(ok).toBe(true);
  });

  it('should fail when the estimate exceeds the limit and user declines', async () => {
    mockConfirm.mockResolvedValue(false);
    const ok = await checkCostBudget({ ...params, limit: 1 });

    expect(ok).toBe(false);
  });

  it('should skip the prompt with --yes even when over the limit', async () => {
    const ok = await checkCostBudget({ ...params, limit: 1, yes: true });

    expect(ok).toBe(true);
    expect(mockConfirm).not.toHaveBeenCalled();
  });
});
