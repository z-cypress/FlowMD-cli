/**
 * FlowMD test 命令
 * 文档快照测试：执行文档并比对 .flow/snapshots/ 中的 golden file
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import chalk from 'chalk';
import { parseMarkdown } from '../core/parser.js';
import { executeDocument } from '../core/executor.js';
import { loadConfig } from '../utils/config.js';
import { t } from '../utils/i18n.js';
import type { FlowConfig, RunOptions } from '../types/index.js';

/** 快照目录名 */
const SNAPSHOTS_DIR = '.flow/snapshots';

/**
 * 获取快照文件路径
 * @param file - 源文档路径
 * @param projectRoot - 项目根目录
 * @returns 快照文件绝对路径
 */
function snapshotPath(file: string, projectRoot: string): string {
  const name = basename(file, extname(file));
  return join(projectRoot, SNAPSHOTS_DIR, `${name}.snap`);
}

/**
 * 读取快照内容
 * @param snapFile - 快照文件路径
 * @returns 快照内容，不存在返回 null
 */
function readSnapshot(snapFile: string): string | null {
  if (!existsSync(snapFile)) return null;
  try {
    const raw = readFileSync(snapFile, 'utf-8');
    // 跳过元数据头（以 # 开头的行），返回实际内容
    const lines = raw.split('\n');
    const separatorIndex = lines.indexOf('---');
    if (separatorIndex === -1) return raw;
    return lines.slice(separatorIndex + 1).join('\n');
  } catch {
    return null;
  }
}

/**
 * 写入快照
 * @param snapFile - 快照文件路径
 * @param sourceFile - 源文件名
 * @param content - 快照内容
 */
function writeSnapshot(snapFile: string, sourceFile: string, content: string): void {
  mkdirSync(join(snapFile, '..'), { recursive: true });
  const header = [
    '# flowmd snapshot',
    `# file: ${basename(sourceFile)}`,
    `# updated: ${new Date().toISOString()}`,
    '---',
  ].join('\n');
  writeFileSync(snapFile, header + '\n' + content, 'utf-8');
}

/**
 * 计算简单行级 diff
 * @param expected - 期望内容
 * @param actual - 实际内容
 * @returns diff 输出
 */
function computeDiff(expected: string, actual: string): string {
  const expectedLines = expected.split('\n');
  const actualLines = actual.split('\n');
  const diff: string[] = [];

  const maxLen = Math.max(expectedLines.length, actualLines.length);
  for (let i = 0; i < maxLen; i++) {
    const e = expectedLines[i];
    const a = actualLines[i];
    if (e === a) {
      diff.push(chalk.gray(`  ${i + 1}: ${e}`));
    } else {
      if (e !== undefined) diff.push(chalk.red(`- ${i + 1}: ${e}`));
      if (a !== undefined) diff.push(chalk.green(`+ ${i + 1}: ${a}`));
    }
  }
  return diff.join('\n');
}

/**
 * test 命令入口
 * @param file - 源文档路径
 * @param options - 选项
 */
export async function testCommand(
  file: string,
  options: { update?: boolean; varsFile?: string }
): Promise<void> {
  const projectRoot = process.cwd();
  const snapFile = snapshotPath(file, projectRoot);

  // 执行文档
  const content = readFileSync(file, 'utf-8');
  const doc = parseMarkdown(content);
  const config: FlowConfig = loadConfig();
  const runOptions: RunOptions = {
    output: 'stdout',
    dryRun: false,
    stepMode: false,
    failFast: false,
    debug: false,
    release: false,
    quiet: true,
    varArgs: {},
    currentFile: file,
  };

  // 注入变量：交给 executor 处理（--vars-file 等价于 --var-file，保留 YAML/JSON 类型）
  if (options.varsFile) {
    runOptions.varFile = options.varsFile;
  }

  const result = await executeDocument(doc, runOptions, config);

  // --update 模式：直接更新快照
  if (options.update) {
    writeSnapshot(snapFile, file, result.content);
    console.log(chalk.green(t('test.snapshotUpdated', { file: basename(file) })));
    return;
  }

  // 比对模式
  const existing = readSnapshot(snapFile);
  if (!existing) {
    writeSnapshot(snapFile, file, result.content);
    console.log(chalk.yellow(t('test.snapshotCreated', { file: basename(file) })));
    return;
  }

  if (existing === result.content) {
    console.log(chalk.green(t('test.passed', { file: basename(file) })));
  } else {
    console.log(chalk.red(t('test.failed', { file: basename(file) })));
    console.log('');
    console.log(computeDiff(existing, result.content));
    process.exitCode = 1;
  }
}
