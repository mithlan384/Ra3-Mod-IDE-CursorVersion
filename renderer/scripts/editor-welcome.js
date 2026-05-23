// renderer/scripts/editor-welcome.js —— 无打开文件时显示欢迎与功能介绍

let welcomeActiveFeatureId = null;
/** @type {null | { hadSession: boolean, currentFile: string|null, openFiles: string[], previewMode: string|null, cursor: object|null, scrollTop: number, isSplitVisible: boolean, splitCurrentFile: string|null }} */
let welcomeResumeSnapshot = null;

function updateEditorWelcomeProject() {
  const box = document.getElementById('welcome-project-box');
  const nameEl = document.getElementById('welcome-project-name');
  if (!box || !nameEl) return;
  const root = typeof currentRootFolder !== 'undefined' ? currentRootFolder : null;
  if (root) {
    const name = root.split(/[\\/]/).pop() || root;
    nameEl.textContent = name;
    box.classList.remove('hidden');
  } else {
    box.classList.add('hidden');
  }
}

function setWelcomeReturnBarVisible(visible) {
  const bar = document.getElementById('welcome-return-bar');
  if (bar) bar.classList.toggle('hidden', !visible);
}

function showWelcomePanelOnly() {
  const welcome = document.getElementById('editor-welcome');
  const editorEl = document.getElementById('editor');
  const mediaPanel = document.getElementById('media-preview');
  if (welcome) welcome.classList.remove('hidden');
  if (editorEl) editorEl.style.display = 'none';
  if (mediaPanel) mediaPanel.style.display = 'none';
}

function hideWelcomePanelOnly() {
  const welcome = document.getElementById('editor-welcome');
  if (welcome) welcome.classList.add('hidden');
}

function captureWelcomeResumeSnapshot() {
  const hasOpenTabs = typeof openFiles !== 'undefined' && openFiles.length > 0;
  const hasCurrent =
    typeof currentFile !== 'undefined' && currentFile && String(currentFile).length > 0;
  const hasPreview = !!window.currentPreviewMode;
  if (!hasOpenTabs && !hasCurrent && !hasPreview) return null;

  if (hasCurrent && typeof editor !== 'undefined' && editor && !hasPreview) {
    try {
      fileContents.set(currentFile, editor.getValue());
    } catch (e) {}
  }

  let cursor = null;
  let scrollTop = 0;
  if (hasCurrent && typeof editor !== 'undefined' && editor && !hasPreview) {
    try {
      const pos = editor.getPosition();
      if (pos) cursor = { lineNumber: pos.lineNumber, column: pos.column };
      scrollTop = editor.getScrollTop();
    } catch (e) {}
  }

  const norm = typeof normalizePath === 'function' ? normalizePath : (p) => p;

  return {
    hadSession: true,
    currentFile: hasCurrent ? norm(currentFile) : null,
    openFiles: hasOpenTabs ? openFiles.map((p) => norm(p)) : hasCurrent ? [norm(currentFile)] : [],
    previewMode: hasPreview ? window.currentPreviewMode : null,
    cursor,
    scrollTop,
    isSplitVisible: typeof isSplitVisible !== 'undefined' && isSplitVisible,
    splitCurrentFile:
      typeof splitCurrentFile !== 'undefined' && splitCurrentFile
        ? norm(splitCurrentFile)
        : null,
  };
}

function welcomeShowOverview() {
  const overview = document.getElementById('welcome-overview');
  const detail = document.getElementById('welcome-detail');
  if (overview) overview.classList.remove('hidden');
  if (detail) detail.classList.add('hidden');
  welcomeActiveFeatureId = null;
  const root = document.getElementById('editor-welcome');
  if (root) root.scrollTop = 0;
}

function welcomeShowFeatureDetail(featureId) {
  const features = typeof WELCOME_FEATURES !== 'undefined' ? WELCOME_FEATURES : [];
  const feat = features.find((f) => f.id === featureId);
  if (!feat) return;

  const overview = document.getElementById('welcome-overview');
  const detail = document.getElementById('welcome-detail');
  const body = document.getElementById('welcome-detail-body');
  const titleEl = document.getElementById('welcome-detail-title');
  if (!overview || !detail || !body) return;

  welcomeActiveFeatureId = featureId;
  if (titleEl) {
    titleEl.innerHTML = `<span class="welcome-detail-icon" aria-hidden="true">${feat.icon}</span>${escapeWelcomeHtml(feat.title)}`;
  }
  body.innerHTML = feat.detailHtml.replace(/^\s*<h2>[\s\S]*?<\/h2>\s*/i, '');
  overview.classList.add('hidden');
  detail.classList.remove('hidden');
  detail.scrollTop = 0;
  const root = document.getElementById('editor-welcome');
  if (root) root.scrollTop = 0;
}

function renderWelcomeFeatureCards() {
  const grid = document.getElementById('welcome-features-grid');
  const features = typeof WELCOME_FEATURES !== 'undefined' ? WELCOME_FEATURES : [];
  if (!grid || !features.length) return;

  grid.innerHTML = '';
  for (const feat of features) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'welcome-feature';
    btn.dataset.featureId = feat.id;
    btn.setAttribute('aria-label', `查看${feat.title}详情`);
    btn.innerHTML = `
      <div class="welcome-feature-head">
        <span class="welcome-feature-icon" aria-hidden="true">${feat.icon}</span>
        <h3>${escapeWelcomeHtml(feat.title)}</h3>
        <span class="welcome-feature-chevron" aria-hidden="true">›</span>
      </div>
      <p>${escapeWelcomeHtml(feat.summary)}</p>
    `;
    btn.addEventListener('click', () => welcomeShowFeatureDetail(feat.id));
    grid.appendChild(btn);
  }
}

function escapeWelcomeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function initEditorWelcome() {
  renderWelcomeFeatureCards();
  document.getElementById('welcome-back-btn')?.addEventListener('click', welcomeShowOverview);
  document.getElementById('welcome-resume-btn')?.addEventListener('click', () => {
    resumeFromWelcomeAbout();
  });
}

function showEditorWelcome() {
  welcomeResumeSnapshot = null;
  setWelcomeReturnBarVisible(false);
  showWelcomePanelOnly();
  welcomeShowOverview();
  updateEditorWelcomeProject();
  if (typeof editor !== 'undefined' && editor) {
    try {
      editor.setValue('');
    } catch (e) {}
  }
}

function hideEditorWelcome() {
  hideWelcomePanelOnly();
  const editorEl = document.getElementById('editor');
  if (editorEl && !window.currentPreviewMode) editorEl.style.display = 'block';
}

/** 帮助 → 关于：进入简介，保留编辑会话供返回 */
function openWelcomeFromAbout() {
  if (typeof isAgentIdeLocked === 'function' && isAgentIdeLocked()) {
    if (typeof showToast === 'function') {
      showToast('AI 正在写入文件，请稍候再打开关于');
    }
    return;
  }

  welcomeResumeSnapshot = captureWelcomeResumeSnapshot();
  setWelcomeReturnBarVisible(!!welcomeResumeSnapshot);
  welcomeShowOverview();
  updateEditorWelcomeProject();
  showWelcomePanelOnly();
}

async function resumeFromWelcomeAbout() {
  const snap = welcomeResumeSnapshot;
  welcomeResumeSnapshot = null;
  setWelcomeReturnBarVisible(false);
  hideWelcomePanelOnly();

  if (!snap?.hadSession) {
    const editorEl = document.getElementById('editor');
    if (editorEl) editorEl.style.display = 'block';
    return;
  }

  const target =
    snap.currentFile ||
    (snap.openFiles.length ? snap.openFiles[snap.openFiles.length - 1] : null);

  if (typeof renderTabs === 'function') renderTabs();

  if (target && typeof switchToFile === 'function') {
    await switchToFile(target, { agentBypass: true });
  } else {
    const editorEl = document.getElementById('editor');
    if (editorEl) editorEl.style.display = 'block';
  }

  if (
    snap.cursor &&
    typeof editor !== 'undefined' &&
    editor &&
    !window.currentPreviewMode
  ) {
    try {
      editor.setPosition(snap.cursor);
      editor.revealLineInCenter(snap.cursor.lineNumber);
      if (snap.scrollTop > 0) editor.setScrollTop(snap.scrollTop);
    } catch (e) {}
  }

  if (snap.isSplitVisible && typeof openSplitView === 'function') {
    if (!isSplitVisible) openSplitView();
    if (snap.splitCurrentFile && typeof loadFileInSplit === 'function') {
      await loadFileInSplit(snap.splitCurrentFile);
    }
  }

  if (typeof updateStatusBar === 'function') updateStatusBar();
}

function closeEditorToWelcome() {
  welcomeResumeSnapshot = null;
  setWelcomeReturnBarVisible(false);
  currentFile = null;
  if (typeof MediaPreview !== 'undefined') MediaPreview.hide();
  window.currentPreviewMode = null;
  if (typeof editor !== 'undefined' && editor) {
    try {
      editor.setValue('');
    } catch (e) {}
  }
  showEditorWelcome();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initEditorWelcome);
} else {
  initEditorWelcome();
}

window.showEditorWelcome = showEditorWelcome;
window.hideEditorWelcome = hideEditorWelcome;
window.updateEditorWelcomeProject = updateEditorWelcomeProject;
window.closeEditorToWelcome = closeEditorToWelcome;
window.openWelcomeFromAbout = openWelcomeFromAbout;
window.resumeFromWelcomeAbout = resumeFromWelcomeAbout;
window.welcomeShowOverview = welcomeShowOverview;
