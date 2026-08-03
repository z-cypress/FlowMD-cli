/**
 * 结果缓存单元测试
 * cacheKey 的稳定/区分性与 readCache/writeCache 的持久化
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cacheKey, readCache, writeCache } from '../core/cache.js';
import { ExecutionContext } from '../core/context.js';
import type { ExecutableBlock } from '../types/index.js';

let tempDir: string;

function makeBlock(
  type: 'ai' | 'data',
  content: string,
  meta: Record<string, string | string[]> = {}
): ExecutableBlock {
  return {
    type,
    content,
    lang: type,
    meta,
    position: 0,
    sourceStart: 0,
    sourceEnd: 0,
  };
}

describe('cacheKey', () => {
  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'flowmd-cache-'));
    process.chdir(tempDir);
  });

  afterAll(() => {
    process.chdir('/');
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should produce identical keys for identical blocks', () => {
    const ctx = new ExecutionContext();
    ctx.set('data', [{ a: 1 }]);
    const block = makeBlock('ai', '分析 {{data}}', { output: 'summary' });
    expect(cacheKey(block, ctx)).toBe(cacheKey(block, ctx));
  });

  it('should produce different keys when block content changes', () => {
    const ctx = new ExecutionContext();
    const a = makeBlock('ai', '分析 A', { output: 'summary' });
    const b = makeBlock('ai', '分析 B', { output: 'summary' });
    expect(cacheKey(a, ctx)).not.toBe(cacheKey(b, ctx));
  });

  it('should produce different keys when input variables change', () => {
    const ctxA = new ExecutionContext();
    ctxA.set('data', [{ a: 1 }]);
    const ctxB = new ExecutionContext();
    ctxB.set('data', [{ a: 2 }]);
    const block = makeBlock('ai', '分析 {{data}}', { output: 'summary' });
    expect(cacheKey(block, ctxA)).not.toBe(cacheKey(block, ctxB));
  });

  it('should exclude system variables from the key', () => {
    const ctxA = new ExecutionContext();
    ctxA.set('date', '2026-08-01');
    const ctxB = new ExecutionContext();
    ctxB.set('date', '2026-08-02');
    const block = makeBlock('ai', '生成日报', { output: 'summary' });
    expect(cacheKey(block, ctxA)).toBe(cacheKey(block, ctxB));
  });

  it('should ignore undefined referenced variables', () => {
    const ctx = new ExecutionContext();
    const block = makeBlock('data', 'SELECT * FROM t WHERE x = {{missing}}');
    expect(cacheKey(block, ctx)).toBe(cacheKey(block, new ExecutionContext()));
  });
});

describe('readCache / writeCache', () => {
  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'flowmd-cache-'));
    process.chdir(tempDir);
  });

  afterAll(() => {
    process.chdir('/');
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should round-trip a cache record', () => {
    const ctx = new ExecutionContext();
    const block = makeBlock('ai', '分析 {{data}}', { output: 'summary' });
    ctx.set('data', [1, 2, 3]);
    const hash = cacheKey(block, ctx);

    expect(readCache(hash)).toBeNull();

    writeCache(hash, { output: '结果文本', value: ['结果文本'], duration: 1200, cachedAt: new Date().toISOString() });

    const record = readCache(hash);
    expect(record).not.toBeNull();
    expect(record!.output).toBe('结果文本');
    expect(record!.duration).toBe(1200);
  });

  it('should return null for a missing hash', () => {
    expect(readCache('deadbeef')).toBeNull();
  });
});
