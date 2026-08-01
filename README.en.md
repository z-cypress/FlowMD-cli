# FlowMD-cli

Turn Markdown into executable files — drive AI workflows by writing documents.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)

[简体中文](README.md) | [English](README.en.md)

## Installation

```bash
git clone https://github.com/z-cypress/FlowMD-cli.git
cd FlowMD-cli
pnpm install
pnpm build
npm install -g @z-cypress/flow-md
npm install -g .  # Development mode
```

## Configuration

Configuration file `.flow/config.yml` (created with `flowmd init`):

```yaml
# .flow/config.yml
llm:
  provider: openai            # openai | anthropic
  model: deepseek-v4-flash        # Default model
  temperature: 0.7
  apiKey: ""                  # API Key (environment variable takes precedence)
  baseURL: https://api.deepseek.com  # Compatible API endpoint

dataSources:
  default:
    type: sqlite
    filename: ./data.db

execution:
  timeout: 30
```

Supported AI providers:

| Provider | `provider` value | API Key |
|--------|--------------|---------|
| OpenAI | `openai` | `OPENAI_API_KEY` |
| Anthropic | `anthropic` | `ANTHROPIC_API_KEY` |
| DeepSeek and other compatible APIs | `openai` + `baseURL` | `OPENAI_API_KEY` |
| Multi-model presets | configure `llm.models` | environment variables per provider |

The API Key can be written in the config file or set via environment variable (the environment variable takes precedence):

```bash
# When provider is openai, the code reads OPENAI_API_KEY
export OPENAI_API_KEY="sk-xxxxxxxx"
```

Supported databases: **SQLite, MySQL, PostgreSQL** (read-only queries). See the [Configuration docs](docs/en/02-configuration.md) for details.

## Quick Start

```bash
flowmd init
flowmd new hello
flowmd run hello.md --output stdout
```

`{{variables}}` in the document body are automatically replaced with execution results.

## Usage Examples

### Calling AI

````markdown
# hello.md
```ai {output: "summary"}
Summarize the trend of remote work in one sentence.
```

Summary: {{summary}}
````

```bash
flowmd run hello.md --output stdout
```

### Querying the Database

````markdown
# report.md
```data {from: "default", output: "users"}
SELECT name, email FROM users LIMIT 5
```

There are {{users.length}} users in total.
````

```bash
flowmd run report.md -o new
```

### Template Layout

````markdown
# template.md
```template
| Name | Email |
|------|------|
{{#each users}}
| {{name}} | {{email}} |
{{/each}}
```
````

```bash
flowmd run template.md
```

### Combined Workflow

````markdown
# sales-report.md
## Data
```data {output: "orders"}
SELECT product, revenue FROM sales ORDER BY revenue DESC
```

## AI Analysis
```ai {output: "insight"}
Analyze the sales data: {{orders}}
```

## Report
```template
| Product | Revenue |
|------|------|
{{#each orders}}
| {{product}} | ¥{{revenue}} |
{{/each}}

{{insight}}
```
````

```bash
flowmd run sales-report.md
```

## Run Block: execute scripts in a sandbox

```run {runtime: "python", vars: ["orders"], output: "summary"}
import json, sys
data = json.load(sys.stdin)["orders"]
print(json.dumps({"count": len(data), "total": sum(x["revenue"] for x in data)}))
```

- **js**: strong isolation via isolated-vm, zero capability by default (no filesystem/network/process APIs)
- **python**: subprocess + resource limits (requires `python3` on the system)
- First execution requires confirmation; the choice is remembered per runtime (`--yes` to skip, `--strict` to always confirm)
- Variables are passed explicitly via `vars`; stdout is stored structurally when it is JSON

Detailed documentation for the block types can be found in [docs/blocks/](docs/en/blocks/).

## Agent Block: Document as Agent

The `agent` block drives the LLM to autonomously plan multi-step tasks
(think → tool → observe → iterate), evolving "document as script" into
"document as agent" (v2.0):

````markdown
```agent {goal: "Summarize sales", tools: ["code_execution", "file_read"], output: "summary"}
Read the sales files under data/, use code_execution to compute total revenue,
then output a short summary.
```

{{summary}}
````

- Built-in ReAct loop (openai / anthropic); `goal` is required, with `max_steps` / `timeout` guardrails
- Tool whitelist: `code_execution` (sandboxed execution), `file_read` (read-only inside the project root)
- First run prompts for confirmation keyed by (goal + tool set); declining fails the block
- `--debug` prints the step trace; `flowmd history` records a trace summary

See the [agent block docs](docs/en/blocks/07-agent.md).

## Control Flow: Conditionals and Loops

Use HTML comment directives to wrap body text and code blocks for conditional branches and loop execution:

````markdown
# Sales Report
```data {output: "orders"}
SELECT product, revenue FROM sales ORDER BY revenue DESC
```

<!-- if: {{total_revenue}} > 10000 -->
Target met 🎉
<!-- else -->
Below target, needs attention.
<!-- endif -->

<!-- for: item in orders -->
| {{item.product}} | ¥{{item.revenue}} |
<!-- endfor -->
````

- `<!-- if/elif/else/endif -->` conditional branches, `<!-- for/endfor -->` loops
- Blocks inside a loop re-execute each round; body text re-renders per round
- `{collect: "NAME"}` accumulates the loop's output variable into an array for post-loop aggregation
- Conditions support comparisons (`==` `>` etc.) and boolean logic (`&&` `||` `!`); undefined variables are falsy

See [Control Flow docs](docs/en/blocks/05-control.md).

## Execution Modes

In the default execution mode, each block is executed sequentially in document order, results are stored in the variable context, and `{{variables}}` in the document body are automatically replaced.

| Mode | Command | Effect |
|------|------|------|
| Default | `flowmd run file.md` | Execute all blocks and output the document with variables replaced |
| Debug | `flowmd run file.md --debug` | Insert execution results below each code block in the output document |
| Release | `flowmd run file.md --release` | Remove all directive blocks after execution, keeping only the rendered result |
| Dry-run | `flowmd run file.md -d` | Parse only without executing, view variable dependencies |
| Step | `flowmd run file.md -s` | Pause before each block executes, press Enter to continue |
| Fail-fast | `flowmd run file.md -f` | Stop immediately at the first error |

Output modes are specified with `-o`:

| Output mode | Command | Description |
|----------|------|------|
| New file (default) | `flowmd run file.md` | Generates `file_date.md` |
| Overwrite original file | `flowmd run file.md -o inline` | Overwrites in place |
| Terminal output | `flowmd run file.md -o stdout` | Prints to the terminal |

## Command Reference

| Command | Description |
|------|------|
| `flowmd run <file>` | Execute a document; see execution and output modes above |
| `flowmd run <file> --var key=value` | Inject variables (repeatable) |
| `flowmd run <file> --var-file vars.yml` | Inject variables from a YAML/JSON file |
| `flowmd watch <file> -o stdout` | Watch for file changes; supports `-o` to specify the output mode |
| `flowmd init` | Create the `.flow/` config directory |
| `flowmd new <name>` | Create a document from a template (basic / data / report / meeting / api / changelog) |
| `flowmd config` | View the current configuration |
| `flowmd config llm.model --set deepseek-chat` | Set a configuration option |
| `flowmd doctor` | Environment diagnosis |
| `flowmd history` | View execution history (`--detail` / `--clear`) |
| `flowmd serve` | Start a local HTTP API (`POST /execute` / `GET /templates` / `GET /health`) |
| `flowmd schedule add <name> <file> --cron "0 17 * * 5"` | Add a scheduled task |
| `flowmd schedule list / remove / pause / resume / run` | Manage scheduled tasks |
| `flowmd schedule` | Run the scheduler as a foreground daemon |

## HTTP API (flowmd serve)

```bash
flowmd serve --port 5199
```

Opening `http://127.0.0.1:5199/` in a browser gives you the built-in **Web IDE** (edit + execute preview + template selection).

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Web IDE single page |
| `/execute` | POST | Execute Markdown; body `{markdown, vars?, release?, debug?, quiet?}`, returns `{content, hasError}` |
| `/templates` | GET | List available templates (with content) |
| `/health` | GET | Health check |

## Scheduled Tasks (flowmd schedule)

```bash
flowmd schedule add weekly-report ./report.md --cron "0 17 * * 5"
flowmd schedule run weekly-report   # run once immediately
flowmd schedule                    # foreground daemon, triggers on cron
```

Tasks are persisted in `.flow/schedule.db`; each trigger executes the document and writes to execution history.

Full documentation is available at [docs/](docs/en/00-index.md).

## Development

```bash
pnpm install
pnpm dev -- run doc.md   # Development mode
pnpm test                # Run tests
pnpm build               # Build
```

## Project Status

**MVP stage**. Implemented: run/watch/init/new/config/doctor/history/serve/schedule commands, AI blocks (OpenAI + Anthropic + model presets), data blocks (SQLite/MySQL/PostgreSQL), template blocks (Handlebars + json helper), run blocks (js/python sandbox), control flow (if/elif/else/for + collect), agent blocks (document as agent, ReAct multi-step tasks), variable context, `--var`/`--var-file` (including `.env`), dry-run/step/fail-fast/debug/release modes, HTTP API, scheduled tasks.

**Planned**: VS Code extension, template marketplace, Web IDE.

## License

MIT
