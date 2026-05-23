// file-tree.js - 文件树渲染、右键菜单 (调试版)

function normalizeTreeItemPath(targetPath) {
  return String(targetPath || '').replace(/\\/g, '/');
}

/** 目录路径（不含末尾项名称）；完整路径（含文件/文件夹名） */
function getTreePathCopyVariants(targetPath) {
  const full = normalizeTreeItemPath(targetPath);
  const slash = full.lastIndexOf('/');
  const parent = slash > 0 ? full.slice(0, slash) : full;
  return { dirPath: parent, fullPath: full };
}

async function copyTreePathToClipboard(text, toastLabel) {
  const value = String(text || '');
  if (!value) {
    showToast('路径为空，无法复制');
    return false;
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else if (window.api?.writeClipboardText) {
      const ok = await window.api.writeClipboardText(value);
      if (!ok) throw new Error('clipboard API failed');
    } else {
      throw new Error('剪贴板不可用');
    }
    showToast(toastLabel || '已复制到剪贴板');
    return true;
  } catch (err) {
    if (window.api?.writeClipboardText) {
      const ok = await window.api.writeClipboardText(value);
      if (ok) {
        showToast(toastLabel || '已复制到剪贴板');
        return true;
      }
    }
    showToast('复制失败: ' + (err.message || '未知错误'));
    return false;
  }
}

function treeContextCopyPathItems(targetPath) {
  const { dirPath, fullPath } = getTreePathCopyVariants(targetPath);
  return [
    {
      label: '复制文件地址',
      action: () => copyTreePathToClipboard(dirPath, '已复制目录路径'),
    },
    {
      label: '复制文件地址（带文件名）',
      action: () => copyTreePathToClipboard(fullPath, '已复制完整路径'),
    },
  ];
}

function showTreeContextMenu(e, targetPath, isDir) {
  e.preventDefault(); e.stopPropagation();
  const exist = document.querySelector('.context-menu'); if (exist) exist.remove();
  const menu = document.createElement('div'); menu.className = 'context-menu';
  menu.style.left = e.clientX + 'px'; menu.style.top = e.clientY + 'px';
  const cleanup = () => { if (menu) menu.remove(); contextMenuTargetPath = null; };
  const items = [];
  if (isDir) {
    items.push({ label: '新建', children: [
      { label: '文件夹', action: () => createNewItem('folder', targetPath) },
      { label: 'XML 文件', action: () => createNewItem('xml', targetPath) },
      { label: 'TXT 文件', action: () => createNewItem('txt', targetPath) },
      { label: 'STR 文件', action: () => createNewItem('str', targetPath) }
    ]});
    items.push({ label: '粘贴', action: () => pasteItem(targetPath) });
    items.push({ type: 'separator' });
    items.push(...treeContextCopyPathItems(targetPath));
    items.push({ type: 'separator' });
    items.push({ label: '删除', action: () => deleteItem(targetPath, true) });
  } else {
    items.push(...treeContextCopyPathItems(targetPath));
    items.push({ type: 'separator' });
    items.push({ label: '复制', action: () => copyItem(targetPath) });
    items.push({ label: '删除', action: () => deleteItem(targetPath, false) });
    items.push({ type: 'separator' });
    const ext = targetPath.split('.').pop().toLowerCase();
    const extTools = [];
    if (['w3x', 'w3d'].includes(ext)) extTools.push({ key: 'w3xViewer', label: '用 W3X 查看器打开' });
    if (ext === 'csf') extTools.push({ key: 'csfEditor', label: '用 CSF 编辑器打开' });
    if (ext === 'dds') extTools.push({ key: 'ddsViewerInstaller', label: 'DDS 缩略图工具' });
    if (['vp6', 'mp4', 'avi', 'mov', 'mpg', 'mpeg'].includes(ext)) {
      extTools.push({ key: 'virtualDub', label: 'VirtualDub' });
      extTools.push({ key: 'vp6Converter', label: 'VP6 转换器' });
    }
    if (extTools.length && window.api?.launchSdkTool) {
      extTools.forEach((t) => {
        items.push({
          label: t.label,
          action: async () => {
            const res = await window.api.launchSdkTool(t.key, targetPath);
            if (!res?.success) showToast(res?.error || '启动失败');
          },
        });
      });
      items.push({ type: 'separator' });
    }
    items.push({ label: '在新视图中打开', action: () => { openInSplitView(targetPath); cleanup(); } });
    if (currentFile && currentFile !== targetPath && !window.MediaTypes?.isMediaPath(targetPath)) {
      items.push({ label: '与当前文件对比', action: () => { showDiff(currentFile, targetPath); cleanup(); } });
    }
  }
  function buildMenu(parentEl, menuItems) {
    menuItems.forEach(it => {
      if (it.type === 'separator') { const sep = document.createElement('div'); sep.style.borderTop = '1px solid #555'; parentEl.appendChild(sep); return; }
      const div = document.createElement('div'); div.className = 'context-menu-item'; div.textContent = it.label;
      if (it.children) {
        div.style.position = 'relative';
        let subMenu = null;
        div.onmouseenter = () => {
          if (subMenu) return;
          subMenu = document.createElement('div');
          subMenu.className = 'context-menu';
          const rect = div.getBoundingClientRect();
          subMenu.style.position = 'fixed';
          subMenu.style.left = rect.right + 'px';
          subMenu.style.top = rect.top + 'px';
          subMenu.style.zIndex = '10001';
          buildMenu(subMenu, it.children);
          document.body.appendChild(subMenu);
          subMenu.addEventListener('mouseleave', () => {
            if (subMenu) { subMenu.remove(); subMenu = null; }
          });
        };
      } else if (it.action) {
        div.onclick = () => { it.action(); cleanup(); };
      }
      parentEl.appendChild(div);
    });
  }
  buildMenu(menu, items);
  document.body.appendChild(menu);
  const close = (ev) => { if (!menu.contains(ev.target)) { cleanup(); document.removeEventListener('click', close); } };
  setTimeout(() => document.addEventListener('click', close), 0);
}

async function deleteItem(targetPath, isDir) {
  let msg = isDir ? `确定永久删除文件夹及其所有内容？\n\n${targetPath}` : `确定删除文件？\n\n${targetPath}`;
  if (isDir) { if (!confirm(msg) || !confirm("二次确认：删除文件夹后无法恢复！")) return; }
  else { if (!confirm(msg)) return; }
  const result = await window.api.deleteItem(targetPath);
  if (result) {
    if (openFiles.includes(targetPath)) closeFile(targetPath);
    await notifyProjectFileIndexChanged();
    refreshFileTree();
  }
  else { showToast("删除失败"); }
}

async function createNewItem(type, parentDir) {
  const parent = (parentDir || currentRootFolder || '').replace(/\\/g, '/');
  if (!parent) {
    showToast('请先打开 MOD 项目文件夹');
    return;
  }
  const defaultNames = { folder: '新建文件夹', xml: '新文件.xml', txt: '新文件.txt', str: '新文件.str' };
  const realName = prompt('输入名称:', defaultNames[type] || '新文件');
  if (!realName) return;
  const result = await window.api.createItem(parent, realName, type === 'folder' ? 'folder' : 'file', type);
  if (result && result.path) {
    await notifyProjectFileIndexChanged();
    if (typeof refreshFileTreeFromRoot === 'function') refreshFileTreeFromRoot();
    else refreshFileTree();
    if (type !== 'folder' && typeof switchToFile === 'function') {
      switchToFile(result.path.replace(/\\/g, '/'));
    }
    showToast('已创建: ' + realName);
  } else {
    showToast('创建失败，请检查目录权限');
  }
}

async function copyItem(sourcePath) { await window.api.copyItem(sourcePath); showToast("已复制到剪贴板"); }
async function pasteItem(destDir) {
  const result = await window.api.pasteItem(destDir);
  if (result) {
    await notifyProjectFileIndexChanged();
    refreshFileTree();
    showToast("粘贴成功");
  } else showToast("粘贴失败");
}

async function refreshFileTree() {
  if (!currentRootFolder) {
    if (openFiles.length > 0) {
      const firstPath = openFiles[0];
      const lastSlash = Math.max(firstPath.lastIndexOf('/'), firstPath.lastIndexOf('\\'));
      currentRootFolder = firstPath.substring(0, lastSlash);
    } else { return; }
  }
  const items = await window.api.readDirectory(currentRootFolder);
  const container = document.getElementById("fileTree");
  container.innerHTML = "";
  renderTreeNodes(container, items, 0);
  dedupeAllTreeNodes();
}

async function notifyProjectFileIndexChanged() {
  if (window.api?.invalidateProjectFileIndex) {
    await window.api.invalidateProjectFileIndex();
  }
}
window.notifyProjectFileIndexChanged = notifyProjectFileIndexChanged;

async function loadFolder(explicitPath) {
  console.log('[loadFolder] 被调用，参数 explicitPath:', explicitPath);
  try {
    let items;
    if (explicitPath) {
      currentRootFolder = explicitPath;
      console.log('[loadFolder] 开始读取目录:', explicitPath);
      items = await window.api.readDirectory(explicitPath);
      console.log('[loadFolder] 读取结果 items 长度:', items ? items.length : 0);
    } else {
      console.log('[loadFolder] 无参数，弹出选择文件夹');
      items = await window.api.selectFolder();
      if (items && items.length > 0) {
        const firstPath = items[0].path;
        const lastSlash = Math.max(firstPath.lastIndexOf('/'), firstPath.lastIndexOf('\\'));
        currentRootFolder = firstPath.substring(0, lastSlash);
      } else { return; }
    }
    const container = document.getElementById("fileTree");
    if (!container) {
      console.error('[loadFolder] #fileTree 元素不存在');
      return;
    }
    container.innerHTML = "";
    if (items && items.length > 0) {
      renderTreeNodes(container, items, 0);
    } else {
      container.innerHTML = '<div class="empty-text">此文件夹为空</div>';
    }
  } catch (err) {
    console.error('[loadFolder] 错误:', err);
    showToast("加载文件夹失败: " + err.message);
  }
}

function dedupeTreeContainer(container) {
  if (!container) return;
  const seen = new Set();
  [...container.children].forEach((child) => {
    if (!child.classList?.contains('tree-node') || !child.dataset.path) return;
    if (seen.has(child.dataset.path)) child.remove();
    else seen.add(child.dataset.path);
  });
}

function dedupeAllTreeNodes() {
  const tree = document.getElementById('fileTree');
  if (!tree) return;
  dedupeTreeContainer(tree);
  tree.querySelectorAll('.tree-children').forEach(dedupeTreeContainer);
}

function renderTreeNodes(parentElement, items, depth) {
  items.forEach(item => {
    const nodeDiv = document.createElement("div");
    nodeDiv.className = "tree-node";
    nodeDiv.style.paddingLeft = depth * 16 + "px";
    nodeDiv.dataset.path = item.path.replace(/\\/g, '/');

    if (item.isDirectory) {
      const arrowSpan = document.createElement("span"); arrowSpan.className = "tree-arrow"; arrowSpan.textContent = "▶"; nodeDiv.appendChild(arrowSpan);
      const iconSpan = document.createElement("span"); iconSpan.className = "tree-icon"; iconSpan.textContent = "📁"; nodeDiv.appendChild(iconSpan);
      const nameSpan = document.createElement("span"); nameSpan.textContent = item.name; nodeDiv.appendChild(nameSpan);
      nodeDiv.dataset.expanded = "false"; nodeDiv.dataset.loaded = "false";
      nodeDiv.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (nodeDiv.dataset.expanded !== "true") {
          await expandTreeDirectory(nodeDiv);
        } else {
          collapseTreeDirectory(nodeDiv);
        }
      });
      nodeDiv.oncontextmenu = (e) => showTreeContextMenu(e, item.path, true);
    } else {
      const indentSpan = document.createElement("span"); indentSpan.className = "tree-indent"; nodeDiv.appendChild(indentSpan);
      const iconSpan = document.createElement("span"); iconSpan.className = "tree-icon"; iconSpan.textContent = "📄"; nodeDiv.appendChild(iconSpan);
      const nameSpan = document.createElement("span"); nameSpan.textContent = item.name; nodeDiv.appendChild(nameSpan);
      nodeDiv.addEventListener("click", (e) => {
        e.stopPropagation();
        if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; return; }
        clickTimer = setTimeout(() => { clickTimer = null; if (openFiles.includes(item.path)) switchToFile(item.path); }, 200);
      });
      nodeDiv.addEventListener("dblclick", (e) => { e.stopPropagation(); if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; } switchToFile(item.path); });
      nodeDiv.oncontextmenu = (e) => showTreeContextMenu(e, item.path, false);
    }
    parentElement.appendChild(nodeDiv);
  });
  updateFileTreeDirtyMarkers();
}

function collectExpandedPaths() {
  const paths = [];
  document.querySelectorAll('#fileTree .tree-node[data-expanded="true"]').forEach((n) => {
    if (n.dataset.path) paths.push(n.dataset.path);
  });
  return paths;
}

async function restoreExpandedPaths(expandedPaths) {
  if (!expandedPaths?.length) return;
  const sorted = [...new Set(expandedPaths)].sort(
    (a, b) => a.split('/').length - b.split('/').length
  );
  for (const p of sorted) {
    const node = treeQueryNode(p);
    if (node && node.dataset.expanded !== 'true') {
      await expandTreeDirectory(node);
    }
  }
}

async function refreshFileTreePreservingExpand() {
  const expanded = collectExpandedPaths();
  await refreshFileTree();
  await restoreExpandedPaths(expanded);
  dedupeAllTreeNodes();
}

window.refreshFileTreeSoft = function refreshFileTreeSoft() {
  if (typeof updateFileTreeDirtyMarkers === 'function') updateFileTreeDirtyMarkers();
};

function treeQueryNode(normalizedPath) {
  const tree = document.getElementById('fileTree');
  if (!tree || !normalizedPath) return null;
  return tree.querySelector(`.tree-node[data-path="${CSS.escape(normalizedPath)}"]`);
}

async function loadTreeChildrenForNode(node, { force = false } = {}) {
  if (!node) return;
  if (node.dataset.loading === 'true') {
    while (node.dataset.loading === 'true') {
      await new Promise((r) => setTimeout(r, 25));
    }
    return;
  }
  if (!force && node.dataset.loaded === 'true') return;

  const existing = node.querySelector(':scope > .tree-children');
  if (existing && !force) {
    node.dataset.loaded = 'true';
    return;
  }
  if (existing && force) existing.remove();

  node.dataset.loading = 'true';
  try {
    const depth = parseInt(node.style.paddingLeft || '0', 10) / 16;
    const children = await window.api.readDirectory(node.dataset.path);
    const cc = document.createElement('div');
    cc.className = 'tree-children';
    renderTreeNodes(cc, children, depth + 1);
    node.appendChild(cc);
    dedupeTreeContainer(cc);
    node.dataset.loaded = 'true';
  } finally {
    node.dataset.loading = 'false';
  }
}

function collapseTreeDirectory(node) {
  if (!node || node.dataset.expanded !== 'true') return;
  const cc = node.querySelector(':scope > .tree-children');
  if (cc) cc.style.display = 'none';
  const arrowSpan = node.querySelector('.tree-arrow');
  if (arrowSpan) arrowSpan.textContent = '▶';
  node.dataset.expanded = 'false';
}

async function expandTreeDirectory(node) {
  if (!node || node.dataset.expanded === 'true') return;
  const arrowSpan = node.querySelector('.tree-arrow');
  if (node.dataset.loaded !== 'true') {
    await loadTreeChildrenForNode(node);
  } else {
    const cc = node.querySelector(':scope > .tree-children');
    if (cc) cc.style.display = 'block';
  }
  if (arrowSpan) arrowSpan.textContent = '▼';
  node.dataset.expanded = 'true';
}

/** 父目录已展开但新增了文件时，仅重载该层子节点 */
async function reloadTreeChildrenForNode(node) {
  if (!node) return;
  node.dataset.loaded = 'false';
  await loadTreeChildrenForNode(node, { force: true });
}

function normalizeTreePath(filePath) {
  if (typeof normalizePath === 'function') return normalizePath(filePath);
  return String(filePath || '').replace(/\\/g, '/');
}

function setTreeFileHighlight(targetPath, options = {}) {
  const normalized = normalizeTreePath(targetPath);
  document.querySelectorAll('#fileTree .tree-node.active, #fileTree .tree-node.writing').forEach((n) => {
    n.classList.remove('active', 'writing');
  });
  const node = treeQueryNode(normalized);
  if (node) {
    node.classList.add(options.writing ? 'writing' : 'active');
    node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

/** 逐级展开目录并高亮目标文件（不整树重载） */
async function ensureTreePathVisible(targetPath, options = {}) {
  const tree = document.getElementById('fileTree');
  if (!tree || !currentRootFolder) return;
  const root = currentRootFolder.replace(/\\/g, '/');
  const normalized = normalizeTreePath(targetPath);
  if (!normalized.toLowerCase().startsWith(root.toLowerCase())) return;

  const relative = normalized.substring(root.length).replace(/^\//, '');
  const parts = relative.split('/').filter(Boolean);
  let currentPath = root;

  for (let i = 0; i < parts.length; i++) {
    currentPath = i === 0 ? `${root}/${parts[0]}` : `${currentPath}/${parts[i]}`;
    let node = treeQueryNode(currentPath);

    if (!node && i > 0) {
      const parentPath = currentPath.substring(0, currentPath.lastIndexOf('/'));
      const parentNode = treeQueryNode(parentPath);
      if (parentNode) {
        if (parentNode.dataset.expanded === 'true' && parentNode.dataset.loaded === 'true') {
          await reloadTreeChildrenForNode(parentNode);
        } else {
          await expandTreeDirectory(parentNode);
        }
        node = treeQueryNode(currentPath);
      }
    }

    if (!node) continue;

    if (i < parts.length - 1) {
      await expandTreeDirectory(node);
    } else {
      setTreeFileHighlight(normalized, { writing: !!options?.writing });
    }
  }
}

// 强制刷新文件树（从当前根目录重新加载）
window.refreshFileTreeFromRoot = function (options = {}) {
  if (typeof currentRootFolder !== 'undefined' && currentRootFolder) {
    if (options.preserveExpand) {
      return refreshFileTreePreservingExpand();
    }
    return loadFolder(currentRootFolder);
  }
  return Promise.resolve();
};

// AI 打开文件时，自动展开文件树到目标文件
async function expandFilePath(targetPath, options = {}) {
  await ensureTreePathVisible(targetPath);
  if (!options.writing) {
    setTreeFileHighlight(targetPath, { writing: false });
  }
}
window.expandFilePath = expandFilePath;
window.ensureTreePathVisible = ensureTreePathVisible;
window.setTreeFileHighlight = setTreeFileHighlight;
window.refreshFileTreePreservingExpand = refreshFileTreePreservingExpand;
window.reloadTreeChildrenForNode = reloadTreeChildrenForNode;