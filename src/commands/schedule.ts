/**
 * FlowMD schedule 命令
 * 定时任务管理：add / list / remove / pause / resume / run / 前台守护
 */

import { existsSync, writeFileSync, readFileSync, unlinkSync, createWriteStream, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
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

/** PID 文件路径（后台守护） */
function daemonPidPath(): string {
  return join(process.cwd(), '.flow', 'schedule.pid');
}

/** 日志文件路径（后台守护） */
function daemonLogPath(): string {
  return join(process.cwd(), '.flow', 'schedule.log');
}

/**
 * 执行 schedule 命令
 * @param args - 子命令与参数：add <name> <file> / list / remove <name> / pause|resume <name> / run <name>
 * @param opts - 选项（cron / daemon / stop 等）
 */
export async function scheduleCommand(
  args: string[],
  opts: { cron?: string; daemon?: boolean; stop?: boolean } = {}
): Promise<void> {
  // --daemon：后台守护启动（detached 子进程 + PID 文件 + 日志重定向）
  if (opts.daemon) {
    startDaemon();
    return;
  }
  // --stop：停止后台守护
  if (opts.stop) {
    stopDaemon();
    return;
  }

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
 * 后台守护启动：以 detached 子进程运行 `flowmd schedule`（前台 daemon）
 * 写入 .flow/schedule.pid，stdout/stderr 重定向到 .flow/schedule.log
 */
function startDaemon(): void {
  const pidPath = daemonPidPath();
  if (existsSync(pidPath)) {
    const existing = parseInt(readFileSync(pidPath, 'utf-8').trim(), 10);
    if (existing && isProcessAlive(existing)) {
      console.log(chalk.yellow(t('schedule.daemonRunning', { pid: existing })));
      return;
    }
    unlinkSync(pidPath);
  }

  // 重新执行当前 CLI 的 schedule 前台 daemon；entry 为构建产物 dist/index.js
  const entry = process.argv[1];
  mkdirSync(join(process.cwd(), '.flow'), { recursive: true });
  const child = spawn(process.execPath, [entry, 'schedule'], {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  // 子进程 stdout/stderr → 日志文件
  const logStream = createWriteStream(daemonLogPath(), { flags: 'a' });
  logStream.on('error', () => { /* 日志流错误不影响守护启动 */ });
  if (child.stdout) child.stdout.pipe(logStream);
  if (child.stderr) child.stderr.pipe(logStream);
  child.unref();

  writeFileSync(pidPath, String(child.pid), 'utf-8');
  console.log(chalk.green(t('schedule.daemonStartedPid', { pid: child.pid })));
  console.log(chalk.gray(t('schedule.daemonLog', { log: daemonLogPath() })));
}

/**
 * 停止后台守护（读取 PID 文件发送 SIGTERM）
 */
function stopDaemon(): void {
  const pidPath = daemonPidPath();
  if (!existsSync(pidPath)) {
    console.log(chalk.yellow(t('schedule.daemonNotRunning')));
    return;
  }
  const pid = parseInt(readFileSync(pidPath, 'utf-8').trim(), 10);
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    // 进程已不存在
  }
  unlinkSync(pidPath);
  console.log(chalk.green(t('schedule.daemonStopped', { pid })));
}

/**
 * 检查进程是否存活（信号 0 探测）
 * @param pid - 进程 ID
 * @returns 是否存活
 */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
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
