/**
 * Config command unit tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { configGet, configSet } from '../commands/config.js';

describe('config command', () => {
  const configDir = join(process.cwd(), '.flow');
  const configPath = join(configDir, 'config.yml');

  function readConfig(): Record<string, unknown> {
    if (!existsSync(configPath)) return {};
    return parseYaml(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
  }

  beforeEach(() => {
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (existsSync(configPath)) {
      unlinkSync(configPath);
    }
  });

  it('should set and persist a string value', () => {
    configSet('llm.model', 'gpt-4o');
    const cfg = readConfig();
    expect((cfg.llm as Record<string, unknown>).model).toBe('gpt-4o');
  });

  it('should set and persist a number value', () => {
    configSet('llm.temperature', '0.5');
    const cfg = readConfig();
    expect((cfg.llm as Record<string, unknown>).temperature).toBe(0.5);
  });

  it('should set and persist a negative number value', () => {
    configSet('execution.timeout', '-5');
    const cfg = readConfig();
    expect((cfg.execution as Record<string, unknown>).timeout).toBe(-5);
  });

  it('should create .flow directory when missing', () => {
    if (existsSync(configDir)) {
      rmSync(configDir, { recursive: true, force: true });
    }
    configSet('llm.model', 'gpt-4o');
    expect(existsSync(configPath)).toBe(true);
  });

  it('should set and persist a boolean value (true)', () => {
    configSet('execution.debug', 'true');
    const cfg = readConfig();
    expect((cfg.execution as Record<string, unknown>).debug).toBe(true);
  });

  it('should set and persist a boolean value (false)', () => {
    configSet('llm.someFlag', 'false');
    const cfg = readConfig();
    expect((cfg.llm as Record<string, unknown>).someFlag).toBe(false);
  });

  it('should handle nested key paths', () => {
    configSet('llm.provider', 'anthropic');
    configSet('llm.model', 'claude-3');
    configSet('execution.timeout', '60');
    const cfg = readConfig();
    const llm = cfg.llm as Record<string, unknown>;
    expect(llm.provider).toBe('anthropic');
    expect(llm.model).toBe('claude-3');
    expect((cfg.execution as Record<string, unknown>).timeout).toBe(60);
  });

  it('should overwrite existing values', () => {
    configSet('llm.model', 'gpt-4o');
    configSet('llm.model', 'gpt-4o-mini');
    const cfg = readConfig();
    expect((cfg.llm as Record<string, unknown>).model).toBe('gpt-4o-mini');
  });

  it('should set deep nested paths', () => {
    configSet('llm.models.fast.model', 'gpt-4o-mini');
    configSet('llm.models.fast.temperature', '0.3');
    const cfg = readConfig();
    const llm = cfg.llm as Record<string, unknown>;
    const models = llm.models as Record<string, unknown>;
    const fast = models.fast as Record<string, unknown>;
    expect(fast.model).toBe('gpt-4o-mini');
    expect(fast.temperature).toBe(0.3);
  });

  it('should not crash for unknown key on get', () => {
    configGet('nonexistent.key');
    // Just verify no exception
  });
});
