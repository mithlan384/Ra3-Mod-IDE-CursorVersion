const fs = require("fs");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const sdkPathFile = path.join(app.getPath("userData"), "sdk-path.json");

function readSdkPathFromPreferences() {
  try {
    const prefPath = path.join(app.getPath("userData"), "preferences.json");
    if (!fs.existsSync(prefPath)) return null;
    const prefs = JSON.parse(fs.readFileSync(prefPath, "utf-8"));
    const p = prefs.sdkPath || prefs.sdkRoot || prefs.ra3SdkPath;
    return p ? String(p).replace(/\\/g, "/") : null;
  } catch (e) {
    return null;
  }
}

function getGlobalSdkPath() {
  if (fs.existsSync(sdkPathFile)) {
    try {
      const p = JSON.parse(fs.readFileSync(sdkPathFile, "utf-8")).sdkPath;
      if (p) return p.replace(/\\/g, "/");
    } catch (e) {}
  }
  const fromPrefs = readSdkPathFromPreferences();
  if (fromPrefs && fs.existsSync(path.join(fromPrefs, "EALAModStudio.exe"))) {
    return fromPrefs;
  }
  try {
    const { guessSdkPath } = require("./sdk-build");
    return guessSdkPath();
  } catch {
    return null;
  }
}

function saveGlobalSdkPath(sdkPath) {
  const normalized = String(sdkPath || "").replace(/\\/g, "/");
  fs.writeFileSync(sdkPathFile, JSON.stringify({ sdkPath: normalized }), "utf-8");
  try {
    const prefPath = path.join(app.getPath("userData"), "preferences.json");
    let prefs = {};
    if (fs.existsSync(prefPath)) {
      prefs = JSON.parse(fs.readFileSync(prefPath, "utf-8"));
    }
    prefs.sdkPath = normalized;
    fs.writeFileSync(prefPath, JSON.stringify(prefs, null, 2), "utf-8");
  } catch (e) {
    console.warn("[project-manager] sync sdk to preferences:", e.message);
  }
}

function addRecentProject(projectName, projectPath) {
  const recentProjectsPath = path.join(app.getPath("userData"), "recent-projects.json");
  let recent = [];
  const normalizedPath = projectPath.replace(/\\/g, '/');
  if (fs.existsSync(recentProjectsPath)) {
    try { recent = JSON.parse(fs.readFileSync(recentProjectsPath, "utf-8")); } catch {}
  }
  recent = recent.filter(p => p.path !== normalizedPath);
  recent.unshift({ name: projectName, path: normalizedPath });
  if (recent.length > 3) recent = recent.slice(0, 3);
  try { fs.writeFileSync(recentProjectsPath, JSON.stringify(recent, null, 2)); } catch (err) { console.error("保存最近项目失败", err); }
}

// 修改：创建项目管理器后返回窗口实例
function createProjectManager() {
  const win = new BrowserWindow({
    width: 1020,
    height: 720,
    minWidth: 880,
    minHeight: 600,
    resizable: true,
    show: true,
    backgroundColor: "#0a0e14",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, "..", "renderer", "project-manager.html"));
  return win;
}

module.exports = { getGlobalSdkPath, saveGlobalSdkPath, addRecentProject, createProjectManager };