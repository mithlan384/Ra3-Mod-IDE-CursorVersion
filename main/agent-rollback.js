// main/agent-rollback.js —— AI 写操作前快照，支持「回退代码」一键还原

const fs = require('fs');
const path = require('path');
const { getCurrentFolder } = require('./project-state');
const { resolveWithinProject } = require('./path-sandbox');

const MAX_STACK = 10;
const SNAPSHOT_SUBDIR = '.ra3-ide/snapshots';

/** @type {Map<string, object[]>} */
const stacksByRoot = new Map();

/** @type {object|null} */
let activeTurn = null;

const ROLLBACK_PATTERNS =
  /(?:回退|撤销|还原|恢复|撤回).{0,12}(?:代码|修改|操作|文件|变更|改动)|(?:代码|项目|文件).{0,8}(?:回退|还原|恢复)|撤销刚才|回退刚才|恢复刚才|还原刚才|undo\s*(?:code|changes)?|rollback|\/rollback\b/i;

const BINARY_EXT = new Set([
  '.w3x',
  '.w3d',
  '.dds',
  '.tga',
  '.png',
  '.jpg',
  '.jpeg',
  '.wav',
  '.mp3',
  '.ogg',
  '.big',
  '.onnx',
]);

function normalizeRel(rel) {
  return String(rel || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
}

function isTrackedPath(rel) {
  const r = normalizeRel(rel).toLowerCase();
  if (!r || r.startsWith('.ra3-ide/') || r.startsWith('node_modules/')) return false;
  const ext = path.extname(r);
  if (BINARY_EXT.has(ext)) return true;
  return true;
}

function getStack(root) {
  const key = path.resolve(root).toLowerCase();
  if (!stacksByRoot.has(key)) stacksByRoot.set(key, []);
  return stacksByRoot.get(key);
}

function snapshotDir(root) {
  return path.join(root, SNAPSHOT_SUBDIR);
}

function persistSnapshot(root, snap) {
  try {
    const dir = snapshotDir(root);
    fs.mkdirSync(dir, { recursive: true });
    const manifest = {
      id: snap.id,
      label: snap.label,
      userMessage: snap.userMessage,
      sessionId: snap.sessionId,
      startedAt: snap.startedAt,
      finishedAt: snap.finishedAt,
      files: snap.files,
    };
    fs.writeFileSync(path.join(dir, `${snap.id}.json`), JSON.stringify(manifest, null, 0), 'utf-8');
    fs.writeFileSync(path.join(dir, 'stack.json'), JSON.stringify(getStack(root).map((s) => s.id)), 'utf-8');
  } catch (e) {
    console.warn('[agent-rollback] persist:', e.message);
  }
}

function loadStacksFromDisk(root) {
  try {
    const dir = snapshotDir(root);
    const stackFile = path.join(dir, 'stack.json');
    if (!fs.existsSync(stackFile)) return;
    const ids = JSON.parse(fs.readFileSync(stackFile, 'utf-8'));
    const stack = [];
    for (const id of ids) {
      const f = path.join(dir, `${id}.json`);
      if (fs.existsSync(f)) stack.push(JSON.parse(fs.readFileSync(f, 'utf-8')));
    }
    stacksByRoot.set(path.resolve(root).toLowerCase(), stack.slice(-MAX_STACK));
  } catch (e) {
    console.warn('[agent-rollback] load:', e.message);
  }
}

function isRollbackRequest(message) {
  return ROLLBACK_PATTERNS.test(String(message || '').trim());
}

/**
 * 开始记录本轮 AI 对项目的修改（在会写文件的路由/工具执行前调用）
 */
function beginAiChangeTurn(meta = {}) {
  activeTurn = {
    id: `snap_${Date.now().toString(36)}`,
    label: meta.label || 'AI 操作',
    userMessage: String(meta.userMessage || '').slice(0, 500),
    sessionId: meta.sessionId || null,
    startedAt: Date.now(),
    files: {},
  };
  return activeTurn.id;
}

/**
 * 写入/覆盖前：记录修改前内容；新文件记为 created
 */
function captureBeforeMutate(projectRoot, relPath) {
  if (!activeTurn || !projectRoot) return;
  const rel = normalizeRel(relPath);
  if (!rel || !isTrackedPath(rel)) return;
  if (activeTurn.files[rel]) return;

  const full = resolveWithinProject(projectRoot, rel);
  if (!full) return;

  try {
    if (fs.existsSync(full)) {
      const stat = fs.statSync(full);
      if (stat.isDirectory()) return;
      const ext = path.extname(rel).toLowerCase();
      if (BINARY_EXT.has(ext)) {
        const backupName = `${activeTurn.id}_${rel.replace(/[/\\]/g, '__')}`;
        const backupPath = path.join(snapshotDir(projectRoot), backupName);
        fs.mkdirSync(path.dirname(backupPath), { recursive: true });
        fs.copyFileSync(full, backupPath);
        activeTurn.files[rel] = { kind: 'modified_binary', backupName };
      } else {
        activeTurn.files[rel] = { kind: 'modified', before: fs.readFileSync(full, 'utf-8') };
      }
    } else {
      activeTurn.files[rel] = { kind: 'created' };
    }
  } catch (e) {
    console.warn('[agent-rollback] capture mutate:', rel, e.message);
  }
}

/**
 * 删除前：记录被删文件内容（本轮新建的文件删除则净效果为零）
 */
function captureBeforeDelete(projectRoot, relPath) {
  if (!activeTurn || !projectRoot) return;
  const rel = normalizeRel(relPath);
  if (!rel || !isTrackedPath(rel)) return;

  const existing = activeTurn.files[rel];
  if (existing?.kind === 'created') {
    delete activeTurn.files[rel];
    return;
  }

  const full = resolveWithinProject(projectRoot, rel);
  if (!full || !fs.existsSync(full)) return;

  try {
    const stat = fs.statSync(full);
    if (stat.isDirectory()) return;
    const ext = path.extname(rel).toLowerCase();
    if (BINARY_EXT.has(ext)) {
      const backupName = `${activeTurn.id}_${rel.replace(/[/\\]/g, '__')}`;
      const backupPath = path.join(snapshotDir(projectRoot), backupName);
      fs.mkdirSync(path.dirname(backupPath), { recursive: true });
      fs.copyFileSync(full, backupPath);
      activeTurn.files[rel] = { kind: 'deleted_binary', backupName };
    } else {
      activeTurn.files[rel] = { kind: 'deleted', before: fs.readFileSync(full, 'utf-8') };
    }
  } catch (e) {
    console.warn('[agent-rollback] capture delete:', rel, e.message);
  }
}

function endAiChangeTurn(extra = {}) {
  if (!activeTurn) return null;
  const root = getCurrentFolder();
  const fileCount = Object.keys(activeTurn.files).length;
  const snap = {
    ...activeTurn,
    finishedAt: Date.now(),
    changedFiles: extra.changedFiles || [],
  };
  activeTurn = null;

  if (fileCount === 0) return null;

  if (root) {
    const stack = getStack(root);
    stack.push(snap);
    while (stack.length > MAX_STACK) stack.shift();
    persistSnapshot(root, snap);
  }
  return snap;
}

function getLastSnapshotSummary(projectRoot) {
  const root = projectRoot || getCurrentFolder();
  if (!root) return null;
  loadStacksFromDisk(root);
  const stack = getStack(root);
  if (!stack.length) return null;
  const last = stack[stack.length - 1];
  const files = Object.keys(last.files || {});
  return {
    id: last.id,
    label: last.label,
    userMessage: last.userMessage,
    finishedAt: last.finishedAt,
    fileCount: files.length,
    files: files.slice(0, 24),
  };
}

/**
 * 预览最近一次回退将影响的文件（不执行删改）
 */
function previewRollbackPlan(projectRoot) {
  const root = projectRoot || getCurrentFolder();
  if (!root) return { success: false, error: '请先打开 MOD 项目' };

  loadStacksFromDisk(root);
  const stack = getStack(root);
  if (!stack.length) {
    return { success: false, error: '没有可回退的 AI 操作记录（仅记录通过 IDE AI 修改的文件）' };
  }

  const snap = stack[stack.length - 1];
  const toRestore = [];
  const toDelete = [];
  for (const [rel, entry] of Object.entries(snap.files || {})) {
    if (entry.kind === 'created') toDelete.push(rel);
    else if (['modified', 'deleted', 'modified_binary', 'deleted_binary'].includes(entry.kind)) {
      toRestore.push(rel);
    }
  }
  toRestore.sort((a, b) => a.localeCompare(b));
  toDelete.sort((a, b) => a.localeCompare(b));

  return {
    success: true,
    snapshot: {
      id: snap.id,
      label: snap.label,
      userMessage: snap.userMessage,
      finishedAt: snap.finishedAt,
    },
    toRestore,
    toDelete,
    stackDepth: stack.length,
  };
}

function formatRollbackPlanPreview(preview) {
  if (!preview?.success) return '';
  const lines = [
    '#### 回退方案（确认后才会执行）',
    '',
    `- **将撤销的操作**：${preview.snapshot.label || 'AI 操作'}`,
  ];
  if (preview.snapshot.userMessage) {
    lines.push(`- **原请求**：${preview.snapshot.userMessage.slice(0, 200)}`);
  }
  if (preview.stackDepth > 1) {
    lines.push(
      `- **说明**：当前共有 ${preview.stackDepth} 次 AI 快照；本次仅回退**最近一轮**，更早状态需多次回退。`
    );
  }
  lines.push('');
  if (preview.toRestore.length) {
    lines.push(`**将恢复**（${preview.toRestore.length} 个文件）：`);
    for (const f of preview.toRestore.slice(0, 40)) lines.push(`- \`${f}\``);
    if (preview.toRestore.length > 40) {
      lines.push(`- … 另有 ${preview.toRestore.length - 40} 个`);
    }
    lines.push('');
  }
  if (preview.toDelete.length) {
    lines.push(`**将删除**（上轮 AI 新建，共 ${preview.toDelete.length} 个）：`);
    for (const f of preview.toDelete.slice(0, 40)) lines.push(`- \`${f}\``);
    if (preview.toDelete.length > 40) {
      lines.push(`- … 另有 ${preview.toDelete.length - 40} 个`);
    }
    lines.push('');
  }
  if (!preview.toRestore.length && !preview.toDelete.length) {
    lines.push('（快照中无文件变更记录）\n');
  }
  lines.push('> 仅影响通过 IDE AI 流程改动的文件；你在编辑器里手动改的内容不会被回退。');
  return lines.join('\n');
}

function formatRollbackReport(result) {
  if (!result.success) return `❌ ${result.error || '回退失败'}`;
  const lines = ['✅ **已回退到 AI 操作前的状态**'];
  if (result.snapshot?.label) lines.push(`- 操作：${result.snapshot.label}`);
  if (result.snapshot?.userMessage) {
    lines.push(`- 原请求：${result.snapshot.userMessage.slice(0, 120)}`);
  }
  if (result.restored?.length) {
    lines.push(`- 已恢复 ${result.restored.length} 个文件：\n${result.restored.map((f) => `  - \`${f}\``).join('\n')}`);
  }
  if (result.deleted?.length) {
    lines.push(`- 已删除 ${result.deleted.length} 个新建文件：\n${result.deleted.map((f) => `  - \`${f}\``).join('\n')}`);
  }
  if (result.errors?.length) {
    lines.push(`- ⚠️ 部分失败：${result.errors.map((e) => e.rel).join(', ')}`);
  }
  if (!result.restored?.length && !result.deleted?.length) {
    lines.push('- （未发现需要变更的文件，可能已被手动修改）');
  }
  lines.push('\n可在左侧文件树刷新查看；已打开的标签页请重新加载文件以同步内容。');
  lines.push(
    '\n**注意：**只记录通过 IDE AI 流程改动的文件；你手动在编辑器里改的内容不会被记入快照，也不会被误回退。若连续执行了多次 AI 操作，每次说「回退」只撤销最近一轮；要回到更早状态需多次回退。'
  );
  lines.push(
    '快照保存在项目目录 `.ra3-ide/snapshots/`（最多保留 10 次，重启 IDE 后仍可回退最近一次）。'
  );
  return lines.join('\n');
}

/**
 * 回退最近一次 AI 操作
 */
function rollbackLastAiChanges(projectRoot) {
  const root = projectRoot || getCurrentFolder();
  if (!root) return { success: false, error: '请先打开 MOD 项目' };

  loadStacksFromDisk(root);
  const stack = getStack(root);
  if (!stack.length) {
    return { success: false, error: '没有可回退的 AI 操作记录（仅记录通过 IDE AI 修改的文件）' };
  }

  const snap = stack.pop();
  const restored = [];
  const deleted = [];
  const errors = [];

  for (const [rel, entry] of Object.entries(snap.files || {})) {
    const full = resolveWithinProject(root, rel);
    if (!full) {
      errors.push({ rel, error: '路径无效' });
      continue;
    }
    try {
      if (entry.kind === 'created') {
        if (fs.existsSync(full)) {
          fs.unlinkSync(full);
          deleted.push(rel);
        }
      } else if (entry.kind === 'modified' || entry.kind === 'deleted') {
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, entry.before, 'utf-8');
        restored.push(rel);
      } else if (entry.kind === 'modified_binary' || entry.kind === 'deleted_binary') {
        const backup = path.join(snapshotDir(root), entry.backupName || '');
        if (backup && fs.existsSync(backup)) {
          fs.mkdirSync(path.dirname(full), { recursive: true });
          fs.copyFileSync(backup, full);
          restored.push(rel);
        } else {
          errors.push({ rel, error: '缺少二进制备份' });
        }
      } else if (entry.kind === 'deleted') {
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, entry.before, 'utf-8');
        restored.push(rel);
      }
    } catch (e) {
      errors.push({ rel, error: e.message });
    }
  }

  try {
    const dir = snapshotDir(root);
    const stackFile = path.join(dir, 'stack.json');
    fs.writeFileSync(
      stackFile,
      JSON.stringify(stack.map((s) => s.id)),
      'utf-8'
    );
    const snapFile = path.join(dir, `${snap.id}.json`);
    if (fs.existsSync(snapFile)) fs.unlinkSync(snapFile);
  } catch (e) {
    console.warn('[agent-rollback] cleanup:', e.message);
  }

  return {
    success: errors.length === 0 || restored.length + deleted.length > 0,
    restored,
    deleted,
    errors,
    snapshot: snap,
  };
}

function sendRollbackFollowUp(win, sessionId) {
  const summary = getLastSnapshotSummary(getCurrentFolder());
  if (!summary || !win || win.isDestroyed()) return;
  win.webContents.send('agent:follow-up-proposal', {
    sessionId,
    preamble: '若对刚才的 AI 修改不满意，可一键回退：',
    actions: [
      {
        id: 'rollback_ai',
        label: '回退上次 AI 代码修改',
        message: '回退代码，恢复到 AI 操作之前的状态',
        variant: 'primary',
      },
    ],
  });
}

module.exports = {
  isRollbackRequest,
  beginAiChangeTurn,
  captureBeforeMutate,
  captureBeforeDelete,
  endAiChangeTurn,
  previewRollbackPlan,
  formatRollbackPlanPreview,
  rollbackLastAiChanges,
  getLastSnapshotSummary,
  formatRollbackReport,
  sendRollbackFollowUp,
};
