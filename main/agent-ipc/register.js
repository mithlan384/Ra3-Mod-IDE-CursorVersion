// main/agent-ipc/register.js
const { ipcMain, BrowserWindow } = require('electron');
const ctx = require('./context');
const { registerAgentChatHandler } = require('./chat-handler');
const { registerKnowledgeAndSkillsIpc } = require('./knowledge-skills');
const { registerMiscAgentIpc } = require('./misc-handlers');

function registerAgentIpc() {
  const streamWrite = require('../stream-write');
  const refreshCb = (relativePath) => {
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) win.webContents.send('agent:refresh-file', relativePath);
    });
  };
  const openCb = (relativePath, line, column) => {
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) win.webContents.send('agent:open-file', { file: relativePath, line, column });
    });
  };
  const streamCb = (payload) => {
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) win.webContents.send('agent:stream-write', payload);
    });
  };

  ctx.agentTools.setRefreshFileCallback(refreshCb);
  ctx.agentTools.setOpenFileCallback(openCb);
  ctx.agentTools.setStreamWriteCallback(streamCb);
  streamWrite.setRefreshFileCallback(refreshCb);
  streamWrite.setOpenFileCallback(openCb);
  streamWrite.setStreamWriteCallback(streamCb);

  const { chatSessions, getSenderWindow, applyScanToSession, getCurrentFolder } = ctx;

  ipcMain.handle('agent:sessions:list', async () => chatSessions.listSessions());
  ipcMain.handle('agent:sessions:get', async (_, sessionId) => chatSessions.getSession(sessionId));
  ipcMain.handle('agent:sessions:create', async (_, title) => chatSessions.createSession(title));
  ipcMain.handle('agent:sessions:delete', async (_, sessionId) => chatSessions.deleteSession(sessionId));
  ipcMain.handle('agent:sessions:set-active', async (_, sessionId) => chatSessions.setActiveSession(sessionId));
  ipcMain.handle('agent:sessions:clear', async (_, sessionId) => chatSessions.clearSessionMessages(sessionId));

  ipcMain.handle('agent:set-xml-format-mode', async (_, { sessionId, mode, acknowledgeRisks }) => {
    if (!sessionId) return { success: false, error: '缺少 sessionId' };
    const parsed = mode === 'project' ? 'project' : 'standard';
    const res = chatSessions.setXmlFormatMode(sessionId, parsed, null, {
      acknowledgeRisks: !!acknowledgeRisks,
    });
    if (res.success) {
      try {
        const { syncXmlWriteModePreference } = require('../xml-write-prefs');
        syncXmlWriteModePreference(parsed);
        const prefs = require('../xml-write-prefs').readPreferencesSafe();
        BrowserWindow.getAllWindows().forEach((w) => {
          if (!w.isDestroyed()) w.webContents.send('preferences-changed', prefs);
        });
      } catch (e) {
        console.warn('[agent] sync pref after format mode:', e.message);
      }
    }
    return res;
  });

  ipcMain.handle('agent:scan-project-learn', async (event, { sessionId }) => {
    const senderWin = getSenderWindow(event);
    if (!getCurrentFolder()) {
      return { success: false, error: '请先打开 MOD 项目' };
    }
    const scanRes = await ctx.agentTools.scanProject({});
    if (!sessionId) {
      const listed = chatSessions.listSessions();
      sessionId = listed.success ? listed.data.activeSessionId : null;
    }
    if (sessionId && scanRes?.success) {
      applyScanToSession(sessionId, scanRes, senderWin, { promptFormatChoice: true });
    }
    return scanRes;
  });

  ipcMain.handle('agent:ensure-project-format-learned', async (event, { sessionId, openPanel }) => {
    const senderWin = getSenderWindow(event);
    const root = getCurrentFolder();
    if (!root) {
      return { success: false, error: '请先打开 MOD 项目', needsProject: true };
    }
    let sid = sessionId;
    if (!sid) {
      const listed = chatSessions.listSessions();
      sid = listed.success ? listed.data.activeSessionId : null;
    }
    const sess = sid ? chatSessions.getSession(sid) : null;
    const learned =
      sess?.success &&
      sess.data?.hasScannedProject &&
      sess.data?.projectContext?.conventions &&
      sess.data?.formatChoiceConfirmed &&
      sess.data?.xmlFormatMode === 'project';

    if (learned) {
      return { success: true, alreadyLearned: true, sessionId: sid };
    }

    if (senderWin && !senderWin.isDestroyed()) {
      senderWin.webContents.send('agent:project-learn-required', {
        sessionId: sid,
        openPanel: !!openPanel,
        hasScan: !!(sess?.data?.hasScannedProject && sess.data?.projectContext),
      });
    }
    return {
      success: true,
      needsLearn: true,
      sessionId: sid,
      hasScan: !!(sess?.data?.hasScannedProject && sess.data?.projectContext),
    };
  });
  const { beginRun, endRun, isAbortRequested } = require('../agent-run-controller');
  const { abortAgentLoop } = require('../agent-loop');

  ipcMain.on('agent:abort-chat', () => {
    const runId = require('../agent-run-controller').getActiveRunId();
    if (runId) abortAgentLoop(runId);
  });

  registerAgentChatHandler(ipcMain, { beginRun, endRun, isAbortRequested });
  registerMiscAgentIpc(ipcMain);
  registerKnowledgeAndSkillsIpc();

  const { initDatabase } = require('../knowledge-base');
  setTimeout(() => {
    initDatabase(null, { backgroundIndex: true }).catch((e) => {
      console.error('[Agent] 后台知识库索引失败:', e.message);
    });
  }, 2500);
}

module.exports = { registerAgentIpc };
