/**
 * FlowMD 变量上下文管理
 * 存储和渲染代码块中使用的变量
 */

export class ExecutionContext {
  /** 变量存储 */
  private store = new Map<string, unknown>();

  /**
   * 设置变量值
   * @param name - 变量名（支持点号表示法访问嵌套属性）
   * @param value - 变量值
   */
  set(name: string, value: unknown): void {
    this.store.set(name, value);
  }

  /**
   * 获取变量值
   * @param name - 变量名（支持点号表示法）
   * @returns 变量值，未设置则返回 undefined
   */
  get(name: string): unknown {
    return this.store.get(name);
  }

  /**
   * 渲染模板字符串，替换 {{variable}} 占位符
   * @param template - 包含 {{variable}} 占位符的模板字符串
   * @returns 替换变量后的字符串
   */
  render(template: string): string {
    const variableRegex = /\{\{([\w.-]+)\}\}/g;

    return template.replace(variableRegex, (match, path: string) => {
      const value = this.resolvePath(path);
      if (value === undefined) {
        return match; // 变量不存在时保留原始占位符
      }
      return serializeValue(value);
    });
  }

  /**
   * 导出所有变量为普通对象
   * @returns 包含所有变量的对象
   */
  dump(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of this.store) {
      result[key] = value;
    }
    return result;
  }

  /**
   * 解析点号分隔的路径为值
   * @param path - 点号分隔的路径（如 "user.name"）
   * @returns 解析后的值，未找到则返回 undefined
   */
  private resolvePath(path: string): unknown {
    const parts = path.split('.');
    let current: unknown = this.store.get(parts[0]);

    for (let i = 1; i < parts.length; i++) {
      if (current === null || current === undefined) {
        return undefined;
      }
      if (typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[parts[i]];
    }

    return current;
  }
}

/**
 * 智能序列化变量值为字符串
 * @param value - 要序列化的值
 * @returns 序列化后的字符串
 */
function serializeValue(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    if (value.length <= 10) return JSON.stringify(value, null, 2); // 小数组，可读
    return JSON.stringify(value); // 大数组，紧凑（省 Token）
  }

  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }

  return String(value);
}
