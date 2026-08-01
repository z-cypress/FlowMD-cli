/**
 * History module unit tests
 * 用临时目录隔离，验证写入/列表/详情/清空/上限/截断
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  recordExecution,
  listHistory,
  getHistoryDetail,
  clearHistory,
  type HistoryInput,
} from '../utils/history.js';

describe('history module', () => {
  const originalCwd = process.cwd();
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'flowmd-history-test-'));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  function makeInput(overrides: Partial<HistoryInput> = {}): HistoryInput {
    return {
      file: 'doc.md',
      total_blocks: 2,
      success_blocks: 2,
      failed_blocks: 0,
      blocks: [
        { position: 1, type: 'ai', status: 'success', duration_ms: 100 },
        { position: 2, type: 'template', status: 'success', duration_ms: 10 },
      ],
      ...overrides,
    };
  }

  it('should auto-create .flow/history/history.db', () => {
    recordExecution(makeInput());
    expect(existsSync(join(tempDir, '.flow', 'history', 'history.db'))).toBe(true);
  });

  it('should record and list an execution', () => {
    const id = recordExecution(makeInput());
    const list = listHistory();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(id);
    expect(list[0].file).toBe('doc.md');
    expect(list[0].status).toBe('success');
  });

  it('should return detail with block-level info', () => {
    const id = recordExecution(makeInput());
    const detail = getHistoryDetail(id);
    expect(detail).not.toBeNull();
    expect(detail!.blocks).toHaveLength(2);
    expect(detail!.blocks[0].type).toBe('ai');
  });

  it('should compute status partial when some blocks fail', () => {
    const id = recordExecution(
      makeInput({
        success_blocks: 1,
        failed_blocks: 1,
        blocks: [
          { position: 1, type: 'ai', status: 'success', duration_ms: 100 },
          { position: 2, type: 'ai', status: 'failed', error: 'API limit', duration_ms: 100 },
        ],
      })
    );
    expect(getHistoryDetail(id)!.status).toBe('partial');
  });

  it('should cap retained records at 500', () => {
    for (let i = 0; i < 505; i++) {
      recordExecution(makeInput({ file: `doc-${i}.md` }));
    }
    const list = listHistory(1000);
    expect(list.length).toBe(500);
    // 最旧的 5 条应被删除（id 1..5 不存在）
    expect(list.some((r) => r.file === 'doc-0.md')).toBe(false);
  });

  it('should truncate error messages to 200 chars', () => {
    const longError = 'E'.repeat(500);
    const id = recordExecution(
      makeInput({
        success_blocks: 0,
        failed_blocks: 1,
        blocks: [{ position: 1, type: 'ai', status: 'failed', error: longError, duration_ms: 100 }],
      })
    );
    const detail = getHistoryDetail(id)!;
    expect(detail.blocks[0].error!.length).toBeLessThanOrEqual(200);
  });

  it('should clear all records', () => {
    recordExecution(makeInput());
    recordExecution(makeInput());
    clearHistory();
    expect(listHistory()).toHaveLength(0);
  });

  it('should return null for unknown detail id', () => {
    expect(getHistoryDetail(999)).toBeNull();
  });
});
