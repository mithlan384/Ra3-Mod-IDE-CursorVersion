// main/agent-theme-resolve.js —— 主题与 AI 语气解析

const FACTION_THEMES = new Set(['allied', 'soviet', 'empire']);

function resolvePersonalityFromPrefs(prefs) {
  const p = prefs || {};
  const theme = p.theme || 'vs-dark';
  const mode = p.aiPersonalityMode;

  if (mode === 'sync' && FACTION_THEMES.has(theme)) return theme;
  if (mode && mode !== 'sync') return mode;
  return p.aiPersonality || 'default';
}

function personalityForTheme(themeId) {
  if (FACTION_THEMES.has(themeId)) return themeId;
  return 'default';
}

function factionIdForTheme(themeId) {
  return FACTION_THEMES.has(themeId) ? themeId : null;
}

function shouldSyncPersonalityWithTheme(prefs) {
  const p = prefs || {};
  if (p.aiPersonalityMode === 'sync') return true;
  if (!p.aiPersonalityMode && FACTION_THEMES.has(p.theme)) return true;
  return false;
}

function resolveFactionIdFromPrefs(prefs) {
  const p = prefs || {};
  if (shouldSyncPersonalityWithTheme(p)) return factionIdForTheme(p.theme);
  const pers = resolvePersonalityFromPrefs(p);
  return FACTION_THEMES.has(pers) ? pers : null;
}

function getActiveFactionIdForChat(projectRoot) {
  try {
    const fs = require('fs');
    const path = require('path');
    const { app } = require('electron');
    const prefPath = path.join(app.getPath('userData'), 'preferences.json');
    let prefs = {};
    if (fs.existsSync(prefPath)) {
      prefs = JSON.parse(fs.readFileSync(prefPath, 'utf-8'));
    }
    if (shouldSyncPersonalityWithTheme(prefs)) {
      return factionIdForTheme(prefs.theme);
    }
    if (projectRoot) {
      const chatSessions = require('./agent-chat-sessions');
      const pers = chatSessions.getActiveSessionPersonality(projectRoot);
      return FACTION_THEMES.has(pers) ? pers : null;
    }
    return resolveFactionIdFromPrefs(prefs);
  } catch {
    return null;
  }
}

module.exports = {
  resolvePersonalityFromPrefs,
  personalityForTheme,
  factionIdForTheme,
  shouldSyncPersonalityWithTheme,
  resolveFactionIdFromPrefs,
  getActiveFactionIdForChat,
  FACTION_THEMES,
};
