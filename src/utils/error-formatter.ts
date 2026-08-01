/**
 * FlowMD 错误格式化
 * 将错误格式化为用户友好的消息
 */

import { t } from './i18n.js';

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
 * 为消息添加上下文前缀
 * @param message - 基础消息
 * @param context - 可选的错误上下文
 * @returns 带前缀的消息
 */
function withContext(message: string, context?: string): string {
  return context ? `${context}: ${message}` : message;
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
      message: withContext(t('error.network'), context),
      suggestion: t('error.network.suggestion'),
      code: errorCode,
    };
  }

  // HTTP 错误
  if (errorCode === '401' || errorMessage.includes('401')) {
    return {
      message: withContext(t('error.apiKeyInvalid'), context),
      suggestion: t('error.apiKeyInvalid.suggestion'),
      code: '401',
    };
  }

  if (errorCode === '429' || errorMessage.includes('429')) {
    return {
      message: withContext(t('error.rateLimited'), context),
      suggestion: t('error.rateLimited.suggestion'),
      code: '429',
    };
  }

  if (errorCode === '500' || errorCode === '502' || errorCode === '503') {
    return {
      message: withContext(t('error.serviceUnavailable'), context),
      suggestion: t('error.rateLimited.suggestion'),
      code: errorCode,
    };
  }

  // 文件错误
  if (errorCode === 'ENOENT') {
    return {
      message: t('error.fileNotFound', { error: errorMessage }),
      suggestion: t('error.fileNotFound.suggestion'),
      code: 'ENOENT',
    };
  }

  // MySQL 错误
  if (errorCode === 'ER_ACCESS_DENIED_ERROR' || errorMessage.includes('ER_ACCESS_DENIED_ERROR') || errorCode === '1045') {
    return {
      message: withContext(t('error.dbAuth'), context),
      suggestion: t('error.dbAuth.suggestion'),
      code: 'DB_AUTH_ERROR',
    };
  }
  if (errorCode === 'ER_BAD_DB_ERROR' || errorMessage.includes('ER_BAD_DB_ERROR') || errorCode === '1049') {
    return {
      message: withContext(t('error.dbNotFound'), context),
      suggestion: t('error.dbNotFound.suggestion'),
      code: 'DB_NOT_FOUND',
    };
  }
  if (errorCode === 'ER_PARSE_ERROR' || errorMessage.includes('ER_PARSE_ERROR') || errorCode === '1064') {
    return {
      message: withContext(t('error.sqlSyntax'), context),
      suggestion: t('error.sqlSyntax.suggestion'),
      code: 'SQL_ERROR',
    };
  }
  if (errorCode === 'ER_NO_SUCH_TABLE' || errorMessage.includes('ER_NO_SUCH_TABLE') || errorCode === '1146') {
    return {
      message: withContext(t('error.tableNotFound'), context),
      suggestion: t('error.tableNotFound.suggestion'),
      code: 'DB_TABLE_NOT_FOUND',
    };
  }
  if (errorCode === 'ER_DUP_ENTRY' || errorMessage.includes('ER_DUP_ENTRY') || errorCode === '1062') {
    return {
      message: withContext(t('error.dbDuplicate'), context),
      suggestion: t('error.dbDuplicate.suggestion'),
      code: 'DB_DUPLICATE',
    };
  }

  // PostgreSQL 错误（先按代码匹配，再按消息内容兜底）
  if (errorCode === '28P01' || errorMessage.includes('28P01') || errorMessage.includes('password authentication failed')) {
    return {
      message: withContext(t('error.dbAuthPg'), context),
      suggestion: t('error.dbAuthPg.suggestion'),
      code: 'DB_AUTH_ERROR',
    };
  }
  if (errorCode === '3D000' || errorMessage.includes('3D000') || (errorMessage.includes('does not exist') && errorMessage.includes('database'))) {
    return {
      message: withContext(t('error.dbNotFound'), context),
      suggestion: t('error.dbNotFoundPg.suggestion'),
      code: 'DB_NOT_FOUND',
    };
  }
  if (errorCode === '42P01' || errorMessage.includes('42P01') || (errorMessage.includes('relation') && errorMessage.includes('does not exist'))) {
    return {
      message: withContext(t('error.tableNotFound'), context),
      suggestion: t('error.tableNotFound.suggestion'),
      code: 'DB_TABLE_NOT_FOUND',
    };
  }
  if (errorCode === '42601' || errorMessage.includes('42601')) {
    return {
      message: withContext(t('error.sqlSyntax'), context),
      suggestion: t('error.sqlSyntax.suggestion'),
      code: 'SQL_ERROR',
    };
  }
  if (errorCode === '08001' || errorMessage.includes('08001')) {
    return {
      message: withContext(t('error.dbConnectionPg'), context),
      suggestion: t('error.dbConnectionPg.suggestion'),
      code: 'DB_CONNECTION_ERROR',
    };
  }

  // SQLite 错误 + 通用 SQL 错误
  if (errorCode === 'SQLITE_ERROR' || errorCode === 'SQLITE_CANTOPEN' ||
      errorMessage.includes('SQLITE_') || errorMessage.includes('syntax error')) {
    return {
      message: context ? withContext(t('error.sqlQuery'), context) : `${t('error.sqlQuery')}: ${errorMessage}`,
      suggestion: t('error.sqlSyntax.suggestion'),
      code: 'SQL_ERROR',
    };
  }

  // 通用数据库错误兜底
  if (errorMessage.includes('connection') || errorMessage.includes('database') ||
      errorMessage.includes('table') || errorMessage.includes('sql') ||
      errorMessage.includes('SQL')) {
    return {
      message: context ? withContext(t('error.dbError'), context) : `${t('error.dbError')}: ${errorMessage}`,
      suggestion: t('error.dbError.suggestion'),
      code: 'DB_ERROR',
    };
  }

  // 模板错误（检查消息内容）
  if (errorMessage.includes('Parse error') || errorMessage.includes('missing closing')) {
    return {
      message: context ? withContext(t('error.templateSyntax'), context) : `${t('error.templateSyntax')}: ${errorMessage}`,
      suggestion: t('error.templateSyntax.suggestion'),
      code: 'TEMPLATE_ERROR',
    };
  }

  // 通用错误
  return {
    message: context ? `${context}: ${errorMessage}` : errorMessage,
    suggestion: t('error.generic.suggestion'),
    code: errorCode || 'UNKNOWN',
  };
}

/**
 * 格式化错误为终端显示字符串
 * @param error - 格式化后的错误对象
 * @returns 终端显示的格式化字符串
 */
export function formatErrorForDisplay(error: FormattedError): string {
  let output = t('error.display.title', { message: error.message });

  if (error.suggestion) {
    output += `\n${t('error.display.suggestion', { suggestion: error.suggestion })}`;
  }

  output += `\n${t('error.display.doctor')}`;

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
  return t('error.unknown');
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
