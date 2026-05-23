// renderer/scripts/faction-theme.js —— 盟军 / 苏联 / 帝国 IDE 主题

(function initFactionThemeModule(global) {
  const FACTION_IDS = ['allied', 'soviet', 'empire'];

  const FACTIONS = {
    allied: {
      id: 'allied',
      label: '盟军',
      monacoTheme: 'ra3-allied',
      monacoBase: 'vs-dark',
      personality: 'allied',
      wallpaper: 'Allied/Pictures/allied-wallpaper.jpg',
      welcomeBg: 'RA3.jpg',
      logo: 'Allied/Pictures/allied-wallpaper.jpg',
      logoPos: '50% 38%',
      logoSize: '360%',
      avatar: 'Allied/ui/ChatGPT Image 2026年5月22日 10_10_39.png',
      aiTitle: '盟军指挥部 · Lt. Eva McKenna',
      aiSubtitle: '情报官待命',
      emptyTitle: 'Good day, Commander',
    },
    soviet: {
      id: 'soviet',
      label: '苏联',
      monacoTheme: 'ra3-soviet',
      monacoBase: 'vs-dark',
      personality: 'soviet',
      wallpaper: 'Soviet/Pictures/soviet-wallpaper.jpg',
      welcomeBg: 'RA3.jpg',
      logo: 'Soviet/Pictures/soviet-wallpaper.jpg',
      logoPos: '50% 38%',
      logoSize: '360%',
      avatar: 'Soviet/ui/ChatGPT Image 2026年5月22日 10_04_40.png',
      aiTitle: '苏军指挥部 · Dasha Fedorovich',
      aiSubtitle: '情报官待命',
      emptyTitle: '同志，红警3 MOD 助手待命',
    },
    empire: {
      id: 'empire',
      label: '帝国',
      monacoTheme: 'ra3-empire',
      monacoBase: 'vs-dark',
      personality: 'empire',
      wallpaper: 'Empire/Pictures/empire-wallpaper.jpg',
      welcomeBg: 'RA3.jpg',
      logo: 'Empire/Pictures/empire-wallpaper.jpg',
      logoPos: '50% 38%',
      logoSize: '360%',
      avatar: 'Empire/ui/ChatGPT Image 2026年5月21日 17_19_00.png',
      aiTitle: '帝国本部 · Suki Toyama',
      aiSubtitle: '情报官待命',
      emptyTitle: '将军阁下，MOD 开发助手恭候差遣',
    },
  };

  let monacoThemesDefined = false;
  let monacoWallpaperGlass = false;
  let monacoLastDefinedGlass = null;

  const MONACO_EDITOR_COLORS = {
    allied: {
      editor: '#081428',
      editorGlass: '#08142800',
      scroll: '#2e7be888',
      scrollHover: '#4a9af0aa',
      minimap: '#0a2040aa',
    },
    soviet: {
      editor: '#321418',
      editorGlass: '#32141800',
      scroll: '#d8383888',
      scrollHover: '#f05050aa',
      minimap: '#4a1c22aa',
    },
    empire: {
      editor: '#302010',
      editorGlass: '#30201000',
      scroll: '#f0902888',
      scrollHover: '#ffb040aa',
      minimap: '#3a2814aa',
    },
  };

  function artUrl(rel) {
    if (!rel) return '';
    const parts = String(rel).replace(/\\/g, '/').split('/');
    return `ra3-art://${parts.map((p) => encodeURIComponent(p)).join('/')}`;
  }

  function isFactionTheme(themeId) {
    return FACTION_IDS.includes(themeId);
  }

  function getFaction(themeId) {
    return FACTIONS[themeId] || null;
  }

  function getFactionPersonality(themeId) {
    const f = getFaction(themeId);
    return f ? f.personality : 'default';
  }

  function defineMonacoFactionThemes(force) {
    if (!global.monaco?.editor?.defineTheme) return;
    const glass =
      monacoWallpaperGlass ||
      (typeof document !== 'undefined' &&
        document.documentElement.getAttribute('data-ide-wallpaper') === 'on');
    if (monacoThemesDefined && !force && monacoLastDefinedGlass === glass) return;
    monacoThemesDefined = true;
    monacoLastDefinedGlass = glass;
    for (const [id, c] of Object.entries(MONACO_EDITOR_COLORS)) {
      const editorBg = glass ? c.editorGlass : c.editor;
      const colors = {
          'editor.background': editorBg,
          'scrollbar.shadow': '#00000055',
          'scrollbarSlider.background': c.scroll,
          'scrollbarSlider.hoverBackground': c.scrollHover,
          'scrollbarSlider.activeBackground': c.scrollHover,
          'minimap.background': c.minimap,
          'editorOverviewRuler.background': c.minimap,
        };
      if (glass) colors['editor.lineHighlightBackground'] = '#ffffff0a';
      monaco.editor.defineTheme(`ra3-${id}`, {
        base: 'vs-dark',
        inherit: true,
        rules: [],
        colors,
      });
    }
  }

  function applyMonacoEditorGlass(enabled, factionId) {
    monacoWallpaperGlass = !!enabled;
    defineMonacoFactionThemes(true);
    const id =
      factionId ||
      (typeof document !== 'undefined' &&
        document.documentElement.getAttribute('data-faction-theme')) ||
      null;
    if (id && getFaction(id)) applyMonacoFactionTheme(id);
  }

  function applyMonacoFactionTheme(factionId) {
    const glass =
      monacoWallpaperGlass ||
      (typeof document !== 'undefined' &&
        document.documentElement.getAttribute('data-ide-wallpaper') === 'on');
    defineMonacoFactionThemes(glass);
    const f = getFaction(factionId);
    if (!f || !global.monaco?.editor?.setTheme) return;
    monaco.editor.setTheme(f.monacoTheme);
  }

  function ensureBgLayer() {
    let layer = document.getElementById('faction-bg-layer');
    const main = document.getElementById('main-area');
    if (!main) return null;
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'faction-bg-layer';
      layer.setAttribute('aria-hidden', 'true');
      main.insertBefore(layer, main.firstChild);
    }
    return layer;
  }

  function applyFactionDom(faction) {
    const root = document.documentElement;
    if (!faction) {
      root.removeAttribute('data-faction-theme');
      root.style.removeProperty('--faction-wallpaper');
      const layer = document.getElementById('faction-bg-layer');
      if (layer) layer.remove();
      updateAiChrome(null);
      hidePersonalityMismatch();
      return;
    }

    root.setAttribute('data-faction-theme', faction.id);
    root.style.setProperty('--faction-logo', `url("${artUrl(faction.logo)}")`);
    root.style.setProperty('--faction-logo-pos', faction.logoPos);
    root.style.setProperty('--faction-logo-size', faction.logoSize);
    root.style.setProperty('--faction-avatar', `url("${artUrl(faction.avatar)}")`);
    updateAiChrome(faction);
    updateWelcomeFaction(faction);
    refreshTypingIndicatorAvatar(faction);
    applyMonacoFactionTheme(faction.id);
  }

  function applyFactionTheme(themeId, options = {}) {
    if (!themeId || !getFaction(themeId)) {
      applyFactionDom(null);
      return null;
    }
    const faction = getFaction(themeId);
    applyFactionDom(faction);

    if (options.checkPersonality !== false && global.window?.api?.checkThemePersonality) {
      window.api.checkThemePersonality(themeId).then((check) => {
        hidePersonalityMismatch();
        const sessions = global.AgentSessions || global.window?.AgentSessions;
        if (check?.synced && sessions?.reloadActiveSessionMessages) {
          sessions.reloadActiveSessionMessages();
        }
      }).catch(() => {});
    }

    return faction;
  }

  function updateAiChrome(faction) {
    const logo = document.querySelector('#ai-panel-header .ai-logo');
    const title = document.querySelector('#ai-panel-header .ai-header-title');
    const sub = document.querySelector('#ai-panel-header .ai-header-subtitle');
    const emptyIcon = document.getElementById('ai-empty-icon');
    const emptyTitle = document.getElementById('ai-empty-title');
    const statusBtn = document.getElementById('status-ai-btn');

    if (logo) {
      if (faction) {
        logo.classList.add('faction-logo');
        logo.textContent = '';
      } else {
        logo.classList.remove('faction-logo');
        logo.textContent = '🤖';
      }
    }

    if (title) title.textContent = faction ? faction.aiTitle : 'AI 助手 · 按项目保存会话';
    if (sub) {
      if (faction) {
        sub.textContent = faction.aiSubtitle;
        sub.style.display = '';
      } else {
        sub.textContent = '';
        sub.style.display = 'none';
      }
    }
    if (emptyIcon) {
      if (faction) {
        emptyIcon.classList.add('faction-empty-icon');
        emptyIcon.textContent = '';
      } else {
        emptyIcon.classList.remove('faction-empty-icon');
        emptyIcon.textContent = '🧬';
      }
    }
    if (emptyTitle && faction) emptyTitle.textContent = faction.emptyTitle;

    if (statusBtn) {
      statusBtn.textContent = 'AI';
      statusBtn.title = faction ? `${faction.label}主题 · AI 助手` : 'AI 助手';
      if (faction) statusBtn.setAttribute('data-faction-accent', faction.id);
      else statusBtn.removeAttribute('data-faction-accent');
    }
  }

  function applyAgentAvatarToElement(el, factionId) {
    if (!el) return;
    const f = factionId ? getFaction(factionId) : null;
    if (!f) {
      el.classList.remove('faction-avatar');
      el.removeAttribute('data-faction-id');
      el.style.backgroundImage = '';
      el.textContent = '🤖';
      return;
    }
    el.classList.add('faction-avatar');
    el.dataset.factionId = factionId;
    el.style.backgroundImage = `url("${artUrl(f.avatar)}")`;
    el.textContent = '';
  }

  function showPersonalityMismatch(_check) {
    hidePersonalityMismatch();
  }

  function hidePersonalityMismatch() {
    const bar = document.getElementById('ai-personality-mismatch');
    if (bar) bar.style.display = 'none';
  }

  function updateWelcomeFaction(faction) {
    const welcome = document.getElementById('editor-welcome');
    if (!welcome) return;
    if (faction?.welcomeBg) {
      welcome.style.setProperty('--welcome-faction-bg', `url("${artUrl(faction.welcomeBg)}")`);
      welcome.classList.add('faction-welcome');
    } else {
      welcome.classList.remove('faction-welcome');
      welcome.style.removeProperty('--welcome-faction-bg');
    }
  }

  /** 仅更新「正在输入」指示器头像；历史消息头像由 data-faction-id 锁定 */
  function refreshTypingIndicatorAvatar(faction) {
    const typing = document.querySelector('#ai-typing-indicator .ai-msg-avatar');
    if (!typing) return;
    if (faction) applyAgentAvatarToElement(typing, faction.id);
    else applyAgentAvatarToElement(typing, null);
  }

  global.FactionTheme = {
    FACTION_IDS,
    FACTIONS,
    artUrl,
    isFactionTheme,
    getFaction,
    getFactionPersonality,
    applyFactionTheme,
    defineMonacoFactionThemes,
    applyMonacoFactionTheme,
    applyMonacoEditorGlass,
    showPersonalityMismatch,
    hidePersonalityMismatch,
    applyAgentAvatarToElement,
    refreshTypingIndicatorAvatar,
  };
})(typeof window !== 'undefined' ? window : global);
