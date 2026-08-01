/**
 * History command unit tests
 * 用临时目录隔离，验证 list/detail/clear 各分支
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  recordExecution,
  type HistoryInput,
} from '../utils/history.js';
import { historyList, historyDetail, historyClear, historyCommand } from '../commands/history.js';

describe('history command', () => {
  const originalCwd = process.cwd();
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'flowmd-historycmd-test-'));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  function makeInput(): HistoryInput {
    return {
      file: 'doc.md',
      total_blocks: 2,
      success_blocks: 2,
      failed_blocks: 0,
      blocks: [
        { position: 1, type: 'ai', status: 'success', duration_ms: 100 },
        { position: 2, type: 'template', status: 'success', duration_ms: 10 },
      ],
    };
  }

  it('should print empty message when no history', () => {
    const logCalls: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      logCalls.push(args.join(' '));
    });
    historyList();
    spy.mockRestore();
    expect(logCalls.some((c) => c.includes('暂无执行记录') || c.includes('No execution history'))).toBe(true);
  });

  it('should list recorded executions', () => {
    recordExecution(makeInput());
    const logCalls: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      logCalls.push(args.join(' '));
    });
    historyList();
    spy.mockRestore();
    expect(logCalls.some((c) => c.includes('doc.md'))).toBe(true);
  });

  it('should print detail for a valid id', () => {
    const id = recordExecution(makeInput());
    const logCalls: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      logCalls.push(args.join(' '));
    });
    historyDetail(String(id));
    spy.mockRestore();
    expect(logCalls.some((c) => c.includes('doc.md'))).toBe(true);
  });

  it('should report invalid id for non-numeric input', () => {
    const errCalls: string[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...args) => {
      errCalls.push(args.join(' '));
    });
    historyDetail('abc');
    spy.mockRestore();
    expect(errCalls.some((c) => c.includes('abc'))).toBe(true);
  });

  it('should report invalid id for non-existent record', () => {
    const errCalls: string[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...args) => {
      errCalls.push(args.join(' '));
    });
    historyDetail('9999');
    spy.mockRestore();
    expect(errCalls.length).toBeGreaterThan(0);
  });

  it('should clear history and print confirmation', () => {
    recordExecution(makeInput());
    const logCalls: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      logCalls.push(args.join(' '));
    });
    historyClear();
    spy.mockRestore();
    expect(logCalls.some((c) => c.includes('已清空') || c.includes('cleared'))).toBe(true);
    // 清空后列表应为空
    const listLog: string[] = [];
    const spy2 = vi.spyOn(console, 'log').mockImplementation((...args) => {
      listLog.push(args.join(' '));
    });
    historyList();
    spy2.mockRestore();
    expect(listLog.some((c) => c.includes('暂无执行记录') || c.includes('No execution history'))).toBe(true);
  });

  it('should dispatch clear via historyCommand', async () => {
    const logCalls: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      logCalls.push(args.join(' '));
    });
    await historyCommand({ clear: true });
    spy.mockRestore();
    expect(logCalls.some((c) => c.includes('已清空') || c.includes('cleared'))).toBe(true);
  });
});
