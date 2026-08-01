/**
 * agent 工具注册表与工具集成测试
 * 覆盖注册表查询、file_read 安全边界（越界/符号链接/超大文件）、code_execution 沙箱复用
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createToolRegistry } from '../core/blocks/agent/tools/registry.js';

describe('agent tools', () => {
  let projectRoot: string;
  let registry: ReturnType<typeof createToolRegistry>;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'flowmd-agent-tools-'));
    mkdirSync(join(projectRoot, 'docs'), { recursive: true });
    writeFileSync(join(projectRoot, 'docs', 'index.md'), '# Hello\n{{name}}');
    writeFileSync(join(projectRoot, 'secret.txt'), 'top-secret');
    registry = createToolRegistry({ projectRoot });
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  describe('registry', () => {
    it('should register code_execution and file_read', () => {
      expect(registry.has('code_execution')).toBe(true);
      expect(registry.has('file_read')).toBe(true);
      expect(registry.get('file_read')?.name).toBe('file_read');
    });
  });

  describe('file_read', () => {
    it('should read a file inside the project root', async () => {
      const tool = registry.get('file_read')!;
      const result = await tool.execute({ path: 'docs/index.md' });
      expect(result.ok).toBe(true);
      expect(result.result).toBe('# Hello\n{{name}}');
    });

    it('should fail on missing file', async () => {
      const tool = registry.get('file_read')!;
      const result = await tool.execute({ path: 'docs/missing.md' });
      expect(result.ok).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should fail on missing path arg', async () => {
      const tool = registry.get('file_read')!;
      const result = await tool.execute({});
      expect(result.ok).toBe(false);
      expect(result.error).toContain('path');
    });

    it('should fail on directory', async () => {
      const tool = registry.get('file_read')!;
      const result = await tool.execute({ path: 'docs' });
      expect(result.ok).toBe(false);
      expect(result.error).toContain('directory');
    });

    it('should reject parent traversal escaping the root', async () => {
      const tool = registry.get('file_read')!;
      const result = await tool.execute({ path: '../secret.txt' });
      expect(result.ok).toBe(false);
      expect(result.error).toContain('escapes');
    });

    it('should reject absolute paths outside the root', async () => {
      const outside = mkdtempSync(join(tmpdir(), 'flowmd-agent-outside-'));
      writeFileSync(join(outside, 'x.txt'), 'x');
      try {
        const tool = registry.get('file_read')!;
        const result = await tool.execute({ path: join(outside, 'x.txt') });
        expect(result.ok).toBe(false);
        expect(result.error).toContain('escapes');
      } finally {
        rmSync(outside, { recursive: true, force: true });
      }
    });

    it('should reject symlink escaping the root', async () => {
      const target = join(tmpdir(), 'flowmd-agent-symlink-target.txt');
      writeFileSync(target, 'escaped');
      try {
        symlinkSync(target, join(projectRoot, 'link.txt'));
      } catch {
        return; // 平台不支持符号链接时跳过
      }
      try {
        const tool = registry.get('file_read')!;
        const result = await tool.execute({ path: 'link.txt' });
        expect(result.ok).toBe(false);
        expect(result.error).toContain('escapes');
      } finally {
        rmSync(target, { force: true });
      }
    });

    it('should reject oversized file', async () => {
      writeFileSync(join(projectRoot, 'big.txt'), 'x'.repeat(70 * 1024));
      const tool = registry.get('file_read')!;
      const result = await tool.execute({ path: 'big.txt' });
      expect(result.ok).toBe(false);
      expect(result.error).toContain('too large');
    });
  });

  describe('code_execution', () => {
    it('should execute a js script and return stdout', async () => {
      const tool = registry.get('code_execution')!;
      const result = await tool.execute({ runtime: 'js', script: 'console.log(1 + 2)' });
      expect(result.ok).toBe(true);
      expect(result.result).toContain('3');
    });

    it('should execute a python script and return stdout', async () => {
      const tool = registry.get('code_execution')!;
      const result = await tool.execute({ runtime: 'python', script: 'print(40 + 2)' });
      expect(result.ok).toBe(true);
      expect(result.result).toContain('42');
    });

    it('should reject unsupported runtime', async () => {
      const tool = registry.get('code_execution')!;
      const result = await tool.execute({ runtime: 'ruby', script: 'puts 1' });
      expect(result.ok).toBe(false);
      expect(result.error).toContain('ruby');
    });

    it('should reject empty script', async () => {
      const tool = registry.get('code_execution')!;
      const result = await tool.execute({ runtime: 'js', script: '' });
      expect(result.ok).toBe(false);
      expect(result.error).toContain('script');
    });

    it('should report non-zero exit code as failure', async () => {
      const tool = registry.get('code_execution')!;
      const result = await tool.execute({ runtime: 'python', script: 'import sys; sys.exit(2)' });
      expect(result.ok).toBe(false);
    });
  });
});
