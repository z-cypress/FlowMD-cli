/**
 * Logger utility unit tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  log,
  logHeader,
  logSeparator,
  logFileInfo,
  logBlockProgress,
  logError,
  logSuccess,
  logInfo,
  createSpinner,
} from '../utils/logger.js';

const mockOra = vi.hoisted(() => vi.fn());

vi.mock('ora', () => ({
  default: mockOra,
}));

describe('logger', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.clearAllMocks();
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('should log info messages with prefix', () => {
    log('info', 'hello');
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('hello'));
  });

  it('should log success messages with prefix', () => {
    log('success', 'done');
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('done'));
  });

  it('should log warning messages with prefix', () => {
    log('warning', 'careful');
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('careful'));
  });

  it('should log error messages with prefix', () => {
    log('error', 'boom');
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('boom'));
  });

  it('should log header with title and divider', () => {
    logHeader('标题');
    const calls = logSpy.mock.calls.map((c) => c.join(' '));
    expect(calls.some((c) => c.includes('标题'))).toBe(true);
  });

  it('should log separator line', () => {
    logSeparator();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('─'));
  });

  it('should log file info', () => {
    logFileInfo('test.md', 3);
    const calls = logSpy.mock.calls.map((c) => c.join(' '));
    expect(calls.some((c) => c.includes('test.md'))).toBe(true);
    expect(calls.some((c) => c.includes('3'))).toBe(true);
  });

  it('should log block progress with type', () => {
    logBlockProgress(1, 3, 'data');
    const calls = logSpy.mock.calls.map((c) => c.join(' '));
    expect(calls.some((c) => c.includes('1/3'))).toBe(true);
  });

  it('should log error with suggestion to stdout', () => {
    logError('失败');
    expect(errorSpy).toHaveBeenCalled();
  });

  it('should log success message', () => {
    logSuccess('ok');
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('ok'));
  });

  it('should log info message', () => {
    logInfo('notice');
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('notice'));
  });

  it('should create a spinner with text', () => {
    createSpinner('加载中');
    expect(mockOra).toHaveBeenCalledWith(
      expect.objectContaining({ text: '加载中', color: 'cyan' })
    );
  });
});
