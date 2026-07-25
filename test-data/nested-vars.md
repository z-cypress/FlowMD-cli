# 嵌套变量示例

## 单行数据

```data {output: "user"}
SELECT * FROM users WHERE id = 1
```

姓名：{{user.name}}，邮箱：{{user.email}}

## 多行数据

```data {output: "all_users"}
SELECT name, city FROM users
```

```template
## 用户列表

{{#each all_users}}
- {{name}}（{{city}}）
{{/each}}
```
