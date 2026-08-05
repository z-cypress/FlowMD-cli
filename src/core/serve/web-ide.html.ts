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
  #editor-host .cm-error-line { background: rgba(207, 34, 46, 0.12); }
  #vars-btn { margin-left: 8px; padding: 1px 8px; font-size: 11px; border: 1px solid #d0d7de; border-radius: 3px; background: #fff; color: #57606a; cursor: pointer; }
  #vars-btn.active { background: #0969da; color: #fff; border-color: #0969da; }
  #history-btn { margin-left: 8px; padding: 1px 8px; font-size: 11px; border: 1px solid #d0d7de; border-radius: 3px; background: #fff; color: #57606a; cursor: pointer; }
  #history-btn.active { background: #8250df; color: #fff; border-color: #8250df; }
  #preview { flex: 1; padding: 12px; overflow: auto; font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 13px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; }
  #preview.error { color: #cf222e; }
  .status { padding: 4px 12px; font-size: 12px; color: #1f2328; background: #dafbe1; border-top: 1px solid #1a7f37; display: none; }
  .status.warn { background: #fff8c5; border-top-color: #d4a72c; color: #7d4e00; }
  .status.error { background: #ffebe9; border-top-color: #cf222e; color: #cf222e; }
  .status.visible { display: block; }
  /* 块级执行按钮（gutter） */
  #editor-host .cm-gutters .cm-lineNumbers { min-width: 42px; }
  .cm-block-run { margin-left: 2px; padding: 0 5px; font-size: 11px; line-height: 16px; border: 1px solid #1f883d; border-radius: 4px; background: #dafbe1; color: #1f883d; cursor: pointer; user-select: none; }
  .cm-block-run:hover { background: #1f883d; color: #fff; }
  .cm-block-run.running { opacity: 0.6; cursor: default; }
  /* 历史面板 */
  #history-panel { display: none; position: fixed; right: 12px; top: 52px; width: 360px; max-height: calc(100vh - 80px); background: #fff; border: 1px solid #d0d7de; border-radius: 8px; box-shadow: 0 8px 24px rgba(140,149,159,0.2); z-index: 100; overflow: hidden; flex-direction: column; }
  #history-panel.visible { display: flex; }
  #history-panel .hp-header { padding: 8px 12px; font-size: 13px; font-weight: 600; background: #f6f8fa; border-bottom: 1px solid #d0d7de; display: flex; justify-content: space-between; align-items: center; }
  #history-panel .hp-body { overflow: auto; padding: 8px; }
  .hp-item { border: 1px solid #d0d7de; border-radius: 6px; padding: 8px 10px; margin-bottom: 8px; cursor: pointer; font-size: 12px; }
  .hp-item:hover { border-color: #0969da; }
  .hp-item .hp-meta { display: flex; justify-content: space-between; color: #57606a; margin-bottom: 4px; }
  .hp-item .hp-blocks { display: flex; gap: 4px; flex-wrap: wrap; }
  .hp-block-chip { font-size: 10px; padding: 1px 6px; border-radius: 10px; border: 1px solid #d0d7de; color: #57606a; }
  .hp-block-chip.ok { color: #1a7f37; border-color: #1a7f37; }
  .hp-block-chip.fail { color: #cf222e; border-color: #cf222e; }
  .hp-detail { margin-top: 6px; border-top: 1px dashed #d0d7de; padding-top: 6px; font-size: 11px; color: #57606a; white-space: pre-wrap; word-break: break-word; }
  .hp-empty { color: #57606a; text-align: center; padding: 24px 0; font-size: 12px; }
  /* 块级执行结果覆盖层 */
  #block-result-overlay { display: none; position: fixed; left: 50%; top: 45%; transform: translate(-50%, -50%); width: min(640px, 90vw); max-height: 70vh; background: #fff; border: 1px solid #d0d7de; border-radius: 8px; box-shadow: 0 8px 24px rgba(140,149,159,0.3); z-index: 200; overflow: hidden; flex-direction: column; }
  #block-result-overlay.visible { display: flex; }
  #block-result-overlay .bro-header { padding: 8px 12px; font-size: 13px; font-weight: 600; background: #f6f8fa; border-bottom: 1px solid #d0d7de; display: flex; justify-content: space-between; align-items: center; }
  #block-result-overlay .bro-body { overflow: auto; padding: 12px; font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 12px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
  #block-result-overlay .bro-body.error { color: #cf222e; }
  #block-result-overlay .bro-close { background: none; border: none; font-size: 16px; color: #57606a; cursor: pointer; }
  .overlay-mask { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.2); z-index: 150; }
  .overlay-mask.visible { display: block; }
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
  <label><input type="checkbox" id="auto-run-check"> 自动执行（编辑后实时预览）</label>
  <button id="example-btn">示例</button>
  <button id="run-btn">▶ 执行</button>
</header>

<div id="vars-panel">
  <span>变量 (--var):</span>
  <div id="var-rows"></div>
  <button id="add-var">+ 添加变量</button>
</div>

<div class="overlay-mask" id="overlay-mask"></div>

<!-- 块级执行结果覆盖层 -->
<div id="block-result-overlay">
  <div class="bro-header"><span id="bro-title">块执行结果</span><button class="bro-close" id="bro-close">✕</button></div>
  <div class="bro-body" id="bro-body"></div>
</div>

<!-- 历史面板 -->
<div id="history-panel">
  <div class="hp-header"><span>执行历史</span><button class="bro-close" id="history-close">✕</button></div>
  <div class="hp-body" id="history-body"><div class="hp-empty">加载中...</div></div>
</div>

<main>
  <div class="pane">
    <div class="pane-header">Markdown</div>
    <div id="editor-host"></div>
  </div>
  <div class="pane">
    <div class="pane-header">执行结果 <button id="vars-btn" title="切换查看变量">变量</button> <button id="history-btn" title="查看执行历史">历史</button></div>
    <pre id="preview">点击"执行"查看结果</pre>
  </div>
</main>

<div class="status" id="status"></div>

<script type="module">
import { basicSetup, EditorView } from 'https://esm.sh/codemirror@6.0.1';
import { EditorState, Decoration, StateEffect, StateField } from 'https://esm.sh/@codemirror/state@6.4.1';
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
  var varsBtn = document.getElementById('vars-btn');
  var historyBtn = document.getElementById('history-btn');
  var autoRunCheck = document.getElementById('auto-run-check');
  var lastVariables = null;
  var showVars = false;

  // 历史面板元素
  var historyPanel = document.getElementById('history-panel');
  var historyBody = document.getElementById('history-body');
  var historyClose = document.getElementById('history-close');
  var overlayMask = document.getElementById('overlay-mask');
  var broOverlay = document.getElementById('block-result-overlay');
  var broTitle = document.getElementById('bro-title');
  var broBody = document.getElementById('bro-body');
  var broClose = document.getElementById('bro-close');

  // ---- 失败块行号状态（供编辑器错误行标红）----
  var setErrors = StateEffect.define();
  var errorField = StateField.define({
    create: function () { return new Set(); },
    update: function (set, tr) {
      for (var i = 0; i < tr.effects.length; i++) {
        if (tr.effects[i].is(setErrors)) return tr.effects[i].value;
      }
      return set;
    }
  });

  // ---- CodeMirror 自定义高亮：FlowMD 块头 + {{变量}} + 错误行 ----
  var flowmdTheme = EditorView.baseTheme({
    '.cm-flowmd-fence': { color: '#0969da', fontWeight: '600' },
    '.cm-flowmd-var': { color: '#cf222e' },
    '.cm-error-line': { backgroundColor: 'rgba(207, 34, 46, 0.12)' }
  });

  var flowmdHighlightPlugin = ViewPlugin.fromClass(
    class {
      constructor(view) { this.decorations = this.build(view); }
      update(update) {
        if (update.docChanged || update.viewportChanged ||
            update.state.field(errorField) !== update.startState.field(errorField)) {
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
        // 失败块行标红
        var errors = view.state.field(errorField);
        if (errors && errors.size > 0) {
          errors.forEach(function (lineNo) {
            var line = view.state.doc.line(Math.min(lineNo, view.state.doc.lines));
            ranges.push(Decoration.line({ class: 'cm-error-line' }).range(line.from, line.from));
          });
        }
        return Decoration.set(ranges);
      }
    },
    { decorations: function (v) { return v.decorations; } }
  );

  // 块级执行按钮：在 FlowMD 块起始行前插入 ▶ 按钮
  // 需要 DOM widget（含事件），这里用 widgetDecoration 注入

  // 解析当前文档中的 FlowMD 块（块类型 + 起始行号 + 结束行号）
  function parseBlocksInDoc(text) {
    var blocks = [];
    var re = /\`\`\`(ai|data|template|include|run|agent|doc)\b[^\n]*\n([^]*?)(?:\`\`\`)/g;
    var m;
    while ((m = re.exec(text)) !== null) {
      var lineStart = text.slice(0, m.index).split('\n').length;
      blocks.push({ type: m[1], line: lineStart });
    }
    return blocks;
  }

  // 用 widget 在块起始行行首插入执行按钮
  var blockRunPlugin = ViewPlugin.fromClass(
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
        var blocks = parseBlocksInDoc(text);
        var lines = view.state.doc;
        for (var i = 0; i < blocks.length; i++) {
          var lineNo = blocks[i].line;
          if (lineNo <= 0 || lineNo > lines.lines) continue;
          var line = lines.line(lineNo);
          var idx = i;
          var btn = document.createElement('button');
          btn.className = 'cm-block-run';
          btn.textContent = '▶';
          btn.title = '单独执行此块 (' + blocks[i].type + ')';
          btn.addEventListener('click', function (e) {
            e.stopPropagation();
            runSingleBlock(idx, btn);
          });
          var widget = Decoration.widget({
            widget: {
              toDOM: function () { return btn; },
              eq: function () { return false; },
              destroy: function () { if (btn && btn.parentNode) btn.parentNode.removeChild(btn); },
              ignoreEvent: function () { return true; }
            },
            side: 1
          });
          ranges.push(widget.range(line.from));
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
        flowmdHighlightPlugin,
        blockRunPlugin,
        errorField,
        EditorView.updateListener.of(function () { scheduleAutoRun(); })
      ]
    });
    return new EditorView({ state: state, parent: host });
  }

  var editor = createEditor('# 在这里编写 FlowMD 文档...\n\n\`\`\`ai {output: "summary"}\n分析内容\n\`\`\`\n\n{{summary}}');
  function getValue() { return editor.state.doc.toString(); }
  function setValue(content) {
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: content } });
  }

  // 自动执行（热重载）：编辑内容后 debounce 800ms 自动运行
  var autoRunTimer = null;
  function scheduleAutoRun() {
    if (autoRunCheck && autoRunCheck.checked) {
      if (autoRunTimer) clearTimeout(autoRunTimer);
      autoRunTimer = setTimeout(doRun, 800);
    }
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

  function doRun() {
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
      lastVariables = data.variables || null;
      showVars = false;
      varsBtn.classList.remove('active');
      preview.textContent = data.content;
      if (data.hasError) {
        preview.classList.add('error');
        showStatus('部分块执行失败', 'error');
      } else {
        preview.classList.remove('error');
      }
      // 失败块行号 → 编辑器标红
      var lines = new Set();
      (data.failedBlocks || []).forEach(function (fb) {
        if (fb.line) lines.add(fb.line);
      });
      editor.dispatch({ effects: setErrors.of(lines) });
      if (data.blocks) {
        var b = data.blocks;
        var msg = '共 ' + b.total + ' 个块：' + b.success + ' 成功 / ' + b.failed + ' 失败';
        if (data.failedBlocks && data.failedBlocks.length > 0) {
          msg += '（失败行已标红）';
        }
        showStatus(msg + (debugCheck.checked ? '（debug 模式）' : ''), data.hasError ? 'warn' : '');
      }
    }).catch(function (err) {
      preview.textContent = '请求失败: ' + String(err);
      preview.classList.add('error');
    }).finally(function () {
      runBtn.disabled = false;
    });
  }

  runBtn.addEventListener('click', doRun);

  // ---- 块级单独执行 ----
  function runSingleBlock(index, btn) {
    var markdown = getValue();
    var blocks = parseBlocksInDoc(markdown);
    if (!blocks[index]) {
      showStatus('块索引 ' + index + ' 超出范围', 'warn');
      return;
    }
    var blockLabel = blocks[index].type;
    btn.classList.add('running');
    btn.textContent = '…';
    showStatus('正在执行块 #' + (index + 1) + ' (' + blockLabel + ')...');

    fetch('/execute-block', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        markdown: markdown,
        index: index,
        vars: collectVars(),
        debug: debugCheck.checked
      })
    }).then(function (res) { return res.json(); }).then(function (json) {
      btn.classList.remove('running');
      btn.textContent = '▶';
      if (!json.ok) {
        showBlockResult('块 #' + (index + 1) + ' (' + blockLabel + ')', '错误: ' + (json.error || '未知错误'), true);
        return;
      }
      var data = json.data;
      var title = '块 #' + (index + 1) + ' (' + data.type + ')' + (data.success ? ' ✓' : ' ✗') + '  ' + (data.duration_ms || data.duration || 0) + 'ms';
      if (data.success) {
        showBlockResult(title, data.output || '（空输出）', false);
      } else {
        showBlockResult(title, '执行失败: ' + (data.error || '未知错误'), true);
      }
    }).catch(function (err) {
      btn.classList.remove('running');
      btn.textContent = '▶';
      showBlockResult('块 #' + (index + 1), '请求失败: ' + String(err), true);
    });
  }

  function showBlockResult(title, body, isError) {
    broTitle.textContent = title;
    broBody.textContent = body;
    broBody.className = 'bro-body' + (isError ? ' error' : '');
    broOverlay.classList.add('visible');
    overlayMask.classList.add('visible');
  }

  function hideBlockResult() {
    broOverlay.classList.remove('visible');
    overlayMask.classList.remove('visible');
  }
  broClose.addEventListener('click', hideBlockResult);
  overlayMask.addEventListener('click', hideBlockResult);

  // ---- 执行历史面板 ----
  var historyLoaded = false;
  historyBtn.addEventListener('click', function () {
    var visible = historyPanel.classList.toggle('visible');
    historyBtn.classList.toggle('active', visible);
    if (visible && !historyLoaded) {
      loadHistory();
    }
  });
  historyClose.addEventListener('click', function () {
    historyPanel.classList.remove('visible');
    historyBtn.classList.remove('active');
  });

  function loadHistory() {
    fetch('/history').then(function (res) { return res.json(); }).then(function (json) {
      if (!json.ok) {
        historyBody.innerHTML = '<div class="hp-empty">加载失败: ' + (json.error || '未知错误') + '</div>';
        return;
      }
      historyLoaded = true;
      renderHistory(json.data.records || []);
    }).catch(function (err) {
      historyBody.innerHTML = '<div class="hp-empty">请求失败: ' + String(err) + '</div>';
    });
  }

  function renderHistory(records) {
    if (records.length === 0) {
      historyBody.innerHTML = '<div class="hp-empty">暂无执行历史</div>';
      return;
    }
    historyBody.innerHTML = '';
    records.forEach(function (r) {
      var item = document.createElement('div');
      item.className = 'hp-item';

      var ts = (r.timestamp || '').replace('T', ' ').replace(/\\.\\d+Z$/, '');
      var meta = document.createElement('div');
      meta.className = 'hp-meta';
      var left = document.createElement('span');
      left.textContent = '#' + r.id + ' ' + (r.file || 'stdin');
      var right = document.createElement('span');
      right.textContent = ts + ' · ' + (r.duration_ms / 1000).toFixed(1) + 's';
      meta.appendChild(left); meta.appendChild(right);
      item.appendChild(meta);

      var chips = document.createElement('div');
      chips.className = 'hp-blocks';
      (r.blocks || []).forEach(function (b) {
        var chip = document.createElement('span');
        chip.className = 'hp-block-chip ' + (b.status === 'success' ? 'ok' : 'fail');
        chip.textContent = '#' + b.position + ' ' + b.type + (b.status === 'success' ? ' ✓' : ' ✗');
        chip.title = (b.error || '') + (b.trace ? '\n' + b.trace : '');
        chips.appendChild(chip);
      });
      item.appendChild(chips);

      // 展开块级明细（点击）
      var detail = null;
      item.addEventListener('click', function () {
        if (detail) { detail.remove(); detail = null; return; }
        detail = document.createElement('div');
        detail.className = 'hp-detail';
        var lines = (r.blocks || []).map(function (b) {
          var line = '[' + b.position + '] ' + b.type + ' ' + b.status + ' ' + (b.duration_ms || 0) + 'ms';
          if (b.error) line += '\n  错误: ' + b.error;
          if (b.input_tokens || b.output_tokens) line += '\n  tokens: ' + (b.input_tokens || 0) + ' in / ' + (b.output_tokens || 0) + ' out';
          return line;
        });
        detail.textContent = lines.join('\n') || '（无块明细）';
        item.appendChild(detail);
      });

      historyBody.appendChild(item);
    });
  }

  // ---- 变量面板切换 ----
  varsBtn.addEventListener('click', function () {
    showVars = !showVars;
    if (showVars) {
      varsBtn.classList.add('active');
      preview.textContent = lastVariables === null
        ? '（尚未执行，或本次执行未产生变量）'
        : JSON.stringify(lastVariables, null, 2);
    } else {
      varsBtn.classList.remove('active');
      preview.textContent = '点击"执行"查看结果';
    }
  });
})();
</script>
</body>
</html>
`;
