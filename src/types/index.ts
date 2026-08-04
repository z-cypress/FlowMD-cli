/**
 * FlowMD CLI 类型定义
 */

import type { AgentStep } from '../core/blocks/agent/types.js';

/** 代码块类型标识符 */
export type BlockType = 'ai' | 'data' | 'template' | 'include' | 'run' | 'agent' | 'doc';

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
  /** 解析后的元数据，如 {model: 'gpt-4o', output: 'x'}；值可为字符串或字符串数组（如 vars） */
  meta: Record<string, string | string[]>;
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
  /** 控制流指令（if/elif/else/endif/for/endfor），按 source 顺序 */
  directives?: ControlDirective[];
}

/**
 * 控制流指令类型
 * if/elif 带条件；else/endif/endfor 无参数；for 带循环变量、列表与可选 collect
 */
export type ControlDirectiveKind = 'if' | 'elif' | 'else' | 'endif' | 'for' | 'endfor';

/**
 * 控制流指令（源自 Markdown HTML 注释，如 `<!-- if: {{score}} > 80 -->`）
 */
export interface ControlDirective {
  /** 指令类型 */
  kind: ControlDirectiveKind;
  /** 完整注释文本（含 `<!-- -->`，用于 release 剥离定位） */
  raw: string;
  /** if/elif 的条件表达式 */
  condition?: string;
  /** for 的循环变量名 */
  loopVar?: string;
  /** for 的列表变量名 */
  listExpr?: string;
  /** for 的 collect 累积数组名（可选） */
  collect?: string;
  /** 在原文档字符串中的起始字符偏移 */
  sourceStart: number;
  /** 在原文档字符串中的结束字符偏移 */
  sourceEnd: number;
}

/**
 * 控制流树节点：块 | if 区 | for 区
 */
export type ControlNode = BlockNode | IfNode | ForNode;

/** 块节点：包装单个可执行块 */
export interface BlockNode {
  kind: 'block';
  /** 包裹的块 */
  block: ExecutableBlock;
}

/** if 区的分支（then / elif / else） */
export interface IfBranch {
  /** 分支条件（else 分支为 undefined） */
  condition?: string;
  /** 分支体起始偏移（指令结束后） */
  start: number;
  /** 分支体结束偏移（下一指令或 endif 开始前） */
  end: number;
  /** 分支体中的子节点 */
  children: ControlNode[];
}

/** if 区节点 */
export interface IfNode {
  kind: 'if';
  /** if 指令起始偏移 */
  sourceStart: number;
  /** endif 指令结束偏移 */
  sourceEnd: number;
  /** 各分支（then + elifs + 可选 else） */
  branches: IfBranch[];
}

/** for 区节点 */
export interface ForNode {
  kind: 'for';
  /** 循环变量名 */
  loopVar: string;
  /** 列表表达式（context 变量名） */
  listExpr: string;
  /** collect 累积数组名（可选） */
  collect?: string;
  /** for 指令起始偏移 */
  sourceStart: number;
  /** endfor 指令结束偏移 */
  sourceEnd: number;
  /** 循环体起始偏移（for 指令结束后） */
  bodyStart: number;
  /** 循环体结束偏移（endfor 指令开始前） */
  bodyEnd: number;
  /** 循环体中的子节点 */
  children: ControlNode[];
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
  /** step 模式：只在指定位置（1-based 块序）的块前暂停 */
  stepBlock?: number;
  /** step 模式：只在该类型的块前暂停（ai/data/template/run/agent/include/doc） */
  breakOn?: string;
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
  /** 当前执行文件路径（用于 include 相对路径解析） */
  currentFile?: string;
  /** run 块：--yes 跳过执行确认 */
  runYes?: boolean;
  /** run 块：--strict 每次执行强制确认 */
  runStrict?: boolean;
  /** 结果缓存：ai/data 块按内容哈希复用结果（run 块因副作用不缓存） */
  cache?: boolean;
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
  /** 最大输出 Token 数（可选） */
  max_tokens?: number;
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
  /** CLI 行为配置 */
  cli?: {
    /** 输出语言（zh | en），默认自动检测 */
    lang?: 'zh' | 'en';
  };
  /** agent 块配置（v2.0-beta） */
  agent?: {
    /** api_call 允许的域名白名单（支持 *.suffix 通配） */
    allowedDomains?: string[];
    /** 成本预估上限（token），0 或未设 = 不限制 */
    maxEstimatedTokens?: number;
    /** web_search 搜索 endpoint（接受 ?q=，返回 HTML 或 JSON） */
    searchEndpoint?: string;
    /** 已确认的 agent 键（首次授权记忆） */
    confirmedAgents?: string[];
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
  /** agent 块步骤轨迹（仅 agent 块返回，ADR-017） */
  steps?: AgentStep[];
}

/**
 * executeDocument 的返回值
 */
export interface ExecutionResult {
  /** 渲染后的文档内容 */
  content: string;
  /** 是否有块执行失败 */
  hasError: boolean;
  /** 执行后产出的全部变量（供 pipeline 串联 / 调用方取用） */
  variables?: Record<string, unknown>;
  /** 块统计（供 serve/Web IDE 展示） */
  blocks?: { total: number; success: number; failed: number };
  /** 失败块明细（位置/类型/错误/行号，供 Web IDE 错误标注） */
  failedBlocks?: Array<{ position: number; type: string; error: string; line?: number }>;
}
