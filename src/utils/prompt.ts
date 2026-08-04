/**
 * FlowMD 交互式提示工具
 * 提供统一的用户输入接口
 */

import { createInterface } from 'node:readline';

/** 列表选择项 */
export interface SelectOption {
  /** 显示名称 */
  label: string;
  /** 返回的值（默认为 label） */
  value?: string;
  /** 可选描述（第二行灰色显示） */
  description?: string;
}

/**
 * 向用户提问并返回答案
 * @param question - 问题文本
 * @returns 用户输入的答案
 */
export function askQuestion(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/**
 * 确认操作（y/N）
 * @param message - 确认消息
 * @returns 用户是否确认
 */
export async function confirm(message: string): Promise<boolean> {
  const answer = await askQuestion(`${message} (y/N) `);
  return answer.toLowerCase() === 'y';
}

/** ANSI 转义序列 */
const ESC = '\x1b';
const HIDE_CURSOR = `${ESC}[?25l`;
const SHOW_CURSOR = `${ESC}[?25h`;

/**
 * 交互式列表选择（方向键 ↑/↓ + Enter）
 * 非 TTY 环境（管道/测试）自动回退到 askQuestion 文本输入
 * @param question - 提示文本
 * @param options - 选项列表
 * @returns 选中项的 value
 */
export async function selectFromList(question: string, options: SelectOption[]): Promise<string> {
  if (options.length === 0) return '';
  if (options.length === 1) return options[0].value ?? options[0].label;

  // 非 TTY：回退到逗号分隔的文本输入
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    const prompt = `${question} [${options.map((o) => o.label).join('/')}] `;
    const answer = await askQuestion(prompt);
    const match = options.find((o) => o.label === answer.trim() || (o.value ?? o.label) === answer.trim());
    return match ? (match.value ?? match.label) : (options[0].value ?? options[0].label);
  }

  return new Promise<string>((resolve, reject) => {
    let index = 0;
    let printedLines = 0;

    const render = (): void => {
      // 上移并清除已渲染的行，然后重绘
      if (printedLines > 0) {
        process.stdout.write(`${ESC}[${printedLines}A`);
      }
      const lines: string[] = [];
      for (let i = 0; i < options.length; i++) {
        const prefix = i === index ? '> ' : '  ';
        const label = i === index ? `${ESC}[36m${options[i].label}${ESC}[0m` : options[i].label;
        lines.push(`\r${prefix}${label}`);
        if (options[i].description) {
          lines.push(`\r   ${ESC}[90m${options[i].description}${ESC}[0m`);
        }
      }
      const block = lines.join('\n');
      process.stdout.write(block);
      printedLines = lines.length;
    };

    const cleanup = (): void => {
      process.stdin.setRawMode(false);
      process.stdin.removeListener('data', onData);
      process.stdout.write(SHOW_CURSOR);
      // 光标移到列表末尾，避免残留
      if (printedLines > 0) {
        process.stdout.write(`${ESC}[${printedLines}A${ESC}[0J`);
      }
    };

    const finish = (value: string): void => {
      cleanup();
      process.stdout.write('\n');
      resolve(value);
    };

    const onData = (data: Buffer): void => {
      const key = data.toString();
      if (key === '\x1b[A') {
        index = (index - 1 + options.length) % options.length;
        render();
      } else if (key === '\x1b[B') {
        index = (index + 1) % options.length;
        render();
      } else if (key === '\r' || key === '\n') {
        finish(options[index].value ?? options[index].label);
      } else if (key === '\x03') {
        cleanup();
        reject(new Error('cancelled'));
      }
    };

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', onData);
    process.stdout.write(`${HIDE_CURSOR}\r${question}\n`);
    render();
  });
}
