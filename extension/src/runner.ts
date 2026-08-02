/**
 * FlowMD CLI runner
 * 在 VS Code 终端中执行 flowmd 命令（流式输出、可交互）
 */

import * as vscode from 'vscode';

/** 单引号包裹并转义 shell 参数 */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * 在终端中运行 flowmd
 * @param args - flowmd 命令参数（如 ['run', 'file.md', '-o', 'new']）
 * @param cwd - 工作目录
 */
export function runFlowmd(args: string[], cwd: string): void {
  const config = vscode.workspace.getConfiguration('flowmd');
  const command = config.get<string>('commandPath', 'flowmd');
  const terminal = vscode.window.createTerminal({ name: 'FlowMD', cwd });
  terminal.show();
  terminal.sendText([shellQuote(command), ...args.map(shellQuote)].join(' '));
}

/**
 * 取当前编辑器文档的工作目录（工作区根优先，否则文档所在目录）
 * @param document - 文档
 * @returns 工作目录绝对路径
 */
export function workspaceDir(document: vscode.TextDocument): string {
  const folder = vscode.workspace.getWorkspaceFolder(document.uri);
  if (folder) return folder.uri.fsPath;
  const idx = document.uri.fsPath.lastIndexOf('/');
  return idx > 0 ? document.uri.fsPath.slice(0, idx) : process.cwd();
}
