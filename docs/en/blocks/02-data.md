# Data Blocks

## Features

A data block connects to a database, executes a SELECT query, and stores the result in the variable context. Query results are stored as rows in a JSON array format that can be used by subsequent AI blocks or template blocks.

> FlowMD supports **SQLite**, **MySQL**, and **PostgreSQL**. SQLite needs no extra installation; MySQL requires the `mysql2` package; PostgreSQL requires the `pg` package.

## Syntax

````markdown
```data {from: "default", output: "users"}
SELECT id, name, email FROM users LIMIT 10
```
````

The block's language identifier must be `data`. SQL statements can reference values from the context with `{{variables}}`.

## Parameters

| Parameter | Required | Default | Description |
|------|------|--------|------|
| `from` | No | `default` | Data source name, corresponding to `dataSources` in the config file |
| `output` | No | None | The variable name to store the result in. If omitted, the result is only printed to the terminal |

## Security Restrictions

Data blocks enforce strict security checks:

- **SELECT statements only** — non-SELECT queries are rejected
- **Dangerous operations blocked** — DROP, DELETE, UPDATE, INSERT, ALTER, TRUNCATE, CREATE, EXEC are all intercepted
- **Multiple statements blocked** — semicolons `;` are not allowed in SQL (except inside string literals)
- **Dangerous character detection** — comment markers (`--`, `/*`) and stored-procedure keywords (`xp_`, `sp_`) are intercepted
- **Post-render re-validation** — the SQL after variable substitution is also checked for safety to prevent injection

## Configuring Data Sources

Configure a SQLite data source in `.flow/config.yml`:

```yaml
dataSources:
  default:                   # Data source name, corresponding to the from parameter
    type: sqlite
    filename: "./data.db"    # Database file path
```

You can also configure multiple data sources:

```yaml
dataSources:
  default:
    type: sqlite
    filename: "./data.db"
  analytics:
    type: sqlite
    filename: "./analytics.db"

```yaml
dataSources:
  mysql_db:
    type: mysql
    host: localhost
    port: 3306
    user: root
    password: "{{DB_PASSWORD}}"
    database: mydb

  pg_db:
    type: postgresql
    host: localhost
    port: 5432
    user: postgres
    password: "{{DB_PASSWORD}}"
    database: mydb
```

Then specify the source with `from` in a data block:

````markdown
```data {from: "analytics", output: "metrics"}
SELECT COUNT(*) FROM events
```
````

## Data Format

Query results are stored as a JSON array, where each record is an object:

```json
[
  { "id": 1, "name": "Alice", "email": "alice@example.com" },
  { "id": 2, "name": "Bob", "email": "bob@example.com" }
]
```

**Single-row optimization**: if a query returns only one row, that row is stored directly as an object rather than an array, making fields easy to access in templates.

## Variable Assignment Behavior

```data {output: "users"}
SELECT * FROM users     -- multiple rows → users is an array
```

```data {output: "user"}
SELECT * FROM users WHERE id = 1   -- single row → user is an object
```

Access in templates:

```
{{users[0].name}}       -- array: index access
{{user.name}}           -- object: direct field access
```

## Examples

### Basic Query

````markdown
```data {output: "users"}
SELECT name, email FROM users LIMIT 5
```

Queried {{users.length}} users in total.
````

### Query with Variables

````markdown
```data {from: "analytics", output: "daily"}
SELECT count, date FROM stats WHERE date >= '{{start_date}}'
```
````

### Data + AI Analysis

````markdown
```data {output: "orders"}
SELECT SUM(amount) as revenue, COUNT(*) as count
FROM orders WHERE created_at >= date('now', '-7 days')
```

```ai {output: "insight"}
Analyze the sales data below and provide business insights:
{{orders}}
```
````

### Data + Template Report

````markdown
```data {output: "metrics"}
SELECT product, sales FROM monthly_sales ORDER BY sales DESC
```

```template
## Sales Ranking

| Product | Sales |
|------|--------|
{{#each metrics}}
| {{product}} | {{sales}} |
{{/each}}
```
````

---

[Back to Home](../00-index.md) | [Configuration Guide](../02-configuration.md)
