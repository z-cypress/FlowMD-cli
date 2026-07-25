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
