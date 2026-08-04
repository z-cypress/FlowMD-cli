/**
 * FlowMD 块结果缓存
 * 按块 (type + content + meta + 输入变量值) 的哈希存储 ai/data 块结果到 .flow/cache/
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ExecutableBlock } from '../types/index.js';
import type { ExecutionContext } from './context.js';

/** 系统变量不参与缓存键（避免伪命中/伪失效） */
const SYSTEM_VARS = new Set(['execution_time', 'date', 'datetime', 'timestamp']);

/** 变量引用正则（支持管道语法，只提取管道前的变量名） */
const VAR_REF_REGEX = /\{\{([\w.-]+)(?:\s*\|[^}]*)?\}\}/g;

/** 缓存文件中的一条记录 */
export interface CacheRecord {
  /** 块输出文本（BlockResult.output） */
  output: string;
  /** 存入上下文的变量值（data 为行数组，ai 为字符串） */
  value: unknown;
  /** 原始执行耗时（毫秒） */
  duration: number;
  /** 缓存写入时间（ISO） */
  cachedAt: string;
}

/** 缓存目录路径 */
function cacheDir(): string {
  return join(process.cwd(), '.flow', 'cache');
}

/**
 * 从块内容中提取引用的顶层变量名
 * @param content - 块内容
 * @returns 顶层变量名列表
 */
function extractTopLevelRefs(content: string): string[] {
  const refs: string[] = [];
  VAR_REF_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = VAR_REF_REGEX.exec(content)) !== null) {
    const topName = match[1].split('.')[0].split('[')[0];
    if (!refs.includes(topName)) refs.push(topName);
  }
  return refs;
}

/**
 * 计算块缓存键：sha256(type + content + meta + 引用的输入变量值)
 * 系统变量与未定义变量不参与键
 * @param block - 块
 * @param context - 变量上下文（取引用的输入变量值）
 * @returns 缓存哈希
 */
export function cacheKey(block: ExecutableBlock, context: ExecutionContext): string {
  const refs = extractTopLevelRefs(block.content);
  const inputVars: Record<string, unknown> = {};
  for (const ref of refs) {
    if (SYSTEM_VARS.has(ref)) continue;
    const value = context.get(ref);
    if (value !== undefined) inputVars[ref] = value;
  }

  const payload = JSON.stringify({
    type: block.type,
    content: block.content,
    meta: block.meta,
    inputVars,
  });
  return createHash('sha256').update(payload).digest('hex');
}

/**
 * 读取缓存记录（无缓存返回 null）
 * @param hash - 缓存哈希
 * @returns 缓存记录或 null
 */
export function readCache(hash: string): CacheRecord | null {
  const filePath = join(cacheDir(), `${hash}.json`);
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as CacheRecord;
  } catch {
    return null;
  }
}

/**
 * 写入缓存记录
 * @param hash - 缓存哈希
 * @param record - 缓存记录
 */
export function writeCache(hash: string, record: CacheRecord): void {
  try {
    mkdirSync(cacheDir(), { recursive: true });
    writeFileSync(join(cacheDir(), `${hash}.json`), JSON.stringify(record), 'utf-8');
  } catch {
    // 缓存写入失败不影响执行
  }
}
