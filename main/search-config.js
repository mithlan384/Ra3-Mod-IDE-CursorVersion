// main/search-config.js —— 统一读取搜索配置

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

function readAiConfigFile() {
  const configPath = path.join(app.getPath('userData'), 'ra3-ai-config.json');
  if (!fs.existsSync(configPath)) return {};
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    return require('./secure-config').revealSecretsFromDisk(raw);
  } catch {
    return {};
  }
}

/**
 * @param {Object} options
 * @param {boolean} options.preferWeb - 联网搜索开关打开时为 true，优先真实联网
 */
function loadSearchConfig({ preferWeb = false } = {}) {
  const fileConfig = readAiConfigFile();
  const searchApi = fileConfig.searchApi;

  if (searchApi && searchApi.provider) {
    const provider = searchApi.provider.toLowerCase();
    // 用户选了离线，但 Agent 需要联网 → 升级为 auto（先公网再离线再 LLM）
    if (preferWeb && provider === 'offline') {
      return { ...searchApi, provider: 'auto' };
    }
    return searchApi;
  }

  // 无配置：联网开关开 → auto；关 → 仅搜内置文档
  return preferWeb ? { provider: 'auto' } : { provider: 'offline' };
}

function readAllowWebSearch() {
  const prefPath = path.join(app.getPath('userData'), 'preferences.json');
  if (!fs.existsSync(prefPath)) return false;
  try {
    const prefs = JSON.parse(fs.readFileSync(prefPath, 'utf-8'));
    return !!prefs.allowWebSearch;
  } catch {
    return false;
  }
}

module.exports = { loadSearchConfig, readAllowWebSearch, readAiConfigFile };
