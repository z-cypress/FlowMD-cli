/**
 * FlowMD Prompt 库加载器
 * 从 .flow/prompts/ 加载命名 prompt 模板
 */

import { readFileSync, existsSync, realpathSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 校验 prompt 名称是否安全（拒绝路径遍历：分隔符 / .. / 扩展名）
 * @param name - prompt 名称
 * @returns 是否安全
 */
function isSafePromptName(name: string): boolean {
  if (!name || name.length > 100) return false;
  if (/[/\\]/.test(name)) return false;      // 路径分隔符
  if (name.includes('..')) return false;      // 上级目录
  if (/\.(md|json|yaml|yml)$/i.test(name)) return false; // 不允许带扩展名
  return /^[\w.-]+$/.test(name);
}

/**
 * 从 .flow/prompts/ 加载命名 prompt 模板
 * @param name - prompt 名称（不含 .md 后缀）
 * @param projectRoot - 项目根目录（默认 process.cwd()）
 * @returns prompt 模板内容，未找到或名称不安全返回 null
 */
export function loadPrompt(name: string, projectRoot?: string): string | null {
  if (!isSafePromptName(name)) return null;
  const root = projectRoot ?? process.cwd();
  const promptsDir = join(root, '.flow', 'prompts');
  const promptPath = join(promptsDir, `${name}.md`);
  if (!existsSync(promptPath)) return null;
  try {
    // realpath 校验：确认解析后的路径仍在 prompts 目录内（防符号链接逃逸）
    const real = realpathSync(promptPath);
    const realDir = realpathSync(promptsDir);
    if (real !== realDir && !real.startsWith(realDir + '/')) return null;
    return readFileSync(promptPath, 'utf-8');
  } catch {
    return null;
  }
}
