/**
 * FlowMD 可观测性 trace 收集器
 * 输出结构化 span 数据（时间、块类型、token、状态）
 */

/** 单个 trace span */
export interface TraceSpan {
  /** span 名称（如 "ai:summary" 或 "data:query"） */
  name: string;
  /** 开始时间（ISO 8601） */
  startTime: string;
  /** 结束时间（ISO 8601） */
  endTime: string;
  /** 耗时（毫秒） */
  duration_ms: number;
  /** 状态 */
  status: 'ok' | 'error';
  /** 附加属性 */
  attributes: Record<string, unknown>;
}

/**
 * 收集 trace spans，支持嵌套层级
 */
export class TraceCollector {
  private spans: TraceSpan[] = [];
  private stack: TraceSpan[] = [];

  /**
   * 开始一个新 span（压栈）
   * @param name - span 名称
   * @param attributes - 初始属性
   */
  startSpan(name: string, attributes?: Record<string, unknown>): void {
    const span: TraceSpan = {
      name,
      startTime: new Date().toISOString(),
      endTime: '',
      duration_ms: 0,
      status: 'ok',
      attributes: attributes ?? {},
    };
    this.stack.push(span);
  }

  /**
   * 结束当前 span（弹栈）
   * @param status - 状态
   * @param extra - 额外属性（合并进 attributes）
   */
  endSpan(status: 'ok' | 'error' = 'ok', extra?: Record<string, unknown>): void {
    const span = this.stack.pop();
    if (!span) return;
    span.endTime = new Date().toISOString();
    span.duration_ms = Date.now() - new Date(span.startTime).getTime();
    span.status = status;
    if (extra) Object.assign(span.attributes, extra);
    this.spans.push(span);
  }

  /**
   * 导出全部 spans
   * @returns span 数组
   */
  toSpans(): TraceSpan[] {
    return this.spans;
  }

  /**
   * 序列化为 JSON 字符串
   * @returns JSON 字符串
   */
  toJSON(): string {
    return JSON.stringify(this.spans, null, 2);
  }
}
