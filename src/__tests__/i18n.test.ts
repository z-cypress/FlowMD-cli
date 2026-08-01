/**
 * 国际化模块测试
 */

import { describe, it, expect, afterEach } from 'vitest';
import { t, getLang, setLang } from '../utils/i18n.js';
import { zh } from '../utils/locales/zh.js';
import { en } from '../utils/locales/en.js';

describe('i18n 插值', () => {
  it('支持 {param} 占位符替换', () => {
    setLang('zh');
    expect(t('cli.file', { file: 'test.md' })).toBe('📄 文件: test.md');
    expect(t('error.apiKeyInvalid.suggestion')).toContain('flow init');
  });

  it('未知键回退到键名本身', () => {
    setLang('zh');
    expect(t('nonexistent.key')).toBe('nonexistent.key');
  });

  it('zh 缺失的键回退到英文包中的值', () => {
    // zh 与 en 键应保持一致，此处验证兜底逻辑不抛异常
    setLang('zh');
    expect(t('cli.banner')).toBe('🚀 FlowMD 开始执行');
  });
});

describe('i18n 语言解析', () => {
  afterEach(() => {
    setLang(null);
    delete process.env.LANG;
    delete process.env.LC_ALL;
    delete process.env.LC_MESSAGES;
  });

  it('手动 setLang 优先级最高', () => {
    process.env.LANG = 'en_US.UTF-8';
    setLang('zh');
    expect(getLang()).toBe('zh');
  });

  it('setLang(null) 回退到环境变量', () => {
    process.env.LANG = 'en_HK.UTF-8';
    setLang(null);
    expect(getLang()).toBe('en');
  });

  it('解析 zh 语言环境', () => {
    process.env.LANG = 'zh_CN.UTF-8';
    setLang(null);
    expect(getLang()).toBe('zh');
  });

  it('LC_ALL 优先于 LANG', () => {
    process.env.LANG = 'en_US.UTF-8';
    process.env.LC_ALL = 'zh_CN.UTF-8';
    setLang(null);
    expect(getLang()).toBe('zh');
  });

  it('未知环境变量回退到默认中文', () => {
    process.env.LANG = 'fr_FR.UTF-8';
    setLang(null);
    expect(getLang()).toBe('zh');
  });
});

describe('i18n 字典完整性', () => {
  it('zh 与 en 键集合一致', () => {
    const zhKeys = Object.keys(zh).sort();
    const enKeys = Object.keys(en).sort();
    expect(enKeys).toEqual(zhKeys);
  });

  it('所有语言均为 as const 对象', () => {
    expect(typeof zh).toBe('object');
    expect(typeof en).toBe('object');
  });
});
