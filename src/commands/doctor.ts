/**
 * FlowMD doctor 命令
 * 环境诊断
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import chalk from 'chalk';

interface CheckResult {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
}

function printCheck(result: CheckResult): void {
  const icon = result.status === 'pass' ? '✅' : result.status === 'warn' ? '⚠️' : '❌';
  console.log(` ${icon} ${result.name}`);
  if (result.message) {
    const indent = result.status === 'pass' ? '   ' : '  ';
    console.log(`${indent}${chalk.gray(result.message)}`);
  }
}

/**
 * 执行 doctor 诊断
 */
export async function doctorCommand(): Promise<void> {
  console.log(chalk.bold.blue('\n FlowMD 环境诊断\n'));

  const results: CheckResult[] = [];

  // 1. Node.js 版本
  const nodeVersion = process.version;
  const major = parseInt(nodeVersion.slice(1).split('.')[0], 10);
  results.push({
    name: `Node.js ${nodeVersion}`,
    status: major >= 18 ? 'pass' : 'fail',
    message: major >= 18 ? '' : '需要 Node.js >= 18',
  });

  // 2. 配置文件
  const projectConfig = join(process.cwd(), '.flow', 'config.yml');
  const globalConfig = join(homedir(), '.flow', 'config.yml');

  if (existsSync(projectConfig)) {
    results.push({ name: '项目配置 (.flow/config.yml)', status: 'pass', message: '已找到' });
  } else {
    results.push({ name: '项目配置 (.flow/config.yml)', status: 'warn', message: '未找到，运行 flowmd init 创建' });
  }

  if (existsSync(globalConfig)) {
    results.push({ name: '全局配置 (~/.flow/config.yml)', status: 'pass', message: '已找到' });
  } else {
    results.push({ name: '全局配置 (~/.flow/config.yml)', status: 'warn', message: '未找到（可选）' });
  }

  // 3. API Key
  if (process.env.OPENAI_API_KEY) {
    const masked = process.env.OPENAI_API_KEY.slice(0, 8) + '...';
    results.push({ name: 'OPENAI_API_KEY', status: 'pass', message: masked });
  } else {
    results.push({ name: 'OPENAI_API_KEY', status: 'warn', message: '未设置（AI 块不可用）' });
  }

  if (process.env.ANTHROPIC_API_KEY) {
    const masked = process.env.ANTHROPIC_API_KEY.slice(0, 8) + '...';
    results.push({ name: 'ANTHROPIC_API_KEY', status: 'pass', message: masked });
  } else {
    results.push({ name: 'ANTHROPIC_API_KEY', status: 'warn', message: '未设置' });
  }

  // 4. 环境变量
  const envVars = ['FLOW_LLM_MODEL', 'FLOW_LLM_BASE_URL', 'FLOW_TIMEOUT'];
  for (const v of envVars) {
    if (process.env[v]) {
      results.push({ name: v, status: 'pass', message: process.env[v]! });
    }
  }

  // 5. .env 文件
  if (existsSync(join(process.cwd(), '.env'))) {
    results.push({ name: '.env 文件', status: 'pass', message: '已找到' });
  } else {
    results.push({ name: '.env 文件', status: 'warn', message: '未找到（可选）' });
  }

  // 6. 输出结果
  let passCount = 0;
  let warnCount = 0;
  let failCount = 0;

  for (const r of results) {
    printCheck(r);
    if (r.status === 'pass') passCount++;
    else if (r.status === 'warn') warnCount++;
    else failCount++;
  }

  console.log('');
  console.log(chalk.gray(` ${passCount} 通过, ${warnCount} 警告, ${failCount} 失败`));

  if (warnCount > 0 || failCount > 0) {
    console.log('');
    console.log(chalk.yellow(' 💡 提示'));
    if (!process.env.OPENAI_API_KEY) {
      console.log(chalk.gray('    - 设置 OPENAI_API_KEY 环境变量以使用 AI 块'));
    }
    if (!existsSync(projectConfig)) {
      console.log(chalk.gray('    - 运行 flowmd init 创建项目配置'));
    }
    console.log('');
  }
}
