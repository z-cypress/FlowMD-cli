# agent 块（文档即智能体）

## 功能

`agent` 块让文档不仅能按固定脚本执行，还能驱动 LLM **自主规划多步任务**：
思考 → 选择工具 → 执行 → 观察结果，迭代直到达成目标。它是 FlowMD
"文档即智能体"（v2.0+）的核心块。

> agent 块与 `ai` 块的区别：`ai` 块是"大脑的一次思考"（单次文本生成）；
> agent 块是"一个人的完整工作"（多步自主任务，可调用工具）。

## 语法

````markdown
```agent {
    goal: "收集竞品最新动态",
    provider: "openai",
    tools: ["code_execution", "file_read"],
    output: "competitor_news",
    max_steps: 8,
    timeout: 90,
    temperature: 0.5
}
任务要求：
1. 检查 data/ 下的原始数据文件
2. 用 code_execution 聚合统计
3. 输出 JSON 数组结果
```
````

| 键 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `goal` | 是 | — | 任务目标，agent 围绕其自主规划 |
| `provider` | 否 | 全局默认 | LLM 提供商：`openai` / `anthropic`（切换时自动读取对应环境变量 API Key） |
| `tools` | 否 | `[]` | 允许的工具白名单，未注册工具会解析期报错 |
| `output` | 是 | — | 最终答案存入的变量名，后续块可 `{{引用}}` |
| `max_steps` | 否 | 10 | 最大工具调用轮数 |
| `timeout` | 否 | 120 | 整体超时（秒） |
| `temperature` | 否 | 0.5 | 决策随机性（0-2） |

## 执行模型（ReAct）

agent 块内部按"思考 → 行动 → 观察"循环执行：

```
1. 渲染 goal 与任务描述（{{变量}} 从上下文取值）
2. 构建 system prompt（goal + 工具能力清单）
3. 迭代调用 LLM：
   - 返回工具调用 → 查注册表执行 → 把观察结果回填消息历史 → 继续
   - 返回最终文本 → 终止
4. 终止条件：最终答案 / 达到 max_steps / 超时 / 用户中断
5. 结果写入 output 变量
```

## 工具

v2.0-alpha 提供两个只读工具：

| 工具 | 能力 | 安全边界 |
|------|------|----------|
| `code_execution` | 在沙箱中执行脚本（js 强隔离 / python 子进程） | 脚本自包含，无法访问文件系统与网络 |
| `file_read` | 读取项目目录内的文本文件（上限 64KB） | 禁止 `..` 逃逸 / 符号链接逃逸 / 绝对路径越界 |

> 网络类工具（`web_search` / `browser` / `api_call`）与写文件工具
> （`file_write`）在 v2.0-beta 提供；列表中的未知工具会解析期报错。

## 安全

- **授权确认**：首次执行 agent 块（按 goal + 工具集记忆）会弹确认，
  接受后持久化到 `.flow/config.yml` 的 `agent.confirmedAgents`；
  拒绝则块失败、不执行任何工具。`--yes` 跳过确认，`--strict` 每次强制确认。
- **工具白名单**：`tools` 中显式列出的工具才可用，未注册工具解析期报错。
- **护栏**：`max_steps` 限制轮数、`timeout` 限制整体耗时、Ctrl+C 可中断。
- **步骤轨迹**：每一步的思考 / 行动 / 观察被记录，`--debug` 模式下插入输出，
  `flowmd history` 记录轨迹摘要，便于审计。

## 执行模式兼容

| 模式 | 行为 |
|------|------|
| 默认 | agent 作为一个块执行，执行期间 spinner 显示当前步骤 |
| `--debug` | 块后插入最终结果 + 步骤轨迹 |
| `--release` | 剥离 agent 块源码，仅保留渲染结果 |
| `-d`（dry-run） | 跳过执行 |
| `-s`（step） | 块前暂停展示任务描述 |
| `-f`（fail-fast） | 块失败即停 |

## 校验

- `goal` / `output` 缺失、`provider` 非 openai/anthropic、`tools` 含未知工具、
  `max_steps`/`timeout`/`temperature` 非法数值 → 执行前明确报错。

## 示例

### 自动化数据汇总

````markdown
```data {output: "orders"}
SELECT product, revenue FROM sales
```

```agent {goal: "汇总销售数据", provider: "openai", tools: ["code_execution"], output: "summary"}
读取 {{orders}}，用 code_execution 计算总营收与最高单品，输出一段中文摘要。
```

{{summary}}
````

### 调研助手（与后续块配合）

````markdown
```agent {goal: "调研", tools: ["file_read"], output: "research"}
阅读 docs/ 下的产品文档，提取核心功能点，输出 Markdown 列表。
```

```template {output: "report"}
# 调研结果
{{research}}
```

{{report}}
````

---

[返回首页](../00-index.md) | [AI 块](01-ai.md) | [run 块](04-run.md)
