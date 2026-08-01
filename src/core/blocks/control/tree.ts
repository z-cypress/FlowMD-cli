/**
 * v1.3 控制流指令配对树构建
 * 将解析出的块与指令按 source 顺序合并，构建成支持嵌套的指令区树。
 * 规则：
 *   - if 区：`<!-- if: COND -->` ... `<!-- elif -->` ... `<!-- else -->` ... `<!-- endif -->`
 *   - for 区：`<!-- for: x in list [ {collect: "name"} ] -->` ... `<!-- endfor -->`
 *   - 支持嵌套（if 内 for、for 内 if）
 *   - 未配对的 if/for/end* 报错
 */

import type {
  ParsedDocument,
  ExecutableBlock,
  ControlNode,
  IfNode,
  ForNode,
} from '../../../types/index.js';

/** 指令解析失败错误，携带位置信息 */
export class ControlTreeError extends Error {
  /** 指令在文档中的偏移 */
  readonly pos: number;

  constructor(message: string, pos: number) {
    super(message);
    this.name = 'ControlTreeError';
    this.pos = pos;
  }
}

/** 构建中使用的帧：if 区或 for 区 */
type Frame = IfFrame | ForFrame;

interface IfFrame {
  kind: 'if';
  node: IfNode;
  /** 当前正在填充的分支（index 指向 branches） */
  branchIndex: number;
  /** 上一个分支的结束偏移（用于回填 end） */
  lastEnd: number;
  /** 是否已出现 else（else 之后不允许 elif/else） */
  sawElse: boolean;
}

interface ForFrame {
  kind: 'for';
  node: ForNode;
  /** 上一个子节点结束偏移（用于回填文本区间，暂未用） */
  lastEnd: number;
}

/** 顶层收集器：把节点追加到所属容器的 children */
interface Container {
  children: ControlNode[];
}

/**
 * 合并块与指令为按 source 顺序的元素序列
 * @param doc - 解析后的文档
 * @returns 排序后的元素序列
 */
function mergeElements(doc: ParsedDocument): Array<{ kind: 'block' | 'directive'; item: ExecutableBlock | NonNullable<ParsedDocument['directives']>[number]; start: number }> {
  const elements: Array<{ kind: 'block' | 'directive'; item: ExecutableBlock | NonNullable<ParsedDocument['directives']>[number]; start: number }> = [];

  for (const b of doc.blocks) {
    elements.push({ kind: 'block', item: b, start: b.sourceStart });
  }
  for (const d of doc.directives ?? []) {
    elements.push({ kind: 'directive', item: d, start: d.sourceStart });
  }

  elements.sort((a, b) => a.start - b.start);
  return elements;
}

/**
 * 构建控制流指令区树
 * @param doc - 解析后的文档（含 blocks 与 directives）
 * @returns 顶层节点数组（按 source 顺序）
 */
export function buildControlTree(doc: ParsedDocument): ControlNode[] {
  const roots: ControlNode[] = [];
  const stack: Frame[] = [];

  const currentContainer = (): Container => {
    const frame = stack[stack.length - 1];
    if (!frame) return { children: roots };
    if (frame.kind === 'if') return { children: frame.node.branches[frame.branchIndex].children };
    return { children: frame.node.children };
  };

  const elements = mergeElements(doc);

  for (const el of elements) {
    if (el.kind === 'block') {
      currentContainer().children.push({ kind: 'block', block: el.item as ExecutableBlock });
      continue;
    }

    const directive = el.item as NonNullable<ParsedDocument['directives']>[number];
    const start = directive.sourceStart;
    const end = directive.sourceEnd;

    switch (directive.kind) {
      case 'if': {
        const node: IfNode = {
          kind: 'if',
          sourceStart: start,
          sourceEnd: end,
          branches: [
            {
              condition: directive.condition,
              start: end,
              end: end,
              children: [],
            },
          ],
        };
        currentContainer().children.push(node);
        stack.push({ kind: 'if', node, branchIndex: 0, lastEnd: end, sawElse: false });
        break;
      }
      case 'elif': {
        const frame = topIfFrame(stack);
        if (!frame) throw new ControlTreeError('elif 前缺少对应的 if（或当前未处于 if 区内）', start);
        if (frame.sawElse) throw new ControlTreeError('else 之后不允许 elif', start);
        // 回填上一个分支的结束偏移
        const prev = frame.node.branches[frame.branchIndex];
        prev.end = start;
        // 开新分支
        frame.node.branches.push({
          condition: directive.condition,
          start: end,
          end: end,
          children: [],
        });
        frame.branchIndex++;
        break;
      }
      case 'else': {
        const frame = topIfFrame(stack);
        if (!frame) throw new ControlTreeError('else 前缺少对应的 if（或当前未处于 if 区内）', start);
        if (frame.sawElse) throw new ControlTreeError('重复的 else', start);
        const prev = frame.node.branches[frame.branchIndex];
        prev.end = start;
        frame.node.branches.push({
          condition: undefined,
          start: end,
          end: end,
          children: [],
        });
        frame.branchIndex++;
        frame.sawElse = true;
        break;
      }
      case 'endif': {
        const frame = topIfFrame(stack);
        if (!frame) throw new ControlTreeError('endif 前缺少对应的 if（或当前未处于 if 区内）', start);
        const prev = frame.node.branches[frame.branchIndex];
        prev.end = start;
        frame.node.sourceEnd = end;
        stack.pop();
        break;
      }
      case 'for': {
        const node: ForNode = {
          kind: 'for',
          loopVar: directive.loopVar || '',
          listExpr: directive.listExpr || '',
          collect: directive.collect,
          sourceStart: start,
          sourceEnd: end,
          bodyStart: end,
          bodyEnd: end,
          children: [],
        };
        currentContainer().children.push(node);
        stack.push({ kind: 'for', node, lastEnd: end });
        break;
      }
      case 'endfor': {
        const frame = topForFrame(stack);
        if (!frame) throw new ControlTreeError('endfor 前缺少对应的 for（或当前未处于 for 区内）', start);
        frame.node.bodyEnd = start;
        frame.node.sourceEnd = end;
        stack.pop();
        break;
      }
    }
  }

  // 检查未闭合的指令
  if (stack.length > 0) {
    const frame = stack[stack.length - 1];
    const pos = frame.kind === 'if' ? frame.node.sourceStart : frame.node.sourceStart;
    throw new ControlTreeError(
      frame.kind === 'if' ? 'if 区缺少 endif' : 'for 区缺少 endfor',
      pos
    );
  }

  // 后置校验：声明 collect 的 for 区内必须恰好一个产出变量（多 output 报错）
  validateCollectOutputs(roots);

  return roots;
}

/**
 * 校验 collect 约束：声明 collect 的 for 区内必须恰好一个带 output 的块
 * @param nodes - 树节点数组
 */
function validateCollectOutputs(nodes: ControlNode[]): void {
  for (const node of nodes) {
    if (node.kind === 'for' && node.collect) {
      const outputs = collectOutputNames(node.children);
      if (outputs.length !== 1) {
        throw new ControlTreeError(
          `collect 循环体内必须恰好一个带 output 的块，实际 ${outputs.length} 个${outputs.length > 0 ? `（${outputs.join(', ')}）` : ''}`,
          node.sourceStart
        );
      }
    }
    if (node.kind === 'for') {
      validateCollectOutputs(node.children);
    } else if (node.kind === 'if') {
      for (const branch of node.branches) {
        validateCollectOutputs(branch.children);
      }
    }
  }
}

/** 收集 for 区直接执行范围内的 output 块名（含 if 分支，不含嵌套 for——嵌套 for 用自己的 collect） */
function collectOutputNames(nodes: ControlNode[]): string[] {
  const names: string[] = [];
  const walk = (list: ControlNode[]): void => {
    for (const node of list) {
      if (node.kind === 'block') {
        const output = (node.block.meta.output as string | undefined) ?? '';
        if (output && !names.includes(output)) {
          names.push(output);
        }
      } else if (node.kind === 'if') {
        // if 分支内块与当前 for 共享 currentFor，计入
        for (const branch of node.branches) {
          walk(branch.children);
        }
      }
      // 嵌套 for：跳过（内层 for 有独立 collect 作用域）
    }
  };
  walk(nodes);
  return names;
}

/** 取栈顶帧，若栈顶不是 if 帧则返回 null（严格嵌套：只匹配当前指令区） */
function topIfFrame(stack: Frame[]): IfFrame | null {
  const top = stack[stack.length - 1];
  return top && top.kind === 'if' ? top : null;
}

/** 取栈顶帧，若栈顶不是 for 帧则返回 null（严格嵌套：只匹配当前指令区） */
function topForFrame(stack: Frame[]): ForFrame | null {
  const top = stack[stack.length - 1];
  return top && top.kind === 'for' ? top : null;
}
