/**
 * Cost dashboard tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('cost command', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'flowmd-cost-test-'));
    originalCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should query cost data from history', async () => {
    const { queryCostData } = await import('../utils/history.js');

    // No data yet
    const rows = queryCostData(7);
    expect(rows).toEqual([]);
  });

  it('should record and query token usage', async () => {
    const { recordExecution, queryCostData } = await import('../utils/history.js');

    // Record an execution with token usage
    recordExecution({
      file: 'test.md',
      total_blocks: 2,
      success_blocks: 2,
      failed_blocks: 0,
      blocks: [
        { position: 1, type: 'ai', status: 'success', duration_ms: 100, input_tokens: 1000, output_tokens: 500 },
        { position: 2, type: 'ai', status: 'success', duration_ms: 200, input_tokens: 2000, output_tokens: 800 },
      ],
    });

    const rows = queryCostData(7);
    expect(rows.length).toBe(1);
    expect(rows[0].file).toBe('test.md');
    expect(rows[0].blocks).toBe(2);
    expect(rows[0].tokens_in).toBe(3000);
    expect(rows[0].tokens_out).toBe(1300);
  });

  it('should filter by file', async () => {
    const { recordExecution, queryCostData } = await import('../utils/history.js');

    recordExecution({
      file: 'a.md',
      total_blocks: 1,
      success_blocks: 1,
      failed_blocks: 0,
      blocks: [{ position: 1, type: 'ai', status: 'success', duration_ms: 100, input_tokens: 100 }],
    });
    recordExecution({
      file: 'b.md',
      total_blocks: 1,
      success_blocks: 1,
      failed_blocks: 0,
      blocks: [{ position: 1, type: 'ai', status: 'success', duration_ms: 100, input_tokens: 200 }],
    });

    const rowsA = queryCostData(7, 'a.md');
    expect(rowsA.length).toBe(1);
    expect(rowsA[0].tokens_in).toBe(100);

    const rowsAll = queryCostData(7);
    expect(rowsAll.length).toBe(2);
  });
});
