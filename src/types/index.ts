/**
 * FlowMD CLI 类型定义
 */

/** 代码块类型标识符 */
export type BlockType = 'ai' | 'data' | 'template';

/**
 * 从 Markdown 中提取的可执行代码块
 */
export interface ExecutableBlock {
  /** 块类型 */
  type: BlockType;
  /** 代码块内的原始文本 */
  content: string;
  /** 完整语言标识符，如 "ai {model: gpt-4o, output: x}" */
  lang: string;
  /** 解析后的元数据，如 {model: 'gpt-4o', output: 'x'} */
  meta: Record<string, string>;
  /** 在文档中的顺序索引（0-based） */
  position: number;
  /** 在原文档字符串中的起始字符偏移 */
  sourceStart: number;
  /** 在原文档字符串中的结束字符偏移 */
  sourceEnd: number;
}

/**
 * 解析后的 Markdown 文档，包含提取的块和变量
 */
export interface ParsedDocument {
  /** 可执行块列表 */
  blocks: ExecutableBlock[];
  /** 原始文档全文 */
  rawContent: string;
  /** 去重后的所有 {{变量名}} 引用列表 */
  variables: string[];
}

/**
 * run 命令的运行选项
 */
export interface RunOptions {
  /** 输出模式：inline（覆盖原文件）、new（新文件）、stdout（标准输出） */
  output: 'inline' | 'new' | 'stdout';
  /** 试运行模式，跳过实际执行 */
  dryRun: boolean;
  /** 逐步执行模式，等待用户输入 */
  stepMode: boolean;
  /** 遇到第一个错误就停止 */
  failFast: boolean;
  /** 调试模式，显示执行结果 */
  debug: boolean;
  /** release 模式，执行后移除所有指令块，仅保留渲染结果 */
  release: boolean;
  /** quiet 模式，抑制进度输出 */
  quiet: boolean;
  /** 命令行注入的变量键值对 */
  varArgs: Record<string, string>;
  /** 变量文件路径（YAML/JSON） */
  varFile?: string;
}

/**
 * LLM 提供商配置
 */
export interface LLMConfig {
  /** 提供商类型：openai 或 anthropic */
  provider: 'openai' | 'anthropic';
  /** API 密钥 */
  apiKey: string;
  /** 模型名称 */
  model: string;
  /** 温度参数（可选） */
  temperature?: number;
  /** 自定义 API 基础 URL（可选） */
  baseURL?: string;
}

/**
 * 数据库连接配置
 */
export interface DBConnectionConfig {
  /** 数据库类型 */
  type: 'postgresql' | 'mysql' | 'sqlite';
  /** 主机地址（可选） */
  host?: string;
  /** 端口号（可选） */
  port?: number;
  /** 数据库名称 */
  database: string;
  /** 用户名（可选） */
  user?: string;
  /** 密码（可选） */
  password?: string;
  /** SQLite 数据库文件路径（仅 SQLite） */
  filename?: string;
}

/**
 * FlowMD 完整配置
 */
export interface FlowConfig {
  /** LLM 配置 */
  llm: LLMConfig;
  /** 命名模型预设，可在 AI 块中用 model 名称引用 */
  models?: Record<string, Partial<LLMConfig>>;
  /** 数据源配置映射 */
  dataSources: Record<string, DBConnectionConfig>;
  /** 自定义变量 */
  variables?: Record<string, string>;
  /** 执行配置 */
  execution: {
    /** 超时时间（秒） */
    timeout: number;
  };
}

/**
 * 单个块的执行结果
 */
export interface BlockResult {
  /** 是否执行成功 */
  success: boolean;
  /** 输出内容（失败时为 null） */
  output: string | null;
  /** 错误信息（失败时返回） */
  error?: string;
  /** 执行耗时（毫秒） */
  duration: number;
}
