/**
 * FlowMD validate 命令
 * 只做解析 + 预执行校验：输出每个块的 type / meta / 位置，报告缺失 output 与未定义变量。
 * 不发 API、不连数据库。控制流语法错误（指令不配对/条件语法）会报错并以退出码 1 结束。
 */

import { readFileSync, existsSync } from 'node:fs';
import chalk from 'chalk';
import { parseMarkdown } from '../core/parser.js';
import { buildControlTree, ControlTreeError } from '../core/blocks/control/tree.js';
import { ConditionSyntaxError } from '../core/blocks/control/condition.js';
import { offsetToLine } from '../core/executor.js';
import { t } from '../utils/i18n.js';
import type { ControlNode, ParsedDocument } from '../types/index.js';

/** 系统预定义变量名 */
const SYSTEM_VARS = new Set(['execution_time', 'date', 'datetime', 'timestamp']);

/** 变量引用正则（与 parser/context 保持一致） */
const VAR_REGEX = /\{\{([\w.-]+)\}\}/g;

/** 解析 --var key=value 参数 */
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

/** 收集树中 for 循环变量与 collect 数组名 */
function collectControlVars(nodes: ControlNode[]): { loopVars: Set<string>; collectVars: Set<string> } {
  const loopVars = new Set<string>();
  const collectVars = new Set<string>();
  const walk = (list: ControlNode[]): void => {
    for (const node of list) {
      if (node.kind === 'for') {
        loopVars.add(node.loopVar);
        if (node.collect) collectVars.add(node.collect);
        walk(node.children);
      } else if (node.kind === 'if') {
        for (const branch of node.branches) {
          walk(branch.children);
        }
      }
    }
  };
  walk(nodes);
  return { loopVars, collectVars };
}

/**
 * 校验文档（解析 + 预执行校验）
 * @param file - Markdown 文件路径
 * @param varArgs - --var 注入的变量
 * @returns 是否有错误（控制流语法错误）
 */
export async function validateCommand(file: string, opts: { var?: string[] } = {}): Promise<void> {
  if (!existsSync(file)) {
    console.error(chalk.red(t('cli.fileNotFound', { file })));
    process.exitCode = 1;
    return;
  }

  const raw = readFileSync(file, 'utf-8');
  const doc: ParsedDocument = parseMarkdown(raw);

  // 控制流语法检查
  let tree: ControlNode[];
  try {
    tree = buildControlTree(doc);
  } catch (error) {
    if (error instanceof ControlTreeError || error instanceof ConditionSyntaxError) {
      console.error(chalk.red(t('validate.controlError', { error: error.message })));
      process.exitCode = 1;
      return;
    }
    throw error;
  }

  console.log(chalk.cyan(t('validate.title', { file })));

  // 块清单
  const blockOutputs = new Set<string>();
  if (doc.blocks.length === 0) {
    console.log(chalk.gray(t('validate.noBlocks')));
  }
  for (const block of doc.blocks) {
    const line = offsetToLine(raw, block.sourceStart);
    if (block.meta.output) blockOutputs.add(String(block.meta.output));
    const metaStr = Object.keys(block.meta).length > 0 ? JSON.stringify(block.meta) : '';
    const pos = block.position + 1;
    console.log(
      `  ${chalk.cyan(block.type.padEnd(10))} #${String(pos).padStart(2)} 第 ${String(line).padStart(2)} 行  ${chalk.gray(metaStr)}`
    );
  }

  // 未指定 output 的块
  const noOutputBlocks = doc.blocks.filter((b) => !b.meta.output);
  if (noOutputBlocks.length > 0) {
    console.log(chalk.yellow(t('warning.noOutput.title')));
    for (const b of noOutputBlocks) {
      console.log(chalk.yellow(t('warning.noOutput.item', { position: b.position + 1, type: b.type })));
    }
  }

  // 未定义变量检查（排除 template/run 内容、循环变量、collect 名、注入变量、系统变量）
  const { loopVars, collectVars } = tree ? collectControlVars(tree) : { loopVars: new Set<string>(), collectVars: new Set<string>() };
  const injectedVars = new Set(Object.keys(parseVarArgs(opts.var || [])));
  const refSet = new Set<string>();
  for (const block of doc.blocks) {
    if (block.type === 'template' || block.type === 'run') continue;
    let m: RegExpExecArray | null;
    while ((m = VAR_REGEX.exec(block.content)) !== null) {
      refSet.add(m[1].split('.')[0].split('[')[0]);
    }
  }
  // 文档正文中的变量（剔除块源码区）
  let bodyText = raw;
  for (const block of [...doc.blocks].sort((a, b) => b.sourceStart - a.sourceStart)) {
    bodyText = bodyText.slice(0, block.sourceStart) + bodyText.slice(block.sourceEnd);
  }
  let m: RegExpExecArray | null;
  while ((m = VAR_REGEX.exec(bodyText)) !== null) {
    refSet.add(m[1].split('.')[0].split('[')[0]);
  }
  for (const c of collectVars) blockOutputs.add(c);

  const undefinedVars = [...refSet].filter(
    (v) => !blockOutputs.has(v) && !SYSTEM_VARS.has(v) && !injectedVars.has(v) && !loopVars.has(v)
  );
  if (undefinedVars.length > 0) {
    console.log(chalk.yellow(t('warning.undefinedVar.title')));
    for (const v of undefinedVars) {
      console.log(chalk.yellow(t('warning.undefinedVar.item', { var: v })));
    }
  }

  if (noOutputBlocks.length === 0 && undefinedVars.length === 0) {
    console.log(chalk.green(t('validate.ok')));
  }
}
