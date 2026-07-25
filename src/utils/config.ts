/**
 * FlowMD 配置加载器
 * 
 * 配置优先级（高→低）：
 * 1. 命令行参数或参数文件
 * 2. 文档内块级覆盖
 * 3. 环境变量
 * 4. 项目配置文件（./.flow/config.yml）
 * 5. 全局配置文件（~/.flow/config.yml）
 * 6. 硬编码默认值
 */

import { config as dotenvConfig } from 'dotenv';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { parse as parseYaml } from 'yaml';
import type { FlowConfig, LLMConfig } from '../types/index.js';

// 加载 .env 文件
dotenvConfig();

/** 默认配置（硬编码默认值） */
const DEFAULT_CONFIG: FlowConfig = Object.freeze({
  llm: Object.freeze({
    provider: 'openai' as const,
    apiKey: '',
    model: 'deepseek-v4-flash',
    temperature: 0.7,
  }),
  dataSources: Object.freeze({}),
  variables: Object.freeze({}),
  execution: Object.freeze({
    timeout: 30,
  }),
});

/**
 * 合并配置对象（深拷贝）
 */
function mergeConfig(target: FlowConfig, source: Partial<FlowConfig>): void {
  if (source.llm) {
    target.llm = { ...target.llm, ...source.llm };
  }
  if (source.dataSources) {
    target.dataSources = { ...target.dataSources, ...source.dataSources };
  }
  if (source.variables) {
    target.variables = { ...target.variables, ...source.variables };
  }
  if (source.execution) {
    target.execution = { ...target.execution, ...source.execution };
  }
}

/**
 * 加载 FlowMD 配置
 * 
 * 配置优先级（高→低）：
 * 1. 环境变量
 * 2. 项目配置文件（./.flow/config.yml）
 * 3. 全局配置文件（~/.flow/config.yml）
 * 4. 硬编码默认值
 * 
 * @returns 合并后的配置
 */
export function loadConfig(): FlowConfig {
  // 1. 硬编码默认值
  const config: FlowConfig = {
    llm: { ...DEFAULT_CONFIG.llm },
    dataSources: {},
    variables: {},
    execution: { ...DEFAULT_CONFIG.execution },
  };

  // 2. 全局配置 ~/.flow/config.yml
  const globalConfigPath = join(homedir(), '.flow', 'config.yml');
  if (existsSync(globalConfigPath)) {
    try {
      const content = readFileSync(globalConfigPath, 'utf-8');
      const fileConfig = parseYaml(content) as Partial<FlowConfig>;
      mergeConfig(config, fileConfig);
    } catch {
      // 配置文件解析失败，使用默认配置
    }
  }

  // 3. 项目配置 ./.flow/config.yml
  const projectConfigPath = join(process.cwd(), '.flow', 'config.yml');
  if (existsSync(projectConfigPath)) {
    try {
      const content = readFileSync(projectConfigPath, 'utf-8');
      const fileConfig = parseYaml(content) as Partial<FlowConfig>;
      mergeConfig(config, fileConfig);
    } catch {
      // 配置文件解析失败，使用默认配置
    }
  }

  // 4. 环境变量（优先级更高）
  const provider = process.env.FLOW_LLM_PROVIDER || process.env.FLOW_PROVIDER;
  if (provider === 'openai' || provider === 'anthropic') {
    config.llm.provider = provider;
  }

  const model = process.env.FLOW_LLM_MODEL || process.env.FLOW_MODEL;
  if (model) {
    config.llm.model = model;
  }

  const temperature = process.env.FLOW_LLM_TEMPERATURE || process.env.FLOW_TEMPERATURE;
  if (temperature) {
    const parsed = parseFloat(temperature);
    if (!isNaN(parsed)) {
      config.llm.temperature = parsed;
    }
  }

  const baseURL = process.env.FLOW_LLM_BASE_URL || process.env.FLOW_BASE_URL;
  if (baseURL) {
    config.llm.baseURL = baseURL;
  }

  // 根据提供商加载 API Key（环境变量覆盖，不设则保留配置文件的值）
  if (config.llm.provider === 'openai') {
    const envKey = process.env.OPENAI_API_KEY;
    if (envKey) config.llm.apiKey = envKey;
  } else if (config.llm.provider === 'anthropic') {
    const envKey = process.env.ANTHROPIC_API_KEY;
    if (envKey) config.llm.apiKey = envKey;
  }

  // 加载执行超时时间
  const timeout = process.env.FLOW_TIMEOUT;
  if (timeout) {
    const parsed = parseInt(timeout, 10);
    if (!isNaN(parsed) && parsed > 0) {
      config.execution.timeout = parsed;
    }
  }

  // 5. 从配置中提取命名模型预设（llm.models）
  // models 已在 mergeConfig 中从文件加载到 config.llm 中
  // 将其提取到顶层方便 ai-block 使用
  // 从项目配置中提取命名模型预设（llm.models）
  if (existsSync(projectConfigPath)) {
    try {
      const raw = readFileSync(projectConfigPath, 'utf-8');
      const parsed = parseYaml(raw) as Record<string, unknown>;
      const llmSection = parsed.llm as Record<string, unknown> | undefined;
      if (llmSection?.models && typeof llmSection.models === 'object') {
        config.models = llmSection.models as Record<string, Partial<LLMConfig>>;
      }
    } catch {
      // ignore parse errors
    }
  }

  return config;
}

/**
 * 获取 LLM 配置
 * @returns LLM 配置
 */
export function getLLMConfig(): LLMConfig {
  const config = loadConfig();
  return config.llm;
}
