// main/seed-user-data.js —— 测试安装包首次启动时写入种子配置（仅当 userData 尚无对应文件）

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const SEED_FILES = ['ra3-ai-config.json', 'preferences.json'];

function getSeedDir() {
  if (!app.isPackaged) return null;
  const dir = path.join(process.resourcesPath, 'seed-user-data');
  return fs.existsSync(dir) ? dir : null;
}

function seedUserDataIfNeeded() {
  const seedDir = getSeedDir();
  if (!seedDir) return;

  const userData = app.getPath('userData');
  if (!fs.existsSync(userData)) {
    fs.mkdirSync(userData, { recursive: true });
  }

  for (const name of SEED_FILES) {
    const dest = path.join(userData, name);
    if (fs.existsSync(dest)) continue;
    const src = path.join(seedDir, name);
    if (!fs.existsSync(src)) continue;
    try {
      fs.copyFileSync(src, dest);
      console.log('[seed-user-data] 已初始化', name);
    } catch (e) {
      console.warn('[seed-user-data] 复制失败', name, e.message);
    }
  }
}

module.exports = { seedUserDataIfNeeded };
