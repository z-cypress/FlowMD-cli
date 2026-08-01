# Template Blocks

## Features

A template block uses the [Handlebars](https://handlebarsjs.com/) template engine to render text content. It can access every variable in the context and supports advanced operations such as loops and conditionals.

Template blocks have two uses:

1. **Direct output** — the rendered result becomes part of the final document
2. **Store in a variable** — use the `output` parameter to store the rendered result in a variable for use elsewhere

## Why Do You Need Template Blocks

The `{{variables}}` in the document body can only do simple value substitution. When you need to:

- iterate over an array to generate table rows
- display different content based on a condition
- combine multiple variables for layout

you need a template block. It is the "layout worker" of the workflow.

## Syntax

````markdown
```template {output: "report"}
Template content, using Handlebars syntax
```
````

The block's language identifier must be `template`. Templates use Handlebars syntax and can access every variable in the context.

## Parameters

| Parameter | Required | Default | Description |
|------|------|--------|------|
| `output` | No | None | The variable name to store the rendered result in. If omitted, the result is only printed to the terminal (debug mode) |

## Handlebars Syntax Cheatsheet

### Basic Substitution

```
{{variableName}}          -- simple variable
{{object.property}}       -- nested object
```

### Loops

```
{{#each array}}
  {{this}}               -- current element
  {{@index}}             -- current index (0-based)
  {{propertyName}}       -- property of the current element
{{/each}}
```

### Conditionals

```
{{#if variable}}
  shown when variable is truthy
{{else}}
  shown when variable is falsy
{{/if}}
```

### Negation

```
{{#unless variable}}
  shown when variable is falsy
{{/unless}}
```

### Logical Helpers

```
{{#if (eq a b)}}          -- equality
{{#if (gt a b)}}          -- greater than
{{#if (lt a b)}}          -- less than
```

Note: comparison helpers such as `eq`, `gt`, and `lt` may need to be registered. In templates, it is recommended to shape data structures through template blocks; comparison logic can be handled in AI blocks or the document body.

### Built-in json Helper

Serializes an object or array into formatted JSON:

```
{{json data}}             -- formatted output of an object
{{json items}}            -- formatted output of an array
```

Useful for debugging data block output, or when you need to embed structured data into the document body.

## Examples

### Basic Usage

````markdown
```data {output: "products"}
SELECT name, price, stock FROM inventory ORDER BY price DESC
```

```template
## Inventory List

| Product | Price | Stock |
|------|------|------|
{{#each products}}
| {{name}} | ¥{{price}} | {{stock}} items |
{{/each}}
```
````

### Conditional Display

````markdown
```data {output: "sales"}
SELECT SUM(amount) as total FROM orders
```

```template
## Sales Report

{{#if sales.total}}
  Total sales this period: ¥{{sales.total}}
{{else}}
  No sales data yet
{{/if}}
```
````

### Multi-step Combined Output

This is the most typical FlowMD usage pattern: data → AI analysis → template layout.

````markdown
```data {output: "metrics"}
SELECT product, revenue FROM sales ORDER BY revenue DESC
```

```ai {output: "insight"}
Analyze the sales data and provide 2 insights:
{{metrics}}
```

```template
# Sales Analysis Report

Generated: {{date}}

## Key Data

| Product | Revenue |
|------|------|
{{#each metrics}}
| {{product}} | ¥{{revenue}} |
{{/each}}

## AI Insights

{{insight}}
```
````

### Nested Data Access

```template
## User Details

Name: {{user.name}}
Email: {{user.email}}
Address: {{user.address.city}}, {{user.address.street}}

## Order History

{{#each orders}}
- #{{id}}: ¥{{amount}} ({{status}})
{{/each}}
```

### Empty Array Handling

```template
{{#if items.length}}
  {{#each items}}
    - {{this}}
  {{/each}}
{{else}}
  No data
{{/if}}
```

### Using output as an Intermediate Variable

A template block's output can also be used as a variable for subsequent steps:

````markdown
```template {output: "report_body"}
This is the report body, including the data from {{date}}
```

Final report: {{report_body}}
````

## Notes

- A template block renders against the **entire variable context**, including outputs from AI blocks, data blocks, and other template blocks
- If a variable path does not exist, Handlebars silently returns an empty string (no error)
- In array loops, use `{{this}}` to reference the current element (for primitives), or `{{propertyName}}` (for objects)
- Template blocks do not output into the final document body themselves (unless referenced via `{{variables}}`); they only generate content or store it in a variable

---

[Back to Home](../00-index.md) | [Configuration Guide](../02-configuration.md)
