// utils.js - 通用 UI 工具函数
function showToast(message) {
  const text = message == null ? '' : String(message).trim();
  if (!text) return;
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = text;
  t.classList.add("show");
  setTimeout(() => {
    t.classList.remove("show");
    t.textContent = "";
  }, 2000);
}

function applyDirtyMarkerToNode(node, filePath) {
  if (!node || !filePath) return;
  if (dirtyFiles.get(filePath)) {
    let marker = node.querySelector('.dirty-marker');
    if (!marker) {
      marker = document.createElement('span');
      marker.className = 'dirty-marker';
      marker.textContent = ' *';
      node.appendChild(marker);
    }
  } else {
    const marker = node.querySelector('.dirty-marker');
    if (marker) marker.remove();
  }
}

/** 仅更新当前文件对应树节点，避免每次按键扫描整棵树 */
function updateFileTreeDirtyMarkerForFile(filePath) {
  if (!filePath) return;
  const norm = String(filePath).replace(/\\/g, '/');
  if (typeof treeQueryNode === 'function') {
    const node = treeQueryNode(norm);
    if (node) {
      applyDirtyMarkerToNode(node, norm);
      return;
    }
  }
  updateFileTreeDirtyMarkers();
}

function updateFileTreeDirtyMarkers() {
  document.querySelectorAll('.tree-node').forEach((node) => {
    const p = node.dataset.path;
    if (!p) return;
    applyDirtyMarkerToNode(node, p);
  });
}

function updateStatusBarDebounced() {
  if (!statusUpdateTimer) { statusUpdateTimer = setTimeout(() => { updateStatusBar(); statusUpdateTimer = null; }, 100); }
}