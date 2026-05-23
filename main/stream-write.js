// main/stream-write.js —— 编辑器流式写入（Cline 风格打字机）+ 单例打开文件

const fs = require('fs');
const path = require('path');
const { getCurrentFolder } = require('./project-state');
const { resolveWithinProject } = require('./path-sandbox');

let streamWriteCallback = null;
let openFileCallback = null;
let refreshFileCallback = null;

function setStreamWriteCallback(cb) {
  streamWriteCallback = cb;
}
function setOpenFileCallback(cb) {
  openFileCallback = cb;
}
function setRefreshFileCallback(cb) {
  refreshFileCallback = cb;
}

function notify(payload) {
  if (streamWriteCallback) streamWriteCallback(payload);
}

/** 通知渲染进程锁定/解锁 IDE 文件树、标签页与编辑器 */
function notifyUiLock(locked, meta = {}) {
  notify({ type: 'ui-lock', locked: !!locked, ...meta });
}
function notifyOpen(relativePath, line = 1, column = 1) {
  if (openFileCallback) openFileCallback(relativePath, line, column);
}
function notifyRefresh(relativePath) {
  if (refreshFileCallback) refreshFileCallback(relativePath);
}

function resolvePath(relativePath) {
  const root = getCurrentFolder();
  if (!root) return null;
  return resolveWithinProject(root, relativePath);
}

function toRelativePath(fullOrRel) {
  const root = getCurrentFolder();
  const normalized = fullOrRel.replace(/\\/g, '/');
  if (!root) return normalized;
  const rootNorm = root.replace(/\\/g, '/');
  if (normalized.toLowerCase().startsWith(rootNorm.toLowerCase())) {
    return path.relative(rootNorm, normalized).replace(/\\/g, '/');
  }
  return normalized;
}

function lineColFromOffset(text, offset) {
  const slice = text.slice(0, Math.max(0, offset));
  const parts = slice.split('\n');
  return {
    line: parts.length,
    column: (parts[parts.length - 1] || '').length + 1,
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * 流式写入单个文件（编辑器实时显示 + 文件树联动）
 */
async function streamTextToFile(opts, innerOpts = {}) {
  const {
    relativePath,
    content,
    mode = 'replace',
    chunkSize = 8,
    delayMs = 22,
    fast = false,
    onProgress,
  } = opts;

  const manageUiLock = !innerOpts.skipUiLock;
  if (manageUiLock) notifyUiLock(true, { reason: innerOpts.lockReason || 'AI 正在写入文件，请稍候…' });

  try {
    const rel = relativePath.replace(/\\/g, '/');
    const fullPath = resolvePath(rel);
    if (!fullPath) throw new Error(`路径越界或无效: ${rel}`);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const isNewFile = !fs.existsSync(fullPath);

    let baseContent = '';
    if (mode === 'append' && fs.existsSync(fullPath)) {
      baseContent = fs.readFileSync(fullPath, 'utf-8');
      if (baseContent.length && !baseContent.endsWith('\n')) baseContent += '\n';
    }

    const streamContent = content;
    let finalContent = mode === 'append' ? baseContent + streamContent : streamContent;

    if (onProgress) onProgress(`   ⌨️ ${rel}`);

    notify({ type: 'start', file: rel, clear: mode !== 'append', isNewFile });
    notifyOpen(rel, 1, 1);

    let written = mode === 'append' ? baseContent : '';

    if (mode === 'append' && baseContent) {
      const pos = lineColFromOffset(written, written.length);
      notify({
        type: 'chunk',
        file: rel,
        text: written,
        delta: baseContent,
        line: pos.line,
        column: pos.column,
      });
      await sleep(80);
    } else if (mode === 'replace') {
      notify({ type: 'chunk', file: rel, text: '', delta: '', line: 1, column: 1 });
    }

    if (fast && streamContent.length > 0) {
      written = mode === 'append' ? baseContent + streamContent : streamContent;
      const pos = lineColFromOffset(written, written.length);
      notify({
        type: 'chunk',
        file: rel,
        text: written,
        delta: streamContent,
        line: pos.line,
        column: pos.column,
      });
    }

    for (let i = fast ? streamContent.length : 0; i < streamContent.length; i += chunkSize) {
      const delta = streamContent.slice(i, i + chunkSize);
      written += delta;
      const pos = lineColFromOffset(written, written.length);
      notify({
        type: 'chunk',
        file: rel,
        text: written,
        delta,
        line: pos.line,
        column: pos.column,
      });
      await sleep(delayMs);
    }

    const relNorm = rel.replace(/\\/g, '/');
    if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(relNorm)) {
      throw new Error(`拒绝写入含中文的路径：${relNorm}。请使用英文 PascalCase 作为目录/文件名。`);
    }
    const root = getCurrentFolder();
    if (root && /(?:^|\/)mod\.xml$/i.test(relNorm)) {
      const { prepareModXmlWrite } = require('./mod-xml-guard');
      const prep = prepareModXmlWrite(relNorm, finalContent, root);
      if (!prep.allowed) {
        throw new Error(prep.message || prep.errors.join('；'));
      }
      if (prep.sanitized && prep.sanitizeLog?.length) {
        console.warn('[mod-xml-guard]', prep.sanitizeLog.join('；'));
      }
      finalContent = prep.content;
    }

    try {
      const rootCap = getCurrentFolder();
      if (rootCap) {
        const { captureBeforeMutate } = require('./agent-rollback');
        captureBeforeMutate(rootCap, rel);
      }
    } catch (e) {
      console.warn('[stream-write] rollback capture:', e.message);
    }

    fs.writeFileSync(fullPath, finalContent, 'utf-8');
    const endPos = lineColFromOffset(finalContent, finalContent.length);
    notify({
      type: 'end',
      file: rel,
      line: endPos.line,
      column: endPos.column,
      markDirty: true,
    });
    if (isNewFile) notifyRefresh(rel);

    return { success: true, data: { file: rel, fullPath } };
  } finally {
    if (manageUiLock) notifyUiLock(false);
  }
}

/**
 * 依次流式写入多个文件
 * @param {Array<{rel?:string,relativePath?:string,content:string}>} files
 */
async function streamTextToFiles(files, options = {}) {
  notifyUiLock(true, { reason: options.lockReason || 'AI 正在写入多个文件，请稍候…' });
  const written = [];
  try {
    for (const f of files) {
      const rel = (f.rel || f.relativePath || '').replace(/\\/g, '/');
      if (!rel || f.content == null) continue;
      await streamTextToFile(
        {
          relativePath: rel,
          content: f.content,
          mode: options.mode || 'replace',
          chunkSize: options.chunkSize ?? 8,
          delayMs: options.delayMs ?? 22,
          fast: !!f.fast,
          onProgress: f.fast ? undefined : options.onProgress,
        },
        { skipUiLock: true }
      );
      written.push(rel);
    }
    return { success: true, data: { files: written } };
  } finally {
    notifyUiLock(false);
  }
}

/** 从绝对/相对路径流式写入 */
async function streamTextToFullPath(fullPath, content, options = {}) {
  const rel = toRelativePath(fullPath);
  return streamTextToFile({ ...options, relativePath: rel, content });
}

module.exports = {
  streamTextToFile,
  streamTextToFiles,
  streamTextToFullPath,
  toRelativePath,
  resolvePath,
  notifyUiLock,
  setStreamWriteCallback,
  setOpenFileCallback,
  setRefreshFileCallback,
};
