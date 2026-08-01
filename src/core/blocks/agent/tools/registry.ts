/**
 * agent 工具注册表（ADR-016）
 * 工具名 → ToolHandler 映射，白名单查询
 */

import type { ToolHandler } from '../types.js';
import { createFileReadTool } from './file-read.js';
import { createCodeExecutionTool } from './code-execution.js';

/** 注册表创建选项 */
export interface ToolRegistryOptions {
  /** 项目根目录（绝对路径），file_read 的安全边界 */
  projectRoot: string;
  /** 可选中止信号，贯通 agent 块级 AbortSignal */
  signal?: AbortSignal;
}

/**
 * 创建 v2.0-alpha 工具注册表（code_execution / file_read）
 * @param options - 注册表选项
 * @returns 工具名 → ToolHandler 的 Map
 */
export function createToolRegistry(options: ToolRegistryOptions): Map<string, ToolHandler> {
  const tools = new Map<string, ToolHandler>();
  const codeExecution = createCodeExecutionTool(options.signal);
  const fileRead = createFileReadTool(options.projectRoot);
  tools.set(codeExecution.name, codeExecution);
  tools.set(fileRead.name, fileRead);
  return tools;
}

/** v2.0-alpha 已注册工具名集合（与 validate.REGISTERED_TOOLS 保持一致） */
export const REGISTERED_TOOL_NAMES: readonly string[] = ['code_execution', 'file_read'];
