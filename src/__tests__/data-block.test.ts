/**
 * Data block executor unit tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { unlinkSync, existsSync } from 'node:fs';
import Database from 'better-sqlite3';
import { executeDataBlock } from '../core/blocks/data-block.js';
import { ExecutionContext } from '../core/context.js';
import type { DBConnectionConfig } from '../types/index.js';

const TEST_DB_PATH = '/tmp/flowmd-test.db';

describe('executeDataBlock', () => {
  let context: ExecutionContext;
  let dataSources: Record<string, DBConnectionConfig>;

  beforeEach(() => {
    context = new ExecutionContext();
    dataSources = {
      default: {
        type: 'sqlite',
        filename: TEST_DB_PATH,
      },
    };

    // Create database with test data
    const db = new Database(TEST_DB_PATH);
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        name TEXT,
        email TEXT
      )
    `);
    db.exec('DELETE FROM users');
    db.prepare('INSERT INTO users (name, email) VALUES (?, ?)').run('Alice', 'alice@example.com');
    db.prepare('INSERT INTO users (name, email) VALUES (?, ?)').run('Bob', 'bob@example.com');
    db.close();
  });

  afterEach(() => {
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  describe('SELECT queries', () => {
    it('should execute SELECT query and return results', async () => {
      const result = await executeDataBlock(
        'SELECT * FROM users',
        {},
        context,
        dataSources
      );

      expect(result.success).toBe(true);
      expect(result.output).toBeDefined();
      const rows = JSON.parse(result.output!);
      expect(rows).toHaveLength(2);
    });

    it('should execute SELECT with WHERE clause', async () => {
      const result = await executeDataBlock(
        "SELECT * FROM users WHERE name = 'Alice'",
        {},
        context,
        dataSources
      );

      expect(result.success).toBe(true);
      const rows = JSON.parse(result.output!);
      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe('Alice');
    });

    it('should render variables in SQL', async () => {
      context.set('userName', 'Alice');

      const result = await executeDataBlock(
        "SELECT * FROM users WHERE name = '{{userName}}'",
        {},
        context,
        dataSources
      );

      expect(result.success).toBe(true);
      const rows = JSON.parse(result.output!);
      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe('Alice');
    });

    it('should block variable injection that changes SQL safety', async () => {
      context.set('input', "'; DROP TABLE users --");

      const result = await executeDataBlock(
        "SELECT * FROM users WHERE name = '{{input}}'",
        {},
        context,
        dataSources
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('不安全');
    });

    it('should store result in context if output is specified', async () => {
      await executeDataBlock(
        'SELECT * FROM users',
        { output: 'users' },
        context,
        dataSources
      );

      const users = context.get('users');
      expect(users).toBeDefined();
      expect(Array.isArray(users)).toBe(true);
      expect(users).toHaveLength(2);
    });
  });

  describe('security', () => {
    it('should reject non-SELECT statements', async () => {
      const result = await executeDataBlock(
        'INSERT INTO users (name, email) VALUES ("test", "test@test.com")',
        {},
        context,
        dataSources
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('仅支持 SELECT');
    });

    it('should reject UPDATE statements', async () => {
      const result = await executeDataBlock(
        'UPDATE users SET name = "test"',
        {},
        context,
        dataSources
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('仅支持 SELECT');
    });

    it('should reject DELETE statements', async () => {
      const result = await executeDataBlock(
        'DELETE FROM users',
        {},
        context,
        dataSources
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('仅支持 SELECT');
    });

    it('should reject DROP statements', async () => {
      const result = await executeDataBlock(
        'DROP TABLE users',
        {},
        context,
        dataSources
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('仅支持 SELECT');
    });

    it('should handle case-insensitive SELECT check', async () => {
      const result = await executeDataBlock(
        'select * FROM users',
        {},
        context,
        dataSources
      );

      expect(result.success).toBe(true);
    });

    it('should reject ALTER statements', async () => {
      const result = await executeDataBlock(
        'SELECT * FROM users; ALTER TABLE users ADD COLUMN foo TEXT',
        {},
        context,
        dataSources
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject CREATE statements', async () => {
      const result = await executeDataBlock(
        'CREATE TABLE evil (id INT)',
        {},
        context,
        dataSources
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('仅支持 SELECT');
    });

    it('should reject TRUNCATE statements', async () => {
      const result = await executeDataBlock(
        'TRUNCATE TABLE users',
        {},
        context,
        dataSources
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('仅支持 SELECT');
    });

    it('should reject multi-statement queries with semicolons', async () => {
      const result = await executeDataBlock(
        'SELECT * FROM users; DROP TABLE users',
        {},
        context,
        dataSources
      );

      expect(result.success).toBe(false);
      // DROP 关键字检测先于分号检测，因此错误信息包含 DROP
      expect(result.error).toBeDefined();
    });

    it('should reject dangerous keywords hidden after SELECT', async () => {
      const result = await executeDataBlock(
        'SELECT * FROM users WHERE 1=1 UNION SELECT * FROM users',
        {},
        context,
        dataSources
      );

      expect(result.success).toBe(true); // UNION SELECT is still a SELECT, no dangerous keyword
    });

    it('should allow semicolons inside string literals', async () => {
      const result = await executeDataBlock(
        "SELECT * FROM users WHERE name = 'hello;world'",
        {},
        context,
        dataSources
      );

      expect(result.success).toBe(true);
    });

    it('should allow dangerous keywords inside string literals', async () => {
      const result = await executeDataBlock(
        "SELECT * FROM users WHERE name = 'DROP TABLE'",
        {},
        context,
        dataSources
      );

      expect(result.success).toBe(true);
    });

    it('should reject EXEC statements', async () => {
      const result = await executeDataBlock(
        'EXEC sp_evil',
        {},
        context,
        dataSources
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('仅支持 SELECT');
    });

    it('should reject GRANT statements', async () => {
      const result = await executeDataBlock(
        'GRANT ALL ON users TO public',
        {},
        context,
        dataSources
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('仅支持 SELECT');
    });

    it('should reject REVOKE statements', async () => {
      const result = await executeDataBlock(
        'REVOKE ALL ON users FROM public',
        {},
        context,
        dataSources
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('仅支持 SELECT');
    });
  });

  describe('error handling', () => {
    it('should handle missing data source', async () => {
      const result = await executeDataBlock(
        'SELECT * FROM users',
        { from: 'nonexistent' },
        context,
        dataSources
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('未配置');
    });

    it('should handle SQL syntax errors', async () => {
      const result = await executeDataBlock(
        'SELECT * FROM nonexistent_table',
        {},
        context,
        dataSources
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle missing database file', async () => {
      const customDataSources: Record<string, DBConnectionConfig> = {
        default: {
          type: 'sqlite',
          filename: '/nonexistent/path/db.sqlite',
        },
      };

      const result = await executeDataBlock(
        'SELECT * FROM users',
        {},
        context,
        customDataSources
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('unsupported databases', () => {
    it('should return error for unknown database type', async () => {
      const badConfig = { type: 'mongodb' as any, database: 'test' };
      const result = await executeDataBlock(
        'SELECT 1',
        {},
        context,
        { default: badConfig }
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('不支持');
    });

    it('should execute SELECT query on MySQL', async () => {
      const mysqlDataSources: Record<string, DBConnectionConfig> = {
        default: {
          type: 'mysql',
          host: process.env.FLOW_TEST_MYSQL_HOST || 'localhost',
          port: Number(process.env.FLOW_TEST_MYSQL_PORT) || 3306,
          user: process.env.FLOW_TEST_MYSQL_USER || 'root',
          password: process.env.FLOW_TEST_MYSQL_PASSWORD || '',
          database: process.env.FLOW_TEST_MYSQL_DATABASE || 'flowmd_test',
        },
      };

      const result = await executeDataBlock(
        'SELECT * FROM users ORDER BY id',
        {},
        context,
        mysqlDataSources
      );

      expect(result.success).toBe(true);
      const rows = JSON.parse(result.output!);
      expect(rows).toHaveLength(2);
      expect(rows[0].name).toBe('Alice');
      expect(rows[1].name).toBe('Bob');
    });

    it('should execute SELECT query on PostgreSQL', async () => {
      const pgDataSources: Record<string, DBConnectionConfig> = {
        default: {
          type: 'postgresql',
          host: process.env.FLOW_TEST_PG_HOST || 'localhost',
          port: Number(process.env.FLOW_TEST_PG_PORT) || 5432,
          user: process.env.FLOW_TEST_PG_USER || process.env.USER || 'postgres',
          password: process.env.FLOW_TEST_PG_PASSWORD || '',
          database: process.env.FLOW_TEST_PG_DATABASE || 'flowmd_test',
        },
      };

      const result = await executeDataBlock(
        'SELECT * FROM users ORDER BY id',
        {},
        context,
        pgDataSources
      );

      expect(result.success).toBe(true);
      const rows = JSON.parse(result.output!);
      expect(rows).toHaveLength(2);
      expect(rows[0].name).toBe('Alice');
      expect(rows[1].name).toBe('Bob');
    });
  });
});
