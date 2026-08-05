/**
 * FlowMD 插件加载器
 * 从 .flow/plugins/ 动态加载自定义块类型插件
 */

import { readdirSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { getErrorMessage } from '../utils/error-formatter.js';
import type { BlockResult } from '../types/index.js';
import type { ExecutionContext } from './context.js';

/** 块插件接口 */
export interface BlockPlugin {
  /** 块类型名（如 "custom"） */
  name: string;
  /** 插件描述（可选，用于 help blocks 显示） */
  description?: string;
  /** 执行函数 */
  execute: (
    content: string,
    meta: Record<string, string | string[]>,
    context: ExecutionContext,
    signal?: AbortSignal
  ) => Promise<BlockResult>;
}

/**
 * 从 .flow/plugins/ 加载所有插件
 * @param pluginDir - 插件目录路径
 * @returns 已加载的插件列表
 */
export async function loadPlugins(pluginDir: string): Promise<BlockPlugin[]> {
  const plugins: BlockPlugin[] = [];
  if (!existsSync(pluginDir)) return plugins;

  for (const file of readdirSync(pluginDir)) {
    const ext = extname(file).toLowerCase();
    if (ext !== '.js' && ext !== '.ts') continue;

    try {
      const filePath = join(pluginDir, file);
      const mod = await import(pathToFileURL(filePath).href);
      const plugin = mod.default ?? mod;
      if (plugin && typeof plugin.name === 'string' && typeof plugin.execute === 'function') {
        plugins.push(plugin as BlockPlugin);
      }
    } catch (err) {
      console.warn(`⚠ Plugin load failed: ${file}: ${getErrorMessage(err)}`);
    }
  }

  return plugins;
}
