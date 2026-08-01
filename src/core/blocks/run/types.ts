/**
 * run 块沙箱层共享类型
 */

/** 沙箱执行结果 */
export interface SandboxResult {
  /** 标准输出 */
  stdout: string;
  /** 退出码（0 表示成功） */
  exitCode: number;
  /** 标准错误（可选） */
  stderr?: string;
}

/** 沙箱执行选项 */
export interface SandboxOptions {
  /** 超时毫秒数（undefined 表示不限制） */
  timeoutMs?: number;
  /** 内存上限（MB） */
  memoryMB?: number;
  /** 中止信号（超时/取消时触发） */
  signal?: AbortSignal;
}

/** 支持的 runtime 列表 */
export type RunRuntime = 'js' | 'python';

/** 支持的 runtime 集合（用于校验） */
export const SUPPORTED_RUNTIMES: ReadonlySet<string> = new Set(['js', 'python']);
