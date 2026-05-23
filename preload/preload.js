// preload/preload.js
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  getGlobalSdkPath: () => ipcRenderer.invoke("get-global-sdk-path"),
  setGlobalSdkPath: (sdkPath) => ipcRenderer.invoke("set-global-sdk-path", sdkPath),
  getSdkMods: (sdkPath) => ipcRenderer.invoke("get-sdk-mods", sdkPath),

  getRecentProjects: () => ipcRenderer.invoke("get-recent-projects"),
  openProjectDialog: () => ipcRenderer.invoke("open-project-dialog"),
  newProjectDialog: () => ipcRenderer.invoke("new-project-dialog"),
  importProjectDialog: () => ipcRenderer.invoke("import-project-dialog"),
  openProject: (projectPath) => ipcRenderer.send("open-project", projectPath),
  switchProject: (projectPath) => ipcRenderer.send("switch-project", projectPath),

  selectFolder: () => ipcRenderer.invoke("select-folder"),
  readDirectory: (dirPath) => ipcRenderer.invoke("read-directory", dirPath),
  readFile: (filePath) => ipcRenderer.invoke("read-file", filePath),
  saveFile: (filePath, content) => ipcRenderer.invoke("save-file", filePath, content),
  saveAllFiles: (files) => ipcRenderer.invoke("save-all-files", files),

  onMenuSave: (cb) => ipcRenderer.on("menu-save", () => cb()),
  onMenuSaveAll: (cb) => ipcRenderer.on("menu-save-all", () => cb()),
  onMenuFind: (cb) => ipcRenderer.on("menu-find", () => cb()),
  onMenuFindReplace: (cb) => ipcRenderer.on("menu-find-replace", () => cb()),
  onMenuDuplicateLine: (cb) => ipcRenderer.on("menu-duplicate-line", () => cb()),
  onMenuDeleteLine: (cb) => ipcRenderer.on("menu-delete-line", () => cb()),
  onMenuMoveLineUp: (cb) => ipcRenderer.on("menu-move-line-up", () => cb()),
  onMenuMoveLineDown: (cb) => ipcRenderer.on("menu-move-line-down", () => cb()),
  onMenuToggleWhitespace: (cb) => ipcRenderer.on("menu-toggle-whitespace", (_, val) => cb(val)),
  onMenuToggleWordwrap: (cb) => ipcRenderer.on("menu-toggle-wordwrap", (_, val) => cb(val)),
  onMenuSetTheme: (cb) => ipcRenderer.on("menu-set-theme", (_, theme) => cb(theme)),
  onMenuCustomTheme: (cb) => ipcRenderer.on("menu-custom-theme", () => cb()),
  onMenuAutoSaveSettings: (cb) => ipcRenderer.on("menu-auto-save-settings", () => cb()),
  onMenuToggleSpellcheck: (cb) => ipcRenderer.on("menu-toggle-spellcheck", (_, val) => cb(val)),
  onMenuSplitEditor: (cb) => ipcRenderer.on("menu-split-editor", () => cb()),
  onMenuCloseSplit: (cb) => ipcRenderer.on("menu-close-split", () => cb()),
  onMenuShowWelcome: (cb) => ipcRenderer.on("menu-show-welcome", () => cb()),

  onBeforeClose: (cb) => ipcRenderer.on("before-close", () => cb()),
  showUnsavedDialog: (unsavedFiles) => ipcRenderer.invoke("show-unsaved-dialog", unsavedFiles),
  allowClose: () => ipcRenderer.send("allow-close"),
  cancelClose: () => ipcRenderer.send("cancel-close"),

  saveSession: (data) => ipcRenderer.invoke("save-session", data),
  loadSession: () => ipcRenderer.invoke("load-session"),
  getUserDataPath: () => ipcRenderer.invoke("get-user-data-path"),

  deleteItem: (targetPath) => ipcRenderer.invoke("delete-item", targetPath),
  createItem: (parentDir, itemName, type, fileKind) =>
    ipcRenderer.invoke("create-item", parentDir, itemName, type, fileKind),
  copyItem: (sourcePath) => ipcRenderer.invoke("copy-item", sourcePath),
  pasteItem: (destDir) => ipcRenderer.invoke("paste-item", destDir),
  writeClipboardText: (text) => ipcRenderer.invoke("write-clipboard-text", text),

  checkSpelling: (text) => ipcRenderer.invoke("check-spelling", text),

  getPreferences: () => ipcRenderer.invoke("get-preferences"),
  listFactionWallpapers: (factionId) => ipcRenderer.invoke("list-faction-wallpapers", factionId),
  listCustomWallpapers: (folderPath) => ipcRenderer.invoke("list-custom-wallpapers", folderPath),
  pickCustomWallpaperFolder: () => ipcRenderer.invoke("pick-custom-wallpaper-folder"),
  pickProjectBackupDir: () => ipcRenderer.invoke("pick-project-backup-dir"),
  getProjectBackupStatus: () => ipcRenderer.invoke("get-project-backup-status"),
  runProjectBackupNow: () => ipcRenderer.invoke("run-project-backup-now"),
  rescheduleProjectBackup: () => ipcRenderer.invoke("reschedule-project-backup"),
  onProjectBackupDone: (cb) =>
    ipcRenderer.on("project-backup-done", (_, data) => cb(data)),
  onProjectBackupStarted: (cb) =>
    ipcRenderer.on("project-backup-started", (_, data) => cb(data)),
  onProjectRestoredFromBackup: (cb) =>
    ipcRenderer.on("project-restored-from-backup", (_, data) => cb(data)),
  savePreferences: (prefs) => ipcRenderer.invoke("save-preferences", prefs),
  syncWindowTheme: (themeId) => ipcRenderer.invoke("sync-window-theme", themeId),
  checkThemePersonality: (themeId) => ipcRenderer.invoke("check-theme-personality", themeId),
  usesInAppMenuBar: () => ipcRenderer.invoke("uses-in-app-menu-bar"),
  getAppSubmenu: (rootLabel) => ipcRenderer.invoke("get-app-submenu", rootLabel),
  runAppSubmenuAction: (rootLabel, index) =>
    ipcRenderer.invoke("run-app-submenu-action", rootLabel, index),
  onPreferencesChanged: (cb) =>
    ipcRenderer.on("preferences-changed", (_, prefs, meta) => cb(prefs, meta || {})),

  getArtFileUrl: (relPath) => ipcRenderer.invoke("get-art-file-url", relPath),
  getUserAvatarUrl: () => ipcRenderer.invoke("get-user-avatar-url"),
  getDefaultUserAvatarUrl: () => ipcRenderer.invoke("get-default-user-avatar-url"),
  pickUserAvatar: () => ipcRenderer.invoke("pick-user-avatar"),
  clearUserAvatar: () => ipcRenderer.invoke("clear-user-avatar"),
  onUserAvatarChanged: (cb) => ipcRenderer.on("user-avatar-changed", (_, data) => cb(data)),

  onSetProjectPath: (cb) => ipcRenderer.on("set-project-path", (_, projectPath) => cb(projectPath)),

  getProjectPath: () => ipcRenderer.invoke("get-project-path"),
  readProjectConfig: (projectPath) => ipcRenderer.invoke("read-project-config", projectPath),
  saveProjectConfig: (projectPath, config) => ipcRenderer.invoke("save-project-config", { projectPath, config }),
  selectSdkFolder: () => ipcRenderer.invoke("select-sdk-folder"),

  sendRendererReady: () => ipcRenderer.send("renderer-ready"),

  onBeforeSwitchProject: (cb) => ipcRenderer.on("before-switch-project", (_, newPath) => cb(newPath)),
  sendSwitchingReady: (newPath) => ipcRenderer.send("switching-ready", newPath),

  startBuild: (buildConfig) => ipcRenderer.send("start-build", buildConfig),
  onBuildLog: (cb) => ipcRenderer.on("build-log", (_, text) => cb(text)),
  onBuildWarningLog: (cb) => ipcRenderer.on("build-warning-log", (_, text) => cb(text)),
  onBuildErrorLog: (cb) => ipcRenderer.on("build-error-log", (_, text) => cb(text)),
  onBuildLogsClear: (cb) => ipcRenderer.on("build-logs-clear", () => cb()),
  onBuildFinished: (cb) => ipcRenderer.on("build-finished", (_, code) => cb(code)),
  sendBuildErrorClick: (filePath, line) => ipcRenderer.send("build-error-click", filePath, line),
  onOpenFileAtLine: (cb) => ipcRenderer.on("open-file-at-line", (_, filePath, line) => cb(filePath, line)),

  onShowOutputPanel: (cb) => ipcRenderer.on("show-output-panel", () => cb()),

  syncPanelStates: (states) => ipcRenderer.send("panel-sync-states", states),
  onPanelSetVisible: (cb) =>
    ipcRenderer.on("panel-set-visible", (_, payload) => cb(payload)),

  getFileStat: (filePath) => ipcRenderer.invoke("get-file-stat", filePath),
  readBinaryFile: (filePath) => ipcRenderer.invoke("read-binary-file", filePath),
  writeBinaryFile: (filePath, buffer) => ipcRenderer.invoke("write-binary-file", filePath, buffer),
  indexProjectFiles: (force) => ipcRenderer.invoke("index-project-files", !!force),
  searchProjectFiles: (query, limit) => ipcRenderer.invoke("search-project-files", query, limit),
  invalidateProjectFileIndex: () => ipcRenderer.invoke("invalidate-project-file-index"),
  resolveProjectFile: (filePath) => ipcRenderer.invoke("resolve-project-file", filePath),

  saveAIConfig: (config) => ipcRenderer.invoke("save-ai-config", config),
  getAIConfig: () => ipcRenderer.invoke("get-ai-config"),
  getAIModelPresets: () => ipcRenderer.invoke("get-ai-model-presets"),

  // 搜索配置 API
  getSearchConfig: () => ipcRenderer.invoke("get-search-config"),
  saveSearchConfig: (config) => ipcRenderer.invoke("save-search-config", config),

  openKnowledgePanel: () => ipcRenderer.send("open-knowledge-panel"),

  // Agent API
  agent: {
    sendChat: (payload) => ipcRenderer.send("agent:chat", payload),
    abortChat: () => ipcRenderer.send("agent:abort-chat"),
    onChatDone: (cb) => {
      const handler = (_, data) => cb(data);
      ipcRenderer.on("agent:chat-done", handler);
      return () => ipcRenderer.removeListener("agent:chat-done", handler);
    },
    sessions: {
      list: () => ipcRenderer.invoke("agent:sessions:list"),
      get: (sessionId) => ipcRenderer.invoke("agent:sessions:get", sessionId),
      create: (title) => ipcRenderer.invoke("agent:sessions:create", title),
      delete: (sessionId) => ipcRenderer.invoke("agent:sessions:delete", sessionId),
      setActive: (sessionId) => ipcRenderer.invoke("agent:sessions:set-active", sessionId),
      clear: (sessionId) => ipcRenderer.invoke("agent:sessions:clear", sessionId),
    },
    setXmlFormatMode: (payload) => ipcRenderer.invoke("agent:set-xml-format-mode", payload),
    scanProjectLearn: (payload) => ipcRenderer.invoke("agent:scan-project-learn", payload),
    ensureProjectFormatLearned: (payload) =>
      ipcRenderer.invoke("agent:ensure-project-format-learned", payload),
    onFormatChoice: (cb) => {
      const handler = (_, data) => cb(data);
      ipcRenderer.on("agent:format-choice", handler);
      return () => ipcRenderer.removeListener("agent:format-choice", handler);
    },
    onProjectLearnRequired: (cb) => {
      const handler = (_, data) => cb(data);
      ipcRenderer.on("agent:project-learn-required", handler);
      return () => ipcRenderer.removeListener("agent:project-learn-required", handler);
    },
    onResponse: (cb) => {
      const handler = (_, text) => cb(text);
      ipcRenderer.on("agent:response", handler);
      return () => ipcRenderer.removeListener("agent:response", handler);
    },
    onThinkingBegin: (cb) => {
      const handler = () => cb();
      ipcRenderer.on("agent:thinking-begin", handler);
      return () => ipcRenderer.removeListener("agent:thinking-begin", handler);
    },
    onThinking: (cb) => {
      const handler = (_, data) => cb(data);
      ipcRenderer.on("agent:thinking", handler);
      return () => ipcRenderer.removeListener("agent:thinking", handler);
    },
    onThinkingDone: (cb) => {
      const handler = (_, data) => cb(data);
      ipcRenderer.on("agent:thinking-done", handler);
      return () => ipcRenderer.removeListener("agent:thinking-done", handler);
    },
    onStatus: (cb) => {
      const handler = (_, text) => cb(text);
      ipcRenderer.on("agent:status", handler);
      return () => ipcRenderer.removeListener("agent:status", handler);
    },
    callTool: (toolName, args) => ipcRenderer.invoke("agent:tool-call", toolName, args || {}),
    onRefreshFile: (cb) => {
      const handler = (_, relativePath) => cb(relativePath);
      ipcRenderer.on("agent:refresh-file", handler);
      return () => ipcRenderer.removeListener("agent:refresh-file", handler);
    },
    onOpenFile: (cb) => {
      const handler = (_, data) => cb(data);
      ipcRenderer.on("agent:open-file", handler);
      return () => ipcRenderer.removeListener("agent:open-file", handler);
    },
    onStreamWrite: (cb) => {
      const handler = (_, data) => cb(data);
      ipcRenderer.on("agent:stream-write", handler);
      return () => ipcRenderer.removeListener("agent:stream-write", handler);
    },
    confirmCorrect: (executionId) => ipcRenderer.send("agent:confirm-correct", executionId),
    confirmAction: (proposalId, approved) =>
      ipcRenderer.send("agent:confirm-action", { proposalId, approved }),
    runFollowUp: (payload) => ipcRenderer.send("agent:follow-up-action", payload),
    onActionProposal: (cb) => {
      const handler = (_, data) => cb(data);
      ipcRenderer.on("agent:action-proposal", handler);
      return () => ipcRenderer.removeListener("agent:action-proposal", handler);
    },
    onFollowUpProposal: (cb) => {
      const handler = (_, data) => cb(data);
      ipcRenderer.on("agent:follow-up-proposal", handler);
      return () => ipcRenderer.removeListener("agent:follow-up-proposal", handler);
    },
    onAssetWizardStep: (cb) => {
      const handler = (_, data) => cb(data);
      ipcRenderer.on("agent:asset-wizard-step", handler);
      return () => ipcRenderer.removeListener("agent:asset-wizard-step", handler);
    },
    respondAssetWizard: (payload) => ipcRenderer.send("agent:asset-wizard-respond", payload),
    pickAssetFile: (options) => ipcRenderer.invoke("agent:pick-asset-file", options),
  },

  // 知识库 API
  knowledge: {
    getAll: () => ipcRenderer.invoke("knowledge:get-all"),
    delete: (id) => ipcRenderer.invoke("knowledge:delete", id),
    clear: () => ipcRenderer.invoke("knowledge:clear"),
    import: (sourcePath) => ipcRenderer.invoke("knowledge:import", sourcePath),
    export: (destPath) => ipcRenderer.invoke("knowledge:export", destPath),
    getStats: () => ipcRenderer.invoke("knowledge:stats"),
    rebuild: () => ipcRenderer.invoke("knowledge:rebuild"),
  },

  skills: {
    list: () => ipcRenderer.invoke("skills:list"),
    pickAndInstall: () => ipcRenderer.invoke("skills:pick-and-install"),
    installPath: (sourcePath) => ipcRenderer.invoke("skills:install-path", sourcePath),
    installUrl: (url) => ipcRenderer.invoke("skills:install-url", url),
    uninstall: (id) => ipcRenderer.invoke("skills:uninstall", id),
    setEnabled: (id, enabled) => ipcRenderer.invoke("skills:set-enabled", id, enabled),
  },

  launchSdkTool: (toolKey, filePath) => ipcRenderer.invoke("launch-sdk-tool", toolKey, filePath),
  getSdkToolStatus: () => ipcRenderer.invoke("get-sdk-tool-status"),
  getDefaultSdkToolsPaths: () => ipcRenderer.invoke("get-default-sdk-tools-paths"),
});