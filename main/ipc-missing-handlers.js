// main/ipc-missing-handlers.js —— 补全 preload 已暴露但 ipc-handlers 遗漏的 invoke 通道

const fs = require('fs');
const path = require('path');
const { ipcMain, dialog, BrowserWindow } = require('electron');
const { getUserDataPath } = require('./electron-safe');
const { getCurrentFolder } = require('./project-state');
const {
  indexProjectFilesAsync,
  searchProjectFiles,
} = require('./project-file-index');
const { resolveProjectFile } = require('./resolve-project-file');
const {
  getBackupStatus,
  runProjectBackup,
  rescheduleFromPreferences,
} = require('./project-auto-backup');
const { readAiConfigFile } = require('./search-config');
const { stripSecretsForDisk, revealSecretsFromDisk } = require('./secure-config');
const { MODEL_PRESETS } = require('./llm-client');
const {
  launchSdkTool,
  listToolStatus,
  getDefaultSdkToolsPaths,
} = require('./sdk-tools');

let cachedFileIndex = { root: null, files: [] };

function aiConfigPath() {
  return path.join(getUserDataPath(), 'ra3-ai-config.json');
}

function readAiConfigMerged() {
  const p = aiConfigPath();
  if (!fs.existsSync(p)) return {};
  try {
    return revealSecretsFromDisk(JSON.parse(fs.readFileSync(p, 'utf-8')));
  } catch {
    return {};
  }
}

async function writeAiConfigMerged(mutator) {
  const raw = readAiConfigMerged();
  const next = typeof mutator === 'function' ? mutator(raw) || raw : { ...raw, ...mutator };
  await fs.promises.writeFile(
    aiConfigPath(),
    JSON.stringify(stripSecretsForDisk(next), null, 2),
    'utf-8'
  );
  return next;
}

function registerMissingIpcHandlers() {
  ipcMain.handle('index-project-files', async (_event, force = false) => {
    const root = getCurrentFolder();
    if (!root) return { success: false, error: '未打开项目', files: [] };
    if (!force && cachedFileIndex.root === root && cachedFileIndex.files?.length) {
      return { success: true, files: cachedFileIndex.files, cached: true };
    }
    try {
      const files = await indexProjectFilesAsync(root);
      cachedFileIndex = { root, files };
      return { success: true, files, cached: false };
    } catch (e) {
      return { success: false, error: e.message, files: [] };
    }
  });

  ipcMain.handle('search-project-files', async (_event, query, limit = 40) => {
    const root = getCurrentFolder();
    if (!root) return { success: false, items: [] };
    if (cachedFileIndex.root !== root || !cachedFileIndex.files?.length) {
      const files = await indexProjectFilesAsync(root);
      cachedFileIndex = { root, files };
    }
    const items = searchProjectFiles(cachedFileIndex.files, query, limit);
    return { success: true, items };
  });

  ipcMain.handle('invalidate-project-file-index', async () => {
    cachedFileIndex = { root: null, files: [] };
    return { success: true };
  });

  ipcMain.handle('resolve-project-file', async (_event, filePath) => {
    const root = getCurrentFolder();
    if (!root) return null;
    return resolveProjectFile(root, filePath);
  });

  ipcMain.handle('pick-project-backup-dir', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win || undefined, {
      title: '选择项目备份目录',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths?.[0]) {
      return { success: false, canceled: true };
    }
    return { success: true, path: result.filePaths[0].replace(/\\/g, '/') };
  });

  ipcMain.handle('get-project-backup-status', async () => ({
    success: true,
    ...getBackupStatus(),
  }));

  ipcMain.handle('run-project-backup-now', async () => {
    try {
      const result = await runProjectBackup({ reason: 'manual' });
      return { success: !!result.success, ...result };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('reschedule-project-backup', async () => {
    try {
      const result = rescheduleFromPreferences();
      return { success: true, ...result };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('get-ai-model-presets', async () =>
    MODEL_PRESETS.map((p) => ({
      id: p.id,
      label: p.label,
      endpoint: p.endpoint,
      model: p.model,
      provider: p.provider,
      footnote: p.footnote || '',
    }))
  );

  ipcMain.handle('get-search-config', async () => {
    const raw = readAiConfigFile();
    return raw.searchApi || { provider: 'auto' };
  });

  ipcMain.handle('save-search-config', async (_event, searchConfig) => {
    try {
      await writeAiConfigMerged((raw) => {
        raw.searchApi = searchConfig || {};
        return raw;
      });
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('launch-sdk-tool', async (_event, toolKey, filePath) => {
    try {
      return await launchSdkTool(toolKey, filePath);
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('get-sdk-tool-status', async () => ({
    success: true,
    tools: listToolStatus(),
  }));

  ipcMain.handle('get-default-sdk-tools-paths', async () => ({
    success: true,
    paths: getDefaultSdkToolsPaths(),
  }));
}

function invalidateFileIndexCache() {
  cachedFileIndex = { root: null, files: [] };
}

module.exports = { registerMissingIpcHandlers, invalidateFileIndexCache };
