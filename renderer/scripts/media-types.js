// renderer/scripts/media-types.js —— 资源扩展名与预览类型

const MEDIA_TYPES = {
  image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'],
  tga: ['tga'],
  dds: ['dds'],
  audio: ['wav', 'mp3', 'ogg'],
  video: ['mp4', 'webm', 'avi', 'mov', 'mpeg', 'mpg'],
  vp6: ['vp6'],
  w3x: ['w3x', 'w3d'],
  csf: ['csf'],
};

function getFileExt(filePath) {
  const m = String(filePath || '').match(/\.([a-zA-Z0-9]+)$/);
  return m ? m[1].toLowerCase() : '';
}

function getMediaKind(filePath) {
  const ext = getFileExt(filePath);
  for (const [kind, exts] of Object.entries(MEDIA_TYPES)) {
    if (exts.includes(ext)) return kind;
  }
  return null;
}

function isMediaPath(filePath) {
  return !!getMediaKind(filePath);
}

function isEditableMediaKind(kind) {
  return kind === 'csf';
}

window.MediaTypes = {
  MEDIA_TYPES,
  getFileExt,
  getMediaKind,
  isMediaPath,
  isEditableMediaKind,
};
