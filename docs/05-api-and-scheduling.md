# HTTP API 与定时任务

## 一、HTTP API（flowmd serve）

`flowmd serve` 启动一个本地 HTTP 服务，暴露 programmatic API，供脚本、工具或 AI Agent 调用 FlowMD 执行引擎。

```bash
flowmd serve --port 5199 --host 127.0.0.1
```

- `--port`：监听端口（默认 `5199`）
- `--host`：监听地址（默认 `127.0.0.1`）

### 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/execute` | POST | 执行 Markdown 内容并返回渲染结果 |
| `/templates` | GET | 列出可用模板 |
| `/health` | GET | 健康检查 |

所有响应为统一 JSON：`{ "ok": true, "data": ... }` 或 `{ "ok": false, "error": "..." }`。

### POST /execute

请求体（JSON）：

```json
{
  "markdown": "# 报告\n\n```ai {output: \"insight\"}\n分析销售数据\n```\n\n{{insight}}",
  "vars": { "score": "85" },
  "varFile": "/path/to/vars.yml",
  "release": false,
  "debug": false,
  "quiet": true,
  "dryRun": false,
  "currentFile": "/abs/path/report.md"
}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `markdown` | 是 | 要执行的文档内容 |
| `vars` | 否 | 变量注入，等价于 `--var` |
| `varFile` | 否 | 变量文件路径，等价于 `--var-file` |
| `release` | 否 | release 模式：剥离指令块，仅保留渲染结果 |
| `debug` | 否 | debug 模式：在每个块后插入执行结果 |
| `quiet` | 否 | 抑制进度输出（默认 true） |
| `dryRun` | 否 | 试运行：解析不执行 |
| `currentFile` | 否 | 用于 include 相对路径解析与历史记录文件名 |

响应：

```json
{ "ok": true, "data": { "content": "...", "hasError": false } }
```

- 执行引擎与 `flowmd run` 完全一致（含全部块类型与控制流）。
- run 块在 API 场景默认跳过安全确认（显式调用即视为同意）。
- 常见错误码：`400`（非 JSON / 缺 markdown / 非法选项）、`500`（执行异常）。

### 示例

```bash
curl -s -X POST http://127.0.0.1:5199/execute \
  -H "Content-Type: application/json" \
  -d '{"markdown":"# Hi\n\n{{name}}","vars":{"name":"FlowMD"}}'
```

```json
{ "ok": true, "data": { "content": "# Hi\n\nFlowMD", "hasError": false } }
```

## 二、定时任务（flowmd schedule）

`flowmd schedule` 按 cron 表达式周期执行文档，任务持久化在 `.flow/schedule.db`，触发时写入执行历史。

### 命令

```bash
flowmd schedule add <name> <file> --cron "0 17 * * 5"   # 添加任务
flowmd schedule list                                      # 列出任务
flowmd schedule remove <name>                             # 删除任务
flowmd schedule pause <name>                              # 暂停任务
flowmd schedule resume <name>                             # 恢复任务
flowmd schedule run <name>                                # 立即执行一次（调试）
flowmd schedule                                           # 前台守护运行
```

### cron 表达式

标准 5 段格式：`分 时 日 月 周`

| 示例 | 含义 |
|------|------|
| `0 17 * * 5` | 每周五 17:00 |
| `30 8 * * 1-5` | 工作日 8:30 |
| `*/15 * * * *` | 每 15 分钟 |
| `0 0 1 * *` | 每月 1 日 0 点 |

### 示例

```bash
# 每周五下午 5 点生成周报
flowmd schedule add weekly-report ./report.md --cron "0 17 * * 5"

# 立即试跑一次
flowmd schedule run weekly-report

# 前台守护运行（Ctrl+C 退出）
flowmd schedule
```

### 行为

- 守护进程启动时加载所有已启用任务，注册到调度器。
- 每次触发：读取文件 → 执行（release 模式）→ 写入执行历史 → 更新任务的最近运行时间与状态。
- `list` 展示每个任务的启用状态、cron、文件与最近一次运行结果。
- 暂停的任务不会触发，但保留定义。

---

[返回首页](00-index.md) | [配置指南](02-configuration.md)
