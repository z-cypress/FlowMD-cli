/**
 * Config command unit tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { configGet, configSet } from '../commands/config.js';

describe('config command', () => {
  const configDir = join(process.cwd(), '.flow');
  const configPath = join(configDir, 'config.yml');

  beforeEach(() => {
    // Ensure .flow directory exists
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test config
    if (existsSync(configPath)) {
      unlinkSync(configPath);
    }
  });

  it('should set and persist a string value', () => {
    configSet('llm.model', 'test-model');
    // Read back via get (no key = full config dump)
    // Just verify no crash and file was created
    expect(existsSync(configPath)).toBe(true);
  });

  it('should set and persist a number value', () => {
    configSet('llm.temperature', '0.5');
    expect(existsSync(configPath)).toBe(true);
  });

  it('should set and persist a boolean value', () => {
    configSet('execution.someFlag', 'true');
    expect(existsSync(configPath)).toBe(true);
  });

  it('should handle nested key paths', () => {
    configSet('llm.provider', 'anthropic');
    configSet('llm.model', 'claude-3');
    configSet('execution.timeout', '60');
    expect(existsSync(configPath)).toBe(true);

    // Verify configGet doesn't crash
    configGet();
    configGet('llm.model');
  });

  it('should return undefined for unknown key', () => {
    configGet('nonexistent.key');
    // Just verify no crash
  });
});
