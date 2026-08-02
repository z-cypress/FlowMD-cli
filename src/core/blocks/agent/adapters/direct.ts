/**
 * agent 适配器：direct（单次 LLM 调用，无工具）
 * 适合简单生成/总结任务，成本低、确定性高（ADR-020）
 */

import { getErrorMessage } from '../../../../utils/error-formatter.js';
import { runAgentTurn } from './chat.js';
import type { AgentAdapter } from '../types.js';

/**
 * 创建 direct 适配器
 * @returns 适配器
 */
export function createDirectAdapter(): AgentAdapter {
  return {
    name: 'direct',
    description: '单次 LLM 调用，无工具（适合简单生成/总结任务）',
    async execute(params) {
      const startTime = Date.now();
      const system = `你是 FlowMD agent。任务目标：${params.goal}\n直接给出最终答案，无需调用工具。`;
      try {
        const turn = await runAgentTurn({
          system,
          messages: [{ role: 'user', content: params.task }],
          tools: [],
          config: params.config,
          temperature: params.temperature,
          signal: params.signal,
        });
        const step = {
          stepNumber: 1,
          thought: turn.thought,
          action: 'final_answer',
          observation: '',
          duration: Date.now() - startTime,
        };
        params.onStep?.(step);
        return {
          success: true,
          output: turn.thought,
          steps: [step],
          totalDuration: Date.now() - startTime,
          tokenUsage: turn.usage,
        };
      } catch (error) {
        return {
          success: false,
          output: '',
          error: getErrorMessage(error),
          steps: [],
          totalDuration: Date.now() - startTime,
          tokenUsage: { input: 0, output: 0 },
        };
      }
    },
  };
}
