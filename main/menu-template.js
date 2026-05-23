const { dialog, BrowserWindow } = require("electron");
const path = require("path");
const { openBuildWindow } = require("./build");
const { createWindowMenuItems } = require("./panel-menu-state");

/**
 * @param {() => BrowserWindow|null} getMainWindow
 * @param {() => BrowserWindow|null} getProjectWindow
 * @param {(win: BrowserWindow|null) => void} setProjectWindow
 */
function createMenuTemplate(getMainWindow, getProjectWindow, setProjectWindow) {
  const preloadPath = path.join(__dirname, "..", "preload", "preload.js");
  const projectManagerHtml = path.join(__dirname, "..", "renderer", "project-manager.html");
  const preferencesHtml = path.join(__dirname, "..", "renderer", "preferences.html");

  function safeMainWindow() {
    const win = getMainWindow();
    if (!win || win.isDestroyed()) return null;
    return win;
  }

  function openProjectManager() {
    const mainWin = safeMainWindow();
    if (!mainWin) {
      dialog.showErrorBox("无法打开项目", "主窗口未就绪，请重启应用。");
      return;
    }

    let pw = getProjectWindow();
    if (pw && !pw.isDestroyed()) {
      try {
        pw.focus();
      } catch (e) {}
      return;
    }

    if (pw && pw.isDestroyed()) {
      setProjectWindow(null);
    }

    pw = new BrowserWindow({
      width: 1020,
      height: 720,
      minWidth: 880,
      minHeight: 600,
      resizable: true,
      parent: mainWin,
      modal: true,
      autoHideMenuBar: true,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    setProjectWindow(pw);
    pw.loadFile(projectManagerHtml);
    pw.on("closed", () => {
      setProjectWindow(null);
    });
  }

  return [
    {
      label: "文件",
      submenu: [
        {
          label: "打开项目",
          click: () => openProjectManager(),
        },
        {
          label: "保存",
          accelerator: "CmdOrCtrl+S",
          click: (_, bw) => bw && !bw.isDestroyed() && bw.webContents.send("menu-save"),
        },
        {
          label: "保存所有",
          accelerator: "CmdOrCtrl+Shift+S",
          click: (_, bw) => bw && !bw.isDestroyed() && bw.webContents.send("menu-save-all"),
        },
        { type: "separator" },
        {
          label: "从备份恢复（最近）",
          click: (_, bw) => {
            const win = bw || safeMainWindow();
            const { restoreFromLatestBackup } = require("./project-auto-backup");
            restoreFromLatestBackup(win).catch((e) => {
              console.error("[menu] restore latest backup:", e);
              dialog.showErrorBox("从备份恢复", e.message || String(e));
            });
          },
        },
        {
          label: "从备份恢复…",
          click: (_, bw) => {
            const win = bw || safeMainWindow();
            const { restoreFromBackupPicker } = require("./project-auto-backup");
            restoreFromBackupPicker(win).catch((e) => {
              console.error("[menu] restore backup pick:", e);
              dialog.showErrorBox("从备份恢复", e.message || String(e));
            });
          },
        },
        { type: "separator" },
        {
          label: "退出",
          accelerator: "CmdOrCtrl+Q",
          click: () => {
            const mainWin = safeMainWindow();
            if (mainWin) mainWin.close();
          },
        },
      ],
    },
    {
      label: "窗口",
      submenu: createWindowMenuItems(safeMainWindow),
    },
    {
      label: "编译",
      submenu: [
        {
          label: "编译项目",
          accelerator: "CmdOrCtrl+B",
          click: () => {
            const mainWin = safeMainWindow();
            if (mainWin) openBuildWindow(mainWin);
          },
        },
      ],
    },
    {
      label: "编辑",
      submenu: [
        { role: "undo", label: "撤销" },
        { role: "redo", label: "重做" },
        { type: "separator" },
        { role: "cut", label: "剪切" },
        { role: "copy", label: "复制" },
        { role: "paste", label: "粘贴" },
        { role: "selectAll", label: "全选" },
        { type: "separator" },
        {
          label: "查找",
          accelerator: "CmdOrCtrl+F",
          click: (_, bw) => bw && !bw.isDestroyed() && bw.webContents.send("menu-find"),
        },
        {
          label: "替换",
          accelerator: "CmdOrCtrl+H",
          click: (_, bw) => bw && !bw.isDestroyed() && bw.webContents.send("menu-find-replace"),
        },
        { type: "separator" },
        {
          label: "复制行",
          accelerator: "CmdOrCtrl+Shift+D",
          click: (_, bw) => bw && !bw.isDestroyed() && bw.webContents.send("menu-duplicate-line"),
        },
        {
          label: "删除行",
          accelerator: "CmdOrCtrl+Shift+K",
          click: (_, bw) => bw && !bw.isDestroyed() && bw.webContents.send("menu-delete-line"),
        },
        {
          label: "上移行",
          accelerator: "Alt+Up",
          click: (_, bw) => bw && !bw.isDestroyed() && bw.webContents.send("menu-move-line-up"),
        },
        {
          label: "下移行",
          accelerator: "Alt+Down",
          click: (_, bw) => bw && !bw.isDestroyed() && bw.webContents.send("menu-move-line-down"),
        },
      ],
    },
    {
      label: "视图",
      submenu: [
        {
          label: "显示空白字符",
          type: "checkbox",
          click: (_, bw) => bw && !bw.isDestroyed() && bw.webContents.send("menu-toggle-whitespace"),
        },
        {
          label: "自动换行",
          type: "checkbox",
          click: (_, bw) => bw && !bw.isDestroyed() && bw.webContents.send("menu-toggle-wordwrap"),
        },
        { type: "separator" },
        {
          label: "Dark 主题",
          click: (_, bw) => bw && !bw.isDestroyed() && bw.webContents.send("menu-set-theme", "vs-dark"),
        },
        {
          label: "Light 主题",
          click: (_, bw) => bw && !bw.isDestroyed() && bw.webContents.send("menu-set-theme", "vs"),
        },
        {
          label: "高对比度主题",
          click: (_, bw) => bw && !bw.isDestroyed() && bw.webContents.send("menu-set-theme", "hc-black"),
        },
        { type: "separator" },
        {
          label: "盟军主题",
          click: (_, bw) => bw && !bw.isDestroyed() && bw.webContents.send("menu-set-theme", "allied"),
        },
        {
          label: "苏联主题",
          click: (_, bw) => bw && !bw.isDestroyed() && bw.webContents.send("menu-set-theme", "soviet"),
        },
        {
          label: "帝国主题",
          click: (_, bw) => bw && !bw.isDestroyed() && bw.webContents.send("menu-set-theme", "empire"),
        },
        { type: "separator" },
        {
          label: "自定义主题",
          click: (_, bw) => bw && !bw.isDestroyed() && bw.webContents.send("menu-custom-theme"),
        },
        { type: "separator" },
        {
          label: "分屏编辑",
          click: (_, bw) => bw && !bw.isDestroyed() && bw.webContents.send("menu-split-editor"),
        },
        {
          label: "关闭分屏",
          click: (_, bw) => bw && !bw.isDestroyed() && bw.webContents.send("menu-close-split"),
        },
        { type: "separator" },
        {
          label: "拼写检查",
          type: "checkbox",
          click: (_, bw) => bw && !bw.isDestroyed() && bw.webContents.send("menu-toggle-spellcheck"),
        },
      ],
    },
    {
      label: "帮助",
      submenu: [
        {
          label: "关于 RA3 IDE",
          click: (_, bw) => {
            const win = bw || safeMainWindow();
            if (win && !win.isDestroyed()) {
              win.webContents.send("menu-show-welcome");
            }
          },
        },
      ],
    },
    {
      label: "设置",
      submenu: [
        {
          label: "首选项",
          click: () => {
            const mainWin = safeMainWindow();
            if (!mainWin) return;
            const prefWin = new BrowserWindow({
              width: 520,
              height: 560,
              resizable: false,
              parent: mainWin,
              modal: true,
              autoHideMenuBar: true,
              webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
      },
            });
            prefWin.loadFile(preferencesHtml);
            prefWin.on("closed", () => {});
          },
        },
      ],
    },
  ];
}

module.exports = { createMenuTemplate };
