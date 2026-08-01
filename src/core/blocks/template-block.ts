/**
 * FlowMD 模板块执行器
 * 使用上下文变量渲染 Handlebars 模板
 */

import Handlebars from 'handlebars';
import type { ExecutionContext } from '../context.js';
import type { BlockResult } from '../../types/index.js';
import { t } from '../../utils/i18n.js';

/** 注册 Handlebars json helper：将变量序列化为格式化 JSON */
Handlebars.registerHelper('json', function (value: unknown) {
  let text: string;
  if (value === null || value === undefined) {
    text = '';
  } else if (typeof value === 'string') {
    try { text = JSON.stringify(JSON.parse(value), null, 2); }
    catch { text = value; }
  } else {
    text = JSON.stringify(value, null, 2);
  }
  return new Handlebars.SafeString(text);
});

/** 模板块配置 */
interface TemplateBlockConfig {
  /** 输出变量名（可选） */
  output?: string;
}

/**
 * 执行模板块，渲染 Handlebars 模板
 * @param content - Handlebars 模板内容
 * @param config - 块级配置
 * @param context - 变量上下文，用于渲染
 * @returns 块执行结果
 */
export async function executeTemplateBlock(
  content: string,
  config: TemplateBlockConfig,
  context: ExecutionContext
): Promise<BlockResult> {
  const startTime = Date.now();

  try {
    // 获取上下文中的所有变量
    const contextData = context.dump();

    // 编译并渲染模板
    const template = Handlebars.compile(content);
    const rendered = template(contextData);

    // 如果指定了输出变量名，将结果存入上下文
    if (config.output) {
      context.set(config.output, rendered);
    }

    return {
      success: true,
      output: rendered,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      output: null,
      error: getErrorMessage(error),
      duration: Date.now() - startTime,
    };
  }
}

/**
 * 获取用户友好的错误信息
 * @param error - 错误对象
 * @returns 友好的错误信息
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message;

    // Handlebars 特定错误
    if (message.includes('Handlebars') || message.includes('template')) {
      return t('error.template.handlebars', { error: message });
    }

    return message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return t('error.unknown');
}
