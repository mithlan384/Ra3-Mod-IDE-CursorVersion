// output-panel.js - 输出面板（BuildLog / WarningLog / ErrorLog 分页）

const ERROR_LINE_REGEX =
  /^(.+?)\((\d+)\):\s*(error|warning)/i;

let activeOutputTab = 'build';
let buildHadWarnings = false;
let buildHadErrors = false;

function getBuildLogEl() {
  return document.getElementById('output-content-build');
}

function getWarningLogEl() {
  return document.getElementById('output-content-warning');
}

function getErrorLogEl() {
  return document.getElementById('output-content-error');
}

let outputPanelInited = false;

function initOutputPanel() {
  if (outputPanelInited) return;
  outputPanelInited = true;
  const panel = document.getElementById('output-panel');
  const resizeHandle = document.getElementById('output-resizer');
  let isResizing = false;
  let startY;
  let startHeight;

  document.querySelectorAll('.output-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      switchOutputTab(btn.dataset.tab);
    });
  });

  const clearBtn = document.getElementById('output-clear-btn');
  if (clearBtn) clearBtn.addEventListener('click', () => clearOutput());

  if (resizeHandle && panel) {
    resizeHandle.addEventListener('mousedown', (e) => {
      isResizing = true;
      startY = e.clientY;
      startHeight = parseInt(getComputedStyle(panel).height, 10);
      document.body.style.cursor = 'row-resize';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  function onMouseMove(e) {
    if (!isResizing) return;
    const dy = startY - e.clientY;
    let newHeight = startHeight + dy;
    if (newHeight < 50) newHeight = 50;
    if (newHeight > 400) newHeight = 400;
    panel.style.height = newHeight + 'px';
  }

  function onMouseUp() {
    isResizing = false;
    document.body.style.cursor = '';
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    if (typeof editor !== 'undefined' && editor) editor.layout();
    if (typeof splitEditor !== 'undefined' && splitEditor) splitEditor.layout();
  }
}

function switchOutputTab(tab) {
  const valid = ['build', 'warning', 'error'];
  activeOutputTab = valid.includes(tab) ? tab : 'build';
  document.querySelectorAll('.output-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === activeOutputTab);
  });
  getBuildLogEl()?.classList.toggle('active', activeOutputTab === 'build');
  getWarningLogEl()?.classList.toggle('active', activeOutputTab === 'warning');
  getErrorLogEl()?.classList.toggle('active', activeOutputTab === 'error');
}

function appendToPane(container, text, { paneClass = '' } = {}) {
  if (!container || !text) return;
  const lines = String(text).split('\n');
  lines.forEach((line) => {
    if (line === '' && lines.length > 1) {
      container.appendChild(document.createElement('br'));
      return;
    }
    const span = document.createElement('div');
    const match = line.match(ERROR_LINE_REGEX);
    if (match) {
      span.className = paneClass || 'output-error-line';
      span.textContent = line;
      span.title = '点击跳转到源文件';
      const filePath = match[1];
      const lineNum = parseInt(match[2], 10);
      span.addEventListener('click', () => {
        window.api.sendBuildErrorClick(filePath, lineNum);
      });
    } else {
      span.textContent = line;
      if (paneClass) span.className = paneClass;
    }
    container.appendChild(span);
  });
  container.scrollTop = container.scrollHeight;
}

function appendBuildLog(text) {
  appendToPane(getBuildLogEl(), text);
}

function appendWarningLog(text) {
  buildHadWarnings = true;
  appendToPane(getWarningLogEl(), text, { paneClass: 'output-warning-line' });
  if (activeOutputTab === 'build' && /warning|警告|unknown asset/i.test(text)) {
    switchOutputTab('warning');
  }
}

function appendErrorLog(text) {
  buildHadErrors = true;
  appendToPane(getErrorLogEl(), text, { paneClass: 'output-error-line' });
  if (activeOutputTab !== 'error' && /critical|error|错误|失败|fatal/i.test(text)) {
    switchOutputTab('error');
  }
}

function clearOutput() {
  buildHadWarnings = false;
  buildHadErrors = false;
  const buildEl = getBuildLogEl();
  const warnEl = getWarningLogEl();
  const errEl = getErrorLogEl();
  if (buildEl) buildEl.innerHTML = '';
  if (warnEl) warnEl.innerHTML = '';
  if (errEl) errEl.innerHTML = '';
}

function showOutputPanel() {
  if (window.PanelLayout) {
    window.PanelLayout.show('output');
  }
}

function closeOutputPanel() {
  if (window.PanelLayout) {
    window.PanelLayout.hide('output');
  }
}

if (window.api) {
  window.api.onBuildLog((text) => appendBuildLog(text));
  window.api.onBuildWarningLog((text) => appendWarningLog(text));
  window.api.onBuildErrorLog((text) => appendErrorLog(text));
  window.api.onBuildLogsClear(() => clearOutput());

  window.api.onBuildFinished((code) => {
    const buildEl = getBuildLogEl();
    if (!buildEl) return;
    const span = document.createElement('div');
    span.style.fontWeight = 'bold';
    span.style.marginTop = '6px';
    if (code === 0 && buildHadWarnings) {
      span.style.color = '#ffb74d';
      span.textContent = '—— 编译成功（含警告，请查看 WarningLog）——';
    } else {
      span.style.color = code === 0 ? '#4caf50' : '#f44336';
      span.textContent =
        code === 0 ? '—— 编译成功 ——' : `—— 编译失败 (退出码: ${code}) ——`;
    }
    buildEl.appendChild(span);
    buildEl.scrollTop = buildEl.scrollHeight;

    if (code !== 0) switchOutputTab('error');
    else if (buildHadWarnings) switchOutputTab('warning');
  });

  window.api.onOpenFileAtLine((filePath, line) => {
    if (filePath && typeof switchToFile === 'function') {
      switchToFile(filePath).then(() => {
        if (typeof editor !== 'undefined' && editor) {
          editor.revealLineInCenter(line);
          editor.setPosition({ lineNumber: line, column: 1 });
        }
      });
    }
  });

  window.api.onShowOutputPanel(() => showOutputPanel());
}
