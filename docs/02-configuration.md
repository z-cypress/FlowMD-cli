 # 配置指南

 ## 配置优先级

 FlowMD 的配置遵循从高到低的优先级：

 | 优先级 | 方式 | 说明 |
 |--------|------|------|
 | 1（最高） | 命令行参数 | `--var`、`-o`、`--debug` 等运行时参数 |
 | 2 | 环境变量 / `.env` | 适合管理 API Key 等敏感信息 |
 | 3 | 项目配置 (`.flow/config.yml`) | 项目级别的统一配置 |
 | 4 | 全局配置 (`~/.flow/config.yml`) | 用户级别默认值 |
 | 5（最低） | 硬编码默认值 | 内置于工具 |

 高优先级配置会覆盖低优先级。

 ### 变量优先级

 文档中 `{{变量}}` 的取值遵循以下优先级（高→低）：

 | 优先级 | 来源 | 说明 |
 |--------|------|------|
 | 1（最高） | `--var` 命令行参数 | `flowmd run doc.md --var name=张三` |
 | 2 | 块 `output` | 执行时 `{output: "name"}` 定义的变量 |
 | 3 | `--var-file` 文件 | 从 YAML/JSON/.env 文件注入 |
 | 4 | 环境变量 | `export FLOW_VAR_name=张三` |
 | 5 | 项目 `.flow/config.yml` 的 `variables` | 配置文件中的自定义变量 |
 | 6 | 全局 `~/.flow/config.yml` 的 `variables` | 用户级别默认值 |
 | 7（最低） | 系统变量 | `{{date}}`、`{{datetime}}`、`{{timestamp}}` |

 同名变量以高优先级来源的值覆盖低优先级。

 高优先级配置会覆盖低优先级。

 ## 初始化配置

 ```bash
 flowmd init
 ```

 在当前目录创建 `.flow/` 目录：

 ```
 .flow/
 ├── config.yml               # 主配置文件
 ├── credentials.yml.example  # 凭据模板（参考用）
 └── history/                 # 历史记录目录
 ```

 `init` 命令会自动将 `.flow/credentials.yml` 加入 `.gitignore`，防止凭据被误提交。

 ## 配置文件详解

 ### `.flow/config.yml`

 ```yaml
 # FlowMD 配置文件

 llm:
   provider: openai          # 可选: openai, anthropic
   model: deepseek-v4-flash    # 默认模型
   temperature: 0.7          # 0=严谨, 1=创意
   apiKey: ""                  # API Key（环境变量优先级更高）
   baseURL: ""               # 自定义 API 地址（可选）
   # 命名模型预设，AI 块中可通过 model 名称引用
   models:
     fast:                     # 轻量快速
       model: deepseek-v4-flash
       temperature: 0.3
     reason:                   # 深度推理
       provider: openai
       model: deepseek-v4-pro
       apiKey: "" 
       baseURL: https://api.deepseek.com

 dataSources: {}             # 数据源配置（空表示不配置数据源）

 execution:
   timeout: 30               # 每个块的超时时间（秒）
 ```

 ### LLM 配置 (`llm`)

 | 字段 | 类型 | 默认值 | 说明 |
 |------|------|--------|------|
 | `provider` | string | `openai` | 提供商，可选 `openai` 或 `anthropic` |
 | `model` | string | `deepseek-v4-flash` | 模型名称（注意：默认值可能变化） |
 | `temperature` | number | `0.7` | 生成温度，范围 0-1 |
 | `apiKey` | string | 空 | API 密钥（建议用环境变量） |
 | `baseURL` | string | 空 | 自定义 API 地址（用于代理或兼容 API） |
 | `models` | object | 空 | 命名模型预设（可选），每个预设可覆盖 model/provider/temperature/baseURL |

 ### 数据源配置 (`dataSources`)

 支持以下数据库类型：

 | 类型 | `type` 值 | 依赖 | 配置说明 |
 |------|----------|------|----------|
 | SQLite | `sqlite` | `better-sqlite3`（内置） | 只需文件路径 |
 | MySQL | `mysql` | `mysql2`（需安装） | 需连接信息 |
 | PostgreSQL | `postgresql` | `pg`（需安装） | 需连接信息 |

 SQLite 示例：

 ```yaml
 dataSources:
   default:
     type: sqlite
     filename: "./data.db"
 ```

 MySQL 示例：

 ```yaml
 dataSources:
   mydb:
     type: mysql
     host: localhost
     port: 3306
     user: root
     password: "your_password"
     database: myapp
 ```

 PostgreSQL 示例：

 ```yaml
 dataSources:
   mydb:
     type: postgresql
     host: localhost
     port: 5432
     user: postgres
     password: "your_password"
     database: myapp
 ```

 注意：MySQL 和 PostgreSQL 需要先安装对应依赖：

 ```bash
 pnpm add mysql2      # MySQL
 pnpm add pg          # PostgreSQL
 ```

 ### 凭据管理

 **不要**将 API Key 写在 `config.yml` 中（它可能被提交到 Git）。推荐方式：

 1. **环境变量**（最高优先级）

    ```bash
    # OpenAI
    export OPENAI_API_KEY="sk-xxxxxxxx"

    # Anthropic
    export ANTHROPIC_API_KEY="sk-ant-xxxxxxxx"
    ```

 2. **`.env` 文件**

    在项目根目录创建 `.env`：

    ```
    OPENAI_API_KEY=sk-xxxxxxxx
    ```

    FlowMD 启动时会自动加载 `.env` 文件。

 3. **`.flow/credentials.yml`**

    参考 `credentials.yml.example` 创建，但**务必确认它已被加入 `.gitignore`**。`loadConfig` 会自动读取该文件的 `llm.apiKey`（优先级：环境变量 > credentials.yml > config.yml）。

 ## 环境变量参考

 | 环境变量 | 对应配置 | 说明 |
 |----------|----------|------|
 | `OPENAI_API_KEY` | `llm.apiKey` | OpenAI API Key |
 | `ANTHROPIC_API_KEY` | `llm.apiKey` | Anthropic API Key |
 | `FLOW_LLM_PROVIDER` | `llm.provider` | LLM 提供商 |
 | `FLOW_LLM_MODEL` | `llm.model` | 模型名称 |
 | `FLOW_LLM_TEMPERATURE` | `llm.temperature` | 生成温度 |
 | `FLOW_LLM_BASE_URL` | `llm.baseURL` | 自定义 API 地址 |
 | `FLOW_TIMEOUT` | `execution.timeout` | 超时时间（秒） |

 FlowMD 也支持不带 `LLM_` 的简写变体：`FLOW_PROVIDER`、`FLOW_MODEL`、`FLOW_TEMPERATURE`、`FLOW_BASE_URL`。

 ## 块级配置覆盖

 在代码块中可以临时覆盖某些设置，只对该块生效：

 ````markdown
 ```ai {model: "gpt-4o-mini", temperature: 0.3}
 这个块的模型和温度会被覆盖
 ```
 ````

 AI 块支持覆盖：`model`、`temperature`

 ## 配置管理命令

 ### 查看配置

 ```bash
 # 查看完整配置
 flowmd config

 # 查看特定配置项
 flowmd config llm.model
 ```

 ### 修改配置

 ```bash
 flowmd config llm.model --set deepseek-chat
 flowmd config llm.temperature --set 0.5
 ```

 支持自动类型推断：`true`/`false` 转为布尔值，数字字符串转为数值。

 ### 环境诊断

 ```bash
 flowmd doctor
 ```

 诊断项目：Node.js 版本、配置文件、API Key、环境变量、`.env` 文件。

 ## CLI 输出语言

 FlowMD 支持中文（默认）和英文 CLI 输出。

 ### 设置语言

 语言解析优先级（高 → 低）：

 | 优先级 | 来源 | 示例 |
|--------|------|------|
 | 1（最高） | `--lang` 命令行参数 | `flowmd --lang en run doc.md` |
 | 2 | 配置 `cli.lang` | `.flow/config.yml` |
 | 3（最低） | 环境变量 | `LANG=en_US.UTF-8` |

 ### 命令行参数

 ```bash
 # 英文输出
 flowmd --lang en run doc.md

 # 中文输出（默认）
 flowmd --lang zh run doc.md
 ```

 ### 配置文件

 ```yaml
 # .flow/config.yml
 cli:
   lang: en        # 输出语言：zh | en
 ```

 ### 环境变量

 ```bash
 export LANG=en_US.UTF-8
 ```

 支持变量：`LANG`、`LC_ALL`、`LC_MESSAGES`（按优先级）。

 > 注意：`--lang` 参数需放在子命令之前（如 `flowmd --lang en run`）。

 ## 自定义变量

 FlowMD 支持从多个来源向文档注入变量，用于填充 `{{变量}}` 占位符。

 ### 配置文件变量

 在 `.flow/config.yml` 中定义：

 ```yaml
 # .flow/config.yml
 variables:
   author: "FlowMD 用户"
   department: "技术部"
   project: "数据报告"
 ```

 文档中使用：

 ```markdown
 报告作者：{{author}}
 所属部门：{{department}}
 ```

 ### 命令行变量

 ```bash
 # 单个变量
 flowmd run doc.md --var name=张三

 # 多个变量
 flowmd run doc.md --var name=张三 --var project=FlowMD

 # 从文件注入（YAML、JSON 或 .env）
 flowmd run doc.md --var-file vars.yml
 ```

 `vars.yml` 文件示例：

 ```yaml
 name: 李四
 project: FlowMD 文档工具
 ```

 ### 变量优先级

 当同一变量名在多个来源中出现时，按以下优先级取值（高→低）：

 | 优先级 | 来源 | 示例 |
 |--------|------|------|
 | 最高 | `--var` | `--var name=张三` |
 | ↑ | 块 `output` | `{output: "name"}` |
 | ↑ | `--var-file` | `--var-file vars.yml` |
 | ↑ | 环境变量 | `export FLOW_VAR_name=张三` |
 | ↑ | 项目配置 `variables` | `.flow/config.yml` |
 | 最低 | 全局配置 `variables` | `~/.flow/config.yml` |

 即：`--var` 可以覆盖块输出，块输出可以覆盖 `--var-file`，以此类推。

 ### 系统变量

 以下变量由 FlowMD 自动注入，无需配置即可使用：

 | 变量 | 格式 | 说明 |
 |------|------|------|
 | `{{date}}` | YYYY-MM-DD | 当前日期 |
 | `{{datetime}}` | YYYY-MM-DD HH:mm:ss | 当前日期时间 |
 | `{{timestamp}}` | Unix 秒 | 当前时间戳 |
 | `{{execution_time}}` | ISO 8601 | 文档开始执行的时间 |

---

 [返回首页](00-index.md)
