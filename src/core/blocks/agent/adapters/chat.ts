/**
 * agent chat 适配层（ADR-015）
 * 把 openai function calling / anthropic tool_use 归一为 provider 无关的消息历史与返回结构
 */

import { getOpenAIClient, getAnthropicClient } from '../../../llm/clients.js';
import type { LLMConfig } from '../../../../types/index.js';

/** provider 无关的助手侧工具调用（含 id，供回填工具结果） */
export interface AssistantToolCall {
  /** 工具调用 id（openai tool_call_id / anthropic tool_use_id） */
  id: string;
  /** 工具名 */
  name: string;
  /** 工具参数 */
  arguments: Record<string, unknown>;
}

/** provider 无关的消息历史 */
export type TurnMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: AssistantToolCall[] }
  | { role: 'tool'; toolCallId: string; content: string };

/** 工具定义（注入 LLM 的 tools 声明） */
export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** 一次 LLM 调用的归一化返回 */
export interface AgentTurn {
  /** 助手的思考文本 */
  thought: string;
  /** 本次调用的工具（空数组 = 最终答案） */
  toolCalls: AssistantToolCall[];
  /** token 用量 */
  usage: { input: number; output: number };
}

/** 一次 LLM 调用的参数 */
export interface AgentTurnParams {
  /** system prompt */
  system: string;
  /** 消息历史（provider 无关） */
  messages: TurnMessage[];
  /** 工具定义 */
  tools: ToolSpec[];
  /** 已解析的 LLM 配置 */
  config: LLMConfig;
  /** 决策温度 */
  temperature?: number;
  /** 中止信号 */
  signal?: AbortSignal;
}

/**
 * 执行一次 LLM 调用并按 provider 分发
 * @param params - 调用参数
 * @returns 归一化结果
 */
export async function runAgentTurn(params: AgentTurnParams): Promise<AgentTurn> {
  if (params.config.provider === 'openai') {
    return runOpenAITurn(params);
  }
  return runAnthropicTurn(params);
}

/**
 * 安全解析 JSON 字符串，失败时返回空对象
 * @param raw - 原始字符串
 * @returns 解析后的对象
 */
function safeParseObject(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * 调用 OpenAI chat completions（function calling）
 * @param params - 调用参数
 * @returns 归一化结果
 */
async function runOpenAITurn(params: AgentTurnParams): Promise<AgentTurn> {
  const client = getOpenAIClient(params.config);

  const messages = [
    { role: 'system' as const, content: params.system },
    ...params.messages.map((m) => {
      if (m.role === 'assistant') {
        return {
          role: 'assistant' as const,
          content: m.content,
          tool_calls: m.toolCalls?.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
          })),
        };
      }
      if (m.role === 'tool') {
        return { role: 'tool' as const, tool_call_id: m.toolCallId, content: m.content };
      }
      return { role: 'user' as const, content: m.content };
    }),
  ];

  const tools = params.tools.map((tool) => ({
    type: 'function' as const,
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  }));

  const temperature = params.temperature ?? 0.5;

  const response = await client.chat.completions.create({
    model: params.config.model,
    messages,
    tools: tools.length > 0 ? tools : undefined,
    temperature,
  }, { signal: params.signal });

  const message = response.choices[0]?.message;
  const rawToolCalls = (message?.tool_calls ?? []) as Array<{
    id: string;
    function: { name: string; arguments: string };
  }>;
  const toolCalls: AssistantToolCall[] = rawToolCalls.map((tc) => ({
    id: tc.id,
    name: tc.function.name,
    arguments: safeParseObject(tc.function.arguments),
  }));

  return {
    thought: message?.content ?? '',
    toolCalls,
    usage: {
      input: response.usage?.prompt_tokens ?? 0,
      output: response.usage?.completion_tokens ?? 0,
    },
  };
}

/**
 * 调用 Anthropic messages（tool_use）
 * 连续 tool_result 消息合并为单条 user 消息（Anthropic 不允许连续 user 消息）
 * @param params - 调用参数
 * @returns 归一化结果
 */
async function runAnthropicTurn(params: AgentTurnParams): Promise<AgentTurn> {
  const client = getAnthropicClient(params.config);

  const apiMessages: unknown[] = [];
  for (const m of params.messages) {
    if (m.role === 'assistant') {
      const content: Array<Record<string, unknown>> = [];
      if (m.content) content.push({ type: 'text', text: m.content });
      for (const tc of m.toolCalls ?? []) {
        content.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.arguments });
      }
      apiMessages.push({ role: 'assistant', content });
    } else if (m.role === 'tool') {
      // 合并连续的 tool_result 为一条 user 消息
      const last = apiMessages[apiMessages.length - 1] as { role?: string; content?: Array<Record<string, unknown>> } | undefined;
      if (last && last.role === 'user') {
        last.content!.push({ type: 'tool_result', tool_use_id: m.toolCallId, content: m.content });
      } else {
        apiMessages.push({
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: m.toolCallId, content: m.content }],
        });
      }
    } else {
      apiMessages.push({ role: 'user', content: m.content });
    }
  }

  const tools = params.tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters as never,
  }));

  const temperature = Math.min(1, Math.max(0, params.temperature ?? 0.5));

  const response = await client.messages.create({
    model: params.config.model,
    max_tokens: params.config.max_tokens ?? 4096,
    system: params.system,
    messages: apiMessages as never,
    tools: tools.length > 0 ? tools : undefined,
    temperature,
  }, { signal: params.signal });

  const toolCalls: AssistantToolCall[] = [];
  let thought = '';
  for (const block of response.content) {
    if (block.type === 'text') {
      thought += block.text;
    } else if (block.type === 'tool_use') {
      toolCalls.push({ id: block.id, name: block.name, arguments: block.input as Record<string, unknown> });
    }
  }

  return {
    thought,
    toolCalls,
    usage: {
      input: response.usage?.input_tokens ?? 0,
      output: response.usage?.output_tokens ?? 0,
    },
  };
}
