/**
 * FlowMD 输出投递模块
 * 将块输出投递到指定目的地（webhook / file）
 */

import { getErrorMessage } from '../utils/error-formatter.js';

/** 投递结果 */
export interface DeliverResult {
  /** 是否成功 */
  success: boolean;
  /** 错误消息 */
  error?: string;
}

/**
 * 将块输出投递到指定目的地
 * @param target - deliver 值（如 "webhook:https://..." 或 "file:./out.md"）
 * @param output - 块输出内容
 * @param blockType - 块类型（用于 webhook payload）
 * @returns 投递结果
 */
export async function deliver(target: string, output: string, blockType: string): Promise<DeliverResult> {
  if (target.startsWith('webhook:')) {
    return deliverWebhook(target.slice(8), output, blockType);
  }
  if (target.startsWith('file:')) {
    return deliverFile(target.slice(5), output);
  }
  return { success: false, error: `未知的投递目标: ${target}` };
}

/**
 * POST JSON 到 webhook URL
 * @param url - 目标 URL
 * @param output - 块输出
 * @param blockType - 块类型
 */
async function deliverWebhook(url: string, output: string, blockType: string): Promise<DeliverResult> {
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        output,
        block: blockType,
        timestamp: new Date().toISOString(),
      }),
    });
    if (!resp.ok) {
      return { success: false, error: `HTTP ${resp.status}: ${resp.statusText}` };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: getErrorMessage(err) };
  }
}

/**
 * 写入文件（自动创建目录）
 * @param filePath - 文件路径
 * @param output - 块输出
 */
async function deliverFile(filePath: string, output: string): Promise<DeliverResult> {
  try {
    const { writeFileSync, mkdirSync } = await import('node:fs');
    const { dirname, resolve } = await import('node:path');
    const absPath = resolve(filePath);
    mkdirSync(dirname(absPath), { recursive: true });
    writeFileSync(absPath, output, 'utf-8');
    return { success: true };
  } catch (err) {
    return { success: false, error: getErrorMessage(err) };
  }
}
