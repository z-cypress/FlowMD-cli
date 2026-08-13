---
name: flowmd
description: "使用 FlowMD 执行 Markdown 中的可执行代码块（AI 调用、数据库查询、模板渲染、沙箱脚本、自主 agent 任务）。当需要运行 .md 文档、生成/校验可执行文档、查询 LLM 或聚合执行结果时使用。"
---

# FlowMD — Markdown 驱动的可执行文档引擎

FlowMD 是一个 CLI 工具：`.md` 文件里的特殊代码块会被顺序执行，`{{变量}}` 被结果替换后输出渲染文档。适合把"调研 → 分析 → 报告"写成一份文档并一键执行。

## 使用前置：检查安装

调用 flowmd 前，先确认已全局安装：

```bash
flowmd --version
```

**如果命令不存在（未安装）**：

1. **先询问用户**是否安装 FlowMD（不要擅自安装）
2. 用户确认后自动安装：
   ```bash
   npm install -g @z-cypress/flow-md
   ```
3. 安装后验证：`flowmd --version`
4. 若安装失败或用户拒绝，则中止任务并告知

> 一律使用全局 `flowmd` 命令。

## 何时使用

- 需要让一个可执行 Markdown 文档调用 LLM、查数据库、跑脚本、或执行自主 agent 任务
- 生成了 `.md` 文档，想验证其中的 `ai`/`data`/`template`/`run`/`agent` 块是否可运行
- 想批量（pipeline）串联执行多份文档，或对输出做快照回归测试
- 想了解某次执行的 token 成本 / 历史 / trace

## 核心命令速查

| 命令 | 用途 | 常用选项 |
|------|------|----------|
| `flowmd run <file>` | 执行文档并渲染输出 | `-o stdout\|inline\|new`、`--var k=v`（可多次）、`--var-file`、`--debug`、`--release`、`-f`、`--cache`、`--trace`、`--yes` |
| `flowmd pipeline <files...>` | 多文档按序执行，变量串联 | `--when "{{hasError}} == false"` 条件跳过、`--var`、`--cache`、`--trace` |
| `flowmd watch <file>` | 监听文件变化自动重执行 | `-o`、`--debug` |
| `flowmd validate <file>` | 只解析 + 预执行校验，不发 API 不连库 | `--var` |
| `flowmd new <name>` | 从模板创建文档 | `-t <template>`、`-l` 列出、`--ai "描述"` 用 LLM 生成 |
| `flowmd test <file>` | 快照回归测试 | `--update` 更新快照、`--vars-file` |
| `flowmd cost` | token 用量与估算费用 | `--days 7`、`--file <f>` |
| `flowmd history` | 执行历史 | `--detail <id>`、`--clear` |
| `flowmd init` | 创建 `.flow/` 配置 | — |
| `flowmd doctor` | 环境诊断（API Key、数据库） | — |
| `flowmd config [key]` | 查看/修改配置 | `--set <value>` |
| `flowmd serve` | 本地 HTTP API + Web IDE | `--port`、`--host` |
| `flowmd schedule` | 定时任务 / daemon | `add <n> <f> --cron`、`list`、`--daemon`、`--stop` |

> 全局选项：`--lang zh|en` 切换输出语言。

## 块类型参考

```markdown
# 一个可执行文档示例
```ai {output: "summary"}
用一句话总结 FlowMD
```

总结：{{summary}}
```

| 块 | 用途 | 关键 meta 参数 |
|----|------|----------------|
| `ai` | 调用 LLM | `model`, `output`, `temperature`, `max_tokens`, `stream: true`, `format: json/json-array`, `prompt: <库名>`, `conversation: <标签>`, `retry: N`, `validate: json/non-empty`, `deliver: webhook:URL/file:PATH` |
| `data` | 只读查询 SQLite/MySQL/PG | `from`, `output`（**恒返回数组**，单行也返回 `[row]`） |
| `template` | Handlebars 渲染 | `output` |
| `run` | 沙箱脚本 | `runtime: js/python`, `vars: [..]`, `output`, `timeout`, `memory`, `permissions` |
| `agent` | 自主多步任务（ReAct） | `goal`, `provider`, `adapter: chat/direct`, `tools: [..]`, `output`, `max_steps`, `timeout` |
| `include` | 内联 `.md`（展开执行）/ `.yaml`（导入变量） | `path` |
| `doc` | 隔离子文档执行 + 命名空间回传 | `path`, `input: [..]`, `output` |
| 插件 | 自定义块（`.flow/plugins/`） | `{ name, execute }` |

## 控制流（HTML 注释指令）

```markdown
<!-- if: {{score}} > 80 --> ... <!-- elif: ... --> <!-- else --> ... <!-- endif -->
<!-- for: item in orders {collect: "results"} --> ... <!-- endfor -->
<!-- parallel --> ... <!-- endparallel -->   <!-- 区内块并发执行 -->
```

- 条件求值白名单：比较 + `&& || !`，未定义变量视为 falsy
- `for` 每轮重执行体内块、重渲染正文；`collect` 累积每轮唯一 output 为数组
- 指令注释在 release 模式剥离

## 管道操作符

正文 `{{expr | filter:arg}}` 轻量计算，支持链式（`{{orders | field:revenue | sum}}`）：`len` / `default` / `join` / `round` / `upper` / `lower` / `truncate` / `field`（数组取字段）/ `sum`（数字求和）。参数可用引号：`{{name | default:"匿名"}}`。

## Agent 集成最佳实践

1. **写文档后先 `validate`**：生成含 `ai`/`data`/`template` 块的 `.md` 后，先 `flowmd validate <file>` 确认块 meta 与变量引用合法，避免执行时才发现错误。
2. **用 `run` 验证可执行文档**：`flowmd run <file> -o stdout --var k=v`，捕获输出。加 `-f` 遇错即停。
3. **AI 块要配 `output`**：否则结果不进入变量上下文，下游无法引用。`format: json` 让下游模板直接取字段。
4. **避免交互**：run 块 / agent 首次确认会暂停等输入。批处理或 CI 场景加 `--yes`（或 `runStrict` 反向）。超时由 `execution.timeout` 控制。
5. **成本可见**：执行后 `flowmd cost --days 1` 看 token 与估算费用；`--trace` 输出块级 JSON span。
6. **快照回归**：对稳定的报告文档用 `flowmd test` 建快照，改 prompt/模板后比对差异。
7. **多文档串联**：`flowmd pipeline a.md b.md --when "{{hasError}} == false"`，b 可在 a 失败时跳过。
8. **不要伪造 API Key**：LLM 调用失败时先 `flowmd doctor` 诊断；API Key 走环境变量或 `.flow/credentials.yml`（已在 gitignore）。
9. **输出模式**：默认 `-o new` 生成 `name_YYYY-MM-DD.md`；与用户交互或需要原样返回用 `-o stdout`。
10. **Web IDE 调试**：`flowmd serve` 起本地服务，浏览器打开做交互式编辑/单块执行/历史面板。

## 常见误区

- `data` 块单行也返回数组：取单行用 `{{rows.0.field}}`，不要写 `{{row.field}}`
- `template` 块源码区不做 `{{var}}` 朴素替换（防破坏 Handlebars）；变量替换发生在渲染阶段
- `conversation` 标签的 AI 块会跳过 `--cache`（上下文每次不同）
- 插件块类型需在 `.flow/plugins/` 放插件文件，否则 ` ```自定义块 ```` 会被当普通代码块忽略
- `--var` 优先级高于 `--var-file` 与 config，低于块 `output` 的写入

## 参考

- `flowmd help blocks` — 块类型与参数速查
- `flowmd <命令> --help` — 各命令详细选项
- `flowmd new -l` — 内置模板列表
- `flowmd config` — 当前配置
- 用户文档（安装/配置/块详解）托管在 GitHub 仓库 `z-cypress/FlowMD-cli` 的 `docs/` 目录
