/**
 * Output delivery module tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { deliver } from '../core/deliver.js';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('deliver', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'flowmd-deliver-'));
    originalCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('file delivery', () => {
    it('should write output to .flow/output/', async () => {
      const result = await deliver('file:output.md', 'hello world', 'ai');

      expect(result.success).toBe(true);
      expect(readFileSync(join(tempDir, '.flow', 'output', 'output.md'), 'utf-8')).toBe('hello world');
    });

    it('should create nested directories', async () => {
      const result = await deliver('file:sub/dir/output.md', 'nested', 'ai');

      expect(result.success).toBe(true);
      expect(readFileSync(join(tempDir, '.flow', 'output', 'sub', 'dir', 'output.md'), 'utf-8')).toBe('nested');
    });

    it('should reject absolute paths outside project', async () => {
      const outside = join(tmpdir(), 'flowmd-deliver-outside-' + Date.now() + '.md');
      const result = await deliver(`file:${outside}`, 'data', 'ai');

      expect(result.success).toBe(false);
      expect(result.error).toContain('.flow/output');
    });

    it('should reject path traversal via ..', async () => {
      const result = await deliver('file:../../escape.md', 'data', 'ai');

      expect(result.success).toBe(false);
      expect(result.error).toContain('.flow/output');
    });
  });

  describe('webhook delivery', () => {
    it('should POST to webhook URL', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await deliver('webhook:https://example.com/hook', 'test data', 'ai');

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/hook',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.output).toBe('test data');
      expect(body.block).toBe('ai');
      expect(body.timestamp).toBeDefined();

      vi.unstubAllGlobals();
    });

    it('should handle webhook HTTP errors', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      }));

      const result = await deliver('webhook:https://example.com/hook', 'data', 'ai');

      expect(result.success).toBe(false);
      expect(result.error).toContain('500');

      vi.unstubAllGlobals();
    });

    it('should handle network errors', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

      const result = await deliver('webhook:https://example.com/hook', 'data', 'ai');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');

      vi.unstubAllGlobals();
    });
  });

  describe('unknown target', () => {
    it('should return error for unknown target type', async () => {
      const result = await deliver('email:user@example.com', 'data', 'ai');

      expect(result.success).toBe(false);
      expect(result.error).toContain('未知的投递目标');
    });
  });
});
