## 日报告

今日销售额：{{sales_total}}

```data {from: "default", output: "sales_total"}
SELECT SUM(amount) as total FROM orders WHERE date = '{{date}}'
```

```ai {output: "summary"}
根据以下销售数据生成摘要：
{{sales_total}}
```

{{summary}}
