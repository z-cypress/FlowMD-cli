/**
 * flowmd serve — 路由处理器
 * POST /execute、GET /templates、GET /health
 */

import type { IncomingMessage } from 'node:http';
import { parseMarkdown } from '../parser.js';
import { executeDocument, executeSingleBlock } from '../executor.js';
import { loadConfig } from '../../utils/config.js';
import { getTemplateNames, getTemplatesContent } from '../../commands/new.js';
import { listHistory, getHistoryDetail } from '../../utils/history.js';
import { WEB_IDE_HTML } from './web-ide.html.js';
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
    const { content, hasError, blocks, variables, failedBlocks } = await executeDocument(doc, options, config);
    return { ok: true, data: { content, hasError, blocks, variables, failedBlocks } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `Execution failed: ${message}` };
  }
}

/**
 * GET /templates — 列出可用模板（含内容）
 * @returns 模板名与内容映射
 */
export async function handleTemplates(): Promise<ApiResponse> {
  return { ok: true, data: { templates: getTemplateNames(), content: getTemplatesContent() } };
}

/**
 * GET / — Web IDE 单页（text/html，由 server 层直接返回）
 * @returns 占位（实际由 server.ts 特殊处理返回 HTML）
 */
export async function handleIde(): Promise<ApiResponse> {
  return { ok: true, data: WEB_IDE_HTML };
}

/**
 * GET /health — 健康检查
 * @returns 存活状态
 */
export async function handleHealth(): Promise<ApiResponse> {
  return { ok: true, data: { status: 'ok' } };
}

/**
 * POST /execute-block — 单独执行指定块（Web IDE 块级执行）
 * @param req - 请求
 * @param body - 请求体（JSON 字符串）
 * @returns 单块执行结果或错误
 */
export async function handleExecuteBlock(req: IncomingMessage, body: string): Promise<ApiResponse> {
  let payload: { markdown?: string; index?: number; vars?: Record<string, string>; debug?: boolean };
  try {
    payload = JSON.parse(body) as typeof payload;
  } catch {
    return { ok: false, error: 'Invalid JSON body' };
  }
  if (!payload || typeof payload !== 'object') {
    return { ok: false, error: 'Body must be a JSON object' };
  }
  if (typeof payload.markdown !== 'string' || !payload.markdown) {
    return { ok: false, error: 'Missing required field: markdown' };
  }
  const index = typeof payload.index === 'number' ? payload.index : Number(payload.index);
  if (!Number.isInteger(index) || index < 0) {
    return { ok: false, error: 'Invalid block index (must be a non-negative integer)' };
  }

  const config = loadConfig();
  const options = {
    output: 'stdout' as const,
    dryRun: false,
    stepMode: false,
    failFast: false,
    debug: !!payload.debug,
    release: false,
    quiet: true,
    varArgs: payload.vars || {},
    runYes: true,
  };

  try {
    const result = await executeSingleBlock(payload.markdown, index, options, config);
    return { ok: true, data: result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `Block execution failed: ${message}` };
  }
}

/**
 * GET /history — 最近执行历史（含块级明细）
 * @returns 历史记录列表
 */
export async function handleHistory(): Promise<ApiResponse> {
  const records = listHistory(20).map((r) => getHistoryDetail(r.id)).filter((r): r is NonNullable<typeof r> => r !== null);
  return { ok: true, data: { records } };
}
