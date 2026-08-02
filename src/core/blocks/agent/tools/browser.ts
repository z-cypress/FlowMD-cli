/**
 * agent 工具：browser（网页抓取，只读）
 * 安全边界（ADR-018）：仅 http/https、SSRF-lite（内网地址拦截）、响应经 htmlToText 剥离、上限 128KB
 */

import type { ToolHandler, ToolHandlerResult } from '../types.js';
import { fetchResponseText, htmlToText, isBlockedHost } from './http.js';

/** 响应大小上限（字节） */
const MAX_BYTES = 128 * 1024;

/**
 * 创建 browser 工具
 * @param signal - 可选中止信号
 * @returns 工具处理器
 */
export function createBrowserTool(signal?: AbortSignal): ToolHandler {
  return {
    name: 'browser',
    description:
      '抓取网页内容并转为可读文本（只读 GET，仅 http/https，内网地址被拦截）。参数 url：完整 URL。',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: '完整 URL，如 https://example.com/article' },
      },
      required: ['url'],
    },
    async execute(args: Record<string, unknown>): Promise<ToolHandlerResult> {
      const rawUrl = typeof args.url === 'string' ? args.url : '';
      if (!rawUrl.trim()) {
        return { ok: false, error: 'url is required' };
      }
      let parsed: URL;
      try {
        parsed = new URL(rawUrl);
      } catch {
        return { ok: false, error: 'invalid url' };
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { ok: false, error: 'only http/https urls are allowed' };
      }
      if (isBlockedHost(parsed.hostname)) {
        return { ok: false, error: `host is blocked: ${parsed.hostname}` };
      }
      try {
        const text = await fetchResponseText(rawUrl, { signal, maxBytes: MAX_BYTES });
        return { ok: true, result: htmlToText(text) };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}
