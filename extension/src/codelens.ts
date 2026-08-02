/**
 * FlowMD CodeLens provider
 * 在每个 FlowMD 代码块（```ai / ```data / ```agent / ```doc 等）上显示 ▶ Run 执行按钮
 */

import * as vscode from 'vscode';

/** FlowMD 块类型前缀 */
const BLOCK_RE = /^```(ai|data|template|include|run|agent|doc)\b/gm;

/**
 * CodeLens provider：扫描 FlowMD 代码块并在其围栏行显示 ▶ Run
 */
export class FlowmdCodeLensProvider implements vscode.CodeLensProvider {
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const lenses: vscode.CodeLens[] = [];
    const text = document.getText();
    BLOCK_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = BLOCK_RE.exec(text)) !== null) {
      const line = document.positionAt(match.index).line;
      const range = new vscode.Range(line, 0, line, match[0].length);
      lenses.push(new vscode.CodeLens(range, {
        title: '▶ Run',
        tooltip: 'FlowMD: run this document',
        command: 'flowmd.runDocument',
        arguments: [],
      }));
    }
    return lenses;
  }
}
