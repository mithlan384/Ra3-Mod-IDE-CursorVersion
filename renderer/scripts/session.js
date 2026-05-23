// session.js - 会话管理、保存、自动保存

async function saveCurrentFile() {
  if (typeof isAgentIdeLocked === 'function' && isAgentIdeLocked()) {
    showToast('AI 正在写入文件，请稍候再保存');
    return;
  }
  if (!currentFile) { showToast("没有打开文件"); return; }
  if (window.currentPreviewMode === 'csf' && typeof saveCsfFile === 'function') {
    await saveCsfFile();
    return;
  }
  if (window.currentPreviewMode && window.currentPreviewMode !== 'csf') {
    showToast("当前为资源预览，不可保存");
    return;
  }
  const content = editor.getValue();
  const result = await window.api.saveFile(currentFile, content);
  if (result) {
    showToast("保存成功");
    dirtyFiles.set(currentFile, false);
    fileContents.set(currentFile, content);
    updateFileTreeDirtyMarkers();
  } else {
    showToast("保存失败");
  }
}

async function saveAllFiles() {
  if (typeof isAgentIdeLocked === 'function' && isAgentIdeLocked()) {
    showToast('AI 正在写入文件，请稍候再保存');
    return;
  }
  if (currentFile && typeof editor !== 'undefined' && editor && !window.MediaTypes?.isMediaPath(currentFile)) {
    fileContents.set(currentFile, editor.getValue());
  }
  const filesToSave = [];
  for (const [fp, dirty] of dirtyFiles.entries()) {
    if (dirty) filesToSave.push({ path: fp, content: fileContents.get(fp) || '' });
  }
  if (filesToSave.length === 0) { showToast("没有需要保存的文件"); return; }
  const result = await window.api.saveAllFiles(filesToSave);
  if (result) {
    filesToSave.forEach(f => { dirtyFiles.set(f.path, false); fileContents.set(f.path, f.content); });
    updateFileTreeDirtyMarkers();
    showToast(`已保存 ${filesToSave.length} 个文件`);
  } else {
    showToast("保存失败");
  }
}

let autoSaveToastShown = false;

function setupAutoSave(seconds) {
  if (autoSaveInterval) clearInterval(autoSaveInterval);
  autoSaveIntervalSeconds = seconds;
  autoSaveToastShown = false;
  if (seconds > 0) {
    autoSaveInterval = setInterval(saveAllFiles, seconds * 1000);
  } else {
    autoSaveIntervalSeconds = 0;
  }
  updateStatusBar();
}

function showAutoSaveSettings() {
  const input = prompt("设置自动保存间隔（秒，0 为关闭）", autoSaveIntervalSeconds || "30");
  if (input !== null) { const sec = parseInt(input); if (!isNaN(sec) && sec >= 0) setupAutoSave(sec); }
}

function showCustomThemeDialog() {
  const bg = prompt("背景色 (例如 #1e1e1e)", "#1e1e1e");
  if (!bg) return;
  const fg = prompt("前景色 (例如 #d4d4d4)", "#d4d4d4");
  if (!fg) return;
  const themeName = 'custom-' + Date.now();
  monaco.editor.defineTheme(themeName, {
    base: 'vs-dark', inherit: true, rules: [],
    colors: {
      'editor.background': bg,
      'editor.foreground': fg,
      'editor.lineHighlightBackground': bg,
      'editor.selectionBackground': '#264f78',
      'editorCursor.foreground': '#aeafad'
    }
  });
  if (typeof AppTheme !== 'undefined') AppTheme.applyAppTheme(themeName);
  else editor.updateOptions({ theme: themeName });
  updateStatusBar();
}

const SESSION_AUTOSAVE_MS = 2000;

function buildSessionSnapshot() {
  const sf = {};
  for (const [fp, dirty] of dirtyFiles.entries()) {
    if (dirty) sf[fp] = fileContents.get(fp) || '';
  }
  if (currentFile && typeof editor !== 'undefined' && editor) {
    const cur = editor.getValue();
    sf[currentFile] = cur;
    fileContents.set(currentFile, cur);
  }
  return {
    openFiles: openFiles.slice(),
    fileContents: sf,
    dirtyFiles: Object.fromEntries(dirtyFiles),
    currentFile: currentFile,
  };
}

function scheduleAutoSaveSession() {
  if (isExiting) return;
  autoSaveToastShown = false;
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(async () => {
    await window.api.saveSession(buildSessionSnapshot());
    if (!autoSaveToastShown) {
      autoSaveToastShown = true;
      showToast('已自动保存会话');
    }
  }, SESSION_AUTOSAVE_MS);
}

function isPathUnderProject(filePath, projectPath) {
  if (!filePath || !projectPath) return false;
  const fp = String(filePath).replace(/\\/g, '/').toLowerCase();
  const root = String(projectPath).replace(/\\/g, '/').toLowerCase().replace(/\/$/, '');
  return fp === root || fp.startsWith(root + '/');
}

async function restoreProjectSession() {
  try {
    const projectPath = await window.api.getProjectPath();
    if (!projectPath) return;

    const session = await window.api.loadSession();
    if (!session) return;

    const filterKey = (fp) => isPathUnderProject(fp, projectPath);

    if (session.fileContents) {
      Object.entries(session.fileContents)
        .filter(([k]) => filterKey(k))
        .forEach(([k, v]) => fileContents.set(k, v));
    }
    if (session.dirtyFiles) {
      Object.entries(session.dirtyFiles)
        .filter(([k]) => filterKey(k))
        .forEach(([k, v]) => dirtyFiles.set(k, v));
    }
    if (session.openFiles) {
      openFiles = session.openFiles.filter((fp) => filterKey(fp));
    }

    for (const fp of openFiles) {
      if (!fileContents.has(fp) && window.api?.readFile) {
        try {
          const disk = await window.api.readFile(fp);
          if (typeof disk === 'string') fileContents.set(fp, disk);
        } catch (e) {
          console.warn('[session] read disk:', fp, e);
        }
      }
    }

    if (session.currentFile && filterKey(session.currentFile) && openFiles.includes(session.currentFile)) {
      await switchToFile(session.currentFile);
    }
  } catch (err) {
    console.error('[session] restore:', err);
  }
}

async function saveSessionAndClose(choice) {
  isExiting = true;
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  if (autoSaveInterval) clearInterval(autoSaveInterval);

  let so, sf, sd, sc;
  if (choice === 'discard') {
    fileContents.clear(); dirtyFiles.clear(); openFiles = [];
    so = []; sf = {}; sd = {}; sc = null;
  } else if (choice === 'save') {
    for (const [fp, dirty] of dirtyFiles.entries()) {
      if (dirty) { await window.api.saveFile(fp, fileContents.get(fp) || ''); dirtyFiles.set(fp, false); }
    }
    fileContents.clear(); openFiles = [];
    updateFileTreeDirtyMarkers();
    so = []; sf = {}; sd = {}; sc = null;
  } else if (choice === 'remember') {
    so = openFiles.slice(); sf = Object.fromEntries(fileContents); sd = Object.fromEntries(dirtyFiles); sc = currentFile;
  }
  await window.api.saveSession({ openFiles: so, fileContents: sf, dirtyFiles: sd, currentFile: sc });
  window.api.allowClose();
}

// 切换项目时保存当前会话（记忆退出），但不关闭窗口
async function saveSessionForSwitch() {
  isExiting = true;
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  if (autoSaveInterval) clearInterval(autoSaveInterval);

  const snap = buildSessionSnapshot();
  await window.api.saveSession(snap);

  isExiting = false;
}

window.restoreProjectSession = restoreProjectSession;
window.isPathUnderProject = isPathUnderProject;