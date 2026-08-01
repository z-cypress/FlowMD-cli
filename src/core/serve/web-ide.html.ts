/**
 * Web IDE 单页（ADR-011/012/013/014）
 * 随 serve 内置：GET / 返回此 HTML。零前端依赖、无构建步骤。
 */

/**
 * Web IDE HTML 单页
 * textarea + 分栏预览；模板下拉、变量 key-value 表格、release 复选框、执行按钮
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
  #vars-panel { padding: 8px 16px; background: #f6f8fa; border-bottom: 1px solid #d0d7de; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  #vars-panel span { font-size: 12px; color: #57606a; }
  .var-row { display: flex; gap: 6px; align-items: center; }
  .var-row input { padding: 3px 6px; border: 1px solid #d0d7de; border-radius: 4px; font-size: 12px; width: 160px; }
  .var-row .del { background: none; border: none; color: #cf222e; cursor: pointer; font-size: 14px; }
  #add-var { background: none; border: 1px dashed #afb8c1; color: #57606a; border-radius: 4px; padding: 3px 8px; font-size: 12px; cursor: pointer; }
  main { flex: 1; display: flex; min-height: 0; }
  .pane { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  .pane-header { padding: 6px 12px; font-size: 12px; color: #57606a; background: #f6f8fa; border-bottom: 1px solid #d0d7de; }
  #editor { flex: 1; border: none; padding: 12px; font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 13px; line-height: 1.6; resize: none; outline: none; }
  #preview { flex: 1; padding: 12px; overflow: auto; font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 13px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; }
  #preview.error { color: #cf222e; }
  .status { padding: 4px 12px; font-size: 12px; color: #57606a; background: #fff8c5; border-top: 1px solid #d4a72c; display: none; }
  .status.visible { display: block; }
</style>
</head>
<body>
<header>
  <h1>FlowMD Web IDE</h1>
  <label>模板:
    <select id="template-select"><option value="">— 选择模板 —</option></select>
  </label>
  <label><input type="checkbox" id="release-check"> release（剥离指令块）</label>
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
    <textarea id="editor" spellcheck="false" placeholder="# 在这里编写 FlowMD 文档...&#10;&#10;\`\`\`ai {output: &quot;summary&quot;}&#10;分析内容&#10;\`\`\`&#10;&#10;{{summary}}"></textarea>
  </div>
  <div class="pane">
    <div class="pane-header">执行结果</div>
    <pre id="preview">点击"执行"查看结果</pre>
  </div>
</main>

<div class="status" id="status"></div>

<script>
(function () {
  var editor = document.getElementById('editor');
  var preview = document.getElementById('preview');
  var releaseCheck = document.getElementById('release-check');
  var templateSelect = document.getElementById('template-select');
  var status = document.getElementById('status');
  var varRows = document.getElementById('var-rows');
  var addVarBtn = document.getElementById('add-var');
  var runBtn = document.getElementById('run-btn');

  function showStatus(msg) {
    status.textContent = msg;
    status.classList.add('visible');
  }
  function clearStatus() {
    status.textContent = '';
    status.classList.remove('visible');
  }

  function addVarRow(key, value) {
    var row = document.createElement('div');
    row.className = 'var-row';
    var k = document.createElement('input');
    k.type = 'text'; k.placeholder = '键'; k.value = key || '';
    var v = document.createElement('input');
    v.type = 'text'; v.placeholder = '值'; v.value = value || '';
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
      editor.value = content;
      clearStatus();
    } else {
      showStatus('模板内容不可用: ' + name);
    }
  });

  addVarBtn.addEventListener('click', function () { addVarRow(); });
  addVarRow();

  runBtn.addEventListener('click', function () {
    var markdown = editor.value;
    if (!markdown.trim()) {
      showStatus('编辑区为空');
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
        showStatus('部分块执行失败');
      } else {
        preview.classList.remove('error');
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
