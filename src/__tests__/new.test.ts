/**
 * New command unit tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newCommand } from '../commands/new.js';

const mockAskQuestion = vi.hoisted(() => vi.fn());
const mockConfirm = vi.hoisted(() => vi.fn());
const mockSelectFromList = vi.hoisted(() => vi.fn());

vi.mock('../utils/prompt.js', () => ({
  askQuestion: mockAskQuestion,
  confirm: mockConfirm,
  selectFromList: mockSelectFromList,
}));

const mockGenerateDocument = vi.hoisted(() => vi.fn());
vi.mock('../core/generate.js', () => ({
  generateDocument: mockGenerateDocument,
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
    mockSelectFromList.mockResolvedValue('basic');
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

  describe('--ai generation', () => {
    it('should write the AI-generated document', async () => {
      mockGenerateDocument.mockResolvedValue('# AI 生成文档\n```ai {output: "x"}\n内容\n```');

      await newCommand('ai-doc', { ai: '生成一份周报' });

      const content = readFileSync(join(process.cwd(), 'ai-doc.md'), 'utf-8');
      expect(content).toContain('# AI 生成文档');
      expect(mockGenerateDocument).toHaveBeenCalledWith('生成一份周报');
    });

    it('should skip template selection when --ai is given', async () => {
      mockGenerateDocument.mockResolvedValue('# x');

      await newCommand('ai-doc2', { ai: '描述' });

      expect(mockAskQuestion).not.toHaveBeenCalled();
    });

    it('should not write a file when generation fails', async () => {
      mockGenerateDocument.mockRejectedValue(new Error('boom'));
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await newCommand('ai-doc3', { ai: '描述' });

      expect(existsSync(join(process.cwd(), 'ai-doc3.md'))).toBe(false);
      errorSpy.mockRestore();
    });
  });

  describe('built-in templates', () => {
    it('should generate a research template with an agent block', async () => {
      await newCommand('research-doc', { template: 'research' });

      const content = readFileSync(join(process.cwd(), 'research-doc.md'), 'utf-8');
      expect(content).toContain('agent {goal: "调研 {{topic}}"');
      expect(content).toContain('tools: ["browser"]');
      unlinkSync(join(process.cwd(), 'research-doc.md'));
    });

    it('should generate an orchestrate template with doc blocks', async () => {
      await newCommand('orch-doc', { template: 'orchestrate' });

      const content = readFileSync(join(process.cwd(), 'orch-doc.md'), 'utf-8');
      expect(content).toContain('doc {path: "./modules/market.md"');
      unlinkSync(join(process.cwd(), 'orch-doc.md'));
    });
  });

  describe('user templates', () => {
    it('should list user templates alongside built-in ones with a source marker', async () => {
      const templatesDir = join(process.cwd(), '.flow', 'templates');
      mkdirSync(templatesDir, { recursive: true });
      writeFileSync(join(templatesDir, 'custom.md'), '# 自定义模板');

      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await newCommand('any', { list: true });
      const calls = logSpy.mock.calls.map((c) => c.join(' '));
      logSpy.mockRestore();

      expect(calls.some((c) => c.includes('research'))).toBe(true);
      expect(calls.some((c) => c.includes('custom') && c.includes('用户'))).toBe(true);
    });

    it('should create a document from a user template', async () => {
      const templatesDir = join(process.cwd(), '.flow', 'templates');
      mkdirSync(templatesDir, { recursive: true });
      writeFileSync(join(templatesDir, 'custom.md'), '# 自定义模板内容\n\n```ai\n任务\n```');

      await newCommand('custom-doc', { template: 'custom' });

      const content = readFileSync(join(process.cwd(), 'custom-doc.md'), 'utf-8');
      expect(content).toContain('# 自定义模板内容');
      unlinkSync(join(process.cwd(), 'custom-doc.md'));
    });
  });
});
