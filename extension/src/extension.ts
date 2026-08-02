/**
 * FlowMD VS Code 扩展入口
 * 命令：Run Document / Run Pipeline；CodeLens ▶ Run 执行按钮
 */

import * as vscode from 'vscode';
import { runFlowmd, workspaceDir } from './runner.js';
import { FlowmdCodeLensProvider } from './codelens.js';

/** 当前活动 Markdown 编辑器（未打开时提示） */
function requireMarkdownEditor(): vscode.TextEditor | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    void vscode.window.showWarningMessage('No active editor.');
    return undefined;
  }
  if (editor.document.languageId !== 'markdown') {
    void vscode.window.showWarningMessage('Open a Markdown (.md) file first.');
    return undefined;
  }
  return editor;
}

/** 运行前保存未保存文档，返回文件路径或 undefined */
async function ensureSaved(editor: vscode.TextEditor): Promise<string | undefined> {
  const document = editor.document;
  if (document.isDirty) {
    const choice = await vscode.window.showWarningMessage('Save the file before running?', 'Save', 'Cancel');
    if (choice !== 'Save') return undefined;
    await document.save();
  }
  return document.uri.fsPath;
}

/**
 * 扩展激活
 * @param context - 扩展上下文
 */
export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('flowmd.runDocument', async () => {
      const editor = requireMarkdownEditor();
      if (!editor) return;
      const file = await ensureSaved(editor);
      if (!file) return;
      runFlowmd(['run', file, '-o', 'new'], workspaceDir(editor.document));
    }),

    vscode.commands.registerCommand('flowmd.runPipeline', async () => {
      const editor = requireMarkdownEditor();
      if (!editor) return;
      const picked = await vscode.window.showOpenDialog({
        canSelectMany: true,
        filters: { Markdown: ['md'] },
        openLabel: 'Select documents to run in order',
      });
      if (!picked || picked.length === 0) return;
      runFlowmd(['pipeline', ...picked.map((uri) => uri.fsPath)], workspaceDir(editor.document));
    })
  );

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { language: 'markdown' },
      new FlowmdCodeLensProvider()
    )
  );
}

/**
 * 扩展停用
 */
export function deactivate(): void {
  // no-op
}
