// main/agent-chat-sessions.js —— 按项目持久化的 AI 对话会话

const fs = require('fs');
const path = require('path');
const { getCurrentFolder } = require('./project-state');
const {
  MODE_STANDARD,
  buildProjectContextForMode,
} = require('./xml-format-mode');

const STORE_DIR = '.ra3ide';
const STORE_FILE = 'chat-sessions.json';
const MAX_MESSAGES_PER_SESSION = 200;
const MAX_CONTEXT_MESSAGES = 16;

function getStorePath(projectRoot) {
  const root = projectRoot || getCurrentFolder();
  if (!root) return null;
  return path.join(root, STORE_DIR, STORE_FILE);
}

function ensureStoreDir(projectRoot) {
  const root = projectRoot || getCurrentFolder();
  if (!root) return null;
  const dir = path.join(root, STORE_DIR);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return getStorePath(root);
}

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function defaultStore() {
  const id = newId('sess');
  const now = new Date().toISOString();
  let aiPersonality = 'default';
  try {
    const { resolvePersonalityFromPrefs } = require('./agent-theme-resolve');
    const fs = require('fs');
    const path = require('path');
    const { app } = require('electron');
    const prefPath = path.join(app.getPath('userData'), 'preferences.json');
    if (fs.existsSync(prefPath)) {
      aiPersonality = resolvePersonalityFromPrefs(JSON.parse(fs.readFileSync(prefPath, 'utf-8')));
    }
  } catch (e) {}
  return {
    version: 1,
    activeSessionId: id,
    sessions: [
      {
        id,
        title: '新对话',
        createdAt: now,
        updatedAt: now,
        messages: [],
        aiPersonality,
      },
    ],
  };
}

function loadStore(projectRoot) {
  const file = ensureStoreDir(projectRoot);
  if (!file) return { success: false, error: '项目未打开' };
  if (!fs.existsSync(file)) {
    const store = defaultStore();
    fs.writeFileSync(file, JSON.stringify(store, null, 2), 'utf-8');
    return { success: true, data: store };
  }
  try {
    const store = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (!store.sessions || !Array.isArray(store.sessions)) {
      const fresh = defaultStore();
      fs.writeFileSync(file, JSON.stringify(fresh, null, 2), 'utf-8');
      return { success: true, data: fresh };
    }
    if (!store.activeSessionId && store.sessions.length > 0) {
      store.activeSessionId = store.sessions[0].id;
    }
    return { success: true, data: store };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function saveStore(store, projectRoot) {
  const file = ensureStoreDir(projectRoot);
  if (!file) return { success: false, error: '项目未打开' };
  fs.writeFileSync(file, JSON.stringify(store, null, 2), 'utf-8');
  return { success: true };
}

function listSessions(projectRoot) {
  const loaded = loadStore(projectRoot);
  if (!loaded.success) return loaded;
  const { sessions, activeSessionId } = loaded.data;
  return {
    success: true,
    data: {
      activeSessionId,
      sessions: sessions.map((s) => ({
        id: s.id,
        title: s.title,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        messageCount: (s.messages || []).length,
      })),
    },
  };
}

function getSession(sessionId, projectRoot) {
  const loaded = loadStore(projectRoot);
  if (!loaded.success) return loaded;
  const session = loaded.data.sessions.find((s) => s.id === sessionId);
  if (!session) return { success: false, error: '会话不存在' };
  return { success: true, data: session };
}

function createSession(title, projectRoot, options = {}) {
  const loaded = loadStore(projectRoot);
  if (!loaded.success) return loaded;
  const store = loaded.data;
  const now = new Date().toISOString();
  let aiPersonality = options.aiPersonality;
  if (!aiPersonality) {
    try {
      const { resolvePersonalityFromPrefs } = require('./agent-theme-resolve');
      const fs = require('fs');
      const path = require('path');
      const { app } = require('electron');
      const prefPath = path.join(app.getPath('userData'), 'preferences.json');
      let prefs = {};
      if (fs.existsSync(prefPath)) {
        prefs = JSON.parse(fs.readFileSync(prefPath, 'utf-8'));
      }
      aiPersonality = resolvePersonalityFromPrefs(prefs);
    } catch (e) {
      aiPersonality = 'default';
    }
  }
  const session = {
    id: newId('sess'),
    title: title || `对话 ${store.sessions.length + 1}`,
    createdAt: now,
    updatedAt: now,
    messages: [],
    aiPersonality,
  };
  store.sessions.push(session);
  store.activeSessionId = session.id;
  saveStore(store, projectRoot);
  return { success: true, data: session };
}

function deleteSession(sessionId, projectRoot) {
  const loaded = loadStore(projectRoot);
  if (!loaded.success) return loaded;
  const store = loaded.data;
  if (store.sessions.length <= 1) {
    return { success: false, error: '至少保留一个会话' };
  }
  store.sessions = store.sessions.filter((s) => s.id !== sessionId);
  if (store.activeSessionId === sessionId) {
    store.activeSessionId = store.sessions[0]?.id || null;
  }
  saveStore(store, projectRoot);
  return { success: true, data: { activeSessionId: store.activeSessionId } };
}

function setActiveSession(sessionId, projectRoot) {
  const loaded = loadStore(projectRoot);
  if (!loaded.success) return loaded;
  const store = loaded.data;
  if (!store.sessions.some((s) => s.id === sessionId)) {
    return { success: false, error: '会话不存在' };
  }
  store.activeSessionId = sessionId;
  saveStore(store, projectRoot);
  return { success: true, data: { activeSessionId: sessionId } };
}

function deriveTitle(text) {
  const t = (text || '').replace(/\s+/g, ' ').trim();
  if (!t) return '新对话';
  return t.length > 24 ? t.slice(0, 24) + '…' : t;
}

function appendMessage(sessionId, role, content, projectRoot, options = {}) {
  const loaded = loadStore(projectRoot);
  if (!loaded.success) return loaded;
  const store = loaded.data;
  const session = store.sessions.find((s) => s.id === sessionId);
  if (!session) return { success: false, error: '会话不存在' };

  const now = new Date().toISOString();
  session.messages = session.messages || [];
  const msg = {
    id: newId('msg'),
    role,
    content: String(content ?? ''),
    ts: now,
  };
  if (role === 'assistant' && options.thinking) {
    msg.thinking = String(options.thinking);
  }
  if (role === 'assistant' && options.factionId) {
    msg.factionId = options.factionId;
  }
  session.messages.push(msg);

  if (session.messages.length > MAX_MESSAGES_PER_SESSION) {
    session.messages = session.messages.slice(-MAX_MESSAGES_PER_SESSION);
  }

  if (role === 'user' && (session.title === '新对话' || !session.title)) {
    session.title = deriveTitle(content);
  }
  session.updatedAt = now;
  store.activeSessionId = sessionId;
  saveStore(store, projectRoot);
  return { success: true, data: { messageCount: session.messages.length, title: session.title } };
}

function setProjectContext(sessionId, context, projectRoot) {
  const loaded = loadStore(projectRoot);
  if (!loaded.success) return loaded;
  const store = loaded.data;
  const session = store.sessions.find((s) => s.id === sessionId);
  if (!session) return { success: false, error: '会话不存在' };

  const mode = session.formatChoiceConfirmed
    ? session.xmlFormatMode || MODE_STANDARD
    : MODE_STANDARD;
  const scan = context.root ? context : { ...context, projectRoot: context.root };

  session.projectContext = {
    scannedAt: context.scannedAt || new Date().toISOString(),
    projectRoot: context.projectRoot || context.root || null,
    stats: context.stats || null,
    conventions: context.conventions || null,
    layoutProfile: context.conventions?.layoutProfile || null,
    scan,
    compileHealth: context.compileHealth || null,
    compact: buildProjectContextForMode(scan, mode),
  };
  session.hasScannedProject = true;
  if (!session.formatChoiceConfirmed) {
    session.pendingFormatChoice = true;
    session.formatChoiceConfirmed = false;
    session.acknowledgedProjectRisks = false;
  }
  session.updatedAt = new Date().toISOString();
  saveStore(store, projectRoot);
  return { success: true };
}

function setXmlFormatMode(sessionId, mode, projectRoot, options = {}) {
  const loaded = loadStore(projectRoot);
  if (!loaded.success) return loaded;
  const store = loaded.data;
  const session = store.sessions.find((s) => s.id === sessionId);
  if (!session) return { success: false, error: '会话不存在' };

  const wantProject = mode === 'project';
  const health = session.projectContext?.compileHealth;
  if (
    wantProject &&
    health?.hasBlockingIssues &&
    !options.acknowledgeRisks
  ) {
    return {
      success: false,
      needsRiskAck: true,
      compileHealth: health,
      error: '当前项目存在可能导致编译失败的结构，请确认后仍使用当前项目格式',
    };
  }

  session.xmlFormatMode = wantProject ? 'project' : MODE_STANDARD;
  session.pendingFormatChoice = false;
  session.formatChoiceConfirmed = true;
  session.acknowledgedProjectRisks = !!(wantProject && options.acknowledgeRisks);

  try {
    const { syncXmlWriteModePreference } = require('./xml-write-prefs');
    syncXmlWriteModePreference(session.xmlFormatMode);
  } catch (e) {
    console.warn('[chat-sessions] sync xmlWriteMode pref:', e.message);
  }

  if (session.projectContext?.scan) {
    session.projectContext.compact = buildProjectContextForMode(
      session.projectContext.scan,
      session.xmlFormatMode
    );
  }

  session.updatedAt = new Date().toISOString();
  saveStore(store, projectRoot);
  return {
    success: true,
    data: {
      xmlFormatMode: session.xmlFormatMode,
      acknowledgedProjectRisks: session.acknowledgedProjectRisks,
    },
  };
}

function getXmlFormatMode(sessionId, projectRoot) {
  const res = getSession(sessionId, projectRoot);
  if (!res.success) return MODE_STANDARD;
  return res.data.xmlFormatMode || MODE_STANDARD;
}

function getProjectContextBlock(sessionId, projectRoot) {
  const res = getSession(sessionId, projectRoot);
  if (!res.success) return '';
  const ctx = res.data.projectContext;
  if (!ctx?.compact) return '';
  return ctx.compact;
}

function getSessionForTools(sessionId, projectRoot) {
  const res = getSession(sessionId, projectRoot);
  if (!res.success) return null;
  return res.data;
}

function getSessionPersonality(sessionId, projectRoot) {
  const res = getSession(sessionId, projectRoot);
  if (!res.success) return 'default';
  return res.data.aiPersonality || 'default';
}

function getActiveSessionPersonality(projectRoot) {
  const loaded = loadStore(projectRoot);
  if (!loaded.success) return 'default';
  const session = loaded.data.sessions.find((s) => s.id === loaded.data.activeSessionId);
  return session?.aiPersonality || 'default';
}

/** 主题切换时：在「跟随界面主题」模式下，后续回复使用新主题语气；历史消息锁定旧阵营头像 */
function syncActiveSessionPersonalityOnTheme(themeId, projectRoot) {
  const { personalityForTheme, factionIdForTheme, shouldSyncPersonalityWithTheme, FACTION_THEMES } =
    require('./agent-theme-resolve');
  const loaded = loadStore(projectRoot);
  if (!loaded.success) return { success: false };

  let prefs = {};
  try {
    const { app } = require('electron');
    const prefPath = path.join(app.getPath('userData'), 'preferences.json');
    if (fs.existsSync(prefPath)) prefs = JSON.parse(fs.readFileSync(prefPath, 'utf-8'));
  } catch (e) {}

  if (!shouldSyncPersonalityWithTheme(prefs)) {
    return { success: true, updated: false, syncDisabled: true };
  }

  const store = loaded.data;
  const session = store.sessions.find((s) => s.id === store.activeSessionId);
  if (!session) return { success: true, updated: false };

  const next = personalityForTheme(themeId);
  const nextFaction = factionIdForTheme(themeId);
  const prev = session.aiPersonality || 'default';
  const hasMessages = (session.messages || []).length > 0;

  if (prev !== next) {
    if (hasMessages && FACTION_THEMES.has(prev)) {
      for (const m of session.messages) {
        if (m.role === 'assistant' && !m.factionId) {
          m.factionId = prev;
        }
      }
    }
    session.aiPersonality = next;
    session.updatedAt = new Date().toISOString();
    saveStore(store, projectRoot);
  }

  return {
    success: true,
    updated: prev !== next,
    personality: next,
    factionId: nextFaction,
    previousPersonality: prev,
    hadMessages: hasMessages,
    sessionId: session.id,
  };
}

function checkThemePersonalityMismatch(themeId, projectRoot) {
  const sync = syncActiveSessionPersonalityOnTheme(themeId, projectRoot);
  return {
    mismatch: false,
    synced: !!sync.updated,
    sessionPersonality: sync.personality || 'default',
    themePersonality: sync.personality || 'default',
    factionId: sync.factionId || null,
    sessionId: sync.sessionId || null,
    hadMessages: !!sync.hadMessages,
  };
}

function clearProjectContext(sessionId, projectRoot) {
  const loaded = loadStore(projectRoot);
  if (!loaded.success) return loaded;
  const store = loaded.data;
  const session = store.sessions.find((s) => s.id === sessionId);
  if (!session) return { success: false, error: '会话不存在' };
  delete session.projectContext;
  session.updatedAt = new Date().toISOString();
  saveStore(store, projectRoot);
  return { success: true };
}

function getContextForLLM(sessionId, projectRoot) {
  const res = getSession(sessionId, projectRoot);
  if (!res.success) return [];
  const msgs = res.data.messages || [];
  return msgs.slice(-MAX_CONTEXT_MESSAGES).map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content,
  }));
}

function clearSessionMessages(sessionId, projectRoot) {
  const loaded = loadStore(projectRoot);
  if (!loaded.success) return loaded;
  const store = loaded.data;
  const session = store.sessions.find((s) => s.id === sessionId);
  if (!session) return { success: false, error: '会话不存在' };
  session.messages = [];
  session.updatedAt = new Date().toISOString();
  saveStore(store, projectRoot);
  return { success: true };
}

module.exports = {
  listSessions,
  getSession,
  createSession,
  deleteSession,
  setActiveSession,
  appendMessage,
  getContextForLLM,
  setProjectContext,
  setXmlFormatMode,
  getXmlFormatMode,
  getProjectContextBlock,
  getSessionForTools,
  clearProjectContext,
  clearSessionMessages,
  loadStore,
  getSessionPersonality,
  getActiveSessionPersonality,
  syncActiveSessionPersonalityOnTheme,
  checkThemePersonalityMismatch,
};
