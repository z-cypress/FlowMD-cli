 # Run Block

 ## Purpose

 The run block executes arbitrary script code in a sandbox and stores the result in the variable context. The result can be used by subsequent AI, data, or template blocks.

 - **js**: strong isolation via isolated-vm (in-process V8 isolate), zero capability by default (no filesystem/network/process APIs)
 - **python**: weak isolation via subprocess + resource limits

 > The js runtime has no extra dependency (isolated-vm ships with the package); the python runtime requires `python3` to be installed on the system.

 ## Syntax

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

 ## Parameters

 | Parameter | Required | Default | Description |
 |-----------|----------|---------|-------------|
 | `runtime` | yes | — | Runtime: `js` \| `python` |
 | `vars` | no | `[]` | Variable names to expose to the sandbox (minimal exposure) |
 | `output` | no | none | Variable name to store the result in |
 | `timeout` | no | global `execution.timeout` | Timeout in seconds, overrides the global default |
 | `memory` | no | js 128MB / python 512MB | Memory limit (MB) |
 | `permissions` | no | `[]` | Reserved; v1.2 only validates it (unknown values error), capability injection is not supported |

 ## Variable Passing

 The sandbox only receives variables explicitly declared in `vars`, so sensitive data in the context (e.g. API keys) does not leak into the script unintentionally.

 - **js**: variables are injected into the sandbox global scope and accessed by name
 - **python**: variables are serialized as JSON and written to the script's stdin; read the whole vars object with `json.load(sys.stdin)` and access by key (e.g. `data["name"]`)

 ````markdown
 ```data {output: "sales"}
 SELECT product, revenue FROM sales WHERE date >= '{{start_date}}'
 ```

 ```run {runtime: "python", vars: ["sales"], output: "summary"}
 import json, sys
 data = json.load(sys.stdin)["sales"]
 print(json.dumps({"top": sorted(data, key=lambda x: -x["revenue"])[0]}))
 ```

 Top seller this week: {{summary.top.product}}
 ````

 ## Result Capture

 - Captures the script's standard output (stdout)
 - **stdout is parseable JSON** → stored structurally in the `output` variable (object/array/string)
 - **stdout is plain text** → stored as a string in `output`
 - Empty stdout with exit code 0 → `output` is an empty string
 - Non-zero exit code or a script exception → the block fails, other independent blocks continue

 ## Security Model

 - **First-run confirmation**: the first time an unconfirmed runtime runs, a safety confirmation is shown. Accepting it records the choice in `.flow/config.yml`; the same runtime is not prompted again
 - **`--yes`**: skip confirmation (for this run)
 - **`--strict`**: always confirm on every run (no persistence)
 - **Resource limits**: timeout kills the script; exceeding the memory limit (isolate limit for js, ulimit for python) terminates it
 - **Zero capability by default**: the js sandbox has no filesystem/network/process access; python is weakly isolated, so document the risk in your docs

 ## Examples

 ### Computation

 ````markdown
 ```run {runtime: "js", output: "stats"}
 const nums = data;
 const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
 console.log(JSON.stringify({ avg, max: Math.max(...nums), min: Math.min(...nums) }));
 ```
 ````

 ### Data + Script Processing

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

 ### Combined with Templates

 ````markdown
 ```run {runtime: "js", vars: ["items"], output: "report"}
 const items = data;
 const total = items.reduce((s, i) => s + i.price, 0);
 console.log(JSON.stringify({ count: items.length, total }));
 ```

 ```template
 ## Summary
 - Items: {{report.count}}
 - Total: ¥{{report.total}}
 ```
 ````

 ---

 [Back to index](../00-index.md) | [Configuration](../02-configuration.md)
