/**
 * schedule 定时任务测试
 * 用临时目录隔离 schedule.db，验证 CRUD / 状态更新 / cron 校验 / 触发执行
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  addSchedule, listSchedules, getSchedule, removeSchedule, setScheduleEnabled, updateScheduleStatus,
} from '../core/schedule/schedule-db.js';
import { isValidCron, runScheduledTask } from '../core/schedule/scheduler.js';

// Mock history 避免写真实 .flow/history
vi.mock('../utils/history.js', () => ({
  recordExecution: vi.fn(),
}));

// Mock ai/data block executors（避免真实调用）
vi.mock('../core/blocks/ai-block.js', () => ({
  executeAIBlock: vi.fn().mockResolvedValue({ success: true, output: 'ok', duration: 5 }),
}));
vi.mock('../core/blocks/template-block.js', () => ({
  executeTemplateBlock: vi.fn().mockResolvedValue({ success: true, output: 'ok', duration: 5 }),
}));
vi.mock('ora', () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    text: '',
  })),
}));

describe('schedule module', () => {
  const originalCwd = process.cwd();
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'flowmd-schedule-test-'));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('schedule-db CRUD', () => {
    it('should add and list a task', () => {
      const id = addSchedule({ name: 'nightly', file: 'report.md', cron: '0 17 * * 5' });
      expect(id).toBeGreaterThan(0);
      const list = listSchedules();
      expect(list).toHaveLength(1);
      expect(list[0].name).toBe('nightly');
      expect(list[0].cron).toBe('0 17 * * 5');
      expect(list[0].enabled).toBe(1);
    });

    it('should reject duplicate names', () => {
      addSchedule({ name: 'nightly', file: 'a.md', cron: '0 17 * * 5' });
      expect(() => addSchedule({ name: 'nightly', file: 'b.md', cron: '0 0 * * *' }))
        .toThrow(/UNIQUE|nightly/);
    });

    it('should get task by name', () => {
      addSchedule({ name: 'nightly', file: 'report.md', cron: '0 17 * * 5' });
      const task = getSchedule('nightly');
      expect(task).not.toBeNull();
      expect(task!.file).toBe('report.md');
      expect(getSchedule('missing')).toBeNull();
    });

    it('should remove a task', () => {
      addSchedule({ name: 'nightly', file: 'a.md', cron: '0 17 * * 5' });
      expect(removeSchedule('nightly')).toBe(true);
      expect(removeSchedule('nightly')).toBe(false);
      expect(listSchedules()).toHaveLength(0);
    });

    it('should pause and resume a task', () => {
      addSchedule({ name: 'nightly', file: 'a.md', cron: '0 17 * * 5' });
      expect(setScheduleEnabled('nightly', false)).toBe(true);
      expect(listSchedules()[0].enabled).toBe(0);
      expect(setScheduleEnabled('nightly', true)).toBe(true);
      expect(listSchedules()[0].enabled).toBe(1);
      expect(setScheduleEnabled('missing', true)).toBe(false);
    });

    it('should update last run status', () => {
      addSchedule({ name: 'nightly', file: 'a.md', cron: '0 17 * * 5' });
      updateScheduleStatus('nightly', 'success');
      const task = getSchedule('nightly')!;
      expect(task.last_status).toBe('success');
      expect(task.last_run_at).not.toBeNull();
    });
  });

  describe('cron validation', () => {
    it('should accept valid 5-field cron expressions', () => {
      expect(isValidCron('0 17 * * 5')).toBe(true);
      expect(isValidCron('*/5 * * * *')).toBe(true);
      expect(isValidCron('30 8 * * 1-5')).toBe(true);
    });

    it('should reject invalid cron expressions', () => {
      expect(isValidCron('not a cron')).toBe(false);
      expect(isValidCron('61 * * * *')).toBe(false);
    });
  });

  describe('runScheduledTask', () => {
    it('should execute the task file and return success', async () => {
      writeFileSync(join(tempDir, 'report.md'), '# Report\n\n```template\nDone {{date}}\n```');
      const id = addSchedule({ name: 'task', file: join(tempDir, 'report.md'), cron: '* * * * *' });

      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const ok = await runScheduledTask(getSchedule('task')!);
      spy.mockRestore();

      expect(ok).toBe(true);
      expect(getSchedule('task')!.last_status).toBe('success');
      expect(id).toBeGreaterThan(0);
    });

    it('should mark failed when file is missing', async () => {
      addSchedule({ name: 'task', file: join(tempDir, 'missing.md'), cron: '* * * * *' });
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const ok = await runScheduledTask(getSchedule('task')!);
      spy.mockRestore();
      expect(ok).toBe(false);
      expect(getSchedule('task')!.last_status).toBe('failed');
    });
  });
});
