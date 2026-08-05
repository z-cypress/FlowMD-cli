/**
 * FlowMD 变量上下文管理
 * 存储和渲染代码块中使用的变量
 * 支持管道过滤器：{{expr | filter:arg}}
 */

/** 管道过滤器正则：{{expr | filter:arg}} 或 {{expr | filter}} 或 {{expr}} */
const FILTER_REGEX = /\{\{([\w.-]+)(?:\s*\|\s*(\w+)(?:\s*:\s*([^}]+))?)?\}\}/g;

/** 过滤器函数类型 */
type FilterFn = (value: unknown, arg?: string) => unknown;

/** 内置过滤器表 */
const FILTERS: Record<string, FilterFn> = {
  len: (v) => {
    if (Array.isArray(v)) return v.length;
    if (typeof v === 'string') return v.length;
    if (v === null || v === undefined) return 0;
    return String(v).length;
  },
  default: (v, arg) => (v === undefined || v === null || v === '') ? arg : v,
  join: (v, arg) => Array.isArray(v) ? v.join(arg ?? ', ') : v,
  round: (v, arg) => {
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    if (Number.isNaN(n)) return v;
    const digits = arg ? parseInt(arg, 10) : 0;
    return Number(n.toFixed(digits));
  },
  upper: (v) => typeof v === 'string' ? v.toUpperCase() : v,
  lower: (v) => typeof v === 'string' ? v.toLowerCase() : v,
  truncate: (v, arg) => {
    if (typeof v !== 'string') return v;
    const max = arg ? parseInt(arg, 10) : 100;
    return v.length <= max ? v : v.slice(0, max) + '...';
  },
};

/**
 * 剥离过滤器参数两侧的引号（支持 "..." 与 '...'）
 * @param arg - 原始参数（可能带引号）
 * @returns 去引号后的参数
 */
function stripQuotes(arg?: string): string | undefined {
  if (!arg) return arg;
  const len = arg.length;
  if (len >= 2 && ((arg[0] === '"' && arg[len - 1] === '"') || (arg[0] === "'" && arg[len - 1] === "'"))) {
    return arg.slice(1, -1);
  }
  return arg;
}

export class ExecutionContext {
  /** 变量存储 */
  private store = new Map<string, unknown>();
  /** 对话历史存储（按对话名称分组） */
  private conversations = new Map<string, Array<{ role: 'user' | 'assistant'; content: string }>>();

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
   * 删除变量
   * @param name - 变量名
   */
  delete(name: string): void {
    this.store.delete(name);
  }

  /**
   * 解析点号分隔的路径为值（与 render 内部一致，供控制流条件等场景使用）
   * @param path - 点号分隔的路径（如 "user.name" / "items.0.price"）
   * @returns 解析后的值，未找到则返回 undefined
   */
  resolve(path: string): unknown {
    return this.resolvePath(path);
  }

  /**
   * 获取对话历史
   * @param name - 对话名称
   * @returns 消息数组
   */
  getConversation(name: string): Array<{ role: 'user' | 'assistant'; content: string }> {
    return this.conversations.get(name) ?? [];
  }

  /**
   * 追加消息到对话历史
   * @param name - 对话名称
   * @param role - 消息角色
   * @param content - 消息内容
   */
  appendToConversation(name: string, role: 'user' | 'assistant', content: string): void {
    const history = this.conversations.get(name) ?? [];
    history.push({ role, content });
    this.conversations.set(name, history);
  }

  /**
   * 渲染模板字符串，替换 {{variable}} 占位符（支持管道过滤器）
   * @param template - 包含 {{variable}} 或 {{variable | filter:arg}} 占位符的模板字符串
   * @returns 替换变量后的字符串
   */
  render(template: string): string {
    return template.replace(FILTER_REGEX, (match, expr: string, filterName?: string, filterArg?: string) => {
      let value = this.resolvePath(expr);

      // 应用管道过滤器
      if (filterName) {
        const fn = FILTERS[filterName];
        if (!fn) {
          // 未知过滤器：保留原始占位符
          return match;
        }
        value = fn(value, stripQuotes(filterArg));
      }

      if (value === undefined) return match;
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
   * 优先匹配完整键（支持 --var user.name=x 这类直接注入的带点号键），
   * 再回退到嵌套对象路径解析（如 store 中 user 为对象时的 user.name）
   * @param path - 点号分隔的路径（如 "user.name"）
   * @returns 解析后的值，未找到则返回 undefined
   */
  private resolvePath(path: string): unknown {
    if (this.store.has(path)) {
      return this.store.get(path);
    }
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
