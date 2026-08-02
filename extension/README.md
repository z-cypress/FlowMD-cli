# FlowMD for VS Code

在 VS Code 中执行 [FlowMD](https://github.com/z-cypress/flow-md) 可执行文档：
语法高亮 + 一键执行。扩展通过调用 `flowmd` CLI 工作，需要先安装
[`@z-cypress/flow-md`](https://www.npmjs.com/package/@z-cypress/flow-md)：

```bash
npm install -g @z-cypress/flow-md
```

## 功能

- **语法高亮**：识别 `ai` / `data` / `template` / `include` / `run` / `agent` / `doc`
  代码块，突出块类型关键字与元数据参数（`output` / `goal` / `tools` 等）。
- **▶ Run 执行按钮**：每个 FlowMD 代码块上方的 CodeLens，点击运行整个文档。
- **Run Document**：编辑器标题栏/命令面板，`flowmd run <file> -o new`。
- **Run Pipeline**：命令面板，多选文档按序执行（变量跨文档串联）。

## 使用

1. 打开任意 `.md` 文件
2. 在代码块上方点击 **▶ Run**，或执行命令 **FlowMD: Run Document**
3. 执行过程与输出显示在 **FlowMD** 终端中

## 配置

| 键 | 默认 | 说明 |
|------|------|------|
| `flowmd.commandPath` | `flowmd` | `flowmd` 可执行文件路径（未在 PATH 时设置） |

## 开发

```bash
npm install        # 安装 @types/vscode 等
npm run compile    # 编译到 dist/
```

在 VS Code 中按 `F5` 打开 Extension Development Host 调试。

## 打包发布

```bash
npm install -g @vscode/vsce
vsce package       # 生成 .vsix
```
