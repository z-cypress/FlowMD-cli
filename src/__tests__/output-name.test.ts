/**
 * 输出文件名工具单元测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nextNewFilename } from '../utils/output-name.js';

describe('nextNewFilename', () => {
  let tempDir: string;
  const originalCwd = process.cwd();

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'flowmd-name-'));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should generate name_YYYY-MM-DD.md without a collision', () => {
    const name = nextNewFilename('report', '.md');
    expect(name).toMatch(/^report_\d{4}-\d{2}-\d{2}\.md$/);
  });

  it('should append a numeric suffix on same-day collision', () => {
    const first = nextNewFilename('report', '.md');
    writeFileSync(first, '', 'utf-8');

    const second = nextNewFilename('report', '.md');
    expect(second).toBe(first.replace(/\.md$/, '_2.md'));
  });
});
