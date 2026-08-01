 # FlowMD 文档

 > **版本**: 0.3.1 | **许可证**: MIT
 >
 > FlowMD 是一个 CLI 工具，用于执行 Markdown 文件中的特殊代码块。它支持调用 AI（LLM）、查询数据库、渲染模板，并将结果填充回文档。

 ---

 ## 快速导航

 **开始使用**

 - [安装与入门](01-getting-started.md) — 5 分钟跑通第一个文档
 - [配置指南](02-configuration.md) — 配置 AI 提供商、数据源、模型预设和环境变量

 **核心功能**

 - [AI 块](blocks/01-ai.md) — 调用大语言模型（OpenAI / Anthropic）
 - [数据块](blocks/02-data.md) — 查询 SQLite / MySQL / PostgreSQL 数据库（只读）
 - [模板块](blocks/03-template.md) — 用 Handlebars 渲染输出
 - [run 块](blocks/04-run.md) — 在沙箱中执行脚本代码（js / python）
 - [控制流](blocks/05-control.md) — if / elif / else / for 条件与循环
 - [include 指令](blocks/06-include.md) — 引入外部文档与变量文件

 **参考与示例**

 - [完整示例](03-examples.md) — 从简单到复杂的实际用例
 - [HTTP API 与定时任务](05-api-and-scheduling.md) — serve / schedule
 - [常见问题](04-faq.md) — 安装、配置、使用中的问题排查

 ---

 ## 项目状态

 当前为 **MVP 阶段**，已实现：

 - `flowmd run` 及 `--var`/`--var-file` 变量注入
 - `flowmd watch` 支持 `-o`、`-s`、`--debug`、`--release`
 - `flowmd init` / `flowmd new` / `flowmd config` / `flowmd doctor`
 - `flowmd history` 查看执行历史（`--detail` / `--clear`）
 - `flowmd serve` 本地 HTTP API（`/execute` `/templates` `/health`）
 - `flowmd schedule` 定时任务（cron 触发）
 - AI 块支持 OpenAI、Anthropic 及命名模型预设
 - 数据块支持 SQLite / MySQL / PostgreSQL（只读查询）
 - 模板块支持 Handlebars 及 `{{json}}` helper
 - run 块支持 js（isolated-vm 沙箱）与 python（子进程），含首次确认与资源限制
 - 控制流：`<!-- if/elif/else/endif -->` 条件分支与 `<!-- for/endfor -->` 循环（含 collect 累积）
 - 系统变量：`{{date}}`、`{{datetime}}`、`{{timestamp}}`、`{{execution_time}}`
 - 执行模式：试运行、逐步、失败即停、debug、release
 - 错误恢复：依赖跳过、错误分组汇总、退出码 0/1/2
 - 中英文双语输出（`cli.lang` 或 `LANG` 环境变量切换）
 - 英文文档（[English docs](en/00-index.md)）


 ---

 [返回顶部](#flowmd-文档)
