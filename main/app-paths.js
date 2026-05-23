// main/app-paths.js —— 开发版与 electron-builder 安装包下的应用根目录 / Art 路径

const path = require('path');
const { getElectronApp } = require('./electron-safe');

/** IDE 安装根（开发时为仓库根；打包后为 resources 目录） */
function getAppResourceRoot() {
  const app = getElectronApp();
  if (app?.isPackaged && process.resourcesPath) {
    return process.resourcesPath;
  }
  return path.join(__dirname, '..');
}

/** 内置美术素材 Art/（壁纸、阵营头像、Logo 等） */
function getArtRoot() {
  const app = getElectronApp();
  if (app?.isPackaged && process.resourcesPath) {
    return path.join(process.resourcesPath, 'Art');
  }
  return path.join(__dirname, '..', 'Art');
}

module.exports = { getAppResourceRoot, getArtRoot };
