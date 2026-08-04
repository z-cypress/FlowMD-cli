/**
 * FlowMD 输出构建器（ADR：executor 拆分）
 * debug 结果插入 / 最终渲染 / release 剥离
 */

import type { ExecutionContext } from './context.js';
import { t } from '../utils/i18n.js';

/**
 * 将执行结果插入到内容的指定位置
 * @param content - 原始内容
 * @param sourceEnd - 插入位置（字符偏移）
 * @param result - 执行结果
 * @returns 插入结果后的内容
 */
export function insertResult(content: string, sourceEnd: number, result: string): string {
  const before = content.slice(0, sourceEnd);
  const after = content.slice(sourceEnd);

  const resultBlock = t('debug.insertResult', { result: result.split('\n').join('\n> ') });

  return before + resultBlock + after;
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
export function renderDocument(content: string, blocks: Array<{ type: string; sourceStart: number; sourceEnd: number }>, context: ExecutionContext): string {
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
* 以及并行区指令注释（parallel / endparallel）
* @param content - 渲染后的文档内容
* @returns 移除指令块后的内容
*/
export function stripCodeBlocks(content: string): string {
  // 匹配 ```ai/data/template/include/run/agent/doc 代码块（含可选元数据），包括前后的空行
  const blockPattern = new RegExp(
    '```(?:ai|data|template|include|run|agent|doc)\\s*(?:\\{[^}]*\\})?\\s*\\n[\\s\\S]*?```\\s*\\n*',
   'g'
  );
  let result = content.replace(blockPattern, '');

  // 移除 parallel / endparallel 指令注释
  const parallelPattern = /<!--\s*(?:parallel|endparallel)\s*-->\s*\n?/g;
  result = result.replace(parallelPattern, '');

  return result;
}
