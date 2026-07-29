/**
 * Error formatter unit tests
 */

import { describe, it, expect } from 'vitest';
import { getErrorMessage, formatError } from '../utils/error-formatter.js';

describe('getErrorMessage', () => {
  it('should extract message from Error object', () => {
    const error = new Error('something went wrong');
    expect(getErrorMessage(error)).toBe('something went wrong');
  });

  it('should handle string errors', () => {
    expect(getErrorMessage('raw error')).toBe('raw error');
  });

  it('should return fallback for unknown types', () => {
    expect(getErrorMessage(null)).toBe('未知错误');
    expect(getErrorMessage(undefined)).toBe('未知错误');
    expect(getErrorMessage(42)).toBe('未知错误');
  });
});

describe('sanitizeMessage', () => {
  it('should redact OpenAI API keys (sk-xxx)', () => {
    const msg = 'Authentication failed with key sk-abc123def456ghi789jkl0';
    const result = getErrorMessage(new Error(msg));
    expect(result).not.toContain('sk-abc123');
    expect(result).toContain('sk-***');
  });

  it('should redact Anthropic API keys', () => {
    const msg = 'Invalid key: anthropic-xyz123abc456def789ghi012jkl';
    const result = getErrorMessage(new Error(msg));
    expect(result).not.toContain('anthropic-xyz123');
    expect(result).toContain('anthropic-***');
  });

  it('should redact password= fields', () => {
    const msg = 'Connection failed: password=supersecret123 host=localhost';
    const result = getErrorMessage(new Error(msg));
    expect(result).not.toContain('password=supersecret123');
    expect(result).toContain('password=***');
  });

  it('should redact connection string passwords', () => {
    const msg = 'Cannot connect to postgresql://admin:mysecret@localhost:5432/db';
    const result = getErrorMessage(new Error(msg));
    expect(result).not.toContain('admin:mysecret@');
    expect(result).toContain('user:***@');
  });

  it('should not redact short sk- strings (not keys)', () => {
    const msg = 'Error near sk-123';
    const result = getErrorMessage(new Error(msg));
    // sk-123 is only 6 chars total, regex requires 20+ after sk-
    expect(result).toContain('sk-123');
  });

  it('should redact multiple sensitive values in one message', () => {
    const msg = 'Key sk-abcdefghijklmnopqrstuvwxyz failed, password=xyz123';
    const result = getErrorMessage(new Error(msg));
    expect(result).not.toContain('abcdefghijklmnopqrstuvwxyz');
    expect(result).not.toContain('password=xyz123');
  });

  it('should preserve non-sensitive content', () => {
    const msg = 'API request failed with status 401 Unauthorized';
    const result = getErrorMessage(new Error(msg));
    expect(result).toContain('API request failed');
    expect(result).toContain('401');
  });
});

describe('formatError', () => {
  it('should format network errors', () => {
    const error = Object.assign(new Error('connect failed'), { code: 'ENOTFOUND' });
    const result = formatError(error);
    expect(result.message).toContain('网络连接失败');
    expect(result.suggestion).toContain('网络');
  });

  it('should format 401 errors', () => {
    const error = Object.assign(new Error('Request failed 401'), { code: '401' });
    const result = formatError(error);
    expect(result.message).toContain('API Key 无效');
  });

  it('should format 429 errors', () => {
    const error = Object.assign(new Error('Rate limited 429'), { status: 429 });
    const result = formatError(error);
    expect(result.message).toContain('请求频率超限');
  });

  it('should format file not found errors', () => {
    const error = Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' });
    const result = formatError(error);
    expect(result.message).toContain('文件不存在');
  });

  it('should format SQLite errors', () => {
    const error = Object.assign(new Error('SQLITE_ERROR: near'), { code: 'SQLITE_ERROR' });
    const result = formatError(error);
    expect(result.message).toContain('SQL 查询错误');
  });

  it('should format generic errors with doctor suggestion', () => {
    const error = new Error('Something unknown happened');
    const result = formatError(error);
    expect(result.suggestion).toContain('flow doctor');
  });

  it('should include context when provided', () => {
    const error = new Error('bad input');
    const result = formatError(error, 'AI 块执行');
    expect(result.message).toContain('AI 块执行');
  });
});

describe('formatError - MySQL errors', () => {
  it('should format ER_ACCESS_DENIED_ERROR', () => {
    const error = Object.assign(new Error('Access denied'), { code: 'ER_ACCESS_DENIED_ERROR' });
    const result = formatError(error);
    expect(result.message).toContain('数据库连接拒绝');
    expect(result.suggestion).toContain('密码');
    expect(result.code).toBe('DB_AUTH_ERROR');
  });

  it('should format ER_BAD_DB_ERROR', () => {
    const error = Object.assign(new Error('Unknown database'), { code: 'ER_BAD_DB_ERROR' });
    const result = formatError(error);
    expect(result.message).toContain('数据库不存在');
    expect(result.code).toBe('DB_NOT_FOUND');
  });

  it('should format ER_PARSE_ERROR', () => {
    const error = Object.assign(new Error('SQL syntax error'), { code: 'ER_PARSE_ERROR' });
    const result = formatError(error);
    expect(result.message).toContain('SQL 语法错误');
    expect(result.code).toBe('SQL_ERROR');
  });

  it('should format ER_NO_SUCH_TABLE', () => {
    const error = Object.assign(new Error("Table 'test.xyz' doesn't exist"), { code: 'ER_NO_SUCH_TABLE' });
    const result = formatError(error);
    expect(result.message).toContain('表不存在');
    expect(result.code).toBe('DB_TABLE_NOT_FOUND');
  });

  it('should format ER_DUP_ENTRY', () => {
    const error = Object.assign(new Error('Duplicate entry'), { code: 'ER_DUP_ENTRY' });
    const result = formatError(error);
    expect(result.message).toContain('数据重复');
    expect(result.code).toBe('DB_DUPLICATE');
  });
});

describe('formatError - PostgreSQL errors', () => {
  it('should format 28P01 (auth failure)', () => {
    const error = Object.assign(new Error('password authentication failed'), { code: '28P01' });
    const result = formatError(error);
    expect(result.message).toContain('数据库认证失败');
    expect(result.suggestion).toContain('密码');
    expect(result.code).toBe('DB_AUTH_ERROR');
  });

  it('should format 3D000 (database not found)', () => {
    const error = Object.assign(new Error('database "test" does not exist'), { code: '3D000' });
    const result = formatError(error);
    expect(result.message).toContain('数据库不存在');
    expect(result.code).toBe('DB_NOT_FOUND');
  });

  it('should format 42P01 (table not found)', () => {
    const error = Object.assign(new Error('relation "users" does not exist'), { code: '42P01' });
    const result = formatError(error);
    expect(result.message).toContain('表不存在');
    expect(result.code).toBe('DB_TABLE_NOT_FOUND');
  });

  it('should format 42601 (syntax error)', () => {
    const error = Object.assign(new Error('syntax error at or near'), { code: '42601' });
    const result = formatError(error);
    expect(result.message).toContain('SQL 语法错误');
    expect(result.code).toBe('SQL_ERROR');
  });

  it('should format 08001 (connection error)', () => {
    const error = Object.assign(new Error('could not connect to server'), { code: '08001' });
    const result = formatError(error);
    expect(result.message).toContain('数据库连接失败');
    expect(result.suggestion).toContain('服务是否运行');
    expect(result.code).toBe('DB_CONNECTION_ERROR');
  });
});

describe('formatError - PostgreSQL message fallbacks', () => {
  it('should match PG auth error by message when code missing', () => {
    const error = new Error('password authentication failed for user "test"');
    const result = formatError(error);
    expect(result.code).toBe('DB_AUTH_ERROR');
  });

  it('should match PG table error by message when code missing', () => {
    const error = new Error('relation "users" does not exist');
    const result = formatError(error);
    expect(result.code).toBe('DB_TABLE_NOT_FOUND');
  });
});
