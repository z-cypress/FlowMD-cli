/**
 * FlowMD 执行历史模块
 * 将每次执行摘要与块级明细持久化到 .flow/history/history.db (SQLite)
 */

import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

/** 保留的最大执行记录数 */
export const MAX_HISTORY_RECORDS = 500;
/** 错误消息最大长度（字符） */
export const MAX_ERROR_LENGTH = 200;

/** 单块执行记录 */
export interface BlockHistoryInput {
  position: number;
  type: string;
  status: 'success' | 'failed';
  error?: string;
  duration_ms: number;
}

/** 单块查询返回（含块 id 与所属 execution_id） */
export interface BlockHistoryRow extends BlockHistoryInput {
  id: number;
  execution_id: number;
}

/** 写入历史所需的输入 */
export interface HistoryInput {
  file: string;
  total_blocks: number;
  success_blocks: number;
  failed_blocks: number;
  blocks: BlockHistoryInput[];
}

/** 列表/详情返回的执行记录 */
export interface HistoryRecord {
  id: number;
  file: string;
  timestamp: string;
  duration_ms: number;
  total_blocks: number;
  success_blocks: number;
  failed_blocks: number;
  status: 'success' | 'partial' | 'failed';
  blocks?: BlockHistoryRow[];
}

/** 数据库文件路径（惰性计算，便于测试切换工作目录） */
function getDbPath(): string {
  return join(process.cwd(), '.flow', 'history', 'history.db');
}

/** 打开数据库并确保目录与表结构存在 */
function openDb(): Database.Database {
  const dbPath = getDbPath();
  mkdirSync(join(process.cwd(), '.flow', 'history'), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS executions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      total_blocks INTEGER NOT NULL,
      success_blocks INTEGER NOT NULL,
      failed_blocks INTEGER NOT NULL,
      status TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS execution_blocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      execution_id INTEGER NOT NULL,
      position INTEGER NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      duration_ms INTEGER NOT NULL,
      FOREIGN KEY (execution_id) REFERENCES executions(id) ON DELETE CASCADE
    );
  `);
  return db;
}

/** 根据成败块数计算整体状态 */
function computeStatus(success: number, failed: number): 'success' | 'partial' | 'failed' {
  if (failed > 0 && success > 0) return 'partial';
  if (failed > 0) return 'failed';
  return 'success';
}

/** 记录一次执行，返回自增 id */
export function recordExecution(input: HistoryInput): number {
  const db = openDb();
  try {
    const status = computeStatus(input.success_blocks, input.failed_blocks);
    const insertExecution = db.prepare(`
      INSERT INTO executions (file, timestamp, duration_ms, total_blocks, success_blocks, failed_blocks, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const insertBlock = db.prepare(`
      INSERT INTO execution_blocks (execution_id, position, type, status, error, duration_ms)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const tx = db.transaction(() => {
      const durationMs = input.blocks.reduce((sum, b) => sum + b.duration_ms, 0);
      const info = insertExecution.run(
        input.file,
        new Date().toISOString(),
        durationMs,
        input.total_blocks,
        input.success_blocks,
        input.failed_blocks,
        status
      );
      const executionId = Number(info.lastInsertRowid);
      for (const b of input.blocks) {
        insertBlock.run(
          executionId,
          b.position,
          b.type,
          b.status,
          b.error ? b.error.slice(0, MAX_ERROR_LENGTH) : null,
          b.duration_ms
        );
      }
      // 保留上限：删除最旧超出部分
      db.prepare(`
        DELETE FROM executions
        WHERE id NOT IN (
          SELECT id FROM executions ORDER BY id DESC LIMIT ?
        )
      `).run(MAX_HISTORY_RECORDS);
      return executionId;
    });

    return tx();
  } finally {
    db.close();
  }
}

/** 列出最近 limit 条执行记录 */
export function listHistory(limit = 20): HistoryRecord[] {
  const db = openDb();
  try {
    return db.prepare('SELECT * FROM executions ORDER BY id DESC LIMIT ?').all(limit) as HistoryRecord[];
  } finally {
    db.close();
  }
}

/** 获取单条执行详情（含块级明细） */
export function getHistoryDetail(id: number): HistoryRecord | null {
  const db = openDb();
  try {
    const row = db.prepare('SELECT * FROM executions WHERE id = ?').get(id) as HistoryRecord | undefined;
    if (!row) return null;
    const blocks = db.prepare('SELECT * FROM execution_blocks WHERE execution_id = ? ORDER BY position').all(id) as BlockHistoryRow[];
    return { ...row, blocks };
  } finally {
    db.close();
  }
}

/** 清空全部历史记录 */
export function clearHistory(): void {
  const db = openDb();
  try {
    db.exec('DELETE FROM executions; DELETE FROM execution_blocks;');
  } finally {
    db.close();
  }
}
