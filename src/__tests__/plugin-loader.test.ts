/**
 * Plugin loader tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadPlugins } from '../core/plugin-loader.js';

describe('plugin loader', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'flowmd-plugin-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should return empty array for non-existent dir', async () => {
    const plugins = await loadPlugins(join(tempDir, 'nonexistent'));
    expect(plugins).toEqual([]);
  });

  it('should load valid plugin', async () => {
    const pluginDir = join(tempDir, 'plugins');
    mkdirSync(pluginDir, { recursive: true });

    const pluginCode = `
      module.exports = {
        name: 'custom',
        description: 'A custom block',
        execute: async (content, meta, context) => {
          return { success: true, output: 'custom:' + content, duration: 1 };
        }
      };
    `;
    writeFileSync(join(pluginDir, 'custom.js'), pluginCode, 'utf-8');

    const plugins = await loadPlugins(pluginDir);
    expect(plugins.length).toBe(1);
    expect(plugins[0].name).toBe('custom');
  });

  it('should skip non-.js/.ts files', async () => {
    const pluginDir = join(tempDir, 'plugins');
    mkdirSync(pluginDir, { recursive: true });
    writeFileSync(join(pluginDir, 'readme.md'), '# Not a plugin', 'utf-8');

    const plugins = await loadPlugins(pluginDir);
    expect(plugins).toEqual([]);
  });

  it('should warn on invalid plugin', async () => {
    const pluginDir = join(tempDir, 'plugins');
    mkdirSync(pluginDir, { recursive: true });
    writeFileSync(join(pluginDir, 'bad.js'), 'module.exports = { noName: true }', 'utf-8');

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const plugins = await loadPlugins(pluginDir);
    expect(plugins).toEqual([]);
    warnSpy.mockRestore();
  });
});
