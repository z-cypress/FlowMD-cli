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
 * llm.models 按 key 逐项合并，使全局与项目配置的预设模型可以共存
 */
function mergeConfig(target: FlowConfig, source: Partial<FlowConfig>): void {
  if (source.llm) {
    const targetLlm = target.llm as LLMConfig & { models?: Record<string, Partial<LLMConfig>> };
    const sourceLlm = source.llm as LLMConfig & { models?: Record<string, Partial<LLMConfig>> };
    target.llm = {
      ...target.llm,
      ...source.llm,
      models: { ...targetLlm.models, ...sourceLlm.models },
    } as LLMConfig;
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
  if (source.cli) {
    target.cli = { ...target.cli, ...source.cli };
  }
  if (source.agent) {
    target.agent = { ...target.agent, ...source.agent };
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
    agent: {},
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

  // 3.5 项目凭据 ./.flow/credentials.yml（优先于 config.yml 的 apiKey，低于环境变量）
  const credentialsPath = join(process.cwd(), '.flow', 'credentials.yml');
  if (existsSync(credentialsPath)) {
    try {
      const content = readFileSync(credentialsPath, 'utf-8');
      const credConfig = parseYaml(content) as Partial<FlowConfig>;
      if (credConfig.llm?.apiKey) {
        config.llm.apiKey = credConfig.llm.apiKey;
      }
    } catch {
      // 凭据解析失败，忽略（保留已加载的配置）
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

  // 5. 从合并后的配置中提取命名模型预设（llm.models，全局+项目配置）
  const mergedLlm = config.llm as LLMConfig & { models?: Record<string, Partial<LLMConfig>> };
  if (mergedLlm.models && Object.keys(mergedLlm.models).length > 0) {
    config.models = mergedLlm.models;
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
