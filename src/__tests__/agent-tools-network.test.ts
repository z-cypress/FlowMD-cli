/**
 * v2.0 agent 网络工具集成测试：browser / web_search（fetch 层 mock）
 * 覆盖抓取、HTML 剥离、SSRF-lite 拦截、未配置报错、JSON 响应
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createToolRegistry } from '../core/blocks/agent/tools/registry.js';
import { htmlToText, isBlockedHost } from '../core/blocks/agent/tools/http.js';

const mockFetch = vi.hoisted(() => vi.fn());

function okResponse(text: string, status = 200) {
  return { ok: status < 400, status, text: async () => text };
}

describe('browser tool', () => {
  let registry: ReturnType<typeof createToolRegistry>;

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = mockFetch;
    registry = createToolRegistry({ projectRoot: process.cwd() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('should fetch a page and strip HTML to readable text', async () => {
    mockFetch.mockResolvedValue(okResponse('<html><head><title>t</title><style>.x{}</style></head><body><h1>Hello</h1><script>bad()</script><p>World&nbsp;!</p></body></html>'));

    const tool = registry.get('browser')!;
    const result = await tool.execute({ url: 'https://example.com/article' });

    expect(result.ok).toBe(true);
    expect(result.result).toContain('Hello');
    expect(result.result).toContain('World !');
    expect(result.result).not.toContain('bad()');
    expect(mockFetch).toHaveBeenCalledWith('https://example.com/article', expect.objectContaining({ method: 'GET' }));
  });

  it('should reject non-http(s) schemes', async () => {
    const tool = registry.get('browser')!;
    const result = await tool.execute({ url: 'file:///etc/passwd' });

    expect(result.ok).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should block private hosts (SSRF-lite)', async () => {
    const tool = registry.get('browser')!;
    expect((await tool.execute({ url: 'http://localhost:8080/admin' })).ok).toBe(false);
    expect((await tool.execute({ url: 'http://127.0.0.1/secret' })).ok).toBe(false);
    expect((await tool.execute({ url: 'http://192.168.1.10/x' })).ok).toBe(false);
    expect((await tool.execute({ url: 'http://10.0.0.5/x' })).ok).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should report HTTP errors', async () => {
    mockFetch.mockResolvedValue(okResponse('not found', 404));

    const tool = registry.get('browser')!;
    const result = await tool.execute({ url: 'https://example.com/missing' });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('404');
  });

  it('should reject an oversized response', async () => {
    mockFetch.mockResolvedValue(okResponse('x'.repeat(128 * 1024 + 1)));

    const tool = registry.get('browser')!;
    const result = await tool.execute({ url: 'https://example.com/big' });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('too large');
  });
});

describe('web_search tool', () => {
  let registry: ReturnType<typeof createToolRegistry>;

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = mockFetch;
    registry = createToolRegistry({ projectRoot: process.cwd(), searchEndpoint: 'https://search.example.com/api' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('should call the endpoint with the query and return JSON results', async () => {
    mockFetch.mockResolvedValue(okResponse('{"results":[{"title":"A"}]}'));

    const tool = registry.get('web_search')!;
    const result = await tool.execute({ query: 'FlowMD' });

    expect(result.ok).toBe(true);
    expect(result.result).toContain('"title": "A"');
    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('q=FlowMD');
  });

  it('should strip HTML responses to text', async () => {
    mockFetch.mockResolvedValue(okResponse('<html><body><div>结果一</div><div>结果二</div></body></html>'));

    const tool = registry.get('web_search')!;
    const result = await tool.execute({ query: 'hello' });

    expect(result.ok).toBe(true);
    expect(result.result).toContain('结果一');
  });

  it('should error clearly when the search endpoint is not configured', async () => {
    const unconfigured = createToolRegistry({ projectRoot: process.cwd() });
    const tool = unconfigured.get('web_search')!;
    const result = await tool.execute({ query: 'hello' });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('not configured');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should reject a blocked search endpoint host', async () => {
    const blocked = createToolRegistry({ projectRoot: process.cwd(), searchEndpoint: 'http://localhost:3000/search' });
    const tool = blocked.get('web_search')!;
    const result = await tool.execute({ query: 'hello' });

    expect(result.ok).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('http helpers', () => {
  it('should strip tags and decode entities', () => {
    expect(htmlToText('<p>a &amp; b</p>')).toBe('a & b');
    expect(htmlToText('<script>var x=1;</script>Hello<style>.y{}</style>')).toBe('Hello');
  });

  it('should flag private hosts', () => {
    expect(isBlockedHost('localhost')).toBe(true);
    expect(isBlockedHost('127.0.0.1')).toBe(true);
    expect(isBlockedHost('10.1.2.3')).toBe(true);
    expect(isBlockedHost('192.168.0.1')).toBe(true);
    expect(isBlockedHost('172.16.0.1')).toBe(true);
    expect(isBlockedHost('169.254.169.254')).toBe(true);
    expect(isBlockedHost('::1')).toBe(true);
    expect(isBlockedHost('example.com')).toBe(false);
    expect(isBlockedHost('8.8.8.8')).toBe(false);
  });
});
