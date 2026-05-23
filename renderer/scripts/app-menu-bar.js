// renderer/scripts/app-menu-bar.js —— Windows 下页面内菜单栏 + 主题下拉

(function initAppMenuBar(global) {
  const ROOT_LABELS = ['文件', '窗口', '编译', '编辑', '视图', '帮助', '设置'];
  let activeDropdown = null;
  let activeRootLabel = null;
  let suppressCloseOnce = false;

  function closeDropdown() {
    if (activeDropdown) {
      activeDropdown.remove();
      activeDropdown = null;
      activeRootLabel = null;
    }
  }

  function openDropdown(rootLabel, anchorBtn) {
    closeDropdown();
    if (!window.api?.getAppSubmenu) return;

    window.api.getAppSubmenu(rootLabel).then((res) => {
      if (!res?.success || !res.items?.length) return;

      const rect = anchorBtn.getBoundingClientRect();
      const menu = document.createElement('div');
      menu.className = 'app-menu-dropdown';
      menu.setAttribute('role', 'menu');
      menu.style.left = `${Math.round(rect.left)}px`;
      menu.style.top = `${Math.round(rect.bottom)}px`;

      for (const entry of res.items) {
        if (entry.type === 'separator') {
          const sep = document.createElement('div');
          sep.className = 'app-menu-dropdown-sep';
          menu.appendChild(sep);
          continue;
        }

        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'app-menu-dropdown-item';
        row.setAttribute('role', 'menuitem');
        if (!entry.enabled) {
          row.disabled = true;
          row.classList.add('disabled');
        }
        if (entry.type === 'checkbox') {
          row.classList.add('checkbox');
          if (entry.checked) row.classList.add('checked');
        }

        const labelSpan = document.createElement('span');
        labelSpan.className = 'app-menu-dropdown-label';
        labelSpan.textContent = entry.label;
        row.appendChild(labelSpan);

        if (entry.accelerator) {
          const acc = document.createElement('span');
          acc.className = 'app-menu-dropdown-accel';
          acc.textContent = entry.accelerator.replace('CmdOrCtrl', 'Ctrl');
          row.appendChild(acc);
        }

        row.addEventListener('click', (e) => {
          e.stopPropagation();
          if (row.disabled) return;
          closeDropdown();
          window.api.runAppSubmenuAction(rootLabel, entry.index).catch(() => {});
        });
        menu.appendChild(row);
      }

      document.body.appendChild(menu);
      activeDropdown = menu;
      activeRootLabel = rootLabel;

      requestAnimationFrame(() => {
        const r = menu.getBoundingClientRect();
        if (r.right > window.innerWidth - 4) {
          menu.style.left = `${Math.max(4, window.innerWidth - r.width - 4)}px`;
        }
        if (r.bottom > window.innerHeight - 4) {
          menu.style.top = `${Math.max(4, rect.top - r.height)}px`;
        }
      });
    });
  }

  async function initAppMenuBar() {
    if (!global.window?.api?.usesInAppMenuBar) return;
    let use = false;
    try {
      use = await window.api.usesInAppMenuBar();
    } catch (e) {
      return;
    }
    if (!use) return;

    document.body.classList.add('win-overlay-chrome');
    const bar = document.getElementById('app-menu-bar');
    if (!bar) return;

    bar.innerHTML = '';
    for (const label of ROOT_LABELS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'app-menu-item';
      btn.textContent = label;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        suppressCloseOnce = true;
        setTimeout(() => {
          suppressCloseOnce = false;
        }, 0);
        if (activeRootLabel === label && activeDropdown) {
          closeDropdown();
          return;
        }
        openDropdown(label, btn);
      });
      bar.appendChild(btn);
    }

    document.addEventListener('click', (e) => {
      if (suppressCloseOnce) return;
      if (e.target.closest('.app-menu-dropdown') || e.target.closest('#app-menu-bar')) return;
      closeDropdown();
    });
    window.addEventListener('blur', () => closeDropdown());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeDropdown();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initAppMenuBar());
  } else {
    initAppMenuBar();
  }

  global.initAppMenuBar = initAppMenuBar;
  global.closeAppMenuDropdown = closeDropdown;
})(typeof window !== 'undefined' ? window : global);
