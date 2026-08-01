/**
 * flowmd serve — 路由处理器
 * POST /execute、GET /templates、GET /health
 */

import type { IncomingMessage } from 'node:http';
import { parseMarkdown } from '../parser.js';
import { executeDocument } from '../executor.js';
import { loadConfig } from '../../utils/config.js';
import { TEMPLATE_NAMES } from '../../commands/new.js';
import type { ExecuteRequest, ApiResponse } from './types.js';

/**
 * POST /execute — 执行 Markdown 内容
 * @param req - 请求
 * @param body - 请求体（JSON 字符串）
 * @returns 执行结果或错误
 */
export async function handleExecute(req: IncomingMessage, body: string): Promise<ApiResponse> {
  let payload: ExecuteRequest;
  try {
    payload = JSON.parse(body) as ExecuteRequest;
  } catch {
    return { ok: false, error: 'Invalid JSON body' };
  }

  if (!payload || typeof payload !== 'object') {
    return { ok: false, error: 'Body must be a JSON object' };
  }
  if (typeof payload.markdown !== 'string' || !payload.markdown) {
    return { ok: false, error: 'Missing required field: markdown' };
  }

  const doc = parseMarkdown(payload.markdown);
  const config = loadConfig();

  const options = {
    output: 'stdout' as const,
    dryRun: !!payload.dryRun,
    stepMode: false,
    failFast: false,
    debug: !!payload.debug,
    release: !!payload.release,
    quiet: payload.quiet !== undefined ? !!payload.quiet : true,
    varArgs: payload.vars || {},
    varFile: payload.varFile,
    currentFile: payload.currentFile,
    // API 场景无交互确认：run 块默认跳过（用户显式调用即视为同意）
    runYes: true,
  };

  try {
    const { content, hasError } = await executeDocument(doc, options, config);
    return { ok: true, data: { content, hasError } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `Execution failed: ${message}` };
  }
}

/**
 * GET /templates — 列出可用模板
 * @returns 模板名列表
 */
export async function handleTemplates(): Promise<ApiResponse> {
  return { ok: true, data: { templates: TEMPLATE_NAMES } };
}

/**
 * GET /health — 健康检查
 * @returns 存活状态
 */
export async function handleHealth(): Promise<ApiResponse> {
  return { ok: true, data: { status: 'ok' } };
}
