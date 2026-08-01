# Frequently Asked Questions

## Installation & Running

**Q: The installation or runtime reports a Node.js version issue?**

FlowMD requires Node.js >= 18. Check your version:

```bash
node --version
```

If the version is too low, upgrade Node.js.

**Q: The `flowmd` command cannot be found?**

Make sure dependencies are installed and the project is built:

```bash
pnpm install && pnpm build
```

If installed globally, confirm the installation path is in `PATH`:

```bash
npm install -g .
```

**Q: Getting `ERR_MODULE_NOT_FOUND` at runtime?**

Make sure you have run `pnpm build` to generate the `dist/` directory. If you use `pnpm dev` mode, confirm the command is correct:

```bash
pnpm dev -- run file.md
```

## Configuration

**Q: API Key is invalid or not configured?**

Check whether the environment variable is in effect:

```bash
echo $OPENAI_API_KEY
```

If it is empty, set it and retry:

```bash
export OPENAI_API_KEY="sk-your-key"
flowmd run doc.md
```

You can also manage it through a `.env` file:

```
# Create .env in the project root
OPENAI_API_KEY=sk-your-key
```

**Q: How do I switch AI models?**

Via environment variable:

```bash
export FLOW_LLM_MODEL="gpt-4o-mini"
```

Or override temporarily in an AI block in the document:

````markdown
```ai {model: "gpt-4o-mini"}
...
```
````

**Q: How do I configure a custom API base URL (e.g. proxy, Ollama, DeepSeek)?**

```bash
export FLOW_LLM_BASE_URL="https://api.deepseek.com/v1"
```

**Q: How do I set environment variables on Windows?**

```cmd
set OPENAI_API_KEY=sk-your-key
```

Or with PowerShell:

```powershell
$env:OPENAI_API_KEY="sk-your-key"
```

## Usage

**Q: `{{variables}}` are not being replaced?**

Possible causes:

1. The variable is not defined — check that a block with `{output: "variableName"}` runs before the reference
2. The variable name is spelled inconsistently — mind capitalization and underscores
3. The block failed — the referenced block may have errored, so the variable was never produced

Use `--dry-run` to view variable dependencies:

```bash
flowmd run doc.md --dry-run
```

**Q: A data block reports "only SELECT queries are supported"?**

FlowMD data blocks are designed to be read-only. If you need to modify data, use a database tool directly.

Also check whether the SQL statement accidentally ends with a semicolon (`;`), which triggers the "multiple statements are not allowed" error.

**Q: A data block reports "data source not configured"?**

Make sure a data source is configured in `.flow/config.yml`:

```yaml
dataSources:
  default:
    type: sqlite
    filename: "./data.db"
```

And confirm the database file exists.

**Q: An AI block takes a long time or times out?**

Check your network connection, or adjust the timeout:

```bash
export FLOW_TIMEOUT=60
```

The default timeout is 30 seconds.

**Q: watch mode does not detect file changes?**

Make sure you are watching the correct file path. watch mode uses [chokidar](https://github.com/paulmillr/chokidar); with indirect-save editors (such as vim), changes may be detected with a delay.

**Q: What is the difference between the output modes?**

- `new` (default) — generates `original-name_date.md`, leaving the original file untouched
- `inline` — overwrites the original file
- `stdout` — prints to the terminal

**Q: If one block fails, does it affect other blocks?**

By default, **no**. FlowMD skips blocks that depend on failed variables (`failedOutputs`), but independent blocks continue to run. Use `--fail-fast` to stop immediately at the first error.

## Project-related

**Q: What is the difference between FlowMD and Jupyter Notebook?**

FlowMD is **document-first**. You write documents in Markdown and use special code blocks to inject dynamic capabilities. Jupyter is code-first and better suited for interactive data analysis. FlowMD is well suited to generating reports, documents, and automated content processing.

**Q: Is this an open-source project?**

Yes, open-sourced under the MIT license.

**Q: How do I report issues or request features?**

Please file a GitHub Issue.

**Q: How do I switch between different models or providers?**

Define named model presets in the config file using `llm.models`, then reference them via `model` in AI blocks. See the [Configuration Guide](02-configuration.md#named-model-presets).

**Q: How do I inject variables from the command line?**

Use the `--var` parameter:

```bash
flowmd run doc.md --var name=John --var project=FlowMD
```

Or inject from a file:

```bash
flowmd run doc.md --var-file vars.yml
```

**Q: How do I view or modify the configuration?**

```bash
flowmd config              # view the full configuration
flowmd config llm.model --set deepseek-chat  # modify a config item
```

**Q: How do I diagnose environment issues?**

```bash
flowmd doctor
```

**Q: What do the `flow config` and `flow doctor` commands do?**

`flow config` views and modifies `.flow/config.yml`; `flow doctor` diagnoses the Node.js version, API Key configuration, environment variables, and more.

**Q: Which features are still missing in the current MVP?**

- MySQL and PostgreSQL data sources
- More built-in templates

---

[Back to Home](00-index.md) | [Getting Started](01-getting-started.md)
