/**
 * agent 工具：file_write（限 .flow/output/ 目录）
 * 安全边界（ADR-016）：仅可写入项目根下的 .flow/output/，禁 .. 逃逸 / 符号链接逃逸 / 绝对路径越界
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { resolveWritePath } from './path-guard.js';
import type { ToolHandler, ToolHandlerResult } from '../types.js';

/** 单文件写入上限（字节） */
const MAX_BYTES = 1024 * 1024;

/**
 * 创建 file_write 工具
 * @param projectRoot - 项目根目录（绝对路径）
 * @returns 工具处理器
 */
export function createFileWriteTool(projectRoot: string): ToolHandler {
  return {
    name: 'file_write',
    description:
      '写入文本文件，仅限项目根下的 .flow/output/ 目录（上限 1MB）。参数 path：相对 .flow/output/ 的路径，content：要写入的文本。',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '相对 .flow/output/ 的路径，如 reports/result.json' },
        content: { type: 'string', description: '要写入的文本内容' },
      },
      required: ['path', 'content'],
    },
    async execute(args: Record<string, unknown>): Promise<ToolHandlerResult> {
      const relPath = typeof args.path === 'string' ? args.path : '';
      if (!relPath.trim()) {
        return { ok: false, error: 'path is required' };
      }
      if (typeof args.content !== 'string') {
        return { ok: false, error: 'content is required' };
      }
      const content = args.content;
      if (Buffer.byteLength(content, 'utf-8') > MAX_BYTES) {
        return { ok: false, error: `content too large (max ${MAX_BYTES} bytes)` };
      }
      const outputDir = path.join(projectRoot, '.flow', 'output');
      try {
        await mkdir(outputDir, { recursive: true });
        const target = await resolveWritePath(outputDir, relPath);
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, content, 'utf-8');
        return { ok: true, result: `written: ${relPath}` };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}
