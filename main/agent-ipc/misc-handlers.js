// main/agent-ipc/misc-handlers.js
const ctx = require('./context');
const { addKnowledge } = require('../knowledge-base');

function registerMiscAgentIpc(ipcMain) {
  const { getSenderWindow, pendingExecutions, resolveActionConfirmation } = ctx;

  ipcMain.on('agent:follow-up-action', (event, payload) => {
    const message = String(payload?.message || payload?.label || '').trim();
    if (!message) return;
    ipcMain.emit('agent:chat', event, {
      sessionId: payload?.sessionId,
      message,
      deepThinking: !!payload?.deepThinking,
    });
  });

  ipcMain.on('agent:confirm-action', (event, payload) => {
    const proposalId = payload?.proposalId || payload;
    const approved = payload?.approved !== false;
    resolveActionConfirmation(proposalId, approved);
  });

  const { resolveAssetStep, cancelFlow: cancelAssetFlow } = require('../unit-asset-wizard');

  ipcMain.on('agent:asset-wizard-respond', (event, payload) => {
    const flowId = payload?.flowId;
    const slotId = payload?.slotId || 'clone_confirm';
    if (!flowId) return;
    resolveAssetStep(flowId, slotId, payload);
  });

  ipcMain.handle('agent:pick-asset-file', async (event, options = {}) => {
    const { dialog, BrowserWindow } = require('electron');
    const win = BrowserWindow.fromWebContents(event.sender);
    const extensions = (options.extensions || ['w3x', 'w3d', 'dds', 'tga', 'wav'])
      .map((e) => e.replace(/^\./, ''));
    const result = await dialog.showOpenDialog(win || undefined, {
      title: options.title || '选择素材文件',
      properties: options.multiple ? ['openFile', 'multiSelections'] : ['openFile'],
      filters: [{ name: '素材文件', extensions }],
    });
    if (result.canceled || !result.filePaths?.length) {
      return { success: false, canceled: true };
    }
    if (options.multiple) {
      return { success: true, filePaths: result.filePaths, filePath: result.filePaths[0] };
    }
    return { success: true, filePath: result.filePaths[0], filePaths: result.filePaths };
  });

  ipcMain.on('agent:confirm-correct', async (event, executionId) => {
    const senderWin = getSenderWindow(event);
    const context = pendingExecutions[executionId];
    if (!context) {
      senderWin?.webContents.send('agent:response', '❌ 无效的执行ID');
      return;
    }
    try {
      await addKnowledge({
        intent: context.userMessage,
        plan: context.plan,
        summary: context.log
          ? context.log.map((l) => `${l.tool}: ${l.result.success ? '成功' : '失败'}`).join('; ')
          : '执行完成',
        source_files: '',
        tags: ['learned'],
      });
      delete pendingExecutions[executionId];
      senderWin?.webContents.send('agent:response', '✅ 已记录正确操作,知识库已更新');
    } catch (err) {
      senderWin?.webContents.send('agent:response', `❌ 知识库写入失败: ${err.message}`);
    }
  });

  ipcMain.handle('agent:tool-call', async (event, toolName, args) => {
    try {
      const { executeAgentTool } = require('../agent-loop');
      const senderWin = getSenderWindow(event);
      return await executeAgentTool(toolName, args || {}, {
        senderWin,
        permissionLevel: getAiPermissionLevel(),
      });
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

}

module.exports = { registerMiscAgentIpc };
