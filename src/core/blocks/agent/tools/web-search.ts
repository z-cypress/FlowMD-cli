/**
 * agent 工具：web_search（搜索互联网）
 * 安全边界（ADR-018）：GET {agent.searchEndpoint}?q=QUERY，不捆绑第三方密钥；
 * 未配置时明确报错；JSON 响应原样 stringify，HTML 响应经 htmlToText 剥离
 */

import type { ToolHandler, ToolHandlerResult } from '../types.js';
import { fetchResponseText, htmlToText, isBlockedHost } from './http.js';

/**
 * 创建 web_search 工具
 * @param searchEndpoint - 搜索 endpoint（agent.searchEndpoint），未配置时工具报错
 * @param signal - 可选中止信号
 * @returns 工具处理器
 */
export function createWebSearchTool(searchEndpoint: string | undefined, signal?: AbortSignal): ToolHandler {
  return {
    name: 'web_search',
    description: searchEndpoint
      ? '搜索互联网并返回结果文本。参数 query：搜索关键词。'
      : '搜索互联网（未配置：需在 .flow/config.yml 设置 agent.searchEndpoint）。参数 query：搜索关键词。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词' },
      },
      required: ['query'],
    },
    async execute(args: Record<string, unknown>): Promise<ToolHandlerResult> {
      const query = typeof args.query === 'string' ? args.query : '';
      if (!query.trim()) {
        return { ok: false, error: 'query is required' };
      }
      if (!searchEndpoint) {
        return { ok: false, error: 'web_search is not configured: set agent.searchEndpoint in .flow/config.yml' };
      }
      let endpoint: URL;
      try {
        endpoint = new URL(searchEndpoint);
      } catch {
        return { ok: false, error: 'invalid searchEndpoint in config' };
      }
      if (endpoint.protocol !== 'https:' && endpoint.protocol !== 'http:') {
        return { ok: false, error: 'searchEndpoint must be http(s)' };
      }
      if (isBlockedHost(endpoint.hostname)) {
        return { ok: false, error: `search endpoint host is blocked: ${endpoint.hostname}` };
      }
      endpoint.searchParams.set('q', query);
      try {
        const text = await fetchResponseText(endpoint.toString(), { signal });
        try {
          const json = JSON.parse(text);
          return { ok: true, result: typeof json === 'string' ? json : JSON.stringify(json, null, 2) };
        } catch {
          return { ok: true, result: htmlToText(text) };
        }
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}
