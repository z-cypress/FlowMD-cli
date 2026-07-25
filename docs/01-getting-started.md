 # 入门指南

 ## 前置条件

 - **Node.js** >= 18
 - **pnpm**（推荐）或 npm
 - 一个文本编辑器（VS Code 推荐）
 - （使用 AI 块时）OpenAI 或 Anthropic 的 API Key

 ## 安装

 ```bash
 # 克隆项目并安装依赖
 git clone <repo-url>
 cd FlowMD-cli
 pnpm install

 # 构建
 pnpm build

 # 全局安装（可选，方便在任何目录使用）
 npm install -g .
 ```

 验证安装：

 ```bash
 flowmd --version
 ```

 ## 配置 AI

 > 如果只使用数据块和模板块，可以跳过这一步。

 FlowMD 支持 OpenAI 和 Anthropic 两种 LLM 提供商。配置方式有两种：

 **方式一：环境变量（推荐）**

 ```bash
 export OPENAI_API_KEY="sk-your-api-key"
 ```

 **方式二：初始化项目配置**

 ```bash
 flowmd init

 # 环境诊断
 flowmd doctor
 ```

 这会创建 `.flow/` 目录。编辑 `.flow/config.yml`：

 ```yaml
 llm:
   provider: openai          # openai 或 anthropic
   model: gpt-4o             # 模型名称
   temperature: 0.7          # 生成温度
 ```

 然后在 `.flow/credentials.yml` 中填入 API Key（参考 `.flow/credentials.yml.example`）。

 ## 创建第一个文档

 ```bash
 flowmd new hello
 ```

 这会创建一个 `hello.md` 文件，包含 AI 块的基本模板：

 ````markdown
 # hello

 ## 概述

 描述本文档的目的。

 ## AI 分析

 ```ai {model: "gpt-4o", output: "summary"}
 分析以下内容并提供见解：
 在此输入你的内容
 ```

 ## 总结

 {{summary}}

 ---
 *由 FlowMD 于 {{date}} 生成*
 ````

 也可以手动创建文件。最简单的文档只需要一个 AI 块和一个变量引用。

 ## 运行文档

 ```bash
 flowmd run hello.md
 ```

 控制台会显示执行进度。执行完成后，默认会在当前目录生成一个带日期的新文件（如 `hello_2026-07-26.md`）。

 其他输出模式：

 ```bash
 # 输出到终端
 flowmd run hello.md -o stdout

 # 注入自定义变量
 flowmd run hello.md -o stdout --var name=张三 --var project=FlowMD

 # 从文件注入变量
 flowmd run hello.md -o stdout --var-file vars.yml

 # 覆盖原文件
 flowmd run hello.md -o inline
 ```

 ## 理解执行流程

 FlowMD 的核心流程：

 1. **解析** — 读取 Markdown 文件，提取 `ai`、`data`、`template` 代码块
 2. **执行** — 按文档顺序依次执行每个块，结果存入变量上下文
 3. **渲染** — 将文档正文中的 `{{变量}}` 替换为实际值
 4. **输出** — 根据输出模式写入新文件、覆盖原文件或输出到终端

 变量是关键：一个块的输出可以通过 `{{变量名}}` 传递给后面的块或文档正文。

 ## 下一步

 - 了解 [三种块类型](blocks/01-ai.md) 的详细用法
 - 深入学习 [配置项](02-configuration.md)
 - 查看 [完整示例](03-examples.md)

 ---

 [返回首页](00-index.md)
