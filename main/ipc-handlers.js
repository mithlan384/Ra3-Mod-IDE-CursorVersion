// main/ipc-handlers.js
const { ipcMain, dialog, BrowserWindow, clipboard } = require("electron");
const fs = require("fs");
const path = require("path");
const { getGlobalSdkPath, saveGlobalSdkPath, addRecentProject } = require("./project-manager");
const { execFile } = require("child_process");
const { registerAgentIpc } = require("./agent-ipc");
const { setCurrentFolder, getCurrentFolder } = require("./project-state");
const { openKnowledgeWindow } = require("./knowledge-window");
const { resolveWithinProject } = require("./path-sandbox");
const { fixCaseInDir } = require("./resolve-project-file");
const { setPanelStates } = require("./panel-menu-state");

/** 将路径限制在当前项目根内，并尝试修正大小写 */
function sandboxPath(fileOrDirPath) {
  const resolved = resolveWithinProject(getCurrentFolder(), fileOrDirPath);
  if (!resolved) return null;
  const fixed = fixCaseInDir(resolved);
  return fixed || resolved;
}

function normalizeProjectPath(projectPath) {
  return String(projectPath || "").replace(/\\/g, "/");
}

/** 仅允许读写「当前 / 最近 / 含 Mod 标记」的项目目录配置 */
function isAllowedProjectConfigPath(projectPath) {
  const normalized = normalizeProjectPath(projectPath);
  if (!normalized) return false;
  const current = normalizeProjectPath(getCurrentFolder());
  if (current && current === normalized) return true;
  try {
    const recentPath = path.join(
      require("electron").app.getPath("userData"),
      "recent-projects.json"
    );
    if (fs.existsSync(recentPath)) {
      const recent = JSON.parse(fs.readFileSync(recentPath, "utf-8"));
      if (
        Array.isArray(recent) &&
        recent.some((p) => normalizeProjectPath(p.path) === normalized)
      ) {
        return true;
      }
    }
  } catch {
    /* ignore */
  }
  try {
    if (!fs.existsSync(normalized)) return false;
    if (!fs.statSync(normalized).isDirectory()) return false;
    return (
      fs.existsSync(path.join(normalized, ".ra3proj")) ||
      fs.existsSync(path.join(normalized, "Mod.xml"))
    );
  } catch {
    return false;
  }
}

function registerIpcHandlers() {
  ipcMain.on("panel-sync-states", (_event, states) => {
    setPanelStates(states);
  });
  // ===================== 全局 SDK 路径 =====================
  ipcMain.handle("get-global-sdk-path", () => {
    const sdk = getGlobalSdkPath();
    return sdk ? sdk.replace(/\\/g, '/') : null;
  });

  ipcMain.handle("set-global-sdk-path", (event, sdkPath) => {
    saveGlobalSdkPath(sdkPath.replace(/\\/g, '/'));
    return true;
  });

  ipcMain.handle("get-sdk-mods", (event, sdkPath) => {
    const modsDir = path.join(sdkPath, "Mods");
    if (!fs.existsSync(modsDir)) return [];
    const items = fs.readdirSync(modsDir, { withFileTypes: true });
    return items
      .filter(item => item.isDirectory())
      .map(item => ({
        name: item.name,
        path: path.join(modsDir, item.name).replace(/\\/g, '/'),
      }));
  });

  // ===================== 项目管理 =====================
  ipcMain.handle("get-recent-projects", async () => {
    const recentProjectsPath = path.join(require("electron").app.getPath("userData"), "recent-projects.json");
    if (!fs.existsSync(recentProjectsPath)) return [];
    try {
      const data = JSON.parse(await fs.promises.readFile(recentProjectsPath, "utf-8"));
      return data.map(p => ({ ...p, path: p.path.replace(/\\/g, '/') }));
    } catch {
      return [];
    }
  });

  ipcMain.handle("open-project-dialog", async () => {
    const result = await dialog.showOpenDialog({
      title: "选择项目文件夹",
      properties: ["openDirectory"],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const projectPath = result.filePaths[0].replace(/\\/g, '/');
    addRecentProject(path.basename(projectPath), projectPath);
    return projectPath;
  });

  ipcMain.handle("new-project-dialog", async () => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return null;
    const sdkPath = getGlobalSdkPath();
    const defaultDir = sdkPath ? path.join(sdkPath, "Mods") : require("electron").app.getPath("documents");

    const dirResult = await dialog.showOpenDialog(win, {
      title: "选择新项目的父目录",
      defaultPath: defaultDir,
      properties: ["openDirectory"],
    });
    if (dirResult.canceled || dirResult.filePaths.length === 0) return null;
    const parentDir = dirResult.filePaths[0].replace(/\\/g, '/');

    const saveResult = await dialog.showSaveDialog(win, {
      title: "输入项目名称",
      defaultPath: path.join(parentDir, "新项目"),
      buttonLabel: "创建项目",
      properties: ["createDirectory"],
    });
    if (saveResult.canceled || !saveResult.filePath) return null;
    const projectPath = saveResult.filePath.replace(/\\/g, '/');
    const projectName = path.basename(projectPath);
    try {
      fs.mkdirSync(path.join(projectPath, "data"), { recursive: true });
      fs.mkdirSync(path.join(projectPath, "Art"), { recursive: true });
      fs.mkdirSync(path.join(projectPath, "compiled"), { recursive: true });
      fs.writeFileSync(
        path.join(projectPath, "data", "Mod.xml"),
        `<?xml version="1.0" encoding="UTF-8"?>\n<Mod name="${projectName}">\n</Mod>\n`,
        "utf-8"
      );
      fs.writeFileSync(
        path.join(projectPath, ".ra3proj"),
        JSON.stringify(
          {
            name: projectName,
            version: "0.1",
            sdkPath: sdkPath ? sdkPath.replace(/\\/g, '/') : "",
            outputPath: path.join(projectPath, "compiled").replace(/\\/g, '/'),
            build: {
              version: "0.1",
              skudefName: projectName,
              opt1: true, opt2: false, opt3: false, opt4: true,
              opt5: true, opt6: true, opt7: false, opt8: false,
              opt9: true, opt10: true, opt11: false, opt12: false,
            },
          },
          null,
          2
        )
      );
    } catch (err) {
      console.error("创建项目失败", err);
      return null;
    }
    addRecentProject(projectName, projectPath);
    return projectPath;
  });

  ipcMain.handle("import-project-dialog", async () => {
    const result = await dialog.showOpenDialog({
      title: "选择项目文件夹（包含 .ra3proj 或标准 MOD 结构）",
      properties: ["openDirectory"],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const projectPath = result.filePaths[0].replace(/\\/g, '/');
    const projectName = path.basename(projectPath);
    if (!fs.existsSync(path.join(projectPath, ".ra3proj"))) {
      const sdkPath = getGlobalSdkPath();
      fs.writeFileSync(
        path.join(projectPath, ".ra3proj"),
        JSON.stringify(
          {
            name: projectName,
            version: "0.1",
            sdkPath: sdkPath ? sdkPath.replace(/\\/g, '/') : "",
            outputPath: path.join(projectPath, "compiled").replace(/\\/g, '/'),
            build: {
              version: "0.1",
              skudefName: projectName,
              opt1: true, opt2: false, opt3: false, opt4: true,
              opt5: true, opt6: true, opt7: false, opt8: false,
              opt9: true, opt10: true, opt11: false, opt12: false,
            },
          },
          null,
          2
        )
      );
    }
    addRecentProject(projectName, projectPath);
    return projectPath;
  });

  // 项目切换
  const { registerMissingIpcHandlers, invalidateFileIndexCache } = require("./ipc-missing-handlers");
  registerMissingIpcHandlers();

  ipcMain.on("switch-project", (event, projectPath) => {
    const main = require("../main");
    const newPath = projectPath.replace(/\\/g, '/');
    if (main.getProjectWindow()) {
      main.getProjectWindow().close();
    }
    const mainWindow = main.getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send("before-switch-project", newPath);
    } else {
      main.createMainWindow(newPath);
    }
  });

  ipcMain.on("switching-ready", (event, newProjectPath) => {
    const main = require("../main");
    invalidateFileIndexCache();
    setCurrentFolder(newProjectPath.replace(/\\/g, '/'));
    if (main.getProjectWindow()) {
      main.getProjectWindow().close();
    }
    const mainWindow = main.getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send("set-project-path", getCurrentFolder());
    }
  });

  ipcMain.on("renderer-ready", (event) => {
    const main = require("../main");
    const senderWin = BrowserWindow.fromWebContents(event.sender);
    if (senderWin === main.getMainWindow()) {
      senderWin.webContents.send("set-project-path", getCurrentFolder());
    }
  });

  // ===================== 文件 / 文件夹操作 IPC =====================
  ipcMain.handle("select-folder", async () => {
    const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
    if (result.canceled) return [];
    const folderPath = result.filePaths[0].replace(/\\/g, '/');
    setCurrentFolder(folderPath);
    const items = fs.readdirSync(folderPath, { withFileTypes: true });
    return items.map(item => ({
      name: item.name,
      path: path.join(folderPath, item.name).replace(/\\/g, '/'),
      isDirectory: item.isDirectory(),
    }));
  });

  ipcMain.handle("read-directory", (event, dirPath) => {
    const safePath = sandboxPath(dirPath);
    if (!safePath || !fs.existsSync(safePath)) return [];
    const items = fs.readdirSync(safePath, { withFileTypes: true });
    return items.map(item => ({
      name: item.name,
      path: path.join(safePath, item.name).replace(/\\/g, '/'),
      isDirectory: item.isDirectory(),
    }));
  });

  // 读取文件（项目沙箱 + 大小写容错）
  ipcMain.handle("read-file", async (event, filePath) => {
    const safePath = sandboxPath(filePath);
    if (!safePath || !fs.existsSync(safePath)) return "";

    try {
      return fs.readFileSync(safePath, "utf-8");
    } catch (err) {
      console.error("读取文件失败", err);
      return "";
    }
  });

  ipcMain.handle("save-file", (event, filePath, content) => {
    const safePath = sandboxPath(filePath);
    if (!safePath) return false;
    try {
      fs.writeFileSync(safePath, content, "utf-8");
      return true;
    } catch (err) {
      console.error("保存失败", err);
      return false;
    }
  });

  ipcMain.handle("save-all-files", (event, files) => {
    let success = true;
    for (const { path: fp, content } of files) {
      const safePath = sandboxPath(fp);
      if (!safePath) {
        success = false;
        continue;
      }
      try {
        fs.writeFileSync(safePath, content, "utf-8");
      } catch (err) {
        console.error(`保存 ${fp} 失败`, err);
        success = false;
      }
    }
    return success;
  });

  ipcMain.handle("show-unsaved-dialog", async (event, unsavedFiles) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return "cancel";
    const maxDisplay = 10;
    let list = unsavedFiles.slice(0, maxDisplay).join("\n");
    if (unsavedFiles.length > maxDisplay) {
      list += `\n... 还有 ${unsavedFiles.length - maxDisplay} 个文件未显示`;
    }
    const { response } = await dialog.showMessageBox(win, {
      type: "warning",
      title: "未保存的文件",
      message: "以下文件已修改，是否保存？",
      detail: list,
      buttons: ["保存后退出", "不保存退出", "记忆退出", "取消"],
      defaultId: 0,
      cancelId: 3,
    });
    if (response === 0) return "save";
    if (response === 1) return "discard";
    if (response === 2) return "remember";
    return "cancel";
  });

  ipcMain.on("allow-close", (event) => {
    const main = require("../main");
    main.clearPendingCloseTimer();
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.destroy();
  });

  ipcMain.on("cancel-close", () => {
    const main = require("../main");
    main.clearPendingCloseTimer();
  });

  ipcMain.on("open-project", (event, projectPath) => {
    if (!projectPath) return;
    const main = require("../main");
    const normalized = projectPath.replace(/\\/g, "/");
    addRecentProject(path.basename(normalized), normalized);
    setCurrentFolder(normalized);
    if (main.getMainWindow()) {
      main.getMainWindow().webContents.send("set-project-path", normalized);
    } else {
      main.createMainWindow(normalized);
    }
    const pm = main.getProjectWindow();
    if (pm && !pm.isDestroyed()) pm.close();
  });

  // 会话存取
  const sessionPath = path.join(require("electron").app.getPath("userData"), "session.json");
  ipcMain.handle("save-session", async (event, data) => {
    try {
      await fs.promises.writeFile(sessionPath, JSON.stringify(data, null, 2), "utf-8");
      return true;
    } catch (err) {
      console.error("会话保存失败", err);
      return false;
    }
  });
  ipcMain.handle("load-session", async () => {
    if (!fs.existsSync(sessionPath)) return null;
    try {
      const raw = await fs.promises.readFile(sessionPath, "utf-8");
      return JSON.parse(raw);
    } catch (err) {
      console.error("会话加载失败", err);
      return null;
    }
  });
  ipcMain.handle("get-user-data-path", () => require("electron").app.getPath("userData"));

  // 文件/文件夹操作（右键菜单）
  ipcMain.handle("delete-item", async (event, targetPath) => {
    const safePath = sandboxPath(targetPath);
    if (!safePath) return false;
    try {
      const stat = fs.lstatSync(safePath);
      if (stat.isDirectory()) {
        fs.rmSync(safePath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(safePath);
      }
      return true;
    } catch (err) {
      console.error("删除失败", err);
      return false;
    }
  });

  ipcMain.handle("create-item", async (event, parentDir, itemName, type) => {
    const safeParent = sandboxPath(parentDir);
    if (!safeParent) return null;
    const fullPath = path.join(safeParent, itemName).replace(/\\/g, '/');
    if (!sandboxPath(fullPath)) return null;
    try {
      if (type === "folder") {
        fs.mkdirSync(fullPath, { recursive: true });
      } else {
        fs.writeFileSync(fullPath, "", "utf-8");
      }
      return { name: itemName, path: fullPath, isDirectory: type === "folder" };
    } catch (err) {
      console.error("创建失败", err);
      return null;
    }
  });

  ipcMain.handle("write-clipboard-text", async (_event, text) => {
    try {
      clipboard.writeText(String(text ?? ""));
      return true;
    } catch (err) {
      console.error("写入剪贴板失败", err);
      return false;
    }
  });

  let clipboardPath = null;
  ipcMain.handle("copy-item", (event, sourcePath) => {
    const safe = sandboxPath(sourcePath);
    if (!safe) return false;
    clipboardPath = safe;
    return true;
  });

  ipcMain.handle("paste-item", async (event, destDir) => {
    const safeDest = sandboxPath(destDir);
    if (!safeDest || !clipboardPath || !fs.existsSync(clipboardPath)) return false;
    const destPath = path.join(safeDest, path.basename(clipboardPath)).replace(/\\/g, '/');
    try {
      const stat = fs.lstatSync(clipboardPath);
      if (stat.isDirectory()) {
        fs.cpSync(clipboardPath, destPath, { recursive: true });
      } else {
        fs.copyFileSync(clipboardPath, destPath);
      }
      return true;
    } catch (err) {
      console.error("粘贴失败", err);
      return false;
    }
  });

  // 拼写检查
  ipcMain.handle("check-spelling", async (event, text) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return [];
    const words = text.match(/\b\w+\b/g) || [];
    const errors = [];
    for (const word of words) {
      try {
        const isCorrect = win.webContents.session.spellCheck(word);
        if (!isCorrect) {
          let idx = text.indexOf(word);
          while (idx !== -1) {
            errors.push({ start: idx, end: idx + word.length, word });
            idx = text.indexOf(word, idx + 1);
          }
        }
      } catch (err) {
        return [];
      }
    }
    return errors;
  });

  // 首选项
  const preferencesPath = path.join(require("electron").app.getPath("userData"), "preferences.json");
  ipcMain.handle("get-preferences", async () => {
    const defaults = { autoSaveInterval: 0, theme: 'vs-dark', spellcheckEnabled: false, persistSettings: true };
    if (!fs.existsSync(preferencesPath)) return defaults;
    try {
      const raw = await fs.promises.readFile(preferencesPath, "utf-8");
      return { ...defaults, ...JSON.parse(raw) };
    } catch {
      return defaults;
    }
  });
  ipcMain.handle("save-preferences", async (event, prefs) => {
    try {
      await fs.promises.writeFile(preferencesPath, JSON.stringify(prefs, null, 2), "utf-8");
      const senderWin = BrowserWindow.fromWebContents(event.sender);
      const mainWin = BrowserWindow.getAllWindows().find(w => w.id !== senderWin.id);
      if (mainWin) mainWin.webContents.send("preferences-changed", prefs);
      return true;
    } catch (err) {
      console.error("保存首选项失败", err);
      return false;
    }
  });

  // ===================== AI 配置存储 =====================
  const { stripSecretsForDisk, revealSecretsFromDisk, isEncryptionAvailable } = require("./secure-config");
  const { getUserDataPath } = require("./electron-safe");
  const aiConfigPath = path.join(getUserDataPath(), "ra3-ai-config.json");
  ipcMain.handle("save-ai-config", async (event, aiConfig) => {
    try {
      const disk = stripSecretsForDisk(aiConfig || {});
      const hasKey = !!(aiConfig?.apiKey || aiConfig?.searchApi?.apiKey);
      await fs.promises.writeFile(aiConfigPath, JSON.stringify(disk, null, 2), "utf-8");
      return {
        success: true,
        encryptionAvailable: isEncryptionAvailable(),
        storedPlaintext: hasKey && !isEncryptionAvailable(),
      };
    } catch (err) {
      console.error("保存 AI 配置失败", err);
      return { success: false, error: err.message };
    }
  });
  ipcMain.handle("get-ai-config", async () => {
    if (!fs.existsSync(aiConfigPath)) return null;
    try {
      const raw = JSON.parse(await fs.promises.readFile(aiConfigPath, "utf-8"));
      return revealSecretsFromDisk(raw);
    } catch {
      return null;
    }
  });

  // ===================== 项目配置 IPC =====================
  ipcMain.handle("get-project-path", () => getCurrentFolder());
  ipcMain.handle("read-project-config", async (event, projectPath) => {
    if (!isAllowedProjectConfigPath(projectPath)) return null;
    const configPath = path.join(normalizeProjectPath(projectPath), ".ra3proj");
    if (!fs.existsSync(configPath)) return null;
    try {
      return JSON.parse(await fs.promises.readFile(configPath, "utf-8"));
    } catch {
      return null;
    }
  });
  ipcMain.handle("save-project-config", async (event, { projectPath, config }) => {
    if (!isAllowedProjectConfigPath(projectPath)) return false;
    const configPath = path.join(normalizeProjectPath(projectPath), ".ra3proj");
    try {
      await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
      return true;
    } catch {
      return false;
    }
  });
  ipcMain.handle("select-sdk-folder", async () => {
    const result = await dialog.showOpenDialog({
      title: "选择 RA3 MOD SDK 根目录",
      properties: ["openDirectory"],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0].replace(/\\/g, '/');
  });

  // ===================== 编译执行 =====================
  ipcMain.on("start-build", (event, buildConfig) => {
    const main = require("../main");
    const mainWindow = main.getMainWindow();
    if (!mainWindow) {
      console.error("主窗口不存在");
      return;
    }

    const sdkPath = getGlobalSdkPath();
    if (!sdkPath) {
      mainWindow.webContents.send("build-output", "错误：未设置 SDK 路径\n");
      return;
    }

    const ealaStudio = path.join(sdkPath, "EALAModStudio.exe");
    if (!fs.existsSync(ealaStudio)) {
      mainWindow.webContents.send("build-output", `错误：找不到 ${ealaStudio}\n`);
      return;
    }

    const args = [
      "/build",
      `/mod:"${getCurrentFolder()}"`,
      `/version:${buildConfig.version}`,
      `/skudef:${buildConfig.skudefName}`,
    ];
    if (buildConfig.opt1) args.push("/clean");
    if (buildConfig.opt2) args.push("/clearcache");
    if (buildConfig.opt3) args.push("/aptui");
    if (buildConfig.opt4) args.push("/globaldata");
    if (buildConfig.opt5) args.push("/assetdata");
    if (buildConfig.opt6) args.push("/mergeassets");
    if (buildConfig.opt7) args.push("/fixneutral");
    if (buildConfig.opt8) args.push("/copyextra");
    if (buildConfig.opt9) args.push("/big");
    if (buildConfig.opt10) args.push("/skudef");
    if (buildConfig.opt11) args.push("/fullscreenini");
    if (buildConfig.opt12) args.push("/windowini");

    const cmdLine = `"${ealaStudio}" ${args.join(' ')}`;
    mainWindow.webContents.send("build-output", `开始编译...\n命令: ${cmdLine}\n\n`);
    mainWindow.webContents.send("toggle-output-panel");

    const child = execFile(ealaStudio, args, {
      cwd: getCurrentFolder(),
      maxBuffer: 1024 * 1024 * 10,
      windowsHide: true,
      shell: false,
    });

    child.stdout.on("data", (data) => {
      mainWindow.webContents.send("build-output", data.toString());
    });

    child.stderr.on("data", (data) => {
      mainWindow.webContents.send("build-output", data.toString());
    });

    child.on("error", (err) => {
      mainWindow.webContents.send("build-output", `\n编译出错: ${err.message}\n`);
    });

    child.on("close", (code) => {
      mainWindow.webContents.send("build-output", `\n编译结束，退出码: ${code}\n`);
      mainWindow.webContents.send("build-finished", code);
    });
  });

  // 错误点击跳转
  ipcMain.on("build-error-click", (event, filePath, line) => {
    const main = require("../main");
    const mainWindow = main.getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send("open-file-at-line", filePath, line);
    }
  });

  // ===================== 文件状态及二进制读写 =====================
  ipcMain.handle("get-file-stat", async (event, filePath) => {
    const safePath = sandboxPath(filePath);
    if (!safePath || !fs.existsSync(safePath)) return null;
    const stat = fs.statSync(safePath);
    return {
      size: stat.size,
      mtime: stat.mtimeMs,
      isDirectory: stat.isDirectory(),
    };
  });

  ipcMain.handle("read-binary-file", async (event, filePath) => {
    const safePath = sandboxPath(filePath);
    if (!safePath || !fs.existsSync(safePath)) return null;
    return fs.promises.readFile(safePath);
  });

  ipcMain.handle("write-binary-file", async (event, filePath, buffer) => {
    const safePath = sandboxPath(filePath);
    if (!safePath) return false;
    try {
      await fs.promises.writeFile(safePath, Buffer.from(buffer));
      return true;
    } catch (err) {
      console.error("写入二进制文件失败", err);
      return false;
    }
  });

  // ===================== 页面内菜单栏 / 标题栏主题（Windows titleBarOverlay） =====================
  const { applyWindowTheme, usesInAppMenuBar } = require("./window-theme");
  const { getAppSubmenu, runAppSubmenuAction } = require("./menu-popup");
  const { checkThemePersonalityMismatch } = require("./agent-chat-sessions");

  ipcMain.handle("uses-in-app-menu-bar", async () => usesInAppMenuBar());

  ipcMain.handle("get-app-submenu", async (_event, rootLabel) =>
    getAppSubmenu(rootLabel)
  );

  ipcMain.handle("run-app-submenu-action", async (_event, rootLabel, index) =>
    runAppSubmenuAction(rootLabel, index)
  );

  ipcMain.handle("sync-window-theme", async (_event, themeId) => {
    try {
      applyWindowTheme(themeId);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle("check-theme-personality", async (_event, themeId) => {
    try {
      return checkThemePersonalityMismatch(themeId, getCurrentFolder());
    } catch (e) {
      return { mismatch: false, error: e.message };
    }
  });

  // ===================== Art 壁纸 / Logo（项目管理器、IDE 幻灯片） =====================
  const { resolveArtFileUrl } = require("./art-protocol");
  const { listFactionWallpapers } = require("./art-wallpaper-index");
  const { listCustomWallpapers } = require("./custom-wallpaper-index");

  ipcMain.handle("get-art-file-url", async (_event, relPath) => {
    try {
      return resolveArtFileUrl(relPath) || null;
    } catch (e) {
      console.warn("[ipc] get-art-file-url:", e.message);
      return null;
    }
  });

  ipcMain.handle("list-faction-wallpapers", async (_event, factionId) => {
    try {
      const paths = listFactionWallpapers(factionId);
      const images = paths
        .map((rel) => resolveArtFileUrl(rel) || rel)
        .filter(Boolean);
      return { success: true, paths, images };
    } catch (e) {
      return { success: false, error: e.message, paths: [], images: [] };
    }
  });

  ipcMain.handle("list-custom-wallpapers", async (_event, folderPath) => {
    try {
      const items = listCustomWallpapers(folderPath);
      return {
        success: true,
        images: items.map((it) => ({ path: it.path, url: it.url, name: it.name })),
      };
    } catch (e) {
      return { success: false, error: e.message, images: [] };
    }
  });

  ipcMain.handle("pick-custom-wallpaper-folder", async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win || undefined, {
      title: "选择自定义壁纸文件夹",
      properties: ["openDirectory"],
    });
    if (result.canceled || !result.filePaths?.[0]) {
      return { success: false, canceled: true };
    }
    return { success: true, path: result.filePaths[0].replace(/\\/g, "/") };
  });

  // ===================== 用户头像（AI 面板 / 首选项） =====================
  const { app } = require("electron");
  const userAvatar = require("./user-avatar");
  const userDataPath = () => app.getPath("userData");

  function broadcastUserAvatarChanged(payload) {
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send("user-avatar-changed", payload);
    }
  }

  ipcMain.handle("get-user-avatar-url", async () =>
    userAvatar.getUserAvatarUrl(userDataPath())
  );

  ipcMain.handle("get-default-user-avatar-url", async () =>
    userAvatar.getDefaultUserAvatarUrl() || null
  );

  ipcMain.handle("pick-user-avatar", async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win || undefined, {
      title: "选择头像图片",
      properties: ["openFile"],
      filters: [{ name: "图片", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }],
    });
    if (result.canceled || !result.filePaths?.[0]) {
      return { success: false, canceled: true };
    }
    const res = userAvatar.saveUserAvatarFromFile(userDataPath(), result.filePaths[0]);
    if (res?.success) broadcastUserAvatarChanged(res);
    return res;
  });

  ipcMain.handle("clear-user-avatar", async () => {
    const res = userAvatar.clearUserAvatar(userDataPath());
    broadcastUserAvatarChanged(res);
    return res;
  });

  // ===================== 知识库窗口 =====================
  ipcMain.on("open-knowledge-panel", (event) => {
    const main = require("../main");
    const mainWindow = main.getMainWindow();
    if (mainWindow) {
      openKnowledgeWindow(mainWindow);
    }
  });

  // ===================== Agent IPC 注册 =====================
  registerAgentIpc();
}

module.exports = { registerIpcHandlers, setCurrentFolder, getCurrentFolder };