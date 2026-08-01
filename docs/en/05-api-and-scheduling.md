# HTTP API & Scheduled Tasks

## 0. Web IDE

`flowmd serve` ships a lightweight Web IDE. Open the server root in a browser:

```bash
flowmd serve --port 5199
# Open http://127.0.0.1:5199/ in a browser
```

- **Left editor**: a `textarea` for writing Markdown and FlowMD directive blocks
- **Right preview**: shows the rendered result after clicking "Execute"
- **Template dropdown**: pick a built-in template (basic/data/report/meeting/api/changelog) to fill the editor
- **Variable table**: add/remove key-value variables (equivalent to `--var`), injected on execute
- **release checkbox**: when checked, strips directive blocks and keeps only the rendered result

The Web IDE is a pure frontend single page with no frontend dependencies, executing directly through `POST /execute`.

## 1. HTTP API (flowmd serve)

`flowmd serve` starts a local HTTP server that exposes the FlowMD execution engine as a programmatic API for scripts, tools, or AI agents.

```bash
flowmd serve --port 5199 --host 127.0.0.1
```

- `--port`: port to listen on (default `5199`)
- `--host`: address to bind (default `127.0.0.1`)

### Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/execute` | POST | Execute Markdown content and return the rendered result |
| `/templates` | GET | List available templates |
| `/health` | GET | Health check |

All responses use a unified JSON shape: `{ "ok": true, "data": ... }` or `{ "ok": false, "error": "..." }`.

### POST /execute

Request body (JSON):

```json
{
  "markdown": "# Report\n\n```ai {output: \"insight\"}\nAnalyze sales data\n```\n\n{{insight}}",
  "vars": { "score": "85" },
  "varFile": "/path/to/vars.yml",
  "release": false,
  "debug": false,
  "quiet": true,
  "dryRun": false,
  "currentFile": "/abs/path/report.md"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `markdown` | yes | the document content to execute |
| `vars` | no | variable injection, equivalent to `--var` |
| `varFile` | no | variable file path, equivalent to `--var-file` |
| `release` | no | release mode: strip directive blocks, keep only rendered result |
| `debug` | no | debug mode: insert each block's result |
| `quiet` | no | suppress progress output (default true) |
| `dryRun` | no | dry run: parse without executing |
| `currentFile` | no | used for include relative-path resolution and history file name |

Response:

```json
{ "ok": true, "data": { "content": "...", "hasError": false } }
```

- The execution engine is identical to `flowmd run` (all block types and control flow).
- run blocks skip the interactive security confirmation in the API (calling it explicitly is treated as consent).
- Common error codes: `400` (non-JSON / missing markdown / invalid option), `500` (execution error).

### Example

```bash
curl -s -X POST http://127.0.0.1:5199/execute \
  -H "Content-Type: application/json" \
  -d '{"markdown":"# Hi\n\n{{name}}","vars":{"name":"FlowMD"}}'
```

```json
{ "ok": true, "data": { "content": "# Hi\n\nFlowMD", "hasError": false } }
```

## 2. Scheduled Tasks (flowmd schedule)

`flowmd schedule` runs documents periodically by cron expression. Tasks persist in `.flow/schedule.db`; each trigger writes to execution history.

### Commands

```bash
flowmd schedule add <name> <file> --cron "0 17 * * 5"   # add a task
flowmd schedule list                                      # list tasks
flowmd schedule remove <name>                             # remove a task
flowmd schedule pause <name>                              # pause a task
flowmd schedule resume <name>                             # resume a task
flowmd schedule run <name>                                # run once immediately (debug)
flowmd schedule                                           # run the scheduler as a foreground daemon
```

### Cron Expression

Standard 5-field format: `minute hour day month weekday`

| Example | Meaning |
|---------|---------|
| `0 17 * * 5` | Every Friday at 17:00 |
| `30 8 * * 1-5` | Weekdays at 8:30 |
| `*/15 * * * *` | Every 15 minutes |
| `0 0 1 * *` | The 1st of each month at 00:00 |

### Example

```bash
# Generate a weekly report every Friday at 5pm
flowmd schedule add weekly-report ./report.md --cron "0 17 * * 5"

# Run once to verify
flowmd schedule run weekly-report

# Run the scheduler as a foreground daemon (Ctrl+C to exit)
flowmd schedule
```

### Behavior

- The daemon loads all enabled tasks on startup and registers them with the scheduler.
- Each trigger: reads the file → executes (release mode) → writes to execution history → updates the task's last run time and status.
- `list` shows each task's enabled state, cron, file, and last run result.
- Paused tasks do not trigger but keep their definition.

---

[Back to index](00-index.md) | [Configuration Guide](02-configuration.md)
