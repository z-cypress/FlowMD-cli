/**
 * FlowMD pipeline 命令
 * 按序执行多个文档，把上一份文档的产出变量串联给下一份
 */

import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import chalk from 'chalk';
import { parseMarkdown } from '../core/parser.js';
import { executeDocument } from '../core/executor.js';
import { t } from '../utils/i18n.js';
import type { FlowConfig, RunOptions } from '../types/index.js';

/**
 * 执行文档流水线：变量跨文档串联
 * @param files - 按序执行的文档路径列表
 * @param baseOptions - 运行选项（currentFile 按文档覆盖）
 * @param config - FlowMD 配置
 */
export async function pipelineCommand(
  files: string[],
  baseOptions: RunOptions,
  config: FlowConfig
): Promise<void> {
  let accumulated: Record<string, unknown> = {};
  const results: Array<{ file: string; ok: boolean }> = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!existsSync(file)) {
      console.error(chalk.red(t('cli.fileNotFound', { file })));
      results.push({ file, ok: false });
      if (baseOptions.failFast) break;
      continue;
    }

    if (!baseOptions.quiet) {
      console.log(chalk.blue(t('pipeline.step', { num: i + 1, total: files.length, file })));
    }

    const doc = parseMarkdown(readFileSync(file, 'utf-8'));
    const options: RunOptions = { ...baseOptions, currentFile: file };
    const result = await executeDocument(doc, options, config, accumulated);

    // 串联：合并上一份的变量与本次产出
    accumulated = { ...accumulated, ...(result.variables ?? {}) };

    // 按输出模式写出渲染结果
    if (!options.dryRun) {
      writeOutput(file, result.content, options.output);
    }

    results.push({ file, ok: !result.hasError });
    if (result.hasError && options.failFast) break;
  }

  const ok = results.filter((r) => r.ok).length;
  const failed = results.length - ok;
  if (!baseOptions.quiet) {
    if (failed > 0) {
      console.log(chalk.yellow(t('pipeline.doneFailed', { ok, total: results.length, failed })));
    } else {
      console.log(chalk.green(t('pipeline.done', { total: results.length })));
    }
  }
  if (failed > 0) {
    process.exitCode = 1;
  }
}

/**
 * 按输出模式写出渲染结果
 * @param file - 源文件路径
 * @param content - 渲染内容
 * @param mode - 输出模式
 */
function writeOutput(file: string, content: string, mode: 'inline' | 'new' | 'stdout'): void {
  if (mode === 'stdout') {
    console.log(content);
    return;
  }
  if (mode === 'inline') {
    writeFileSync(file, content, 'utf-8');
    console.log(chalk.green(t('cli.inlineWritten', { file })));
    return;
  }
  // new 模式：带时间戳的新文件
  const ext = extname(file);
  const name = basename(file, ext);
  const iso = new Date().toISOString();
  const date = iso.split('T')[0];
  const time = iso.split('T')[1].replace(/:/g, '-').slice(0, 8);
  const newFile = `${name}_${date}_${time}${ext}`;
  writeFileSync(newFile, content, 'utf-8');
  console.log(chalk.green(t('cli.newWritten', { file: newFile })));
}
