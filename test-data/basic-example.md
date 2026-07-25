# 基础示例

三种代码块的基本用法。

## AI 块

```ai {output: "summary", model: "deepseek-v4-flash"}
用一句话总结 FlowMD 的核心功能。
```

结果：{{summary}}

## 数据块

```data {output: "users"}
SELECT name, city FROM users WHERE active = 1
```

活跃用户数：{{users.length}}

## 模板块

```template {output: "report"}
## 报告

日期：{{date}}

AI 摘要：{{summary}}

用户：{{#each users}}{{name}}（{{city}}）{{/each}}
```

{{report}}
