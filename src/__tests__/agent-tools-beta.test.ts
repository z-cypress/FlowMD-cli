/**
 * v2.0-beta 工具集成测试：file_write / api_call
 * 覆盖写入安全边界与 api_call 域名白名单（fetch 层 mock）
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync, mkdirSync, rmSync, symlinkSync, readFileSync, existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createToolRegistry } from '../core/blocks/agent/tools/registry.js';
import { isHostAllowed } from '../core/blocks/agent/tools/api-call.js';

const mockFetch = vi.hoisted(() => vi.fn());

describe('file_write tool', () => {
  let projectRoot: string;
  let registry: ReturnType<typeof createToolRegistry>;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'flowmd-agent-filewrite-'));
    registry = createToolRegistry({ projectRoot });
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('should write a file under .flow/output/', async () => {
    const tool = registry.get('file_write')!;
    const result = await tool.execute({ path: 'result.json', content: '{"ok":true}' });

    expect(result.ok).toBe(true);
    expect(readFileSync(join(projectRoot, '.flow', 'output', 'result.json'), 'utf-8')).toBe('{"ok":true}');
  });

  it('should create nested directories automatically', async () => {
    const tool = registry.get('file_write')!;
    const result = await tool.execute({ path: 'reports/2026/summary.md', content: '# summary' });

    expect(result.ok).toBe(true);
    expect(readFileSync(join(projectRoot, '.flow', 'output', 'reports', '2026', 'summary.md'), 'utf-8')).toBe('# summary');
  });

  it('should reject parent traversal escaping the output dir', async () => {
    const tool = registry.get('file_write')!;
    const result = await tool.execute({ path: '../../secret.txt', content: 'x' });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('escapes');
    expect(existsSync(join(projectRoot, 'secret.txt'))).toBe(false);
  });

  it('should reject absolute paths outside the output dir', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'flowmd-agent-fw-outside-'));
    try {
      const tool = registry.get('file_write')!;
      const result = await tool.execute({ path: join(outside, 'x.txt'), content: 'x' });
      expect(result.ok).toBe(false);
      expect(existsSync(join(outside, 'x.txt'))).toBe(false);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('should reject a symlink dir escaping the output dir', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'flowmd-agent-fw-link-'));
    try {
      const outputDir = join(projectRoot, '.flow', 'output');
      mkdirSync(outputDir, { recursive: true });
      try {
        symlinkSync(outside, join(outputDir, 'link'));
      } catch {
        return; // 平台不支持符号链接时跳过
      }
      const tool = registry.get('file_write')!;
      const result = await tool.execute({ path: 'link/escaped.txt', content: 'x' });
      expect(result.ok).toBe(false);
      expect(result.error).toContain('escapes');
      expect(existsSync(join(outside, 'escaped.txt'))).toBe(false);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('should reject missing args', async () => {
    const tool = registry.get('file_write')!;
    expect((await tool.execute({ content: 'x' })).ok).toBe(false);
    expect((await tool.execute({ path: 'a.txt' })).ok).toBe(false);
  });

  it('should reject oversized content', async () => {
    const tool = registry.get('file_write')!;
    const result = await tool.execute({ path: 'big.txt', content: 'x'.repeat(1024 * 1024 + 1) });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('too large');
  });
});

describe('api_call tool', () => {
  let registry: ReturnType<typeof createToolRegistry>;

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = mockFetch;
    registry = createToolRegistry({
      projectRoot: process.cwd(),
      allowedDomains: ['api.example.com', '*.openai.com'],
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('should allow an exact-match host and return response text', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, text: async () => '{"data":1}' });

    const tool = registry.get('api_call')!;
    const result = await tool.execute({ url: 'https://api.example.com/v1/data' });

    expect(result.ok).toBe(true);
    expect(result.result).toBe('{"data":1}');
    expect(mockFetch).toHaveBeenCalledWith('https://api.example.com/v1/data', expect.objectContaining({ method: 'GET' }));
  });

  it('should allow a wildcard subdomain host', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, text: async () => 'ok' });

    const tool = registry.get('api_call')!;
    const result = await tool.execute({ url: 'https://chat.openai.com/v1' });

    expect(result.ok).toBe(true);
  });

  it('should reject a host not in the allowlist without calling fetch', async () => {
    const tool = registry.get('api_call')!;
    const result = await tool.execute({ url: 'https://evil.example.net/data' });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('evil.example.net');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should reject non-http(s) schemes', async () => {
    const tool = registry.get('api_call')!;
    const result = await tool.execute({ url: 'file:///etc/passwd' });

    expect(result.ok).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should reject invalid urls', async () => {
    const tool = registry.get('api_call')!;
    const result = await tool.execute({ url: 'not a url' });

    expect(result.ok).toBe(false);
  });

  it('should report HTTP error status', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, text: async () => '' });

    const tool = registry.get('api_call')!;
    const result = await tool.execute({ url: 'https://api.example.com/x' });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('500');
  });

  it('should reject an oversized response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => 'x'.repeat(64 * 1024 + 1),
    });

    const tool = registry.get('api_call')!;
    const result = await tool.execute({ url: 'https://api.example.com/big' });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('too large');
  });
});

describe('isHostAllowed', () => {
  it('should match exact host and wildcard rules', () => {
    expect(isHostAllowed('api.example.com', ['api.example.com'])).toBe(true);
    expect(isHostAllowed('api.example.com', ['*.example.com'])).toBe(true);
    expect(isHostAllowed('sub.api.example.com', ['*.example.com'])).toBe(true);
    expect(isHostAllowed('example.com', ['*.example.com'])).toBe(false);
    expect(isHostAllowed('other.com', ['api.example.com'])).toBe(false);
    expect(isHostAllowed('API.EXAMPLE.COM', ['api.example.com'])).toBe(true);
  });
});
