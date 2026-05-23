// main/custom-wallpaper-index.js —— 扫描用户自定义壁纸文件夹

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const IMG_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp']);

function listCustomWallpapers(folderPath) {
  const dir = String(folderPath || '').trim();
  if (!dir) return [];
  const resolved = path.resolve(dir);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) return [];

  const files = [];
  for (const name of fs.readdirSync(resolved)) {
    const ext = path.extname(name).toLowerCase();
    if (!IMG_EXT.has(ext)) continue;
    const full = path.join(resolved, name);
    try {
      if (!fs.statSync(full).isFile()) continue;
    } catch {
      continue;
    }
    files.push({
      path: full,
      url: pathToFileURL(full).href,
      name,
    });
  }

  files.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  return files;
}

module.exports = { listCustomWallpapers, IMG_EXT };
