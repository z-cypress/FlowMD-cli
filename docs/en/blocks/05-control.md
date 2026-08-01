# Control Flow (if / elif / else / for)

## Purpose

Control flow lets documents branch on conditions or loop over arrays without writing a program. Control directives are written as HTML comments that wrap body text and any code block (ai/data/template/run/include), and support nesting.

> Control flow is *document-level* flow control: it decides **which blocks execute**. This is different from Handlebars `{{#if}}` / `{{#each}}` inside a template block, which only handles layout rendering.

## Syntax

````markdown
<!-- if: {{score}} > 80 -->
Excellent
```ai {output: "feedback"}
Praise the high-scorer
```
<!-- elif: {{score}} > 60 -->
Good
<!-- else -->
Needs improvement
<!-- endif -->
````

````markdown
<!-- for: item in orders -->
| {{item.product}} | ¥{{item.revenue}} |
<!-- endfor -->
````

| Directive | Argument | Description |
|-----------|----------|-------------|
| `<!-- if: EXPR -->` | condition expression | Execute the branch if the condition is truthy; supports nesting |
| `<!-- elif: EXPR -->` | condition expression | Evaluated when the preceding if is false; may repeat |
| `<!-- else -->` | — | Executed when all preceding conditions are false |
| `<!-- endif -->` | — | Ends the if region (must pair) |
| `<!-- for: X in LIST -->` | loop variable + list | Execute the body once per array element |
| `<!-- for: X in LIST {collect: "NAME"} -->` | optional `collect` | Accumulate each round's single output variable into an array |
| `<!-- endfor -->` | — | Ends the for region (must pair) |

## Condition Expressions

Conditions in `if` / `elif` support:

- **Literals**: numbers, strings (single/double quotes), `true` / `false` / `null`
- **Variable references**: `{{name}}`, with deep paths `{{user.profile.age}}` and array indexes `{{items.0.price}}`
- **Comparisons**: `==`, `!=`, `>`, `<`, `>=`, `<=` (numeric comparison; `'5' == 5` is true)
- **Logic**: `&&`, `||`, `!` (short-circuit; the right side is not evaluated when the left decides)
- **Grouping**: parentheses `( )`

Precedence: `!` > comparison > `&&` > `||`.

**Undefined variables are falsy**: a variable that does not exist is treated as falsy without error. For example `{{score}} > 80` is false when `score` is undefined, falling through to `else`.

> Security: conditions use a whitelist evaluator. Function calls, assignments and arbitrary JS are rejected, and syntax errors are reported clearly.

## Loop Semantics (for)

- **Re-execute every round**: `ai` / `data` / `run` blocks inside the body re-execute on each iteration (batch AI analysis, per-row queries), and `template` blocks re-render.
- **Repeat body text**: plain Markdown between directives (table rows, paragraphs) is output once per iteration.
- **Loop variable**: `for item in list` declares `item`, pointing to the current element each round, with deep access like `{{item.name}}`; it is **cleared after the loop**, so referencing it outside warns about an undefined variable.
- **List source**: `list` is a variable in the context (e.g. an array output by a `data` block, or a JSON array string via `--var`, like `'[{"a":1}]'`). Non-array / undefined values are treated as an empty list and the body is skipped.
- **Empty list**: the whole body is skipped.

## Accumulating Results (collect)

`collect` accumulates the per-round results of the **single** output variable inside the loop body into an array, for use after the loop:

````markdown
<!-- for: item in orders {collect: "insights"} -->
```ai {output: "analysis"}
Analyze the sales trend of {{item.product}}
```
{{analysis}}   <!-- per-round result -->
<!-- endfor -->

```ai {output: "summary"}
Summarize: {{insights}}
```
````

- After the loop, `{{insights}}` is an ordered array of all rounds, usable with `{{#each}}` or fed to an AI block for aggregation.
- The block's `output` variable (e.g. `{{analysis}}`) binds the current round's result inside the body and keeps the **last** round's value after the loop.
- `collect` is limited to a single output variable: declaring multiple `output`s inside the body is a parse error.
- **Failed rounds are not accumulated**: if a round fails, that result is not pushed; the loop continues.

## Nesting

Directives nest: `if` inside `for`, `for` inside `if`, multiple `for`s.

````markdown
<!-- for: department in departments -->
## {{department.name}}
<!-- for: emp in department.employees -->
- {{emp.name}} ({{emp.role}})
<!-- endfor -->
<!-- endfor -->
````

## Execution Modes

Control flow inherits all execution modes:

| Mode | Behavior |
|------|----------|
| Default | Executes only the active branch / each iteration; directive comment lines stay in the output |
| `--debug` | Inserts each executed block's result (per round in loops) |
| `--release` | Strips all directive comments and block sources, keeping only rendered results |
| `-d` (dry-run) | Skips execution, shows blocks and directives |
| `-s` (step) | Pauses before each actually-executed block |
| `-f` (fail-fast) | Stops on the first error |

## Validation

- Unpaired `if`/`for` (missing `endif`/`endfor`) or stray `end*` directives are reported before execution.
- `else` cannot be followed by `elif` or another `else`.
- Non-control HTML comments (e.g. `<!-- a plain comment -->`) do not trigger control-flow parsing.

## Examples

### Conditional Report

````markdown
# Weekly Sales
<!-- if: {{total_revenue}} > 10000 -->
Target met 🎉
<!-- else -->
Below target, needs attention.
<!-- endif -->
````

### Batch Table

````markdown
```data {output: "orders"}
SELECT product, revenue FROM sales ORDER BY revenue DESC
```

<!-- for: item in orders -->
| {{item.product}} | ¥{{item.revenue}} |
<!-- endfor -->
````

### Loop + Aggregated Summary

````markdown
<!-- for: item in orders {collect: "insights"} -->
```ai {output: "analysis"}
Summarize {{item.product}} sales in one sentence
```
<!-- endfor -->

```ai {output: "summary"}
Merge into a 200-word summary:
{{insights}}
```

{{summary}}
````

---

[Back to index](../00-index.md) | [Configuration Guide](../02-configuration.md)
