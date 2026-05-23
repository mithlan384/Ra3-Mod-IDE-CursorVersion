// panel-layout.js —— 文件树 / 属性 / 输出面板显示与「窗口」菜单同步



const PANELS = {

  fileTree: {

    panel: () => document.getElementById('sidebar'),

    resizer: () => document.querySelector('.resizer[data-resizer="left"]'),

    toggleGlyph: () => document.getElementById('sidebar-toggle'),

    showDisplay: 'flex',

  },

  properties: {

    panel: () => document.getElementById('right-panel'),

    resizer: () => document.querySelector('.resizer[data-resizer="right"]'),

    toggleGlyph: () => document.getElementById('properties-toggle'),

    showDisplay: 'block',

  },

  output: {

    panel: () => document.getElementById('output-panel'),

    resizer: () => document.getElementById('output-resizer'),

    toggleGlyph: null,

    showDisplay: 'block',

  },

};



const PANEL_CLOSE_BTN_MAP = {

  'sidebar-close-btn': 'fileTree',

  'properties-close-btn': 'properties',

  'output-close-btn': 'output',

};



function isVisible(panelId) {

  const cfg = PANELS[panelId];

  if (!cfg) return false;

  const el = cfg.panel();

  if (!el) return false;

  const display = el.style.display || getComputedStyle(el).display;

  return display !== 'none';

}



function updateToggleGlyph(panelId, visible) {

  const cfg = PANELS[panelId];

  const glyph = cfg?.toggleGlyph?.();

  if (!glyph) return;

  if (panelId === 'fileTree') {

    glyph.textContent = visible ? '◀' : '▶';

  } else if (panelId === 'properties') {

    glyph.textContent = visible ? '▶' : '◀';

  }

}



function layoutEditor() {

  if (typeof editor !== 'undefined' && editor) editor.layout();

  if (typeof splitEditor !== 'undefined' && splitEditor) splitEditor.layout();

}



function setVisible(panelId, visible, options = {}) {

  const cfg = PANELS[panelId];

  if (!cfg) return;

  const el = cfg.panel();

  const resizer = cfg.resizer();

  if (!el) return;



  if (visible) {

    el.style.display = cfg.showDisplay;

    if (resizer) {
      resizer.style.display = 'flex';
      resizer.classList.remove('panel-rail-collapsed');
    }

    if (panelId === 'output' && !el.style.height) {

      el.style.height = '180px';

    }

  } else {

    el.style.display = 'none';

    if (resizer) {

      if (panelId === 'fileTree' || panelId === 'properties') {

        /* 收起后保留窄条与 ▶/◀，否则 toggle 消失无法再次展开 */
        resizer.style.display = 'flex';
        resizer.classList.add('panel-rail-collapsed');

      } else {

        resizer.style.display = 'none';

      }

    }

  }



  updateToggleGlyph(panelId, visible);

  if (!options.skipLayout) layoutEditor();

  if (!options.skipMenuSync && window.api?.syncPanelStates) {

    window.api.syncPanelStates(getStates());

  }

}



function show(panelId) {

  setVisible(panelId, true);

}



function hide(panelId) {

  setVisible(panelId, false);

}



function toggle(panelId) {

  setVisible(panelId, !isVisible(panelId));

}



function getStates() {

  return {

    fileTree: isVisible('fileTree'),

    properties: isVisible('properties'),

    output: isVisible('output'),

  };

}



function applyStates(states) {

  if (!states) return;

  ['fileTree', 'properties', 'output'].forEach((id) => {

    if (typeof states[id] === 'boolean') {

      setVisible(id, states[id], { skipMenuSync: true });

    }

  });

  if (window.api?.syncPanelStates) {

    window.api.syncPanelStates(getStates());

  }

}



let panelLayoutInited = false;



function eventTargetElement(target) {

  if (!target) return null;

  if (target.nodeType === Node.ELEMENT_NODE) return target;

  if (target.nodeType === Node.TEXT_NODE) return target.parentElement;

  return null;

}



function panelIdFromCloseTarget(target) {

  const el = eventTargetElement(target);

  const btn = el?.closest?.('.panel-close-btn');

  if (!btn?.id) return null;

  return PANEL_CLOSE_BTN_MAP[btn.id] || null;

}



function wirePanelCloseButtons() {

  for (const [btnId, panelId] of Object.entries(PANEL_CLOSE_BTN_MAP)) {

    const btn = document.getElementById(btnId);

    if (!btn || btn.dataset.panelCloseBound === '1') continue;

    btn.dataset.panelCloseBound = '1';



    const runClose = (e) => {

      if (e) {

        e.preventDefault();

        e.stopPropagation();

      }

      hide(panelId);

      return false;

    };



    btn.addEventListener('click', runClose);

    btn.addEventListener('pointerup', runClose);

  }



  const chromeSelectors = ['.sidebar-panel-chrome', '#right-panel > .panel-chrome', '#output-header'];

  for (const sel of chromeSelectors) {

    document.querySelectorAll(sel).forEach((chrome) => {

      if (chrome.dataset.panelChromeCloseBound === '1') return;

      chrome.dataset.panelChromeCloseBound = '1';

      chrome.addEventListener('click', (e) => {

        const panelId = panelIdFromCloseTarget(e.target);

        if (!panelId) return;

        e.preventDefault();

        e.stopPropagation();

        hide(panelId);

      });

    });

  }

}



function initPanelLayout() {

  if (panelLayoutInited) return;

  panelLayoutInited = true;



  wirePanelCloseButtons();



  const leftResizerToggle = document.getElementById('sidebar-toggle');

  if (leftResizerToggle) {

    leftResizerToggle.onclick = () => toggle('fileTree');

  }

  const rightResizerToggle = document.getElementById('properties-toggle');

  if (rightResizerToggle) {

    rightResizerToggle.onclick = () => toggle('properties');

  }



  if (window.api) {

    window.api.onPanelSetVisible((payload) => {

      const panelId = payload?.panel;

      if (PANELS[panelId] && typeof payload.visible === 'boolean') {

        setVisible(panelId, payload.visible);

      }

    });

  }



  applyStates({ fileTree: true, properties: true, output: false });

}



/** 供外部 / 遗留 onclick 调用 */

function closeIdePanel(panelId, ev) {

  if (ev) {

    ev.preventDefault();

    ev.stopPropagation();

  }

  if (PANELS[panelId]) hide(panelId);

}



window.PanelLayout = {

  isVisible,

  show,

  hide,

  toggle,

  getStates,

  applyStates,

  initPanelLayout,

  close: closeIdePanel,

};



window.closeIdePanel = closeIdePanel;



if (document.readyState === 'loading') {

  document.addEventListener('DOMContentLoaded', initPanelLayout);

} else {

  initPanelLayout();

}


