/**
 * FlowMD 文档执行器
 * 协调执行解析文档中的所有代码块
 */

import ora from 'ora';
import chalk from 'chalk';
import { ExecutionContext } from './context.js';
import { executeAIBlock } from './blocks/ai-block.js';
import { executeDataBlock } from './blocks/data-block.js';
import { executeTemplateBlock } from './blocks/template-block.js';
import { getErrorMessage } from '../utils/error-formatter.js';
import type { ParsedDocument, RunOptions, FlowConfig, BlockResult } from '../types/index.js';

/** 块类型对应的 emoji 图标 */
const BLOCK_EMOJI: Record<string, string> = {
  ai: '🤖',
  data: '🗄️',
  template: '🎨',
};

/** 块执行结果（带偏移量信息） */
interface BlockInsertResult {
  sourceEnd: number;
  output: string;
}

/** 变量引用正则（与 parser/context 保持一致） */
const VAR_REF_REGEX = /\{\{([\w.-]+)\}\}/g;

/**
 * 带超时控制的异步执行
 * @param fn - 要执行的异步函数
 * @param timeoutMs - 超时时间（毫秒）
 * @returns 执行结果
 */
async function executeWithTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`执行超时 (${(timeoutMs / 1000).toFixed(0)}s)`));
    }, timeoutMs);

    fn()
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/**
 * 提取文本中所有 {{variable}} 引用的变量名
 * @param text - 包含变量引用的文本
 * @returns 变量名列表
 */
function extractVariableRefs(text: string): string[] {
  const refs: string[] = [];
  VAR_REF_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = VAR_REF_REGEX.exec(text)) !== null) {
    // 取顶层变量名（user.name → user）
    const topName = match[1].split('.')[0].split('[')[0];
    if (!refs.includes(topName)) {
      refs.push(topName);
    }
  }
  return refs;
}

/**
 * 系统预定义变量名
 */
const SYSTEM_VARS = new Set(['execution_time', 'date', 'datetime', 'timestamp']);

/**
 * 执行解析文档中的所有块
 * @param doc - 解析后的文档，包含块
 * @param options - 运行选项
 * @param config - FlowMD 配置
 * @returns 渲染后的文档内容
 */
export async function executeDocument(
  doc: ParsedDocument,
  options: RunOptions,
  config: FlowConfig
): Promise<string> {
  const context = new ExecutionContext();

  // 设置预定义变量
  const now = new Date();
  context.set('execution_time', now.toISOString());
  context.set('date', now.toISOString().split('T')[0]);
  context.set('datetime', now.toISOString().replace('T', ' ').split('.')[0]);
  context.set('timestamp', Math.floor(now.getTime() / 1000));

  // 注入配置文件中的自定义变量
  if (config.variables) {
    for (const [k, v] of Object.entries(config.variables)) {
      context.set(k, v);
    }
  }

  // 注入 --var-file 和 --var 变量
  if (options.varFile) {
    try {
      const fs = await import('node:fs');
      const raw = fs.readFileSync(options.varFile, 'utf-8');
      let parsed: Record<string, unknown>;

      if (options.varFile.endsWith('.json')) {
        parsed = JSON.parse(raw);
      } else if (options.varFile.endsWith('.env')) {
        // 解析 .env 格式：KEY=value，支持注释和空行
        parsed = {};
        for (const line of raw.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx > 0) {
            const k = trimmed.slice(0, eqIdx).trim();
            let v: string = trimmed.slice(eqIdx + 1).trim();
            // 移除可选引号
            if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
              v = v.slice(1, -1);
            }
            parsed[k] = v;
          }
        }
      } else {
        // 默认 YAML
        const { parse: parseYaml } = await import('yaml');
        parsed = parseYaml(raw) as Record<string, unknown>;
      }
      if (parsed && typeof parsed === 'object') {
        for (const [k, v] of Object.entries(parsed)) {
          context.set(k, v);
        }
      }
    } catch (err) {
      console.error(chalk.yellow(`⚠ 无法加载变量文件 ${options.varFile}: ${getErrorMessage(err)}`));
    }
  }
  if (options.varArgs) {
    for (const [k, v] of Object.entries(options.varArgs)) {
      context.set(k, v);
    }
  }

  const totalBlocks = doc.blocks.length;
  const insertResults: BlockInsertResult[] = [];
  const failedOutputs = new Set<string>();
  let hasError = false;

  // 排除 template 块内的变量（Handlebars 循环变量如 {{name}} 不需要顶层定义）
  const nonTemplateVarSet = new Set<string>();
  const varRegex = /\{\{([\w.-]+)\}\}/g;
  for (const block of doc.blocks) {
    if (block.type === 'template') continue;
    let m: RegExpExecArray | null;
    while ((m = varRegex.exec(block.content)) !== null) {
      nonTemplateVarSet.add(m[1].split('.')[0].split('[')[0]);
    }
  }
  // 文档正文中的变量
  let bodyText = doc.rawContent;
  for (const block of [...doc.blocks].sort((a, b) => b.sourceStart - a.sourceStart)) {
    bodyText = bodyText.slice(0, block.sourceStart) + bodyText.slice(block.sourceEnd);
  }
  let m: RegExpExecArray | null;
  while ((m = varRegex.exec(bodyText)) !== null) {
    nonTemplateVarSet.add(m[1].split('.')[0].split('[')[0]);
  }

  // 预执行校验：检查 blocks 缺少 output、变量引用未定义
  const blockOutputs = new Set(doc.blocks.map((b) => b.meta.output).filter(Boolean));
  const noOutputBlocks = doc.blocks.filter((b) => !b.meta.output);
  const injectedVars = new Set(Object.keys(context.dump()));
  const undefinedVars = [...nonTemplateVarSet].filter(
    (v) => !blockOutputs.has(v) && !SYSTEM_VARS.has(v) && !injectedVars.has(v)
  );

  if (noOutputBlocks.length > 0) {
    console.log(chalk.yellow(`\n⚠️  以下块没有指定 output 参数，执行结果不会被保留：`));
    for (const b of noOutputBlocks) {
      console.log(chalk.yellow(`   [${b.position + 1}] ${b.type} 块`));
    }
    if (options.stepMode) {
      console.log(chalk.gray(' 按 Enter 继续，或 Ctrl+C 取消'));
      await waitForUserInput();
    }
  }

  if (undefinedVars.length > 0) {
    console.log(chalk.yellow(`\n⚠️  以下变量被引用，但没有对应的块定义它们：`));
    for (const v of undefinedVars) {
      console.log(chalk.yellow(`   - {{${v}}}`));
    }
    if (options.stepMode) {
      console.log(chalk.gray(' 按 Enter 继续，或 Ctrl+C 取消'));
      await waitForUserInput();
    }
  }

  // 遍历执行每个块
  for (let i = 0; i < doc.blocks.length; i++) {
    const block = doc.blocks[i];
    const blockNum = `[${i + 1}/${totalBlocks}]`;
    const emoji = BLOCK_EMOJI[block.type] || '📦';

    // 试运行模式：跳过执行
    if (options.dryRun) {
      console.log(`${emoji} ${blockNum} ${block.type} 块 (跳过执行)`);
      continue;
    }

    // 依赖检测：检查块引用的变量是否由已失败的块产出
    const refs = extractVariableRefs(block.content);
    const missingDeps = refs.filter(
      (v) => !SYSTEM_VARS.has(v) && failedOutputs.has(v)
    );
    if (missingDeps.length > 0) {
      spinnerFail(blockNum, emoji, block.type, `跳过（依赖未生成的变量: ${missingDeps.join(', ')}）`);
      continue;
    }

    // 逐步执行模式：展示块内容并等待确认
    if (options.stepMode) {
      console.log('');
      console.log(chalk.cyan(`━━━ ${emoji} ${blockNum} ${block.type.toUpperCase()} 块 ━━━`));
      // 展示块内容（截取前 200 字符）
      const preview = block.content.length > 200
        ? block.content.slice(0, 200) + '...'
        : block.content;
      console.log(chalk.gray(preview));
      console.log('');
      console.log(chalk.yellow('按 Enter 继续执行'));
      await waitForUserInput();
    }

    // 显示加载动画（带实时耗时）
    const spinner = !options.quiet ? ora({
      text: `${emoji} ${blockNum} ${block.type} 块执行中...`,
      color: 'cyan',
    }).start() : null;

    const startTime = Date.now();
    const elapsedInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      if (spinner) spinner.text = `${emoji} ${blockNum} ${block.type} 块执行中... (已等待 ${elapsed}s)`;
    }, 1000);

    try {
      const timeoutMs = config.execution.timeout * 1000;

      // 根据块类型调用对应执行器（带超时控制）
      const executeBlock = async (): Promise<BlockResult> => {
        switch (block.type) {
          case 'ai':
            return executeAIBlock(block.content, block.meta, context, config.llm, config.models);
          case 'data':
            return executeDataBlock(block.content, block.meta, context, config.dataSources);
          case 'template':
            return executeTemplateBlock(block.content, block.meta, context);
          default:
            return {
              success: false,
              output: null,
              error: `未知块类型: ${block.type}`,
              duration: Date.now() - startTime,
            };
        }
      };

      const result = await executeWithTimeout(executeBlock, timeoutMs);
      clearInterval(elapsedInterval);

      if (result.success) {
        if (spinner) {
          spinner.succeed(`${emoji} ${blockNum} ${block.type} 块 - 完成 (${(result.duration / 1000).toFixed(1)}s)`);
        }

        // step 模式：打印执行结果
        if (options.stepMode && result.output !== null) {
          const preview = result.output.length > 300
            ? result.output.slice(0, 300) + '...'
            : result.output;
          console.log(chalk.gray(' 输出:'));
          console.log(chalk.gray(preview));
        }

        // debug 模式：收集需要插入的结果
        if (options.debug && result.output !== null) {
          insertResults.push({
            sourceEnd: block.sourceEnd,
            output: result.output,
          });
        }
      } else {
        if (spinner) {
          spinner.fail(`${emoji} ${blockNum} ${block.type} 块 - 失败`);
        } else {
          // quiet 模式：只用一行输出错误
          process.stderr.write(`${emoji} ${blockNum} ${block.type} 块失败: ${result.error}
`);
        }
        hasError = true;

        // 记录失败块的输出变量名
        if (block.meta.output) {
          failedOutputs.add(block.meta.output);
        }

        if (options.failFast) {
          console.error(chalk.red('\n⛔ --fail-fast: 遇到第一个错误，停止执行'));
          break;
        }
      }
    } catch (error) {
      clearInterval(elapsedInterval);
      if (spinner) {
        spinner.fail(`${emoji} ${blockNum} ${block.type} 块 - 异常`);
      }
      process.stderr.write(`${emoji} ${blockNum} ${block.type} 块异常: ${getErrorMessage(error)}
`);
      hasError = true;

      if (block.meta.output) {
        failedOutputs.add(block.meta.output);
      }

      if (options.failFast) {
        console.error(chalk.red('\n⛔ --fail-fast: 遇到第一个错误，停止执行'));
        break;
      }
    }
  }

  // 按偏移量倒序插入结果，避免偏移量失效
  let outputContent = doc.rawContent;
  insertResults.sort((a, b) => b.sourceEnd - a.sourceEnd);
  for (const insert of insertResults) {
    outputContent = insertResult(outputContent, insert.sourceEnd, insert.output);
  }

  // 变量缺失提示
  if (!options.dryRun) {
    const definedVars = new Set(Object.keys(context.dump()));
    const unresolved = [...new Set(
      nonTemplateVarSet
    )].filter((v) => !definedVars.has(v) && !SYSTEM_VARS.has(v));
    if (unresolved.length > 0) {
      console.log(chalk.yellow('\n⚠️  以下变量在文档中被引用，但未被任何块定义：'));
      for (const v of unresolved) {
        console.log(chalk.yellow(`   - {{${v}}}`));
      }
      console.log(chalk.gray('   请检查是否有对应的 ai/data/template 块定义了这些变量。'));
    }
  }

  // 保证 --var 优先级最高（覆盖块 output 同名字段）
  if (options.varArgs) {
    for (const [k, v] of Object.entries(options.varArgs)) {
      context.set(k, v);
    }
  }

  // 使用上下文渲染最终文档
  const rendered = context.render(outputContent);

  // release 模式：从输出中移除所有指令块
  if (options.release) {
    return stripCodeBlocks(rendered);
  }

  return rendered;
}

/**
 * 移除 Markdown 中的所有 FlowMD 指令块（ai / data / template）
 * @param content - 渲染后的文档内容
 * @returns 移除指令块后的内容
 */
function stripCodeBlocks(content: string): string {
  // 匹配 ```ai/data/template 代码块（含可选元数据），包括前后的空行
  const blockPattern = new RegExp(
    '```(?:ai|data|template)\\s*(?:\\{[^}]*\\})?\\s*\\n[\\s\\S]*?\\n```\\s*\\n*',
    'g'
  );
  return content.replace(blockPattern, '');
}

/**
 * 在循环外统一输出失败信息（避免重复代码）
 */
function spinnerFail(blockNum: string, emoji: string, type: string, message: string): void {
  // 在 quiet 模式下也不打印跳过信息
}

/**
 * 将执行结果插入到内容的指定位置
 * @param content - 原始内容
 * @param sourceEnd - 插入位置（字符偏移）
 * @param result - 执行结果
 * @returns 插入结果后的内容
 */
function insertResult(content: string, sourceEnd: number, result: string): string {
  const before = content.slice(0, sourceEnd);
  const after = content.slice(sourceEnd);

  const resultBlock = `\n\n> 📋 执行结果：\n> \n> ${result.split('\n').join('\n> ')}\n`;

  return before + resultBlock + after;
}

/**
 * 等待用户输入（按 Enter 键）
 */
function waitForUserInput(): Promise<void> {
  return new Promise((resolve) => {
    // 确保 stdin 处于可读模式
    if (process.stdin.isPaused()) {
      process.stdin.resume();
    }

    const onData = () => {
      process.stdin.removeListener('end', onEnd);
      process.stdin.pause();
      resolve();
    };

    const onEnd = () => {
      process.stdin.removeListener('data', onData);
      resolve();
    };

    process.stdin.once('data', onData);
    process.stdin.once('end', onEnd);
  });
}
