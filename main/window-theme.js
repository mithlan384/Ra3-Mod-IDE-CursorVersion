// main/window-theme.js —— 同步系统标题栏/窗口背景与 IDE 主题

const os = require('os');
const { BrowserWindow, nativeTheme } = require('electron');

const CHROME = {
  'vs-dark': {
    background: '#121212',
    native: 'dark',
    overlay: { color: '#1e1e1e', symbolColor: '#cccccc', height: 32 },
  },
  vs: {
    background: '#e8e8e8',
    native: 'light',
    overlay: { color: '#f3f3f3', symbolColor: '#1a1a1a', height: 32 },
  },
  'hc-black': {
    background: '#000000',
    native: 'dark',
    overlay: { color: '#000000', symbolColor: '#ffffff', height: 32 },
  },
  allied: {
    background: '#0a1628',
    native: 'dark',
    overlay: { color: '#0f2744', symbolColor: '#c8ddf5', height: 32 },
  },
  soviet: {
    background: '#1a0808',
    native: 'dark',
    overlay: { color: '#2a0c0c', symbolColor: '#f0d8d8', height: 32 },
  },
  empire: {
    background: '#141008',
    native: 'dark',
    overlay: { color: '#221608', symbolColor: '#f5e6d0', height: 32 },
  },
};

/** 使用 titleBarOverlay 的主窗口（仅 Windows） */
let overlayMainWindow = null;

function normalizeThemeId(themeId) {
  if (CHROME[themeId]) return themeId;
  return 'vs-dark';
}

/** Windows 10 1809+ / Win11 支持 Window Controls Overlay */
function supportsWinTitleBarOverlay() {
  if (process.platform !== 'win32') return false;
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(os.release() || '');
  if (!m) return true;
  const build = parseInt(m[3], 10);
  return build >= 17763;
}

function getChromeConfig(themeId) {
  return CHROME[normalizeThemeId(themeId)] || CHROME['vs-dark'];
}

/** 主窗口 BrowserWindow 构造参数（含可选标题栏着色） */
function getMainWindowConstructorOptions(themeId) {
  const cfg = getChromeConfig(themeId);
  const opts = {
    backgroundColor: cfg.background,
    title: 'RA3 MOD IDE',
    autoHideMenuBar: false,
  };
  if (supportsWinTitleBarOverlay()) {
    opts.titleBarStyle = 'hidden';
    opts.titleBarOverlay = { ...cfg.overlay };
    opts.thickFrame = true;
  }
  return opts;
}

function registerOverlayMainWindow(win) {
  overlayMainWindow = win;
}

/** 主窗口是否使用页面内菜单栏（Windows + titleBarOverlay） */
function usesInAppMenuBar() {
  return supportsWinTitleBarOverlay();
}

const TITLE_BAR_HEIGHT = 32;
const MENU_BAR_HEIGHT = 28;

function applyTitleBarOverlay(win, cfg) {
  if (!win || win.isDestroyed()) return;
  if (process.platform !== 'win32' || !supportsWinTitleBarOverlay()) return;
  if (win !== overlayMainWindow) return;
  if (typeof win.setTitleBarOverlay !== 'function') return;
  try {
    win.setTitleBarOverlay(cfg.overlay);
  } catch (e) {
    console.warn('[window-theme] setTitleBarOverlay:', e.message);
  }
}

function applyWindowTheme(themeId) {
  const cfg = getChromeConfig(themeId);

  try {
    nativeTheme.themeSource = cfg.native;
  } catch (e) {
    console.warn('[window-theme] nativeTheme:', e.message);
  }

  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    try {
      win.setBackgroundColor(cfg.background);
      applyTitleBarOverlay(win, cfg);
    } catch (e) {
      console.warn('[window-theme] window apply failed:', e.message);
    }
  }
}

module.exports = {
  applyWindowTheme,
  normalizeThemeId,
  CHROME,
  getMainWindowConstructorOptions,
  registerOverlayMainWindow,
  supportsWinTitleBarOverlay,
  usesInAppMenuBar,
  TITLE_BAR_HEIGHT,
  MENU_BAR_HEIGHT,
};
