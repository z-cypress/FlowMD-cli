/**
 * run 块确认流程测试
 * 覆盖按 runtime 记忆、--yes / --strict、拒绝、持久化
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { join } from 'node:path';

const mockExistsSync = vi.hoisted(() => vi.fn());
const mockReadFileSync = vi.hoisted(() => vi.fn());
const mockWriteFileSync = vi.hoisted(() => vi.fn());
const mockMkdirSync = vi.hoisted(() => vi.fn());
const mockConfirm = vi.hoisted(() => vi.fn());

vi.mock('node:fs', () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
  mkdirSync: mockMkdirSync,
}));

vi.mock('../utils/prompt.js', () => ({
  confirm: mockConfirm,
}));

const { ensureRuntimeConfirmed } = await import('../core/blocks/run-confirm.js');

describe('ensureRuntimeConfirmed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(false);
    mockConfirm.mockResolvedValue(true);
  });

  it('should allow without prompting when runtime is already confirmed', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('run:\n  confirmedRuntimes:\n    - python\n');

    const ok = await ensureRuntimeConfirmed('python');

    expect(ok).toBe(true);
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('should prompt and persist when runtime is not confirmed', async () => {
    const ok = await ensureRuntimeConfirmed('js');

    expect(ok).toBe(true);
    expect(mockConfirm).toHaveBeenCalledOnce();
    expect(mockWriteFileSync).toHaveBeenCalled();
    const written = mockWriteFileSync.mock.calls[0][1] as string;
    expect(written).toContain('js');
  });

  it('should return false when user declines', async () => {
    mockConfirm.mockResolvedValue(false);

    const ok = await ensureRuntimeConfirmed('python');

    expect(ok).toBe(false);
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  it('should skip confirmation with --yes', async () => {
    const ok = await ensureRuntimeConfirmed('python', { yes: true });

    expect(ok).toBe(true);
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  it('should always prompt with --strict and not persist', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('run:\n  confirmedRuntimes:\n    - python\n');

    const ok = await ensureRuntimeConfirmed('python', { strict: true });

    expect(ok).toBe(true);
    expect(mockConfirm).toHaveBeenCalledOnce();
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  it('should read config from project .flow directory', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('run:\n  confirmedRuntimes:\n    - js\n');

    await ensureRuntimeConfirmed('js');

    expect(mockReadFileSync).toHaveBeenCalledWith(
      join(process.cwd(), '.flow', 'config.yml'),
      'utf-8'
    );
  });
});
