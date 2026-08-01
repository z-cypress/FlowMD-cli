# FlowMD-cli Agent Instructions

## Project Overview

FlowMD is a CLI tool that executes special code blocks in Markdown files. It parses `.md` files containing `ai`, `data`, and `template` blocks, executes them in sequence, and outputs the rendered result.

**Status**: v0.3.1 — 408 tests passing. SQLite/MySQL/PostgreSQL support. run block (js/python sandbox). Control flow (if/elif/else/for + collect). serve (HTTP API + Web IDE) + schedule (cron). Full documentation in `docs/` (bilingual zh/en).

## Tech Stack

- **Runtime**: Node.js >= 18
- **Language**: TypeScript 7.x (strict mode; `tsc` via `@typescript/native`, `typescript` alias resolves TS 6 API for typescript-eslint)
- **Package manager**: pnpm
- **Testing**: vitest
- **CLI framework**: commander
- **Lint**: ESLint 10 (flat config via `eslint.config.js`)
- **Markdown parsing**: unified + remark-parse + unist-util-visit
- **AI SDK**: openai, @anthropic-ai/sdk
- **Database**: better-sqlite3
- **Template engine**: Handlebars

## Key Commands

```bash
pnpm install          # Install dependencies
pnpm dev -- run <f>   # Dev mode (tsx)
pnpm lint             # ESLint (flat config, TS6 API)
pnpm test:run         # Run all tests (408)
pnpm build            # Build to dist/
npm install -g .      # Global install
flowmd run <file>     # Execute document
flowmd watch <file>   # Watch + re-execute
flowmd init           # Create .flow/ config
flowmd new <name>     # Create from template
flowmd config         # View/modify config
flowmd doctor         # Environment diagnosis
flowmd serve          # Local HTTP API + Web IDE (/ /execute /templates /health)
flowmd schedule       # Scheduled tasks + cron daemon
```

## Commands (9 total)

| Command | Options | Status |
|---------|---------|--------|
| `run <file>` | `-o` (inline/new/stdout), `-d`, `-s`, `-f`, `--debug`, `--release`, `--var`, `--var-file`, `--yes`, `--strict` | ✅ |
| `watch <file>` | `-o`, `-d`, `-s`, `-f`, `--debug`, `--release`, `--yes`, `--strict` | ✅ |
| `init` | — | ✅ |
| `new <name>` | basic/data/report/meeting/api/changelog templates | ✅ |
| `config [key]` | `--set <value>` | ✅ |
| `doctor` | — | ✅ |
| `history` | `--detail <id>`, `--clear` | ✅ |
| `serve` | `--port`, `--host`; endpoints `/` (Web IDE) `/execute` `/templates` `/health` | ✅ |
| `schedule` | `add <name> <file> --cron`, `list`, `remove`, `pause`, `resume`, `run`, daemon | ✅ |

## Block Types

| Block | Purpose | Parameters |
|-------|---------|------------|
| `ai` | Call LLM (OpenAI / Anthropic) | `model`, `output`, `temperature`, `max_tokens` |
| `data` | Query SQLite/MySQL/PostgreSQL (read-only) | `from`, `output` |
| `template` | Render Handlebars | `output` |
| `include` | Inline external `.md`/`.yaml` file | `path` |
| `run` | Execute script in sandbox (js isolated-vm / python subprocess) | `runtime`, `vars`, `output`, `timeout`, `memory`, `permissions` |

## Control Flow (v1.3)

HTML comment directives wrapping body text + blocks. Not a block type; parsed as `directives` and executed via a control tree.

- `<!-- if: EXPR -->` / `<!-- elif: EXPR -->` / `<!-- else -->` / `<!-- endif -->`
- `<!-- for: X in LIST [ {collect: "NAME"} ] -->` / `<!-- endfor -->`
- Condition evaluator: whitelist (comparisons + `&&` `||` `!`), undefined → falsy
- for: body blocks re-execute per round; body text re-renders per round; loop var cleared after loop; `collect` accumulates single output into array
- Directive comments kept in default/debug output, stripped in release
- Errors (unmatched directives, syntax) reported pre-execution

## Run Modes

| Mode | Flag | Effect |
|------|------|--------|
| Default | — | Execute blocks, render variables, output |
| Debug | `--debug` | Insert block results after each code block |
| Release | `--release` | Strip all code blocks from output |
| Dry-run | `-d` | Parse only, skip execution |
| Step | `-s` | Pause before each block, show preview, wait for Enter |
| Fail-fast | `-f` | Stop on first error |

## System Variables

`{{date}}` (YYYY-MM-DD), `{{datetime}}` (YYYY-MM-DD HH:mm:ss), `{{timestamp}}` (Unix seconds), `{{execution_time}}` (ISO 8601)

## Variable Injection (Priority: low → high)

System vars < `--var-file` < `--var` < block `output`

Usage: `--var key=value` (repeatable), `--var-file path.yml`

## Model Presets

Named presets in `llm.models` config, referenced by `model` in AI blocks. Preset merges on global llm config; provider switch auto-resolves API key from env var.

## Pre-execution Validation

1. Blocks without `output` → warning (step mode: pause with prompt)
2. Undefined `{{variable}}` references → warning (excludes Handlebars loop vars, run vars, and control-flow loop vars / collect names)

## Security (Data Block)

Only SELECT allowed. Blocks: DROP, DELETE, UPDATE, INSERT, ALTER, TRUNCATE, CREATE, EXEC. Multi-statement (semicolon) blocked. Double validation (pre + post render). API key sanitized in error messages.

## Handlebars Helpers

`{{json value}}` — formatted JSON output (SafeString)

## Project Structure

```
src/
├── index.ts                # CLI entry (run inlined, all commands)
├── commands/
│   ├── watch.ts            # File watcher
│   ├── init.ts             # .flow/ creator
│   ├── new.ts              # Template generator
│   ├── config.ts           # Config get/set
│   ├── doctor.ts           # Env diagnosis
│   ├── history.ts          # Execution history (list/detail/clear)
│   ├── serve.ts            # Local HTTP API (native http, / Web IDE /execute /templates /health)
│   └── schedule.ts         # Scheduled tasks (add/list/remove/pause/resume/run/daemon)
├── core/
│   ├── parser.ts           # Markdown parser
│   ├── executor.ts         # Block execution + modes + validation
│   ├── context.ts          # Variable context
│   └── blocks/
│       ├── ai-block.ts     # AI executor + model presets
│       ├── data-block.ts   # SQLite executor + security
│       ├── template-block.ts # Handlebars + json helper
│       ├── run-block.ts    # run executor (runtime dispatch + confirm)
│       └── run/
│           ├── js-sandbox.ts     # isolated-vm sandbox
│           ├── python-sandbox.ts # subprocess sandbox
│           ├── run-confirm.ts    # runtime confirmation persistence
│           └── types.ts          # SandboxResult/SandboxOptions
│       └── control/
│           ├── directives.ts     # HTML comment directive parsing
│           ├── tree.ts           # directive pairing → control tree
│           ├── condition.ts      # condition expression evaluator
│           └── execute-region.ts # tree walking execution
│   ├── serve/
│   │   ├── server.ts             # native http server factory + routing
│   │   ├── routes.ts             # / (Web IDE) /execute /templates /health handlers
│   │   ├── web-ide.html.ts       # Web IDE single-page HTML (inline, no frontend deps)
│   │   └── types.ts              # ExecuteRequest / ApiResponse
│   └── schedule/
│       ├── schedule-db.ts        # .flow/schedule.db CRUD
│       ├── scheduler.ts          # node-cron loading + trigger
│       └── types.ts              # ScheduleTask
├── types/index.ts          # All type defs
├── utils/
│   ├── config.ts           # Multi-layer config loader
│   ├── i18n.ts             # Bilingual (zh/en) message lookup
│   ├── locales/            # zh.ts / en.ts message tables
│   ├── history.ts          # Execution history SQLite persistence
│   ├── logger.ts           # Terminal output
│   ├── prompt.ts           # User input
│   └── error-formatter.ts  # Error formatting
└── __tests__/              # 27 test files, 407 tests
```

## Configuration Priority

CLI args > Env vars / `.env` > Project `.flow/config.yml` > Global `~/.flow/config.yml` > Defaults

## Code Conventions

- ESM imports with `.js` extension
- `import type` for type-only imports
- Async/await, no `.catch()` chains
- JSDoc on exported functions
- Strict TypeScript

## Known Gaps

- No template gallery beyond basic/data/report/meeting/api/changelog
- CI not verified on GitHub
- VS Code extension / template marketplace not yet built

## Reference

- User docs: `docs/00-index.md`
- Test guide: `note/测试指南.md`
- Commit format: `feat:`, `fix:`, `test:`

## Agent skills

### Issue tracker

Issues are tracked as markdown files under `.scratch/<feature>/`. See `note/agents/issue-tracker.md`.

### Domain docs

Feature planning docs (CONTEXT/PLAN/ADR) live in `note/<feature>/`; `docs/` is user-facing only. See `note/agents/domain.md`.
