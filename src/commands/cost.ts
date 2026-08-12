/**
 * FlowMD cost 命令
 * 按天/文件聚合显示 token 用量和估算费用
 */

import chalk from 'chalk';
import { queryCostData } from '../utils/history.js';
import { t } from '../utils/i18n.js';

/** 默认估算费率（美元/百万 token，以 gpt-4o 为基准） */
const DEFAULT_PRICING = { input: 2.5, output: 10 };

/**
 * 格式化数字为千位分隔符
 * @param n - 数字
 * @returns 格式化后的字符串
 */
function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

/**
 * 估算费用（美元）
 * @param tokensIn - 输入 token 数
 * @param tokensOut - 输出 token 数
 * @returns 估算费用字符串
 */
function estimateCost(tokensIn: number, tokensOut: number): string {
  const cost = (tokensIn * DEFAULT_PRICING.input + tokensOut * DEFAULT_PRICING.output) / 1_000_000;
  return `$${cost.toFixed(2)}`;
}

/**
 * cost 命令入口
 * @param opts - 选项：days, file
 */
export async function costCommand(opts: { days?: string; file?: string }): Promise<void> {
  const days = opts.days ? parseInt(opts.days, 10) : 7;
  if (!Number.isInteger(days) || days <= 0) {
    console.error(chalk.red(t('cost.invalidDays', { days: opts.days ?? '' })));
    process.exitCode = 1;
    return;
  }

  const rows = queryCostData(days, opts.file);
  if (rows.length === 0) {
    console.log(chalk.gray(t('cost.empty', { days })));
    return;
  }

  // 表头
  console.log(chalk.blue(t('cost.title', { days })));
  console.log('');
  console.log(chalk.gray('Date       File                        Blocks  Tokens(in)  Tokens(out)  Est. Cost'));
  console.log(chalk.gray('─'.repeat(75)));

  let totalTokensIn = 0;
  let totalTokensOut = 0;

  for (const row of rows) {
    totalTokensIn += row.tokens_in;
    totalTokensOut += row.tokens_out;

    const fileDisplay = row.file.length > 25
      ? '...' + row.file.slice(-22)
      : row.file.padEnd(25);

    console.log(
      `${row.date}   ${fileDisplay}  ${String(row.blocks).padStart(6)}  ${formatNumber(row.tokens_in).padStart(10)}  ${formatNumber(row.tokens_out).padStart(11)}  ${estimateCost(row.tokens_in, row.tokens_out)}`
    );
  }

  // 汇总行
  console.log(chalk.gray('─'.repeat(75)));
  const totalCost = estimateCost(totalTokensIn, totalTokensOut);
  const summary = [
    ' '.repeat(9),
    'Total',
    ' '.repeat(20),
    ' '.repeat(6),
    formatNumber(totalTokensIn).padStart(10),
    formatNumber(totalTokensOut).padStart(11),
    totalCost,
  ].join('  ');
  console.log(chalk.bold(summary));
}
