#!/usr/bin/env node

/**
 * FlowMD CLI 入口
 * 执行 Markdown 文件中的特殊代码块
 */

import { Command } from 'commander';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename, extname } from 'node:path';
import chalk from 'chalk';
import { parseMarkdown } from './core/parser.js';
import { executeDocument } from './core/executor.js';
import { loadConfig } from './utils/config.js';
import { watchCommand } from './commands/watch.js';
import { initCommand } from './commands/init.js';
import { newCommand } from './commands/new.js';
import { configGet, configSet } from './commands/config.js';
import { doctorCommand } from './commands/doctor.js';
import type { RunOptions, FlowConfig } from './types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** 从 stdin 读取全部内容 */
function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    if (process.stdin.isPaused()) process.stdin.resume();
    process.stdin.on('data', (chunk: Buffer) => chunks.push(chunk));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    process.stdin.on('error', (err) => reject(err));
  });
}

/** 收集重复的 --var 选项为数组 */
function collectVarArgs(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

/** 将 ['key=value', 'k=v'] 解析为 Record */
function parseVarArgs(args: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const arg of args) {
    const eqIdx = arg.indexOf('=');
    if (eqIdx > 0) {
      map[arg.slice(0, eqIdx)] = arg.slice(eqIdx + 1);
    }
  }
  return map;
}

// 安全读取 package.json
let version = '0.0.0';
try {
  const packageJsonPath = join(__dirname, '..', 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  version = packageJson.version || version;
} catch {
  // 如果 package.json 不存在或解析失败，使用默认版本
}

// 全局未捕获异常处理
process.on('uncaughtException', (error) => {
  console.error(chalk.red(`\n❌ 未捕获异常: ${error.message}`));
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error(chalk.red(`\n❌ 未处理的 Promise 拒绝: ${reason}`));
  process.exit(1);
});

const program = new Command();

program
  .name('flowmd')
  .description('执行 Markdown 文件中的特殊代码块')
  .version(version);

program
  .command('run')
  .description('Execute a markdown document')
  .argument('[file]', 'Markdown file to execute (omit to read from stdin)')
  .option('-o, --output <mode>', 'Output mode: inline | new | stdout', 'new')
  .option('-d, --dry-run', 'Dry run mode, skip execution', false)
  .option('-s, --step', 'Step mode, wait for user input between blocks', false)
  .option('-f, --fail-fast', 'Stop on first error', false)
  .option('--debug', 'Debug mode, show execution results', false)
  .option('--release', 'Release mode, remove all code blocks from output', false)
  .option('--var <key=value>', 'Inject variable (can be used multiple times)', collectVarArgs, [])
  .option('--var-file <path>', 'Variable file in YAML or JSON format')
  .action(async (file: string, options: { output: string; dryRun: boolean; step: boolean; stepMode: boolean; failFast: boolean; debug: boolean; release: boolean; var: string[]; varFile: string }) => {
    try {
      // Read content: 从文件或 stdin
      let content: string;
      if (file) {
        if (!existsSync(file)) {
          console.error(chalk.red(`❌ 文件不存在: ${file}`));
          process.exit(1);
        }
        content = readFileSync(file, 'utf-8');
      } else {
        // 从 stdin 读取
        content = await readStdin();
      }

      // Parse markdown
      const doc = parseMarkdown(content);

      // Load config
      const config: FlowConfig = loadConfig();

      // Run options
      const runOptions: RunOptions = {
        output: options.output as 'inline' | 'new' | 'stdout',
        dryRun: options.dryRun,
        stepMode: options.step || options.stepMode,
        failFast: options.failFast,
        debug: options.debug,
        release: options.release,
        varArgs: parseVarArgs(options.var || []),
        varFile: options.varFile,
      };

      console.log(chalk.blue('🚀 FlowMD 开始执行'));
      console.log(chalk.gray(`📄 文件: ${file || 'stdin'}`));
      console.log(chalk.gray(`📦 找到 ${doc.blocks.length} 个代码块`));
      console.log('');

      // Execute document
      const result = await executeDocument(doc, runOptions, config);

      // dry-run 模式不写入文件
      if (runOptions.dryRun) {
        console.log(chalk.gray('🔍 试运行完成，未写入任何文件'));
        return;
      }

      // Handle output
      if (runOptions.output === 'stdout') {
        console.log('');
        console.log(result);
      } else if (runOptions.output === 'inline') {
        writeFileSync(file, result, 'utf-8');
        console.log('');
        console.log(chalk.green(`✅ 已覆盖原文件: ${file}`));
      } else {
        // new mode - write to new file
        const ext = extname(file);
        const name = basename(file, ext);
        const date = new Date().toISOString().split('T')[0];
        const newFile = `${name}_${date}${ext}`;
        writeFileSync(newFile, result, 'utf-8');
        console.log('');
        console.log(chalk.green(`✅ 已写入新文件: ${newFile}`));
      }

      console.log(chalk.green('✨ 执行完成'));
    } catch (error) {
      console.error(chalk.red(`❌ 执行失败: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

program
  .command('watch')
  .description('Watch file and re-execute on changes')
  .argument('<file>', 'Markdown file to watch')
  .option('-o, --output <mode>', 'Output mode: inline | new | stdout', 'new')
  .option('-d, --dry-run', 'Dry run mode, skip execution', false)
  .option('-s, --step', 'Step mode, wait for user input between blocks', false)
  .option('-f, --fail-fast', 'Stop on first error', false)
  .option('--debug', 'Debug mode, show execution results', false)
  .option('--release', 'Release mode, remove all code blocks from output', false)
  .action(async (file: string, options: { output: string; dryRun: boolean; step: boolean; failFast: boolean; debug: boolean; release: boolean }) => {
    try {
      await watchCommand(file, {
        output: options.output as 'inline' | 'new' | 'stdout',
        dryRun: options.dryRun,
        stepMode: options.step,
        failFast: options.failFast,
        debug: options.debug,
        release: options.release,
        varArgs: {},
      });
    } catch (error) {
      console.error(chalk.red(`❌ 监听失败: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

program
  .command('init')
  .description('Create .flow/ config directory')
  .action(async () => {
    try {
      await initCommand();
    } catch (error) {
      console.error(chalk.red(`❌ 初始化失败: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

program
  .command('new')
  .description('Create new document from template')
  .argument('<name>', 'Document name')
  .action(async (name: string) => {
    try {
      await newCommand(name);
    } catch (error) {
      console.error(chalk.red(`❌ 创建失败: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

program
  .command('config')
  .description('View or modify configuration')
  .argument('[key]', 'Config key path (e.g. llm.model)')
  .option('-s, --set <value>', 'Set config value')
  .action((key: string | undefined, options: { set?: string }) => {
    if (options.set !== undefined) {
      if (!key) {
        console.error(chalk.red('❌ 请指定要设置的键，如: flowmd config llm.model --set gpt-4o'));
        process.exit(1);
      }
      configSet(key, options.set);
    } else {
      configGet(key);
    }
  });

program
  .command('doctor')
  .description('Diagnose environment')
  .action(async () => {
    await doctorCommand();
  });

program.parse();
