// properties-panel.js - 属性面板管理（修复三角标显示）

function togglePropertiesPanel() {
  if (window.PanelLayout) {
    window.PanelLayout.toggle('properties');
  }
}

// 更新属性面板内容（保持不变，与前版相同）
async function updatePropertiesPanel(filePath) {
  const panel = document.getElementById('right-panel');
  if (!panel || (window.PanelLayout && !window.PanelLayout.isVisible('properties'))) return;

  const infoDiv = document.getElementById('file-info');
  const tgaDiv = document.getElementById('tga-preview');
  const csfDiv = document.getElementById('csf-editor');
  const w3xDiv = document.getElementById('w3x-info');

  infoDiv.innerHTML = '';
  tgaDiv.style.display = 'none';
  csfDiv.style.display = 'none';
  w3xDiv.style.display = 'none';

  if (!filePath) {
    infoDiv.innerHTML = '<div style="padding:10px;color:#aaa;">未打开文件</div>';
    return;
  }

  try {
    const stat = await window.api.getFileStat(filePath);
    if (!stat) return;

    const ext = filePath.split('.').pop().toLowerCase();
    const isTga = ext === 'tga';
    const isCsf = ext === 'csf';
    const isW3x = ext === 'w3x';

    infoDiv.innerHTML = `
      <div class="file-property"><b>文件名:</b> ${escapeHtml(filePath.split(/[\\\/]/).pop())}</div>
      <div class="file-property"><b>路径:</b> ${escapeHtml(filePath)}</div>
      <div class="file-property"><b>大小:</b> ${formatFileSize(stat.size)}</div>
      <div class="file-property"><b>修改时间:</b> ${new Date(stat.mtime).toLocaleString()}</div>
    `;

    const mediaKind =
      typeof MediaTypes !== 'undefined' ? MediaTypes.getMediaKind(filePath) : null;

    if (mediaKind === 'csf') {
      infoDiv.innerHTML +=
        '<div class="file-property" style="color:var(--app-accent-solid);">CSF 在主编辑区编辑，Ctrl+S 保存</div>';
    } else if (isTga && mediaKind !== 'tga') {
      tgaDiv.style.display = 'block';
      loadTgaPreview(filePath);
    } else if (isW3x && mediaKind !== 'w3x') {
      w3xDiv.style.display = 'block';
      w3xDiv.innerHTML = '<div style="padding:10px;color:#aaa;">W3X 模型文件 (主区可预览)</div>';
    } else if (mediaKind) {
      infoDiv.innerHTML +=
        `<div class="file-property">资源类型: ${mediaKind}（主编辑区预览）</div>`;
    }
  } catch (err) {
    infoDiv.innerHTML = '<div style="padding:10px;color:#f44747;">无法加载文件信息</div>';
  }
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 监听文件切换事件
const origSwitchToFile = window.switchToFile;
if (origSwitchToFile) {
  window.switchToFile = async function(filePath) {
    await origSwitchToFile(filePath);
    updatePropertiesPanel(filePath);
  };
}

window.addEventListener('load', () => {
  setTimeout(() => {
    if (currentFile) updatePropertiesPanel(currentFile);
  }, 500);
});