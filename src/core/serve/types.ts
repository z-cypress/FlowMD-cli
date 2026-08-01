/**
 * flowmd serve 类型定义
 */

/** POST /execute 请求体 */
export interface ExecuteRequest {
  /** 要执行的 Markdown 内容（必填） */
  markdown: string;
  /** 变量注入，等价于 --var */
  vars?: Record<string, string>;
  /** 变量文件路径，等价于 --var-file */
  varFile?: string;
  /** 当前执行文件路径（用于 include 相对路径解析与历史文件名） */
  currentFile?: string;
  /** release 模式：剥离所有指令块，仅保留渲染结果 */
  release?: boolean;
  /** debug 模式：在每个块后插入执行结果 */
  debug?: boolean;
  /** quiet 模式：抑制进度输出 */
  quiet?: boolean;
  /** 试运行：解析不执行 */
  dryRun?: boolean;
}

/** 统一响应结构：成功或失败 */
export type ApiResponse =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

/** serve 服务器配置 */
export interface ServeConfig {
  /** 监听端口 */
  port: number;
  /** 监听地址 */
  host: string;
  /** 请求体大小上限（字节），默认 5MB */
  maxBodyBytes?: number;
}
