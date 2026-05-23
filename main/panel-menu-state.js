// main/panel-menu-state.js —— 「窗口」菜单勾选状态（与渲染进程面板联动）

let panelStates = {
  fileTree: true,
  properties: true,
  output: false,
};

let rebuildMenuFn = null;

function setRebuildMenu(fn) {
  rebuildMenuFn = fn;
}

function getPanelStates() {
  return { ...panelStates };
}

function setPanelStates(states) {
  if (!states || typeof states !== 'object') return;
  if (typeof states.fileTree === 'boolean') panelStates.fileTree = states.fileTree;
  if (typeof states.properties === 'boolean') panelStates.properties = states.properties;
  if (typeof states.output === 'boolean') panelStates.output = states.output;
  if (rebuildMenuFn) rebuildMenuFn();
}

function createWindowMenuItems(getMainWindow) {
  const s = getPanelStates();
  return [
    {
      label: '文件树',
      type: 'checkbox',
      checked: s.fileTree,
      click: (menuItem, bw) => {
        const win = bw && !bw.isDestroyed() ? bw : getMainWindow();
        if (win) {
          win.webContents.send('panel-set-visible', {
            panel: 'fileTree',
            visible: menuItem.checked,
          });
        }
      },
    },
    {
      label: '文件属性',
      type: 'checkbox',
      checked: s.properties,
      click: (menuItem, bw) => {
        const win = bw && !bw.isDestroyed() ? bw : getMainWindow();
        if (win) {
          win.webContents.send('panel-set-visible', {
            panel: 'properties',
            visible: menuItem.checked,
          });
        }
      },
    },
    {
      label: '输出',
      type: 'checkbox',
      checked: s.output,
      click: (menuItem, bw) => {
        const win = bw && !bw.isDestroyed() ? bw : getMainWindow();
        if (win) {
          win.webContents.send('panel-set-visible', {
            panel: 'output',
            visible: menuItem.checked,
          });
        }
      },
    },
  ];
}

module.exports = {
  setRebuildMenu,
  getPanelStates,
  setPanelStates,
  createWindowMenuItems,
};
