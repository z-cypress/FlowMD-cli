/**
 * 路径守卫（写入场景）
 * 校验目标路径必须位于允许目录内：resolve 字符串包含性 + realpath 最深层已存在祖先防符号链接逃逸
 */

import { realpath } from 'node:fs/promises';
import path from 'node:path';

/**
 * 解析写入目标路径并校验其位于 baseDir 内
 * 目标文件可能不存在（写入场景），因此向上回溯到最深层已存在祖先做 realpath 校验
 * @param baseDir - 允许目录（绝对路径，须已存在）
 * @param relPath - 相对路径
 * @returns 校验后的绝对路径
 */
export async function resolveWritePath(baseDir: string, relPath: string): Promise<string> {
  const baseReal = await realpath(baseDir);
  const resolved = path.resolve(baseReal, relPath);

  if (resolved !== baseReal && !resolved.startsWith(baseReal + path.sep)) {
    throw new Error(`path escapes the allowed directory: ${relPath}`);
  }

  // 向上回溯到最深层已存在的祖先，realpath 后重新校验包含性
  let probe = resolved;
  const missing: string[] = [];
  let real: string;
  for (;;) {
    try {
      real = await realpath(probe);
      break;
    } catch {
      const parent = path.dirname(probe);
      if (parent === probe) throw new Error(`invalid path: ${relPath}`);
      missing.unshift(path.basename(probe));
      probe = parent;
    }
  }

  const combined = missing.length > 0 ? path.join(real, ...missing) : real;
  if (combined !== baseReal && !combined.startsWith(baseReal + path.sep)) {
    throw new Error(`path escapes the allowed directory: ${relPath}`);
  }
  return combined;
}
