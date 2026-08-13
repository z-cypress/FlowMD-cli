/**
 * v1.3 控制流执行器
 * 遍历指令区树，执行块并流式构建输出文档。
 * 关键语义（见 ADR-003/004/005/006）：
 *   - if 区：运行期求值条件，只执行激活分支的子树与正文
 *   - for 区：每轮迭代设置循环变量、重新执行区内块、重复渲染正文；collect 累积
 *   - 指令注释行：default/debug 保留，release 剥离
 *   - undefined 变量在条件中视为 falsy
 */

import type {
  ControlNode, ExecutableBlock, IfNode, ForNode, ParallelNode,
} from '../../../types/index.js';
import { executeOneBlock } from '../../executor.js';
import type { BlockExecState } from '../../executor.js';
import { evaluateCondition } from './condition.js';
import { t } from '../../../utils/i18n.js';

/** fail-fast 停止信号（抛给 executeControlFlow 捕获） */
export class ControlFlowStop extends Error {
  constructor() {
    super('stop');
    this.name = 'ControlFlowStop';
  }
}

/**
 * 执行控制流树，返回渲染后的文档内容
 * @param tree - 指令区树（顶层节点数组）
 * @param rawContent - 原始文档内容（用于提取正文/块源码片段）
 * @param state - 共享执行状态
 * @returns 渲染后的文档内容
 */
export async function executeControlFlow(
  tree: ControlNode[],
  rawContent: string,
  state: BlockExecState
): Promise<string> {
  const parts: string[] = [];
  const cursor = { pos: 0 };
  await walkNodes(tree, rawContent, cursor, rawContent.length, state, parts, undefined);
  return parts.join('');
}

/**
 * 遍历一组兄弟节点，按 source 顺序把"节点间正文 + 节点内容"拼进输出
 * @param nodes - 兄弟节点数组
 * @param rawContent - 原始文档
 * @param cursor - 当前游标（推进用）
 * @param end - 这组节点的结束偏移（下一指令/文档结尾）
 * @param state - 执行状态
 * @param parts - 输出片段
 * @param currentFor - 当前所在 for 节点（用于 collect 判定）
 */
async function walkNodes(
  nodes: ControlNode[],
  rawContent: string,
  cursor: { pos: number },
  end: number,
  state: BlockExecState,
  parts: string[],
  currentFor: ForNode | undefined
): Promise<void> {
  for (const node of nodes) {
    // 节点前的正文（上一节点 end 到本节点 start）
    appendText(rawContent.slice(cursor.pos, startOf(node)), state, parts);
    if (node.kind === 'block') {
      await walkBlock(node.block, rawContent, state, parts, currentFor);
    } else if (node.kind === 'if') {
      await walkIf(node, rawContent, state, parts, currentFor);
    } else if (node.kind === 'for') {
      await walkFor(node, rawContent, state, parts);
    } else if (node.kind === 'parallel') {
      await walkParallel(node, rawContent, state, parts, currentFor);
    }
    cursor.pos = endOf(node);
  }
  // 最后的正文
  appendText(rawContent.slice(cursor.pos, end), state, parts);
}

/** 节点起始偏移 */
function startOf(node: ControlNode): number {
  if (node.kind === 'block') return node.block.sourceStart;
  return node.sourceStart;
}

/** 节点结束偏移 */
function endOf(node: ControlNode): number {
  if (node.kind === 'block') return node.block.sourceEnd;
  return node.sourceEnd;
}

/**
 * 追加一段正文文本：仅当处于激活分支/迭代时渲染。
 * release 模式下正文仍保留（那是渲染结果），指令注释被剥离。
 */
function appendText(text: string, state: BlockExecState, parts: string[]): void {
  if (!text) return;
  // 渲染变量；屏蔽 template/run 源码区避免破坏 Handlebars 语法
  parts.push(renderText(text, state));
}

/** 渲染正文片段（屏蔽受保护块源码） */
function renderText(text: string, state: BlockExecState): string {
  return state.context.render(text);
}

/**
 * 执行一个块节点：调用共享执行器，并把块源码与 debug 结果按模式并入输出
 * @param block - 块
 * @param rawContent - 原始文档
 * @param state - 执行状态
 * @param parts - 输出片段
 * @param currentFor - 所在 for 节点（collect 用）
 */
async function walkBlock(
  block: ExecutableBlock,
  rawContent: string,
  state: BlockExecState,
  parts: string[],
  currentFor: ForNode | undefined
): Promise<void> {
  const { action, result } = await executeOneBlock(block, state);
  if (action === 'stop') {
    throw new ControlFlowStop();
  }

  // collect 累积：仅当块成功且有 output 时把当前值 push 进 collect 数组
  if (currentFor?.collect && result?.success) {
    const outputName = block.meta.output as string | undefined;
    if (outputName && typeof outputName === 'string') {
      collectInto(currentFor, outputName, state);
    }
  }

  // 输出中保留块源码（release 由剥离逻辑处理）
  if (!state.options.release && block.sourceEnd > block.sourceStart) {
    parts.push(rawContent.slice(block.sourceStart, block.sourceEnd));
  }

  // debug 模式：在块源码后插入执行结果
  if (state.options.debug && result?.success && result.output !== null) {
    parts.push(debugInsert(result.output));
  }
}

/**
 * if 区执行：求值各分支条件，只执行第一个为真的分支
 * @param node - if 节点
 * @param rawContent - 原始文档
 * @param state - 执行状态
 * @param parts - 输出片段
 * @param currentFor - 所在 for 节点
 */
async function walkIf(
  node: IfNode,
  rawContent: string,
  state: BlockExecState,
  parts: string[],
  currentFor: ForNode | undefined
): Promise<void> {
  const activeBranch = pickBranch(node, state);

  // 指令注释行：default/debug 保留（写入输出），release 剥离
  const keepDirectives = !state.options.release;

  // 先输出 if 指令注释
  if (keepDirectives) {
    appendText(rawContent.slice(node.sourceStart, node.branches[0].start), state, parts);
  }

  // 逐分支处理：激活分支输出正文+子节点；其余分支只输出其前的指令注释
  for (let i = 0; i < node.branches.length; i++) {
    const branch = node.branches[i];

    if (i === activeBranch) {
      // 激活分支：正文 + 子节点（walkNodes 内部已处理分支首尾正文）
      const subCursor = { pos: branch.start };
      await walkNodes(branch.children, rawContent, subCursor, branch.end, state, parts, currentFor);
    }

    // 该分支与下一分支之间的指令注释（elif/else）
    if (keepDirectives && i < node.branches.length - 1) {
      const next = node.branches[i + 1];
      appendText(rawContent.slice(branch.end, next.start), state, parts);
    }
  }

  // 末尾 endif 指令注释
  if (keepDirectives) {
    appendText(rawContent.slice(node.branches[node.branches.length - 1].end, node.sourceEnd), state, parts);
  }
}

/**
 * 选择激活分支：依次求值条件，第一个为真的分支为激活；全假则 else 分支
 * @param node - if 节点
 * @param state - 执行状态
 * @returns 激活分支索引（无匹配且无 else 时返回 -1）
 */
function pickBranch(node: IfNode, state: BlockExecState): number {
  for (let i = 0; i < node.branches.length; i++) {
    const branch = node.branches[i];
    if (branch.condition === undefined) {
      // else 分支：兜底
      return i;
    }
    const truthy = evaluateCondition(branch.condition, (path) => state.context.resolve(path));
    if (truthy) return i;
  }
  return -1;
}

/**
 * for 区执行：遍历列表，每轮设置循环变量、执行子树、重复渲染正文
 * @param node - for 节点
 * @param rawContent - 原始文档
 * @param state - 执行状态
 * @param parts - 输出片段
 */
async function walkFor(
  node: ForNode,
  rawContent: string,
  state: BlockExecState,
  parts: string[]
): Promise<void> {
  const keepDirectives = !state.options.release;

  // for 指令注释
  if (keepDirectives) {
    appendText(rawContent.slice(node.sourceStart, node.bodyStart), state, parts);
  }

  // 列表来源：listExpr 是 context 变量路径（用 resolve 支持深层路径如 data.items）
  const list = resolveList(state.context.resolve(node.listExpr));
  const items = Array.isArray(list) ? list : [];

  // collect 数组仅在真正迭代时初始化，空列表/非数组不污染 context
  if (node.collect && items.length > 0) {
    state.context.set(node.collect, []);
  }

  for (const item of items) {
    // 设置循环变量（保存旧值以便嵌套循环结束后恢复）
    const prev = state.context.get(node.loopVar);
    state.context.set(node.loopVar, item);

    const subCursor = { pos: node.bodyStart };
    await walkNodes(node.children, rawContent, subCursor, node.bodyEnd, state, parts, node);

    // 恢复循环变量（外层 for 同名变量）或删除
    if (prev === undefined) {
      state.context.delete(node.loopVar);
    } else {
      state.context.set(node.loopVar, prev);
    }
  }

  // endfor 指令注释
  if (keepDirectives) {
    appendText(rawContent.slice(node.bodyEnd, node.sourceEnd), state, parts);
  }
}

/** 解析列表：数组直接返回；JSON 字符串尝试解析为数组；其它返回原值 */
function resolveList(value: unknown): unknown {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('[')) {
      try {
        const parsed: unknown = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // 非 JSON 数组字符串，保持原值
      }
    }
  }
  return value;
}

/**
 * parallel 区执行：并行执行区内所有块
 * @param node - parallel 节点
 * @param rawContent - 原始文档
 * @param state - 执行状态
 * @param parts - 输出片段
 * @param currentFor - 所在 for 节点（collect 用）
 */
async function walkParallel(
  node: ParallelNode,
  rawContent: string,
  state: BlockExecState,
  parts: string[],
  currentFor: ForNode | undefined
): Promise<void> {
  const keepDirectives = !state.options.release;

  // parallel 指令注释
  if (keepDirectives) {
    appendText(rawContent.slice(node.sourceStart, node.bodyStart), state, parts);
  }

  // 收集区内所有块（递归展开嵌套 parallel）；if/for 节点在树构建时已被拒绝
  const allBlocks: ExecutableBlock[] = [];
  const collectBlocks = (nodes: ControlNode[]): void => {
    for (const n of nodes) {
      if (n.kind === 'block') {
        allBlocks.push(n.block);
      } else if (n.kind === 'parallel') {
        collectBlocks(n.children);
      }
    }
  };
  collectBlocks(node.children);

  // 并行执行所有块
  const results = await Promise.allSettled(
    allBlocks.map(b => executeOneBlock(b, state))
  );

  // 按 source 顺序处理：正文（块间文本）+ 块源码 + 结果
  const byPos = allBlocks
    .map((b, i) => ({ b, r: results[i] }))
    .sort((x, y) => x.b.sourceStart - y.b.sourceStart);

  let cursor = node.bodyStart;
  for (const { b: block, r } of byPos) {
    // 块前正文
    appendText(rawContent.slice(cursor, block.sourceStart), state, parts);

    if (r.status === 'fulfilled' && r.value.action === 'stop') {
      throw new ControlFlowStop();
    }

    // collect 累积
    if (currentFor?.collect && r.status === 'fulfilled' && r.value.result?.success) {
      const outputName = block.meta.output as string;
      if (outputName) collectInto(currentFor, outputName, state);
    }

    // 输出源码
    if (!state.options.release && block.sourceEnd > block.sourceStart) {
      parts.push(rawContent.slice(block.sourceStart, block.sourceEnd));
    }

    // debug 模式
    if (state.options.debug && r.status === 'fulfilled' && r.value.result?.success && r.value.result.output !== null) {
      parts.push(debugInsert(r.value.result.output));
    }

    cursor = block.sourceEnd;
  }
  // 最后一个块后的正文
  appendText(rawContent.slice(cursor, node.bodyEnd), state, parts);

  // endparallel 指令注释
  if (keepDirectives) {
    appendText(rawContent.slice(node.bodyEnd, node.sourceEnd), state, parts);
  }
}

/**
 * collect 累积：把块 output 的当前值 push 进 collect 数组
 * 仅成功块会走到这里（调用方已用 result.success 守卫）
 * @param forNode - for 节点
 * @param outputName - 块 output 变量名
 * @param state - 执行状态
 */
function collectInto(forNode: ForNode, outputName: string, state: BlockExecState): void {
  if (!forNode.collect) return;
  const arr = state.context.get(forNode.collect);
  if (!Array.isArray(arr)) return;
  const value = state.context.get(outputName);
  // 未产生值（本轮失败）不 push
  if (value !== undefined) {
    arr.push(value);
    state.context.set(forNode.collect, arr);
  }
}

/** debug 模式插入的结果块（与 executor.insertResult 格式一致） */
function debugInsert(output: string): string {
  return t('debug.insertResult', { result: output.split('\n').join('\n> ') });
}
