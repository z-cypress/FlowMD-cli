/**
 * FlowMD 数据块执行器
 * 对数据库执行 SQL 查询（MVP：仅支持 SQLite）
 */

import Database from 'better-sqlite3';
import type { ExecutionContext } from '../context.js';
import type { DBConnectionConfig, BlockResult } from '../../types/index.js';
import { getErrorMessage } from '../../utils/error-formatter.js';

/** 数据块配置 */
interface DataBlockConfig {
  /** 数据源名称（可选，默认 'default'） */
  from?: string;
  /** 输出变量名（可选） */
  output?: string;
}

/** 不安全的字符正则：SQL 注入常见字符（不含分号，分号由多语句检测单独处理） */
const UNSAFE_CHARS_REGEX = /"\\|--|\/\*|\*\/|xp_|sp_/i;

/** 危险 SQL 关键字列表（大写） */
const DANGEROUS_KEYWORDS = [
  'DROP', 'DELETE', 'UPDATE', 'INSERT', 'ALTER',
  'TRUNCATE', 'CREATE', 'EXEC', 'EXECUTE', 'GRANT', 'REVOKE',
];

/**
 * 执行数据块，运行 SQL 查询
 * @param content - SQL 查询内容（可包含 {{变量}}）
 * @param config - 块级配置
 * @param context - 变量上下文，用于渲染
 * @param dataSources - 可用的数据源配置
 * @returns 块执行结果
 */
export async function executeDataBlock(
  content: string,
  config: DataBlockConfig,
  context: ExecutionContext,
  dataSources: Record<string, DBConnectionConfig>
): Promise<BlockResult> {
  const startTime = Date.now();

  try {
    // 安全检查：验证原始 SQL
    const preError = validateSQL(content);
    if (preError) {
      return {
        success: false,
        output: null,
        error: preError,
        duration: Date.now() - startTime,
      };
    }

    // 渲染 SQL 中的变量
    const sql = context.render(content);

    // 安全检查：渲染后再次验证（变量可能注入危险内容）
    const postError = validateSQL(sql);
    if (postError) {
      return {
        success: false,
        output: null,
        error: `变量渲染后 SQL 不安全: ${postError}`,
        duration: Date.now() - startTime,
      };
    }

    // 获取数据源配置
    const sourceName = config.from || 'default';
    const sourceConfig = dataSources[sourceName];

    if (!sourceConfig) {
      return {
        success: false,
        output: null,
        error: `数据源 '${sourceName}' 未配置`,
        duration: Date.now() - startTime,
      };
    }

    // 根据数据库类型执行查询
    let rows: unknown[];

    if (sourceConfig.type === 'sqlite') {
      rows = executeSQLite(sql, sourceConfig);
    } else {
      // PostgreSQL 和 MySQL 在 MVP 中未实现
      return {
        success: false,
        output: null,
        error: `${sourceConfig.type} 尚未支持，仅支持 SQLite`,
        duration: Date.now() - startTime,
      };
    }

    // 将结果序列化为 JSON
    const resultJson = JSON.stringify(rows, null, 2);

    // 如果指定了输出变量名，将结果存入上下文
    if (config.output) {
      // 如果查询只返回一行，直接存储该行对象（方便模板访问字段）
      // 如果返回多行，存储整个数组
      if (rows.length === 1) {
        context.set(config.output, rows[0]);
      } else {
        context.set(config.output, rows);
      }
    }

    return {
      success: true,
      output: resultJson,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      output: null,
      error: getErrorMessage(error),
      duration: Date.now() - startTime,
    };
  }
}

/**
 * 验证 SQL 语句安全性
 * @param sql - SQL 语句
 * @returns 错误信息，安全则返回 null
 */
function validateSQL(sql: string): string | null {
  const trimmed = sql.trim();

  // 1. 必须是 SELECT 开头
  if (!trimmed.toUpperCase().startsWith('SELECT')) {
    return '仅支持 SELECT 查询';
  }

  // 2. 移除字符串字面量后检测危险关键字
  const withoutStrings = sql.replace(/'.*?'/g, '').replace(/".*?"/g, '');
  const upperWithout = withoutStrings.toUpperCase();

  for (const keyword of DANGEROUS_KEYWORDS) {
    if (upperWithout.includes(keyword)) {
      return `禁止使用 ${keyword} 语句。FlowMD 仅支持只读查询`;
    }
  }

  // 3. 禁止多语句（分号检测，忽略字符串中的分号）
  const semicolonsOutside = withoutStrings.split(';').length - 1;
  if (semicolonsOutside > 0) {
    return '禁止执行多条语句';
  }

  // 4. 检测危险字符（对去除了字符串字面量的内容检测）
  if (UNSAFE_CHARS_REGEX.test(withoutStrings)) {
    return 'SQL 中包含潜在危险字符';
  }

  return null;
}

/**
 * 执行 SQLite 查询（同步）
 * @param sql - SQL 查询语句
 * @param config - 数据库连接配置
 * @returns 查询结果行
 */
function executeSQLite(sql: string, config: DBConnectionConfig): unknown[] {
  const filename = config.filename || config.database;

  if (!filename) {
    throw new Error('SQLite 数据库文件路径未指定');
  }

  const db = new Database(filename);
  try {
    const stmt = db.prepare(sql);
    const rows = stmt.all();
    return rows;
  } finally {
    db.close();
  }
}
