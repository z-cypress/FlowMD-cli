/**
 * FlowMD new 命令
 * 从模板创建新的 Markdown 文档
 */

import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import { askQuestion, confirm } from '../utils/prompt.js';

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

const TEMPLATE_DESCS: Record<string, string> = {
  basic: '基础 AI 模板',
  data: '数据报告模板',
  report: '周报模板',
  meeting: '会议纪要模板',
  api: 'API 文档模板',
  changelog: '更新日志模板',
};

const TEMPLATES: Record<string, string> = {
  basic: BASIC_TEMPLATE,
  data: DATA_TEMPLATE,
  report: REPORT_TEMPLATE,
  meeting: MEETING_TEMPLATE,
  api: API_TEMPLATE,
  changelog: CHANGELOG_TEMPLATE,
};

/**
 * 执行 new 命令
 * @param name - 文档名称
 * @param opts - 选项：template, list, force
 */
export async function newCommand(name: string, opts: { template?: string; list?: boolean; force?: boolean } = {}): Promise<void> {
  // --list 模式：列出可用模板
  if (opts.list) {
    console.log(chalk.blue('\n可用模板：\n'));
    for (const [key, _value] of Object.entries(TEMPLATES)) {
      const desc = TEMPLATE_DESCS[key] || '';
      console.log(chalk.gray(`  ${key.padEnd(12)} ${desc}`));
    }
    console.log('');
    console.log(chalk.gray('使用: flowmd new <name> --template <模板名>'));
    return;
  }

  const filename = name.endsWith('.md') ? name : `${name}.md`;
  const filepath = join(process.cwd(), filename);

  // 检查文件是否已存在
  if (existsSync(filepath)) {
    if (opts.force) {
      console.log(chalk.yellow(`⚠ 覆盖已有文件: ${filename}`));
    } else {
      const confirmed = await confirm(`文件 ${filename} 已存在，是否覆盖？`);
      if (!confirmed) {
        console.log(chalk.yellow('⚠ 已取消'));
        return;
      }
    }
  }

  // 选择模板类型
  let templateType = opts.template;
  if (!templateType) {
    templateType = await askQuestion('选择模板 (basic/data/report/meeting/api/changelog) [basic]: ');
  }
  const template = TEMPLATES[templateType] || TEMPLATES.basic;

  // 替换占位符
  const date = new Date().toISOString().split('T')[0];
  const content = template
    .replace(/\{\{title\}\}/g, name.replace(/\.md$/, ''))
    .replace(/\{\{date\}\}/g, date)
    .replace(/\{\{content\}\}/g, '在此输入你的内容')
    .replace(/\{\{week_start\}\}/g, getWeekStart())
    .replace(/\{\{week_range\}\}/g, getWeekRange());

  try {
    writeFileSync(filepath, content, 'utf-8');
    console.log(chalk.green(`✅ 已创建: ${filename}`));
    console.log('');
    console.log(chalk.blue('📝 下一步:'));
    console.log(chalk.gray(`  1. 编辑 ${filename} 添加你的内容`));
    console.log(chalk.gray(`  2. 运行 flow run ${filename} 执行`));
    console.log(chalk.gray(`  3. 或运行 flow watch ${filename} 监听变化`));
  } catch (error) {
    console.error(chalk.red(`❌ 创建失败: ${error instanceof Error ? error.message : String(error)}`));
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
