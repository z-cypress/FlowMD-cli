/**
 * FlowMD Markdown 解析器
 * 从 Markdown 内容中提取可执行代码块和变量
 */

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { visit } from 'unist-util-visit';
import type { ParsedDocument, ExecutableBlock, BlockType } from '../types/index.js';

/** 支持的代码块类型列表 */
const BLOCK_TYPES: BlockType[] = ['ai', 'data', 'template'];

/**
 * 解析 Markdown 内容，提取可执行块
 * @param content - 原始 Markdown 内容
 * @returns 解析后的文档，包含块和变量
 */
export function parseMarkdown(content: string): ParsedDocument {
  // 使用 unified + remark-parse 解析 Markdown 为 AST
  const tree = unified().use(remarkParse).parse(content);
  const blocks: ExecutableBlock[] = [];
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
 * @param metaStr - remark 解析的原始 meta 字符串
 * @returns 解析后的元数据对象
 */
function parseMetadata(metaStr: string): Record<string, string> {
  const meta: Record<string, string> = {};

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

  // 按逗号分割，再按冒号分割键值对
  const pairs = content.split(',');
  for (const pair of pairs) {
    const colonIndex = pair.indexOf(':');
    if (colonIndex === -1) continue;

    const key = pair.slice(0, colonIndex).trim();
    let value = pair.slice(colonIndex + 1).trim();

    // 如果值有引号，移除引号并处理转义
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
      // 处理转义字符
      value = value.replace(/\\"/g, '"').replace(/\\'/g, "'").replace(/\\\\/g, '\\');
    }

    if (key) {
      meta[key] = value;
    }
  }

  return meta;
}
