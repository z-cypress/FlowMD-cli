/**
 * agent 成本预估与预算确认（v2.0-beta）
 * 执行前按 goal + task + 工具描述 + max_steps 粗估 token，超阈值弹确认
 */

import { confirm } from '../../../utils/prompt.js';
import { t } from '../../../utils/i18n.js';

/** 预估输入参数 */
export interface CostEstimateParams {
  /** 任务目标 */
  goal: string;
  /** 渲染后的任务描述 */
  task: string;
  /** 全部工具描述拼接文本 */
  toolDescriptions: string;
  /** 最大步数 */
  maxSteps: number;
}

/** 预算检查参数 */
export interface CostBudgetParams extends CostEstimateParams {
  /** 预算上限（token），0 或负数 = 不限制 */
  limit: number;
  /** --yes 跳过确认 */
  yes?: boolean;
}

/**
 * 粗估 token 消耗
 * 启发式：perStep = (goal+task+工具描述)长度/4 + 400（system+tools 开销），
 * total = perStep × (maxSteps + 1)（含最终答案一步，取最坏情况）
 * @param params - 预估参数
 * @returns 预估 token 数
 */
export function estimateAgentTokens(params: CostEstimateParams): number {
  const { goal, task, toolDescriptions, maxSteps } = params;
  const perStep = Math.ceil((goal + task + toolDescriptions).length / 4) + 400;
  return perStep * (maxSteps + 1);
}

/**
 * 预算检查：超限时弹确认
 * @param params - 预算检查参数
 * @returns 是否放行
 */
export async function checkCostBudget(params: CostBudgetParams): Promise<boolean> {
  const { limit } = params;
  if (!limit || limit <= 0) return true;

  const estimated = estimateAgentTokens(params);
  if (estimated <= limit) return true;
  if (params.yes) return true;

  return confirm(t('agent.costPrompt', { estimated, limit }));
}
