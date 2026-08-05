/**
 * FlowMD Prompt 库加载器
 * 从 .flow/prompts/ 加载命名 prompt 模板
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 从 .flow/prompts/ 加载命名 prompt 模板
 * @param name - prompt 名称（不含 .md 后缀）
 * @param projectRoot - 项目根目录（默认 process.cwd()）
 * @returns prompt 模板内容，未找到返回 null
 */
export function loadPrompt(name: string, projectRoot?: string): string | null {
  const root = projectRoot ?? process.cwd();
  const promptPath = join(root, '.flow', 'prompts', `${name}.md`);
  if (!existsSync(promptPath)) return null;
  try {
    return readFileSync(promptPath, 'utf-8');
  } catch {
    return null;
  }
}
