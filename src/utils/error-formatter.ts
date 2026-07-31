/**
 * FlowMD 错误格式化
 * 将错误格式化为用户友好的消息
 */

/** 格式化后的错误对象 */
export interface FormattedError {
  /** 错误消息 */
  message: string;
  /** 建议操作（可选） */
  suggestion?: string;
  /** 错误代码（可选） */
  code?: string;
}

/**
 * 将错误格式化为用户友好的消息
 * @param error - 错误对象或字符串
 * @param context - 可选的错误上下文
 * @returns 格式化后的错误对象
 */
export function formatError(error: unknown, context?: string): FormattedError {
  const errorMessage = getErrorMessage(error);
  const errorCode = getErrorCode(error);

  // 网络错误
  if (errorCode === 'ENOTFOUND' || errorCode === 'ETIMEDOUT' || errorCode === 'ECONNREFUSED') {
    return {
      message: context ? `${context}: 网络连接失败` : '网络连接失败',
      suggestion: '请检查网络和代理设置',
      code: errorCode,
    };
  }

  // HTTP 错误
  if (errorCode === '401' || errorMessage.includes('401')) {
    return {
      message: context ? `${context}: API Key 无效` : 'API Key 无效',
      suggestion: '请运行 flow init 检查配置，或设置环境变量 OPENAI_API_KEY',
      code: '401',
    };
  }

  if (errorCode === '429' || errorMessage.includes('429')) {
    return {
      message: context ? `${context}: 请求频率超限` : '请求频率超限',
      suggestion: '请稍后重试',
      code: '429',
    };
  }

  if (errorCode === '500' || errorCode === '502' || errorCode === '503') {
    return {
      message: context ? `${context}: AI 服务暂时不可用` : 'AI 服务暂时不可用',
      suggestion: '请稍后重试',
      code: errorCode,
    };
  }

  // 文件错误
  if (errorCode === 'ENOENT') {
    return {
      message: `文件不存在: ${errorMessage}`,
      suggestion: '请检查路径是否正确',
      code: 'ENOENT',
    };
  }

  // MySQL 错误
  if (errorCode === 'ER_ACCESS_DENIED_ERROR' || errorMessage.includes('ER_ACCESS_DENIED_ERROR') || errorCode === '1045') {
    return {
      message: context ? `${context}: 数据库连接拒绝` : '数据库连接拒绝',
      suggestion: '请检查数据库用户名和密码',
      code: 'DB_AUTH_ERROR',
    };
  }
  if (errorCode === 'ER_BAD_DB_ERROR' || errorMessage.includes('ER_BAD_DB_ERROR') || errorCode === '1049') {
    return {
      message: context ? `${context}: 数据库不存在` : '数据库不存在',
      suggestion: '请检查数据库名称是否正确',
      code: 'DB_NOT_FOUND',
    };
  }
  if (errorCode === 'ER_PARSE_ERROR' || errorMessage.includes('ER_PARSE_ERROR') || errorCode === '1064') {
    return {
      message: context ? `${context}: SQL 语法错误` : 'SQL 语法错误',
      suggestion: '请检查 SQL 语法',
      code: 'SQL_ERROR',
    };
  }
  if (errorCode === 'ER_NO_SUCH_TABLE' || errorMessage.includes('ER_NO_SUCH_TABLE') || errorCode === '1146') {
    return {
      message: context ? `${context}: 表不存在` : '表不存在',
      suggestion: '请检查表名是否正确',
      code: 'DB_TABLE_NOT_FOUND',
    };
  }
  if (errorCode === 'ER_DUP_ENTRY' || errorMessage.includes('ER_DUP_ENTRY') || errorCode === '1062') {
    return {
      message: context ? `${context}: 数据重复` : '数据重复',
      suggestion: '请检查数据是否已存在',
      code: 'DB_DUPLICATE',
    };
  }

  // PostgreSQL 错误（先按代码匹配，再按消息内容兜底）
  if (errorCode === '28P01' || errorMessage.includes('28P01') || errorMessage.includes('password authentication failed')) {
    return {
      message: context ? `${context}: 数据库认证失败` : '数据库认证失败',
      suggestion: '请检查 PostgreSQL 用户名和密码',
      code: 'DB_AUTH_ERROR',
    };
  }
  if (errorCode === '3D000' || errorMessage.includes('3D000') || (errorMessage.includes('does not exist') && errorMessage.includes('database'))) {
    return {
      message: context ? `${context}: 数据库不存在` : '数据库不存在',
      suggestion: '请检查 PostgreSQL 数据库名称是否正确',
      code: 'DB_NOT_FOUND',
    };
  }
  if (errorCode === '42P01' || errorMessage.includes('42P01') || (errorMessage.includes('relation') && errorMessage.includes('does not exist'))) {
    return {
      message: context ? `${context}: 表不存在` : '表不存在',
      suggestion: '请检查表名是否正确',
      code: 'DB_TABLE_NOT_FOUND',
    };
  }
  if (errorCode === '42601' || errorMessage.includes('42601')) {
    return {
      message: context ? `${context}: SQL 语法错误` : 'SQL 语法错误',
      suggestion: '请检查 SQL 语法',
      code: 'SQL_ERROR',
    };
  }
  if (errorCode === '08001' || errorMessage.includes('08001')) {
    return {
      message: context ? `${context}: 数据库连接失败` : '数据库连接失败',
      suggestion: '请检查 PostgreSQL 服务是否运行',
      code: 'DB_CONNECTION_ERROR',
    };
  }

  // SQLite 错误 + 通用 SQL 错误
  if (errorCode === 'SQLITE_ERROR' || errorCode === 'SQLITE_CANTOPEN' ||
      errorMessage.includes('SQLITE_') || errorMessage.includes('syntax error')) {
    return {
      message: context ? `${context}: SQL 查询错误` : `SQL 查询错误: ${errorMessage}`,
      suggestion: '请检查 SQL 语法',
      code: 'SQL_ERROR',
    };
  }

  // 通用数据库错误兜底
  if (errorMessage.includes('connection') || errorMessage.includes('database') ||
      errorMessage.includes('table') || errorMessage.includes('sql') ||
      errorMessage.includes('SQL')) {
    return {
      message: context ? `${context}: 数据库错误` : `数据库错误: ${errorMessage}`,
      suggestion: '请检查数据库配置',
      code: 'DB_ERROR',
    };
  }

  // 模板错误（检查消息内容）
  if (errorMessage.includes('Parse error') || errorMessage.includes('missing closing')) {
    return {
      message: context ? `${context}: 模板语法错误` : `模板语法错误: ${errorMessage}`,
      suggestion: '请检查模板语法',
      code: 'TEMPLATE_ERROR',
    };
  }

  // 通用错误
  return {
    message: context ? `${context}: ${errorMessage}` : errorMessage,
    suggestion: '运行 flow doctor 进行环境诊断',
    code: errorCode || 'UNKNOWN',
  };
}

/**
 * 格式化错误为终端显示字符串
 * @param error - 格式化后的错误对象
 * @returns 终端显示的格式化字符串
 */
export function formatErrorForDisplay(error: FormattedError): string {
  let output = `❌ 错误: ${error.message}`;

  if (error.suggestion) {
    output += `\n   💡 建议: ${error.suggestion}`;
  }

  output += '\n   🔧 运行 flow doctor 进行环境诊断';

  return output;
}

/**
 * 从未知错误类型获取错误消息
 * @param error - 错误对象
 * @returns 错误消息字符串
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return sanitizeMessage(error.message);
  }
  if (typeof error === 'string') {
    return sanitizeMessage(error);
  }
  return '未知错误';
}

/**
 * 脱敏处理消息中的敏感信息
 * @param message - 原始消息
 * @returns 脱敏后的消息
 */
function sanitizeMessage(message: string): string {
  let result = message;
  // API Key: sk-xxx, sk-ant-xxx, anthropic-xxx 等
  result = result.replace(/sk-[a-zA-Z0-9]{20,}/g, 'sk-***');
  result = result.replace(/sk-ant-[a-zA-Z0-9-]{20,}/g, 'sk-ant-***');
  result = result.replace(/anthropic-[a-zA-Z0-9]{20,}/g, 'anthropic-***');
  // 通用兜底：任意 32+ 位长 token
  result = result.replace(/[a-zA-Z0-9_-]{32,}/g, '***');
  // 密码字段
  result = result.replace(/password=[^\s&"']+/gi, 'password=***');
  // 连接字符串中的密码
  result = result.replace(/:\/\/[^:]+:([^@]+)@/g, '://user:***@');
  return result;
}

/**
 * 从错误对象获取错误代码
 * @param error - 错误对象
 * @returns 错误代码字符串
 */
function getErrorCode(error: unknown): string | undefined {
  if (error instanceof Error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code) return err.code;
  }
  if (typeof error === 'object' && error !== null) {
    const err = error as Record<string, unknown>;
    if (typeof err.code === 'string') return err.code;
    if (typeof err.status === 'number') return String(err.status);
  }
  return undefined;
}
