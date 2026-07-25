/**
 * FlowMD watch 命令
 * 监听 Markdown 文件变化并自动重新执行
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import chokidar from 'chokidar';
import chalk from 'chalk';
import { parseMarkdown } from '../core/parser.js';
import { executeDocument } from '../core/executor.js';
import { loadConfig } from '../utils/config.js';
import type { RunOptions, FlowConfig } from '../types/index.js';

/** 执行锁：防止并发执行 */
let isExecuting = false;

/** 待执行标记：有新的变更等待处理 */
let pendingExecution = false;

/**
 * 执行 watch 命令
 * @param file - 要监听的 Markdown 文件
 */
export async function watchCommand(file: string, outputMode: string = 'new'): Promise<void> {
  const config: FlowConfig = loadConfig();
  const runOptions: RunOptions = {
    output: outputMode as 'inline' | 'new' | 'stdout',
    dryRun: false,
    stepMode: false,
    failFast: false,
    debug: false,
    release: false,
    varArgs: {},
  };

  // 初始执行
  console.log(chalk.blue('🚀 FlowMD 开始监听'));
  console.log(chalk.gray(`📄 文件: ${file}`));
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

  watcher.on('change', async () => {
    // 如果正在执行，标记有待处理的变更
    if (isExecuting) {
      pendingExecution = true;
      return;
    }

    isExecuting = true;
    console.clear();
    console.log(chalk.blue('🔄 文件变化，重新执行...'));
    console.log('');

    await executeFile(file, config, runOptions);

    // 检查是否有待处理的变更
    while (pendingExecution) {
      pendingExecution = false;
      console.clear();
      console.log(chalk.blue('🔄 文件变化，重新执行...'));
      console.log('');
      await executeFile(file, config, runOptions);
    }

    isExecuting = false;
    console.log('');
    console.log(chalk.cyan('👀 正在监听... (Ctrl+C 退出)'));
  });

  // 优雅退出
  process.on('SIGINT', () => {
    watcher.close();
    process.exit(0);
  });

  console.log('');
  console.log(chalk.cyan('👀 正在监听... (Ctrl+C 退出)'));
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

    console.log(chalk.gray(`📦 找到 ${doc.blocks.length} 个代码块`));
    console.log('');

    const startTime = Date.now();
    const result = await executeDocument(doc, options, config);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    if (options.output === 'stdout') {
      console.log('');
      console.log(result);
      console.log('');
      console.log(chalk.gray(`⏱ ${elapsed}s`));
    } else if (options.output === 'inline') {
      writeFileSync(file, result, 'utf-8');
      console.log('');
      console.log(chalk.green(`✅ 已覆盖: ${file} (${elapsed}s)`));
    } else {
      const ext = extname(file);
      const name = basename(file, ext);
      const date = new Date().toISOString().split('T')[0];
      const time = new Date().toISOString().split('T')[1].replace(/:/g, '-').slice(0, 8);
      const newFile = `${name}_${date}_${time}${ext}`;
      writeFileSync(newFile, result, 'utf-8');
      console.log('');
      console.log(chalk.green(`✅ 已写入: ${newFile} (${elapsed}s)`));
    }
  } catch (error) {
    console.error(chalk.red(`❌ 执行失败: ${error instanceof Error ? error.message : String(error)}`));
  }
}
