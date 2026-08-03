/**
 * FlowMD include 展开器（ADR：executor 拆分）
 * .md include 预展开、路径解析与安全校验（循环引用 / 越界 / 扩展名白名单）
 */

import path from 'node:path';
import { readFileSync } from 'node:fs';
import { realpath } from 'node:fs/promises';
import { parseMarkdown } from './parser.js';
import { t } from '../utils/i18n.js';
import type { ParsedDocument } from '../types/index.js';

/**
 * 解析 include 路径
 * @param includePath - include 块中的 path 参数
 * @param currentFile - 当前执行文件路径
 * @returns 解析后的绝对路径
 */
export function resolveIncludePath(includePath: string, currentFile?: string): string {
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
export async function expandMdIncludes(doc: ParsedDocument, currentFile: string | undefined, visitedPaths: Set<string>): Promise<void> {
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
 * 验证路径是否位于项目根内（realpath 双端校验，防符号链接逃逸；
 * realpath 失败时退回词法校验，兼容目标文件尚不存在等场景）
 * @param resolvedPath - 待校验的绝对路径
 * @returns 是否越界
 */
export async function isOutOfBounds(resolvedPath: string): Promise<boolean> {
  try {
    const rootReal = await realpath(process.cwd());
    const fileReal = await realpath(resolvedPath);
    return fileReal !== rootReal && !fileReal.startsWith(rootReal + path.sep);
  } catch {
    return !resolvedPath.startsWith(process.cwd());
  }
}

/**
 * 验证 include 路径的安全性
 * 检查：扩展名白名单、循环引用、路径越界
 * @param resolvedPath - 解析后的绝对路径
 * @param visitedPaths - 已访问路径集合
 * @param ext - 文件扩展名（小写）
 */
export async function validateIncludePath(
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
