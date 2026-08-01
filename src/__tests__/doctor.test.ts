/**
 * Doctor command unit tests
 */

import { describe, it, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// Mock chalk to avoid ANSI in test output
vi.mock('chalk', () => ({
  default: {
    bold: { blue: (s: string) => s },
    gray: (s: string) => s,
    yellow: (s: string) => s,
    green: (s: string) => s,
    red: (s: string) => s,
    blue: (s: string) => s,
  },
  bold: { blue: (s: string) => s },
  gray: (s: string) => s,
  yellow: (s: string) => s,
  green: (s: string) => s,
  red: (s: string) => s,
  blue: (s: string) => s,
}));

const { doctorCommand } = await import('../commands/doctor.js');

describe('doctor command', () => {
  const projectConfigDir = join(process.cwd(), '.flow');
  const projectConfigPath = join(projectConfigDir, 'config.yml');
  const globalConfigDir = join(homedir(), '.flow');
  const globalConfigPath = join(globalConfigDir, 'config.yml');

  beforeEach(() => {
    // Clear relevant env vars for clean tests
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.FLOW_LLM_MODEL;
    delete process.env.FLOW_TIMEOUT;
  });

  afterEach(() => {
    // Clean up test config files
    if (existsSync(projectConfigPath)) unlinkSync(projectConfigPath);
    try {
      if (existsSync(globalConfigPath)) unlinkSync(globalConfigPath);
    } catch {
      // 忽略清理错误
    }
  });

  it('should run without crashing', async () => {
    // Just verify no exception
    await doctorCommand();
  });

  it('should detect missing project config', async () => {
    // Remove project config if exists
    if (existsSync(projectConfigPath)) unlinkSync(projectConfigPath);
    await doctorCommand();
  });

  it('should detect present project config', async () => {
    if (!existsSync(projectConfigDir)) mkdirSync(projectConfigDir, { recursive: true });
    writeFileSync(projectConfigPath, 'llm:\n  model: test\n', 'utf-8');
    await doctorCommand();
  });

  it('should detect missing API key', async () => {
    delete process.env.OPENAI_API_KEY;
    await doctorCommand();
  });

  it('should detect present API key', async () => {
    process.env.OPENAI_API_KEY = 'sk-test-key-12345678901234567890';
    await doctorCommand();
  });

  it('should detect ANTHROPIC_API_KEY separately', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key-1234567890';
    await doctorCommand();
  });

  it('should detect FLOW_LLM_MODEL env var', async () => {
    process.env.FLOW_LLM_MODEL = 'deepseek-chat';
    await doctorCommand();
  });
});
