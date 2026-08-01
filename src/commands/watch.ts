/**
 * FlowMD watch 命令
 * 监听 Markdown 文件变化并自动重新执行
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import chokidar from 'chokidar';
import type { FSWatcher } from 'chokidar';
import chalk from 'chalk';
import { parseMarkdown } from '../core/parser.js';
import { executeDocument } from '../core/executor.js';
import { loadConfig } from '../utils/config.js';
import { t } from '../utils/i18n.js';
import type { RunOptions, FlowConfig } from '../types/index.js';

/** 执行锁：防止并发执行 */
let isExecuting = false;

/** 待执行标记：有新的变更等待处理 */
let pendingExecution = false;

/** 当前活动的 watcher（供 SIGINT 处理关闭） */
let activeWatcher: FSWatcher | null = null;

/** SIGINT 处理器是否已注册（避免多次注册导致监听器泄漏） */
let sigintRegistered = false;

/**
 * 注册 SIGINT 优雅退出处理器（只注册一次）
 */
function registerSigintHandler(): void {
  if (sigintRegistered) return;
  process.on('SIGINT', () => {
    activeWatcher?.close();
    process.exit(0);
  });
  sigintRegistered = true;
}

/**
 * 执行 watch 命令
 * @param file - 要监听的 Markdown 文件
 */
export async function watchCommand(file: string, opts?: Partial<RunOptions> | string): Promise<void> {
  const config: FlowConfig = loadConfig();
  // 兼容旧的字符串参数
  let runOptions: RunOptions;
  if (typeof opts === 'string' || opts === undefined) {
    runOptions = {
      output: (opts || 'new') as 'inline' | 'new' | 'stdout',
      dryRun: false,
      stepMode: false,
      failFast: false,
      debug: false,
      release: false,
      quiet: false,
      varArgs: {},
    };
  } else {
    runOptions = {
      output: opts.output || 'new',
      dryRun: opts.dryRun || false,
      stepMode: opts.stepMode || false,
      failFast: opts.failFast || false,
      debug: opts.debug || false,
      release: opts.release || false,
      quiet: opts.quiet || false,
      varArgs: opts.varArgs || {},
      varFile: opts.varFile,
      runYes: opts.runYes,
      runStrict: opts.runStrict,
    };
  }

  // 初始执行
  console.log(chalk.blue(t('watch.started')));
  console.log(chalk.gray(t('cli.file', { file })));
  console.log('');

  await executeFile(file, config, runOptions);

  // 监听文件变化
  const watcher = chokidar.watch(file, {
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 300,
      pollInterval: 100,
    },
  });
  activeWatcher = watcher;
  registerSigintHandler();

  watcher.on('change', async () => {
    // 如果正在执行，标记有待处理的变更
    if (isExecuting) {
      pendingExecution = true;
      return;
    }

    isExecuting = true;
    console.clear();
    console.log(chalk.blue(t('watch.reexecuting')));
    console.log('');

    await executeFile(file, config, runOptions);

    // 检查是否有待处理的变更
    while (pendingExecution) {
      pendingExecution = false;
      console.clear();
      console.log(chalk.blue(t('watch.reexecuting')));
      console.log('');
      await executeFile(file, config, runOptions);
    }

    isExecuting = false;
    console.log('');
    console.log(chalk.cyan(t('watch.listening')));
  });

  console.log('');
  console.log(chalk.cyan(t('watch.listening')));
}

/**
 * 执行单个文件
 * @param file - 文件路径
 * @param config - 配置
 * @param options - 运行选项
 */
async function executeFile(
  file: string,
  config: FlowConfig,
  options: RunOptions
): Promise<void> {
  try {
    const content = readFileSync(file, 'utf-8');
    const doc = parseMarkdown(content);

    console.log(chalk.gray(t('logger.foundBlocks', { count: doc.blocks.length })));
    console.log('');

    const startTime = Date.now();
    options.currentFile = file;
    const { content: rendered } = await executeDocument(doc, options, config);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    if (options.output === 'stdout') {
      console.log('');
      console.log(rendered);
      console.log('');
      console.log(chalk.gray(t('watch.elapsed', { seconds: elapsed })));
    } else if (options.output === 'inline') {
      writeFileSync(file, rendered, 'utf-8');
      console.log('');
      console.log(chalk.green(t('watch.inlineWritten', { file, seconds: elapsed })));
    } else {
      const ext = extname(file);
      const name = basename(file, ext);
      const date = new Date().toISOString().split('T')[0];
      const time = new Date().toISOString().split('T')[1].replace(/:/g, '-').slice(0, 8);
      const newFile = `${name}_${date}_${time}${ext}`;
      writeFileSync(newFile, rendered, 'utf-8');
      console.log('');
      console.log(chalk.green(t('watch.newWritten', { file: newFile, seconds: elapsed })));
    }
  } catch (error) {
    console.error(chalk.red(t('cli.runFailed', { error: error instanceof Error ? error.message : String(error) })));
  }
}
