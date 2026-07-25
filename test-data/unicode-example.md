# Unicode 测试

## 中文内容

```template {output: "chinese"}
FlowMD 支持中文、日本語、한국어 等多语言内容。
```

{{chinese}}

## 数据块中文

```data {output: "users"}
SELECT name, city FROM users
```

```template {output: "list"}
用户列表：
{{#each users}}
- {{name}} — {{city}}
{{/each}}
```
