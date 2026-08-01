/**
 * FlowMD history 命令
 * 查看执行历史：列表、详情、清空
 */

import chalk from 'chalk';
import { listHistory, getHistoryDetail, clearHistory } from '../utils/history.js';
import { t } from '../utils/i18n.js';

/** 状态文案映射 */
function statusLabel(status: 'success' | 'partial' | 'failed'): string {
  return t(`history.status.${status}`);
}

/**
 * 列出最近历史记录
 */
export function historyList(): void {
  const records = listHistory();
  if (records.length === 0) {
    console.log(chalk.gray(t('history.empty')));
    return;
  }
  console.log(chalk.blue(t('history.title')));
  for (const r of records) {
    console.log(
      chalk.gray(t('history.item', {
        id: r.id,
        file: r.file,
        status: statusLabel(r.status),
        success: r.success_blocks,
        total: r.total_blocks,
      }))
    );
  }
}

/**
 * 查看单条记录详情
 * @param idStr - 记录 ID（字符串，来自 CLI）
 */
export function historyDetail(idStr: string): void {
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) {
    console.error(chalk.red(t('history.invalidId', { id: idStr })));
    process.exitCode = 1;
    return;
  }
  const record = getHistoryDetail(id);
  if (!record) {
    console.error(chalk.red(t('history.invalidId', { id: idStr })));
    process.exitCode = 1;
    return;
  }
  const duration = (record.duration_ms / 1000).toFixed(1);
  console.log(chalk.blue(t('history.detailTitle', { id: record.id })));
  console.log(chalk.gray(t('history.detailFile', { file: record.file })));
  console.log(chalk.gray(t('history.detailTime', { timestamp: record.timestamp })));
  console.log(chalk.gray(t('history.detailDuration', { duration })));
  console.log(chalk.gray(t('history.detailBlocks', {
    success: record.success_blocks,
    total: record.total_blocks,
    failed: record.failed_blocks,
  })));
  console.log('');
  for (const b of record.blocks || []) {
    const label = b.status === 'success' ? chalk.green('✓') : chalk.red('✗');
    console.log(`${label} ${chalk.gray(t('history.blockItem', { position: b.position, type: b.type, status: b.status }))}`);
    if (b.error) {
      console.log(chalk.gray(t('history.blockError', { error: b.error })));
    }
  }
}

/**
 * 清空执行历史
 */
export function historyClear(): void {
  clearHistory();
  console.log(chalk.green(t('history.cleared')));
}

/**
 * history 命令入口
 * @param opts - 选项：detail, clear
 */
export async function historyCommand(opts: { detail?: string; clear?: boolean }): Promise<void> {
  if (opts.clear) {
    historyClear();
  } else if (opts.detail) {
    historyDetail(opts.detail);
  } else {
    historyList();
  }
}
