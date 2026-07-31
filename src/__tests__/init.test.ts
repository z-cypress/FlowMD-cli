/**
 * Init command unit tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { initCommand } from '../commands/init.js';

const mockConfirm = vi.hoisted(() => vi.fn());

vi.mock('../utils/prompt.js', () => ({
  confirm: mockConfirm,
}));

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    mkdirSync: vi.fn(actual.mkdirSync),
  };
});

describe('initCommand', () => {
  const flowDir = join(process.cwd(), '.flow');
  const configPath = join(flowDir, 'config.yml');
  const credentialsPath = join(flowDir, 'credentials.yml.example');
  const historyDir = join(flowDir, 'history');
  const gitignorePath = join(process.cwd(), '.gitignore');

  function cleanUp(): void {
    if (existsSync(flowDir)) {
      rmSync(flowDir, { recursive: true, force: true });
    }
    if (existsSync(gitignorePath)) {
      rmSync(gitignorePath, { force: true });
    }
  }

  beforeEach(() => {
    vi.clearAllMocks();
    cleanUp();
    mockConfirm.mockResolvedValue(true);
  });

  afterEach(() => {
    cleanUp();
  });

  it('should create .flow directory with config files', async () => {
    await initCommand();

    expect(existsSync(flowDir)).toBe(true);
    expect(existsSync(configPath)).toBe(true);
    expect(existsSync(credentialsPath)).toBe(true);
    expect(existsSync(historyDir)).toBe(true);
  });

  it('should write valid config content', async () => {
    await initCommand();

    const config = readFileSync(configPath, 'utf-8');
    expect(config).toContain('llm:');
    expect(config).toContain('provider: openai');
    expect(config).toContain('dataSources:');
  });

  it('should write credentials example with commented keys', async () => {
    await initCommand();

    const credentials = readFileSync(credentialsPath, 'utf-8');
    expect(credentials).toContain('apiKey');
  });

  it('should create .gitignore with credentials entry when missing', async () => {
    await initCommand();

    expect(existsSync(gitignorePath)).toBe(true);
    const content = readFileSync(gitignorePath, 'utf-8');
    expect(content).toContain('.flow/credentials.yml');
  });

  it('should append credentials entry to existing .gitignore', async () => {
    writeFileSync(gitignorePath, 'node_modules/\n', 'utf-8');

    await initCommand();

    const content = readFileSync(gitignorePath, 'utf-8');
    expect(content).toContain('node_modules/');
    expect(content).toContain('.flow/credentials.yml');
  });

  it('should not duplicate credentials entry in .gitignore', async () => {
    writeFileSync(gitignorePath, '.flow/credentials.yml\n', 'utf-8');

    await initCommand();

    const content = readFileSync(gitignorePath, 'utf-8');
    expect(content.match(/\.flow\/credentials\.yml/g)?.length).toBe(1);
  });

  it('should cancel without confirm when .flow exists and no force', async () => {
    mkdirSync(flowDir, { recursive: true });
    mockConfirm.mockResolvedValue(false);

    await initCommand();

    expect(mockConfirm).toHaveBeenCalled();
    expect(existsSync(configPath)).toBe(false);
  });

  it('should overwrite config with force flag', async () => {
    mkdirSync(flowDir, { recursive: true });
    writeFileSync(configPath, 'old: config', 'utf-8');

    await initCommand(true);

    const config = readFileSync(configPath, 'utf-8');
    expect(config).toContain('llm:');
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('should handle fs errors gracefully', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(mkdirSync).mockImplementationOnce(() => {
      throw new Error('permission denied');
    });

    await expect(initCommand()).resolves.not.toThrow();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
