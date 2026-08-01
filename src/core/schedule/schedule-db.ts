/**
 * FlowMD schedule 定时任务持久化
 * 任务集持久化到 .flow/schedule.db (SQLite)，与 history.db 同模式（ADR-009）
 */

import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

/** 定时任务 */
export interface ScheduleTask {
  id: number;
  /** 任务名（唯一） */
  name: string;
  /** 要执行的文档路径 */
  file: string;
  /** 5 段 cron 表达式 */
  cron: string;
  /** 是否启用 */
  enabled: number;
  /** 创建时间 */
  created_at: string;
  /** 最近一次运行时间 */
  last_run_at: string | null;
  /** 最近一次运行状态：success / failed */
  last_status: string | null;
}

/** 写入任务所需的输入 */
export interface ScheduleInput {
  name: string;
  file: string;
  cron: string;
}

/** 数据库文件路径（惰性计算，便于测试切换工作目录） */
function getDbPath(): string {
  return join(process.cwd(), '.flow', 'schedule.db');
}

/** 打开数据库并确保目录与表结构存在 */
function openDb(): Database.Database {
  const dbPath = getDbPath();
  mkdirSync(join(process.cwd(), '.flow'), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      file TEXT NOT NULL,
      cron TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      last_run_at TEXT,
      last_status TEXT
    );
  `);
  return db;
}

/**
 * 新增定时任务
 * @param input - 任务输入
 * @returns 新任务 id
 */
export function addSchedule(input: ScheduleInput): number {
  const db = openDb();
  try {
    const info = db.prepare(
      `INSERT INTO schedules (name, file, cron, created_at)
       VALUES (?, ?, ?, ?)`
    ).run(input.name, input.file, input.cron, new Date().toISOString());
    return Number(info.lastInsertRowid);
  } finally {
    db.close();
  }
}

/**
 * 列出所有定时任务（按创建顺序）
 * @returns 任务列表
 */
export function listSchedules(): ScheduleTask[] {
  const db = openDb();
  try {
    return db.prepare('SELECT * FROM schedules ORDER BY id').all() as ScheduleTask[];
  } finally {
    db.close();
  }
}

/**
 * 按名称查找任务
 * @param name - 任务名
 * @returns 任务或 null
 */
export function getSchedule(name: string): ScheduleTask | null {
  const db = openDb();
  try {
    return (db.prepare('SELECT * FROM schedules WHERE name = ?').get(name) as ScheduleTask | undefined) ?? null;
  } finally {
    db.close();
  }
}

/**
 * 删除任务
 * @param name - 任务名
 * @returns 是否删除了任务
 */
export function removeSchedule(name: string): boolean {
  const db = openDb();
  try {
    const info = db.prepare('DELETE FROM schedules WHERE name = ?').run(name);
    return info.changes > 0;
  } finally {
    db.close();
  }
}

/**
 * 启用/暂停任务
 * @param name - 任务名
 * @param enabled - 是否启用
 * @returns 是否更新了任务
 */
export function setScheduleEnabled(name: string, enabled: boolean): boolean {
  const db = openDb();
  try {
    const info = db.prepare('UPDATE schedules SET enabled = ? WHERE name = ?').run(enabled ? 1 : 0, name);
    return info.changes > 0;
  } finally {
    db.close();
  }
}

/**
 * 更新任务的最近运行状态
 * @param name - 任务名
 * @param status - 运行状态（success / failed）
 */
export function updateScheduleStatus(name: string, status: 'success' | 'failed'): void {
  const db = openDb();
  try {
    db.prepare(
      'UPDATE schedules SET last_run_at = ?, last_status = ? WHERE name = ?'
    ).run(new Date().toISOString(), status, name);
  } finally {
    db.close();
  }
}
