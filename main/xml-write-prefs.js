// main/xml-write-prefs.js —— 全局 XML 写入格式首选项（与 AI 会话联动）

const fs = require('fs');
const path = require('path');
const { MODE_STANDARD, MODE_PROJECT } = require('./xml-format-mode');

function getPreferencesPath() {
  const { app } = require('electron');
  return path.join(app.getPath('userData'), 'preferences.json');
}

function readPreferencesSafe() {
  const defaults = {
    xmlWriteMode: MODE_STANDARD,
  };
  try {
    const prefPath = getPreferencesPath();
    if (!fs.existsSync(prefPath)) return defaults;
    return { ...defaults, ...JSON.parse(fs.readFileSync(prefPath, 'utf-8')) };
  } catch {
    return defaults;
  }
}

function getXmlWriteModePreference() {
  const prefs = readPreferencesSafe();
  return prefs.xmlWriteMode === MODE_PROJECT ? MODE_PROJECT : MODE_STANDARD;
}

function syncXmlWriteModePreference(mode) {
  const want = mode === MODE_PROJECT ? MODE_PROJECT : MODE_STANDARD;
  const prefPath = getPreferencesPath();
  let prefs = readPreferencesSafe();
  if (prefs.xmlWriteMode === want) return { changed: false, xmlWriteMode: want };
  prefs.xmlWriteMode = want;
  fs.writeFileSync(prefPath, JSON.stringify(prefs, null, 2), 'utf-8');
  return { changed: true, xmlWriteMode: want };
}

module.exports = {
  getXmlWriteModePreference,
  syncXmlWriteModePreference,
  readPreferencesSafe,
};
