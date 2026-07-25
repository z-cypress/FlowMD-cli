# 数据查询示例

## 用户统计

```data {output: "stats"}
SELECT city, COUNT(*) as count FROM users GROUP BY city
```

城市分布：{{stats}}

## 销售汇总

```data {output: "sales"}
SELECT p.name, SUM(s.amount) as total
FROM sales s JOIN products p ON s.product_id = p.id
GROUP BY p.name ORDER BY total DESC
```

## 报表示例

```template {output: "report"}
## 销售排行

| 产品 | 总额 |
|------|------|
{{#each sales}}
| {{name}} | ¥{{total}} |
{{/each}}
```

{{report}}
