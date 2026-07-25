/**
 * FlowMD 交互式提示工具
 * 提供统一的用户输入接口
 */

import { createInterface } from 'node:readline';

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
