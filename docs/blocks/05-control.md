# 控制流（if / elif / else / for / parallel）

## 功能

控制流让文档根据条件分支执行，或对数组循环执行，无需编写程序。控制流指令以 HTML 注释形式出现，包裹正文文本与任意代码块（ai/data/template/run/include），支持嵌套。

> 控制流是"文档级"流程控制，与模板块（template）内的 Handlebars `{{#if}}` / `{{#each}}` 不同：控制流决定**哪些代码块执行**，Handlebars 只负责排版渲染。

## 语法

````markdown
<!-- if: {{score}} > 80 -->
表现优秀
```ai {output: "feedback"}
给高分学员的鼓励
```
<!-- elif: {{score}} > 60 -->
表现尚可
<!-- else -->
需要改进
<!-- endif -->
````

````markdown
<!-- for: item in orders -->
| {{item.product}} | ¥{{item.revenue}} |
<!-- endfor -->
````

| 指令 | 参数 | 说明 |
|------|------|------|
| `<!-- if: EXPR -->` | 条件表达式 | 条件为真时执行分支内容，支持嵌套 |
| `<!-- elif: EXPR -->` | 条件表达式 | 前置 if 为假时求值，可写多个 |
| `<!-- else -->` | — | 所有前置条件为假时执行 |
| `<!-- endif -->` | — | 结束 if 区（必须成对） |
| `<!-- for: X in LIST -->` | 循环变量 + 列表 | 对数组每个元素执行循环体 |
 | `<!-- for: X in LIST {collect: "NAME"} -->` | 可选 `collect` | 每轮把循环体内唯一产出变量累积为数组 |
 | `<!-- endfor -->` | — | 结束 for 区（必须成对） |
 | `<!-- parallel -->` | — | 并行区（v0.5.0）：区内所有块同时执行，全部完成后汇合再继续 |
 | `<!-- endparallel -->` | — | 结束并行区（必须成对） |

## 运算符速查

| 运算符 | 含义 | 示例 |
|--------|------|------|
| `==` `!=` | 相等 / 不等（数字按数值比较，`'5' == 5` 成立） | `{{score}} >= 60` |
| `>` `<` `>=` `<=` | 大小比较 | `{{count}} > 10` |
| `&&` | 逻辑与（短路） | `{{a}} && {{b}}` |
| `\|\|` | 逻辑或（短路） | `{{a}} \|\| {{b}}` |
| `!` | 逻辑非（最高优先级） | `!{{is_done}}` |
| `( )` | 分组 | `({{a}} > 1) && ({{b}} < 5)` |
| 未定义变量 | 视为 falsy，不报错 | `{{score}} > 80` 在 score 未定义时为假 |

优先级：`!` > 比较 > `&&` > `||`。

## 条件表达式

`if` / `elif` 的条件支持：

- **字面量**：数字、字符串（单/双引号）、`true` / `false` / `null`
- **变量引用**：`{{name}}`，支持深层路径 `{{user.profile.age}}` 与数组下标 `{{items.0.price}}`
- **比较**：`==`、`!=`、`>`、`<`、`>=`、`<=`（数字按数值比较，`'5' == 5` 成立）
- **逻辑**：`&&`、`||`、`!`（短路求值，左侧决定时右侧不求值）
- **分组**：括号 `( )`

优先级：`!` > 比较 > `&&` > `||`。

**未定义变量视为假**：条件中引用的变量不存在时按 falsy 处理，不报错。例如 `{{score}} > 80` 在 score 未定义时为假，走 else 分支。

> 安全说明：条件表达式是白名单求值器，不支持函数调用、赋值等任意 JS 语法，语法错误会明确报错。

## 循环语义（for）

- **每轮重新执行**：循环体内的 `ai` / `data` / `run` 块在每一轮迭代都重新执行（批量 AI 分析、逐行查询等），`template` 块每轮重新渲染。
- **正文重复渲染**：循环体内的普通 Markdown 正文（表格行、段落）按迭代次数重复输出。
- **循环变量**：`for item in list` 声明循环变量 `item`，每轮指向当前元素，支持 `{{item.name}}` 深层访问；**循环结束后清除**，循环外引用会提示未定义。
- **列表来源**：`list` 是上下文中的变量（如 `data` 块输出的数组，或 `--var` 传入的 JSON 数组字符串 `'[{"a":1}]'`）。非数组/未定义视为空数组，循环体不执行。
- **列表为空**：循环体整体跳过。

## 累积结果（collect）

`collect` 把循环体内**唯一**产出变量的每轮结果累积为数组，供循环外聚合使用：

````markdown
<!-- for: item in orders {collect: "insights"} -->
```ai {output: "analysis"}
分析 {{item.product}} 的销售趋势
```
{{analysis}}   <!-- 每轮结果 -->
<!-- endfor -->

```ai {output: "summary"}
综合以下洞察：{{insights}}
```
````

- 循环结束后 `{{insights}}` 为所有轮次结果的有序数组，可 `{{#each}}` 渲染或喂给 AI 做总结。
- 循环体内块产生的 `output` 变量（如 `{{analysis}}`）每轮绑定当前结果，区内正文可直接引用；循环结束后保留最后一轮的值。
- `collect` 限单个产出变量：循环体内声明了多个 `output` 时解析报错。
 - **失败轮不累积**：某轮块失败则该轮结果不 push 进 collect 数组，循环继续下一轮。

## 并行执行（parallel）

v0.5.0 起用 `<!-- parallel -->` 标记一组相互独立的块同时执行，全部完成后汇合再继续后续。适合"分头干，汇总结果"的场景（如多语言翻译、多维度分析），墙钟时间从各块之和降为最慢的一块。

````markdown
<!-- parallel -->
```ai {output: "summary_zh"}
用中文总结
```
```ai {output: "summary_en"}
Summarize in English
```
<!-- endparallel -->
````

- **并行区内所有块同时启动**，全部结束（成功或失败）后才继续区后内容
- 各块共享同一变量上下文；写同一个 `output` 时后完成的覆盖先完成的（race，需自行避免）
- **失败语义与串行一致**：每块独立计败；任一失败仍等其余块完成（fail-fast 下任一失败即中止）
- 支持嵌套（parallel 内嵌 parallel，内层块并入并行组）
- 区内不支持 if/for 指令（只接受块）；依赖检测仍生效（引用失败块输出的块被跳过）
- `--debug` / `--release` 模式行为与串行一致（结果插入 / 指令剥离）

## 嵌套

指令支持嵌套：`if` 内套 `for`、`for` 内套 `if`、多层 `for`。

````markdown
<!-- for: department in departments -->
## {{department.name}}
<!-- for: emp in department.employees -->
- {{emp.name}}（{{emp.role}}）
<!-- endfor -->
<!-- endfor -->
````

## 执行模式兼容

控制流继承全部执行模式：

| 模式 | 行为 |
|------|------|
| 默认 | 只执行激活分支 / 每轮迭代的块；指令注释行保留在输出中 |
| `--debug` | 在每个实际执行的块后插入结果（循环中按轮插入） |
| `--release` | 剥离所有指令注释与块源码，仅保留渲染结果 |
| `-d`（dry-run） | 跳过执行，展示块与指令 |
| `-s`（step） | 在每个实际执行的块前暂停 |
| `-f`（fail-fast） | 遇到第一个错误停止 |

## 校验

- 未配对的 `if`/`for`（缺少 `endif`/`endfor`）或多余的 `end*` 会在执行前明确报错。
- `else` 之后不允许 `elif` 或再次 `else`。
- 非控制指令的 HTML 注释（如 `<!-- 普通注释 -->`）不触发控制流解析。

## 示例

### 条件报告

````markdown
# 销售周报
<!-- if: {{total_revenue}} > 10000 -->
本月业绩达标 🎉
<!-- else -->
业绩未达标，需要关注。
<!-- endif -->
````

### 批量生成表格

````markdown
```data {output: "orders"}
SELECT product, revenue FROM sales ORDER BY revenue DESC
```

<!-- for: item in orders -->
| {{item.product}} | ¥{{item.revenue}} |
<!-- endfor -->
````

### 循环 + 聚合总结

````markdown
<!-- for: item in orders {collect: "insights"} -->
```ai {output: "analysis"}
用一句话分析 {{item.product}} 的销量
```
<!-- endfor -->

```ai {output: "summary"}
把下面每条洞察合并成一段 200 字总结：
{{insights}}
```

{{summary}}
````

---

[返回首页](../00-index.md) | [配置指南](../02-configuration.md)
