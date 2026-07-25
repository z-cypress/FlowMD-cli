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

  // SQL 错误（检查结构化属性和消息）
  if (errorCode === 'SQLITE_ERROR' || errorCode === 'SQLITE_CANTOPEN' ||
      errorMessage.includes('SQLITE_') || errorMessage.includes('syntax error')) {
    return {
      message: context ? `${context}: SQL 查询错误` : `SQL 查询错误: ${errorMessage}`,
      suggestion: '请检查 SQL 语法',
      code: 'SQL_ERROR',
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
  // API Key: sk-xxx, anthropic-xxx 等
  result = result.replace(/sk-[a-zA-Z0-9]{20,}/g, 'sk-***');
  result = result.replace(/anthropic-[a-zA-Z0-9]{20,}/g, 'anthropic-***');
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
