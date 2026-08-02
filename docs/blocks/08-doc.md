# doc 块（跨文档协作）

## 功能

`doc` 块在**隔离的上下文中执行另一份 `.flow.md` 子文档**，并把子文档的渲染结果与
产出变量回传给当前文档（v2.1 跨文档协作 / 多文档编排）。它是编排子任务、
组合多个 agent 结果、把大型文档拆分为可复用模块的通道。

> 与 `include` 的区别：`include` 是"原地展开、共享上下文"（适合复用片段）；
> `doc` 是"函数式调用、隔离 + 回传"（适合编排子任务）。两者可混用。

## 语法

````markdown
```doc {path: "./agents/analyze.md", input: ["topic"], output: "analysis"}
```
````

| 键 | 必填 | 说明 |
|------|------|------|
| `path` | 是 | 子文档路径（相对当前文档所在目录）；仅支持 `.md` |
| `input` | 否 | 从当前上下文导入子文档的变量名列表（隔离契约） |
| `output` | 是 | 命名空间名，见下方回传规则 |

## 回传规则

- `{{output}}` → 子文档的**最终渲染内容**
- `{{output.<变量名>}}` → 子文档产出的每个变量（如子文档有 `ai {output: "conclusion"}`，
  则 `{{analysis.conclusion}}` 可用）

## 执行语义

- **隔离**：子文档在一个全新的变量上下文中执行，只能看到系统变量（`{{date}}` 等）
  与 `input` 声明的输入；未声明的父变量对子文档不可见。
- **输入校验**：`input` 声明的变量在父上下文未定义 → `doc` 块报错。
- **能力完整**：子文档可使用全部块类型（ai/data/template/run/agent/include）与控制流；
  子文档内的 `doc` 块可继续嵌套。
- **失败语义**：子文档任一块失败 → `doc` 块失败（已产出变量仍回传）；
  `--fail-fast` 会立即停止。
- **循环检测**：`doc` 与 `include` 共享已访问路径集合，循环引用（A→B→A）明确报错。
- **模式继承**：dry-run / step / debug / release 等模式对子文档执行同样生效。

## 示例

### 跨文档 Agent 协作

`agents/analyze.md`（子文档）：

````markdown
```agent {goal: "分析主题", tools: ["file_read"], output: "conclusion"}
阅读 docs/ 下的资料，给出结论。
```
````

主文档：

````markdown
```doc {path: "./agents/analyze.md", input: ["topic"], output: "analysis"}
```

## 分析结论

{{analysis.conclusion}}
````

### 多文档编排

````markdown
# 综合报告

```doc {path: "./modules/market.md", input: ["region"], output: "market"}
```

```doc {path: "./modules/tech.md", input: ["topic"], output: "tech"}
```

```template {output: "report"}
## 市场
{{market}}

## 技术
{{tech}}
```

{{report}}
````

## 校验

- `path` / `output` 缺失、非 `.md` 文件、路径越界、循环引用、`input` 变量未定义
  → 明确报错。

---

[返回首页](../00-index.md) | [include 指令](06-include.md) | [agent 块](07-agent.md)
