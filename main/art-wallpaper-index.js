// main/art-wallpaper-index.js —— 扫描 Art/{阵营}/Pictures 下的壁纸素材

const fs = require('fs');
const path = require('path');
const { getArtRoot } = require('./app-paths');

const FACTION_DIRS = {
  allied: 'Allied/Pictures',
  soviet: 'Soviet/Pictures',
  empire: 'Empire/Pictures',
};

const IMG_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

function listFactionWallpapers(factionId) {
  const relDir = FACTION_DIRS[factionId];
  if (!relDir) return [];
  const fullDir = path.join(getArtRoot(), relDir.replace(/\//g, path.sep));
  if (!fs.existsSync(fullDir)) return [];

  const primary = {
    allied: 'allied-wallpaper.jpg',
    soviet: 'soviet-wallpaper.jpg',
    empire: 'empire-wallpaper.jpg',
  }[factionId];

  const files = [];
  for (const name of fs.readdirSync(fullDir)) {
    const ext = path.extname(name).toLowerCase();
    if (!IMG_EXT.has(ext)) continue;
    files.push(`${relDir}/${name}`.replace(/\\/g, '/'));
  }

  files.sort((a, b) => {
    const an = path.basename(a).toLowerCase();
    const bn = path.basename(b).toLowerCase();
    if (primary) {
      if (an === primary) return -1;
      if (bn === primary) return 1;
    }
    return an.localeCompare(bn);
  });

  return files;
}

module.exports = {
  FACTION_DIRS,
  listFactionWallpapers,
  getArtRoot,
};
