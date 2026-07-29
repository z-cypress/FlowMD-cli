# FlowMD-cli Agent Instructions

## Project Overview

FlowMD is a CLI tool that executes special code blocks in Markdown files. It parses `.md` files containing `ai`, `data`, and `template` blocks, executes them in sequence, and outputs the rendered result.

**Status**: v0.1.0 — 162 tests passing. SQLite/MySQL/PostgreSQL support. Full documentation in `docs/`.

## Tech Stack

- **Runtime**: Node.js >= 18
- **Language**: TypeScript 7.x (strict mode)
- **Package manager**: pnpm
- **Testing**: vitest
- **CLI framework**: commander
- **Markdown parsing**: unified + remark-parse + unist-util-visit
- **AI SDK**: openai, @anthropic-ai/sdk
- **Database**: better-sqlite3
- **Template engine**: Handlebars

## Key Commands

```bash
pnpm install          # Install dependencies
pnpm dev -- run <f>   # Dev mode (tsx)
pnpm test:run         # Run all tests (128)
pnpm build            # Build to dist/
npm install -g .      # Global install
flowmd run <file>     # Execute document
flowmd watch <file>   # Watch + re-execute
flowmd init           # Create .flow/ config
flowmd new <name>     # Create from template
flowmd config         # View/modify config
flowmd doctor         # Environment diagnosis
```

## Commands (8 total)

| Command | Options | Status |
|---------|---------|--------|
| `run <file>` | `-o` (inline/new/stdout), `-d`, `-s`, `-f`, `--debug`, `--release`, `--var`, `--var-file` | ✅ |
| `watch <file>` | `-o`, `-d`, `-s`, `-f`, `--debug`, `--release` | ✅ |
| `init` | — | ✅ |
| `new <name>` | basic/data/report templates | ✅ |
| `config [key]` | `--set <value>` | ✅ |
| `doctor` | — | ✅ |

## Block Types

| Block | Purpose | Parameters |
|-------|---------|------------|
| `ai` | Call LLM (OpenAI / Anthropic) | `model`, `output`, `temperature` |
| `data` | Query SQLite (read-only) | `from`, `output` |
| `template` | Render Handlebars | `output` |

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
2. Undefined `{{variable}}` references → warning (excludes Handlebars loop vars)

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
│   └── doctor.ts           # Env diagnosis
├── core/
│   ├── parser.ts           # Markdown parser
│   ├── executor.ts         # Block execution + modes + validation
│   ├── context.ts          # Variable context
│   └── blocks/
│       ├── ai-block.ts     # AI executor + model presets
│       ├── data-block.ts   # SQLite executor + security
│       └── template-block.ts # Handlebars + json helper
├── types/index.ts          # All type defs
├── utils/
│   ├── config.ts           # Multi-layer config loader
│   ├── logger.ts           # Terminal output
│   ├── prompt.ts           # User input
│   └── error-formatter.ts  # Error formatting
└── __tests__/              # 10 test files, 162 tests
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
- No English localization for CLI output
- CI not verified on GitHub

## Reference

- User docs: `docs/00-index.md`
- Test guide: `note/测试指南.md`
- Commit format: `feat:`, `fix:`, `test:`
