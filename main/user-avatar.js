// main/user-avatar.js —— 用户自定义 AI 对话头像（存于 userData/avatars）

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { resolveArtFileUrl } = require('./art-protocol');

const AVATAR_BASENAME = 'user-avatar';
const ALLOWED_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

function getAvatarsDir(userDataPath) {
  return path.join(userDataPath, 'avatars');
}

function findAvatarFile(userDataPath) {
  const dir = getAvatarsDir(userDataPath);
  if (!fs.existsSync(dir)) return null;
  for (const ext of ALLOWED_EXT) {
    const full = path.join(dir, AVATAR_BASENAME + ext);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

function clearAvatarFiles(userDataPath) {
  const dir = getAvatarsDir(userDataPath);
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir)) {
    if (ent.startsWith(AVATAR_BASENAME)) {
      try {
        fs.unlinkSync(path.join(dir, ent));
      } catch (e) {}
    }
  }
}

function getUserAvatarUrl(userDataPath) {
  const full = findAvatarFile(userDataPath);
  if (!full) return { success: true, hasAvatar: false, url: null };
  const stat = fs.statSync(full);
  return {
    success: true,
    hasAvatar: true,
    url: `${pathToFileURL(full).href}?t=${stat.mtimeMs}`,
    path: full,
  };
}

/**
 * @param {string} sourcePath 用户选择的图片
 */
function saveUserAvatarFromFile(userDataPath, sourcePath) {
  const ext = path.extname(sourcePath).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    return { success: false, error: '仅支持 PNG、JPG、WEBP、GIF 图片' };
  }
  const dir = getAvatarsDir(userDataPath);
  fs.mkdirSync(dir, { recursive: true });
  clearAvatarFiles(userDataPath);
  const dest = path.join(dir, AVATAR_BASENAME + ext);
  fs.copyFileSync(sourcePath, dest);
  return getUserAvatarUrl(userDataPath);
}

function clearUserAvatar(userDataPath) {
  clearAvatarFiles(userDataPath);
  return { success: true, hasAvatar: false, url: null };
}

function getDefaultUserAvatarUrl() {
  return resolveArtFileUrl('RAT.png');
}

module.exports = {
  getAvatarsDir,
  findAvatarFile,
  getUserAvatarUrl,
  getDefaultUserAvatarUrl,
  saveUserAvatarFromFile,
  clearUserAvatar,
  ALLOWED_EXT,
};
