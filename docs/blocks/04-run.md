 # run 块

 ## 功能

 run 块在沙箱中执行任意脚本代码，将结果存入变量上下文。结果可被后续的 AI 块、数据块或模板块使用。

 - **js**：基于 isolated-vm 的强隔离沙箱（进程内 V8 isolate），默认零能力（无文件系统/网络/进程 API）
 - **python**：子进程 + 资源限制的弱隔离沙箱

 > js runtime 无需额外依赖（isolated-vm 随包安装）；python runtime 需要系统已安装 `python3`。

 ## 语法

 ````markdown
 ```run {runtime: "python", vars: ["weekly_stats"], output: "result"}
 import json, sys
 data = json.load(sys.stdin)["weekly_stats"]
 print(json.dumps({"total": sum(x["revenue"] for x in data)}))
 ```
 ````

 ````markdown
 ```run {runtime: "js", output: "greeting"}
 console.log(JSON.stringify({ hello: name }))
 ```
 ````

 ## 参数

 | 参数 | 必填 | 默认值 | 说明 |
 |------|------|--------|------|
 | `runtime` | 是 | — | 运行环境：`js` \| `python` |
 | `vars` | 否 | `[]` | 显式声明传入沙箱的变量名列表（最小暴露） |
 | `output` | 否 | 无 | 结果存入的变量名 |
 | `timeout` | 否 | 全局 `execution.timeout` | 超时秒数，可覆盖全局默认 |
 | `memory` | 否 | js 128MB / python 512MB | 内存上限（MB） |
 | `permissions` | 否 | `[]` | 预留字段，v1.2 仅校验（未知值报错），不支持能力注入 |

 ## 变量传入

 沙箱只接收 `vars` 中显式声明的变量，避免上下文中的敏感数据（如 API Key）无意流入脚本。

 - **js**：变量注入到沙箱全局作用域，直接按名称访问
 - **python**：变量序列化为 JSON 写入脚本的标准输入，脚本用 `json.load(sys.stdin)` 读取整个变量对象后按键访问（如 `data["name"]`）

 ````markdown
 ```data {output: "sales"}
 SELECT product, revenue FROM sales WHERE date >= '{{start_date}}'
 ```

 ```run {runtime: "python", vars: ["sales"], output: "summary"}
 import json, sys
 data = json.load(sys.stdin)["sales"]
 print(json.dumps({"top": sorted(data, key=lambda x: -x["revenue"])[0]}))
 ```

 本周最畅销：{{summary.top.product}}
 ````

 ## 结果捕获

 - 捕获脚本的标准输出（stdout）
 - **stdout 可解析为 JSON** → 结构化存入 `output` 变量（对象/数组/字符串）
 - **stdout 为纯文本** → 作为字符串存入 `output`
 - stdout 为空且退出码为 0 → `output` 为空字符串
 - 非零退出码或脚本抛异常 → 块失败，不影响文档中其他独立块

 ## 安全模型

 - **首次确认**：未在 `.flow/config.yml` 中确认过的 runtime，首次执行前会弹出安全确认，同意后记忆，之后同 runtime 不再询问
 - **`--yes`**：跳过确认（本次运行）
 - **`--strict`**：强制每次执行都确认（不记忆）
 - **资源限制**：超时强杀；内存超限（js 由 isolate 限制，python 由 ulimit 限制）即终止
 - **零权限默认**：js 沙箱无文件系统/网络/进程访问能力；python 为弱隔离，请在文档中明示风险

 ## 示例

 ### 计算型任务

 ````markdown
 ```run {runtime: "js", output: "stats"}
 const nums = data;
 const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
 console.log(JSON.stringify({ avg, max: Math.max(...nums), min: Math.min(...nums) }));
 ```
 ````

 ### 数据 + 脚本处理

 ````markdown
 ```data {output: "logs"}
 SELECT level, message, ts FROM logs WHERE ts >= '{{date}}'
 ```

 ```run {runtime: "python", vars: ["logs"], output: "errors"}
 import json, sys
 logs = json.load(sys.stdin)["logs"]
 errors = [l for l in logs if l["level"] == "ERROR"]
 print(json.dumps(errors))
 ```
 ````

 ### 与模板组合

 ````markdown
 ```run {runtime: "js", vars: ["items"], output: "report"}
 const items = data;
 const total = items.reduce((s, i) => s + i.price, 0);
 console.log(JSON.stringify({ count: items.length, total }));
 ```

 ```template
 ## 汇总
 - 条目数：{{report.count}}
 - 总价：¥{{report.total}}
 ```
 ````

 ---

 [返回首页](../00-index.md) | [配置指南](../02-configuration.md)
