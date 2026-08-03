/**
 * Web IDE 单页（ADR-011/012/013/014）
 * 随 serve 内置：GET / 返回此 HTML。零构建步骤，前端依赖经 esm.sh CDN 按需加载。
 * v2：debug 复选框（agent/doc 步骤轨迹）、示例加载、执行块统计
 * v3：CodeMirror 6 编辑器（markdown 高亮 + 行号 + FlowMD 块/variable 高亮）
 */

/**
 * Web IDE HTML 单页
 * CodeMirror 编辑器 + 分栏预览；模板下拉、变量 key-value 表格、release/debug 复选框、示例按钮、执行按钮
 */
export const WEB_IDE_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>FlowMD Web IDE</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; color: #1f2328; height: 100vh; display: flex; flex-direction: column; }
  header { padding: 10px 16px; background: #24292f; color: #fff; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  header h1 { font-size: 16px; margin-right: 8px; }
  header label { font-size: 13px; display: flex; align-items: center; gap: 4px; }
  header select, header input[type="text"] { padding: 4px 6px; border-radius: 4px; border: 1px solid #d0d7de; font-size: 13px; }
  #run-btn { padding: 5px 14px; background: #1f883d; color: #fff; border: none; border-radius: 5px; font-size: 13px; cursor: pointer; }
  #run-btn:hover { background: #1a7f37; }
  #run-btn:disabled { opacity: 0.6; cursor: default; }
  #example-btn { padding: 4px 10px; background: #0969da; color: #fff; border: none; border-radius: 5px; font-size: 12px; cursor: pointer; }
  #example-btn:hover { background: #0968da; }
  #vars-panel { padding: 8px 16px; background: #f6f8fa; border-bottom: 1px solid #d0d7de; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  #vars-panel span { font-size: 12px; color: #57606a; }
  .var-row { display: flex; gap: 6px; align-items: center; }
  .var-row input { padding: 3px 6px; border: 1px solid #d0d7de; border-radius: 4px; font-size: 12px; width: 160px; }
  .var-row .del { background: none; border: none; color: #cf222e; cursor: pointer; font-size: 14px; }
  #add-var { background: none; border: 1px dashed #afb8c1; color: #57606a; border-radius: 4px; padding: 3px 8px; font-size: 12px; cursor: pointer; }
  main { flex: 1; display: flex; min-height: 0; }
  .pane { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  .pane-header { padding: 6px 12px; font-size: 12px; color: #57606a; background: #f6f8fa; border-bottom: 1px solid #d0d7de; }
  #editor-host { flex: 1; overflow: auto; border: none; }
  #editor-host .cm-editor { height: 100%; font-size: 13px; line-height: 1.6; }
  #editor-host .cm-scroller { font-family: "SF Mono", Menlo, Consolas, monospace; }
  /* FlowMD 块头与变量的自定义高亮 */
  #editor-host .cm-flowmd-fence { color: #0969da; font-weight: 600; }
  #editor-host .cm-flowmd-var { color: #cf222e; }
  #preview { flex: 1; padding: 12px; overflow: auto; font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 13px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; }
  #preview.error { color: #cf222e; }
  .status { padding: 4px 12px; font-size: 12px; color: #1f2328; background: #dafbe1; border-top: 1px solid #1a7f37; display: none; }
  .status.warn { background: #fff8c5; border-top-color: #d4a72c; color: #7d4e00; }
  .status.error { background: #ffebe9; border-top-color: #cf222e; color: #cf222e; }
  .status.visible { display: block; }
</style>
</head>
<body>
<header>
  <h1>FlowMD Web IDE</h1>
  <label>模板:
    <select id="template-select"><option value="">— 选择模板 —</option></select>
  </label>
  <label><input type="checkbox" id="release-check"> release</label>
  <label><input type="checkbox" id="debug-check"> debug（显示 agent 步骤轨迹）</label>
  <button id="example-btn">示例</button>
  <button id="run-btn">▶ 执行</button>
</header>

<div id="vars-panel">
  <span>变量 (--var):</span>
  <div id="var-rows"></div>
  <button id="add-var">+ 添加变量</button>
</div>

<main>
  <div class="pane">
    <div class="pane-header">Markdown</div>
    <div id="editor-host"></div>
  </div>
  <div class="pane">
    <div class="pane-header">执行结果</div>
    <pre id="preview">点击"执行"查看结果</pre>
  </div>
</main>

<div class="status" id="status"></div>

<script type="module">
import { basicSetup, EditorView } from 'https://esm.sh/codemirror@6.0.1';
import { EditorState, Decoration } from 'https://esm.sh/@codemirror/state@6.4.1';
import { ViewPlugin } from 'https://esm.sh/@codemirror/view@6.24.0';
import { markdown } from 'https://esm.sh/@codemirror/lang-markdown@6.2.5';

(function () {
  var host = document.getElementById('editor-host');
  var preview = document.getElementById('preview');
  var releaseCheck = document.getElementById('release-check');
  var debugCheck = document.getElementById('debug-check');
  var templateSelect = document.getElementById('template-select');
  var status = document.getElementById('status');
  var varRows = document.getElementById('var-rows');
  var addVarBtn = document.getElementById('add-var');
  var runBtn = document.getElementById('run-btn');
  var exampleBtn = document.getElementById('example-btn');

  // ---- CodeMirror 自定义高亮：FlowMD 块头 + {{变量}} ----
  var flowmdTheme = EditorView.baseTheme({
    '.cm-flowmd-fence': { color: '#0969da', fontWeight: '600' },
    '.cm-flowmd-var': { color: '#cf222e' }
  });

  var flowmdHighlightPlugin = ViewPlugin.fromClass(
    class {
      constructor(view) { this.decorations = this.build(view); }
      update(update) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = this.build(update.view);
        }
      }
      build(view) {
        var ranges = [];
        var text = view.state.doc.toString();
        var re = /(\`\`\`(?:ai|data|template|include|run|agent|doc)\b[^\n]*)|({{[^{} \n][^{}\n]*}})/g;
        var m;
        while ((m = re.exec(text)) !== null) {
          if (m[1]) {
            ranges.push(Decoration.mark({ class: 'cm-flowmd-fence' }).range(m.index, m.index + m[1].length));
          } else if (m[2]) {
            ranges.push(Decoration.mark({ class: 'cm-flowmd-var' }).range(m.index, m.index + m[2].length));
          }
        }
        return Decoration.set(ranges);
      }
    },
    { decorations: function (v) { return v.decorations; } }
  );

  function createEditor(doc) {
    var state = EditorState.create({
      doc: doc,
      extensions: [
        basicSetup,
        markdown(),
        EditorView.lineWrapping,
        flowmdTheme,
        flowmdHighlightPlugin
      ]
    });
    return new EditorView({ state: state, parent: host });
  }

  var editor = createEditor('# 在这里编写 FlowMD 文档...\n\n\`\`\`ai {output: "summary"}\n分析内容\n\`\`\`\n\n{{summary}}');
  function getValue() { return editor.state.doc.toString(); }
  function setValue(content) {
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: content } });
  }

  function showStatus(msg, kind) {
    status.textContent = msg;
    status.className = 'status visible' + (kind ? ' ' + kind : '');
  }
  function clearStatus() {
    status.textContent = '';
    status.className = 'status';
  }

  function addVarRow(key, value) {
    var row = document.createElement('div');
    row.className = 'var-row';
    var k = document.createElement('input');
    k.type = 'text'; k.placeholder = '键'; k.value = key || '';
    var v = document.createElement('input');
    v.type = 'text'; v.placeholder = '值（数组/对象可粘贴 JSON 字符串）'; v.value = value || '';
    var del = document.createElement('button');
    del.className = 'del'; del.textContent = '✕';
    del.addEventListener('click', function () { row.remove(); });
    row.appendChild(k); row.appendChild(v); row.appendChild(del);
    varRows.appendChild(row);
  }

  function collectVars() {
    var vars = {};
    varRows.querySelectorAll('.var-row').forEach(function (row) {
      var inputs = row.querySelectorAll('input');
      var key = inputs[0].value.trim();
      if (key) vars[key] = inputs[1].value;
    });
    return vars;
  }

  // 示例文档：展示 agent 块（direct 适配器）+ 模板块
  var EXAMPLE = [
    '# 示例：agent 块',
    '',
    '\`\`\`agent {goal: "总结 FlowMD 的核心能力", adapter: "direct", output: "summary"}',
    'FlowMD 是执行 Markdown 中特殊代码块的 CLI：ai/data/template/run/agent/doc 块按序执行，变量用 {{var}} 引用。请用 3 句话总结它的价值。',
    '\`\`\`',
    '',
    '## 核心能力',
    '',
    '{{summary}}',
    '',
    '## 模板块示例',
    '',
    '\`\`\`template {output: "report"}',
    '# 报告 ({{date}})',
    '',
    '{{summary}}',
    '\`\`\`',
    '',
    '{{report}}'
  ].join('\n');

  // 加载模板列表
  var templatesContent = {};
  fetch('/templates').then(function (res) { return res.json(); }).then(function (json) {
    if (!json.ok) return;
    templatesContent = json.data.content || {};
    var templates = json.data.templates || [];
    templates.forEach(function (name) {
      var opt = document.createElement('option');
      opt.value = name; opt.textContent = name;
      templateSelect.appendChild(opt);
    });
  }).catch(function () { /* 模板下拉不可用则隐藏 */ });

  templateSelect.addEventListener('change', function () {
    var name = templateSelect.value;
    if (!name) return;
    var content = templatesContent[name];
    if (content) {
      setValue(content);
      clearStatus();
    } else {
      showStatus('模板内容不可用: ' + name, 'warn');
    }
  });

  exampleBtn.addEventListener('click', function () {
    setValue(EXAMPLE);
    clearStatus();
  });

  addVarBtn.addEventListener('click', function () { addVarRow(); });
  addVarRow();

  runBtn.addEventListener('click', function () {
    var markdown = getValue();
    if (!markdown.trim()) {
      showStatus('编辑区为空', 'warn');
      return;
    }
    clearStatus();
    preview.textContent = '执行中...';
    preview.classList.remove('error');
    runBtn.disabled = true;

    fetch('/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        markdown: markdown,
        vars: collectVars(),
        release: releaseCheck.checked,
        debug: debugCheck.checked,
        quiet: true
      })
    }).then(function (res) { return res.json(); }).then(function (json) {
      if (!json.ok) {
        preview.textContent = '错误: ' + (json.error || '未知错误');
        preview.classList.add('error');
        return;
      }
      var data = json.data;
      preview.textContent = data.content;
      if (data.hasError) {
        preview.classList.add('error');
        showStatus('部分块执行失败', 'error');
      } else {
        preview.classList.remove('error');
      }
      if (data.blocks) {
        var b = data.blocks;
        showStatus('共 ' + b.total + ' 个块：' + b.success + ' 成功 / ' + b.failed + ' 失败' +
          (debugCheck.checked ? '（debug 模式）' : ''), data.hasError ? 'warn' : '');
      }
    }).catch(function (err) {
      preview.textContent = '请求失败: ' + String(err);
      preview.classList.add('error');
    }).finally(function () {
      runBtn.disabled = false;
    });
  });
})();
</script>
</body>
</html>
`;
