/**
 * agent ReAct 循环（ADR-015）
 * 思考 → 选工具 → 执行 → 观察，迭代直到最终答案 / max_steps / 超时 / 中止
 */

import { getErrorMessage } from '../../../utils/error-formatter.js';
import { t } from '../../../utils/i18n.js';
import type { LLMConfig } from '../../../types/index.js';
import { runAgentTurn } from './adapters/chat.js';
import type { TurnMessage, ToolSpec } from './adapters/chat.js';
import type { AgentResult, AgentStep, ToolHandler } from './types.js';

/** 循环执行参数 */
export interface AgentLoopParams {
  /** 任务目标（必填，校验通过） */
  goal: string;
  /** 任务描述（渲染后的块内容） */
  task: string;
  /** 已解析的 LLM 配置 */
  config: LLMConfig;
  /** 决策温度 */
  temperature?: number;
  /** 工具注册表 */
  tools: Map<string, ToolHandler>;
  /** 最大执行步数（默认 10） */
  maxSteps?: number;
  /** 整体超时毫秒（默认 0 = 不限） */
  timeoutMs?: number;
  /** 外部中止信号 */
  signal?: AbortSignal;
  /** 每步完成回调（进度 UI） */
  onStep?: (step: AgentStep) => void;
}

/** 默认最大步数 */
export const DEFAULT_MAX_STEPS = 10;

/**
 * 构建 system prompt：goal + 工具能力清单
 * @param goal - 任务目标
 * @param tools - 工具注册表
 * @returns system prompt
 */
function buildSystemPrompt(goal: string, tools: Map<string, ToolHandler>): string {
  const lines = [
    '你是 FlowMD 文档中的 agent，负责自主完成一个任务。',
    `任务目标：${goal}`,
    '',
    '可用工具：',
  ];
  if (tools.size === 0) {
    lines.push('（无工具，直接推理并给出最终答案）');
  } else {
    for (const tool of tools.values()) {
      lines.push(`- ${tool.name}: ${tool.description}`);
    }
  }
  lines.push(
    '',
    '工作方式：',
    '1. 需要信息或计算时，先调用工具，再根据工具结果继续推理',
    '2. 一次调用可以包含多个工具请求，但每个请求参数必须完整',
    '3. 工具不可用或出错时，根据观察结果调整策略',
    '4. 达成目标后停止调用工具，直接给出最终答案',
    '5. 最终答案应为完整、可直接使用的文本（报告 / JSON / 摘要）',
  );
  return lines.join('\n');
}

/**
 * 把注册表转成 LLM tools 声明
 * @param tools - 工具注册表
 * @returns 工具定义列表
 */
function buildToolSpecs(tools: Map<string, ToolHandler>): ToolSpec[] {
  const specs: ToolSpec[] = [];
  for (const tool of tools.values()) {
    specs.push({
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema ?? { type: 'object', properties: {} },
    });
  }
  return specs;
}

/**
 * 执行 agent ReAct 循环
 * @param params - 循环参数
 * @returns agent 块执行结果
 */
export async function runAgentLoop(params: AgentLoopParams): Promise<AgentResult> {
  const {
    goal, task, config, tools,
    maxSteps = DEFAULT_MAX_STEPS, timeoutMs = 0, signal, onStep,
  } = params;

  const startTime = Date.now();
  const steps: AgentStep[] = [];
  const usage = { input: 0, output: 0 };
  const messages: TurnMessage[] = [{ role: 'user', content: task }];
  const system = buildSystemPrompt(goal, tools);
  const toolSpecs = buildToolSpecs(tools);

  const controller = new AbortController();
  const abortTimer = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;
  const onExternalAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onExternalAbort, { once: true });
  }

  const totalDuration = () => Date.now() - startTime;

  try {
    for (let step = 0; ; step++) {
      if (controller.signal.aborted) {
        return {
          success: false, output: '', error: t('error.agent.timeout'),
          steps, totalDuration: totalDuration(), tokenUsage: usage,
        };
      }

      const turn = await runAgentTurn({
        system, messages, tools: toolSpecs, config,
        temperature: params.temperature, signal: controller.signal,
      });
      usage.input += turn.usage.input;
      usage.output += turn.usage.output;

      // 无工具调用 = 最终答案
      if (turn.toolCalls.length === 0) {
        const finalStep: AgentStep = {
          stepNumber: step + 1,
          thought: turn.thought,
          action: 'final_answer',
          observation: '',
          duration: 0,
        };
        steps.push(finalStep);
        onStep?.(finalStep);
        return {
          success: true, output: turn.thought,
          steps, totalDuration: totalDuration(), tokenUsage: usage,
        };
      }

      // 记录助手消息（含工具调用），执行工具并回填观察
      messages.push({ role: 'assistant', content: turn.thought, toolCalls: turn.toolCalls });

      for (const tc of turn.toolCalls) {
        const tool = tools.get(tc.name);
        const toolStart = Date.now();
        let observation: string;
        if (!tool) {
          observation = `error: unknown tool "${tc.name}"`;
        } else {
          try {
            const result = await tool.execute(tc.arguments);
            observation = result.ok ? (result.result ?? '(empty)') : `error: ${result.error}`;
          } catch (err) {
            observation = `error: ${getErrorMessage(err)}`;
          }
        }
        messages.push({ role: 'tool', toolCallId: tc.id, content: observation });

        const agentStep: AgentStep = {
          stepNumber: step + 1,
          thought: turn.thought,
          action: `call ${tc.name}(${JSON.stringify(tc.arguments)})`,
          observation,
          duration: Date.now() - toolStart,
        };
        steps.push(agentStep);
        onStep?.(agentStep);
      }

      if (step + 1 >= maxSteps) {
        return {
          success: false, output: '', error: t('error.agent.maxSteps', { maxSteps }),
          steps, totalDuration: totalDuration(), tokenUsage: usage,
        };
      }
    }
  } catch (err) {
    if (controller.signal.aborted) {
      return {
        success: false, output: '', error: t('error.agent.timeout'),
        steps, totalDuration: totalDuration(), tokenUsage: usage,
      };
    }
    return {
      success: false, output: '', error: getErrorMessage(err),
      steps, totalDuration: totalDuration(), tokenUsage: usage,
    };
  } finally {
    if (abortTimer) clearTimeout(abortTimer);
    if (signal) signal.removeEventListener('abort', onExternalAbort);
  }
}
