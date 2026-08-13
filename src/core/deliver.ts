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

/** webhook fetch 超时（毫秒），防止黑洞地址挂死执行 */
const WEBHOOK_TIMEOUT_MS = 10000;

/** file 投递允许的目录（项目内 .flow/output/），防止任意文件写 */
const DELIVER_DIR = '.flow/output';

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
 * POST JSON 到 webhook URL（协议白名单 + 超时）
 * @param url - 目标 URL
 * @param output - 块输出
 * @param blockType - 块类型
 */
async function deliverWebhook(url: string, output: string, blockType: string): Promise<DeliverResult> {
  // 协议白名单：仅 http/https，拒绝 file:// 等 SSRF 向量
  if (!/^https?:\/\//i.test(url)) {
    return { success: false, error: `不支持的 webhook 协议: ${url.slice(0, 20)}` };
  }
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        output,
        block: blockType,
        timestamp: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
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
 * 写入文件（限定项目 .flow/output/ 目录内，自动创建目录）
 * @param filePath - 相对路径（如 "report.md" / "sub/report.md"）
 * @param output - 块输出
 */
async function deliverFile(filePath: string, output: string): Promise<DeliverResult> {
  try {
    const { writeFileSync, mkdirSync } = await import('node:fs');
    const { resolve, relative } = await import('node:path');
    // 目标固定在项目 .flow/output/ 下，拒绝绝对路径与 .. 逃逸
    const base = resolve(process.cwd(), DELIVER_DIR);
    const target = resolve(base, filePath);
    const rel = relative(base, target);
    if (rel.startsWith('..') || rel.includes('..' + '/') || rel.includes('..' + '\\')) {
      return { success: false, error: 'file 投递目标必须在项目 .flow/output/ 目录内' };
    }
    mkdirSync(target.substring(0, target.lastIndexOf('/')) || base, { recursive: true });
    writeFileSync(target, output, 'utf-8');
    return { success: true };
  } catch (err) {
    return { success: false, error: getErrorMessage(err) };
  }
}
