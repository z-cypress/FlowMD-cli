/**
 * 测试运行器
 * 依次执行所有测试文档并检查结果
 */

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';

const CLI = 'flowmd';
const testDir = import.meta.dirname || '.';

const tests: { file: string; desc: string; expect?: string }[] = [
  { file: 'simple.md', desc: '纯文本文档（无代码块）' },
  { file: 'basic-example.md', desc: '三种块基本流程' },
  { file: 'data-example.md', desc: '数据查询 + 模板渲染' },
  { file: 'template-example.md', desc: 'Handlebars 语法（each/json）' },
  { file: 'complex-example.md', desc: '多步骤工作流' },
  { file: 'no-output.md', desc: '无 output 参数的块' },
  { file: 'error-example.md', desc: '错误处理' },
  { file: 'nested-vars.md', desc: '嵌套变量' },
  { file: 'unicode-example.md', desc: 'Unicode 支持' },
];

// 确保测试数据库存在
const dbPath = join(testDir, 'test.db');
if (!existsSync(dbPath)) {
  console.log(chalk.yellow('⚠ 测试数据库不存在，正在创建...'));
  execSync(`npx tsx "${join(testDir, 'setup-db.ts')}"`, { stdio: 'inherit', cwd: process.cwd() });
  console.log('');
}

console.log(chalk.blue('🚀 FlowMD 测试运行器'));
console.log('');

let passed = 0;
let failed = 0;

for (const t of tests) {
  const filePath = join(testDir, t.file);
  process.stdout.write(` ${chalk.gray('→')} ${t.desc} (${t.file})... `);

  try {
    const output = execSync(`${CLI} run "${filePath}" -o stdout --dry-run`, {
      encoding: 'utf-8',
      cwd: process.cwd(),
      timeout: 30000,
    });

    if (output.includes('❌')) {
      console.log(chalk.red('✗'));
      failed++;
    } else {
      console.log(chalk.green('✓'));
      passed++;
    }
  } catch (err) {
    console.log(chalk.red('✗'));
    failed++;
  }
}

console.log('');
console.log(chalk.gray(` ${passed} 通过, ${failed} 失败, ${passed + failed} 总计`));
console.log(chalk.green('✨ 测试运行完成'));
