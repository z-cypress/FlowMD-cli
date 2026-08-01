# include 指令

## 功能

include 指令把外部文件原地引入当前文档：

- **引入 `.md` 文档**：被引入文件的代码块在当前文档中执行，与主文档共享变量上下文
- **引入 `.yaml` / `.yml` 变量文件**：把文件内容作为变量注入上下文，供后续块使用

include 常用于复用公共提示词、共享数据查询、拆分大型文档。

## 语法

````markdown
```include {path: "./shared-prompts.md"}
```
````

````markdown
```include {path: "./vars.yaml"}
```
````

| 参数 | 必填 | 说明 |
|------|------|------|
| `path` | 是 | 外部文件路径（相对当前文档所在目录） |

## 引入 Markdown 文档

被引入的 `.md` 文件中的代码块会在主文档当前位置原地执行，与主文档共享同一个变量上下文（前序块产生的变量可用，产生的变量也能被后续块使用）。

````markdown
<!-- main.md -->
```include {path: "./prompts/analysis.md"}
```

```ai {output: "result"}
{{analysis_prompt}}
```
````

````markdown
<!-- prompts/analysis.md -->
```ai {output: "analysis_prompt"}
你是一位资深数据分析师，请用简洁的语言分析以下数据：
```
````

### 嵌套 include

被引入的文档可以继续 include 其它文档，深度无硬限制（循环引用会被检测并报错）。

## 引入变量文件（YAML）

引入 `.yaml` / `.yml` 文件时，文件的顶层键会作为变量注入上下文：

````markdown
<!-- vars.yaml -->
name: 张三
role: 数据分析师
thresholds:
  low: 60
  high: 90
````

````markdown
```include {path: "./vars.yaml"}
```

{{name}}（{{role}}）
````

> 变量值也可以是嵌套对象，用 `{{thresholds.high}}` 深层路径访问。

## 安全规则

- **扩展名白名单**：只允许 `.md` / `.yaml` / `.yml`
- **路径越界限制**：只能引入项目目录（`process.cwd()`）内的文件
- **循环引用检测**：A include B、B 又 include A 时会报错

## 执行模式兼容

include 继承全部执行模式（dry-run / step / fail-fast / debug / release）。

---

[返回首页](../00-index.md) | [配置指南](../02-configuration.md)
