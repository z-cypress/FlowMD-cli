# Sales Report

## Data Collection

```data {from: "default", output: "sales"}
SELECT date, revenue FROM daily_sales WHERE date >= '2026-07-01'
```

## AI Analysis

```ai {model: "gpt-4o", output: "summary"}
Analyze the following sales data and provide insights:
{{sales}}
```

## Report Template

```template
## Weekly Report ({{date}})

Total Revenue: {{total_revenue}}

AI Insights:
{{summary}}
```
