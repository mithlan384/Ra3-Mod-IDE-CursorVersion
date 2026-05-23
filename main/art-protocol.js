// main/art-protocol.js —— 为 IDE 根目录 Art/ 注册本地资源协议 ra3-art://

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { app, protocol } = require('electron');
const { getArtRoot } = require('./app-paths');

function registerArtScheme() {
  if (!protocol.registerSchemesAsPrivileged) return;
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'ra3-art',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        bypassCSP: true,
      },
    },
  ]);
}

function registerArtProtocol() {
  const artRoot = getArtRoot();

  protocol.registerFileProtocol('ra3-art', (request, callback) => {
    try {
      let rel = request.url.replace(/^ra3-art:\/\//i, '');
      rel = decodeURIComponent(rel).replace(/^\/+/, '');
      const filePath = path.normalize(path.join(artRoot, rel.replace(/\//g, path.sep)));
      if (!filePath.startsWith(path.normalize(artRoot))) {
        callback({ error: -6 });
        return;
      }
      callback({ path: filePath });
    } catch (e) {
      callback({ error: -2 });
    }
  });
}

function setupArtProtocol() {
  registerArtScheme();
  if (app.isReady()) {
    registerArtProtocol();
  } else {
    app.whenReady().then(registerArtProtocol);
  }
}

/** 返回 Art 下资源的 file:// URL（项目管理器等子窗口最可靠） */
function resolveArtFileUrl(rel) {
  if (!rel) return null;
  const artRoot = path.normalize(getArtRoot());
  const normalized = String(rel).replace(/\\/g, '/').replace(/^\/+/, '');
  const filePath = path.normalize(
    path.join(artRoot, normalized.split('/').join(path.sep))
  );
  if (!filePath.startsWith(artRoot)) return null;
  if (!fs.existsSync(filePath)) return null;
  return pathToFileURL(filePath).href;
}

module.exports = { setupArtProtocol, getArtRoot, resolveArtFileUrl, getArtRootPath: getArtRoot };
