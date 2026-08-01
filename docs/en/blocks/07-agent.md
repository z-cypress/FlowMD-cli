# agent block (Document as Agent)

## Overview

The `agent` block lets a document not only run a fixed script, but drive the LLM to
**autonomously plan multi-step tasks**: think → choose a tool → execute → observe,
iterating until the goal is reached. It is the core block of FlowMD's
"Document as Agent" stage (v2.0+).

> Difference from the `ai` block: `ai` is "one thought of the brain" (single text
> generation); `agent` is "one person's complete job" (multi-step autonomous task
> with tool use).

## Syntax

````markdown
```agent {
    goal: "Collect competitor news",
    provider: "openai",
    tools: ["code_execution", "file_read"],
    output: "competitor_news",
    max_steps: 8,
    timeout: 90,
    temperature: 0.5
}
Task requirements:
1. Inspect raw data files under data/
2. Aggregate stats with code_execution
3. Output a JSON array
```
````

| Key | Required | Default | Description |
|------|------|--------|------|
| `goal` | yes | — | Task goal the agent plans around |
| `provider` | no | global | LLM provider: `openai` / `anthropic` (auto-resolves the matching env API key on switch) |
| `tools` | no | `[]` | Allowed tool whitelist; unknown tools are rejected at parse time |
| `output` | yes | — | Variable name for the final answer; later blocks can `{{reference}}` it |
| `max_steps` | no | 10 | Maximum number of tool-call rounds |
| `timeout` | no | 120 | Overall timeout (seconds) |
| `temperature` | no | 0.5 | Decision randomness (0-2) |

## Execution model (ReAct)

The agent block runs a "think → act → observe" loop:

```
1. Render goal and task description ({{vars}} resolved from context)
2. Build the system prompt (goal + tool capabilities)
3. Iterate LLM calls:
   - Tool calls → look up the registry, execute, append observations to history → continue
   - Final text → terminate
4. Termination: final answer / max_steps reached / timeout / user interrupt
5. Write the result to the output variable
```

## Tools

v2.0-alpha ships two read-only tools:

| Tool | Capability | Security boundary |
|------|------|----------|
| `code_execution` | Run script in a sandbox (js isolated-vm / python subprocess) | Self-contained script; no filesystem or network access |
| `file_read` | Read text files inside the project root (64KB cap) | `..` traversal / symlink escape / absolute-path escape are rejected |

> Network tools (`web_search` / `browser` / `api_call`) and the write tool
> (`file_write`) arrive in v2.0-beta; any unknown tool in the list is rejected at parse time.

## Security

- **Authorization**: The first run of an agent block (keyed by goal + tool set)
  prompts for confirmation, persisted to `agent.confirmedAgents` in
  `.flow/config.yml`; declining fails the block without running any tool.
  `--yes` skips the prompt, `--strict` forces it every time.
- **Tool whitelist**: only tools explicitly listed in `tools` are usable;
  unregistered tools are rejected at parse time.
- **Guardrails**: `max_steps` limits rounds, `timeout` limits overall duration,
  Ctrl+C interrupts.
- **Step trace**: every step's thought / action / observation is recorded;
  `--debug` inserts it into the output and `flowmd history` stores a summary.

## Execution mode compatibility

| Mode | Behavior |
|------|------|
| default | Runs as one block; the spinner shows the current step |
| `--debug` | Inserts the final result + step trace after the block |
| `--release` | Strips the agent block source, keeps rendered output |
| `-d` (dry-run) | Skips execution |
| `-s` (step) | Pauses before the block, showing the task description |
| `-f` (fail-fast) | Stops on the first failure |

## Validation

- Missing `goal` / `output`, non-openai/anthropic `provider`, unknown `tools`,
  invalid `max_steps` / `timeout` / `temperature` → clear error before execution.

## Examples

### Automated data summary

````markdown
```data {output: "orders"}
SELECT product, revenue FROM sales
```

```agent {goal: "Summarize sales", provider: "openai", tools: ["code_execution"], output: "summary"}
Read {{orders}}, use code_execution to compute total revenue and the top product,
then output a short Chinese summary.
```

{{summary}}
````

### Research assistant (composed with later blocks)

````markdown
```agent {goal: "Research", tools: ["file_read"], output: "research"}
Read the product docs under docs/, extract the core features, output a Markdown list.
```

```template {output: "report"}
# Research result
{{research}}
```

{{report}}
````

---

[Back to index](../00-index.md) | [AI block](01-ai.md) | [run block](04-run.md)
