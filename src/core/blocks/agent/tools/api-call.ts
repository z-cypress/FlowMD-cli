/**
 * agent 工具：api_call（外部 HTTP API，只读）
 * 安全边界（ADR-016）：仅 GET、仅 http/https、Host 必须在白名单内（agent.allowedDomains）
 */

import type { ToolHandler, ToolHandlerResult } from '../types.js';

/** 响应大小上限（字节） */
const MAX_RESPONSE_BYTES = 64 * 1024;
/** 请求超时（毫秒） */
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * 判断 host 是否命中白名单（精确匹配或 *.suffix 通配）
 * @param host - 请求 Host
 * @param domains - 白名单
 * @returns 是否允许
 */
export function isHostAllowed(host: string, domains: string[]): boolean {
  const h = host.toLowerCase();
  return domains.some((d) => {
    const rule = d.trim().toLowerCase();
    if (!rule) return false;
    if (rule.startsWith('*.')) return h.endsWith(rule.slice(1));
    return h === rule;
  });
}

/**
 * 创建 api_call 工具
 * @param allowedDomains - 域名白名单（agent.allowedDomains）
 * @param signal - 可选中止信号
 * @returns 工具处理器
 */
export function createApiCallTool(allowedDomains: string[], signal?: AbortSignal): ToolHandler {
  return {
    name: 'api_call',
    description:
      '调用外部 HTTP API（只读 GET，Host 需在配置的域名白名单内）。参数 url：完整 URL。返回响应文本。',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: '完整 URL，如 https://api.example.com/v1/data' },
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
      if (!isHostAllowed(parsed.hostname, allowedDomains)) {
        return { ok: false, error: `host not in allowlist: ${parsed.hostname}` };
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
      const onExternalAbort = () => controller.abort();
      if (signal) {
        if (signal.aborted) controller.abort();
        else signal.addEventListener('abort', onExternalAbort, { once: true });
      }

      try {
        const res = await fetch(rawUrl, { method: 'GET', signal: controller.signal });
        if (!res.ok) {
          return { ok: false, error: `HTTP ${res.status}` };
        }
        const text = await res.text();
        if (Buffer.byteLength(text, 'utf-8') > MAX_RESPONSE_BYTES) {
          return { ok: false, error: `response too large (max ${MAX_RESPONSE_BYTES} bytes)` };
        }
        return { ok: true, result: text };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { ok: false, error: controller.signal.aborted ? 'request timed out' : message };
      } finally {
        clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', onExternalAbort);
      }
    },
  };
}
