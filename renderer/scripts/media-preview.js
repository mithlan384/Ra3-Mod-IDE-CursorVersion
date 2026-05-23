// renderer/scripts/media-preview.js —— 主编辑区资源预览（只读/CSF 可编辑）

let activePreviewPath = null;
let activePreviewKind = null;
let previewObjectUrls = [];

function revokePreviewUrls() {
  previewObjectUrls.forEach((u) => URL.revokeObjectURL(u));
  previewObjectUrls = [];
}

function blobUrl(buffer, mime) {
  const blob = new Blob([buffer], { mime });
  const url = URL.createObjectURL(blob);
  previewObjectUrls.push(url);
  return url;
}

function getPanel() {
  return document.getElementById('media-preview');
}

function getEditorEl() {
  return document.getElementById('editor');
}

function toolbarHtml(filePath, kind, extra = '') {
  const name = filePath.split(/[\\/]/).pop();
  return `
    <div class="media-preview-toolbar">
      <span class="media-preview-title">${escapeHtml(name)} <span class="media-badge">${kind}</span></span>
      <div class="media-preview-actions">${extra}</div>
    </div>`;
}

function externalToolButtons(kind) {
  const tools = [];
  if (kind === 'w3x') {
    tools.push({ key: 'w3xViewer', label: 'W3X 查看器' });
  }
  if (kind === 'dds') {
    tools.push({ key: 'ddsViewerInstaller', label: 'DDS 缩略图插件' });
  }
  if (kind === 'vp6' || kind === 'video') {
    tools.push({ key: 'virtualDub', label: 'VirtualDub' });
    tools.push({ key: 'vp6Converter', label: 'VP6 转换器' });
    tools.push({ key: 'vp6Codec', label: 'VP6 编码器' });
  }
  if (kind === 'csf') {
    tools.push({ key: 'csfEditor', label: '外部 CSF 编辑器' });
  }
  return tools
    .map(
      (t) =>
        `<button type="button" class="app-btn app-btn--secondary media-ext-btn" data-tool="${t.key}">${t.label}</button>`
    )
    .join('');
}

function wireExternalButtons(container, filePath) {
  container.querySelectorAll('.media-ext-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const tool = btn.dataset.tool;
      if (!window.api?.launchSdkTool) {
        showToast('SDK 工具 API 不可用');
        return;
      }
      const res = await window.api.launchSdkTool(tool, filePath);
      if (!res?.success) showToast(res?.error || '启动失败');
      else showToast('已启动外部工具');
    });
  });
  const folderBtn = container.querySelector('.media-open-folder-btn');
  if (folderBtn) {
    folderBtn.addEventListener('click', async () => {
      const res = await window.api.launchSdkTool('openContainingFolder', filePath);
      if (!res?.success) showToast(res?.error || '打开失败');
    });
  }
}

async function renderImage(filePath, ext) {
  const panel = getPanel();
  const raw = await window.api.readBinaryFile(filePath);
  const mime =
    ext === 'png'
      ? 'image/png'
      : ext === 'gif'
        ? 'image/gif'
        : ext === 'webp'
          ? 'image/webp'
          : ext === 'bmp'
            ? 'image/bmp'
            : 'image/jpeg';
  const url = blobUrl(raw, mime);
  panel.innerHTML =
    toolbarHtml(filePath, '图片') +
    `<div class="media-preview-body media-preview-center"><img src="${url}" alt="preview" class="media-preview-img"/></div>`;
}

async function renderTga(filePath) {
  const panel = getPanel();
  panel.innerHTML =
    toolbarHtml(filePath, 'TGA', externalToolButtons('dds')) +
    `<div class="media-preview-body media-preview-center"><canvas id="media-canvas" class="media-preview-canvas"></canvas></div>`;
  const canvas = panel.querySelector('#media-canvas');
  const info = await window.TgaViewer.renderTgaToCanvas(canvas, filePath);
  const sub = panel.querySelector('.media-preview-title');
  if (sub) sub.innerHTML += ` <span class="media-dim">${info.width}×${info.height}</span>`;
  wireExternalButtons(panel, filePath);
}

async function renderDds(filePath) {
  const panel = getPanel();
  panel.innerHTML =
    toolbarHtml(filePath, 'DDS', externalToolButtons('dds')) +
    `<div class="media-preview-body media-preview-center"><canvas id="media-canvas" class="media-preview-canvas"></canvas></div>`;
  const raw = await window.api.readBinaryFile(filePath);
  const decoded = window.DdsDecoder.decodeDDS(raw);
  const canvas = panel.querySelector('#media-canvas');
  canvas.width = decoded.width;
  canvas.height = decoded.height;
  const ctx = canvas.getContext('2d');
  ctx.putImageData(new ImageData(decoded.data, decoded.width, decoded.height), 0, 0);
  const sub = panel.querySelector('.media-preview-title');
  if (sub)
    sub.innerHTML += ` <span class="media-dim">${decoded.width}×${decoded.height} ${decoded.format}</span>`;
  wireExternalButtons(panel, filePath);
}

async function renderAudio(filePath, ext) {
  const panel = getPanel();
  const raw = await window.api.readBinaryFile(filePath);
  const mime = ext === 'mp3' ? 'audio/mpeg' : ext === 'ogg' ? 'audio/ogg' : 'audio/wav';
  const url = blobUrl(raw, mime);
  panel.innerHTML =
    toolbarHtml(filePath, '音频') +
    `<div class="media-preview-body media-preview-center"><audio controls src="${url}" class="media-preview-audio"></audio></div>`;
}

async function renderVideo(filePath, ext) {
  const panel = getPanel();
  const raw = await window.api.readBinaryFile(filePath);
  const mime =
    ext === 'webm' ? 'video/webm' : ext === 'avi' ? 'video/x-msvideo' : 'video/mp4';
  const url = blobUrl(raw, mime);
  panel.innerHTML =
    toolbarHtml(filePath, '视频', externalToolButtons('video')) +
    `<div class="media-preview-body media-preview-center">
      <video controls src="${url}" class="media-preview-video"></video>
      <p class="media-hint">VP6 需用 SDK 工具转换后才能在游戏内使用；MP4/AVI 可直接预览。</p>
    </div>`;
  wireExternalButtons(panel, filePath);
}

async function renderVp6(filePath) {
  const panel = getPanel();
  panel.innerHTML =
    toolbarHtml(filePath, 'VP6', externalToolButtons('vp6')) +
    `<div class="media-preview-body">
      <p class="media-hint">VP6 为红警3 UI 视频格式，浏览器无法直接播放。</p>
      <p class="media-hint">请使用 SDK「RA3视频制作」工具链：VirtualDub 压缩为 VP6 → VP6Converter 转码。</p>
      <button type="button" class="app-btn app-btn--secondary media-open-folder-btn">打开所在文件夹</button>
    </div>`;
  wireExternalButtons(panel, filePath);
}

async function renderW3x(filePath) {
  const panel = getPanel();
  const raw = await window.api.readBinaryFile(filePath);
  const info = window.W3xInfo.parseW3xInfo(raw);
  panel.innerHTML =
    toolbarHtml(filePath, 'W3X', externalToolButtons('w3x')) +
    `<div class="media-preview-body"><pre class="media-w3x-info">${escapeHtml(info.lines.join('\n'))}</pre></div>`;
  wireExternalButtons(panel, filePath);
}

async function renderCsf(filePath) {
  const panel = getPanel();
  panel.innerHTML =
    toolbarHtml(filePath, 'CSF', externalToolButtons('csf')) +
    `<div class="media-preview-body media-csf-body"><div id="media-csf-root"></div></div>`;
  wireExternalButtons(panel, filePath);
  await loadCsfEditor(filePath, panel.querySelector('#media-csf-root'));
}

async function show(filePath) {
  const kind = window.MediaTypes.getMediaKind(filePath);
  if (!kind) {
    hide();
    return false;
  }

  if (currentFile && editor && !window.MediaTypes.isMediaPath(currentFile)) {
    fileContents.set(currentFile, editor.getValue());
  }

  revokePreviewUrls();
  activePreviewPath = filePath;
  activePreviewKind = kind;

  const panel = getPanel();
  const editorEl = getEditorEl();
  if (!panel || !editorEl) return false;

  panel.style.display = 'flex';
  editorEl.style.display = 'none';
  panel.innerHTML = '<div class="media-loading">加载中…</div>';

  try {
    const ext = window.MediaTypes.getFileExt(filePath);
    switch (kind) {
      case 'image':
        await renderImage(filePath, ext);
        break;
      case 'tga':
        await renderTga(filePath);
        break;
      case 'dds':
        await renderDds(filePath);
        break;
      case 'audio':
        await renderAudio(filePath, ext);
        break;
      case 'video':
        await renderVideo(filePath, ext);
        break;
      case 'vp6':
        await renderVp6(filePath);
        break;
      case 'w3x':
        await renderW3x(filePath);
        break;
      case 'csf':
        await renderCsf(filePath);
        break;
      default:
        throw new Error('未知预览类型');
    }
    window.currentPreviewMode = kind;
    return true;
  } catch (err) {
    panel.innerHTML =
      toolbarHtml(filePath, kind) +
      `<div class="media-preview-body"><p class="media-error">预览失败: ${escapeHtml(err.message)}</p></div>`;
    console.error('[MediaPreview]', err);
    return true;
  }
}

function hide() {
  revokePreviewUrls();
  activePreviewPath = null;
  activePreviewKind = null;
  window.currentPreviewMode = null;
  const panel = getPanel();
  const editorEl = getEditorEl();
  if (panel) {
    panel.style.display = 'none';
    panel.innerHTML = '';
  }
  if (editorEl) editorEl.style.display = 'block';
}

function isActive() {
  return !!activePreviewPath;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

window.MediaPreview = {
  show,
  hide,
  isActive,
  isMediaPath: (p) => window.MediaTypes.isMediaPath(p),
};
