/**
 * agent 工具：file_read（项目目录内只读）
 * 安全边界（ADR-016）：仅限项目根目录内，禁 .. 逃逸 / 符号链接逃逸 / 目录 / 超大文件
 */

import { realpath, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { ToolHandler, ToolHandlerResult } from '../types.js';

/** 单文件读取上限（字节），防止读取超大文件 */
const MAX_BYTES = 64 * 1024;

/**
 * 解析并校验路径：必须在项目根目录内
 * 双重校验：resolve 后字符串包含性 + realpath 防符号链接逃逸
 * @param projectRoot - 项目根目录（绝对路径）
 * @param relPath - 相对路径参数
 * @returns 校验后的真实绝对路径
 */
async function resolveSafe(projectRoot: string, relPath: string): Promise<string> {
  const rootReal = await realpath(projectRoot);
  const resolved = path.resolve(rootReal, relPath);
  if (resolved !== rootReal && !resolved.startsWith(rootReal + path.sep)) {
    throw new Error(`path escapes the project root: ${relPath}`);
  }
  let fileReal: string;
  try {
    fileReal = await realpath(resolved);
  } catch {
    throw new Error(`file not found: ${relPath}`);
  }
  if (fileReal !== rootReal && !fileReal.startsWith(rootReal + path.sep)) {
    throw new Error(`path escapes the project root: ${relPath}`);
  }
  return fileReal;
}

/**
 * 创建 file_read 工具
 * @param projectRoot - 项目根目录（绝对路径）
 * @returns 工具处理器
 */
export function createFileReadTool(projectRoot: string): ToolHandler {
  return {
    name: 'file_read',
    description:
      '读取项目目录内的文本文件（只读，上限 64KB）。参数 path：相对项目根的路径，如 "docs/index.md"。',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '项目内相对路径，如 docs/index.md' },
      },
      required: ['path'],
    },
    async execute(args: Record<string, unknown>): Promise<ToolHandlerResult> {
      const relPath = typeof args.path === 'string' ? args.path : '';
      if (!relPath.trim()) {
        return { ok: false, error: 'path is required' };
      }
      try {
        const fileReal = await resolveSafe(projectRoot, relPath);
        const info = await stat(fileReal);
        if (info.isDirectory()) {
          return { ok: false, error: `is a directory, expected a file: ${relPath}` };
        }
        if (info.size > MAX_BYTES) {
          return { ok: false, error: `file too large (max ${MAX_BYTES} bytes): ${relPath}` };
        }
        const content = await readFile(fileReal, 'utf-8');
        return { ok: true, result: content };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}
