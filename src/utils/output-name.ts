/**
 * FlowMD 输出文件名工具
 * -o new 模式的默认命名：name_YYYY-MM-DD.md，同日多次运行追加序号 _2、_3
 */

import { existsSync } from 'node:fs';

/**
 * 生成不冲突的新输出文件名（name_YYYY-MM-DD.ext，同日重复则加序号）
 * @param name - 源文件名（不含扩展名）
 * @param ext - 扩展名（含点，如 .md）
 * @returns 不冲突的文件名
 */
export function nextNewFilename(name: string, ext: string): string {
  const date = new Date().toISOString().split('T')[0];
  let candidate = `${name}_${date}${ext}`;
  let counter = 2;
  while (existsSync(candidate)) {
    candidate = `${name}_${date}_${counter}${ext}`;
    counter++;
  }
  return candidate;
}
