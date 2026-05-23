// renderer/scripts/app-theme.js —— 全局界面主题（与 Monaco 编辑器主题同步）

(function initAppThemeModule(global) {
  const DISPLAY_NAMES = {
    'vs-dark': 'Dark',
    vs: 'Light',
    'hc-black': '高对比度',
    allied: '盟军',
    soviet: '苏联',
    empire: '帝国',
  };

  let currentThemeId = 'vs-dark';

  let pendingTheme = 'vs-dark';

  function isFactionTheme(themeId) {
    return global.FactionTheme && global.FactionTheme.isFactionTheme(themeId);
  }

  function normalizeAppTheme(monacoTheme) {
    if (isFactionTheme(monacoTheme)) return 'vs-dark';
    if (monacoTheme === 'vs' || monacoTheme === 'hc-black') return monacoTheme;
    return 'vs-dark';
  }

  function resolveMonacoTheme(themeId) {
    if (isFactionTheme(themeId)) {
      const f = global.FactionTheme.getFaction(themeId);
      return f?.monacoTheme || f?.monacoBase || 'vs-dark';
    }
    return themeId || 'vs-dark';
  }

  function getThemeDisplayName(themeId) {
    const id = String(themeId || 'vs-dark');
    if (DISPLAY_NAMES[id]) return DISPLAY_NAMES[id];
    if (id.startsWith('custom-')) return '自定义';
    return DISPLAY_NAMES['vs-dark'];
  }

  /** Monaco 必须用 setTheme；updateOptions({ theme }) 在多数版本无效 */
  function applyMonacoTheme(themeId) {
    const id = themeId || 'vs-dark';

    if (global.monaco?.editor?.setTheme) {
      global.monaco.editor.setTheme(id);
    }

    if (global.editor) {
      try {
        const dom = global.editor.getDomNode();
        if (dom) dom.style.backgroundColor = '';
      } catch (e) {}
    }
    if (global.splitEditor) {
      try {
        if (global.splitEditor.getOriginalEditor) {
          global.monaco?.editor?.setTheme?.(id);
        }
      } catch (e) {}
    }
  }

  function applyAppTheme(themeId, options = {}) {
    const id = themeId || 'vs-dark';
    currentThemeId = id;
    const chromeTheme = normalizeAppTheme(id);
    const monacoTheme = resolveMonacoTheme(id);
    pendingTheme = id;

    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-app-theme', chromeTheme);
      if (global.FactionTheme && !isFactionTheme(id)) {
        global.FactionTheme.applyFactionTheme(null);
      }
    }
    if (options.monaco !== false) {
      if (isFactionTheme(id) && global.FactionTheme?.defineMonacoFactionThemes) {
        global.FactionTheme.defineMonacoFactionThemes();
      }
      applyMonacoTheme(monacoTheme);
    }
    if (typeof global.updateStatusBar === 'function') {
      global.updateStatusBar();
    }
    if (global.window?.api?.syncWindowTheme) {
      window.api.syncWindowTheme(id).catch(() => {});
    }

    if (!options.skipWallpaper && global.IdeWallpaper?.syncWithTheme) {
      global.IdeWallpaper.syncWithTheme(id).catch((e) =>
        console.warn('[app-theme] wallpaper:', e.message)
      );
    } else if (!options.skipWallpaper && !isFactionTheme(id) && global.IdeWallpaper?.stop) {
      global.IdeWallpaper.stop();
    }

    if (isFactionTheme(id) && global.FactionTheme) {
      global.FactionTheme.applyFactionTheme(id, {
        checkPersonality: options.checkPersonality !== false,
      });
      if (
        !options.skipWallpaper &&
        typeof document !== 'undefined' &&
        document.documentElement.getAttribute('data-ide-wallpaper') === 'on' &&
        global.FactionTheme.applyMonacoEditorGlass
      ) {
        global.FactionTheme.applyMonacoEditorGlass(true, id);
      }
    }
  }

  function getCurrentThemeId() {
    return currentThemeId;
  }

  /** editor-core 在 Monaco 加载完成后调用 */
  function onMonacoReady() {
    applyAppTheme(pendingTheme, { monaco: true });
  }

  async function initAppThemeFromPreferences() {
    let theme = 'vs-dark';
    try {
      if (global.window?.api?.getPreferences) {
        const prefs = await window.api.getPreferences();
        if (prefs?.theme) theme = prefs.theme;
      }
    } catch (e) {}
    pendingTheme = theme;
    applyAppTheme(theme, {
      monaco: !!global.editor,
      checkPersonality: false,
    });
  }

  function wirePreferencesListener() {
    if (!global.window?.api?.onPreferencesChanged) return;
    window.api.onPreferencesChanged(async (prefs, meta = {}) => {
      if (meta.runThemeTransition && global.IdeWallpaper?.runThemeTransition) {
        if (prefs?.theme) {
          applyAppTheme(prefs.theme, { checkPersonality: true, skipWallpaper: true });
        }
        await global.IdeWallpaper.runThemeTransition(prefs?.theme || getCurrentThemeId(), {
          prefs,
        });
      } else {
        if (prefs?.theme) {
          applyAppTheme(prefs.theme, { checkPersonality: true });
        }
        if (global.IdeWallpaper?.onPreferencesChanged) {
          await global.IdeWallpaper.onPreferencesChanged(prefs, meta);
        }
      }
      if (typeof global.setupAutoSave === 'function' && typeof prefs?.autoSaveInterval === 'number') {
        global.setupAutoSave(prefs.autoSaveInterval);
      }
    });
  }

  global.AppTheme = {
    applyAppTheme,
    initAppThemeFromPreferences,
    wirePreferencesListener,
    onMonacoReady,
    normalizeAppTheme,
    getThemeDisplayName,
    getCurrentThemeId,
    isFactionTheme,
  };
})(typeof window !== 'undefined' ? window : global);
