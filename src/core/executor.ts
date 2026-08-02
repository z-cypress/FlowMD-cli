/**
 * FlowMD 文档执行器
 * 协调执行解析文档中的所有代码块
 * 支持控制流：有 directives 时走指令区树执行，否则走原有平铺逻辑
 */

import ora from 'ora';
import chalk from 'chalk';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { realpath } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import { ExecutionContext } from './context.js';
import { executeAIBlock } from './blocks/ai-block.js';
import { executeDataBlock } from './blocks/data-block.js';
import { executeTemplateBlock } from './blocks/template-block.js';
import { executeRunBlock } from './blocks/run-block.js';
import { executeAgentBlock, formatAgentStep, formatAgentTrace, formatAgentTraceSummary } from './blocks/agent/agent-block.js';
import { parseMarkdown } from './parser.js';
import { buildControlTree, ControlTreeError } from './blocks/control/tree.js';
import { ConditionSyntaxError } from './blocks/control/condition.js';
import { executeControlFlow, ControlFlowStop } from './blocks/control/execute-region.js';
import { getErrorMessage } from '../utils/error-formatter.js';
import { t } from '../utils/i18n.js';
import { recordExecution } from '../utils/history.js';
import type {
  ParsedDocument, RunOptions, FlowConfig, BlockResult, ExecutionResult,
  ExecutableBlock, ControlNode,
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

/** 块执行结果（带偏移量信息） */
interface BlockInsertResult {
  sourceEnd: number;
  output: string;
}

/** 变量引用正则（与 parser/context 保持一致） */
const VAR_REF_REGEX = /\{\{([\w.-]+)\}\}/g;

/** 单个块执行时共享的状态（flat 与 control 路径共用） */
export interface BlockExecState {
  context: ExecutionContext;
  options: RunOptions;
  config: FlowConfig;
  visitedPaths: Set<string>;
  failedOutputs: Set<string>;
  failedBlocks: Array<{ position: number; type: string; error: string }>;
  blockRecords: Array<{
    position: number;
    type: string;
    status: 'success' | 'failed';
    error?: string;
    duration_ms: number;
    trace?: string;
  }>;
  insertResults: BlockInsertResult[];
  hasError: boolean;
  totalBlocks: number;
  /** 控制流路径标志：debug 结果由 execute-region 直接拼进 parts，不再写入 insertResults */
  controlFlow?: boolean;
}

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
 * 从块 meta 中取字符串数组值（数组原样、逗号分隔字符串拆分）
 * @param meta - 块元数据
 * @param key - 键名
 * @returns 字符串数组
 */
function metaStringArray(meta: Record<string, string | string[]>, key: string): string[] {
  const value = meta[key];
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  if (typeof value === 'string' && value.trim()) {
    return value.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
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
 * 执行单个块（含 UI 展示、依赖检测、超时、失败记录）
 * flat 路径与 control 路径共用。返回继续/停止信号与块结果
 * @param block - 要执行的块
 * @param state - 共享执行状态
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
  if (options.stepMode) {
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

  let lastResult: BlockResult | undefined;

  try {
    const timeoutMs = config.execution.timeout * 1000;

    // 根据块类型调用对应执行器（带超时控制）
    const executeBlock = async (signal: AbortSignal): Promise<BlockResult> => {
      switch (block.type) {
        case 'ai':
          return executeAIBlock(block.content, block.meta, context, config.llm, config.models, signal);
        case 'data':
          return executeDataBlock(block.content, block.meta, context, config.dataSources);
        case 'template':
          return executeTemplateBlock(block.content, block.meta, context);
        case 'run':
          return executeRunBlock(
            block.content,
            block.meta,
            context,
            signal,
            { yes: options.runYes, strict: options.runStrict }
          );
        case 'agent':
          return executeAgentBlock(
            block.content,
            block.meta,
            context,
            config.llm,
            signal,
            {
              confirm: { yes: options.runYes, strict: options.runStrict },
              projectRoot: options.currentFile ? path.dirname(options.currentFile) : process.cwd(),
              allowedDomains: config.agent?.allowedDomains,
              maxEstimatedTokens: config.agent?.maxEstimatedTokens,
              searchEndpoint: config.agent?.searchEndpoint,
              onStep: (step) => {
                if (spinner) spinner.text = `${t('block.running', { emoji, num: blockNum, type: block.type })} ${formatAgentStep(step)}`;
              },
            }
          );
        case 'include': {
          const includePath = metaString(block.meta, 'path');
          if (!includePath) {
            return { success: false, output: null, error: t('error.includeNoPath'), duration: Date.now() - startTime };
          }
          const ext = path.extname(includePath).toLowerCase();
          if (ext === '.yaml' || ext === '.yml') {
            try {
              const resolvedPath = resolveIncludePath(includePath, options.currentFile);
              await validateIncludePath(resolvedPath, state.visitedPaths, ext);
              const raw = readFileSync(resolvedPath, 'utf-8');
              const parsed = parseYaml(raw) as Record<string, unknown>;
              for (const [k, v] of Object.entries(parsed)) {
                context.set(k, v);
              }
              return { success: true, output: null, duration: Date.now() - startTime };
            } catch (err) {
              return { success: false, output: null, error: t('error.includeYamlFail', { error: getErrorMessage(err) }), duration: Date.now() - startTime };
            }
          }
          return { success: false, output: null, error: t('error.includeBadExt', { ext }), duration: Date.now() - startTime };
        }
        case 'doc': {
          const docPath = metaString(block.meta, 'path');
          if (!docPath) {
            return { success: false, output: null, error: t('error.doc.noPath'), duration: Date.now() - startTime };
          }
          const ns = metaString(block.meta, 'output');
          if (!ns) {
            return { success: false, output: null, error: t('error.doc.noOutput'), duration: Date.now() - startTime };
          }
          const startMs = Date.now();
          try {
            const resolvedPath = resolveIncludePath(docPath, options.currentFile);
            const ext = path.extname(resolvedPath).toLowerCase();
            if (ext !== '.md') {
              return { success: false, output: null, error: t('error.doc.badExt', { ext }), duration: Date.now() - startMs };
            }
            if (state.visitedPaths.has(resolvedPath)) {
              return { success: false, output: null, error: t('error.doc.cycle', { path: docPath }), duration: Date.now() - startMs };
            }
            // realpath 双侧校验防符号链接逃逸（与 file_read 的防线一致）
            const rootReal = await realpath(process.cwd());
            let fileReal: string;
            try {
              fileReal = await realpath(resolvedPath);
            } catch {
              fileReal = resolvedPath;
            }
            if (fileReal !== rootReal && !fileReal.startsWith(rootReal + path.sep)) {
              return { success: false, output: null, error: t('error.doc.outOfBounds', { path: docPath }), duration: Date.now() - startMs };
            }
            // 加入已访问集合，子文档经共享 visitedPaths 统一做循环引用检测
            state.visitedPaths.add(resolvedPath);

            // 声明式输入导入（隔离契约）
            const inputs: Record<string, unknown> = {};
            for (const name of metaStringArray(block.meta, 'input')) {
              const value = context.get(name);
              if (value === undefined) {
                return { success: false, output: null, error: t('error.doc.undefinedInput', { var: name }), duration: Date.now() - startMs };
              }
              inputs[name] = value;
            }

            const raw = readFileSync(resolvedPath, 'utf-8');
            const subDoc = parseMarkdown(raw);
            const sub = await executeSubDocument(subDoc, state, inputs, resolvedPath);

            // 命名空间回传：{{output}} = 渲染内容；{{output.<var>}} = 子文档产出变量
            context.set(ns, sub.content);
            for (const [k, v] of Object.entries(sub.variables)) {
              context.set(`${ns}.${k}`, v);
            }

            const result: BlockResult = {
              success: !sub.hasError,
              output: sub.content,
              duration: Date.now() - startMs,
            };
            if (sub.hasError) {
              result.error = t('error.doc.subFailed', { failed: sub.failedBlocks });
            }
            return result;
          } catch (err) {
            return { success: false, output: null, error: getErrorMessage(err), duration: Date.now() - startMs };
          }
        }
        default:
          return {
            success: false,
            output: null,
            error: t('error.unknownBlockType', { type: block.type }),
            duration: Date.now() - startTime,
          };
      }
    };

    const result = await executeWithTimeout(executeBlock, timeoutMs);
    clearInterval(elapsedInterval);
    lastResult = result;

    if (result.success) {
      if (spinner) {
        spinner.succeed(t('block.done', { emoji, num: blockNum, type: block.type, seconds: (result.duration / 1000).toFixed(1) }));
      }
      state.blockRecords.push({
        position: pos,
        type: block.type,
        status: 'success',
        duration_ms: result.duration,
        trace: result.steps ? formatAgentTraceSummary(result.steps) : undefined,
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
    } else {
      if (spinner) {
        spinner.fail(t('block.failed', { emoji, num: blockNum, type: block.type }));
      } else {
        // quiet 模式：只用一行输出错误
        process.stderr.write(`${t('block.failedQuiet', { emoji, num: blockNum, type: block.type, error: result.error })}
`);
      }
      state.hasError = true;
      state.failedBlocks.push({ position: pos, type: block.type, error: result.error || t('error.unknown') });
      state.blockRecords.push({
        position: pos,
        type: block.type,
        status: 'failed',
        error: result.error,
        duration_ms: result.duration,
        trace: result.steps ? formatAgentTraceSummary(result.steps) : undefined,
      });

      // 记录失败块的输出变量名
      const outputName = metaString(block.meta, 'output');
      if (outputName) {
        state.failedOutputs.add(outputName);
      }

      if (options.failFast) {
        console.error(chalk.red(t('warning.failFast')));
        return { action: 'stop', result };
      }
    }
  } catch (error) {
    clearInterval(elapsedInterval);
    if (spinner) {
      spinner.fail(t('block.exception', { emoji, num: blockNum, type: block.type }));
    }
    process.stderr.write(`${t('block.exceptionQuiet', { emoji, num: blockNum, type: block.type, error: getErrorMessage(error) })}
`);
    state.hasError = true;
    state.failedBlocks.push({ position: pos, type: block.type, error: getErrorMessage(error) });
    state.blockRecords.push({ position: pos, type: block.type, status: 'failed', error: getErrorMessage(error), duration_ms: Date.now() - startTime });

    const failedOutput = metaString(block.meta, 'output');
    if (failedOutput) {
      state.failedOutputs.add(failedOutput);
    }

    if (options.failFast) {
      console.error(chalk.red(t('warning.failFast')));
      return { action: 'stop' };
    }
  }
  return { action: 'continue', result: lastResult };
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
    const byError = new Map<string, { positions: number[]; type: string }>();
    for (const f of state.failedBlocks) {
      const entry = byError.get(f.error);
      if (entry) {
        entry.positions.push(f.position);
      } else {
        byError.set(f.error, { positions: [f.position], type: f.type });
      }
    }
    for (const [error, entry] of byError) {
      const positions = entry.positions.join(',');
      console.log(chalk.yellow(t('summary.failedGrouped', { positions, type: entry.type, error })));
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

  const state: BlockExecState = {
    context,
    options,
    config,
    visitedPaths,
    failedOutputs: new Set<string>(),
    failedBlocks: [],
    blockRecords: [],
    insertResults: [],
    hasError: false,
    totalBlocks: doc.blocks.length,
  };

  // 排除 template/run 块内的变量：
  // - template 的 Handlebars 循环变量（{{name}}）不需要顶层定义
  // - run 脚本不依赖 {{}} 插值（变量经 vars 显式传入）
  // 控制流路径额外排除循环变量（{{item}} 等）
  const loopVars = hasControlFlow(doc) ? collectLoopVars(buildTreeSafe(doc) ?? []) : new Set<string>();
  const nonTemplateVarSet = new Set<string>();
  const varRegex = /\{\{([\w.-]+)\}\}/g;
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
      return {
        content,
        hasError: state.hasError,
        variables: context.dump(),
        blocks: {
          total: state.totalBlocks,
          success: state.totalBlocks - state.failedBlocks.length,
          failed: state.failedBlocks.length,
        },
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

  return {
    content,
    hasError: state.hasError,
    variables: context.dump(),
    blocks: {
      total: state.totalBlocks,
      success: state.totalBlocks - state.failedBlocks.length,
      failed: state.failedBlocks.length,
    },
  };
}

/**
 * 子文档执行结果
 */
interface SubExecutionResult {
  /** 子文档最终渲染内容 */
  content: string;
  /** 子文档产出的全部变量 */
  variables: Record<string, unknown>;
  /** 是否有块执行失败 */
  hasError: boolean;
  /** 失败块数 */
  failedBlocks: number;
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
async function executeSubDocument(
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

  const subState: BlockExecState = {
    context: subContext,
    options: parentState.options,
    config: parentState.config,
    visitedPaths: parentState.visitedPaths,
    failedOutputs: new Set<string>(),
    failedBlocks: [],
    blockRecords: [],
    insertResults: [],
    hasError: false,
    totalBlocks: subDoc.blocks.length,
  };

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
 * 渲染最终文档，屏蔽 template/run 块源码区域以防朴素变量替换破坏其内容
 * 策略：把内容按受保护块源码区域切成段，只对非保护段落做变量渲染，
 * 受保护段源码原样保留（长度变化不会导致偏移错位）
 * @param content - 待渲染内容
 * @param blocks - 文档中的块（用于定位受保护源码区域）
 * @param context - 变量上下文
 * @returns 渲染后的内容
 */
function renderDocument(content: string, blocks: Array<{ type: string; sourceStart: number; sourceEnd: number }>, context: ExecutionContext): string {
  const regions = blocks
    .filter((b) => (b.type === 'template' || b.type === 'run') && b.sourceEnd > b.sourceStart)
    .map((b) => ({ start: b.sourceStart, end: b.sourceEnd }))
    .sort((a, b) => a.start - b.start);

  if (regions.length === 0) return context.render(content);

  let result = '';
  let cursor = 0;
  for (const r of regions) {
    if (r.end <= cursor) continue;
    const start = Math.max(r.start, cursor);
    result += context.render(content.slice(cursor, start));
    result += content.slice(start, r.end);
    cursor = r.end;
  }
  result += context.render(content.slice(cursor));
  return result;
}

/**
* 移除 Markdown 中的所有 FlowMD 指令块（ai / data / template / include / run / agent / doc）
* @param content - 渲染后的文档内容
* @returns 移除指令块后的内容
*/
function stripCodeBlocks(content: string): string {
 // 匹配 ```ai/data/template/include/run/agent/doc 代码块（含可选元数据），包括前后的空行
 const blockPattern = new RegExp(
    '```(?:ai|data|template|include|run|agent|doc)\\s*(?:\\{[^}]*\\})?\\s*\\n[\\s\\S]*?```\\s*\\n*',
   'g'
 );
 return content.replace(blockPattern, '');
}

/**
 * 在循环外统一输出失败信息（避免重复代码）
 */
function spinnerFail(blockNum: string, emoji: string, type: string, message: string): void {
  console.log(`${emoji} ${blockNum} ${type} 块 - ${message}`);
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

  const resultBlock = t('debug.insertResult', { result: result.split('\n').join('\n> ') });

  return before + resultBlock + after;
}

/**
 * 解析 include 路径
 * @param includePath - include 块中的 path 参数
 * @param currentFile - 当前执行文件路径
 * @returns 解析后的绝对路径
 */
function resolveIncludePath(includePath: string, currentFile?: string): string {
  if (path.isAbsolute(includePath)) {
    return includePath;
  }
  const baseDir = currentFile ? path.dirname(currentFile) : process.cwd();
  return path.resolve(baseDir, includePath);
}

/**
 * 预展开文档中的 .md include 块：把 include 块替换为被引入文件的块（递归）
 * 被引入文档的相对路径以其自身位置为基准；visitedPaths 做循环引用检测
 * @param doc - 文档（原地修改 rawContent/blocks/directives）
 * @param currentFile - 当前文档文件路径（include 相对路径基准）
 * @param visitedPaths - 已访问路径集合（跨文档共享）
 */
async function expandMdIncludes(doc: ParsedDocument, currentFile: string | undefined, visitedPaths: Set<string>): Promise<void> {
  let idx = 0;
  while (idx < doc.blocks.length) {
    const block = doc.blocks[idx];
    if (block.type === 'include') {
      const includePath = metaString(block.meta, 'path');
      if (includePath) {
        const ext = path.extname(includePath).toLowerCase();
        if (ext === '.md') {
          const resolvedPath = resolveIncludePath(includePath, currentFile);
          await validateIncludePath(resolvedPath, visitedPaths, ext);
          visitedPaths.add(resolvedPath);

          const raw = readFileSync(resolvedPath, 'utf-8');
          const subDoc = parseMarkdown(raw);
          // 递归展开被引入文档自身的 include（相对其自身位置）
          await expandMdIncludes(subDoc, resolvedPath, visitedPaths);

          // 子块的 sourceStart/sourceEnd 是相对子文件内容的偏移，
          // 需平移 append 位置对应的偏移，否则 debug 模式插入结果会错位
          const offset = doc.rawContent.length + 1; // +1 对应拼接的 '\n'
          doc.rawContent += '\n' + subDoc.rawContent;
          const offsetBlocks = subDoc.blocks.map((b) => ({
            ...b,
            sourceStart: b.sourceStart + offset,
            sourceEnd: b.sourceEnd + offset,
          }));
          // 子文档中的控制流指令同样平移偏移
          const offsetDirectives = (subDoc.directives ?? []).map((d) => ({
            ...d,
            sourceStart: d.sourceStart + offset,
            sourceEnd: d.sourceEnd + offset,
          }));

          doc.blocks.splice(idx, 1, ...offsetBlocks);
          if (offsetDirectives.length > 0) {
            doc.directives = [...(doc.directives ?? []), ...offsetDirectives];
          }
          continue;
        }
      }
    }
    idx++;
  }
}

/**
 * 验证 include 路径的安全性
 * 检查：扩展名白名单、循环引用、路径越界
 */
/**
 * 验证路径是否位于项目根内（realpath 双端校验，防符号链接逃逸；
 * realpath 失败时退回词法校验，兼容目标文件尚不存在等场景）
 * @param resolvedPath - 待校验的绝对路径
 * @returns 是否越界
 */
async function isOutOfBounds(resolvedPath: string): Promise<boolean> {
  try {
    const rootReal = await realpath(process.cwd());
    const fileReal = await realpath(resolvedPath);
    return fileReal !== rootReal && !fileReal.startsWith(rootReal + path.sep);
  } catch {
    return !resolvedPath.startsWith(process.cwd());
  }
}

async function validateIncludePath(
  resolvedPath: string,
  visitedPaths: Set<string>,
  ext: string
): Promise<void> {
  if (ext !== '.md' && ext !== '.yaml' && ext !== '.yml') {
    throw new Error(t('error.includeExtWhitelist', { ext }));
  }

  if (visitedPaths.has(resolvedPath)) {
    throw new Error(t('error.includeCycle', { path: resolvedPath }));
  }

  if (await isOutOfBounds(resolvedPath)) {
    throw new Error(t('error.includeOutOfBounds', { path: resolvedPath }));
  }
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
