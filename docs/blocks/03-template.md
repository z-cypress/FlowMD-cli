 # 模板块

 ## 功能

 模板块使用 [Handlebars](https://handlebarsjs.com/) 模板引擎渲染文本内容。它可以访问变量上下文中的所有变量，并支持循环、条件判断等高级操作。

 模板块有两种用途：

 1. **直接输出** — 渲染结果作为最终文档的一部分
 2. **存入变量** — 通过 `output` 参数将渲染结果存入变量，供其他地方使用

 ## 为什么需要模板块

 文档正文中的 `{{变量}}` 只能做简单的值替换。当你需要：

 - 遍历一个数组生成表格行
 - 根据条件显示不同内容
 - 组合多个变量进行排版

 就需要用模板块。它是流程中的"排版工"。

 ## 语法

 ````markdown
 ```template {output: "report"}
 模板内容，使用 Handlebars 语法
 ```
 ````

 块的语言标识符必须为 `template`。模板使用 Handlebars 语法，可访问上下文中的所有变量。

 ## 参数

 | 参数 | 必填 | 默认值 | 说明 |
 |------|------|--------|------|
 | `output` | 否 | 无 | 渲染结果存入的变量名。不指定则只输出到终端（debug 模式） |

 ## Handlebars 语法速查

 ### 基本替换

 ```
 {{变量名}}               -- 简单变量
 {{对象.属性}}            -- 嵌套对象
 ```

 ### 循环

 ```
 {{#each 数组}}
   {{this}}               -- 当前元素
   {{@index}}             -- 当前索引（从 0 开始）
   {{属性名}}             -- 当前元素的属性
 {{/each}}
 ```

 ### 条件

 ```
 {{#if 变量}}
   变量为真时显示
 {{else}}
   变量为假时显示
 {{/if}}
 ```

 ### 取反

 ```
 {{#unless 变量}}
   变量为假时显示
 {{/unless}}
 ```

 ### 逻辑辅助

 ```
 {{#if (eq a b)}}          -- 相等判断
 {{#if (gt a b)}}          -- 大于判断
 {{#if (lt a b)}}          -- 小于判断
 ```

 注意：`eq`、`gt`、`lt` 等比较辅助函数可能需要注册。在模板中建议通过模板块操作数据的结构，比较逻辑可以在 AI 块或文档正文中处理。

 ### 内置 json helper

 将对象或数组序列化为格式化 JSON：

 ```
 {{json data}}             -- 格式化输出对象
 {{json items}}            -- 格式化输出数组
 ```

 适用于调试数据块返回的内容，或需要将结构化数据嵌入文档正文的场景。

 ## 示例

 ### 基础用法

 ````markdown
 ```data {output: "products"}
 SELECT name, price, stock FROM inventory ORDER BY price DESC
 ```

 ```template
 ## 库存列表

 | 商品 | 价格 | 库存 |
 |------|------|------|
 {{#each products}}
 | {{name}} | ¥{{price}} | {{stock}}件 |
 {{/each}}
 ```
 ````

 ### 条件显示

 ````markdown
 ```data {output: "sales"}
 SELECT SUM(amount) as total FROM orders
 ```

 ```template
 ## 销售报告

 {{#if sales.total}}
   本周期总销售额：¥{{sales.total}}
 {{else}}
   暂无销售数据
 {{/if}}
 ```
 ````

 ### 多步骤组合输出

 这是 FlowMD 最典型的使用方式：数据 → AI 分析 → 模板排版。

 ````markdown
 ```data {output: "metrics"}
 SELECT product, revenue FROM sales ORDER BY revenue DESC
 ```

 ```ai {output: "insight"}
 分析销售数据，给出 2 个洞察：
 {{metrics}}
 ```

 ```template
 # 销售分析报告

 生成时间：{{date}}

 ## 关键数据

 | 产品 | 收入 |
 |------|------|
 {{#each metrics}}
 | {{product}} | ¥{{revenue}} |
 {{/each}}

 ## AI 洞察

 {{insight}}
 ```
 ````

 ### 嵌套数据访问

 ```template
 ## 用户详情

 姓名：{{user.name}}
 邮箱：{{user.email}}
 地址：{{user.address.city}}, {{user.address.street}}

 ## 订单历史

 {{#each orders}}
 - #{{id}}: ¥{{amount}} ({{status}})
 {{/each}}
 ```

 ### 空数组处理

 ```template
 {{#if items.length}}
   {{#each items}}
     - {{this}}
   {{/each}}
 {{else}}
   暂无数据
 {{/if}}
 ```

 ### 使用 output 做中间变量

 模板块的输出也可以作为变量，供后续步骤使用：

 ````markdown
 ```template {output: "report_body"}
 这是报告正文内容，包含{{date}}的数据
 ```

 最终报告：{{report_body}}
 ````

 ## 注意事项

 - 模板块渲染时访问的是**整个变量上下文**，包括 AI 块、数据块和其他模板块的输出
 - 如果变量路径不存在，Handlebars 会静默返回空字符串（不会报错）
 - 数组循环中，用 `{{this}}` 引用当前元素（如果是基本类型），或用 `{{属性名}}`（如果是对象）
 - 模板块本身不输出到最终文档正文（除非通过 `{{变量}}` 引用），它只生成内容或存入变量

 ---

 [返回首页](../00-index.md) | [配置指南](../02-configuration.md)
