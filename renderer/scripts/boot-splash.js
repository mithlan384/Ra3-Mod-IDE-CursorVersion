// renderer/scripts/boot-splash.js —— 启动画面（HUD + 雷达 + 退场动画）

(function initBootSplash(global) {
  const TAGLINES = [
    '同步 Insurrection 标准 MOD 规范',
    '挂载 SDK / SageXml 知识索引',
    '加载阵营主题与壁纸资源',
    '准备 XML 编辑器与工作区',
  ];

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function buildAnimatedLabel(text) {
    const chars = [...String(text || '')];
    return chars
      .map(
        (ch, i) =>
          `<span class="boot-char" style="--i:${i}">${ch === ' ' ? '&nbsp;' : escapeHtml(ch)}</span>`
      )
      .join('');
  }

  function clampPct(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return 0;
    return Math.min(100, Math.max(0, Math.round(v)));
  }

  /**
   * @param {object} options
   * @param {HTMLElement} [options.mount]
   * @param {string} [options.label]
   * @param {string} [options.brand]
   * @param {string} [options.status]
   */
  function create(options = {}) {
    const mount = options.mount || document.body;
    let progress = 0;
    let dismissed = false;
    let taglineTimer = null;
    let taglineIdx = 0;

    const root = document.createElement('div');
    root.className = 'boot-splash';
    root.id = options.id || 'boot-splash';
    root.setAttribute('role', 'status');
    root.setAttribute('aria-live', 'polite');
    root.setAttribute('aria-busy', 'true');

    const labelText = options.label || '系统初始化';
    root.innerHTML = `
      <div class="boot-splash-scene" aria-hidden="true">
        <div class="boot-splash-orb boot-splash-orb-allied"></div>
        <div class="boot-splash-orb boot-splash-orb-soviet"></div>
        <div class="boot-splash-orb boot-splash-orb-empire"></div>
        <div class="boot-splash-grid"></div>
        <div class="boot-splash-scanlines"></div>
        <div class="boot-splash-radar">
          <div class="boot-splash-radar-sweep"></div>
          <div class="boot-splash-radar-ring"></div>
        </div>
      </div>
      <div class="boot-splash-hud" aria-hidden="true">
        <span class="boot-hud-corner boot-hud-tl"></span>
        <span class="boot-hud-corner boot-hud-tr"></span>
        <span class="boot-hud-corner boot-hud-bl"></span>
        <span class="boot-hud-corner boot-hud-br"></span>
        <div class="boot-hud-ticker"><span data-boot-ticker>RA3 MOD IDE · BUILD ${new Date().getFullYear()}</span></div>
      </div>
      <div class="boot-splash-inner">
        <div class="boot-splash-brand">${escapeHtml(options.brand || 'RA3 MOD IDE')}</div>
        <div class="boot-splash-emblem-wrap">
          <div class="boot-splash-emblem-ring boot-splash-emblem-ring-1"></div>
          <div class="boot-splash-emblem-ring boot-splash-emblem-ring-2"></div>
          <div class="boot-splash-emblem-core">
            <img class="boot-splash-emblem-img" src="ra3-art://Logo1.png" alt="" draggable="false"
              onerror="this.onerror=null;this.src='ra3-art://RAT.png';" />
          </div>
        </div>
        <div class="boot-splash-factions" aria-hidden="true">
          <span class="boot-faction boot-faction-allied" title="盟军"></span>
          <span class="boot-faction boot-faction-soviet" title="苏联"></span>
          <span class="boot-faction boot-faction-empire" title="帝国"></span>
        </div>
        <div class="boot-splash-label" data-boot-label></div>
        <div class="boot-splash-tagline" data-boot-tagline>${escapeHtml(TAGLINES[0])}</div>
        <div class="boot-splash-status" data-boot-status>${escapeHtml(options.status || '正在准备…')}</div>
        <div class="boot-splash-progress-wrap">
          <div class="boot-splash-progress-track">
            <div class="boot-splash-progress-segments" aria-hidden="true"></div>
            <div class="boot-splash-progress-fill" data-boot-fill style="width:0%"></div>
            <div class="boot-splash-progress-glow" data-boot-glow style="width:0%"></div>
          </div>
          <div class="boot-splash-progress-meta">
            <span class="boot-splash-progress-hint" data-boot-hint>INITIALIZING</span>
            <span class="boot-splash-progress-pct" data-boot-pct>0%</span>
          </div>
        </div>
      </div>
      <div class="boot-splash-flash" aria-hidden="true"></div>
    `;

    const labelEl = root.querySelector('[data-boot-label]');
    const statusEl = root.querySelector('[data-boot-status]');
    const taglineEl = root.querySelector('[data-boot-tagline]');
    const fillEl = root.querySelector('[data-boot-fill]');
    const glowEl = root.querySelector('[data-boot-glow]');
    const pctEl = root.querySelector('[data-boot-pct]');
    const hintEl = root.querySelector('[data-boot-hint]');

    function setLabel(text) {
      if (labelEl) labelEl.innerHTML = buildAnimatedLabel(text);
    }

    function cycleTagline() {
      if (dismissed || !taglineEl) return;
      taglineIdx = (taglineIdx + 1) % TAGLINES.length;
      taglineEl.classList.remove('is-visible');
      requestAnimationFrame(() => {
        setTimeout(() => {
          if (dismissed || !taglineEl) return;
          taglineEl.textContent = TAGLINES[taglineIdx];
          taglineEl.classList.add('is-visible');
        }, 180);
      });
    }

    setLabel(labelText);
    taglineEl?.classList.add('is-visible');
    mount.appendChild(root);

    taglineTimer = setInterval(cycleTagline, 2400);

    function setProgress(pct, status) {
      if (dismissed) return;
      const next = clampPct(pct);
      if (next < progress) return;
      progress = next;
      if (fillEl) fillEl.style.width = `${progress}%`;
      if (glowEl) glowEl.style.width = `${progress}%`;
      if (pctEl) pctEl.textContent = `${progress}%`;
      if (hintEl) {
        hintEl.textContent =
          progress >= 100 ? 'READY' : progress >= 75 ? 'FINALIZING' : progress >= 40 ? 'LOADING' : 'INITIALIZING';
      }
      if (status != null && statusEl) statusEl.textContent = String(status);
      if (progress >= 88) root.classList.add('is-near-complete');
    }

    function setStatus(status) {
      if (dismissed || status == null || !statusEl) return;
      statusEl.textContent = String(status);
    }

    function bump(delta, status) {
      setProgress(progress + (Number(delta) || 0), status);
    }

    function dismiss(delayMs = 520) {
      if (dismissed) return Promise.resolve();
      dismissed = true;
      if (taglineTimer) {
        clearInterval(taglineTimer);
        taglineTimer = null;
      }
      root.setAttribute('aria-busy', 'false');
      setProgress(100, statusEl?.textContent || '启动完成');
      setLabel('就绪');
      if (taglineEl) {
        taglineEl.textContent = '欢迎回来，指挥官';
        taglineEl.classList.add('is-visible');
      }
      root.classList.add('is-complete');

      return new Promise((resolve) => {
        setTimeout(() => {
          root.classList.add('is-exiting');
          setTimeout(() => {
            root.classList.add('is-dismissed');
            setTimeout(() => {
              root.remove();
              resolve();
            }, 920);
          }, 60);
        }, Math.max(280, Number(delayMs) || 0));
      });
    }

    return {
      el: root,
      setLabel,
      setProgress,
      setStatus,
      bump,
      dismiss,
      getProgress: () => progress,
    };
  }

  function preloadWallpaperToLayer(layer, urlCandidates = []) {
    return new Promise((resolve) => {
      if (!layer || !urlCandidates.length) {
        resolve(false);
        return;
      }
      let idx = 0;
      const tryNext = () => {
        if (idx >= urlCandidates.length) {
          resolve(false);
          return;
        }
        const url = urlCandidates[idx++];
        const img = new Image();
        img.onload = () => {
          const safe = String(url).replace(/\\/g, '/').replace(/"/g, '%22');
          layer.style.backgroundImage = `url("${safe}")`;
          layer.classList.add('is-loaded');
          resolve(true);
        };
        img.onerror = tryNext;
        img.src = url;
      };
      tryNext();
    });
  }

  global.BootSplash = {
    create,
    preloadWallpaperToLayer,
    buildAnimatedLabel,
  };
})(typeof window !== 'undefined' ? window : globalThis);
