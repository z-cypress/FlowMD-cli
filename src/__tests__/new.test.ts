/**
 * New command unit tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newCommand } from '../commands/new.js';

const mockAskQuestion = vi.hoisted(() => vi.fn());
const mockConfirm = vi.hoisted(() => vi.fn());

vi.mock('../utils/prompt.js', () => ({
  askQuestion: mockAskQuestion,
  confirm: mockConfirm,
}));

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    writeFileSync: vi.fn(actual.writeFileSync),
  };
});

describe('newCommand', () => {
  let filepath: string;
  const originalCwd = process.cwd();
  let tempDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    tempDir = mkdtempSync(join(tmpdir(), 'flowmd-new-test-'));
    process.chdir(tempDir);
    filepath = join(process.cwd(), 'test-doc.md');
    mockConfirm.mockResolvedValue(true);
    mockAskQuestion.mockResolvedValue('basic');
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should create a markdown file with basic template', async () => {
    await newCommand('test-doc');

    expect(existsSync(filepath)).toBe(true);
    const content = readFileSync(filepath, 'utf-8');
    expect(content).toContain('# test-doc');
    expect(content).toContain('```ai');
  });

  it('should append .md extension when missing', async () => {
    await newCommand('test-doc');

    expect(existsSync(join(process.cwd(), 'test-doc.md'))).toBe(true);
  });

  it('should keep existing .md extension', async () => {
    await newCommand('test-doc.md');

    expect(existsSync(join(process.cwd(), 'test-doc.md'))).toBe(true);
  });

  it('should list available templates with --list', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await newCommand('test-doc', { list: true });
    const calls = logSpy.mock.calls.map((c) => c.join(' '));
    logSpy.mockRestore();

    expect(calls.some((c) => c.includes('basic'))).toBe(true);
    expect(calls.some((c) => c.includes('meeting'))).toBe(true);
    expect(existsSync(filepath)).toBe(false);
  });

  it('should use selected template type', async () => {
    await newCommand('report-doc', { template: 'report' });

    const content = readFileSync(join(process.cwd(), 'report-doc.md'), 'utf-8');
    expect(content).toContain('# 周报');
    unlinkSync(join(process.cwd(), 'report-doc.md'));
  });

  it('should fall back to basic template for unknown type', async () => {
    await newCommand('fallback-doc', { template: 'unknown-type' });

    const content = readFileSync(join(process.cwd(), 'fallback-doc.md'), 'utf-8');
    expect(content).toContain('# fallback-doc');
    unlinkSync(join(process.cwd(), 'fallback-doc.md'));
  });

  it('should replace date placeholder', async () => {
    const date = new Date().toISOString().split('T')[0];
    await newCommand('date-doc');

    const content = readFileSync(join(process.cwd(), 'date-doc.md'), 'utf-8');
    expect(content).toContain(date);
    unlinkSync(join(process.cwd(), 'date-doc.md'));
  });

  it('should cancel when file exists and not forced', async () => {
    await newCommand('test-doc');
    mockConfirm.mockResolvedValue(false);

    await newCommand('test-doc');

    expect(mockConfirm).toHaveBeenCalled();
  });

  it('should overwrite when file exists and forced', async () => {
    await newCommand('test-doc');
    vi.mocked(mockConfirm).mockReset();

    await newCommand('test-doc', { force: true });

    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('should handle write errors gracefully', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(writeFileSync).mockImplementationOnce(() => {
      throw new Error('permission denied');
    });

    await expect(newCommand('test-doc')).resolves.not.toThrow();
    errorSpy.mockRestore();
  });
});
