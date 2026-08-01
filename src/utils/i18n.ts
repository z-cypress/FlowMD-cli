/**
 * FlowMD 国际化工具
 * 支持中文（默认）和英文，通过 --lang / 配置 / 环境变量选择语言
 */

import { zh } from './locales/zh.js';
import { en } from './locales/en.js';

/** 支持的语言 */
export type Lang = 'zh' | 'en';

/** 语言字典 */
type Dict = Record<string, string>;

/** 语言包映射 */
const dictionaries: Record<Lang, Dict> = { zh, en };

/** 手动指定的语言覆盖（--lang 或配置 cli.lang） */
let langOverride: Lang | null = null;

/**
 * 从环境变量解析语言
 * 支持 LANG / LC_ALL / LC_MESSAGES，格式如 en_US.UTF-8、zh_CN.UTF-8
 */
function parseEnvLang(value: string | undefined): Lang | null {
  if (!value) return null;
  const v = value.toLowerCase();
  if (v.startsWith('zh')) return 'zh';
  if (v.startsWith('en')) return 'en';
  return null;
}

/**
 * 解析当前语言
 * 优先级：手动设置 > 环境变量 > 默认中文
 * @returns 当前语言
 */
export function getLang(): Lang {
  if (langOverride) return langOverride;
  const env = process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG;
  return parseEnvLang(env) || 'zh';
}

/**
 * 手动设置语言（--lang 或配置 cli.lang）
 * @param lang - 语言，传入 null 时清除覆盖并回退到自动检测
 */
export function setLang(lang: Lang | null): void {
  langOverride = lang;
}

/**
 * 获取翻译文本
 * @param key - 消息键（如 "block.running"）
 * @param params - 插值参数，{param} 占位符会被替换
 * @returns 翻译后的文本
 */
export function t(key: string, params?: Record<string, unknown>): string {
  const dict = dictionaries[getLang()] || dictionaries.zh;
  let template = dict[key] ?? dictionaries.zh[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      template = template.split(`{${k}}`).join(String(v));
    }
  }
  return template;
}
