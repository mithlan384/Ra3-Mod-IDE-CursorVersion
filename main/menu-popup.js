// main/menu-popup.js —— 页面内主题下拉菜单（替代系统 Menu.popup 的定位/配色问题）

const { createMenuTemplate } = require('./menu-template');
const { getPanelStates } = require('./panel-menu-state');

let getMainWindow = () => null;
let getProjectWindow = () => null;
let setProjectWindow = () => {};

function configureMenuPopup(opts = {}) {
  if (opts.getMainWindow) getMainWindow = opts.getMainWindow;
  if (opts.getProjectWindow) getProjectWindow = opts.getProjectWindow;
  if (opts.setProjectWindow) setProjectWindow = opts.setProjectWindow;
}

function getMenuTemplate() {
  return createMenuTemplate(getMainWindow, getProjectWindow, setProjectWindow);
}

function serializeSubmenu(submenu) {
  if (!submenu?.length) return [];
  return submenu.map((item, index) => {
    if (item.type === 'separator') {
      return { type: 'separator', index };
    }
    return {
      type: item.type === 'checkbox' ? 'checkbox' : 'normal',
      label: item.label || '',
      accelerator: item.accelerator || '',
      checked: !!item.checked,
      enabled: item.enabled !== false,
      role: item.role || null,
      index,
    };
  });
}

function getAppSubmenu(rootLabel) {
  const root = getMenuTemplate().find((m) => m.label === rootLabel);
  if (!root?.submenu?.length) {
    return { success: false, error: '未找到菜单', items: [] };
  }
  return { success: true, items: serializeSubmenu(root.submenu) };
}

function runRole(win, role) {
  const wc = win.webContents;
  if (!wc || wc.isDestroyed()) return;
  const map = {
    undo: () => wc.undo?.(),
    redo: () => wc.redo?.(),
    cut: () => wc.cut?.(),
    copy: () => wc.copy?.(),
    paste: () => wc.paste?.(),
    selectAll: () => wc.selectAll?.(),
  };
  if (map[role]) map[role]();
}

function runAppSubmenuAction(rootLabel, index) {
  const template = getMenuTemplate();
  const root = template.find((m) => m.label === rootLabel);
  if (!root?.submenu?.[index]) {
    return { success: false, error: '无效项' };
  }
  const item = root.submenu[index];
  const win = getMainWindow();
  if (!win || win.isDestroyed()) {
    return { success: false, error: '主窗口无效' };
  }

  try {
    if (item.role) {
      runRole(win, item.role);
      return { success: true };
    }
    if (typeof item.click === 'function') {
      if (item.type === 'checkbox') {
        item.click({ checked: !item.checked }, win);
      } else {
        item.click({}, win);
      }
      return { success: true };
    }
    return { success: false, error: '无法执行' };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

module.exports = {
  configureMenuPopup,
  getAppSubmenu,
  runAppSubmenuAction,
};
