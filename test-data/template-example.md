# 模板块示例

## 基本变量

```template {output: "greeting"}
你好，今天是 {{date}}。
```

{{greeting}}

## 数据 + 模板循环

```data {output: "products"}
SELECT name, price FROM products ORDER BY price DESC
```

```template {output: "catalog"}
## 产品目录

{{#each products}}
- {{name}}：¥{{price}}
{{/each}}
```

## json helper

```template {output: "json_output"}
{{json products}}
```

原始数据：{{json_output}}
