// main/electron-safe.js —— 在纯 Node 测试与 Electron 运行时均可安全访问 app API

const path = require('path');
const os = require('os');

function getElectronApp() {
  try {
    return require('electron').app;
  } catch {
    return null;
  }
}

function getUserDataPath() {
  const app = getElectronApp();
  if (app?.getPath) {
    try {
      return app.getPath('userData');
    } catch {
      /* fallthrough */
    }
  }
  return path.join(os.tmpdir(), 'ra3-ide-test-userdata');
}

module.exports = { getElectronApp, getUserDataPath };
