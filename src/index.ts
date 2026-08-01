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
import { t, setLang, type Lang } from './utils/i18n.js';
import { watchCommand } from './commands/watch.js';
import { initCommand } from './commands/init.js';
import { newCommand } from './commands/new.js';
import { configGet, configSet } from './commands/config.js';
import { doctorCommand } from './commands/doctor.js';
import { historyCommand } from './commands/history.js';
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
  console.error(chalk.red(`\n${t('error.uncaught', { error: error.message })}`));
  process.exit(2);
});

process.on('unhandledRejection', (reason) => {
  console.error(chalk.red(`\n${t('error.unhandledRejection', { error: String(reason) })}`));
  process.exit(2);
});

/** 校验并规范化语言值 */
function normalizeLang(value: string | undefined): Lang | null {
  if (value === 'en' || value === 'zh') return value;
  return null;
}

/** 解析 CLI 语言选项：--lang > 配置 cli.lang > 自动检测 */
function resolveLang(langArg?: string): void {
  const fromArg = normalizeLang(langArg);
  if (fromArg) {
    setLang(fromArg);
    return;
  }
  try {
    const config = loadConfig();
    const fromConfig = normalizeLang(config.cli?.lang);
    if (fromConfig) {
      setLang(fromConfig);
      return;
    }
  } catch {
    // 配置加载失败时回退到自动检测
  }
  setLang(null);
}

const program = new Command();

program
  .name('flowmd')
  .description(t('cli.description'))
  .version(version)
  .option('--lang <zh|en>', 'Output language (zh | en)');

program.hook('preAction', (thisCommand) => {
  const lang = (thisCommand.opts() as { lang?: string }).lang ?? (program.opts() as { lang?: string }).lang;
  resolveLang(lang);
});

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
  .option('-q, --quiet', 'Quiet mode, suppress progress output', false)
  .option('--var <key=value>', 'Inject variable (can be used multiple times)', collectVarArgs, [])
  .option('--var-file <path>', 'Variable file in YAML, JSON, or .env format')
  .option('--yes', 'Skip run block execution confirmation', false)
  .option('--strict', 'Force run block execution confirmation every time', false)
  .action(async (file: string, options: { output: string; dryRun: boolean; step: boolean; stepMode: boolean; failFast: boolean; debug: boolean; release: boolean; quiet: boolean; var: string[]; varFile: string; yes: boolean; strict: boolean }) => {
    try {
      // Read content: 从文件或 stdin
      let content: string;
      if (file) {
        if (!existsSync(file)) {
          console.error(chalk.red(t('cli.fileNotFound', { file })));
          process.exit(2);
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
        quiet: options.quiet,
        varArgs: parseVarArgs(options.var || []),
        varFile: options.varFile,
        currentFile: file || undefined,
        runYes: options.yes,
        runStrict: options.strict,
      };

      if (!runOptions.quiet) {
        console.log(chalk.blue(t('cli.banner')));
        console.log(chalk.gray(t('cli.file', { file: file || t('cli.stdin') })));
        console.log(chalk.gray(t('cli.foundBlocks', { count: doc.blocks.length })));
        console.log('');
      }

      // Execute document
      const { content: rendered, hasError } = await executeDocument(doc, runOptions, config);

      // dry-run 模式不写入文件
      if (runOptions.dryRun) {
        if (!runOptions.quiet) console.log(chalk.gray(t('cli.dryRunDone')));
        return;
      }

      // Handle output
      if (runOptions.output === 'stdout') {
        if (!runOptions.quiet) console.log('');
        console.log(rendered);
      } else if (runOptions.output === 'inline') {
        writeFileSync(file, rendered, 'utf-8');
        console.log('');
        console.log(chalk.green(t('cli.inlineWritten', { file })));
      } else {
        // new mode - write to new file（带时间戳，避免同日多次运行相互覆盖）
        const ext = extname(file);
        const name = basename(file, ext);
        const iso = new Date().toISOString();
        const date = iso.split('T')[0];
        const time = iso.split('T')[1].replace(/:/g, '-').slice(0, 8);
        const newFile = `${name}_${date}_${time}${ext}`;
        writeFileSync(newFile, rendered, 'utf-8');
        console.log('');
        console.log(chalk.green(t('cli.newWritten', { file: newFile })));
      }

      if (!runOptions.quiet) console.log(chalk.green(t('cli.done')));

      // 块级失败：部分失败退出码 1
      if (hasError) {
        process.exitCode = 1;
      }
    } catch (error) {
      console.error(chalk.red(t('cli.runFailed', { error: error instanceof Error ? error.message : String(error) })));
      process.exit(2);
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
  .option('-q, --quiet', 'Quiet mode, suppress progress output', false)
  .option('--var <key=value>', 'Inject variable (can be used multiple times)', collectVarArgs, [])
  .option('--var-file <path>', 'Variable file in YAML, JSON, or .env format')
  .option('--yes', 'Skip run block execution confirmation', false)
  .option('--strict', 'Force run block execution confirmation every time', false)
  .action(async (file: string, options: { output: string; dryRun: boolean; step: boolean; failFast: boolean; debug: boolean; release: boolean; quiet: boolean; var: string[]; varFile: string; yes: boolean; strict: boolean }) => {
    try {
      await watchCommand(file, {
        output: options.output as 'inline' | 'new' | 'stdout',
        dryRun: options.dryRun,
        stepMode: options.step,
        failFast: options.failFast,
        debug: options.debug,
        release: options.release,
        quiet: options.quiet,
        varArgs: parseVarArgs(options.var || []),
        varFile: options.varFile,
        runYes: options.yes,
        runStrict: options.strict,
      });
    } catch (error) {
      console.error(chalk.red(t('cli.watchFailed', { error: error instanceof Error ? error.message : String(error) })));
      process.exit(1);
    }
  });

program
  .command('init')
  .description('Create .flow/ config directory')
  .option('-f, --force', 'Overwrite existing config without confirmation')
  .action(async (options: { force?: boolean }) => {
    try {
      await initCommand(options.force);
    } catch (error) {
      console.error(chalk.red(t('cli.initFailed', { error: error instanceof Error ? error.message : String(error) })));
      process.exit(1);
    }
  });

program
  .command('new')
  .description('Create new document from template')
  .argument('<name>', 'Document name')
  .option('-l, --list', 'List available templates')
  .option('-t, --template <name>', 'Template name (basic/data/report/meeting/api/changelog)')
  .option('-f, --force', 'Overwrite existing file without confirmation')
  .action(async (name: string, options: { list?: boolean; template?: string; force?: boolean }) => {
    try {
      await newCommand(name, options);
    } catch (error) {
      console.error(chalk.red(t('cli.newFailed', { error: error instanceof Error ? error.message : String(error) })));
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
        console.error(chalk.red(t('cli.configNeedKey')));
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

program
  .command('history')
  .description('View execution history')
  .option('--detail <id>', 'Show detail of a specific record by ID')
  .option('--clear', 'Clear all history')
  .action(async (options: { detail?: string; clear?: boolean }) => {
    await historyCommand(options);
  });

program.parse();
