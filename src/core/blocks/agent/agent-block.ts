/**
 * agent 块执行器
 * 装配：配置校验 → LLM 配置解析 → 工具注册表 → ReAct 循环 → 结果写入
 */

import type { ExecutionContext } from '../../context.js';
import type { LLMConfig, BlockResult } from '../../../types/index.js';
import { t } from '../../../utils/i18n.js';
import { validateAgentConfig } from './validate.js';
import { runAgentLoop, DEFAULT_MAX_STEPS } from './loop.js';
import { createToolRegistry } from './tools/registry.js';
import { ensureAgentConfirmed } from './confirm.js';
import { checkCostBudget } from './cost.js';
import type { AgentStep, AgentBlockConfig } from './types.js';

/** agent 块执行选项 */
export interface AgentExecuteOptions {
  /** --yes / --strict 确认标志 */
  confirm?: { yes?: boolean; strict?: boolean };
  /** 项目根目录（file_read / file_write 安全边界） */
  projectRoot?: string;
  /** api_call 域名白名单 */
  allowedDomains?: string[];
  /** 成本预估上限（token），0 = 不限制 */
  maxEstimatedTokens?: number;
  /** web_search 搜索 endpoint */
  searchEndpoint?: string;
  /** 每步回调（进度 UI） */
  onStep?: (step: AgentStep) => void;
  /** debug 模式：结果附带步骤轨迹 */
  debug?: boolean;
}

/**
 * 解析 agent 块的实际 LLM 配置：块级 provider → 全局默认
 * provider 切换时自动解析对应环境变量 API Key
 * @param config - agent 块配置
 * @param llmConfig - 全局 LLM 配置
 * @returns 解析后的 LLM 配置
 */
function resolveAgentLLMConfig(
  config: AgentBlockConfig,
  llmConfig: LLMConfig
): LLMConfig {
  const resolved = { ...llmConfig };
  if (config.provider) {
    resolved.provider = config.provider as 'openai' | 'anthropic';
    if (config.provider !== llmConfig.provider) {
      resolved.apiKey = config.provider === 'openai'
        ? (process.env.OPENAI_API_KEY || '')
        : (process.env.ANTHROPIC_API_KEY || '');
    }
  }
  return resolved;
}

/**
 * 从 meta 归一化为 AgentBlockConfig
 * @param meta - 块元数据
 * @returns 归一化配置
 */
function toAgentConfig(meta: Record<string, string | string[]>): AgentBlockConfig {
  const num = (v: string | string[] | undefined): number | undefined => {
    if (typeof v !== 'string' || v.trim() === '') return undefined;
    const n = Number(v);
    return Number.isNaN(n) ? undefined : n;
  };
  const str = (v: string | string[] | undefined): string | undefined =>
    typeof v === 'string' ? v : Array.isArray(v) ? v[0] : undefined;
  return {
    goal: str(meta.goal),
    output: str(meta.output),
    provider: str(meta.provider),
    tools: Array.isArray(meta.tools) ? meta.tools : typeof meta.tools === 'string' && meta.tools.trim() ? [meta.tools] : [],
    max_steps: num(meta.max_steps),
    timeout: num(meta.timeout),
    temperature: num(meta.temperature),
  };
}

/**
 * 执行 agent 块
 * @param content - 任务描述（含 {{变量}}）
 * @param meta - 块元数据
 * @param context - 变量上下文
 * @param llmConfig - 全局 LLM 配置
 * @param models - 命名模型预设（预留，agent 块按 provider 解析）
 * @param signal - 中止信号
 * @param options - 执行选项
 * @returns 块执行结果
 */
export async function executeAgentBlock(
  content: string,
  meta: Record<string, string | string[]>,
  context: ExecutionContext,
  llmConfig: LLMConfig,
  models?: Record<string, Partial<LLMConfig>>,
  signal?: AbortSignal,
  options?: AgentExecuteOptions
): Promise<BlockResult> {
  const startTime = Date.now();

  // 1. 配置校验（goal/output 必填、provider/tools/数值白名单）
  const errors = validateAgentConfig(meta);
  if (errors.length > 0) {
    return { success: false, output: null, error: errors.join('; '), duration: Date.now() - startTime };
  }

  const config = toAgentConfig(meta);
  const goal = config.goal!;

  // 2. 解析 LLM 配置并校验 API Key
  const resolved = resolveAgentLLMConfig(config, llmConfig);
  if (!resolved.apiKey) {
    return {
      success: false,
      output: null,
      error: t('error.ai.noApiKey', { envVar: resolved.provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY' }),
      duration: Date.now() - startTime,
    };
  }

  // 2.5 首次执行授权确认（ADR-016；--yes / --strict 复用 run 确认语义）
  const confirmed = await ensureAgentConfirmed(goal, config.tools ?? [], options?.confirm);
  if (!confirmed) {
    return {
      success: false,
      output: null,
      error: t('error.agent.confirmDeclined'),
      duration: Date.now() - startTime,
    };
  }

  // 3. 渲染任务描述中的变量
  const task = context.render(content);

  // 4. 工具注册表（projectRoot 决定 file_read / file_write 安全边界）
  const registry = createToolRegistry({
    projectRoot: options?.projectRoot ?? process.cwd(),
    signal,
    allowedDomains: options?.allowedDomains,
    searchEndpoint: options?.searchEndpoint,
  });

  // 4.5 成本预估确认（超阈值弹确认，拒绝则失败）
  const toolDescriptions = [...registry.values()].map((tool) => tool.description).join('\n');
  const costOk = await checkCostBudget({
    goal,
    task,
    toolDescriptions,
    maxSteps: config.max_steps ?? DEFAULT_MAX_STEPS,
    limit: options?.maxEstimatedTokens ?? 0,
    yes: options?.confirm?.yes,
  });
  if (!costOk) {
    return {
      success: false,
      output: null,
      error: t('error.agent.costDeclined'),
      duration: Date.now() - startTime,
    };
  }

  // 5. ReAct 循环执行
  const result = await runAgentLoop({
    goal,
    task,
    config: resolved,
    temperature: config.temperature,
    tools: registry,
    maxSteps: config.max_steps ?? DEFAULT_MAX_STEPS,
    timeoutMs: config.timeout ? config.timeout * 1000 : 0,
    signal,
    onStep: options?.onStep,
  });

  // 6. 成功时写入 output 变量（ADR-017）
  if (result.success && config.output) {
    context.set(config.output, result.output);
  }

  return {
    success: result.success,
    output: result.success ? result.output : null,
    error: result.error,
    duration: result.totalDuration || Date.now() - startTime,
    steps: result.steps,
  };
}

/** 截断长文本 */
function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '...' : text;
}

/**
 * 格式化单步信息（spinner 文本）
 * @param step - 单步轨迹
 * @returns 短文本
 */
export function formatAgentStep(step: AgentStep): string {
  return `${t('agent.step', { num: step.stepNumber })} ${step.action}`;
}

/**
 * 格式化步骤轨迹（debug 模式插入）
 * @param result - 块执行结果
 * @returns 轨迹 Markdown 或空字符串
 */
export function formatAgentTrace(result: BlockResult): string {
  const steps = result.steps;
  if (!steps || steps.length === 0) return '';
  const lines = steps.map((s) =>
    `> ${s.stepNumber}. ${s.action}\n>   观察: ${truncate(s.observation || '(无)', 200)}`
  );
  return `\n\n> 🕵️ agent 步骤轨迹:\n${lines.join('\n')}\n`;
}

/**
 * 格式化轨迹摘要（history 记录）
 * @param steps - 步骤轨迹
 * @returns 摘要文本
 */
export function formatAgentTraceSummary(steps: AgentStep[]): string {
  return steps.map((s) => `${s.stepNumber}:${s.action}`).join(' | ');
}
