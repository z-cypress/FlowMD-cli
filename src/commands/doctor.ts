/**
 * FlowMD doctor 命令
 * 环境诊断
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';
import chalk from 'chalk';
import { t } from '../utils/i18n.js';

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
 * 检查 python3 是否可用
 * @returns 是否可用
 */
function hasPython(): boolean {
  try {
    const result = spawnSync('python3', ['--version'], { stdio: 'ignore' });
    return !result.error && result.status === 0;
  } catch {
    return false;
  }
}

/**
 * 执行 doctor 诊断
 */
export async function doctorCommand(): Promise<void> {
  console.log(chalk.bold.blue(t('doctor.title')));

  const results: CheckResult[] = [];

  // 1. Node.js 版本
  const nodeVersion = process.version;
  const major = parseInt(nodeVersion.slice(1).split('.')[0], 10);
  results.push({
    name: `Node.js ${nodeVersion}`,
    status: major >= 18 ? 'pass' : 'fail',
    message: major >= 18 ? '' : t('doctor.nodeVersion'),
  });

  // 2. 配置文件
  const projectConfig = join(process.cwd(), '.flow', 'config.yml');
  const globalConfig = join(homedir(), '.flow', 'config.yml');

  if (existsSync(projectConfig)) {
    results.push({ name: t('doctor.projectConfig'), status: 'pass', message: t('common.found') });
  } else {
    results.push({ name: t('doctor.projectConfig'), status: 'warn', message: t('doctor.notFoundInit') });
  }

  if (existsSync(globalConfig)) {
    results.push({ name: t('doctor.globalConfig'), status: 'pass', message: t('common.found') });
  } else {
    results.push({ name: t('doctor.globalConfig'), status: 'warn', message: t('doctor.notFoundOptional') });
  }

  // 3. API Key
  if (process.env.OPENAI_API_KEY) {
    const masked = process.env.OPENAI_API_KEY.slice(0, 8) + '...';
    results.push({ name: 'OPENAI_API_KEY', status: 'pass', message: masked });
  } else {
    results.push({ name: 'OPENAI_API_KEY', status: 'warn', message: t('doctor.apiKeyMissing') });
  }

  if (process.env.ANTHROPIC_API_KEY) {
    const masked = process.env.ANTHROPIC_API_KEY.slice(0, 8) + '...';
    results.push({ name: 'ANTHROPIC_API_KEY', status: 'pass', message: masked });
  } else {
    results.push({ name: 'ANTHROPIC_API_KEY', status: 'warn', message: t('common.notSet') });
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
    results.push({ name: t('doctor.envFile'), status: 'pass', message: t('common.found') });
  } else {
    results.push({ name: t('doctor.envFile'), status: 'warn', message: t('doctor.notFoundOptional') });
  }

  // 6. python3（run 块 python runtime 需要）
  const pythonOk = hasPython();
  results.push({
    name: 'python3',
    status: pythonOk ? 'pass' : 'warn',
    message: pythonOk ? '' : t('doctor.pythonMissing'),
  });

  // 7. 输出结果
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
  console.log(chalk.gray(t('doctor.summary', { pass: passCount, warn: warnCount, fail: failCount })));

  if (warnCount > 0 || failCount > 0) {
    console.log('');
    console.log(chalk.yellow(t('doctor.tips')));
    if (!process.env.OPENAI_API_KEY) {
      console.log(chalk.gray(t('doctor.tipApiKey')));
    }
    if (!existsSync(projectConfig)) {
      console.log(chalk.gray(t('doctor.tipInit')));
    }
    console.log('');
  }
}
