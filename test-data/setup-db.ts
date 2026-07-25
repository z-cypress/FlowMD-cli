/**
 * 测试数据库初始化脚本
 * 创建 SQLite 数据库并填充示例数据
 */

import Database from 'better-sqlite3';
import { join } from 'node:path';
import { existsSync, unlinkSync } from 'node:fs';

const DB_PATH = join(import.meta.dirname || '.', 'test.db');

if (existsSync(DB_PATH)) {
  unlinkSync(DB_PATH);
  console.log('已删除旧数据库');
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  age INTEGER,
  city TEXT,
  active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

db.exec(`CREATE TABLE products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  price REAL NOT NULL,
  category TEXT,
  stock INTEGER DEFAULT 0
)`);

db.exec(`CREATE TABLE sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER,
  amount REAL NOT NULL,
  sale_date TEXT NOT NULL,
  FOREIGN KEY (product_id) REFERENCES products(id)
)`);

const insertUser = db.prepare(
  'INSERT INTO users (name, email, age, city, active) VALUES (?, ?, ?, ?, ?)'
);
const users = [
  ['张三', 'zhangsan@test.com', 25, '北京', 1],
  ['李四', 'lisi@test.com', 30, '上海', 1],
  ['王五', 'wangwu@test.com', 28, '广州', 1],
  ['赵六', 'zhaoliu@test.com', 35, '深圳', 0],
];
const insertUsers = db.transaction(() => {
  for (const u of users) insertUser.run(...u);
});
insertUsers();
console.log(`已插入 ${users.length} 条用户数据`);

const insertProduct = db.prepare(
  'INSERT INTO products (name, price, category, stock) VALUES (?, ?, ?, ?)'
);
const products = [
  ['笔记本电脑', 5999, '电子产品', 50],
  ['无线鼠标', 99, '电子产品', 200],
  ['机械键盘', 399, '电子产品', 100],
  ['办公椅', 899, '家具', 25],
];
const insertProducts = db.transaction(() => {
  for (const p of products) insertProduct.run(...p);
});
insertProducts();
console.log(`已插入 ${products.length} 条产品数据`);

const insertSale = db.prepare(
  'INSERT INTO sales (product_id, amount, sale_date) VALUES (?, ?, ?)'
);
const sales = [
  [1, 5999, '2026-07-20'],
  [1, 5999, '2026-07-21'],
  [2, 198, '2026-07-21'],
  [3, 399, '2026-07-22'],
  [4, 899, '2026-07-23'],
  [1, 5999, '2026-07-24'],
  [2, 99, '2026-07-25'],
];
const insertSales = db.transaction(() => {
  for (const s of sales) insertSale.run(...s);
});
insertSales();
console.log(`已插入 ${sales.length} 条销售数据`);

db.close();
console.log('\n测试数据库初始化完成');
console.log(`数据库: ${DB_PATH}`);
console.log('表: users(4), products(4), sales(7)');
