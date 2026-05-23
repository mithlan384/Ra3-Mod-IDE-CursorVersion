const { app, BrowserWindow, Menu } = require("electron");
const fs = require("fs");
const path = require("path");
const {
  applyWindowTheme,
  getMainWindowConstructorOptions,
  registerOverlayMainWindow,
} = require("./main/window-theme");
const { setupArtProtocol } = require("./main/art-protocol");
setupArtProtocol();
const { seedUserDataIfNeeded } = require("./main/seed-user-data");
const { registerIpcHandlers, setCurrentFolder } = require("./main/ipc-handlers");
const { createMenuTemplate } = require("./main/menu-template");
const { setRebuildMenu, setPanelStates } = require("./main/panel-menu-state");
const { createProjectManager } = require("./main/project-manager");
const { configureMenuPopup } = require("./main/menu-popup");

let mainWindow = null;
let projectWindow = null;
let pendingCloseTimer = null;
const CLOSE_GUARD_MS = 15000;

function clearPendingCloseTimer() {
  if (pendingCloseTimer) {
    clearTimeout(pendingCloseTimer);
    pendingCloseTimer = null;
  }
}

function armPendingCloseTimer(win) {
  clearPendingCloseTimer();
  pendingCloseTimer = setTimeout(() => {
    pendingCloseTimer = null;
    console.warn(`[main] 关闭流程 ${CLOSE_GUARD_MS}ms 内未完成，强制关闭窗口`);
    if (win && !win.isDestroyed()) win.destroy();
  }, CLOSE_GUARD_MS);
}

function buildAppMenu() {
  const menuTemplate = createMenuTemplate(
    () => mainWindow,
    () => projectWindow,
    (win) => {
      projectWindow = win;
    }
  );
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));
}

setRebuildMenu(buildAppMenu);

function readSavedTheme() {
  try {
    const prefsPath = path.join(app.getPath("userData"), "preferences.json");
    if (fs.existsSync(prefsPath)) {
      const prefs = JSON.parse(fs.readFileSync(prefsPath, "utf-8"));
      return prefs.theme || "vs-dark";
    }
  } catch (e) {
    console.warn("[main] read theme prefs:", e.message);
  }
  return "vs-dark";
}

function createMainWindow(projectPath) {
  setCurrentFolder(projectPath);

  const themeId = readSavedTheme();
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: true,
    backgroundColor: "#0a0e14",
    ...getMainWindowConstructorOptions(themeId),
    webPreferences: {
      preload: path.join(__dirname, "preload", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: true,
    },
  });
  registerOverlayMainWindow(mainWindow);

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));

  mainWindow.webContents.once("did-finish-load", () => {
    try {
      applyWindowTheme(readSavedTheme());
    } catch (e) {
      console.warn("[main] apply theme on load:", e.message);
    }
  });

  buildAppMenu();

  mainWindow.on("close", (e) => {
    e.preventDefault();
    armPendingCloseTimer(mainWindow);
    mainWindow.webContents.send("before-close");
  });

  return mainWindow;
}

module.exports = {
  getMainWindow: () => mainWindow,
  getProjectWindow: () => projectWindow,
  setProjectWindow: (win) => { projectWindow = win; },
  createMainWindow,
  rebuildAppMenu: buildAppMenu,
  clearPendingCloseTimer,
};

configureMenuPopup({
  getMainWindow: () => mainWindow,
  getProjectWindow: () => projectWindow,
  setProjectWindow: (win) => {
    projectWindow = win;
  },
});

app.whenReady().then(() => {
  registerIpcHandlers();

  const projectWin = createProjectManager();
  projectWindow = projectWin;
  projectWin.on("closed", () => {
    projectWindow = null;
    if (!mainWindow) app.quit();
  });

  setImmediate(() => {
    seedUserDataIfNeeded();
    try {
      require("./main/project-auto-backup").rescheduleFromPreferences();
    } catch (e) {
      console.warn("[main] backup schedule:", e.message);
    }
    try {
      const prefsPath = path.join(app.getPath("userData"), "preferences.json");
      if (fs.existsSync(prefsPath)) {
        const prefs = JSON.parse(fs.readFileSync(prefsPath, "utf-8"));
        if (prefs.theme) applyWindowTheme(prefs.theme);
        else applyWindowTheme("vs-dark");
      }
    } catch (e) {
      console.warn("[main] load theme:", e.message);
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});