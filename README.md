 # FlowMD-cli

 把 Markdown 变成可执行文件——用写文档的方式驱动 AI 工作流。

 [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
 [![Node.js Version](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)

 ## 安装

 ```bash
 git clone https://github.com/z-cypress/FlowMD-cli.git
 cd FlowMD-cli
 pnpm install
 pnpm build
 npm install -g @z-cypress/flow-md
npm install -g .  # 开发模式
 ```

 ## 配置

 配置文件 `.flow/config.yml`（通过 `flowmd init` 创建）：

 ```yaml
 # .flow/config.yml
 llm:
   provider: openai            # openai | anthropic
   model: deepseek-v4-flash        # 默认模型
   temperature: 0.7
   apiKey: ""                  # API Key（环境变量优先级更高）
   baseURL: https://api.deepseek.com  # 兼容 API 地址

 dataSources:
   default:
     type: sqlite
     filename: ./data.db

 execution:
   timeout: 30
 ```

 支持的 AI 提供商：

 | 提供商 | `provider` 值 | API Key |
 |--------|--------------|---------|
 | OpenAI | `openai` | `OPENAI_API_KEY` |
 | Anthropic | `anthropic` | `ANTHROPIC_API_KEY` |
 | DeepSeek 等兼容 API | `openai` + `baseURL` | `OPENAI_API_KEY` |
 | 多模型预设 | 配置 `llm.models` | 各提供商对应环境变量 |

 API Key 可写在配置文件里，也可通过环境变量设置（环境变量优先级更高）：

 ```bash
 # provider 为 openai 时，代码读取 OPENAI_API_KEY
export OPENAI_API_KEY="sk-xxxxxxxx"
 ```

 支持的数据库：**SQLite、MySQL、PostgreSQL**（只读查询）。详见 [配置文档](docs/02-configuration.md)。

 ## 快速开始

 ```bash
 flowmd init
 flowmd new hello
 flowmd run hello.md --output stdout
 ```

 文档正文中的 `{{变量}}` 会被自动替换为执行结果。

 ### 模板

 内置模板（`flowmd new -l` 查看）：

 - **basic / data / report / meeting / api / changelog** — 通用模板
 - **research** — agent 自主调研模板（`agent` 块 + `browser` 工具）
 - **orchestrate** — 跨文档编排模板（`doc` 块汇总多个子文档）

 用户自定义模板：把 `.md` 文件放入项目的 `.flow/templates/` 目录即可，
 `flowmd new <name> -t <模板名>` 使用，`-l` 列表会标注来源（内置/用户）。

 ## 使用示例

 ### 调用 AI

 ````markdown
 # hello.md
 ```ai {output: "summary"}
 用一句话总结远程办公的趋势
 ```

 总结：{{summary}}
 ````

 ```bash
 flowmd run hello.md --output stdout
 ```

 ### 查询数据库

 ````markdown
 # report.md
 ```data {from: "default", output: "users"}
 SELECT name, email FROM users LIMIT 5
 ```

 共 {{users.length}} 个用户。
 ````

 ```bash
 flowmd run report.md -o new
 ```

 ### 模板排版

 ````markdown
 # template.md
 ```template
 | 姓名 | 邮箱 |
 |------|------|
 {{#each users}}
 | {{name}} | {{email}} |
 {{/each}}
 ```
 ````

 ```bash
 flowmd run template.md
 ```

 ### 组合工作流

 ````markdown
 # sales-report.md
 ## 数据
 ```data {output: "orders"}
 SELECT product, revenue FROM sales ORDER BY revenue DESC
 ```

 ## AI 分析
 ```ai {output: "insight"}
 分析销售数据：{{orders}}
 ```

 ## 报告
 ```template
 | 产品 | 收入 |
 |------|------|
 {{#each orders}}
 | {{product}} | ¥{{revenue}} |
 {{/each}}

 {{insight}}
 ```
 ````

 ```bash
 flowmd run sales-report.md
 ```

 ## run 块：在沙箱中执行脚本

 ```run {runtime: "python", vars: ["orders"], output: "summary"}
 import json, sys
 data = json.load(sys.stdin)["orders"]
 print(json.dumps({"count": len(data), "total": sum(x["revenue"] for x in data)}))
 ```

 - **js**：isolated-vm 强隔离沙箱，零能力默认（无文件系统/网络/进程 API）
 - **python**：子进程 + 资源限制（需系统安装 `python3`）
 - 首次执行需确认，同意后按 runtime 记忆（`--yes` 跳过，`--strict` 强制确认）
 - 变量通过 `vars` 显式声明传入，stdout 为 JSON 时结构化存入变量

  各块的详细说明见 [docs/blocks/](docs/blocks/)。

## 控制流：条件与循环

用 HTML 注释指令包裹正文与代码块，实现条件分支和循环执行：

````markdown
# 销售报告
```data {output: "orders"}
SELECT product, revenue FROM sales ORDER BY revenue DESC
```

<!-- if: {{total_revenue}} > 10000 -->
业绩达标 🎉
<!-- else -->
业绩未达标，需要关注。
<!-- endif -->

<!-- for: item in orders -->
| {{item.product}} | ¥{{item.revenue}} |
<!-- endfor -->
````

- `<!-- if/elif/else/endif -->` 条件分支，`<!-- for/endfor -->` 循环
- 循环体内代码块每轮重新执行，正文每轮重复渲染
- `{collect: "NAME"}` 把循环体内产出变量累积为数组，循环外聚合使用
- 条件支持比较（`==` `>` 等）、布尔逻辑（`&&` `||` `!`），未定义变量视为假

详见 [控制流文档](docs/blocks/05-control.md)。

## agent 块：文档即智能体

`agent` 块让文档驱动 LLM 自主规划多步任务（思考 → 工具 → 观察 → 迭代），
把"文档即脚本"升级为"文档即智能体"（v2.0）：

````markdown
```agent {goal: "汇总销售数据", tools: ["code_execution", "file_read"], output: "summary"}
读取 data/ 下的销售文件，用 code_execution 计算总营收，输出一段中文摘要。
```

{{summary}}
````

- 内置 ReAct 循环（openai / anthropic），`goal` 必填，`max_steps` / `timeout` 护栏
- 工具白名单：`code_execution`（沙箱执行）、`file_read`（项目内只读，防越界）
- 首次执行弹确认并按（goal + 工具集）记忆，拒绝则块失败
- `--debug` 输出步骤轨迹，`flowmd history` 记录轨迹摘要

详见 [agent 块文档](docs/blocks/07-agent.md)。

## doc 块：跨文档协作

`doc` 块在隔离上下文中执行另一份 `.flow.md` 子文档，并把渲染结果与产出变量回传，
实现跨文档 agent 协作与多文档编排（v2.1）：

````markdown
```doc {path: "./agents/analyze.md", input: ["topic"], output: "analysis"}
```

## 结论

{{analysis.conclusion}}
````

- 子文档隔离执行（只看到系统变量 + `input` 声明的输入），能力完整（含 agent 块）
- 回传：`{{output}}` = 子文档渲染内容，`{{output.<变量>}}` = 子文档产出变量
- 循环引用检测（与 include 共享）、子文档失败冒泡

详见 [doc 块文档](docs/blocks/08-doc.md)。

## 执行模式

 默认执行时，每个块按文档顺序依次执行，结果存入变量上下文，文档正文中的 `{{变量}}` 被自动替换。

 | 模式 | 命令 | 效果 |
 |------|------|------|
 | 默认 | `flowmd run file.md` | 执行所有块，变量替换后输出文档 |
 | Debug | `flowmd run file.md --debug` | 在输出文档中，每个代码块下方插入执行结果 |
 | Release | `flowmd run file.md --release` | 执行后移除所有指令块，仅保留渲染结果 |
 | 试运行 | `flowmd run file.md -d` | 只解析不执行，查看变量依赖 |
 | 逐步 | `flowmd run file.md -s` | 每个块执行前暂停，按 Enter 继续 |
 | 失败即停 | `flowmd run file.md -f` | 遇到第一个错误立即停止 |

 输出模式通过 `-o` 指定：

 | 输出模式 | 命令 | 说明 |
 |----------|------|------|
 | 新文件（默认） | `flowmd run file.md` | 生成 `file_日期.md` |
 | 覆盖原文件 | `flowmd run file.md -o inline` | 直接覆盖 |
 | 终端输出 | `flowmd run file.md -o stdout` | 打印到终端 |

 ## 命令参考

 | 命令 | 说明 |
 |------|------|
 | `flowmd run <file>` | 执行文档，见上方执行模式和输出模式 |
 | `flowmd run <file> --var key=value` | 注入变量（可多次使用） |
 | `flowmd run <file> --var-file vars.yml` | 从 YAML/JSON 文件注入变量 |
 | `flowmd watch <file> -o stdout` | 监听文件变化，支持 -o 指定输出模式 |
 | `flowmd init` | 创建 `.flow/` 配置目录 |
 | `flowmd new <name>` | 从模板创建文档（basic/data/report/meeting/api/changelog/research/orchestrate 或用户模板） |
 | `flowmd new <name> --ai "描述"` | 用 LLM 根据描述生成文档（自然语言生成） |
 | `flowmd pipeline a.md b.md` | 按序执行多个文档，变量跨文档串联 |
 | `flowmd config` | 查看当前配置 |
 | `flowmd config llm.model --set deepseek-chat` | 设置配置项 |
 | `flowmd doctor` | 环境诊断 |
 | `flowmd history` | 查看执行历史（`--detail` / `--clear`） |
 | `flowmd serve` | 启动本地 HTTP API（`POST /execute` / `GET /templates` / `GET /health`） |
 | `flowmd schedule add <name> <file> --cron "0 17 * * 5"` | 添加定时任务 |
 | `flowmd schedule list / remove / pause / resume / run` | 定时任务管理 |
 | `flowmd schedule` | 前台守护运行定时任务 |

## HTTP API（flowmd serve）

```bash
flowmd serve --port 5199
```

浏览器打开 `http://127.0.0.1:5199/` 即得内置 **Web IDE**（编辑 + 执行预览 + 模板选择）。

| 端点 | 方法 | 说明 |
|------|------|------|
| `/` | GET | Web IDE 单页 |
| `/execute` | POST | 执行 Markdown，body 传 `{markdown, vars?, release?, debug?, quiet?}`，返回 `{content, hasError}` |
| `/templates` | GET | 列出可用模板（含内容） |
| `/health` | GET | 健康检查 |

## 定时任务（flowmd schedule）

```bash
flowmd schedule add weekly-report ./report.md --cron "0 17 * * 5"
flowmd schedule run weekly-report   # 立即执行一次
flowmd schedule                    # 前台守护，按 cron 触发
```

任务持久化在 `.flow/schedule.db`，触发时执行文档并写入执行历史。

完整文档见 [docs/](docs/00-index.md)。

 ## 开发

 ```bash
 pnpm install
 pnpm dev -- run doc.md   # 开发模式
 pnpm test                # 运行测试
 pnpm build               # 构建
 ```

 ## 项目状态

 **MVP 阶段**。已实现：run/watch/init/new/config/doctor/history/serve/schedule 命令、AI 块（OpenAI + Anthropic + 模型预设）、数据块（SQLite/MySQL/PostgreSQL）、模板块（Handlebars + json helper）、run 块（js/python 沙箱）、控制流（if/elif/else/for + collect）、agent 块（文档即智能体，ReAct 多步任务）、doc 块（跨文档协作）、变量上下文、--var/--var-file（含 .env）、试运行/逐步/失败即停/debug/release 模式、HTTP API、定时任务。

 **规划中**：VS Code 扩展、模板市场、Web IDE。

 ## 许可证

 MIT
