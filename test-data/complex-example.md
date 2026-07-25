# 复杂工作流

多步骤工作流展示块之间的数据传递。

## 步骤 1：查询数据

```data {output: "sales"}
SELECT p.name, SUM(s.amount) as total
FROM sales s JOIN products p ON s.product_id = p.id
GROUP BY p.name
```

## 步骤 2：AI 分析

```ai {output: "analysis"}
分析以下销售数据，给出 2 个关键发现：
{{sales}}
```

## 步骤 3：渲染报告

```template {output: "report"}
# 销售报告（{{date}}）

{{analysis}}

| 产品 | 销售额 |
|------|--------|
{{#each sales}}
| {{name}} | ¥{{total}} |
{{/each}}
```

{{report}}
