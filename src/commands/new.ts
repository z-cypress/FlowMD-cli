/**
 * FlowMD new 命令
 * 从模板创建新的 Markdown 文档
 */

import { writeFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import { askQuestion, confirm } from '../utils/prompt.js';
import { t } from '../utils/i18n.js';
import { generateDocument } from '../core/generate.js';

const BASIC_TEMPLATE = `# {{title}}

## 概述

描述本文档的目的。

## AI 分析

\`\`\`ai {model: "gpt-4o", output: "summary"}
分析以下内容并提供见解：
{{content}}
\`\`\`

## 总结

{{summary}}

---
*由 FlowMD 于 {{date}} 生成*
`;

const DATA_TEMPLATE = `# 数据报告

## 数据收集

\`\`\`data {from: "default", output: "data"}
SELECT * FROM your_table LIMIT 10
\`\`\`

## AI 分析

\`\`\`ai {model: "gpt-4o", output: "analysis"}
分析以下数据并提供见解：
{{data}}
\`\`\`

## 报告

\`\`\`template
## 分析结果

日期：{{date}}

### 数据摘要
{{data}}

### AI 分析
{{analysis}}
\`\`\`

---
*由 FlowMD 于 {{date}} 生成*
`;

const REPORT_TEMPLATE = `# 周报

## 数据源

\`\`\`data {from: "default", output: "metrics"}
SELECT metric_name, metric_value FROM metrics WHERE date >= '{{week_start}}'
\`\`\`

## AI 摘要

\`\`\`ai {model: "gpt-4o", output: "summary"}
根据以下指标生成周报摘要：
{{metrics}}
\`\`\`

## 报告

\`\`\`template
# 周报 ({{week_range}})

## 关键指标
{{metrics}}

## 摘要
{{summary}}

---
生成日期：{{date}}
\`\`\`
`;

const MEETING_TEMPLATE = `# 会议纪要 - {{date}}

## 会议信息

- **主题**：{{topic}}
- **日期**：{{date}}

## 会议记录

\`\`\`ai {output: "summary"}
提取以下会议内容的关键要点：
{{content}}
\`\`\`

## 待办事项

\`\`\`ai {output: "action_items"}
从以下会议记录中提取待办事项，每个事项格式为"负责人：任务"：
{{summary}}
\`\`\`

## 整理

\`\`\`template
# 会议纪要

## 摘要
{{summary}}

## 待办事项
{{action_items}}
\`\`\`

{{summary}}

{{action_items}}
`;

const API_TEMPLATE = `# API 文档 - {{endpoint}}

## 接口描述

\`\`\`ai {output: "doc"}
为以下 API 端点生成文档：
端点：{{endpoint}}
方法：{{method}}
描述：{{description}}
\`\`\`

## 文档

\`\`\`template
# {{endpoint}}

{{doc}}
\`\`\`

{{doc}}
`;

const CHANGELOG_TEMPLATE = `# 更新日志 - {{date}}

## 变更内容

\`\`\`ai {output: "log"}
将以下变更整理为更新日志格式：
{{changes}}
\`\`\`

## 日志

\`\`\`template
## {{date}}

{{log}}
\`\`\`

{{log}}
`;

const RESEARCH_TEMPLATE = `# {{topic}} 调研报告

> 本模板使用 agent 块自主调研。\`browser\` 工具无需配置即可抓取网页；
> 如需搜索功能，配置 \`agent.searchEndpoint\`（见 docs/blocks/07-agent.md）。

## 自主调研

\`\`\`agent {goal: "调研 {{topic}}", tools: ["browser"], output: "research"}
围绕 {{topic}} 展开调研：
1. 浏览至少 2 个相关网页
2. 提取核心技术特点、优缺点、适用场景
3. 输出结构化 Markdown 报告（含来源链接）
\`\`\`

{{research}}

## 结论

\`\`\`ai {output: "conclusion"}
基于以下调研结果，用 3 句话总结结论与建议：
{{research}}
\`\`\`

{{conclusion}}

---
*由 FlowMD 于 {{date}} 生成*
`;

const ORCHESTRATE_TEMPLATE = `# 综合报告

> 跨文档编排模板：在 ./modules/ 下创建子文档（可含 agent 块），
> 运行 flowmd run 后由 doc 块隔离子文档执行并汇总。

## 市场模块

\`\`\`doc {path: "./modules/market.md", output: "market"}
\`\`\`

## 技术模块

\`\`\`doc {path: "./modules/tech.md", output: "tech"}
\`\`\`

## 汇总

\`\`\`template {output: "report"}
# 综合报告 ({{date}})

## 市场
{{market}}

## 技术
{{tech}}
\`\`\`

{{report}}

---
*由 FlowMD 于 {{date}} 生成*
`;

const TEMPLATE_DESC_KEYS: Record<string, string> = {
  basic: 'new.desc.basic',
  data: 'new.desc.data',
  report: 'new.desc.report',
  meeting: 'new.desc.meeting',
  api: 'new.desc.api',
  changelog: 'new.desc.changelog',
  research: 'new.desc.research',
  orchestrate: 'new.desc.orchestrate',
};

const TEMPLATES: Record<string, string> = {
  basic: BASIC_TEMPLATE,
  data: DATA_TEMPLATE,
  report: REPORT_TEMPLATE,
  meeting: MEETING_TEMPLATE,
  api: API_TEMPLATE,
  changelog: CHANGELOG_TEMPLATE,
  research: RESEARCH_TEMPLATE,
  orchestrate: ORCHESTRATE_TEMPLATE,
};

/** 用户模板目录（相对项目根） */
const USER_TEMPLATES_DIR = join('.flow', 'templates');

/**
 * 读取用户自定义模板（.flow/templates/*.md），文件名（去 .md）即模板名
 * @returns 模板名 → 内容
 */
export function getUserTemplates(): Record<string, string> {
  const dir = join(process.cwd(), USER_TEMPLATES_DIR);
  if (!existsSync(dir)) return {};
  const result: Record<string, string> = {};
  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith('.md')) continue;
    const name = entry.slice(0, -3);
    try {
      result[name] = readFileSync(join(dir, entry), 'utf-8');
    } catch {
      // 单个模板读取失败忽略
    }
  }
  return result;
}

/**
 * 获取完整模板目录（内置 + 用户，用户同名覆盖内置）
 * @returns 模板名 → 内容
 */
export function getTemplateCatalog(): Record<string, string> {
  return { ...TEMPLATES, ...getUserTemplates() };
}

/** 可用模板名列表（内置 + 用户，供 serve GET /templates 使用） */
export function getTemplateNames(): string[] {
  return Object.keys(getTemplateCatalog());
}

/** 模板名 → 内容（内置 + 用户，供 serve GET /templates 返回模板内容） */
export function getTemplatesContent(): Record<string, string> {
  return getTemplateCatalog();
}

/**
 * 执行 new 命令
 * @param name - 文档名称
 * @param opts - 选项：template, list, force, ai
 */
export async function newCommand(
  name: string | undefined,
  opts: { template?: string; list?: boolean; force?: boolean; ai?: string } = {}
): Promise<void> {
  // --list 模式：列出可用模板（内置 + 用户）
  if (opts.list) {
    console.log(chalk.blue(t('new.templatesTitle')));
    const catalog = getTemplateCatalog();
    const userNames = new Set(Object.keys(getUserTemplates()));
    for (const key of Object.keys(catalog)) {
      const descKey = TEMPLATE_DESC_KEYS[key];
      const desc = descKey ? t(descKey) : '';
      const source = userNames.has(key) ? t('new.sourceUser') : t('new.sourceBuiltin');
      console.log(chalk.gray(`  ${key.padEnd(12)} ${desc} ${source}`));
    }
    console.log('');
    console.log(chalk.gray(t('new.templatesUsage')));
    return;
  }

  if (!name) {
    console.error(chalk.red(t('new.needName')));
    return;
  }

  const filename = name.endsWith('.md') ? name : `${name}.md`;
  const filepath = join(process.cwd(), filename);

  // 检查文件是否已存在
  if (existsSync(filepath)) {
    if (opts.force) {
      console.log(chalk.yellow(t('new.overwrite', { file: filename })));
    } else {
      const confirmed = await confirm(t('new.confirmOverwrite', { file: filename }));
      if (!confirmed) {
        console.log(chalk.yellow(t('common.cancelled')));
        return;
      }
    }
  }

  let content: string;

  // --ai 模式：根据自然语言描述生成文档
  if (opts.ai) {
    console.log(chalk.cyan(t('new.aiRunning')));
    try {
      content = await generateDocument(opts.ai);
    } catch (error) {
      console.error(chalk.red(t('new.aiFailed', { error: error instanceof Error ? error.message : String(error) })));
      return;
    }
  } else {
    // 选择模板类型（内置 + 用户目录）
    let templateType = opts.template;
    if (!templateType) {
      templateType = await askQuestion(t('new.chooseTemplate'));
    }
    const template = getTemplateCatalog()[templateType] || getTemplateCatalog().basic;

    // 替换占位符
    const date = new Date().toISOString().split('T')[0];
    content = template
      .replace(/\{\{title\}\}/g, name.replace(/\.md$/, ''))
      .replace(/\{\{date\}\}/g, date)
      .replace(/\{\{content\}\}/g, t('new.contentPlaceholder'))
      .replace(/\{\{week_start\}\}/g, getWeekStart())
      .replace(/\{\{week_range\}\}/g, getWeekRange());
  }

  try {
    writeFileSync(filepath, content, 'utf-8');
    console.log(chalk.green(t('new.created', { file: filename })));
    console.log('');
    console.log(chalk.blue(t('init.nextSteps')));
    console.log(chalk.gray(t('new.step1', { file: filename })));
    console.log(chalk.gray(t('new.step2', { file: filename })));
    console.log(chalk.gray(t('new.step3', { file: filename })));
  } catch (error) {
    console.error(chalk.red(t('cli.newFailed', { error: error instanceof Error ? error.message : String(error) })));
  }
}

/**
 * 获取当前周的开始日期（周一）
 * @returns 周一日期字符串
 */
function getWeekStart(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now);
  monday.setDate(diff);
  return monday.toISOString().split('T')[0];
}

/**
 * 获取当前周的日期范围（周一至周日）
 * @returns 周日期范围字符串
 */
function getWeekRange(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now);
  monday.setDate(diff);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return `${monday.toISOString().split('T')[0]} ~ ${sunday.toISOString().split('T')[0]}`;
}
