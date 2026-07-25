# FlowMD 测试数据

## 文件说明

| 文件 | 用途 |
|------|------|
| basic-example.md | 三种块基本流程，全部有 output |
| data-example.md | 数据查询 + 模板渲染 |
| template-example.md | Handlebars 语法：each、json helper |
| complex-example.md | 多步骤工作流：data → ai → template |
| no-output.md | 无 output 参数的块（用于验证 pre-check） |
| error-example.md | 错误处理：SQL 安全检查、缺失数据源 |
| nested-vars.md | 嵌套变量 + 单行/多行数据 |
| unicode-example.md | 中文等多语言内容 |
| simple.md | 纯文本文档，无代码块 |

## 测试数据库

运行 `setup-db.ts` 创建：

```bash
npx tsx test-data/setup-db.ts
```

包含表：users（4 条）、products（4 条）、sales（7 条）

## 运行测试

```bash
# 逐个运行
flowmd run test-data/basic-example.md -o stdout
flowmd run test-data/data-example.md -o stdout

# 批量运行
npx tsx test-data/run-all-tests.ts
```

数据块文档需要先配置 `.flow/config.yml` 中的 `dataSources.default.filename`。
