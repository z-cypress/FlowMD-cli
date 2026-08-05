/**
 * FlowMD 块执行状态（ADR：executor 拆分）
 * BlockExecState 及其生命周期，flat 与 control 路径共用
 */

import type { ExecutionContext } from './context.js';
import type { RunOptions, FlowConfig, BlockResult } from '../types/index.js';
import type { BlockPlugin } from './plugin-loader.js';
import type { TraceCollector } from './trace.js';

/** 块执行结果（带偏移量信息） */
export interface BlockInsertResult {
  sourceEnd: number;
  output: string;
}

/** 单个块执行时共享的状态（flat 与 control 路径共用） */
export interface BlockExecState {
  context: ExecutionContext;
  options: RunOptions;
  config: FlowConfig;
  /** 当前文档原始内容（供错误消息换算行号） */
  rawContent: string;
  visitedPaths: Set<string>;
  failedOutputs: Set<string>;
  failedBlocks: Array<{ position: number; type: string; error: string; line?: number }>;
  blockRecords: Array<{
    position: number;
    type: string;
    status: 'success' | 'failed';
    error?: string;
    duration_ms: number;
    trace?: string;
    line?: number;
    input_tokens?: number;
    output_tokens?: number;
  }>;
  insertResults: BlockInsertResult[];
  hasError: boolean;
  totalBlocks: number;
  /** 控制流路径标志：debug 结果由 execute-region 直接拼进 parts，不再写入 insertResults */
  controlFlow?: boolean;
  /** 自定义块插件注册表（可选） */
  plugins?: Map<string, BlockPlugin>;
  /** trace 收集器（--trace 时启用） */
  traceCollector?: TraceCollector;
}

/**
 * 创建块执行状态（供 executor 顶层与 block-dispatcher 使用）
 * @param context - 变量上下文
 * @param options - 运行选项
 * @param config - FlowMD 配置
 * @param rawContent - 当前文档原始内容（错误行号换算用）
 * @param visitedPaths - 已访问路径集合（跨文档共享）
 * @param totalBlocks - 块总数
 * @returns 初始化的执行状态
 */
export function createBlockExecState(
  context: ExecutionContext,
  options: RunOptions,
  config: FlowConfig,
  rawContent: string,
  visitedPaths: Set<string>,
  totalBlocks: number
): BlockExecState {
  return {
    context,
    options,
    config,
    rawContent,
    visitedPaths,
    failedOutputs: new Set<string>(),
    failedBlocks: [],
    blockRecords: [],
    insertResults: [],
    hasError: false,
    totalBlocks,
  };
}

/** 校验执行结果类型（供 blockRecords 使用） */
export type { BlockResult };

/** 子文档执行结果 */
export interface SubExecutionResult {
  /** 子文档最终渲染内容 */
  content: string;
  /** 子文档产出的全部变量 */
  variables: Record<string, unknown>;
  /** 是否有块执行失败 */
  hasError: boolean;
  /** 失败块数 */
  failedBlocks: number;
}
