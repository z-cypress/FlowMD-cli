/**
 * FlowMD schedule 调度器
 * 加载已启用任务到 node-cron，按 cron 触发执行文档，记录结果（ADR-010）
 */

import { readFileSync } from 'node:fs';
import cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import chalk from 'chalk';
import { parseMarkdown } from '../parser.js';
import { executeDocument } from '../executor.js';
import { loadConfig } from '../../utils/config.js';
import { t } from '../../utils/i18n.js';
import type { ScheduleTask } from './schedule-db.js';
import { updateScheduleStatus } from './schedule-db.js';
import type { RunOptions } from '../../types/index.js';

/**
 * 执行一次定时任务：读取文件 → executeDocument → 写历史 → 更新状态
 * @param task - 任务
 * @returns 执行是否成功
 */
export async function runScheduledTask(task: ScheduleTask): Promise<boolean> {
  const startTime = Date.now();
  try {
    const content = readFileSync(task.file, 'utf-8');
    const doc = parseMarkdown(content);
    const config = loadConfig();

    const options: RunOptions = {
      output: 'stdout',
      dryRun: false,
      stepMode: false,
      failFast: false,
      debug: false,
      release: true,
      quiet: true,
      varArgs: {},
      currentFile: task.file,
      runYes: true,
    };

    const { hasError } = await executeDocument(doc, options, config);

    const durationMs = Date.now() - startTime;
    updateScheduleStatus(task.name, hasError ? 'failed' : 'success');

    if (hasError) {
      console.log(chalk.red(t('schedule.triggerFailed', { name: task.name, file: task.file })));
    } else {
      console.log(chalk.green(t('schedule.triggerDone', { name: task.name, file: task.file, seconds: (durationMs / 1000).toFixed(1) })));
    }
    return !hasError;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    updateScheduleStatus(task.name, 'failed');
    console.log(chalk.red(t('schedule.triggerError', { name: task.name, error: message })));
    return false;
  }
}

/**
 * 校验 cron 表达式是否合法
 * @param cronExpr - cron 表达式
 * @returns 是否合法
 */
export function isValidCron(cronExpr: string): boolean {
  try {
    return cron.validate(cronExpr);
  } catch {
    return false;
  }
}

/**
 * 注册一个任务到调度器
 * @param task - 任务
 * @param running - 是否已在运行（避免重复注册）
 * @returns 定时任务句柄，null 表示未注册（非法 cron / 未启用）
 */
export function scheduleTask(task: ScheduleTask, running: Set<string>): ScheduledTask | null {
  if (!task.enabled) return null;
  if (running.has(task.name)) return null;
  if (!isValidCron(task.cron)) {
    console.log(chalk.yellow(t('schedule.invalidCron', { name: task.name, cron: task.cron })));
    return null;
  }

  const handle = cron.schedule(task.cron, () => {
    void runScheduledTask(task);
  });
  running.add(task.name);
  console.log(chalk.gray(t('schedule.registered', { name: task.name, cron: task.cron, file: task.file })));
  return handle;
}

/**
 * 立即执行一次（用于 schedule run <name> 调试）
 * @param task - 任务
 * @returns 执行是否成功
 */
export async function runOnce(task: ScheduleTask): Promise<boolean> {
  return runScheduledTask(task);
}
