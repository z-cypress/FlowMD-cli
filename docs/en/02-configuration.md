# Configuration Guide

## Configuration Priority

FlowMD configuration follows a priority order from highest to lowest:

| Priority | Method | Description |
|--------|------|------|
| 1 (Highest) | Command-line arguments | Runtime parameters such as `--var`, `-o`, `--debug` |
| 2 | Environment variables / `.env` | Suitable for managing sensitive information such as API Keys |
| 3 | Project configuration (`.flow/config.yml`) | Unified project-level configuration |
| 4 | Global configuration (`~/.flow/config.yml`) | User-level defaults |
| 5 (Lowest) | Hardcoded defaults | Built into the tool |

Higher-priority configuration overrides lower-priority configuration.

### Variable Priority

The value of `{{variable}}` in a document follows the following priority (high → low):

| Priority | Source | Description |
|--------|------|------|
| 1 (Highest) | `--var` command-line argument | `flowmd run doc.md --var name=张三` |
| 2 | Block `output` | Variables defined by `{output: "name"}` at execution time |
| 3 | `--var-file` file | Injected from a YAML/JSON/.env file |
| 4 | Environment variables | `export FLOW_VAR_name=张三` |
| 5 | `variables` in project `.flow/config.yml` | Custom variables in the configuration file |
| 6 | `variables` in global `~/.flow/config.yml` | User-level defaults |
| 7 (Lowest) | System variables | `{{date}}`, `{{datetime}}`, `{{timestamp}}` |

For variables with the same name, the value from the higher-priority source overrides the lower-priority one.

Higher-priority configuration overrides lower-priority configuration.

## Initializing Configuration

```bash
flowmd init
```

Creates the `.flow/` directory in the current directory:

```
.flow/
├── config.yml               # Main configuration file
├── credentials.yml.example  # Credentials template (for reference)
└── history/                 # History records directory
```

The `init` command automatically adds `.flow/credentials.yml` to `.gitignore`, preventing credentials from being accidentally committed.

## Configuration File Details

### `.flow/config.yml`

```yaml
# FlowMD configuration file

llm:
  provider: openai          # Options: openai, anthropic
  model: deepseek-v4-flash    # Default model
  temperature: 0.7          # 0=precise, 1=creative
  apiKey: ""                  # API Key (environment variables take precedence)
  baseURL: ""               # Custom API address (optional)
  # Named model presets, referenceable by model name in AI blocks
  models:
    fast:                     # Lightweight and fast
      model: deepseek-v4-flash
      temperature: 0.3
    reason:                   # Deep reasoning
      provider: openai
      model: deepseek-v4-pro
      apiKey: "" 
      baseURL: https://api.deepseek.com

dataSources: {}             # Data source configuration (empty means no data sources configured)

execution:
  timeout: 30               # Timeout per block (seconds)
```

### LLM Configuration (`llm`)

| Field | Type | Default | Description |
|------|------|--------|------|
| `provider` | string | `openai` | Provider, either `openai` or `anthropic` |
| `model` | string | `deepseek-v4-flash` | Model name (note: the default may change) |
| `temperature` | number | `0.7` | Generation temperature, range 0-1 |
| `apiKey` | string | empty | API key (environment variables recommended) |
| `baseURL` | string | empty | Custom API address (for proxies or compatible APIs) |
| `models` | object | empty | Named model presets (optional); each preset can override model/provider/temperature/baseURL |

### Data Source Configuration (`dataSources`)

The following database types are supported:

| Type | `type` value | Dependency | Configuration notes |
|------|----------|------|----------|
| SQLite | `sqlite` | `better-sqlite3` (built-in) | Only a file path is required |
| MySQL | `mysql` | `mysql2` (requires installation) | Requires connection information |
| PostgreSQL | `postgresql` | `pg` (requires installation) | Requires connection information |

SQLite example:

```yaml
dataSources:
  default:
    type: sqlite
    filename: "./data.db"
```

MySQL example:

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

PostgreSQL example:

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

Note: MySQL and PostgreSQL require the corresponding dependencies to be installed first:

```bash
pnpm add mysql2      # MySQL
pnpm add pg          # PostgreSQL
```

### Credentials Management

**Do not** write API Keys in `config.yml` (it may be committed to Git). Recommended approaches:

1. **Environment variables** (highest priority)

    ```bash
    # OpenAI
    export OPENAI_API_KEY="sk-xxxxxxxx"

    # Anthropic
    export ANTHROPIC_API_KEY="sk-ant-xxxxxxxx"
    ```

2. **`.env` file**

    Create `.env` in the project root:

    ```
    OPENAI_API_KEY=sk-xxxxxxxx
    ```

    FlowMD automatically loads the `.env` file at startup.

3. **`.flow/credentials.yml`**

    Create it by referring to `credentials.yml.example`, but **be sure to confirm it has been added to `.gitignore`**.

## Environment Variable Reference

| Environment variable | Corresponding config | Description |
|----------|----------|------|
| `OPENAI_API_KEY` | `llm.apiKey` | OpenAI API Key |
| `ANTHROPIC_API_KEY` | `llm.apiKey` | Anthropic API Key |
| `FLOW_LLM_PROVIDER` | `llm.provider` | LLM provider |
| `FLOW_LLM_MODEL` | `llm.model` | Model name |
| `FLOW_LLM_TEMPERATURE` | `llm.temperature` | Generation temperature |
| `FLOW_LLM_BASE_URL` | `llm.baseURL` | Custom API address |
| `FLOW_TIMEOUT` | `execution.timeout` | Timeout (seconds) |

FlowMD also supports shorthand variants without the `LLM_` prefix: `FLOW_PROVIDER`, `FLOW_MODEL`, `FLOW_TEMPERATURE`, `FLOW_BASE_URL`.

## Block-Level Configuration Override

Certain settings can be temporarily overridden in a code block, applying only to that block:

````markdown
```ai {model: "gpt-4o-mini", temperature: 0.3}
The model and temperature for this block will be overridden
```
````

AI blocks support overriding: `model`, `temperature`

## Configuration Management Commands

### Viewing Configuration

```bash
# View the full configuration
flowmd config

# View a specific configuration item
flowmd config llm.model
```

### Modifying Configuration

```bash
flowmd config llm.model --set deepseek-chat
flowmd config llm.temperature --set 0.5
```

Automatic type inference is supported: `true`/`false` are converted to booleans, and numeric strings are converted to numbers.

### Environment Diagnosis

```bash
flowmd doctor
```

Diagnoses: Node.js version, configuration files, API Keys, environment variables, and the `.env` file.

## CLI Output Language

FlowMD supports Chinese (default) and English CLI output.

### Setting the Language

Language resolution priority (high → low):

| Priority | Source | Example |
|--------|------|------|
| 1 (Highest) | `--lang` command-line flag | `flowmd --lang en run doc.md` |
| 2 | `cli.lang` in config | `.flow/config.yml` |
| 3 (Lowest) | Environment variables | `LANG=en_US.UTF-8` |

### Command-Line Flag

```bash
# English output
flowmd --lang en run doc.md

# Chinese output (default)
flowmd --lang zh run doc.md
```

### Configuration File

```yaml
# .flow/config.yml
cli:
  lang: en        # Output language: zh | en
```

### Environment Variables

```bash
export LANG=en_US.UTF-8
```

Supported variables: `LANG`, `LC_ALL`, `LC_MESSAGES` (in order of priority).

> Note: the `--lang` flag must be placed before the subcommand (e.g. `flowmd --lang en run`).

## Custom Variables

FlowMD supports injecting variables into a document from multiple sources, used to fill `{{variable}}` placeholders.

### Configuration File Variables

Defined in `.flow/config.yml`:

```yaml
# .flow/config.yml
variables:
  author: "FlowMD 用户"
  department: "技术部"
  project: "数据报告"
```

Used in a document:

```markdown
报告作者：{{author}}
所属部门：{{department}}
```

### Command-Line Variables

```bash
# Single variable
flowmd run doc.md --var name=张三

# Multiple variables
flowmd run doc.md --var name=张三 --var project=FlowMD

# Inject from a file (YAML, JSON, or .env)
flowmd run doc.md --var-file vars.yml
```

Example `vars.yml` file:

```yaml
name: 李四
project: FlowMD 文档工具
```

### Variable Priority

When the same variable name appears in multiple sources, its value is resolved by the following priority (high → low):

| Priority | Source | Example |
|--------|------|------|
| Highest | `--var` | `--var name=张三` |
| ↑ | Block `output` | `{output: "name"}` |
| ↑ | `--var-file` | `--var-file vars.yml` |
| ↑ | Environment variables | `export FLOW_VAR_name=张三` |
| ↑ | Project config `variables` | `.flow/config.yml` |
| Lowest | Global config `variables` | `~/.flow/config.yml` |

That is: `--var` can override block output, block output can override `--var-file`, and so on.

### System Variables

The following variables are automatically injected by FlowMD and can be used without configuration:

| Variable | Format | Description |
|------|------|------|
| `{{date}}` | YYYY-MM-DD | Current date |
| `{{datetime}}` | YYYY-MM-DD HH:mm:ss | Current date and time |
| `{{timestamp}}` | Unix seconds | Current timestamp |
| `{{execution_time}}` | ISO 8601 | The time the document started executing |

---

[Back to home](00-index.md)
