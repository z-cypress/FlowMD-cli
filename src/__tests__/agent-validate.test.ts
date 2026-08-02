/**
 * agent 块配置校验单元测试
 * 覆盖必填项、provider、工具白名单、数值参数校验（ADR-015/016）
 */

import { describe, it, expect } from 'vitest';
import { validateAgentConfig } from '../core/blocks/agent/validate.js';

describe('validateAgentConfig', () => {
  it('should accept a valid config with no optional params', () => {
    expect(validateAgentConfig({ goal: '调研', output: 'report' })).toEqual([]);
  });

  it('should accept a full valid config', () => {
    const errors = validateAgentConfig({
      goal: '调研',
      provider: 'openai',
      tools: ['code_execution', 'file_read'],
      output: 'report',
      max_steps: '8',
      timeout: '90',
      temperature: '0.5',
    });
    expect(errors).toEqual([]);
  });

  it('should reject missing goal', () => {
    const errors = validateAgentConfig({ output: 'report' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('goal');
  });

  it('should reject missing output', () => {
    const errors = validateAgentConfig({ goal: '调研' });
    expect(errors.some((e) => e.includes('output'))).toBe(true);
  });

  it('should reject unsupported provider', () => {
    const errors = validateAgentConfig({ goal: 'g', output: 'o', provider: 'pi-agent' });
    expect(errors.some((e) => e.includes('pi-agent'))).toBe(true);
  });

  it('should accept built-in adapters and reject unknown ones', () => {
    expect(validateAgentConfig({ goal: 'g', output: 'o', adapter: 'chat' })).toEqual([]);
    expect(validateAgentConfig({ goal: 'g', output: 'o', adapter: 'direct' })).toEqual([]);
    const errors = validateAgentConfig({ goal: 'g', output: 'o', adapter: 'pi-agent' });
    expect(errors.some((e) => e.includes('pi-agent'))).toBe(true);
  });

  it('should accept openai and anthropic providers', () => {
    expect(validateAgentConfig({ goal: 'g', output: 'o', provider: 'openai' })).toEqual([]);
    expect(validateAgentConfig({ goal: 'g', output: 'o', provider: 'anthropic' })).toEqual([]);
  });

  it('should reject an unknown tool', () => {
    const errors = validateAgentConfig({ goal: 'g', output: 'o', tools: ['unknown_tool'] });
    expect(errors.some((e) => e.includes('unknown_tool'))).toBe(true);
  });

  it('should accept tools present in the registered set', () => {
    expect(validateAgentConfig({ goal: 'g', output: 'o', tools: ['file_read'] })).toEqual([]);
    expect(validateAgentConfig({ goal: 'g', output: 'o', tools: ['browser', 'web_search'] })).toEqual([]);
  });

  it('should accept a single tool given as string', () => {
    expect(validateAgentConfig({ goal: 'g', output: 'o', tools: 'code_execution' })).toEqual([]);
  });

  it('should respect a custom registered-tools set', () => {
    expect(validateAgentConfig({ goal: 'g', output: 'o', tools: ['file_read'] }, ['code_execution'])).not.toEqual([]);
    expect(validateAgentConfig({ goal: 'g', output: 'o', tools: ['code_execution'] }, ['code_execution'])).toEqual([]);
  });

  it('should reject invalid max_steps', () => {
    expect(validateAgentConfig({ goal: 'g', output: 'o', max_steps: '0' })).not.toEqual([]);
    expect(validateAgentConfig({ goal: 'g', output: 'o', max_steps: '-1' })).not.toEqual([]);
    expect(validateAgentConfig({ goal: 'g', output: 'o', max_steps: 'abc' })).not.toEqual([]);
    expect(validateAgentConfig({ goal: 'g', output: 'o', max_steps: '1.5' })).not.toEqual([]);
  });

  it('should accept valid max_steps', () => {
    expect(validateAgentConfig({ goal: 'g', output: 'o', max_steps: '8' })).toEqual([]);
  });

  it('should reject invalid timeout', () => {
    expect(validateAgentConfig({ goal: 'g', output: 'o', timeout: '0' })).not.toEqual([]);
    expect(validateAgentConfig({ goal: 'g', output: 'o', timeout: '-5' })).not.toEqual([]);
    expect(validateAgentConfig({ goal: 'g', output: 'o', timeout: 'abc' })).not.toEqual([]);
  });

  it('should accept valid timeout', () => {
    expect(validateAgentConfig({ goal: 'g', output: 'o', timeout: '90' })).toEqual([]);
  });

  it('should reject invalid temperature', () => {
    expect(validateAgentConfig({ goal: 'g', output: 'o', temperature: '3' })).not.toEqual([]);
    expect(validateAgentConfig({ goal: 'g', output: 'o', temperature: '-1' })).not.toEqual([]);
    expect(validateAgentConfig({ goal: 'g', output: 'o', temperature: 'abc' })).not.toEqual([]);
  });

  it('should accept valid temperature', () => {
    expect(validateAgentConfig({ goal: 'g', output: 'o', temperature: '0.5' })).toEqual([]);
    expect(validateAgentConfig({ goal: 'g', output: 'o', temperature: '0' })).toEqual([]);
    expect(validateAgentConfig({ goal: 'g', output: 'o', temperature: '2' })).toEqual([]);
  });
});
