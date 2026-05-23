// main/agent-ipc/knowledge-skills.js
const { ipcMain, BrowserWindow } = require('electron');
const {
  getAllEntries,
  deleteEntry,
  clearAll,
  importFrom,
  exportTo,
  getStats,
} = require('../knowledge-base');

function registerKnowledgeAndSkillsIpc() {

  ipcMain.handle('knowledge:get-all', async () => getAllEntries());
  ipcMain.handle('knowledge:delete', async (_, id) => {
    await deleteEntry(id);
    return { success: true };
  });
  ipcMain.handle('knowledge:clear', async () => {
    await clearAll();
    return { success: true };
  });
  ipcMain.handle('knowledge:import', async (_, sourcePath) => {
    try {
      await importFrom(sourcePath);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  ipcMain.handle('knowledge:export', async (_, destPath) => {
    try {
      await exportTo(destPath);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  ipcMain.handle('knowledge:stats', async () => getStats());
  ipcMain.handle('knowledge:rebuild', async () => {
    const { rebuildKnowledgeIndex } = require('../knowledge-base');
    await rebuildKnowledgeIndex();
    return { success: true };
  });

  const {
    listInstalledSkills,
    installFromPath,
    installFromUrl,
    uninstallSkill,
    setSkillEnabled,
  } = require('../skill-registry');

  ipcMain.handle('skills:list', async () => ({
    success: true,
    skills: listInstalledSkills(),
  }));

  ipcMain.handle('skills:install-path', async (_, sourcePath) => {
    try {
      const res = await installFromPath(sourcePath);
      return res;
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('skills:install-url', async (_, url) => {
    try {
      const res = await installFromUrl(url);
      return res;
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('skills:uninstall', async (_, id) => {
    try {
      return uninstallSkill(id);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('skills:set-enabled', async (_, id, enabled) => {
    try {
      return setSkillEnabled(id, enabled);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('skills:pick-and-install', async (event) => {
    const { dialog, BrowserWindow } = require('electron');
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win || undefined, {
      title: '选择 Skill 压缩包或已解压文件夹',
      properties: ['openFile', 'openDirectory'],
      filters: [
        { name: 'Skill 压缩包', extensions: ['zip'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    });
    if (result.canceled || !result.filePaths?.[0]) {
      return { success: false, canceled: true };
    }
    try {
      return await installFromPath(result.filePaths[0]);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

}

module.exports = { registerKnowledgeAndSkillsIpc };
