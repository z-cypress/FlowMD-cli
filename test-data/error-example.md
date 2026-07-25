# 错误处理示例

## SQL 安全检查

```data {output: "test"}
SELECT COUNT(*) FROM users
```

统计：{{test}}

## 缺失数据源

```data {from: "nonexistent", output: "data"}
SELECT 1
```

## 空模板

```template {output: "empty"}
{{#if missing}}
  不会显示
{{/if}}
```
