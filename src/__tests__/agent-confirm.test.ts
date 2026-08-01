/**
 * agent 确认模块单元测试
 * 覆盖 --yes / --strict、记忆持久化、确认键（prompt 层 mock）
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

const mockConfirm = vi.hoisted(() => vi.fn());

vi.mock('../utils/prompt.js', () => ({
  confirm: mockConfirm,
  askQuestion: vi.fn(),
}));

const { ensureAgentConfirmed, agentConfirmKey } = await import('../core/blocks/agent/confirm.js');

describe('agent confirm', () => {
  const originalCwd = process.cwd();
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'flowmd-agent-confirm-'));
    process.chdir(tempDir);
    vi.clearAllMocks();
    mockConfirm.mockResolvedValue(true);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should build a confirm key from goal and sorted tools', () => {
    expect(agentConfirmKey('调研', ['file_read', 'code_execution'])).toBe('调研::code_execution,file_read');
  });

  it('should pass immediately with --yes without prompting', async () => {
    const ok = await ensureAgentConfirmed('g', ['file_read'], { yes: true });

    expect(ok).toBe(true);
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('should prompt on every run with --strict', async () => {
    mockConfirm.mockResolvedValue(true);
    await ensureAgentConfirmed('g', [], { strict: true });
    await ensureAgentConfirmed('g', [], { strict: true });

    expect(mockConfirm).toHaveBeenCalledTimes(2);
  });

  it('should persist confirmation after the first accept', async () => {
    await ensureAgentConfirmed('调研', ['file_read']);
    await ensureAgentConfirmed('调研', ['file_read']);

    expect(mockConfirm).toHaveBeenCalledTimes(1);
    const config = parseYaml(readFileSync(join(tempDir, '.flow', 'config.yml'), 'utf-8')) as Record<string, unknown>;
    const agent = config.agent as Record<string, unknown>;
    expect(agent.confirmedAgents).toContain('调研::file_read');
  });

  it('should return false when declined', async () => {
    mockConfirm.mockResolvedValue(false);

    const ok = await ensureAgentConfirmed('g', []);

    expect(ok).toBe(false);
    expect(existsSync(join(tempDir, '.flow', 'config.yml'))).toBe(false);
  });
});
