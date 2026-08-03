/**
 * flowmd serve 测试
 * 端到端起真实 http server，验证 /execute /templates /health 与错误码
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFlowServer } from '../core/serve/server.js';
import { handleExecute, handleTemplates, handleHealth, handleIde } from '../core/serve/routes.js';

vi.mock('ora', () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    text: '',
  })),
}));

vi.mock('../utils/history.js', () => ({
  recordExecution: vi.fn(),
}));

let server: ReturnType<typeof createFlowServer>;
let baseUrl: string;
let originalCwd: string;
let tempDir: string;

async function request(method: string, path: string, body?: unknown) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json() as Record<string, unknown>;
  return { status: res.status, body: json };
}

describe('flowmd serve', () => {
  beforeAll(async () => {
    originalCwd = process.cwd();
    tempDir = mkdtempSync(join(tmpdir(), 'flowmd-serve-test-'));
    process.chdir(tempDir);

    server = createFlowServer(
      [
        { method: 'GET', path: '/', handler: handleIde, rawHtml: true },
        { method: 'POST', path: '/execute', handler: handleExecute },
        { method: 'GET', path: '/templates', handler: handleTemplates },
        { method: 'GET', path: '/health', handler: handleHealth },
      ],
      { port: 0, host: '127.0.0.1' }
    );
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('GET /health', () => {
    it('should return ok', async () => {
      const { status, body } = await request('GET', '/health');
      expect(status).toBe(200);
      expect(body.ok).toBe(true);
      expect((body.data as { status: string }).status).toBe('ok');
    });
  });

  describe('GET /templates', () => {
    it('should list available templates', async () => {
      const { status, body } = await request('GET', '/templates');
      expect(status).toBe(200);
      const templates = (body.data as { templates: string[] }).templates;
      expect(templates).toContain('basic');
      expect(templates).toContain('data');
      expect(templates).toContain('report');
    });
  });

  describe('POST /execute', () => {
    it('should execute markdown and return rendered content', async () => {
      const { status, body } = await request('POST', '/execute', {
        markdown: '# Hello\n\n{{name}}',
        vars: { name: 'FlowMD' },
      });
      expect(status).toBe(200);
      expect(body.ok).toBe(true);
      const data = body.data as { content: string; hasError: boolean };
      expect(data.content).toContain('Hello');
      expect(data.content).toContain('FlowMD');
      expect(data.hasError).toBe(false);
    });

    it('should respect release mode', async () => {
      const { body } = await request('POST', '/execute', {
        markdown: '# Doc\n\n```template\nContent: {{date}}\n```',
        release: true,
      });
      const data = body.data as { content: string };
      expect(data.content).not.toContain('```template');
    });

    it('should return block statistics', async () => {
      const { body } = await request('POST', '/execute', {
        markdown: '# Doc\n\n```template\nContent\n```\n\n```template\nMore\n```',
      });
      const data = body.data as { blocks: { total: number; success: number; failed: number } };
      expect(data.blocks).toEqual({ total: 2, success: 2, failed: 0 });
    });

    it('should return error for missing markdown', async () => {
      const { status, body } = await request('POST', '/execute', {});
      expect(status).toBe(500);
      expect(body.ok).toBe(false);
      expect((body.error as string)).toContain('markdown');
    });

    it('should return error for invalid JSON', async () => {
      const res = await fetch(`${baseUrl}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{not json',
      });
      const body = await res.json() as { ok: boolean; error: string };
      expect(body.ok).toBe(false);
      expect(body.error).toContain('Invalid JSON');
    });
  });

  describe('routing', () => {
    it('should return the Web IDE page for GET /', async () => {
      const res = await fetch(`${baseUrl}/`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');
      const html = await res.text();
      expect(html).toContain('FlowMD Web IDE');
      expect(html).toContain('editor-host');
      expect(html).toContain('codemirror');
      expect(html).toContain('/execute');
      expect(html).toContain('release');
      expect(html).toContain('debug-check');
      expect(html).toContain('example-btn');
    });

    it('should return 404 for unknown path', async () => {
      const { status, body } = await request('GET', '/nope');
      expect(status).toBe(404);
      expect(body.ok).toBe(false);
    });

    it('should return 404 for method mismatch', async () => {
      const { status, body } = await request('GET', '/execute');
      expect(status).toBe(404);
      expect(body.ok).toBe(false);
    });
  });
});
