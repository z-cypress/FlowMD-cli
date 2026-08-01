/**
 * FlowMD 日志工具
 * 提供一致的终端输出，带颜色和格式化
 */

import chalk from 'chalk';
import ora, { type Ora } from 'ora';
import { t } from './i18n.js';

/** 日志级别类型 */
export type LogLevel = 'info' | 'success' | 'warning' | 'error';

/**
 * 创建加载动画实例
 * @param text - 初始文本
 * @returns Ora 加载动画实例
 */
export function createSpinner(text: string): Ora {
  return ora({
    text,
    color: 'cyan',
  });
}

/**
 * 带前缀记录日志
 * @param level - 日志级别
 * @param message - 日志消息
 */
export function log(level: LogLevel, message: string): void {
  const prefixes: Record<LogLevel, string> = {
    info: chalk.blue('ℹ'),
    success: chalk.green('✓'),
    warning: chalk.yellow('⚠'),
    error: chalk.red('✗'),
  };

  console.log(`${prefixes[level]} ${message}`);
}

/**
 * 记录标题
 * @param text - 标题文本
 */
export function logHeader(text: string): void {
  console.log('');
  console.log(chalk.bold.blue(text));
  console.log(chalk.gray('─'.repeat(text.length)));
}

/**
 * 记录分隔线
 */
export function logSeparator(): void {
  console.log(chalk.gray('─'.repeat(40)));
}

/**
 * 记录文件信息
 * @param filename - 文件名
 * @param blocks - 找到的块数量
 */
export function logFileInfo(filename: string, blocks: number): void {
  console.log(chalk.gray(t('logger.file', { file: filename })));
  console.log(chalk.gray(t('logger.foundBlocks', { count: blocks })));
}

/**
 * 记录块执行进度
 * @param current - 当前块编号（1-based）
 * @param total - 总块数
 * @param type - 块类型
 */
export function logBlockProgress(current: number, total: number, type: string): void {
  const emoji = getBlockEmoji(type);
  console.log(t('logger.blockProgress', { emoji, current, total, type }));
}

/**
 * 获取块类型对应的 emoji
 * @param type - 块类型
 * @returns emoji 图标
 */
function getBlockEmoji(type: string): string {
  const emojis: Record<string, string> = {
    ai: '🤖',
    data: '🗄️',
    template: '🎨',
  };
  return emojis[type] || '📦';
}

/**
 * 记录错误信息和建议
 * @param message - 错误消息
 * @param suggestion - 可选的建议
 */
export function logError(message: string, suggestion?: string): void {
  console.error(chalk.red(t('logger.error', { message })));
  if (suggestion) {
    console.error(chalk.yellow(t('logger.suggestion', { suggestion })));
  }
  console.error(chalk.gray(t('logger.doctor')));
}

/**
 * 记录成功消息
 * @param message - 成功消息
 */
export function logSuccess(message: string): void {
  console.log(chalk.green(`✅ ${message}`));
}

/**
 * 记录信息消息
 * @param message - 信息消息
 */
export function logInfo(message: string): void {
  console.log(chalk.blue(`ℹ ${message}`));
}
