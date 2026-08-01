# Include Directive

## Purpose

The include directive inlines an external file into the current document:

- **Including `.md` documents**: the code blocks in the included file execute at the current position, sharing the variable context with the main document
- **Including `.yaml` / `.yml` variable files**: the file contents are injected into the context as variables for later blocks

include is useful for reusing shared prompts, data queries, and splitting large documents.

## Syntax

````markdown
```include {path: "./shared-prompts.md"}
```
````

````markdown
```include {path: "./vars.yaml"}
```
````

| Parameter | Required | Description |
|-----------|----------|-------------|
| `path` | yes | external file path (relative to the current document's directory) |

## Including Markdown Documents

Code blocks in an included `.md` file execute in place at the current position, sharing one variable context with the main document (variables from earlier blocks are visible; newly produced variables are visible to later blocks).

````markdown
<!-- main.md -->
```include {path: "./prompts/analysis.md"}
```

```ai {output: "result"}
{{analysis_prompt}}
```
````

````markdown
<!-- prompts/analysis.md -->
```ai {output: "analysis_prompt"}
You are a senior data analyst. Analyze the following data concisely:
```
````

### Nested include

Included documents can include further documents with no hard depth limit (circular references are detected and reported).

## Including Variable Files (YAML)

When including a `.yaml` / `.yml` file, its top-level keys are injected into the context:

````markdown
<!-- vars.yaml -->
name: Zhang San
role: Data Analyst
thresholds:
  low: 60
  high: 90
````

````markdown
```include {path: "./vars.yaml"}
```

{{name}} ({{role}})
````

> Values can be nested objects; access them with deep paths like `{{thresholds.high}}`.

## Security Rules

- **Extension whitelist**: only `.md` / `.yaml` / `.yml`
- **Path bound**: only files inside the project directory (`process.cwd()`) can be included
- **Circular reference detection**: A including B while B includes A is reported as an error

## Execution Modes

include inherits all execution modes (dry-run / step / fail-fast / debug / release).

---

[Back to index](../00-index.md) | [Configuration Guide](../02-configuration.md)
