/**
 * FlowMD config 命令
 * 查看和修改配置文件
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import chalk from 'chalk';
import { loadConfig } from '../utils/config.js';
import { t } from '../utils/i18n.js';

/**
 * 获取配置文件的路径（惰性计算，便于测试时切换工作目录）
 */
function getConfigPath(): string {
  return join(process.cwd(), '.flow', 'config.yml');
}
/**
 * 获取嵌套键的值（如 "llm.model" 对应 config.llm.model）
 */
function getNested(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/** 禁止作为配置键路径的安全风险属性（原型污染防护） */
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * 设置嵌套键的值（防护 __proto__/constructor 原型污染）
 */
function setNested(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (UNSAFE_KEYS.has(part)) return; // 拒绝原型污染路径
    if (!(part in current) || typeof current[part] !== 'object' || current[part] === null) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  const last = parts[parts.length - 1];
  if (UNSAFE_KEYS.has(last)) return; // 拒绝原型污染路径
  current[last] = value;
}

/**
 * 加载配置文件内容为对象
 */
function loadConfigFile(): Record<string, unknown> {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) {
    return {};
  }
  const raw = readFileSync(configPath, 'utf-8');
  try {
    return parseYaml(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * 保存配置对象到文件
 */
function saveConfigFile(data: Record<string, unknown>): void {
  mkdirSync(join(process.cwd(), '.flow'), { recursive: true });
  const yaml = stringifyYaml(data, { lineWidth: 120 });
  writeFileSync(getConfigPath(), yaml, 'utf-8');
}

/**
 * 执行 config get 命令
 * @param key - 可选的配置键路径
 */
export function configGet(key?: string): void {
  const config = loadConfig();
  const configAny = config as unknown as Record<string, unknown>;

  if (key) {
    const value = getNested(configAny, key);
    if (value === undefined) {
      console.log(chalk.yellow(t('config.notSet', { key })));
    } else {
      console.log(stringifyYaml({ [key]: value }, { lineWidth: 120 }).trim());
    }
  } else {
    console.log(stringifyYaml(config, { lineWidth: 120 }));
  }
}

/**
 * 执行 config set 命令
 * @param key - 配置键路径（如 "llm.model"）
 * @param value - 配置值（自动推断类型）
 */
export function configSet(key: string, value: string): void {
  const data = loadConfigFile();

  // 智能类型转换
  let parsed: unknown = value;
  if (value === 'true') parsed = true;
  else if (value === 'false') parsed = false;
  else if (/^-?\d+\.?\d*$/.test(value) && !isNaN(Number(value))) parsed = Number(value);

  setNested(data, key, parsed);
  saveConfigFile(data);

  console.log(chalk.green(t('config.set', { key, value })));
}
