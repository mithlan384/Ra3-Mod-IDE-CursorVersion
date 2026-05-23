// renderer/scripts/tabs.js
// 标签栏渲染、拖拽、文件切换/关闭

// 路径标准化：统一为正斜杠，Windows下忽略大小写（通过小写比较）
function normalizePath(filePath) {
  if (!filePath) return '';
  let normalized = filePath.replace(/\\/g, '/');
  // 如果项目根路径已设置，尝试将绝对路径转为相对于根路径的规范形式
  if (typeof currentRootFolder !== 'undefined' && currentRootFolder) {
    const root = currentRootFolder.replace(/\\/g, '/');
    if (normalized.toLowerCase().startsWith(root.toLowerCase())) {
      // 保留原始大小写的根路径，替换为项目根路径 + 相对路径
      const relative = normalized.substring(root.length).replace(/^\//, '');
      normalized = root + '/' + relative;
    }
  }
  return normalized;
}

function renderTabs() {
  const container = document.getElementById("file-tabs");
  container.innerHTML = "";
  openFiles.forEach(filePath => {
    const fileName = filePath.split(/[\\\/]/).pop();
    const tab = document.createElement("div");
    tab.className = "tab" + (filePath === currentFile ? " active" : "");
    tab.draggable = true;
    tab.dataset.path = filePath;
    const label = document.createElement("span");
    label.textContent = fileName;
    tab.appendChild(label);
    const closeBtn = document.createElement("span");
    closeBtn.className = "close";
    closeBtn.textContent = "×";
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      closeFile(filePath);
    };
    tab.appendChild(closeBtn);
    tab.onclick = () => {
      if (filePath !== currentFile) switchToFile(filePath);
    };
    tab.oncontextmenu = (e) => showTabContextMenu(e, filePath);
    tab.addEventListener("dragstart", handleDragStart);
    tab.addEventListener("dragend", handleDragEnd);
    tab.addEventListener("dragover", handleDragOver);
    tab.addEventListener("dragleave", handleDragLeave);
    tab.addEventListener("drop", handleDrop);
    container.appendChild(tab);
  });
}

function closeFile(filePath) {
  if (typeof isAgentIdeLocked === 'function' && isAgentIdeLocked()) return;
  const normalizedPath = normalizePath(filePath);
  openFiles = openFiles.filter(fp => normalizePath(fp) !== normalizedPath);
  if (splitCurrentFile && normalizePath(splitCurrentFile) === normalizedPath && splitEditor) {
    splitEditor.setValue('');
    splitCurrentFile = null;
  }
  if (currentFile && normalizePath(currentFile) === normalizedPath) {
    if (openFiles.length > 0) switchToFile(openFiles[openFiles.length - 1]);
    else if (typeof closeEditorToWelcome === 'function') {
      closeEditorToWelcome();
    } else {
      currentFile = null;
      if (typeof MediaPreview !== 'undefined') MediaPreview.hide();
      editor.setValue('');
    }
  }
  renderTabs();
  updateFileTreeDirtyMarkers();
}

async function switchToFile(filePath, options = {}) {
  if (!filePath) return;
  if (
    typeof isAgentIdeLocked === 'function' &&
    isAgentIdeLocked() &&
    !options.agentBypass
  ) {
    return;
  }
  if (typeof hideEditorWelcome === 'function') hideEditorWelcome();

  let resolvedPath = filePath;
  if (window.api?.resolveProjectFile) {
    try {
      const res = await window.api.resolveProjectFile(filePath);
      if (res?.success && res.path) resolvedPath = res.path;
      else if (res?.projectPath && typeof isPathUnderProject === 'function' && !isPathUnderProject(filePath, res.projectPath)) {
        showToast(`文件不在当前项目内：${filePath.split(/[\\/]/).pop()}`);
        return;
      }
    } catch (e) {
      console.warn('[switchToFile] resolve:', e);
    }
  }

  const targetPath = normalizePath(resolvedPath);

  // 查找已打开的标签页中是否有相同文件（忽略大小写）
  let existingPath = null;
  for (const fp of openFiles) {
    if (normalizePath(fp) === targetPath) {
      existingPath = fp;
      break;
    }
  }

  // 如果已经是当前文件，不做任何操作
  if (currentFile && normalizePath(currentFile) === targetPath) {
    return;
  }

  // 如果存在但路径写法不同，使用已有的路径
  const canonicalPath = existingPath || targetPath;

  const isMedia =
    typeof MediaPreview !== 'undefined' && MediaPreview.isMediaPath(canonicalPath);

  if (currentFile && editor && !window.MediaTypes?.isMediaPath(currentFile)) {
    fileContents.set(currentFile, editor.getValue());
  }

  if (isMedia) {
    if (typeof hideEditorWelcome === 'function') hideEditorWelcome();
    if (typeof MediaPreview !== 'undefined') {
      await MediaPreview.show(canonicalPath);
    }
    currentFile = canonicalPath;
    if (!openFiles.some((fp) => normalizePath(fp) === targetPath)) {
      openFiles.push(canonicalPath);
    }
    renderTabs();
    document.querySelectorAll('.tree-node.active').forEach((n) => n.classList.remove('active'));
    const activeNode = document.querySelector(`.tree-node[data-path="${CSS.escape(canonicalPath)}"]`);
    if (activeNode) activeNode.classList.add('active');
    updateFileTreeDirtyMarkers();
    if (typeof updatePropertiesPanel === 'function') updatePropertiesPanel(canonicalPath);
    if (typeof updateStatusBar === 'function') updateStatusBar();
    return;
  }

  if (typeof MediaPreview !== 'undefined') MediaPreview.hide();

  isLoadingFile = true;
  if (fileContents.has(canonicalPath)) {
    editor.setValue(fileContents.get(canonicalPath));
    const model = editor.getModel();
    if (model) {
      monaco.editor.setModelLanguage(model, 'plaintext');
      setTimeout(() => {
        const cm = editor.getModel();
        if (cm) monaco.editor.setModelLanguage(cm, 'xml');
        isLoadingFile = false;
        updateStatusBar();
        updateBookmarkDecorations();
      }, 50);
    }
  } else {
    const diskContent = await window.api.readFile(canonicalPath);
    if (diskContent == null) {
      showToast(`无法读取文件：${canonicalPath.split(/[\\/]/).pop()}`);
      return;
    }
    fileContents.set(canonicalPath, diskContent);
    dirtyFiles.set(canonicalPath, false);
    editor.setValue(diskContent);
    const model = editor.getModel();
    if (model) {
      monaco.editor.setModelLanguage(model, 'plaintext');
      setTimeout(() => {
        const cm = editor.getModel();
        if (cm) monaco.editor.setModelLanguage(cm, 'xml');
        isLoadingFile = false;
        updateStatusBar();
        updateBookmarkDecorations();
      }, 50);
    }
  }

  currentFile = canonicalPath;
  if (!openFiles.some(fp => normalizePath(fp) === targetPath)) {
    openFiles.push(canonicalPath);
  }
  renderTabs();
  document.querySelectorAll('.tree-node.active').forEach(n => n.classList.remove('active'));
  const activeNode = document.querySelector(`.tree-node[data-path="${CSS.escape(canonicalPath)}"]`);
  if (activeNode) activeNode.classList.add('active');
  if (typeof updateFileTreeDirtyMarkerForFile === 'function') {
    updateFileTreeDirtyMarkerForFile(canonicalPath);
  } else {
    updateFileTreeDirtyMarkers();
  }
}

/** 若该文件已在标签页打开，返回已有路径（单例，避免重复打开） */
function findOpenFileCanonicalPath(filePath) {
  if (!filePath) return null;
  const target = normalizePath(filePath);
  for (const fp of openFiles) {
    if (normalizePath(fp) === target) return fp;
  }
  return null;
}
window.findOpenFileCanonicalPath = findOpenFileCanonicalPath;

// 拖拽
function handleDragStart(e) {
  dragSrcPath = this.dataset.path;
  e.dataTransfer.setData("text/plain", dragSrcPath);
  e.dataTransfer.effectAllowed = "move";
  this.classList.add("dragging");
  if (!dragIndicator) {
    dragIndicator = document.createElement("div");
    dragIndicator.className = "drag-indicator";
    dragIndicator.style.display = "none";
  }
  document.getElementById("file-tabs").appendChild(dragIndicator);
}

function handleDragEnd(e) {
  this.classList.remove("dragging");
  removeIndicator();
  dragSrcPath = null;
  lastTarget = null;
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  if (!dragSrcPath || dragSrcPath === this.dataset.path) return;
  const tab = this;
  const container = document.getElementById("file-tabs");
  const rect = tab.getBoundingClientRect();
  const mouseX = e.clientX;
  const middle = rect.left + rect.width / 2;
  if (mouseX < middle) {
    if (lastTarget !== tab || dragIndicator.dataset.position !== "before") {
      container.insertBefore(dragIndicator, tab);
      dragIndicator.style.display = "block";
      dragIndicator.dataset.position = "before";
      lastTarget = tab;
    }
  } else {
    if (lastTarget !== tab || dragIndicator.dataset.position !== "after") {
      container.insertBefore(dragIndicator, tab.nextSibling);
      dragIndicator.style.display = "block";
      dragIndicator.dataset.position = "after";
      lastTarget = tab;
    }
  }
}

function handleDragLeave(e) {}

function handleDrop(e) {
  e.preventDefault();
  if (!dragSrcPath || dragSrcPath === this.dataset.path) return;
  const fromPath = dragSrcPath;
  const toPath = this.dataset.path;
  const tabsContainer = document.getElementById("file-tabs");
  let insertIndex = openFiles.indexOf(toPath);
  if (dragIndicator && dragIndicator.dataset.position === "before") {
    // insertIndex unchanged
  } else {
    insertIndex++;
  }
  if (insertIndex > openFiles.length) insertIndex = openFiles.length;
  const fromIndex = openFiles.indexOf(fromPath);
  if (fromIndex !== -1 && insertIndex !== fromIndex) {
    openFiles.splice(fromIndex, 1);
    if (insertIndex > fromIndex) insertIndex--;
    openFiles.splice(insertIndex, 0, fromPath);
    const dragTab = tabsContainer.querySelector(`.tab[data-path="${CSS.escape(fromPath)}"]`);
    const targetTab = tabsContainer.querySelector(`.tab[data-path="${CSS.escape(toPath)}"]`);
    if (dragTab && targetTab) {
      if (insertIndex <= openFiles.indexOf(toPath)) tabsContainer.insertBefore(dragTab, targetTab);
      else tabsContainer.insertBefore(dragTab, targetTab.nextSibling);
    }
  }
  removeIndicator();
  dragSrcPath = null;
  lastTarget = null;
  scheduleAutoSaveSession();
}

function removeIndicator() {
  if (dragIndicator) {
    dragIndicator.style.display = "none";
    try { dragIndicator.remove(); } catch (e) {}
    dragIndicator = null;
  }
}

// 将核心切换函数暴露为全局，供 Agent 等外部调用
window.switchToFile = switchToFile;
window.normalizePath = normalizePath;