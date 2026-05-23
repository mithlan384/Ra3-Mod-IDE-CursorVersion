// renderer/scripts/user-avatar.js —— AI 面板用户圆形头像

let cachedUserAvatarUrl = null;
let cachedDefaultAvatarUrl = null;

async function resolveDefaultUserAvatarUrl() {
  if (cachedDefaultAvatarUrl) return cachedDefaultAvatarUrl;
  if (window.api?.getArtFileUrl) {
    try {
      const url = await window.api.getArtFileUrl('RAT.png');
      if (url) {
        cachedDefaultAvatarUrl = url;
        return url;
      }
    } catch {
      /* fallback */
    }
  }
  if (window.api?.getDefaultUserAvatarUrl) {
    try {
      const url = await window.api.getDefaultUserAvatarUrl();
      if (url) {
        cachedDefaultAvatarUrl = url;
        return url;
      }
    } catch {
      /* fallback */
    }
  }
  if (typeof FactionTheme !== 'undefined' && FactionTheme.artUrl) {
    const themed = FactionTheme.artUrl('RAT.png');
    if (themed && !/^ra3-art:/i.test(themed)) {
      cachedDefaultAvatarUrl = themed;
      return cachedDefaultAvatarUrl;
    }
  }
  return null;
}

async function refreshUserAvatarCache() {
  if (window.api?.getUserAvatarUrl) {
    try {
      const res = await window.api.getUserAvatarUrl();
      if (res?.success && res.hasAvatar && res.url) {
        cachedUserAvatarUrl = res.url;
        return cachedUserAvatarUrl;
      }
    } catch {
      /* use default */
    }
  }
  cachedUserAvatarUrl = await resolveDefaultUserAvatarUrl();
  return cachedUserAvatarUrl;
}

function applyUserAvatarElement(avatarEl, role) {
  if (!avatarEl || role !== 'user') return;

  avatarEl.textContent = '🧑';
  avatarEl.classList.remove('has-custom-avatar');
  const broken = avatarEl.querySelector('img.user-avatar-img');
  if (broken) broken.remove();

  const setImgSrc = (src) => {
    if (!src || /^ra3-art:/i.test(src)) return false;
    avatarEl.textContent = '';
    avatarEl.classList.add('has-custom-avatar');
    let img = avatarEl.querySelector('img.user-avatar-img');
    if (!img) {
      img = document.createElement('img');
      img.className = 'user-avatar-img';
      img.alt = '';
      avatarEl.appendChild(img);
    }
    img.onerror = () => {
      avatarEl.classList.remove('has-custom-avatar');
      avatarEl.textContent = '🧑';
      const bad = avatarEl.querySelector('img.user-avatar-img');
      if (bad) bad.remove();
    };
    if (img.src !== src) img.src = src;
    return true;
  };

  const tryApply = async () => {
    if (cachedUserAvatarUrl && setImgSrc(cachedUserAvatarUrl)) return;
    const def = await resolveDefaultUserAvatarUrl();
    if (def && setImgSrc(def)) return;
    avatarEl.textContent = '🧑';
    avatarEl.classList.remove('has-custom-avatar');
  };

  void tryApply();
}

function refreshAllUserMessageAvatars() {
  document.querySelectorAll('.ai-message.user .ai-msg-avatar').forEach((el) => {
    applyUserAvatarElement(el, 'user');
  });
}

function bindUserAvatarListeners() {
  if (!window.api?.onUserAvatarChanged) return;
  window.api.onUserAvatarChanged(async (data) => {
    if (data?.success && data.hasAvatar && data.url) {
      cachedUserAvatarUrl = data.url;
    } else {
      cachedUserAvatarUrl = await resolveDefaultUserAvatarUrl();
    }
    refreshAllUserMessageAvatars();
  });
}

window.UserAvatar = {
  resolveDefaultUserAvatarUrl,
  refreshUserAvatarCache,
  applyUserAvatarElement,
  refreshAllUserMessageAvatars,
  bindUserAvatarListeners,
  getCachedUrl: () => cachedUserAvatarUrl,
};
