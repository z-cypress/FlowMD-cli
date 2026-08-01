# FlowMD Documentation

> **Version**: 0.3.1 | **License**: MIT
>
> FlowMD is a CLI tool for executing special code blocks in Markdown files. It can call AI (LLMs), query databases, render templates, and fill the results back into the document.

---

## Quick Navigation

**Getting Started**

- [Installation & Getting Started](01-getting-started.md) — get your first document running in 5 minutes
- [Configuration Guide](02-configuration.md) — configure AI providers, data sources, model presets, and environment variables

**Core Features**

- [AI Blocks](blocks/01-ai.md) — call large language models (OpenAI / Anthropic)
- [Data Blocks](blocks/02-data.md) — query SQLite / MySQL / PostgreSQL databases (read-only)
- [Template Blocks](blocks/03-template.md) — render output with Handlebars
- [Run Blocks](blocks/04-run.md) — execute script code in a sandbox (js / python)
- [Control Flow](blocks/05-control.md) — if / elif / else / for conditionals and loops
- [Include Directive](blocks/06-include.md) — inline external documents and variable files
- [Agent Block](blocks/07-agent.md) — document as agent, autonomous multi-step tasks (v2.0)

**Reference & Examples**

- [Complete Examples](03-examples.md) — real-world use cases from simple to complex
- [HTTP API & Scheduled Tasks](05-api-and-scheduling.md) — serve / schedule
- [FAQ](04-faq.md) — troubleshooting installation, configuration, and usage issues

---

## Project Status

Currently at **MVP stage**, the following is implemented:

- `flowmd run` with `--var`/`--var-file` variable injection
- `flowmd watch` supporting `-o`, `-s`, `--debug`, `--release`
- `flowmd init` / `flowmd new` / `flowmd config` / `flowmd doctor`
- `flowmd history` to view execution history (`--detail` / `--clear`)
- `flowmd serve` local HTTP API (`/execute` `/templates` `/health`)
- `flowmd schedule` scheduled tasks (cron-triggered)
- AI blocks supporting OpenAI, Anthropic, and named model presets
- Data blocks supporting SQLite / MySQL / PostgreSQL (read-only queries)
- Template blocks supporting Handlebars and the `{{json}}` helper
- Run blocks supporting js (isolated-vm sandbox) and python (subprocess), with first-run confirmation and resource limits
- Control flow: `<!-- if/elif/else/endif -->` conditionals and `<!-- for/endfor -->` loops (with collect accumulation)
- System variables: `{{date}}`, `{{datetime}}`, `{{timestamp}}`, `{{execution_time}}`
- Execution modes: dry-run, step, fail-fast, debug, release
- Error recovery: dependency skip, grouped failure summary, exit codes 0/1/2
- Bilingual CLI output (switch via `cli.lang` or the `LANG` environment variable)
- Chinese docs ([中文文档](../00-index.md))

---

[Back to top](#flowmd-documentation)
