/**
 * Watch command unit tests
 * Tests file watching, re-execution on change, and option passing
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted variables for mock factories (must be before vi.mock calls)
const mockOn = vi.hoisted(() => vi.fn().mockReturnThis());
const mockClose = vi.hoisted(() => vi.fn());
const mockReadFileSync = vi.hoisted(() => vi.fn());
const mockParseMarkdown = vi.hoisted(() => vi.fn());
const mockExecuteDocument = vi.hoisted(() => vi.fn());
const mockLoadConfig = vi.hoisted(() => vi.fn());

// Mock chokidar
vi.mock('chokidar', () => ({
  default: {
    watch: vi.fn(() => ({
      on: mockOn,
      close: mockClose,
    })),
  },
}));

// Mock fs module
vi.mock('node:fs', () => ({
  readFileSync: mockReadFileSync,
  writeFileSync: vi.fn(),
  default: {},
}));

// Mock core modules
vi.mock('../core/parser.js', () => ({
  parseMarkdown: mockParseMarkdown,
}));

vi.mock('../core/executor.js', () => ({
  executeDocument: mockExecuteDocument,
}));

vi.mock('../utils/config.js', () => ({
  loadConfig: mockLoadConfig,
}));

// Mock ora spinner
vi.mock('ora', () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    stop: vi.fn(),
  })),
}));

import { watchCommand } from '../commands/watch.js';

describe('watchCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set up default mock return values
    mockReadFileSync.mockReturnValue('# Test\n\n```ai {output: "result"}\ntest\n```\n\n{{result}}');
    mockParseMarkdown.mockReturnValue({
      blocks: [
        {
          type: 'ai',
          content: 'test',
          meta: { output: 'result' },
          lang: 'ai',
          position: 0,
          sourceStart: 0,
          sourceEnd: 0,
        },
      ],
      rawContent: '# Test\n\n{{result}}',
      variables: ['result'],
    });
    mockExecuteDocument.mockResolvedValue('# Test\n\nhello');
    mockLoadConfig.mockReturnValue({
      llm: { provider: 'openai', apiKey: '', model: 'gpt-4o', temperature: 0.7 },
      dataSources: {},
      variables: {},
      execution: { timeout: 30 },
    });
  });

  it('should call chokidar.watch with the file path', async () => {
    const chokidarMod = await import('chokidar');
    await watchCommand('test.md', { output: 'stdout' });

    expect(chokidarMod.default.watch).toHaveBeenCalledWith('test.md', expect.any(Object));
  });

  it('should execute document on initial run', async () => {
    await watchCommand('test.md', { output: 'stdout' });

    expect(mockExecuteDocument).toHaveBeenCalledTimes(1);
  });

  it('should re-execute on file change event', async () => {
    await watchCommand('test.md', { output: 'stdout' });

    // Find the 'change' handler registered on the mock watcher
    const changeHandler = mockOn.mock.calls.find((call) => call[0] === 'change')?.[1];
    expect(changeHandler).toBeDefined();

    await changeHandler();
    expect(mockExecuteDocument).toHaveBeenCalledTimes(2);
  });

  it('should support --debug flag in options', async () => {
    await watchCommand('test.md', { output: 'stdout', debug: true });

    const callArg = mockExecuteDocument.mock.calls[0][1];
    expect(callArg.debug).toBe(true);
  });

  it('should support --release flag in options', async () => {
    await watchCommand('test.md', { output: 'stdout', release: true });

    const callArg = mockExecuteDocument.mock.calls[0][1];
    expect(callArg.release).toBe(true);
  });

  it('should support --step flag in options', async () => {
    await watchCommand('test.md', { output: 'stdout', stepMode: true });

    const callArg = mockExecuteDocument.mock.calls[0][1];
    expect(callArg.stepMode).toBe(true);
  });

  it('should pass varArgs to executeDocument', async () => {
    await watchCommand('test.md', { output: 'stdout', varArgs: { name: 'FlowMD' } });

    const callArg = mockExecuteDocument.mock.calls[0][1];
    expect(callArg.varArgs).toEqual({ name: 'FlowMD' });
  });

  it('should pass varFile to executeDocument', async () => {
    await watchCommand('test.md', { output: 'stdout', varFile: '/path/to/vars.env' });

    const callArg = mockExecuteDocument.mock.calls[0][1];
    expect(callArg.varFile).toBe('/path/to/vars.env');
  });

  it('should handle file read errors gracefully', async () => {
    mockReadFileSync.mockImplementationOnce(() => {
      throw new Error('ENOENT: no such file');
    });

    await expect(watchCommand('nonexistent.md', { output: 'stdout' })).resolves.not.toThrow();
  });

  it('should handle executeDocument errors gracefully', async () => {
    mockExecuteDocument.mockRejectedValueOnce(new Error('execution failed'));

    await expect(watchCommand('test.md', { output: 'stdout' })).resolves.not.toThrow();
  });
});
