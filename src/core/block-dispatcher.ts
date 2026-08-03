/**
 * FlowMD 块分发器（ADR：executor 拆分）
 * 把块类型路由到对应执行器，返回统一的 BlockResult
 */

import path from 'node:path';
import { readFileSync } from 'node:fs';
import { realpath } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import { executeAIBlock } from './blocks/ai-block.js';
import { executeDataBlock } from './blocks/data-block.js';
import { executeTemplateBlock } from './blocks/template-block.js';
import { executeRunBlock } from './blocks/run-block.js';
import { executeAgentBlock, formatAgentStep } from './blocks/agent/agent-block.js';
import { parseMarkdown } from './parser.js';
import { resolveIncludePath, validateIncludePath } from './include-expander.js';
import { getErrorMessage } from '../utils/error-formatter.js';
import { t } from '../utils/i18n.js';
import type { ExecutableBlock, BlockResult, ParsedDocument } from '../types/index.js';
import type { BlockExecState, SubExecutionResult } from './execution-state.js';

/** dispatchBlock 的依赖注入（避免 executor ↔ dispatcher 运行时循环引用） */
export interface DispatcherDeps {
  /** 子文档执行器（由 executor 注入） */
  executeSubDocument: (
    subDoc: ParsedDocument,
    parentState: BlockExecState,
    inputs: Record<string, unknown>,
    subDocFile?: string
  ) => Promise<SubExecutionResult>;
  /** agent 块步骤反馈（调用方注入，用于更新 spinner 文本） */
  onStep?: (message: string) => void;
  /** AI 块流式回调（调用方注入，用于实时展示生成内容） */
  onToken?: (delta: string) => void;
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
 * 把块路由到对应执行器
 * @param block - 要执行的块
 * @param state - 共享执行状态
 * @param signal - 中止信号（超时/取消）
 * @param deps - 依赖注入（子文档执行器）
 * @returns 块执行结果
 */
export async function dispatchBlock(
  block: ExecutableBlock,
  state: BlockExecState,
  signal: AbortSignal,
  deps: DispatcherDeps
): Promise<BlockResult> {
  const { context, config, options } = state;
  const startTime = Date.now();

  switch (block.type) {
    case 'ai':
      return executeAIBlock(block.content, block.meta, context, config.llm, config.models, signal, deps.onToken);
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
            // 步骤级反馈由调用方通过 spinner 注入，这里仅格式化
            deps.onStep?.(formatAgentStep(step));
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
        const sub = await deps.executeSubDocument(subDoc, state, inputs, resolvedPath);

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
}
