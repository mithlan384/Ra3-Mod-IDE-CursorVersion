// main/project-auto-backup.js —— 定时将当前 MOD 项目完整备份到用户指定目录

const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, dialog } = require('electron');
const { getCurrentFolder } = require('./project-state');
const { isPathInsideResolved, tryRealpath } = require('./path-sandbox');

const SKIP_DIR_NAMES = new Set(['.ra3-ide', 'node_modules', '.git', '.cache']);

let backupTimer = null;
let backupRunning = false;
let restoreRunning = false;
let getMainWindow = () => null;

/** @type {{ lastRunAt: number|null, lastError: string|null, nextRunAt: number|null, lastDest: string|null, running: boolean }} */
let status = {
  lastRunAt: null,
  lastError: null,
  nextRunAt: null,
  lastDest: null,
  running: false,
};

function configure(opts = {}) {
  if (opts.getMainWindow) getMainWindow = opts.getMainWindow;
}

function getPreferencesPath() {
  return path.join(app.getPath('userData'), 'preferences.json');
}

function readBackupPrefs() {
  const defaults = {
    projectBackupEnabled: false,
    projectBackupDir: '',
    projectBackupIntervalDays: 0,
    projectBackupIntervalHours: 0,
    projectBackupIntervalMinutes: 0,
    projectBackupMaxCount: 10,
  };
  try {
    const prefPath = getPreferencesPath();
    if (!fs.existsSync(prefPath)) return defaults;
    return { ...defaults, ...JSON.parse(fs.readFileSync(prefPath, 'utf-8')) };
  } catch (e) {
    console.warn('[project-auto-backup] read prefs:', e.message);
    return defaults;
  }
}

function intervalMsFromPrefs(prefs) {
  const d = Math.max(0, parseInt(prefs.projectBackupIntervalDays, 10) || 0);
  const h = Math.max(0, parseInt(prefs.projectBackupIntervalHours, 10) || 0);
  const m = Math.max(0, parseInt(prefs.projectBackupIntervalMinutes, 10) || 0);
  const totalMinutes = d * 24 * 60 + h * 60 + m;
  if (totalMinutes <= 0) return 0;
  return totalMinutes * 60 * 1000;
}

function sanitizeFolderSegment(name) {
  return String(name || 'MOD')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'MOD';
}

function formatTimestamp(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

function parseBackupTimestamp(folderName, projectSafeName) {
  const prefix = `${projectSafeName}-备份-`;
  if (!folderName.startsWith(prefix)) return null;
  const m = folderName.slice(prefix.length).match(/^(\d{8}-\d{6})$/);
  if (!m) return null;
  const s = m[1];
  const y = parseInt(s.slice(0, 4), 10);
  const mo = parseInt(s.slice(4, 6), 10) - 1;
  const da = parseInt(s.slice(6, 8), 10);
  const hh = parseInt(s.slice(9, 11), 10);
  const mm = parseInt(s.slice(11, 13), 10);
  const ss = parseInt(s.slice(13, 15), 10);
  const t = new Date(y, mo, da, hh, mm, ss).getTime();
  return Number.isFinite(t) ? t : null;
}

function isPathInside(child, parent) {
  return isPathInsideResolved(parent, child);
}

function normalizeRootPath(p) {
  if (!p) return '';
  const resolved = tryRealpath(p) || path.resolve(p);
  return resolved.replace(/\\/g, '/');
}

function readBackupManifest(backupFolder) {
  try {
    const manifestPath = path.join(backupFolder, '.ra3-ide-backup-manifest.json');
    if (!fs.existsSync(manifestPath)) return null;
    return JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  } catch {
    return null;
  }
}

function validateBackupSourcePath(backupSourcePath, ctx) {
  const backupDirResolved = tryRealpath(ctx.backupDir) || path.resolve(ctx.backupDir);
  const chosenResolved = tryRealpath(backupSourcePath) || path.resolve(backupSourcePath);
  if (!isPathInsideResolved(backupDirResolved, chosenResolved)) {
    return { ok: false, error: '所选备份必须在「设置」中配置的备份目录内' };
  }
  if (isPathInside(chosenResolved, ctx.root)) {
    return { ok: false, error: '不能从当前项目内部的文件夹恢复' };
  }
  let stat;
  try {
    stat = fs.statSync(chosenResolved);
  } catch (e) {
    return { ok: false, error: e.message };
  }
  if (!stat.isDirectory()) {
    return { ok: false, error: '请选择备份文件夹，而不是单个文件' };
  }
  return { ok: true, path: chosenResolved };
}

function shouldSkipCopyEntry(src, projectRoot, backupParentDir) {
  const rel = path.relative(projectRoot, src);
  if (!rel || rel === '.') return false;
  const parts = rel.split(/[/\\]/);
  for (const part of parts) {
    if (SKIP_DIR_NAMES.has(part)) return true;
  }
  if (backupParentDir && isPathInside(src, backupParentDir)) return true;
  return false;
}

async function flushDirtyFilesFromRenderer() {
  const win = getMainWindow();
  if (!win || win.isDestroyed()) return { success: true };

  const maxWaitMs = 120000;
  const pollMs = 500;
  const started = Date.now();

  while (Date.now() - started < maxWaitMs) {
    try {
      const result = await win.webContents.executeJavaScript(`
        (async () => {
          try {
            if (typeof isAgentIdeLocked === 'function' && isAgentIdeLocked()) {
              return { success: true, skipped: true, reason: 'ai-writing' };
            }
            if (typeof saveAllFiles === 'function') {
              await saveAllFiles();
            }
            return { success: true };
          } catch (e) {
            return { success: false, error: String(e && e.message || e) };
          }
        })()
      `);
      if (result?.skipped && result?.reason === 'ai-writing') {
        await new Promise((r) => setTimeout(r, pollMs));
        continue;
      }
      return result || { success: true };
    } catch (e) {
      console.warn('[project-auto-backup] flush:', e.message);
      return { success: false, error: e.message };
    }
  }
  return { success: false, error: 'AI 写入尚未完成，无法安全备份或恢复' };
}

function notifyRenderer(eventName, payload) {
  const win = getMainWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send(eventName, payload);
  }
}

function listBackupsForProject(backupDir, projectSafeName, projectRoot = null) {
  if (!backupDir || !fs.existsSync(backupDir)) return [];
  const prefix = `${projectSafeName}-备份-`;
  const normalizedRoot = projectRoot ? normalizeRootPath(projectRoot) : '';
  const out = [];
  for (const name of fs.readdirSync(backupDir)) {
    const full = path.join(backupDir, name);
    let st;
    try {
      st = fs.statSync(full);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;

    const matchesName = name.startsWith(prefix);
    let matchesManifest = false;
    if (normalizedRoot) {
      const manifest = readBackupManifest(full);
      if (manifest?.sourceRoot && normalizeRootPath(manifest.sourceRoot) === normalizedRoot) {
        matchesManifest = true;
      }
    }
    if (!matchesName && !matchesManifest) continue;

    const ts = parseBackupTimestamp(name, projectSafeName) ?? st.mtimeMs;
    out.push({ name, full, ts });
  }
  out.sort((a, b) => a.ts - b.ts);
  return out;
}

function pruneOldBackups(backupDir, projectSafeName, maxCount) {
  const max = parseInt(maxCount, 10);
  if (!max || max <= 0) return [];
  const list = listBackupsForProject(backupDir, projectSafeName);
  const removed = [];
  while (list.length > max) {
    const oldest = list.shift();
    try {
      fs.rmSync(oldest.full, { recursive: true, force: true });
      removed.push(oldest.name);
    } catch (e) {
      console.warn('[project-auto-backup] prune:', oldest.full, e.message);
      break;
    }
  }
  return removed;
}

async function runProjectBackup(options = {}) {
  if (restoreRunning) {
    return { success: false, error: '正在执行恢复，请稍候再备份', busy: true };
  }
  if (backupRunning) {
    return { success: false, error: '备份正在进行中', busy: true };
  }

  const prefs = readBackupPrefs();
  if (!options.force && !prefs.projectBackupEnabled) {
    return { success: false, error: '项目自动备份未启用', skipped: true };
  }

  const root = getCurrentFolder();
  if (!root || !fs.existsSync(root)) {
    return { success: false, error: '未打开有效的 MOD 项目', skipped: true };
  }

  const backupDir = String(prefs.projectBackupDir || '').trim();
  if (!backupDir) {
    return { success: false, error: '未设置备份目录', skipped: true };
  }

  if (isPathInside(backupDir, root)) {
    return {
      success: false,
      error: '备份目录不能位于当前项目文件夹内',
    };
  }

  backupRunning = true;
  status.running = true;
  status.lastError = null;
  notifyRenderer('project-backup-started', { root });

  const started = Date.now();
  try {
    await fs.promises.mkdir(backupDir, { recursive: true });

    if (!options.skipFlush) {
      const flushResult = await flushDirtyFilesFromRenderer();
      if (flushResult && flushResult.success === false) {
        throw new Error(flushResult.error || '保存未保存文件失败');
      }
    }

    const projectSafeName = sanitizeFolderSegment(path.basename(root));
    const folderName = `${projectSafeName}-备份-${formatTimestamp()}`;
    const dest = path.join(backupDir, folderName);

    const filter = (src) => !shouldSkipCopyEntry(src, root, backupDir);

    await fs.promises.cp(root, dest, { recursive: true, filter });

    const manifest = {
      sourceRoot: root.replace(/\\/g, '/'),
      backupDir: backupDir.replace(/\\/g, '/'),
      folderName,
      createdAt: new Date().toISOString(),
      durationMs: Date.now() - started,
    };
    await fs.promises.writeFile(
      path.join(dest, '.ra3-ide-backup-manifest.json'),
      JSON.stringify(manifest, null, 2),
      'utf-8'
    );

    const removed = pruneOldBackups(backupDir, projectSafeName, prefs.projectBackupMaxCount);

    status.lastRunAt = Date.now();
    status.lastDest = dest;
    status.lastError = null;

    const payload = {
      success: true,
      dest,
      folderName,
      removed,
      durationMs: Date.now() - started,
    };
    notifyRenderer('project-backup-done', payload);
    return payload;
  } catch (e) {
    status.lastError = e.message;
    const payload = { success: false, error: e.message };
    notifyRenderer('project-backup-done', payload);
    return payload;
  } finally {
    backupRunning = false;
    status.running = false;
    scheduleNextTick();
  }
}

function clearBackupTimer() {
  if (backupTimer) {
    clearTimeout(backupTimer);
    backupTimer = null;
  }
  status.nextRunAt = null;
}

function scheduleNextTick() {
  clearBackupTimer();
  const prefs = readBackupPrefs();
  const ms = intervalMsFromPrefs(prefs);
  if (!prefs.projectBackupEnabled || ms <= 0) return;

  status.nextRunAt = Date.now() + ms;
  backupTimer = setTimeout(async () => {
    backupTimer = null;
    await runProjectBackup({ skipFlush: false });
  }, ms);
}

function rescheduleFromPreferences() {
  clearBackupTimer();
  const prefs = readBackupPrefs();
  const ms = intervalMsFromPrefs(prefs);
  if (!prefs.projectBackupEnabled || ms <= 0 || !prefs.projectBackupDir) {
    return { scheduled: false };
  }
  scheduleNextTick();
  return { scheduled: true, nextRunAt: status.nextRunAt, intervalMs: ms };
}

function getBackupStatus() {
  const prefs = readBackupPrefs();
  return {
    ...status,
    enabled: !!prefs.projectBackupEnabled,
    backupDir: prefs.projectBackupDir || '',
    intervalMs: intervalMsFromPrefs(prefs),
    maxCount: prefs.projectBackupMaxCount ?? 10,
    projectRoot: getCurrentFolder() || '',
  };
}

function getRestoreContext() {
  const root = getCurrentFolder();
  if (!root || !fs.existsSync(root)) {
    return { ok: false, error: '请先打开一个 MOD 项目' };
  }
  const prefs = readBackupPrefs();
  const backupDir = String(prefs.projectBackupDir || '').trim();
  if (!backupDir) {
    return { ok: false, error: '请先在「设置 → 首选项 → 自动保存」中配置备份目录' };
  }
  if (!fs.existsSync(backupDir)) {
    return { ok: false, error: `备份目录不存在：${backupDir}` };
  }
  if (isPathInside(backupDir, root)) {
    return { ok: false, error: '备份目录不能位于当前项目内' };
  }
  const projectSafeName = sanitizeFolderSegment(path.basename(root));
  return { ok: true, root, backupDir, projectSafeName };
}

async function clearProjectForRestore(projectRoot) {
  const names = await fs.promises.readdir(projectRoot);
  for (const name of names) {
    if (name === '.ra3-ide') continue;
    await fs.promises.rm(path.join(projectRoot, name), { recursive: true, force: true });
  }
}

async function copyBackupIntoProject(backupSource, projectRoot) {
  const names = await fs.promises.readdir(backupSource);
  for (const name of names) {
    if (name === '.ra3-ide-backup-manifest.json') continue;
    const src = path.join(backupSource, name);
    const dest = path.join(projectRoot, name);
    await fs.promises.cp(src, dest, { recursive: true, force: true });
  }
}

async function snapshotProjectForRollback(projectRoot) {
  const tmp = await fs.promises.mkdtemp(path.join(app.getPath('temp'), 'ra3-restore-'));
  const names = await fs.promises.readdir(projectRoot);
  for (const name of names) {
    if (name === '.ra3-ide') continue;
    await fs.promises.cp(path.join(projectRoot, name), path.join(tmp, name), {
      recursive: true,
      force: true,
    });
  }
  return tmp;
}

async function restoreSnapshotIntoProject(snapshotDir, projectRoot) {
  await clearProjectForRestore(projectRoot);
  const names = await fs.promises.readdir(snapshotDir);
  for (const name of names) {
    await fs.promises.cp(path.join(snapshotDir, name), path.join(projectRoot, name), {
      recursive: true,
      force: true,
    });
  }
}

async function restoreProjectFromBackup(backupSourcePath) {
  if (restoreRunning) {
    return { success: false, error: '恢复正在进行中', busy: true };
  }
  if (backupRunning) {
    return { success: false, error: '正在执行备份，请稍候再恢复' };
  }

  const ctx = getRestoreContext();
  if (!ctx.ok) return { success: false, error: ctx.error };

  const validated = validateBackupSourcePath(backupSourcePath, ctx);
  if (!validated.ok) return { success: false, error: validated.error };
  const backupSource = validated.path;

  restoreRunning = true;
  let snapshotDir = null;
  try {
    const flushResult = await flushDirtyFilesFromRenderer();
    if (flushResult && flushResult.success === false) {
      return { success: false, error: flushResult.error || '保存未保存文件失败' };
    }

    snapshotDir = await snapshotProjectForRollback(ctx.root);

    try {
      await clearProjectForRestore(ctx.root);
      await copyBackupIntoProject(backupSource, ctx.root);
    } catch (restoreErr) {
      console.error('[project-auto-backup] restore failed, rolling back:', restoreErr);
      try {
        await restoreSnapshotIntoProject(snapshotDir, ctx.root);
      } catch (rollbackErr) {
        console.error('[project-auto-backup] rollback failed:', rollbackErr);
        return {
          success: false,
          error: `恢复失败且回滚未完全成功：${restoreErr.message}；回滚：${rollbackErr.message}`,
        };
      }
      return { success: false, error: restoreErr.message };
    }

    notifyRenderer('project-restored-from-backup', {
      backupPath: backupSource.replace(/\\/g, '/'),
      backupName: path.basename(backupSource),
      projectRoot: ctx.root.replace(/\\/g, '/'),
    });

    return {
      success: true,
      backupPath: backupSource,
      backupName: path.basename(backupSource),
    };
  } catch (e) {
    console.error('[project-auto-backup] restore:', e);
    return { success: false, error: e.message };
  } finally {
    restoreRunning = false;
    if (snapshotDir) {
      try {
        await fs.promises.rm(snapshotDir, { recursive: true, force: true });
      } catch (e) {
        console.warn('[project-auto-backup] cleanup snapshot:', e.message);
      }
    }
  }
}

function showSimpleMessage(win, opts) {
  const target = win && !win.isDestroyed() ? win : getMainWindow();
  if (target && !target.isDestroyed()) {
    return dialog.showMessageBox(target, opts);
  }
  return dialog.showMessageBox(opts);
}

/**
 * 文件 → 从备份恢复（最近）
 */
async function restoreFromLatestBackup(browserWindow) {
  const ctx = getRestoreContext();
  if (!ctx.ok) {
    await showSimpleMessage(browserWindow, {
      type: 'warning',
      title: '从备份恢复',
      message: ctx.error,
    });
    return { success: false, error: ctx.error };
  }

  const list = listBackupsForProject(ctx.backupDir, ctx.projectSafeName, ctx.root);
  if (!list.length) {
    await showSimpleMessage(browserWindow, {
      type: 'warning',
      title: '从备份恢复（最近）',
      message: '未找到当前项目的备份',
      detail: `项目：${ctx.projectSafeName}\n备份目录：${ctx.backupDir}\n\n请确认已执行过备份，且文件夹名为「${ctx.projectSafeName}-备份-时间戳」格式。`,
    });
    return { success: false, error: '无备份' };
  }

  const latest = list[list.length - 1];
  const { response } = await showSimpleMessage(browserWindow, {
    type: 'warning',
    title: '从备份恢复（最近）',
    message: '将用最近的备份覆盖当前项目',
    detail:
      `备份文件夹：${latest.name}\n` +
      `路径：${latest.full}\n\n` +
      `当前项目「${path.basename(ctx.root)}」中的内容将被删除，并替换为上述备份中的文件。\n` +
      `（保留项目内的 .ra3-ide 目录）\n\n` +
      `此操作不可撤销，是否继续？`,
    buttons: ['取消', '确认恢复'],
    defaultId: 0,
    cancelId: 0,
  });

  if (response !== 1) {
    return { success: false, cancelled: true };
  }

  const result = await restoreProjectFromBackup(latest.full);
  if (!result.success && result.error) {
    await showSimpleMessage(browserWindow, {
      type: 'error',
      title: '恢复失败',
      message: result.error,
    });
  } else if (result.success) {
    await showSimpleMessage(browserWindow, {
      type: 'info',
      title: '恢复完成',
      message: '已从最近备份恢复当前项目',
      detail: latest.name,
    });
  }
  return result;
}

/**
 * 文件 → 从备份恢复…（选择备份文件夹）
 */
async function restoreFromBackupPicker(browserWindow) {
  const ctx = getRestoreContext();
  if (!ctx.ok) {
    await showSimpleMessage(browserWindow, {
      type: 'warning',
      title: '从备份恢复',
      message: ctx.error,
    });
    return { success: false, error: ctx.error };
  }

  const win = browserWindow && !browserWindow.isDestroyed() ? browserWindow : getMainWindow();
  const pick = await dialog.showOpenDialog(win || undefined, {
    title: '选择要恢复的备份文件夹',
    defaultPath: ctx.backupDir,
    properties: ['openDirectory'],
  });

  if (pick.canceled || !pick.filePaths?.length) {
    return { success: false, cancelled: true };
  }

  const chosen = pick.filePaths[0];
  const precheck = validateBackupSourcePath(chosen, ctx);
  if (!precheck.ok) {
    await showSimpleMessage(browserWindow, {
      type: 'error',
      title: '从备份恢复',
      message: precheck.error,
    });
    return { success: false, error: precheck.error };
  }

  const folderName = path.basename(chosen);
  const prefix = `${ctx.projectSafeName}-备份-`;
  const nameWarn =
    !folderName.startsWith(prefix) && !folderName.includes('-备份-')
      ? `\n\n注意：所选文件夹名称与当前项目「${ctx.projectSafeName}」的常规备份命名不一致，请确认选对了备份。`
      : '';

  const { response } = await showSimpleMessage(browserWindow, {
    type: 'warning',
    title: '从备份恢复',
    message: '将用所选备份覆盖当前项目',
    detail:
      `备份文件夹：${folderName}\n` +
      `路径：${chosen}\n\n` +
      `当前项目「${path.basename(ctx.root)}」中的内容将被删除并替换为备份内容。\n` +
      `（保留 .ra3-ide 目录）\n\n` +
      `此操作不可撤销，是否继续？${nameWarn}`,
    buttons: ['取消', '确认恢复'],
    defaultId: 0,
    cancelId: 0,
  });

  if (response !== 1) {
    return { success: false, cancelled: true };
  }

  const result = await restoreProjectFromBackup(chosen);
  if (!result.success && result.error) {
    await showSimpleMessage(browserWindow, {
      type: 'error',
      title: '恢复失败',
      message: result.error,
    });
  } else if (result.success) {
    await showSimpleMessage(browserWindow, {
      type: 'info',
      title: '恢复完成',
      message: '已从所选备份恢复当前项目',
      detail: folderName,
    });
  }
  return result;
}

module.exports = {
  configure,
  readBackupPrefs,
  intervalMsFromPrefs,
  runProjectBackup,
  rescheduleFromPreferences,
  getBackupStatus,
  clearBackupTimer,
  listBackupsForProject,
  restoreFromLatestBackup,
  restoreFromBackupPicker,
  restoreProjectFromBackup,
};
