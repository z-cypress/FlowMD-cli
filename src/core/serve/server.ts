/**
 * flowmd serve — 零依赖原生 http 服务器
 * 手写轻量路由（ADR-007），支持 POST /execute、GET /templates、GET /health
 */

import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse, Server } from 'node:http';
import type { ApiResponse, ServeConfig } from './types.js';

/** 路由处理器签名 */
type RouteHandler = (req: IncomingMessage, body: string) => Promise<ApiResponse>;

/** 路由表：`METHOD /path` → 处理器 */
interface RouteEntry {
  method: string;
  path: string;
  handler: RouteHandler;
  /** 响应是否为 text/html（data 字段作为原始 HTML 返回） */
  rawHtml?: boolean;
}

/**
 * 创建 HTTP 服务器
 * @param routes - 路由表
 * @param config - 服务器配置
 * @returns Node http Server 实例
 */
export function createFlowServer(routes: RouteEntry[], config: ServeConfig): Server {
  const maxBodyBytes = config.maxBodyBytes ?? 5 * 1024 * 1024;

  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://localhost');
      const pathname = url.pathname;
      const route = routes.find(
        (r) => r.method === req.method && r.path === pathname
      );

      // 未知路径
      if (!route) {
        sendJson(res, 404, methodNotAllowed(req.method || '', pathname || ''));
        return;
      }

      // 读取请求体（限制大小）
      const body = await readBody(req, maxBodyBytes);
      if (body === null) {
        sendJson(res, 413, payloadTooLarge());
        return;
      }

      const response = await route.handler(req, body);
      if (route.rawHtml) {
        // 返回原始 HTML（Web IDE）
        if (response.ok) {
          sendHtml(res, 200, response.data as string);
        } else {
          sendJson(res, 500, response);
        }
        return;
      }
      sendJson(res, response.ok ? 200 : 500, response);
    } catch (error) {
      sendJson(res, 500, internalError(error));
    }
  });
}

/**
 * 读取请求体为字符串，超限返回 null
 * @param req - 请求
 * @param maxBytes - 大小上限
 * @returns 请求体字符串，超限返回 null
 */
function readBody(req: IncomingMessage, maxBytes: number): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        // 超限：终止读取
        req.destroy();
        resolve(null);
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

/**
 * 发送 JSON 响应
 * @param res - 响应对象
 * @param status - HTTP 状态码
 * @param body - 响应体
 */
function sendJson(res: ServerResponse, status: number, body: ApiResponse): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
  });
  res.end(text);
}

/**
 * 发送 HTML 响应
 * @param res - 响应对象
 * @param status - HTTP 状态码
 * @param html - HTML 内容
 */
function sendHtml(res: ServerResponse, status: number, html: string): void {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': Buffer.byteLength(html),
  });
  res.end(html);
}

/** 404 未知路径 */
function methodNotAllowed(method: string, path: string): ApiResponse {
  return { ok: false, error: `No route: ${method} ${path}` };
}

/** 413 请求体过大 */
function payloadTooLarge(): ApiResponse {
  return { ok: false, error: 'Request body too large' };
}

/** 500 内部错误 */
function internalError(error: unknown): ApiResponse {
  const message = error instanceof Error ? error.message : String(error);
  return { ok: false, error: `Internal error: ${message}` };
}
