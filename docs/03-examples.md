 # 完整示例

 ## 示例 1：简单工作流

 一个基础的端到端流程：AI 生成内容 → 模板渲染。

 ````markdown
 # 每日简报

 ```ai {output: "news"}
 请在 200 字内总结今天最重要的 3 条科技新闻
 ```

 ```template
 ## 今日简报

 生成日期：{{date}}

 {{news}}

 ---
 *由 FlowMD 自动生成*
 ```
 ````

 运行：

 ```bash
 flowmd run daily-brief.md
 ```

 ## 示例 2：数据报告

 查询数据库 → AI 分析 → 排版输出。

 ````markdown
 # 销售周报

 ## 数据

 ```data {output: "sales"}
 SELECT
   DATE(created_at) as day,
   COUNT(*) as orders,
   SUM(amount) as revenue
 FROM orders
 WHERE created_at >= date('now', '-7 days')
 GROUP BY DATE(created_at)
 ORDER BY day
 ```

 ## AI 分析

 ```ai {output: "analysis"}
 分析以下一周的销售数据，找出趋势和异常：
 {{sales}}
 ```

 ## 报告

 ```template
 # 销售周报 ({{date}})

 ## 数据概览

 | 日期 | 订单数 | 收入 |
 |------|--------|------|
 {{#each sales}}
 | {{day}} | {{orders}} | ¥{{revenue}} |
 {{/each}}

 ## AI 分析

 {{analysis}}
 ```
 ````

 运行：

 ```bash
 flowmd run weekly-report.md -o stdout
 ```

 ## 示例 3：多步骤内容生成

 拆解复杂内容生成任务，逐步完成。

 ````markdown
 # 文章生成

 ## 步骤 1：生成大纲

 ```ai {output: "outline"}
 为"远程办公的未来趋势"写一个详细的文章大纲，包含 5 个主要部分
 ```

 ## 步骤 2：扩展每个部分

 ```ai {output: "body"}
 根据以下大纲，扩展每个部分为 2-3 段：

 {{outline}}
 ```

 ## 步骤 3：生成摘要

 ```ai {output: "summary"}
 为以下文章写一个 50 字的摘要：

 {{body}}
 ```

 ## 步骤 4：渲染成文

 ```template
 # 远程办公的未来趋势

 {{body}}

 ---

 **摘要**：{{summary}}

 *由 FlowMD 于 {{date}} 生成*
 ```
 ````

 ## 示例 4：无输出变量的块

 块不指定 `output` 时，结果不会保存到变量中，适合只想查看执行效果的场景。

 ````markdown
 # 无输出示例

 ```ai
 写一首关于编程的短诗
 ```

 上面的 AI 块没有指定 output，它的输出不会保留。

 ```ai {output: "poem"}
 写一首关于算法的短诗
 ```

 下面引用有 output 的变量：

 {{poem}}
 ````

 运行并对比两个 AI 块的行为差异（debug 模式下有 output 的块会插入结果）。

 ## 示例 5：试运行和逐步调试

 ### 试运行

 只解析不执行，查看变量依赖关系：

 ```bash
 flowmd run doc.md --dry-run
 ```

 输出示例：

 ```
 🚀 FlowMD 开始执行
 📄 文件: doc.md
 📦 找到 3 个代码块

 🤖 [1/3] ai 块 (跳过执行)
 🗄️ [2/3] data 块 (跳过执行)
 🎨 [3/3] template 块 (跳过执行)
 ```

 ### 逐步执行

 每个块执行前暂停，按 Enter 继续：

 ```bash
 flowmd run doc.md --step
 ```

 适合在开发文档时，逐步观察每个块的输出。

 ### 失败即停

 默认情况下，一个块失败不会中断后续块。使用 `--fail-fast` 在遇到第一个错误时立即停止：

 ```bash
 flowmd run doc.md --fail-fast
 ```

 ### 调试模式

 使用 `--debug` 在输出文档时在块下方插入执行结果：

 ```bash
 flowmd run doc.md --debug
 ```

 ## 示例 6：监听模式

 编辑文档时自动重跑，适合边写边看效果：

 ```bash
 flowmd watch doc.md
 ```

 每次保存文件，FlowMD 会自动重新执行并生成带时间戳的新文件。按 `Ctrl+C` 退出。

 ---

 [返回首页](00-index.md) | [入门指南](01-getting-started.md)
