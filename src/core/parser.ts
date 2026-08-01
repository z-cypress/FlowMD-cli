/**
 * FlowMD Markdown 解析器
 * 从 Markdown 内容中提取可执行代码块和变量
 */

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { visit } from 'unist-util-visit';
import type { ParsedDocument, ExecutableBlock, BlockType, ControlDirective } from '../types/index.js';
import { parseDirective } from './blocks/control/directives.js';

/** 支持的代码块类型列表 */
const BLOCK_TYPES: BlockType[] = ['ai', 'data', 'template', 'include', 'run'];

/**
 * 解析 Markdown 内容，提取可执行块
 * @param content - 原始 Markdown 内容
 * @returns 解析后的文档，包含块和变量
 */
export function parseMarkdown(content: string): ParsedDocument {
  // 使用 unified + remark-parse 解析 Markdown 为 AST
  const tree = unified().use(remarkParse).parse(content);
  const blocks: ExecutableBlock[] = [];
  const directives: ControlDirective[] = [];
  const variables = new Set<string>();
  let position = 0;

  // 遍历所有代码块节点
  visit(tree, 'code', (node) => {
    const lang = node.lang as string | undefined;
    if (!lang) return;

    // 检测是否为 FlowMD 块类型
    const blockType = detectBlockType(lang);
    if (!blockType) return;

    // 优先使用 remark 解析的 meta 属性，否则从 lang 解析
    const metaStr = node.meta as string | undefined;
    const meta = metaStr ? parseMetadata(metaStr) : {};
    const nodePosition = node.position;

    blocks.push({
      type: blockType,
      content: node.value as string,
      lang,
      meta,
      position: position++,
      sourceStart: nodePosition?.start?.offset ?? 0,
      sourceEnd: nodePosition?.end?.offset ?? 0,
    });
  });

  // 遍历所有 HTML 注释节点，识别控制流指令
  visit(tree, 'html', (node) => {
    const nodePosition = node.position;
    const start = nodePosition?.start?.offset ?? -1;
    if (start < 0) return;
    const directive = parseDirective(node.value as string, start);
    if (directive) {
      directives.push(directive);
    }
  });

  // 提取文档中所有 {{变量名}} 引用（支持连字符）
  const variableRegex = /\{\{([\w-]+(?:\.[\w-]+)*)\}\}/g;
  let match;
  while ((match = variableRegex.exec(content)) !== null) {
    variables.add(match[1]);
  }

  return {
    blocks,
    rawContent: content,
    variables: [...variables],
    directives,
  };
}

/**
 * 检测代码块语言标识符是否为 FlowMD 块类型
 * @param lang - 代码块的语言标识符
 * @returns 块类型，如果不是 FlowMD 块则返回 null
 */
function detectBlockType(lang: string): BlockType | null {
  const trimmed = lang.trim().toLowerCase();
  for (const type of BLOCK_TYPES) {
    if (trimmed === type || trimmed.startsWith(type + ' ') || trimmed.startsWith(type + '{')) {
      return type;
    }
  }
  return null;
}

/**
 * 从 meta 字符串解析元数据
 * 输入：'{from: "default", output: "sales"}'
 * 输出：{from: 'default', output: 'sales'}
 * 数组值（如 vars: ["a", "b"]）解析为字符串数组
 * @param metaStr - remark 解析的原始 meta 字符串
 * @returns 解析后的元数据对象
 */
function parseMetadata(metaStr: string): Record<string, string | string[]> {
  const meta: Record<string, string | string[]> = {};

  // 使用花括号计数提取内容，支持嵌套
  const startIndex = metaStr.indexOf('{');
  if (startIndex === -1) return meta;

  let depth = 0;
  let endIndex = -1;
  for (let i = startIndex; i < metaStr.length; i++) {
    if (metaStr[i] === '{') depth++;
    if (metaStr[i] === '}') {
      depth--;
      if (depth === 0) {
        endIndex = i;
        break;
      }
    }
  }

  if (endIndex === -1) return meta;

  const content = metaStr.slice(startIndex + 1, endIndex);
  if (!content.trim()) return meta;

  // 按顶层逗号分割键值对（忽略引号内部的逗号）
  const pairs = splitTopLevel(content);
  for (const pair of pairs) {
    const colonIndex = pair.indexOf(':');
    if (colonIndex === -1) continue;

    const key = pair.slice(0, colonIndex).trim();
    const value = pair.slice(colonIndex + 1).trim();

    // 数组值：[a, b] 或 ["a", "b"]
    if (value.startsWith('[') && value.endsWith(']')) {
      const inner = value.slice(1, -1).trim();
      meta[key] = inner
        ? splitTopLevel(inner).map((item) => unquoteValue(item.trim()))
        : [];
      continue;
    }

    if (key) {
      meta[key] = unquoteValue(value);
    }
  }

  return meta;
}

/**
 * 移除值两侧的引号并处理转义
 * @param value - 原始值
 * @returns 去引号后的值
 */
function unquoteValue(value: string): string {
  let result = value;
  if ((result.startsWith('"') && result.endsWith('"')) ||
      (result.startsWith("'") && result.endsWith("'"))) {
    result = result.slice(1, -1);
    // 处理转义字符
    result = result.replace(/\\"/g, '"').replace(/\\'/g, "'").replace(/\\\\/g, '\\');
  }
  return result;
}

/**
 * 按顶层逗号分割字符串，忽略引号或方括号内部的逗号
 * @param str - 要分割的字符串
 * @returns 分割后的片段数组
 */
function splitTopLevel(str: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  let bracketDepth = 0;

  for (const ch of str) {
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === '[' && !inSingle && !inDouble) bracketDepth++;
    else if (ch === ']' && !inSingle && !inDouble) bracketDepth--;

    if (ch === ',' && !inSingle && !inDouble && bracketDepth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}
