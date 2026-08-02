/**
 * agent 工具注册表（ADR-016）
 * 工具名 → ToolHandler 映射，白名单查询
 */

import type { ToolHandler } from '../types.js';
import { createFileReadTool } from './file-read.js';
import { createCodeExecutionTool } from './code-execution.js';
import { createFileWriteTool } from './file-write.js';
import { createApiCallTool } from './api-call.js';
import { createBrowserTool } from './browser.js';
import { createWebSearchTool } from './web-search.js';

/** 注册表创建选项 */
export interface ToolRegistryOptions {
  /** 项目根目录（绝对路径），file_read / file_write 的安全边界 */
  projectRoot: string;
  /** 可选中止信号，贯通 agent 块级 AbortSignal */
  signal?: AbortSignal;
  /** api_call 域名白名单（agent.allowedDomains） */
  allowedDomains?: string[];
  /** web_search 搜索 endpoint（agent.searchEndpoint），未配置时工具报错 */
  searchEndpoint?: string;
}

/**
 * 创建 v2.0 工具注册表
 * code_execution / file_read / file_write / api_call / browser / web_search
 * @param options - 注册表选项
 * @returns 工具名 → ToolHandler 的 Map
 */
export function createToolRegistry(options: ToolRegistryOptions): Map<string, ToolHandler> {
  const tools = new Map<string, ToolHandler>();
  tools.set('code_execution', createCodeExecutionTool(options.signal));
  tools.set('file_read', createFileReadTool(options.projectRoot));
  tools.set('file_write', createFileWriteTool(options.projectRoot));
  tools.set('api_call', createApiCallTool(options.allowedDomains ?? [], options.signal));
  tools.set('browser', createBrowserTool(options.signal));
  tools.set('web_search', createWebSearchTool(options.searchEndpoint, options.signal));
  return tools;
}

/** v2.0 已注册工具名集合（与 validate.REGISTERED_TOOLS 保持一致） */
export const REGISTERED_TOOL_NAMES: readonly string[] = [
  'code_execution', 'file_read', 'file_write', 'api_call', 'browser', 'web_search',
];
