// renderer/scripts/agent-ui/03-messages.js
// ========== 深度思考开关 ==========
async function initDeepThinkingToggle() {
  deepThinkingToggle = document.getElementById('deep-thinking-toggle');
  if (!deepThinkingToggle) return;

  try {
    if (window.api?.getPreferences) {
      const prefs = await window.api.getPreferences();
      if (typeof prefs.deepThinkingEnabled !== 'boolean') {
        prefs.deepThinkingEnabled = true;
        if (window.api.savePreferences) await window.api.savePreferences(prefs);
      }
      deepThinkingToggle.checked = prefs.deepThinkingEnabled;
    }
  } catch (e) {}

  deepThinkingToggle.addEventListener('change', async () => {
    try {
      if (window.api?.getPreferences && window.api.savePreferences) {
        const prefs = await window.api.getPreferences();
        prefs.deepThinkingEnabled = deepThinkingToggle.checked;
        await window.api.savePreferences(prefs);
      }
    } catch (e) {}
  });
}

// ========== 阶段5新增：搜索开关逻辑 ==========
async function initSearchToggle() {
  searchToggle = document.getElementById('search-toggle');
  forceSearchBtn = document.getElementById('force-search-btn');
  if (!searchToggle) return;

  // 读取并初始化 allowWebSearch（preferences.json 可能缺少该字段）
  try {
    if (window.api && window.api.getPreferences) {
      const prefs = await window.api.getPreferences();
      if (typeof prefs.allowWebSearch !== 'boolean') {
        prefs.allowWebSearch = true;
        if (window.api.savePreferences) await window.api.savePreferences(prefs);
      }
      searchToggle.checked = prefs.allowWebSearch;
    }
  } catch (e) {}

  searchToggle.addEventListener('change', async () => {
    try {
      if (window.api && window.api.getPreferences && window.api.savePreferences) {
        const prefs = await window.api.getPreferences();
        prefs.allowWebSearch = searchToggle.checked;
        await window.api.savePreferences(prefs);
        console.log('[搜索开关] 已保存:', prefs.allowWebSearch);
      }
    } catch (e) {}
  });

  if (forceSearchBtn) {
    forceSearchBtn.addEventListener('click', () => {
      const input = document.getElementById('ai-panel-input');
      if (!input) return;
      const msg = input.value.trim();
      if (!msg) return;
      input.value = '强制搜索 ' + msg;
      sendAIMessage();
    });
  }
}

// ========== 操作确认 / 询问后跟进按钮 ==========
