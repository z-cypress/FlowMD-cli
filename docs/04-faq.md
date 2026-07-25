 # 常见问题

 ## 安装与运行

 **Q: 安装或运行时提示 Node.js 版本问题？**

 FlowMD 需要 Node.js >= 18。检查你的版本：

 ```bash
 node --version
 ```

 如果版本过低，请升级 Node.js。

 **Q: `flowmd` 命令找不到？**

 确认已安装依赖并构建：

 ```bash
 pnpm install && pnpm build
 ```

 如果是全局安装，确认安装路径在 `PATH` 中：

 ```bash
 npm install -g .
 ```

 **Q: 运行时报错 `ERR_MODULE_NOT_FOUND`？**

 确保已执行 `pnpm build` 生成了 `dist/` 目录。如果你使用 `pnpm dev` 模式，确认命令正确：

 ```bash
 pnpm dev -- run file.md
 ```

 ## 配置

 **Q: API Key 无效或未配置？**

 检查环境变量是否生效：

 ```bash
 echo $OPENAI_API_KEY
 ```

 如果为空，设置后重试：

 ```bash
 export OPENAI_API_KEY="sk-your-key"
 flowmd run doc.md
 ```

 也可以通过 `.env` 文件管理：

 ```
 # 在项目根目录创建 .env
 OPENAI_API_KEY=sk-your-key
 ```

 **Q: 如何切换 AI 模型？**

 环境变量方式：

 ```bash
 export FLOW_LLM_MODEL="gpt-4o-mini"
 ```

 或者在文档的 AI 块中临时覆盖：

 ````markdown
 ```ai {model: "gpt-4o-mini"}
 ...
 ```
 ````

 **Q: 如何配置自定义 API 地址（如代理、Ollama、DeepSeek）？**

 ```bash
 export FLOW_LLM_BASE_URL="https://api.deepseek.com/v1"
 ```

 **Q: 如何在 Windows 上设置环境变量？**

 ```cmd
 set OPENAI_API_KEY=sk-your-key
 ```

 或使用 PowerShell：

 ```powershell
 $env:OPENAI_API_KEY="sk-your-key"
 ```

 ## 使用

 **Q: `{{变量}}` 没有被替换？**

 可能的原因：

 1. 没有定义这个变量 — 检查是否有对应的 `{output: "变量名"}` 块在引用之前执行
 2. 变量拼写不一致 — 注意大小写和下划线
 3. 块执行失败 — 被引用的块可能执行出错，导致变量未生成

 使用 `--dry-run` 查看变量依赖关系：

 ```bash
 flowmd run doc.md --dry-run
 ```

 **Q: 数据块报"仅支持 SELECT 查询"？**

 FlowMD 的数据块设计为只读。如果需要修改数据，请直接使用数据库工具。

 另外检查 SQL 语句末尾是否不小心加了分号（`;`），这会触发"禁止执行多条语句"错误。

 **Q: 数据块报"数据源未配置"？**

 确保在 `.flow/config.yml` 中配置了数据源：

 ```yaml
 dataSources:
   default:
     type: sqlite
     filename: "./data.db"
 ```

 并确认数据库文件存在。

 **Q: AI 块耗时很长或超时？**

 检查网络连接，或调整超时时间：

 ```bash
 export FLOW_TIMEOUT=60
 ```

 默认超时是 30 秒。

 **Q: watch 模式没有检测到文件变化？**

 确保监听的是正确的文件路径。watch 模式使用 [chokidar](https://github.com/paulmillr/chokidar)，在某些编辑器（如 vim）的间接保存方式下，可能会延迟检测到变化。

 **Q: 输出模式有什么区别？**

 - `new`（默认）— 生成 `原文件名_日期.md`，不修改原文件
 - `inline` — 覆盖原文件
 - `stdout` — 输出到终端

 **Q: 一个块失败了，会影响其他块吗？**

 默认情况下**不会**。FlowMD 会跳过依赖失败变量（`failedOutputs`）的块，但独立块会继续执行。使用 `--fail-fast` 可以在遇到第一个错误时立即停止。

 ## 项目相关

 **Q: FlowMD 和 Jupyter Notebook 有什么区别？**

 FlowMD 是**文档优先**的。你用 Markdown 写文档，用特殊代码块注入动态能力。Jupyter 是代码优先的，更适合交互式数据分析。FlowMD 适合生成报告、文档、自动化内容处理。

 **Q: 这是开源项目吗？**

 是的，基于 MIT 协议开源。

 **Q: 如何报告问题或提需求？**

 请提交 GitHub Issue。

 **Q: 如何在不同模型或提供商之间切换？**

 在配置文件中使用 `llm.models` 定义命名模型预设，AI 块中通过 `model` 引用。详见[配置指南](02-configuration.md#命名模型预设)。

 **Q: 如何通过命令行注入变量？**

 使用 `--var` 参数：

 ```bash
 flowmd run doc.md --var name=张三 --var project=FlowMD
 ```

 或从文件注入：

 ```bash
 flowmd run doc.md --var-file vars.yml
 ```

 **Q: 如何查看或修改配置？**

 ```bash
 flowmd config              # 查看全部配置
 flowmd config llm.model --set deepseek-chat  # 修改配置项
 ```

 **Q: 如何诊断环境问题？**

 ```bash
 flowmd doctor
 ```

 **Q: `flow config` 和 `flow doctor` 命令是做什么的？**

 `flow config` 用于查看和修改 `.flow/config.yml`；`flow doctor` 用于诊断 Node.js 版本、API Key 配置、环境变量等。

 **Q: 当前 MVP 阶段哪些功能还没有？**

 - MySQL 和 PostgreSQL 数据源
 - 更多的内置模板

 ---

 [返回首页](00-index.md) | [入门指南](01-getting-started.md)
