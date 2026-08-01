/**
 * run 块执行器单元测试
 * 覆盖 runtime 分发、vars 解析、结果捕获、失败语义（沙箱层 mock）
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExecutionContext } from '../core/context.js';
import type { SandboxResult } from '../core/blocks/run/types.js';
import { executeRunBlock } from '../core/blocks/run-block.js';

// 沙箱层是系统边界，这里 mock 掉
const mockRunJs = vi.hoisted(() => vi.fn());
const mockRunPython = vi.hoisted(() => vi.fn());

vi.mock('../core/blocks/run/js-sandbox.js', () => ({
  runJs: mockRunJs,
}));

vi.mock('../core/blocks/run/python-sandbox.js', () => ({
  runPython: mockRunPython,
}));

// 确认流程是文件系统 + stdin 边界，这里 mock 为默认放行
vi.mock('../core/blocks/run-confirm.js', () => ({
  ensureRuntimeConfirmed: vi.fn().mockResolvedValue(true),
}));

describe('executeRunBlock', () => {
  let context: ExecutionContext;

  const okResult: SandboxResult = { stdout: '', exitCode: 0 };

  beforeEach(() => {
    vi.clearAllMocks();
    context = new ExecutionContext();
    context.set('weekly_stats', [{ revenue: 100 }, { revenue: 50 }]);
    context.set('name', 'FlowMD');
    mockRunJs.mockResolvedValue(okResult);
    mockRunPython.mockResolvedValue(okResult);
  });

  it('should run js runtime and store structured JSON output in context', async () => {
    mockRunJs.mockResolvedValue({ stdout: '{"total": 150}', exitCode: 0 });

    const result = await executeRunBlock(
      'console.log(JSON.stringify({total: 150}))',
      { runtime: 'js', vars: ['weekly_stats'], output: 'total' },
      context
    );

    expect(mockRunJs).toHaveBeenCalledOnce();
    expect(result.success).toBe(true);
    expect(context.get('total')).toEqual({ total: 150 });
  });

  it('should run python runtime and store text output in context', async () => {
    mockRunPython.mockResolvedValue({ stdout: 'hello world\n', exitCode: 0 });

    const result = await executeRunBlock(
      'print("hello world")',
      { runtime: 'python', output: 'greeting' },
      context
    );

    expect(mockRunPython).toHaveBeenCalledOnce();
    expect(result.success).toBe(true);
    expect(context.get('greeting')).toBe('hello world');
  });

  it('should pass resolved vars to the sandbox', async () => {
    await executeRunBlock(
      'console.log(1)',
      { runtime: 'js', vars: ['name', 'weekly_stats'] },
      context
    );

    const [, vars] = mockRunJs.mock.calls[0];
    expect(vars).toEqual({ name: 'FlowMD', weekly_stats: [{ revenue: 100 }, { revenue: 50 }] });
  });

  it('should fail on non-zero exit code', async () => {
    mockRunPython.mockResolvedValue({ stdout: '', exitCode: 1, stderr: 'boom' });

    const result = await executeRunBlock(
      'exit(1)',
      { runtime: 'python' },
      context
    );

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should fail when sandbox throws', async () => {
    mockRunJs.mockRejectedValue(new Error('timeout'));

    const result = await executeRunBlock(
      'while(true){}',
      { runtime: 'js' },
      context
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('timeout');
  });

  it('should succeed with empty output when stdout is empty', async () => {
    mockRunJs.mockResolvedValue({ stdout: '', exitCode: 0 });

    const result = await executeRunBlock(
      'let x = 1;',
      { runtime: 'js', output: 'nothing' },
      context
    );

    expect(result.success).toBe(true);
    expect(context.get('nothing')).toBe('');
  });

  it('should reject unknown runtime', async () => {
    const result = await executeRunBlock(
      'print(1)',
      { runtime: 'ruby' },
      context
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('ruby');
  });

  it('should reject unknown permissions (reserved for future)', async () => {
    const result = await executeRunBlock(
      'print(1)',
      { runtime: 'python', permissions: ['net'] },
      context
    );

    expect(result.success).toBe(false);
  });

  it('should fail when a declared var is not defined in context', async () => {
    const result = await executeRunBlock(
      'console.log(missing)',
      { runtime: 'js', vars: ['missing'] },
      context
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('missing');
  });
});
