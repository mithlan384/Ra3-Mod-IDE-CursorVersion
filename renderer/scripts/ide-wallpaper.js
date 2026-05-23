// renderer/scripts/ide-wallpaper.js —— IDE 底层壁纸 + 阵营/自定义幻灯片 + 启动/切换动画

(function initIdeWallpaperModule(global) {
  const INTERVAL_MIN_DEFAULT = 2;

  let slideshowTimer = null;
  let currentMode = null;
  let currentFaction = null;
  let slideIndex = 0;
  let slideList = [];
  let activeSlot = 'a';
  let bootDone = false;

  function isChromeWallpaperTheme(themeId) {
    return themeId === 'vs-dark' || themeId === 'vs';
  }

  function artUrl(rel) {
    if (global.FactionTheme?.artUrl) return global.FactionTheme.artUrl(rel);
    const parts = String(rel).replace(/\\/g, '/').split('/');
    return `ra3-art://${parts.map((p) => encodeURIComponent(p)).join('/')}`;
  }

  function resolveSlideUrl(item) {
    if (!item) return '';
    const s = String(item);
    if (/^(file:|https?:|ra3-art:)/i.test(s)) return s;
    return artUrl(s);
  }

  function getRoot() {
    return document.getElementById('ide-wallpaper');
  }

  function getSlides() {
    const root = getRoot();
    if (!root) return { a: null, b: null };
    return {
      a: root.querySelector('.ide-wallpaper-slide-a'),
      b: root.querySelector('.ide-wallpaper-slide-b'),
    };
  }

  function clampIntervalMinutes(min) {
    const n = Number(min);
    if (!Number.isFinite(n) || n < 1) return INTERVAL_MIN_DEFAULT;
    return Math.min(120, Math.max(1, Math.round(n)));
  }

  function getSlideshowIntervalMinutes(prefs) {
    if (prefs?.wallpaperSlideshowMinutes != null) {
      return clampIntervalMinutes(prefs.wallpaperSlideshowMinutes);
    }
    const legacySec = Number(prefs?.wallpaperSlideshowSeconds);
    if (Number.isFinite(legacySec) && legacySec > 0) {
      return clampIntervalMinutes(Math.max(1, Math.round(legacySec / 60)));
    }
    return INTERVAL_MIN_DEFAULT;
  }

  async function loadPrefs() {
    try {
      if (global.window?.api?.getPreferences) {
        return await window.api.getPreferences();
      }
    } catch (e) {
      console.warn('[ide-wallpaper] prefs:', e.message);
    }
    return {};
  }

  function clearSlideshow() {
    if (slideshowTimer) {
      clearInterval(slideshowTimer);
      slideshowTimer = null;
    }
  }

  function setWallpaperEnabled(on) {
    const html = document.documentElement;
    if (on) html.setAttribute('data-ide-wallpaper', 'on');
    else html.removeAttribute('data-ide-wallpaper');
    syncMonacoEditorGlass(on);
  }

  function syncMonacoEditorGlass(on) {
    const theme =
      global.AppTheme?.getCurrentThemeId?.() ||
      document.documentElement.getAttribute('data-faction-theme');
    if (!global.FactionTheme?.applyMonacoEditorGlass) return;
    if (on && global.FactionTheme.isFactionTheme(theme)) {
      global.FactionTheme.applyMonacoEditorGlass(true, theme);
    } else if (!on) {
      const fid = global.FactionTheme.isFactionTheme(theme) ? theme : null;
      global.FactionTheme.applyMonacoEditorGlass(false, fid);
    }
  }

  function preloadUrl(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = url;
    });
  }

  function applySlideToEl(el, item) {
    if (!el || !item) return Promise.resolve(false);
    const url = resolveSlideUrl(item);
    return preloadUrl(url).then((ok) => {
      if (ok) el.style.backgroundImage = `url("${url}")`;
      return ok;
    });
  }

  async function crossfadeTo(index) {
    if (!slideList.length) return;
    const item = slideList[index % slideList.length];
    const slides = getSlides();
    const incoming = activeSlot === 'a' ? slides.b : slides.a;
    const outgoing = activeSlot === 'a' ? slides.a : slides.b;
    if (!incoming || !outgoing) return;

    const ok = await applySlideToEl(incoming, item);
    if (!ok) return;

    incoming.classList.add('is-visible');
    outgoing.classList.remove('is-visible');
    activeSlot = activeSlot === 'a' ? 'b' : 'a';
    slideIndex = index;
  }

  function startSlideshow(intervalMinutes) {
    clearSlideshow();
    if (slideList.length <= 1) return;
    const ms = clampIntervalMinutes(intervalMinutes) * 60 * 1000;
    slideshowTimer = setInterval(() => {
      const next = (slideIndex + 1) % slideList.length;
      crossfadeTo(next);
    }, ms);
  }

  async function beginWallpaperSlides(list, intervalMin) {
    if (!list?.length) {
      stop();
      return false;
    }

    slideList = list;
    slideIndex = 0;
    activeSlot = 'a';

    const root = getRoot();
    const slides = getSlides();
    if (!root || !slides.a || !slides.b) return false;

    clearSlideshow();
    setWallpaperEnabled(true);
    slides.a.classList.remove('is-visible');
    slides.b.classList.remove('is-visible');

    const firstOk = await applySlideToEl(slides.a, slideList[0]);
    if (!firstOk) {
      stop();
      return false;
    }
    slides.a.classList.add('is-visible');
    activeSlot = 'a';
    root.classList.add('is-active');
    startSlideshow(intervalMin);
    return true;
  }

  async function startFaction(factionId, options = {}) {
    const prefs = options.prefs || (await loadPrefs());
    const intervalMin =
      options.intervalMin ??
      (options.intervalSec != null
        ? clampIntervalMinutes(Math.max(1, Math.round(Number(options.intervalSec) / 60)))
        : getSlideshowIntervalMinutes(prefs));

    let list = options.images;
    if (!list?.length && global.window?.api?.listFactionWallpapers) {
      try {
        const res = await window.api.listFactionWallpapers(factionId);
        list = res?.images || [];
      } catch (e) {
        console.warn('[ide-wallpaper] list faction:', e.message);
      }
    }
    if (!list?.length && global.FactionTheme) {
      const f = global.FactionTheme.getFaction(factionId);
      if (f?.wallpaper) list = [f.wallpaper];
    }

    currentMode = 'faction';
    currentFaction = factionId;
    return beginWallpaperSlides(list, intervalMin);
  }

  async function startCustom(options = {}) {
    const prefs = options.prefs || (await loadPrefs());
    const folder = options.folder ?? prefs.customWallpaperFolder;
    const intervalMin =
      options.intervalMin ?? getSlideshowIntervalMinutes(prefs);

    if (!folder || !global.window?.api?.listCustomWallpapers) {
      stop();
      return false;
    }

    let list = options.images;
    if (!list?.length) {
      try {
        const res = await window.api.listCustomWallpapers(folder);
        const items = res?.images || [];
        list = items.map((it) => it.url || it.path).filter(Boolean);
      } catch (e) {
        console.warn('[ide-wallpaper] list custom:', e.message);
      }
    }

    currentMode = 'custom';
    currentFaction = null;
    return beginWallpaperSlides(list, intervalMin);
  }

  function stop() {
    clearSlideshow();
    currentMode = null;
    currentFaction = null;
    slideList = [];
    slideIndex = 0;
    setWallpaperEnabled(false);
    const root = getRoot();
    if (root) {
      root.classList.remove('is-active');
      root.classList.remove('is-boot-ready');
    }
    const slides = getSlides();
    if (slides.a) {
      slides.a.classList.remove('is-visible');
      slides.a.style.backgroundImage = '';
    }
    if (slides.b) {
      slides.b.classList.remove('is-visible');
      slides.b.style.backgroundImage = '';
    }
    const old = document.getElementById('faction-bg-layer');
    if (old) old.remove();
    syncMonacoEditorGlass(false);
  }

  async function syncWithTheme(themeId, options = {}) {
    if (global.FactionTheme?.isFactionTheme(themeId)) {
      return startFaction(themeId, options);
    }
    if (isChromeWallpaperTheme(themeId)) {
      const prefs = options.prefs || (await loadPrefs());
      if (prefs.customWallpaperFolder) {
        return startCustom({ ...options, prefs });
      }
    }
    stop();
    return false;
  }

  async function revealShellAfterWallpaper(themeId) {
    const shell = document.getElementById('ide-app-shell');
    const root = getRoot();
    const hasWallpaper = document.documentElement.hasAttribute('data-ide-wallpaper');
    if (hasWallpaper && root) {
      await new Promise((r) => setTimeout(r, 420));
      root.classList.add('is-boot-ready');
    }
    if (!shell) return;
    requestAnimationFrame(() => {
      setTimeout(() => {
        shell.classList.add('is-boot-revealed');
        if (!bootDone) bootDone = true;
      }, hasWallpaper || global.FactionTheme?.isFactionTheme(themeId) ? 80 : 40);
    });
  }

  /**
   * IDE 启动：先壁纸，再启动画面进度条，最后 UI 渐入
   */
  async function runBootIntro(themeId) {
    if (bootDone) return;
    const shell = document.getElementById('ide-app-shell');
    if (!shell) return;

    const mount = document.getElementById('ide-boot-mount') || document.body;
    const splash =
      global.BootSplash?.create({
        mount,
        id: 'ide-boot-splash',
        label: '系统初始化',
        brand: 'COMMAND & CONQUER · RA3 IDE',
        status: '正在加载壁纸…',
      }) || null;

    splash?.setProgress(6, '正在加载壁纸…');

    const prefs = await loadPrefs();
    splash?.setProgress(18, '正在读取主题设置…');

    await syncWithTheme(themeId, { prefs });
    splash?.setProgress(48, '壁纸与主题已就绪');

    const root = getRoot();
    if (root && document.documentElement.hasAttribute('data-ide-wallpaper')) {
      root.classList.add('is-active');
      splash?.setProgress(62, '正在渲染界面…');
      await new Promise((r) => setTimeout(r, 380));
      root.classList.add('is-boot-ready');
    } else {
      splash?.setProgress(55, '正在准备编辑器…');
    }

    splash?.setProgress(78, '正在初始化工作区…');
    await new Promise((r) => setTimeout(r, 120));

    splash?.setProgress(90, '即将进入 IDE…');
    await splash?.dismiss(680);

    await revealShellAfterWallpaper(themeId);
  }

  /**
   * 设置保存后主题/壁纸切换动画
   */
  async function runThemeTransition(themeId, options = {}) {
    const shell = document.getElementById('ide-app-shell');
    const root = getRoot();
    if (!shell) return;

    shell.classList.remove('is-boot-revealed');
    if (root) {
      root.classList.remove('is-boot-ready');
      root.classList.remove('is-active');
    }
    await new Promise((r) => setTimeout(r, 420));

    const prefs = options.prefs || (await loadPrefs());
    await syncWithTheme(themeId, { ...options, prefs });
    await revealShellAfterWallpaper(themeId);
  }

  async function onPreferencesChanged(prefs) {
    const theme = prefs?.theme || global.AppTheme?.getCurrentThemeId?.() || 'vs-dark';
    const interval = getSlideshowIntervalMinutes(prefs);
    const sameMode =
      (global.FactionTheme?.isFactionTheme(theme) &&
        currentMode === 'faction' &&
        currentFaction === theme) ||
      (isChromeWallpaperTheme(theme) &&
        currentMode === 'custom' &&
        prefs?.customWallpaperFolder);

    if (sameMode && slideshowTimer && slideList.length > 1) {
      startSlideshow(interval);
      return;
    }
    await syncWithTheme(theme, { prefs });
  }

  global.IdeWallpaper = {
    artUrl,
    startFaction,
    startCustom,
    stop,
    syncWithTheme,
    runBootIntro,
    runThemeTransition,
    onPreferencesChanged,
    clampIntervalMinutes,
    getSlideshowIntervalMinutes,
    isChromeWallpaperTheme,
  };
})(typeof window !== 'undefined' ? window : global);
