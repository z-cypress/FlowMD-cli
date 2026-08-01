/**
 * FlowMD agent 块类型定义
 */

/** agent 块配置（块元数据解析后，见 ADR-015） */
export interface AgentBlockConfig {
  /** 任务目标（必填） */
  goal?: string;
  /** LLM 提供商：openai | anthropic（默认取全局配置） */
  provider?: string;
  /** 允许的工具白名单（ADR-016） */
  tools?: string[];
  /** 输出变量名（必填） */
  output?: string;
  /** 最大执行步数（默认 10） */
  max_steps?: number;
  /** 整体超时秒数（默认 120） */
  timeout?: number;
  /** agent 决策温度（默认 0.5） */
  temperature?: number;
}

/** 归一化后的工具调用（openai function_call / anthropic tool_use 统一为一种结构） */
export interface AgentToolCall {
  /** 工具名 */
  name: string;
  /** 工具参数（JSON 对象） */
  arguments: Record<string, unknown>;
}

/** 单步轨迹（思考 → 行动 → 观察） */
export interface AgentStep {
  /** 步号（从 1 开始） */
  stepNumber: number;
  /** 思考内容 */
  thought: string;
  /** 行动描述（工具调用或最终回答） */
  action: string;
  /** 观察结果 */
  observation: string;
  /** 本步耗时（毫秒） */
  duration: number;
}

/** 工具执行结果，供 ReAct 循环回填 observation */
export interface ToolHandlerResult {
  /** 是否成功 */
  ok: boolean;
  /** 成功时的结果文本 */
  result?: string;
  /** 失败时的错误信息 */
  error?: string;
}

/** 工具处理器：agent 可调用的能力单元（ADR-016 工具注册表） */
export interface ToolHandler {
  /** 工具名（与元数据 tools 白名单对应） */
  name: string;
  /** 能力描述，注入 system prompt 供 LLM 决策 */
  description: string;
  /** 参数 JSON schema（注入 LLM tools 声明，便于生成正确参数） */
  inputSchema?: Record<string, unknown>;
  /** 执行工具，接收 JSON 参数，返回结构化结果 */
  execute(args: Record<string, unknown>): Promise<ToolHandlerResult>;
}

/** agent 块执行结果 */
export interface AgentResult {
  /** 是否成功 */
  success: boolean;
  /** 最终答案文本（写入 output 变量，ADR-017） */
  output: string;
  /** 失败原因（如超时 / 达步数上限 / 中止） */
  error?: string;
  /** 步骤轨迹 */
  steps: AgentStep[];
  /** 总耗时（毫秒） */
  totalDuration: number;
  /** token 用量累计 */
  tokenUsage: { input: number; output: number };
}
