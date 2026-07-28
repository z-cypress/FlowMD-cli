 # 数据块

 ## 功能

 数据块连接数据库执行 SELECT 查询，将结果存入变量上下文。查询结果是以 JSON 数组格式存储的行数据，可以被后续的 AI 块或模板块使用。

 > FlowMD 支持 **SQLite**、**MySQL** 和 **PostgreSQL** 三种数据库。SQLite 无需额外安装；MySQL 需安装 `mysql2`；PostgreSQL 需安装 `pg`。

 ## 语法

 ````markdown
 ```data {from: "default", output: "users"}
 SELECT id, name, email FROM users LIMIT 10
 ```
 ````

 块的语言标识符必须为 `data`。SQL 语句支持 `{{变量}}` 引用上下文中的值。

 ## 参数

 | 参数 | 必填 | 默认值 | 说明 |
 |------|------|--------|------|
 | `from` | 否 | `default` | 数据源名称，对应配置文件中的 `dataSources` |
 | `output` | 否 | 无 | 结果存入的变量名。不指定则只输出到终端 |

 ## 安全限制

 数据块有严格的安全检查机制：

 - **仅允许 SELECT 语句** — 非 SELECT 查询会被拒绝
 - **禁止危险操作** — DROP、DELETE、UPDATE、INSERT、ALTER、TRUNCATE、CREATE、EXEC 等均被拦截
 - **禁止多语句** — 分号 `;` 不允许出现在 SQL 中（字符串字面量内的除外）
 - **危险字符检测** — 注释标记（`--`、`/*`）、存储过程关键字（`xp_`、`sp_`）会被拦截
 - **渲染后二次验证** — 变量替换后的 SQL 同样会经过安全检查，防止注入

 ## 配置数据源

 在 `.flow/config.yml` 中配置 SQLite 数据源：

 ```yaml
 dataSources:
   default:                   # 数据源名称，对应 from 参数
     type: sqlite
     filename: "./data.db"    # 数据库文件路径
 ```

 也可以配置多个数据源：

 ```yaml
 dataSources:
   default:
     type: sqlite
     filename: "./data.db"
   analytics:
     type: sqlite
     filename: "./analytics.db"

  ```yaml
  dataSources:
    mysql_db:
      type: mysql
      host: localhost
      port: 3306
      user: root
      password: "{{DB_PASSWORD}}"
      database: mydb

    pg_db:
      type: postgresql
      host: localhost
      port: 5432
      user: postgres
      password: "{{DB_PASSWORD}}"
      database: mydb
  ```

  然后在 data 块中用 `from` 指定：

 ````markdown
 ```data {from: "analytics", output: "metrics"}
 SELECT COUNT(*) FROM events
 ```
 ````

 ## 数据格式

 查询结果以 JSON 数组形式存储，每条记录是一个对象：

 ```json
 [
   { "id": 1, "name": "Alice", "email": "alice@example.com" },
   { "id": 2, "name": "Bob", "email": "bob@example.com" }
 ]
 ```

 **单行优化**：如果查询只返回一行数据，该行被直接存储为对象而不是数组，方便模板中直接访问字段。

 ## 变量赋值行为

 ```data {output: "users"}
 SELECT * FROM users     -- 多行结果 → users 是数组
 ```

 ```data {output: "user"}
 SELECT * FROM users WHERE id = 1   -- 单行结果 → user 是对象
 ```

 模板中的访问方式：

 ```
 {{users[0].name}}       -- 数组：索引访问
 {{user.name}}           -- 对象：直接访问字段
 ```

 ## 示例

 ### 基本查询

 ````markdown
 ```data {output: "users"}
 SELECT name, email FROM users LIMIT 5
 ```

 共查询到 {{users.length}} 个用户。
 ````

 ### 带变量的查询

 ````markdown
 ```data {from: "analytics", output: "daily"}
 SELECT count, date FROM stats WHERE date >= '{{start_date}}'
 ```
 ````

 ### 数据 + AI 分析

 ````markdown
 ```data {output: "orders"}
 SELECT SUM(amount) as revenue, COUNT(*) as count
 FROM orders WHERE created_at >= date('now', '-7 days')
 ```

 ```ai {output: "insight"}
 分析以下销售数据，给出业务洞察：
 {{orders}}
 ```
 ````

 ### 数据 + 模板报告

 ````markdown
 ```data {output: "metrics"}
 SELECT product, sales FROM monthly_sales ORDER BY sales DESC
 ```

 ```template
 ## 销售排行

 | 产品 | 销售额 |
 |------|--------|
 {{#each metrics}}
 | {{product}} | {{sales}} |
 {{/each}}
 ```
 ````

 ---

 [返回首页](../00-index.md) | [配置指南](../02-configuration.md)
