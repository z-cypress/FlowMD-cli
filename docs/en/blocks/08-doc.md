# doc block (Cross-Document Collaboration)

## Overview

The `doc` block executes another `.flow.md` sub-document in an **isolated context**
and passes the sub-document's rendered content and output variables back to the
current document (v2.1 cross-document collaboration / multi-document orchestration).
It is the channel for orchestrating subtasks, composing results from multiple agents,
and splitting large documents into reusable modules.

> Difference from `include`: `include` inlines a document into the **shared context**
> (for reusing snippets); `doc` is a "function call" with isolation + return values
> (for orchestrating subtasks). They can be mixed.

## Syntax

````markdown
```doc {path: "./agents/analyze.md", input: ["topic"], output: "analysis"}
```
````

| Key | Required | Description |
|------|------|------|
| `path` | yes | Sub-document path (relative to the current document); `.md` only |
| `input` | no | List of variable names imported from the parent context (isolation contract) |
| `output` | yes | Namespace name, see the return rules below |

## Return rules

- `{{output}}` → the sub-document's **final rendered content**
- `{{output.<var>}}` → each variable produced by the sub-document (e.g. if it has
  `ai {output: "conclusion"}`, then `{{analysis.conclusion}}` is available)

## Execution semantics

- **Isolation**: the sub-document runs in a fresh variable context; it can only see
  system variables (`{{date}}`, etc.) and the `input`-declared values. Undeclared
  parent variables are invisible to it.
- **Input validation**: an `input` variable that is undefined in the parent context
  fails the `doc` block.
- **Full capability**: the sub-document can use every block type
  (ai/data/template/run/agent/include) and control flow; `doc` blocks inside it nest recursively.
- **Failure semantics**: any failed block in the sub-document fails the `doc` block
  (already-produced variables are still returned); `--fail-fast` stops immediately.
- **Cycle detection**: `doc` and `include` share the visited-path set; circular
  references (A→B→A) error clearly.
- **Mode inheritance**: dry-run / step / debug / release apply to sub-document execution.

## Examples

### Cross-document agent collaboration

`agents/analyze.md` (sub-document):

````markdown
```agent {goal: "Analyze the topic", tools: ["file_read"], output: "conclusion"}
Read the materials under docs/ and give a conclusion.
```
````

Main document:

````markdown
```doc {path: "./agents/analyze.md", input: ["topic"], output: "analysis"}
```

## Conclusion

{{analysis.conclusion}}
````

### Multi-document orchestration

````markdown
# Combined Report

```doc {path: "./modules/market.md", input: ["region"], output: "market"}
```

```doc {path: "./modules/tech.md", input: ["topic"], output: "tech"}
```

```template {output: "report"}
## Market
{{market}}

## Technology
{{tech}}
```

{{report}}
````

## Validation

- Missing `path` / `output`, non-`.md` files, path escape, circular references,
  undefined `input` variables → clear errors.

---

[Back to index](../00-index.md) | [Include Directive](06-include.md) | [Agent Block](07-agent.md)
