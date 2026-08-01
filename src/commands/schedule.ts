/**
 * FlowMD schedule 命令
 * 定时任务管理：add / list / remove / pause / resume / run / 前台守护
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import type { ScheduledTask } from 'node-cron';
import {
  addSchedule, listSchedules, getSchedule, removeSchedule, setScheduleEnabled,
} from '../core/schedule/schedule-db.js';
import type { ScheduleTask } from '../core/schedule/schedule-db.js';
import { scheduleTask, runOnce, isValidCron } from '../core/schedule/scheduler.js';
import { t } from '../utils/i18n.js';

/** 记录已注册任务名（避免重复注册） */
const running = new Set<string>();

/**
 * 执行 schedule 命令
 * @param args - 子命令与参数：add <name> <file> / list / remove <name> / pause|resume <name> / run <name>
 * @param opts - 选项（cron 等）
 */
export async function scheduleCommand(
  args: string[],
  opts: { cron?: string } = {}
): Promise<void> {
  const sub = args[0];

  // 无子命令 → 前台守护运行
  if (!sub) {
    await runDaemon();
    return;
  }

  switch (sub) {
    case 'add':
      await addTask(args[1], args[2], opts.cron);
      break;
    case 'list':
      printList();
      break;
    case 'remove':
      await removeTask(args[1]);
      break;
    case 'pause':
      await toggleTask(args[1], false);
      break;
    case 'resume':
      await toggleTask(args[1], true);
      break;
    case 'run':
      await runTask(args[1]);
      break;
    default:
      console.error(chalk.red(t('schedule.unknownSub', { sub })));
      process.exit(1);
  }
}

/**
 * 前台守护运行：加载已启用任务，按 cron 触发
 */
async function runDaemon(): Promise<void> {
  const tasks = listSchedules();
  const enabled = tasks.filter((task) => task.enabled);

  if (tasks.length === 0) {
    console.log(chalk.yellow(t('schedule.empty')));
    return;
  }
  if (enabled.length === 0) {
    console.log(chalk.yellow(t('schedule.noneEnabled')));
    return;
  }

  console.log(chalk.blue(t('schedule.daemonStarted')));
  const handles: ScheduledTask[] = [];

  for (const task of enabled) {
    const handle = scheduleTask(task, running);
    if (handle) handles.push(handle);
  }

  console.log(chalk.gray(t('schedule.exitHint')));

  // 优雅退出：node-cron 的定时器会保持事件循环存活，这里只注册退出处理
  const shutdown = (): void => {
    console.log('');
    console.log(chalk.gray(t('schedule.stopped')));
    for (const h of handles) h.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // 保持进程存活（定时器触发间隔 > 事件循环空转阈值时也需要常驻句柄）
  await new Promise<void>(() => {});
}

/**
 * 新增任务
 * @param name - 任务名
 * @param fileArg - 要执行的文档路径
 * @param cronExpr - cron 表达式
 */
async function addTask(
  name: string | undefined,
  fileArg: string | undefined,
  cronExpr: string | undefined
): Promise<void> {
  if (!name || !fileArg || !cronExpr) {
    console.error(chalk.red(t('schedule.addUsage')));
    process.exit(1);
  }
  if (!isValidCron(cronExpr)) {
    console.error(chalk.red(t('schedule.invalidCronArg', { cron: cronExpr })));
    process.exit(1);
  }
  // 支持绝对路径或相对 cwd 的路径
  const fullPath = fileArg.startsWith('/') ? fileArg : join(process.cwd(), fileArg);
  if (!existsSync(fullPath)) {
    console.error(chalk.red(t('schedule.fileNotFound', { file: fileArg })));
    process.exit(1);
  }

  try {
    const id = addSchedule({ name: name.trim(), file: fullPath, cron: cronExpr });
    console.log(chalk.green(t('schedule.added', { id, name: name.trim(), cron: cronExpr })));
  } catch (error) {
    console.error(chalk.red(t('schedule.addFailed', { error: error instanceof Error ? error.message : String(error) })));
    process.exit(1);
  }
}

/**
 * 打印任务列表
 */
function printList(): void {
  const tasks = listSchedules();
  if (tasks.length === 0) {
    console.log(chalk.yellow(t('schedule.empty')));
    return;
  }

  console.log(chalk.blue(t('schedule.listTitle')));
  for (const task of tasks) {
    const statusIcon = task.enabled ? '🟢' : '⏸';
    const lastRun = task.last_run_at
      ? ` ${task.last_status === 'success' ? '✅' : '❌'} ${task.last_run_at}`
      : '';
    console.log(
      ` ${statusIcon} ${task.name.padEnd(16)} ${task.cron.padEnd(16)} ${task.file}${lastRun}`
    );
  }
}

/**
 * 删除任务
 * @param name - 任务名
 */
async function removeTask(name: string | undefined): Promise<void> {
  if (!name) {
    console.error(chalk.red(t('schedule.needName')));
    process.exit(1);
  }
  if (removeSchedule(name)) {
    running.delete(name);
    console.log(chalk.green(t('schedule.removed', { name })));
  } else {
    console.error(chalk.red(t('schedule.notFound', { name })));
    process.exit(1);
  }
}

/**
 * 暂停/恢复任务
 * @param name - 任务名
 * @param enabled - 是否启用
 */
async function toggleTask(name: string | undefined, enabled: boolean): Promise<void> {
  if (!name) {
    console.error(chalk.red(t('schedule.needName')));
    process.exit(1);
  }
  if (setScheduleEnabled(name, enabled)) {
    running.delete(name);
    console.log(chalk.green(
      enabled ? t('schedule.resumed', { name }) : t('schedule.paused', { name })
    ));
  } else {
    console.error(chalk.red(t('schedule.notFound', { name })));
    process.exit(1);
  }
}

/**
 * 立即执行一次（调试）
 * @param name - 任务名
 */
async function runTask(name: string | undefined): Promise<void> {
  if (!name) {
    console.error(chalk.red(t('schedule.needName')));
    process.exit(1);
  }
  const task: ScheduleTask | null = getSchedule(name);
  if (!task) {
    console.error(chalk.red(t('schedule.notFound', { name })));
    process.exit(1);
  }
  const ok = await runOnce(task);
  if (!ok) process.exitCode = 1;
}
