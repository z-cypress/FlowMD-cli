/**
 * FlowMD 文档执行器
 * 顶层协调：预执行校验、flat/control 路径调度、子文档执行、汇总与历史记录。
 * 块分发见 block-dispatcher，include 展开见 include-expander，输出构建见 output-builder。
 */

import ora from 'ora';
import chalk from 'chalk';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { ExecutionContext } from './context.js';
import { formatAgentTrace, formatAgentTraceSummary } from './blocks/agent/agent-block.js';
import { buildControlTree, ControlTreeError } from './blocks/control/tree.js';
import { ConditionSyntaxError } from './blocks/control/condition.js';
import { executeControlFlow, ControlFlowStop } from './blocks/control/execute-region.js';
import { dispatchBlock } from './block-dispatcher.js';
import type { DispatcherDeps } from './block-dispatcher.js';
import { parseMarkdown } from './parser.js';
import { expandMdIncludes } from './include-expander.js';
import { insertResult, renderDocument, stripCodeBlocks } from './output-builder.js';
import { createBlockExecState } from './execution-state.js';
import type { BlockExecState, SubExecutionResult } from './execution-state.js';
import { cacheKey, readCache, writeCache } from './cache.js';
import { deliver } from './deliver.js';
import { loadPlugins } from './plugin-loader.js';
import { TraceCollector } from './trace.js';
import { getErrorMessage } from '../utils/error-formatter.js';
import { t } from '../utils/i18n.js';
import { recordExecution } from '../utils/history.js';
import type {
  ParsedDocument, RunOptions, FlowConfig, ExecutionResult,
  ExecutableBlock, ControlNode, BlockResult,
} from '../types/index.js';

/** 块类型对应的 emoji 图标 */
const BLOCK_EMOJI: Record<string, string> = {
  ai: '🤖',
  data: '🗄️',
  template: '🎨',
  include: '📥',
  run: '⚡',
  agent: '🕵️',
};

export type { BlockExecState, SubExecutionResult };

/**
 * 从块 meta 中取字符串值（数组值取首个，非字符串返回 undefined）
 * @param meta - 块元数据
 * @param key - 键名
 * @returns 字符串值或 undefined
 */
function metaString(meta: Record<string, string | string[]>, key: string): string | undefined {
  const value = meta[key];
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value[0];
  return undefined;
}

/**
 * 带超时控制的异步执行
 * 超时后会触发 AbortSignal，尽量中止底层请求（如 AI 调用）
 * @param fn - 要执行的异步函数（接收中止信号）
 * @param timeoutMs - 超时时间（毫秒）
 * @returns 执行结果
 */
async function executeWithTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      controller.abort();
      reject(new Error(t('error.timeout', { seconds: (timeoutMs / 1000).toFixed(0) })));
    }, timeoutMs);

    fn(controller.signal)
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
 * 提取文本中所有 {{variable}} 或 {{variable | filter}} 引用的变量名
 * 管道语法中只提取管道前的变量表达式
 * @param text - 包含变量引用的文本
 * @returns 变量名列表
 */
function extractVariableRefs(text: string): string[] {
  const refs: string[] = [];
  // 匹配 {{expr}} 或 {{expr | filter:arg}}，只捕获管道前的 expr 部分
  const refRegex = /\{\{([\w.-]+)(?:\s*\|[^}]*)?\}\}/g;
  refRegex.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = refRegex.exec(text)) !== null) {
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
 * 等待指定毫秒数
 * @param ms - 等待时间（毫秒）
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 校验块输出是否符合指定格式
 * @param output - 块输出内容
 * @param mode - 校验模式（"json" | "json-array" | "non-empty"）
 * @returns 错误消息，通过返回 null
 */
function validateOutput(output: string | null, mode: string): string | null {
  if (output === null) return t('error.validate.nullOutput');
  switch (mode) {
    case 'json':
      try { JSON.parse(output); return null; }
      catch { return t('error.validate.invalidJson'); }
    case 'json-array':
      try {
        const parsed = JSON.parse(output);
        return Array.isArray(parsed) ? null : t('error.validate.notArray');
      }
      catch { return t('error.validate.invalidJson'); }
    case 'non-empty':
      return output.trim() ? null : t('error.validate.emptyOutput');
    default:
      return null; // 未知 validate 模式：不校验
  }
}

/**
 * 将字符偏移量换算为文档行号（1-based）
 * @param content - 文档原始内容
 * @param offset - 字符偏移
 * @returns 行号（offset 越界时返回 1）
 */
export function offsetToLine(content: string, offset: number): number {
  if (offset <= 0) return 1;
  let line = 1;
  for (let i = 0; i < offset && i < content.length; i++) {
    if (content[i] === '\n') line++;
  }
  return line;
}

/**
 * 为错误消息附加行号后缀（如"（第 23 行）"）
 * @param error - 原始错误消息
 * @param line - 行号
 * @returns 带行号的错误消息
 */
function withLine(error: string, line: number): string {
  return `${error}${t('error.line', { line })}`;
}

/**
 * 执行单个块（含 UI 展示、依赖检测、超时、失败记录）
 * flat 路径与 control 路径共用。返回继续/停止信号与块结果
 * @param block - 要执行的块
 * @param state - 共享执行状态
 * @param displayPos - 展示用位置（control 路径下可能为 undefined）
 * @returns { action: 'continue' | 'stop'（fail-fast 停止）; result?: BlockResult }
 */
export async function executeOneBlock(
  block: ExecutableBlock,
  state: BlockExecState,
  displayPos?: number
): Promise<{ action: 'continue' | 'stop'; result?: BlockResult }> {
  const { context, options, config } = state;
  const pos = (displayPos ?? block.position) + 1;
  const blockNum = `[${pos}/${state.totalBlocks}]`;
  const emoji = BLOCK_EMOJI[block.type] || '📦';

  // 试运行模式：跳过执行
  if (options.dryRun) {
    console.log(t('block.skipped', { emoji, num: blockNum, type: block.type }));
    return { action: 'continue' };
  }

  // 依赖检测：检查块引用的变量是否由已失败的块产出
  // （run 块脚本不依赖 {{}} 插值，跳过该检测，依赖经 vars 显式声明）
  const refs = block.type === 'run' ? [] : extractVariableRefs(block.content);
  const missingDeps = refs.filter(
    (v) => !SYSTEM_VARS.has(v) && state.failedOutputs.has(v)
  );
  if (missingDeps.length > 0) {
    spinnerFail(blockNum, emoji, block.type, t('block.skippedDeps', { vars: missingDeps.join(', ') }));
    // 跳过块也计入记录，与统计口径保持一致（不执行、不算失败）
    state.blockRecords.push({ position: pos, type: block.type, status: 'success', duration_ms: 0 });
    return { action: 'continue' };
  }

  // 逐步执行模式：展示块内容并等待确认
  // --step-block / --break-on 可缩小暂停范围
  const shouldPause = options.stepMode
    && (options.stepBlock === undefined || options.stepBlock === pos)
    && (options.breakOn === undefined || options.breakOn === block.type);
  if (shouldPause) {
    console.log('');
    console.log(chalk.cyan(t('block.stepTitle', { emoji, num: blockNum, type: block.type.toUpperCase() })));
    // 展示块内容（截取前 200 字符）
    const preview = block.content.length > 200
      ? block.content.slice(0, 200) + '...'
      : block.content;
    console.log(chalk.gray(preview));
    console.log('');
    console.log(chalk.yellow(t('prompt.enterRun')));
    await waitForUserInput();
  }

  // 显示加载动画（带实时耗时）
  const spinner = !options.quiet ? ora({
    text: t('block.running', { emoji, num: blockNum, type: block.type }),
    color: 'cyan',
  }).start() : null;

  const startTime = Date.now();
  const elapsedInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    if (spinner) spinner.text = t('block.runningWait', { emoji, num: blockNum, type: block.type, seconds: elapsed });
  }, 1000);

  // 块在文档中的行号（供错误消息定位）
  const blockLine = offsetToLine(state.rawContent, block.sourceStart);

  // trace：开始块 span
  const outputNameMeta = metaString(block.meta, 'output');
  if (state.traceCollector) {
    state.traceCollector.startSpan(`${block.type}:${outputNameMeta || block.position + 1}`, {
      block_type: block.type,
      block_position: pos,
      output: outputNameMeta,
    });
  }

  // 重试与输出校验参数
  const maxRetries = parseInt(String(block.meta.retry ?? '0'), 10);
  const validateMode = block.meta.validate as string | undefined;

  let lastResult: BlockResult | undefined;

  // 重试循环（首次执行 + maxRetries 次重试）
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      // 重试等待（指数退避：500ms, 1000ms, 1500ms...）
      if (spinner) spinner.text = t('block.retrying', { emoji, num: blockNum, type: block.type, attempt, max: maxRetries });
      await sleep(500 * attempt);
    }

  try {
    // 结果缓存：ai/data 块按内容哈希命中则复用结果（run 块因副作用不缓存）
    // conversation 块不缓存（每次调用的上下文不同）
    const hasConversation = !!block.meta.conversation;
    const outputName = metaString(block.meta, 'output');
    const hash = options.cache && !hasConversation && (block.type === 'ai' || block.type === 'data')
      ? cacheKey(block, context)
      : undefined;
    const cached = hash ? readCache(hash) : undefined;

    if (cached) {
      clearInterval(elapsedInterval);
      if (outputName) context.set(outputName, cached.value);
      if (spinner) {
        spinner.succeed(t('block.cached', { emoji, num: blockNum, type: block.type, seconds: (cached.duration / 1000).toFixed(1) }));
      }
      state.blockRecords.push({
        position: pos,
        type: block.type,
        status: 'success',
        duration_ms: cached.duration,
      });
      return { action: 'continue' };
    }

    const timeoutMs = config.execution.timeout * 1000;

    // 根据块类型分发到对应执行器（带超时控制）
    const executeBlock = async (signal: AbortSignal): Promise<BlockResult> => {
      const deps: DispatcherDeps = {
        executeSubDocument: (subDoc, parentState, inputs, subDocFile) =>
          executeSubDocument(subDoc, parentState, inputs, subDocFile),
        onStep: (message) => {
          if (spinner) spinner.text = `${t('block.running', { emoji, num: blockNum, type: block.type })} ${message}`;
        },
        onToken: (delta) => {
          if (spinner) spinner.text = `${t('block.running', { emoji, num: blockNum, type: block.type })} ${delta.slice(0, 60)}`;
        },
        plugins: state.plugins,
      };
      return dispatchBlock(block, state, signal, deps);
    };

    const result = await executeWithTimeout(executeBlock, timeoutMs);
    lastResult = result;

    // 输出校验（仅成功时校验）
    if (result.success && validateMode) {
      const valErr = validateOutput(result.output, validateMode);
      if (valErr) {
        result.success = false;
        result.error = valErr;
      }
    }

    if (result.success) {
      clearInterval(elapsedInterval);
      // 写入缓存：成功且有输出时缓存（data 块 value 存上下文中的行数组）
      if (hash && result.output !== null) {
        writeCache(hash, {
          output: result.output,
          value: outputName ? context.get(outputName) ?? result.output : result.output,
          duration: result.duration,
          cachedAt: new Date().toISOString(),
        });
      }
      if (spinner) {
        const retryInfo = attempt > 0 ? ` (${attempt + 1}/${maxRetries + 1})` : '';
        spinner.succeed(t('block.done', { emoji, num: blockNum, type: block.type, seconds: (result.duration / 1000).toFixed(1) }) + retryInfo);
      }
      state.blockRecords.push({
        position: pos,
        type: block.type,
        status: 'success',
        duration_ms: result.duration,
        trace: result.steps ? formatAgentTraceSummary(result.steps) : attempt > 0 ? `${attempt} retries` : undefined,
        input_tokens: result.usage?.input,
        output_tokens: result.usage?.output,
      });

      // step 模式：打印执行结果
      if (options.stepMode && result.output !== null) {
        const preview = result.output.length > 300
          ? result.output.slice(0, 300) + '...'
          : result.output;
        console.log(chalk.gray(t('block.stepOutput')));
        console.log(chalk.gray(preview));
      }

      // debug 模式：收集需要插入的结果
      // （控制流路径由 execute-region 直接拼进输出，这里跳过避免冗余）
      if (options.debug && result.output !== null && !state.controlFlow) {
        const trace = formatAgentTrace(result);
        state.insertResults.push({
          sourceEnd: block.sourceEnd,
          output: trace ? result.output + trace : result.output,
        });
      }

      // 输出投递：将结果推送到外部目的地
      const deliverTarget = metaString(block.meta, 'deliver');
      if (deliverTarget && result.output !== null) {
        const deliverResult = await deliver(deliverTarget, result.output, block.type);
        if (!deliverResult.success) {
          console.warn(chalk.yellow(t('block.deliverFailed', { target: deliverTarget, error: deliverResult.error })));
        }
      }

      // 成功：跳出重试循环
      if (state.traceCollector) {
        state.traceCollector.endSpan('ok', {
          input_tokens: result.usage?.input,
          output_tokens: result.usage?.output,
          retries: attempt,
        });
      }
      return { action: 'continue', result };
    }

    // 失败：记录错误，继续重试循环
    lastResult = result;
    if (attempt < maxRetries) {
      // 还有重试机会，继续循环
      if (spinner) spinner.text = t('block.retrying', { emoji, num: blockNum, type: block.type, attempt: attempt + 1, max: maxRetries });
      continue;
    }

    // 所有重试用完，报告最终失败
    clearInterval(elapsedInterval);
    if (spinner) {
      spinner.fail(t('block.failed', { emoji, num: blockNum, type: block.type }));
    } else {
      process.stderr.write(`${t('block.failedQuiet', { emoji, num: blockNum, type: block.type, error: withLine(result.error || '', blockLine) })}
`);
    }
    state.hasError = true;
    state.failedBlocks.push({ position: pos, type: block.type, error: result.error || t('error.unknown'), line: blockLine });
    state.blockRecords.push({
      position: pos,
      type: block.type,
      status: 'failed',
      error: result.error,
      duration_ms: result.duration,
      trace: result.steps ? formatAgentTraceSummary(result.steps) : attempt > 0 ? `${attempt} retries` : undefined,
      line: blockLine,
    });

    const failedOutput = metaString(block.meta, 'output');
    if (failedOutput) {
      state.failedOutputs.add(failedOutput);
    }

    if (state.traceCollector) {
      state.traceCollector.endSpan('error', { error: result.error, retries: attempt });
    }

    if (options.failFast) {
      console.error(chalk.red(t('warning.failFast')));
      return { action: 'stop', result };
    }
  } catch (error) {
    clearInterval(elapsedInterval);
    if (spinner) {
      spinner.fail(t('block.exception', { emoji, num: blockNum, type: block.type }));
    }
    process.stderr.write(`${t('block.exceptionQuiet', { emoji, num: blockNum, type: block.type, error: withLine(getErrorMessage(error), blockLine) })}
`);
    state.hasError = true;
    state.failedBlocks.push({ position: pos, type: block.type, error: getErrorMessage(error), line: blockLine });
    state.blockRecords.push({ position: pos, type: block.type, status: 'failed', error: getErrorMessage(error), duration_ms: Date.now() - startTime, line: blockLine });

    const failedOutput = metaString(block.meta, 'output');
    if (failedOutput) {
      state.failedOutputs.add(failedOutput);
    }

    if (state.traceCollector) {
      state.traceCollector.endSpan('error', { error: getErrorMessage(error) });
    }

    if (options.failFast) {
      console.error(chalk.red(t('warning.failFast')));
      return { action: 'stop' };
    }
  }
  } // end retry loop

  return { action: 'continue' as const, result: lastResult };
}

/**
 * 输出 trace 数据（--trace 时启用，写入文件或 stdout）
 * @param state - 执行状态
 */
export function emitTrace(state: BlockExecState): void {
  const collector = state.traceCollector;
  if (!collector) return;
  const traceJSON = collector.toJSON();
  if (state.options.traceFile) {
    try {
      writeFileSync(state.options.traceFile, traceJSON, 'utf-8');
    } catch {
      // 写入失败不影响主流程
    }
  } else {
    console.log(traceJSON);
  }
}

/**
 * 输出执行汇总（成功/失败统计，分组相同错误）
 * @param state - 执行状态
 */
export function printSummary(state: BlockExecState): void {
  const { options } = state;
  if (options.quiet || options.dryRun) return;

  const totalBlocks = state.totalBlocks;
  const failed = state.failedBlocks.length;
  const success = totalBlocks - failed;

  if (failed > 0) {
    console.log('');
    console.log(chalk.yellow(t('summary.failed', { success, total: totalBlocks, failed })));
    const byError = new Map<string, { positions: number[]; lines: number[]; type: string }>();
    for (const f of state.failedBlocks) {
      const entry = byError.get(f.error);
      if (entry) {
        entry.positions.push(f.position);
        if (f.line) entry.lines.push(f.line);
      } else {
        byError.set(f.error, { positions: [f.position], lines: f.line ? [f.line] : [], type: f.type });
      }
    }
    for (const [error, entry] of byError) {
      const positions = entry.positions.join(',');
      const lines = entry.lines.length > 0
        ? t('summary.failedLines', { lines: entry.lines.join(',') })
        : '';
      console.log(chalk.yellow(t('summary.failedGrouped', { positions, type: entry.type, error, lines })));
    }
  } else {
    console.log('');
    console.log(chalk.green(t('summary.success', { success, total: totalBlocks })));
  }
}

/**
 * 写入执行历史（best-effort，失败不中断执行）
 * @param state - 执行状态
 * @param currentFile - 当前执行文件路径
 */
export function recordExecutionHistory(state: BlockExecState, currentFile?: string): void {
  if (state.options.dryRun) return;
  try {
    recordExecution({
      file: currentFile || 'stdin',
      total_blocks: state.totalBlocks,
      success_blocks: state.totalBlocks - state.failedBlocks.length,
      failed_blocks: state.failedBlocks.length,
      blocks: state.blockRecords,
    });
  } catch {
    // 历史写入失败不影响文档执行
  }
}

/**
 * 收集文档中的所有控制流指令（供 hasControlFlow 判断）
 * @param doc - 解析后的文档
 * @returns 是否有控制流指令
 */
export function hasControlFlow(doc: ParsedDocument): boolean {
  return (doc.directives?.length ?? 0) > 0;
}

/**
 * 执行解析文档中的所有块
 * @param doc - 解析后的文档，包含块
 * @param options - 运行选项
 * @param config - FlowMD 配置
 * @param seedContext - 可选的上游变量注入
 * @returns 渲染后的文档内容及是否有错误
 */
export async function executeDocument(
  doc: ParsedDocument,
  options: RunOptions,
  config: FlowConfig,
  seedContext?: Record<string, unknown>
): Promise<ExecutionResult> {
  const context = new ExecutionContext();

  // 设置预定义变量
  const now = new Date();
  context.set('execution_time', now.toISOString());
  context.set('date', now.toISOString().split('T')[0]);
  context.set('datetime', now.toISOString().replace('T', ' ').split('.')[0]);
  context.set('timestamp', Math.floor(now.getTime() / 1000));

  // pipeline 串联：注入上一份文档的产出变量（优先级低于 --var/var-file 与块 output）
  // 系统变量每份文档各自刷新，不从上游继承
  if (seedContext) {
    for (const [k, v] of Object.entries(seedContext)) {
      if (SYSTEM_VARS.has(k)) continue;
      context.set(k, v);
    }
  }

  // 注入配置文件中的自定义变量
  if (config.variables) {
    for (const [k, v] of Object.entries(config.variables)) {
      context.set(k, v);
    }
  }

  // 注入 --var-file 和 --var 变量
  if (options.varFile) {
    try {
      const raw = readFileSync(options.varFile, 'utf-8');
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
        parsed = parseYaml(raw) as Record<string, unknown>;
      }
      if (parsed && typeof parsed === 'object') {
        for (const [k, v] of Object.entries(parsed)) {
          context.set(k, v);
        }
      }
    } catch (err) {
      console.error(chalk.yellow(t('warning.varFileLoad', { file: options.varFile, error: getErrorMessage(err) })));
    }
  }
  if (options.varArgs) {
    for (const [k, v] of Object.entries(options.varArgs)) {
      context.set(k, v);
    }
  }

  // 预展开 .md include 块：将 include 块替换为被引入文件的块
  const visitedPaths = new Set<string>();
  await expandMdIncludes(doc, options.currentFile, visitedPaths);

  const state: BlockExecState = createBlockExecState(context, options, config, doc.rawContent, visitedPaths, doc.blocks.length);
  if (options.trace) {
    state.traceCollector = new TraceCollector();
  }

  // 加载自定义块插件（best-effort，失败不阻塞执行）
  try {
    const pluginDir = path.join(process.cwd(), '.flow', 'plugins');
    const plugins = await loadPlugins(pluginDir);
    state.plugins = new Map(plugins.map((p) => [p.name, p]));
  } catch {
    // 插件加载失败不影响主流程
  }

  // 排除 template/run 块内的变量：
  // - template 的 Handlebars 循环变量（{{name}}）不需要顶层定义
  // - run 脚本不依赖 {{}} 插值（变量经 vars 显式传入）
  // 控制流路径额外排除循环变量（{{item}} 等）
  const loopVars = hasControlFlow(doc) ? collectLoopVars(buildTreeSafe(doc) ?? []) : new Set<string>();
  const nonTemplateVarSet = new Set<string>();
  const varRegex = /\{\{([\w.-]+)(?:\s*\|[^}]*)?\}\}/g;
  for (const block of doc.blocks) {
    if (block.type === 'template' || block.type === 'run') continue;
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
  // collect 变量（for 区运行时累积的数组）视为已定义
  const collectVars = hasControlFlow(doc) ? collectCollectVars(buildTreeSafe(doc) ?? []) : new Set<string>();
  const blockOutputs = new Set(doc.blocks.map((b) => b.meta.output).filter(Boolean));
  for (const c of collectVars) blockOutputs.add(c);
  const noOutputBlocks = doc.blocks.filter((b) => !b.meta.output);
  const injectedVars = new Set(Object.keys(context.dump()));
  const undefinedVars = [...nonTemplateVarSet].filter(
    (v) => !blockOutputs.has(v) && !SYSTEM_VARS.has(v) && !injectedVars.has(v) && !loopVars.has(v)
  );

  if (noOutputBlocks.length > 0) {
    console.log(chalk.yellow(t('warning.noOutput.title')));
    for (const b of noOutputBlocks) {
      console.log(chalk.yellow(t('warning.noOutput.item', { position: b.position + 1, type: b.type })));
    }
    if (options.stepMode) {
      console.log(chalk.gray(t('prompt.enterContinue')));
      await waitForUserInput();
    }
  }

  if (undefinedVars.length > 0) {
    console.log(chalk.yellow(t('warning.undefinedVar.title')));
    for (const v of undefinedVars) {
      console.log(chalk.yellow(t('warning.undefinedVar.item', { var: v })));
    }
    if (options.stepMode) {
      console.log(chalk.gray(t('prompt.enterContinue')));
      await waitForUserInput();
    }
  }

  // 控制流路径：遍历指令区树执行 + 流式构建输出
  if (hasControlFlow(doc)) {
    state.controlFlow = true;
    try {
      const tree = buildControlTree(doc);
      const content = await executeControlFlow(tree, doc.rawContent, state);
      printSummary(state);
      recordExecutionHistory(state, options.currentFile);
      emitTrace(state);
      return {
        content,
        hasError: state.hasError,
        variables: context.dump(),
        blocks: {
          total: state.totalBlocks,
          success: state.totalBlocks - state.failedBlocks.length,
          failed: state.failedBlocks.length,
        },
        failedBlocks: state.failedBlocks,
      };
    } catch (error) {
      if (error instanceof ControlTreeError || error instanceof ConditionSyntaxError) {
        console.error(chalk.red(t('error.control.tree', { error: error.message })));
        state.hasError = true;
        recordExecutionHistory(state, options.currentFile);
        return { content: doc.rawContent, hasError: true, variables: context.dump() };
      }
      // fail-fast 停止：返回已构建的部分输出
      if (error instanceof ControlFlowStop) {
        printSummary(state);
        recordExecutionHistory(state, options.currentFile);
        return { content: doc.rawContent, hasError: state.hasError, variables: context.dump() };
      }
      throw error;
    }
  }

  // 平铺路径：顺序遍历每个块
  for (let i = 0; i < doc.blocks.length; i++) {
    const { action } = await executeOneBlock(doc.blocks[i], state, i);
    if (action === 'stop') break;
  }

  printSummary(state);

  // 按偏移量倒序插入结果，避免偏移量失效
  let outputContent = doc.rawContent;
  state.insertResults.sort((a, b) => b.sourceEnd - a.sourceEnd);
  for (const insert of state.insertResults) {
    outputContent = insertResult(outputContent, insert.sourceEnd, insert.output);
  }

  // 变量缺失提示
  if (!options.dryRun) {
    const definedVars = new Set(Object.keys(context.dump()));
    const unresolved = [...new Set(
      nonTemplateVarSet
    )].filter((v) => !definedVars.has(v) && !SYSTEM_VARS.has(v) && !loopVars.has(v));
    if (unresolved.length > 0) {
      console.log(chalk.yellow(t('warning.unresolvedVar.title')));
      for (const v of unresolved) {
        console.log(chalk.yellow(t('warning.undefinedVar.item', { var: v })));
      }
      console.log(chalk.gray(t('warning.unresolvedVar.hint')));
    }
  }

  // 保证 --var 优先级最高（覆盖块 output 同名字段）
  if (options.varArgs) {
    for (const [k, v] of Object.entries(options.varArgs)) {
      context.set(k, v);
    }
  }

  // 使用上下文渲染最终文档（屏蔽 template 块内容，避免朴素变量替换破坏 Handlebars 语法）
  const rendered = renderDocument(outputContent, doc.blocks, context);

  // release 模式：从输出中移除所有指令块
  const content = options.release ? stripCodeBlocks(rendered) : rendered;

  recordExecutionHistory(state, options.currentFile);
  emitTrace(state);

  return {
    content,
    hasError: state.hasError,
    variables: context.dump(),
    blocks: {
      total: state.totalBlocks,
      success: state.totalBlocks - state.failedBlocks.length,
      failed: state.failedBlocks.length,
    },
    failedBlocks: state.failedBlocks,
  };
}

/**
 * 隔离子文档执行（ADR-019 doc 块）
 * 全新 ExecutionContext（仅系统变量 + 声明式 inputs），复用全部块执行器与渲染逻辑
 * @param subDoc - 解析后的子文档
 * @param parentState - 父执行状态（继承 options/config，共享 visitedPaths）
 * @param inputs - 从父上下文导入的输入变量
 * @param subDocFile - 子文档文件路径（include 相对路径基准）
 * @returns 子文档执行结果
 */
export async function executeSubDocument(
  subDoc: ParsedDocument,
  parentState: BlockExecState,
  inputs: Record<string, unknown>,
  subDocFile?: string
): Promise<SubExecutionResult> {
  const subContext = new ExecutionContext();
  const now = new Date();
  subContext.set('execution_time', now.toISOString());
  subContext.set('date', now.toISOString().split('T')[0]);
  subContext.set('datetime', now.toISOString().replace('T', ' ').split('.')[0]);
  subContext.set('timestamp', Math.floor(now.getTime() / 1000));
  for (const [k, v] of Object.entries(inputs)) {
    subContext.set(k, v);
  }

  const subState: BlockExecState = createBlockExecState(
    subContext,
    parentState.options,
    parentState.config,
    subDoc.rawContent,
    parentState.visitedPaths,
    subDoc.blocks.length
  );
  subState.plugins = parentState.plugins;

  // 预展开子文档内的 .md include（相对子文档自身位置）
  await expandMdIncludes(subDoc, subDocFile, subState.visitedPaths);
  subState.totalBlocks = subDoc.blocks.length;

  if (hasControlFlow(subDoc)) {
    const tree = buildControlTree(subDoc);
    await executeControlFlow(tree, subDoc.rawContent, subState);
  } else {
    for (let i = 0; i < subDoc.blocks.length; i++) {
      const { action } = await executeOneBlock(subDoc.blocks[i], subState, i);
      if (action === 'stop') break;
    }
  }

  // 渲染子文档输出（复用顶层逻辑：debug 结果插入 + 变量替换 + release 剥离）
  let outputContent = subDoc.rawContent;
  subState.insertResults.sort((a, b) => b.sourceEnd - a.sourceEnd);
  for (const insert of subState.insertResults) {
    outputContent = insertResult(outputContent, insert.sourceEnd, insert.output);
  }
  const rendered = renderDocument(outputContent, subDoc.blocks, subContext);
  const content = parentState.options.release ? stripCodeBlocks(rendered) : rendered;

  return {
    content,
    variables: subContext.dump(),
    hasError: subState.hasError,
    failedBlocks: subState.failedBlocks.length,
  };
}

/**
 * 安全构建控制流树（失败时返回 null，不抛错，供变量收集等辅助使用）
 * @param doc - 解析后的文档
 * @returns 树或 null
 */
function buildTreeSafe(doc: ParsedDocument): ControlNode[] | null {
  try {
    return buildControlTree(doc);
  } catch {
    return null;
  }
}

/**
 * 收集树中所有 for 区的循环变量名
 * @param nodes - 树节点数组
 * @returns 循环变量名集合
 */
function collectLoopVars(nodes: ControlNode[]): Set<string> {
  const result = new Set<string>();
  const walk = (list: ControlNode[]): void => {
    for (const node of list) {
      if (node.kind === 'for') {
        result.add(node.loopVar);
        walk(node.children);
      } else if (node.kind === 'if') {
        for (const branch of node.branches) {
          walk(branch.children);
        }
      }
    }
  };
  walk(nodes);
  return result;
}

/**
 * 收集树中所有 for 区的 collect 累积数组名
 * @param nodes - 树节点数组
 * @returns collect 变量名集合
 */
function collectCollectVars(nodes: ControlNode[]): Set<string> {
  const result = new Set<string>();
  const walk = (list: ControlNode[]): void => {
    for (const node of list) {
      if (node.kind === 'for') {
        if (node.collect) result.add(node.collect);
        walk(node.children);
      } else if (node.kind === 'if') {
        for (const branch of node.branches) {
          walk(branch.children);
        }
      }
    }
  };
  walk(nodes);
  return result;
}

/**
 * 在循环外统一输出失败信息（避免重复代码）
 */
function spinnerFail(blockNum: string, emoji: string, type: string, message: string): void {
  console.log(`${emoji} ${blockNum} ${type} 块 - ${message}`);
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

/**
 * 单块执行结果（块级单独执行专用）
 */
export interface SingleBlockResult {
  /** 是否成功 */
  success: boolean;
  /** 块类型 */
  type: string;
  /** 输出内容（失败时为 null） */
  output: string | null;
  /** 错误信息（失败时返回） */
  error?: string;
  /** 耗时（毫秒） */
  duration: number;
  /** token 用量（ai/agent 块） */
  usage?: { input: number; output: number };
}

/**
 * 单独执行文档中的指定块（Web IDE 块级单独执行）
 * 构造独立 ExecutionContext 与 BlockExecState，直接调用 executeOneBlock，
 * 复用重试/校验/缓存/投递等逻辑，并拿到块的原始 BlockResult
 * @param markdown - 完整文档内容
 * @param index - 目标块在文档中的索引（0-based）
 * @param options - 运行选项
 * @param config - FlowMD 配置
 * @returns 单块执行结果
 */
export async function executeSingleBlock(
  markdown: string,
  index: number,
  options: RunOptions,
  config: FlowConfig
): Promise<SingleBlockResult> {
  const doc = parseMarkdown(markdown);
  const block = doc.blocks[index];
  if (!block) {
    return {
      success: false,
      type: 'unknown',
      output: null,
      error: t('error.blockIndexOutOfRange', { index: index + 1, total: doc.blocks.length }),
      duration: 0,
    };
  }

  // 构造独立上下文（系统变量 + 注入变量），与 executeDocument 行为一致
  const context = new ExecutionContext();
  const now = new Date();
  context.set('execution_time', now.toISOString());
  context.set('date', now.toISOString().split('T')[0]);
  context.set('datetime', now.toISOString().replace('T', ' ').split('.')[0]);
  context.set('timestamp', Math.floor(now.getTime() / 1000));
  for (const [k, v] of Object.entries(options.varArgs)) {
    context.set(k, v);
  }

  const state = createBlockExecState(context, options, config, markdown, new Set(), doc.blocks.length);
  const { result } = await executeOneBlock(block, state, index);
  if (!result) {
    return { success: false, type: block.type, output: null, error: t('error.unknown'), duration: 0 };
  }
  return {
    success: result.success,
    type: block.type,
    output: result.output,
    error: result.error,
    duration: result.duration,
    usage: result.usage,
  };
}
