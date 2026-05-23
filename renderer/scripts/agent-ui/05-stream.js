// renderer/scripts/agent-ui/05-stream.js
// ========== onRefreshFile：文件被 AI 修改后，刷新编辑器 + 文件树 ==========
function isAgentStreamWriting() {
  return typeof isAgentIdeLocked === 'function' && isAgentIdeLocked();
}

function agentSyncEditorTabTree(fullPath, options = {}) {
  const canonical =
    (typeof findOpenFileCanonicalPath === 'function' && findOpenFileCanonicalPath(fullPath)) ||
    fullPath;
  const { writing = false, switchTab = true } = options;

  const syncTree = () => {
    if (typeof ensureTreePathVisible === 'function') {
      return ensureTreePathVisible(canonical, { writing });
    }
    if (typeof expandFilePath === 'function') {
      return expandFilePath(canonical, { writing });
    }
    return Promise.resolve();
  };

  const syncTabs = () => {
    if (writing) {
      document.querySelectorAll('#file-tabs .tab.writing').forEach((t) => t.classList.remove('writing'));
      const tab = document.querySelector(`#file-tabs .tab[data-path="${CSS.escape(canonical)}"]`);
      if (tab) tab.classList.add('writing');
    }
    if (typeof updateFileTreeDirtyMarkers === 'function') updateFileTreeDirtyMarkers();
  };

  if (switchTab && typeof switchToFile === 'function') {
    return switchToFile(canonical).then(() => syncTree().then(syncTabs));
  }
  return syncTree().then(syncTabs);
}

if (window.api && window.api.agent && window.api.agent.onRefreshFile) {
  window.api.agent.onRefreshFile((relativePath) => {
    if (typeof currentRootFolder !== 'undefined' && currentRootFolder) {
      const fullPath = agentResolveFullPath(relativePath);
      window.api.readFile(fullPath).then((content) => {
        if (content != null) {
          fileContents.set(fullPath, content);
          if (
            typeof currentFile !== 'undefined' &&
            normalizePath(currentFile) === normalizePath(fullPath) &&
            typeof editor !== 'undefined' &&
            editor &&
            !isAgentStreamWriting()
          ) {
            editor.setValue(content);
          }
        }
      }).finally(() => {
        if (typeof changePath === 'function') changePath(fullPath);
        if (isAgentStreamWriting()) {
          if (typeof refreshFileTreeSoft === 'function') refreshFileTreeSoft();
          agentSyncEditorTabTree(fullPath, { writing: true, switchTab: false });
          scheduleAgentTreeRefresh();
        } else if (typeof refreshFileTreePreservingExpand === 'function') {
          refreshFileTreePreservingExpand().then(() => {
            if (typeof notifyProjectFileIndexChanged === 'function') {
              notifyProjectFileIndexChanged();
            }
            agentSyncEditorTabTree(fullPath);
          });
        } else if (typeof refreshFileTree === 'function') {
          refreshFileTree();
          if (typeof notifyProjectFileIndexChanged === 'function') {
            notifyProjectFileIndexChanged();
          }
        }
      });
    }
  });
}

// ========== AI 打开/写入文件（单例标签 + 实时跟随光标） ==========
let streamWriteFile = null;
let agentTreeRefreshTimer = null;

function scheduleAgentTreeRefresh(delayMs = 500) {
  if (agentTreeRefreshTimer) clearTimeout(agentTreeRefreshTimer);
  agentTreeRefreshTimer = setTimeout(() => {
    agentTreeRefreshTimer = null;
    const refresh =
      typeof refreshFileTreePreservingExpand === 'function'
        ? refreshFileTreePreservingExpand()
        : Promise.resolve();
    Promise.resolve(refresh).then(() => {
      if (typeof notifyProjectFileIndexChanged === 'function') {
        notifyProjectFileIndexChanged();
      }
    });
  }, delayMs);
}

function flushAgentTreeRefresh() {
  if (agentTreeRefreshTimer) {
    clearTimeout(agentTreeRefreshTimer);
    agentTreeRefreshTimer = null;
  }
  const refresh =
    typeof refreshFileTreePreservingExpand === 'function'
      ? refreshFileTreePreservingExpand()
      : Promise.resolve();
  return Promise.resolve(refresh).then(() => {
    if (typeof notifyProjectFileIndexChanged === 'function') {
      return notifyProjectFileIndexChanged();
    }
  });
}

function agentResolveFullPath(relativePath) {
  if (!relativePath) return '';
  const rel = String(relativePath).replace(/\\/g, '/');
  if (typeof currentRootFolder !== 'undefined' && currentRootFolder) {
    return normalizePath(currentRootFolder + '/' + rel);
  }
  return normalizePath(rel);
}

function agentFocusFile(fullPath, options = {}) {
  const { line = 1, column = 1, clearContent = false, writing = true } = options;
  const canonical =
    (typeof findOpenFileCanonicalPath === 'function' && findOpenFileCanonicalPath(fullPath)) ||
    fullPath;

  const afterOpen = () => {
    const treePromise =
      typeof ensureTreePathVisible === 'function'
        ? ensureTreePathVisible(canonical, { writing })
        : typeof expandFilePath === 'function'
          ? expandFilePath(canonical, { writing })
          : Promise.resolve();

    return treePromise.then(() => {
      document.querySelectorAll('#file-tabs .tab.writing').forEach((t) => t.classList.remove('writing'));
      const tab = document.querySelector(`#file-tabs .tab[data-path="${CSS.escape(canonical)}"]`);
      if (tab && writing) tab.classList.add('writing');

      if (typeof editor !== 'undefined' && editor) {
        if (clearContent) {
          editor.setValue('');
          if (typeof fileContents !== 'undefined') fileContents.set(canonical, '');
        }
        const ln = Math.max(1, line);
        const col = Math.max(1, column);
        editor.revealLineInCenter(ln);
        editor.setPosition({ lineNumber: ln, column: col });
      }
    });
  };

  const run = () => {
    if (typeof switchToFile === 'function') {
      return switchToFile(canonical, { agentBypass: true }).then(afterOpen);
    }
    return afterOpen();
  };
  if (typeof withAgentUiDriving === 'function') return withAgentUiDriving(run);
  return run();
}

if (window.api && window.api.agent && window.api.agent.onStreamWrite) {
  window.api.agent.onStreamWrite((data) => {
    if (!data) return;

    if (data.type === 'ui-lock') {
      if (typeof handleAgentIdeLockEvent === 'function') handleAgentIdeLockEvent(data);
      return;
    }

    if (!data.file) return;
    const fullPath = agentResolveFullPath(data.file);

    if (data.type === 'start') {
      const canonical =
        (typeof findOpenFileCanonicalPath === 'function' && findOpenFileCanonicalPath(fullPath)) ||
        fullPath;
      streamWriteFile = canonical;

      agentFocusFile(canonical, { clearContent: data.clear !== false, writing: true });
      if (data.isNewFile) scheduleAgentTreeRefresh();
    } else if (data.type === 'chunk') {
      const canonical =
        (typeof findOpenFileCanonicalPath === 'function' && findOpenFileCanonicalPath(fullPath)) ||
        fullPath;
      if (streamWriteFile && normalizePath(streamWriteFile) !== normalizePath(canonical)) {
        streamWriteFile = canonical;
        agentFocusFile(canonical, { clearContent: false, writing: true });
      }
      if (typeof editor !== 'undefined' && editor) {
        const model = editor.getModel();
        const editingThisFile =
          streamWriteFile && normalizePath(streamWriteFile) === normalizePath(fullPath);
        if (model && editingThisFile) {
          if (data.delta && data.delta.length > 0 && typeof monaco !== 'undefined') {
            const pos = editor.getPosition();
            const range = new monaco.Range(
              pos.lineNumber,
              pos.column,
              pos.lineNumber,
              pos.column
            );
            editor.executeEdits('agent-stream-write', [
              { range, text: data.delta, forceMoveMarkers: true },
            ]);
          } else if (data.text != null) {
            editor.setValue(data.text);
          }
          const ln = data.line || model.getLineCount();
          const col = data.column || model.getLineMaxColumn(ln);
          editor.revealLineInCenter(ln);
          editor.setPosition({ lineNumber: ln, column: col });
        }
        if (data.text != null && typeof fileContents !== 'undefined') {
          fileContents.set(streamWriteFile || fullPath, data.text);
        }
      }
    } else if (data.type === 'end') {
      const target = streamWriteFile || fullPath;
      streamWriteFile = null;
      if (data.text != null && typeof fileContents !== 'undefined') {
        fileContents.set(target, data.text);
      }
      if (data.markDirty && typeof dirtyFiles !== 'undefined') {
        dirtyFiles.set(target, true);
      }
      if (!isAgentStreamWriting()) flushAgentTreeRefresh();

      const afterEnd = () => {
        document.querySelectorAll('#file-tabs .tab.writing').forEach((t) => t.classList.remove('writing'));
        if (typeof setTreeFileHighlight === 'function') {
          setTreeFileHighlight(target, { writing: false });
        } else if (typeof expandFilePath === 'function') {
          expandFilePath(target);
        }
        if (typeof updateFileTreeDirtyMarkers === 'function') updateFileTreeDirtyMarkers();
        if (typeof renderTabs === 'function' && typeof currentFile !== 'undefined' && currentFile) {
          renderTabs();
        }
        if (typeof editor !== 'undefined' && editor && data.line) {
          editor.revealLineInCenter(data.line);
          editor.setPosition({
            lineNumber: data.line,
            column: data.column || 1,
          });
        }
      };

      afterEnd();
    }
  });
}

// ========== onOpenFile：单例打开（已打开则仅跳转） ==========
if (window.api && window.api.agent && window.api.agent.onOpenFile) {
  window.api.agent.onOpenFile((data) => {
    if (!data || !data.file) return;
    const fullPath = agentResolveFullPath(data.file);
    const targetPath =
      (typeof findOpenFileCanonicalPath === 'function' && findOpenFileCanonicalPath(fullPath)) ||
      fullPath;

    const open = () => {
      agentFocusFile(targetPath, {
        line: data.line || 1,
        column: data.column || 1,
        clearContent: false,
      });
    };

    if (!fileContents.has(targetPath)) {
      window.api.readFile(targetPath).then((content) => {
        if (content != null) {
          fileContents.set(targetPath, content);
          dirtyFiles.set(targetPath, false);
        }
        open();
      });
    } else {
      open();
    }
  });
}

window.getIdeState = function() {
  const state = {
    activeFile: currentFile || null,
    openFiles: openFiles ? openFiles.slice(0, 10) : [],
    cursorLine: null,
    cursorColumn: null,
    selectedText: null
  };
  if (editor) {
    const pos = editor.getPosition();
    if (pos) {
      state.cursorLine = pos.lineNumber;
      state.cursorColumn = pos.column;
    }
    const selection = editor.getSelection();
    if (selection && !selection.isEmpty()) {
      const model = editor.getModel();
      if (model) state.selectedText = model.getValueInRange(selection);
    }
  }
  return state;
};

