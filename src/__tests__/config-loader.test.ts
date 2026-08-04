/**
 * Config loader unit tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadConfig, getLLMConfig } from '../utils/config.js';

const mockReadFileSync = vi.hoisted(() => vi.fn());
const mockExistsSync = vi.hoisted(() => vi.fn());
const mockHomedir = vi.hoisted(() => vi.fn());

vi.mock('node:fs', () => ({
  readFileSync: mockReadFileSync,
  existsSync: mockExistsSync,
  default: {},
}));

vi.mock('node:os', () => ({
  homedir: mockHomedir,
}));

vi.mock('dotenv', () => ({
  config: vi.fn(),
}));

describe('loadConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHomedir.mockReturnValue('/home/user');
    mockExistsSync.mockReturnValue(false);
    // Clean env vars that may affect config
    delete process.env.FLOW_LLM_PROVIDER;
    delete process.env.FLOW_PROVIDER;
    delete process.env.FLOW_LLM_MODEL;
    delete process.env.FLOW_MODEL;
    delete process.env.FLOW_LLM_TEMPERATURE;
    delete process.env.FLOW_TEMPERATURE;
    delete process.env.FLOW_LLM_BASE_URL;
    delete process.env.FLOW_BASE_URL;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.FLOW_TIMEOUT;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return defaults when no config files exist', () => {
    const config = loadConfig();
    expect(config.llm.provider).toBe('openai');
    expect(config.llm.model).toBe('deepseek-v4-flash');
    expect(config.llm.temperature).toBe(0.7);
    expect(config.execution.timeout).toBe(30);
    expect(config.dataSources).toEqual({});
    expect(config.variables).toEqual({});
  });

  it('should apply project config over global config', () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p.includes('.flow/config.yml')) return true;
      return false;
    });
    mockReadFileSync.mockImplementation((p: string) => {
      if (p === '/home/user/.flow/config.yml') {
        return 'llm:\n  provider: openai\n  model: claude-3\n  temperature: 0.5\n';
      }
      return 'llm:\n  provider: openai\n  model: gpt-4o\n  temperature: 0.9\n';
    });

    const config = loadConfig();
    expect(config.llm.model).toBe('gpt-4o');
    expect(config.llm.temperature).toBe(0.9);
  });

  it('should load llm.apiKey from project credentials.yml', () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p.includes('credentials.yml')) return true;
      return false;
    });
    mockReadFileSync.mockImplementation((p: string) => {
      if (p.includes('credentials.yml')) {
        return 'llm:\n  apiKey: "sk-credential-from-file"\n';
      }
      return 'llm:\n  provider: openai\n  model: gpt-4o\n';
    });

    const config = loadConfig();
    expect(config.llm.apiKey).toBe('sk-credential-from-file');
  });

  it('should let env var override credentials.yml apiKey', () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p.includes('credentials.yml')) return true;
      return false;
    });
    mockReadFileSync.mockImplementation((p: string) => {
      if (p.includes('credentials.yml')) {
        return 'llm:\n  apiKey: "sk-credential-from-file"\n';
      }
      return 'llm:\n  provider: openai\n  model: gpt-4o\n';
    });
    process.env.OPENAI_API_KEY = 'sk-env-wins';

    const config = loadConfig();
    expect(config.llm.apiKey).toBe('sk-env-wins');
  });

  it('should apply env vars over file config', () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p.includes('.flow/config.yml')) return true;
      return false;
    });
    mockReadFileSync.mockReturnValue('llm:\n  provider: openai\n  model: gpt-4o\n  temperature: 0.7\n');
    process.env.FLOW_LLM_MODEL = 'gpt-4o-mini';

    const config = loadConfig();
    expect(config.llm.model).toBe('gpt-4o-mini');
  });

  it('should fall back to defaults on malformed YAML', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('not: [valid: yaml: {unclosed');

    const config = loadConfig();
    expect(config.llm.model).toBe('deepseek-v4-flash');
    expect(config.execution.timeout).toBe(30);
  });

  it('should load provider apiKey from env for openai', () => {
    process.env.OPENAI_API_KEY = 'sk-openai-test-key';
    const config = loadConfig();
    expect(config.llm.apiKey).toBe('sk-openai-test-key');
  });

  it('should load provider apiKey from env for anthropic', () => {
    process.env.FLOW_PROVIDER = 'anthropic';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-anthropic-test-key';
    const config = loadConfig();
    expect(config.llm.provider).toBe('anthropic');
    expect(config.llm.apiKey).toBe('sk-ant-anthropic-test-key');
  });

  it('should apply FLOW_TIMEOUT env var', () => {
    process.env.FLOW_TIMEOUT = '60';
    const config = loadConfig();
    expect(config.execution.timeout).toBe(60);
  });

  it('should extract llm.models presets from project config', () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p.includes('.flow/config.yml')) return true;
      return false;
    });
    mockReadFileSync.mockReturnValue(
      'llm:\n  provider: openai\n  model: gpt-4o\n  models:\n    fast:\n      model: gpt-4o-mini\n      temperature: 0.3\n'
    );

    const config = loadConfig();
    expect(config.models).toBeDefined();
    expect(config.models?.['fast']).toMatchObject({ model: 'gpt-4o-mini', temperature: 0.3 });
  });

  it('should extract llm.models presets from global config', () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p.includes('.flow/config.yml')) return true;
      return false;
    });
    mockReadFileSync.mockImplementation((p: string) => {
      if (p === '/home/user/.flow/config.yml') {
        return 'llm:\n  provider: openai\n  model: gpt-4o\n  models:\n    fast:\n      model: gpt-4o-mini\n';
      }
      return 'llm:\n  provider: openai\n  model: gpt-4o\n';
    });

    const config = loadConfig();
    expect(config.models?.['fast']).toMatchObject({ model: 'gpt-4o-mini' });
  });

  it('should merge models from global and project configs by key', () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p.includes('.flow/config.yml')) return true;
      return false;
    });
    mockReadFileSync.mockImplementation((p: string) => {
      if (p === '/home/user/.flow/config.yml') {
        return 'llm:\n  provider: openai\n  model: gpt-4o\n  models:\n    fast:\n      model: gpt-4o-mini\n      temperature: 0.3\n';
      }
      return 'llm:\n  provider: openai\n  model: gpt-4o\n  models:\n    strong:\n      model: gpt-4-turbo\n';
    });

    const config = loadConfig();
    expect(config.models?.['fast']).toMatchObject({ model: 'gpt-4o-mini', temperature: 0.3 });
    expect(config.models?.['strong']).toMatchObject({ model: 'gpt-4-turbo' });
  });
});

describe('getLLMConfig', () => {
  it('should return the llm section', () => {
    const llm = getLLMConfig();
    expect(llm.provider).toBeDefined();
    expect(llm.temperature).toBeDefined();
  });
});
