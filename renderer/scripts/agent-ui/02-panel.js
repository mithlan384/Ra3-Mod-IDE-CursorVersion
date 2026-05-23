// renderer/scripts/agent-ui/02-panel.js
function scheduleEditorLayoutForAIPanel(opening) {
  if (aiPanelLayoutTimer) {
    clearTimeout(aiPanelLayoutTimer);
    aiPanelLayoutTimer = null;
  }
  const runLayout = () => {
    aiPanelLayoutTimer = null;
    if (typeof editor !== 'undefined' && editor) editor.layout();
    if (typeof splitEditor !== 'undefined' && splitEditor) splitEditor.layout();
  };
  if (opening) {
    aiPanelLayoutTimer = setTimeout(runLayout, AI_PANEL_ANIM_MS);
  } else {
    requestAnimationFrame(() => requestAnimationFrame(runLayout));
  }
}

function scheduleThemePersonalityCheck() {
  const run = () => {
    if (
      typeof AppTheme === 'undefined' ||
      typeof FactionTheme === 'undefined' ||
      !AppTheme.isFactionTheme(AppTheme.getCurrentThemeId()) ||
      !window.api?.checkThemePersonality
    ) {
      return;
    }
    window.api.checkThemePersonality(AppTheme.getCurrentThemeId()).then((check) => {
      if (check?.mismatch && FactionTheme.showPersonalityMismatch) {
        FactionTheme.showPersonalityMismatch(check);
      }
    });
  };
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(run, { timeout: 800 });
  } else {
    setTimeout(run, 120);
  }
}

function toggleAIPanel() {
  const panel = document.getElementById('ai-panel');
  const btn = document.getElementById('status-ai-btn');
  const isOpen = panel.classList.contains('open');

  if (isOpen) {
    panel.classList.remove('open');
    document.body.classList.remove('ai-panel-open');
    if (btn) btn.classList.remove('active');
    scheduleEditorLayoutForAIPanel(false);
  } else {
    panel.classList.add('open');
    document.body.classList.add('ai-panel-open');
    if (btn) btn.classList.add('active');
    setTimeout(() => { document.getElementById('ai-panel-input')?.focus(); }, 300);
    scheduleThemePersonalityCheck();
    scheduleEditorLayoutForAIPanel(true);
  }
}

/** 终止进行中的回复并清空打字机/发送状态（切换或删除会话时调用） */
function resetAIChatInteractionState() {
  typewriterToken++;
  typewriterChain = Promise.resolve();
  thinkingTypewriterToken++;
  thinkingTypewriterChain = Promise.resolve();
  liveChatTurnId++;
  document.querySelectorAll('[data-ai-turn-live]').forEach((el) => {
    finalizeThinkingBlocksIn(el, 1);
    el.removeAttribute('data-ai-turn-live');
  });
  resetAgentTurnUi();
  chatInFlight = false;
  setAiSendButtonMode('send');
  if (chatTimeoutId) {
    clearTimeout(chatTimeoutId);
    chatTimeoutId = null;
  }
  showTypingIndicator(false);
  updateAgentStatusBubble('');
}

// 清除所有消息，恢复空白状态
function clearAIMessages(showEmpty = true) {
  const container = document.getElementById('ai-panel-messages');
  if (!container) return;

  const toRemove = container.querySelectorAll('.ai-message:not(#ai-typing-indicator)');
  toRemove.forEach((el) => el.remove());

  messageCount = 0;
  resetAIChatInteractionState();
  showEmptyState(showEmpty);
}

function resetAgentTurnUi() {
  activeTurnEl = null;
  activeThinkingBody = null;
  activeAnswerContent = null;
  thinkingBeginTs = null;
  thinkingTypewriterChain = Promise.resolve();
  thinkingUiFinished = false;
}

function finalizeThinkingBlocksIn(rootEl, elapsedSec) {
  if (!rootEl) return;
  const sec = elapsedSec != null ? elapsedSec : 1;
  rootEl.querySelectorAll('.ai-thinking-block.is-thinking').forEach((blockEl) => {
    blockEl.classList.remove('is-thinking');
    blockEl.classList.add('is-done');
    const labelSpan = blockEl.querySelector('.ai-thinking-header span:nth-child(2)');
    if (labelSpan) labelSpan.textContent = `已思考 (用时 ${sec} 秒)`;
  });
}

/** 移除空白或重复的「思考中」气泡 */
function pruneOrphanThinkingTurns() {
  const container = document.getElementById('ai-panel-messages');
  if (!container) return;
  const live = container.querySelector('[data-ai-turn-live="1"]');
  container.querySelectorAll('.ai-turn-composite').forEach((el) => {
    if (el === live) return;
    const think = el.querySelector('.ai-thinking-content');
    const ans = el.querySelector('.ai-answer-content');
    const block = el.querySelector('.ai-thinking-block');
    const thinkEmpty = !(think?.textContent || '').trim();
    const ansEmpty = !(ans?.textContent || '').trim();
    if (block?.classList.contains('is-thinking') && thinkEmpty && ansEmpty) {
      el.remove();
      return;
    }
    if (block?.classList.contains('is-thinking') && !el.hasAttribute('data-ai-turn-live')) {
      finalizeThinkingBlocksIn(el, 1);
    }
  });
}

function bindLiveTurnPointers() {
  const el = document.querySelector('[data-ai-turn-live="1"]');
  if (!el || el.dataset.turnId !== String(liveChatTurnId)) {
    activeTurnEl = null;
    activeThinkingBody = null;
    activeAnswerContent = null;
    return false;
  }
  activeTurnEl = el;
  activeThinkingBody = el.querySelector('.ai-thinking-content');
  activeAnswerContent = el.querySelector('.ai-answer-content');
  return !!activeThinkingBody;
}

/** 新一轮用户消息：结束上一轮 live 标记，准备唯一思考区 */
function startLiveChatTurn() {
  const prevBegin = thinkingBeginTs;
  document.querySelectorAll('[data-ai-turn-live]').forEach((el) => {
    const sec = prevBegin ? Math.max(1, Math.round((Date.now() - prevBegin) / 1000)) : 1;
    finalizeThinkingBlocksIn(el, sec);
    el.removeAttribute('data-ai-turn-live');
  });
  liveChatTurnId++;
  thinkingTypewriterToken++;
  thinkingTypewriterChain = Promise.resolve();
  thinkingPendingText = '';
  if (thinkingFlushRaf) {
    cancelAnimationFrame(thinkingFlushRaf);
    thinkingFlushRaf = 0;
  }
  thinkingUiFinished = false;
  resetAgentTurnUi();
  pruneOrphanThinkingTurns();
  return liveChatTurnId;
}

function isDeepThinkingUiEnabled() {
  return !!deepThinkingToggle?.checked;
}

function flushThinkingPendingDom(turnId) {
  thinkingFlushRaf = 0;
  if (turnId !== liveChatTurnId || !thinkingPendingText) return;
  if (!bindLiveTurnPointers()) beginThinkingTurnUi();
  const chunk = thinkingPendingText;
  thinkingPendingText = '';
  if (!activeThinkingBody) return;
  const prev = activeThinkingBody.textContent.trim();
  activeThinkingBody.textContent = prev ? `${prev}\n\n${chunk}` : chunk;
  scrollChatToBottom();
  const blockEl = activeTurnEl?.querySelector('.ai-thinking-block');
  if (blockEl) {
    blockEl.classList.add('is-thinking');
    blockEl.classList.remove('is-done', 'is-collapsed');
  }
}

/** 深度思考进度条：合并 rAF 刷新，避免高频 DOM + 滚动拖死 UI */
function appendThinkingInstant(text, turnId) {
  if (turnId !== liveChatTurnId) return;
  const chunk = String(text || '').trim();
  if (!chunk) return;
  thinkingPendingText = thinkingPendingText
    ? `${thinkingPendingText}\n\n${chunk}`
    : chunk;
  if (thinkingFlushRaf) return;
  thinkingFlushRaf = requestAnimationFrame(() => flushThinkingPendingDom(turnId));
}

/** 深度思考开启时：立即显示「思考中」块，替代 … 跳动气泡 */
function beginThinkingTurnUi() {
  if (bindLiveTurnPointers()) return activeTurnEl;

  pruneOrphanThinkingTurns();
  showEmptyState(false);
  showTypingIndicator(false);
  updateAgentStatusBubble('');

  const div = document.createElement('div');
  div.className = 'ai-message agent ai-turn-composite';
  div.dataset.aiTurnLive = '1';
  div.dataset.turnId = String(liveChatTurnId);
  div.style.animationDelay = messageCount * 0.02 + 's';
  messageCount++;

  const avatar = document.createElement('div');
  avatar.className = 'ai-msg-avatar';
  applyAgentMessageAvatar(avatar, {});
  div.appendChild(avatar);

  const msgBody = document.createElement('div');
  msgBody.className = 'ai-msg-body';
  const { block, body } = buildThinkingBlockElement('', {});
  msgBody.appendChild(block);

  const answer = document.createElement('div');
  answer.className = 'ai-msg-content ai-answer-content';
  msgBody.appendChild(answer);
  div.appendChild(msgBody);

  const container = document.getElementById('ai-panel-messages');
  const indicator = document.getElementById('ai-typing-indicator');
  if (container) {
    if (indicator && indicator.parentNode === container) {
      container.insertBefore(div, indicator);
    } else {
      container.appendChild(div);
    }
  }

  activeTurnEl = div;
  activeThinkingBody = body;
  activeAnswerContent = answer;
  thinkingBeginTs = Date.now();
  thinkingUiFinished = false;
  scrollChatToBottom();
  return div;
}

async function typewriterAppendToThinking(text, turnId) {
  if (turnId !== liveChatTurnId) return;
  if (!bindLiveTurnPointers()) beginThinkingTurnUi();
  const chunk = String(text || '');
  if (!chunk) return;

  let prefix = activeThinkingBody.textContent;
  let chunkToAdd = chunk;
  const pTrim = prefix.trimEnd();
  if (pTrim && chunk.startsWith(pTrim)) {
    chunkToAdd = chunk.slice(pTrim.length).replace(/^[\s,，、]+/, '');
  } else if (pTrim && pTrim.endsWith('嗯，') && chunk.startsWith('嗯，')) {
    chunkToAdd = chunk.slice(2).replace(/^[\s,，、]+/, '');
  }
  const sep = prefix.trim() && chunkToAdd ? '\n' : '';
  const addition = (prefix.trim() ? sep : '') + chunkToAdd;
  if (!addition) return;

  const fastDeep = isDeepThinkingUiEnabled();
  // 仅超长进度摘要瞬时落字；内心独白仍走加速打字机
  if (addition.length > 520 && !fastDeep) {
    activeThinkingBody.textContent = prefix + addition;
    scrollChatToBottom();
  } else {
    const token = ++thinkingTypewriterToken;
    const step = fastDeep
      ? addition.length > 400
        ? 10
        : 4
      : addition.length > 500
        ? 8
        : addition.length > 200
          ? 5
          : 2;
    const delay = fastDeep ? 5 : addition.length > 500 ? 5 : 9;
    for (let i = 0; i < addition.length; i += step) {
      if (token !== thinkingTypewriterToken) return;
      activeThinkingBody.textContent = prefix + addition.slice(0, Math.min(i + step, addition.length));
      scrollChatToBottom();
      await sleepMs(delay);
    }
  }

  const blockEl = activeTurnEl?.querySelector('.ai-thinking-block');
  if (blockEl) {
    blockEl.classList.add('is-thinking');
    blockEl.classList.remove('is-done', 'is-collapsed');
  }
}

/** 将思考文本排队打字机输出（与回答串行，先思后答） */
function enqueueThinkingText(text) {
  const t = String(text || '').trim();
  if (!t || !liveChatTurnId) return thinkingTypewriterChain;

  const turnId = liveChatTurnId;

  if (!bindLiveTurnPointers()) beginThinkingTurnUi();
  const job = thinkingTypewriterChain.then(() => typewriterAppendToThinking(t, turnId));
  thinkingTypewriterChain = job.catch(() => {});
  typewriterChain = typewriterChain.then(() => job).catch(() => {});
  return job;
}

async function clearCurrentSession() {
  const sessionId = typeof AgentSessions !== 'undefined'
    ? AgentSessions.getActiveSessionId()
    : null;
  if (!sessionId || !window.api?.agent?.sessions?.clear) return;
  if (typeof chatInFlight !== 'undefined' && chatInFlight) {
    alert('请等待当前回复完成后再清空会话');
    return;
  }
  if (!confirm('确定清空当前会话的所有消息吗？此操作不可恢复。')) return;
  const res = await window.api.agent.sessions.clear(sessionId);
  if (!res?.success) {
    alert(res?.error || '清空失败');
    return;
  }
  clearAIMessages(true);
  if (typeof AgentSessions !== 'undefined') AgentSessions.refreshTabs();
}

// 空白状态显示/隐藏
function showEmptyState(visible) {
  const empty = document.getElementById('ai-empty-state');
  if (empty) {
    empty.classList.toggle('hidden', !visible);
  }
}

// 显示/隐藏输入指示器
function showTypingIndicator(visible) {
  const indicator = document.getElementById('ai-typing-indicator');
  if (indicator) {
    indicator.style.display = visible ? 'flex' : 'none';
    if (visible) {
      const av = indicator.querySelector('.ai-msg-avatar');
      if (av) applyAgentMessageAvatar(av, {});
    }
  }
  if (visible) {
    const container = document.getElementById('ai-panel-messages');
    if (container) container.scrollTop = container.scrollHeight;
  }
}

// 点击提示词填入输入框
function fillHint(text) {
  const input = document.getElementById('ai-panel-input');
  if (input) {
    input.value = text;
    input.focus();
    autoResizeTextarea(input);
  }
}

// 自动调整 textarea 高度
function autoResizeTextarea(textarea) {
  textarea.style.height = 'auto';
  const maxH = parseInt(getComputedStyle(textarea).maxHeight || 100, 10);
  textarea.style.height = Math.min(textarea.scrollHeight, maxH) + 'px';
}

function openKnowledgePanel() {
  if (window.api && window.api.openKnowledgePanel) {
    window.api.openKnowledgePanel();
  } else {
    appendMessage('agent', '知识库面板功能不可用');
  }
}

let chatInFlight = false;
let chatTimeoutId = null;

function getAiSendButton() {
  return document.getElementById('ai-panel-send');
}

function setAiSendButtonMode(mode) {
  const btn = getAiSendButton();
  if (!btn) return;
  if (mode === 'stop') {
    btn.dataset.mode = 'stop';
    btn.textContent = '■';
    btn.title = '终止当前任务（Esc）';
    btn.setAttribute('aria-label', '终止当前任务');
    btn.classList.add('is-stop');
  } else {
    btn.dataset.mode = 'send';
    btn.textContent = '➤';
    btn.title = 'Enter 发送';
    btn.setAttribute('aria-label', '发送消息');
    btn.classList.remove('is-stop');
  }
}

function stopAIMessage() {
  if (!chatInFlight) return;
  if (window.api?.agent?.abortChat) {
    window.api.agent.abortChat();
  }
  chatInFlight = false;
  if (chatTimeoutId) clearTimeout(chatTimeoutId);
  showTypingIndicator(false);
  updateAgentStatusBubble('');
  setAiSendButtonMode('send');
  appendMessage('agent', '⏹ 已请求终止，正在停止…');
}

function resetChatTimeout() {
  if (chatTimeoutId) clearTimeout(chatTimeoutId);
  chatTimeoutId = setTimeout(() => {
    if (chatInFlight) {
      chatInFlight = false;
      setAiSendButtonMode('send');
      showTypingIndicator(false);
      appendMessage('agent', '⚠️ 请求超时（创建单位/迁移/联网搜索可能较久）。请稍后再试，或查看终端日志。');
    }
  }, 240000);
}

async function sendAIMessage() {
  const btn = getAiSendButton();
  if (btn?.dataset.mode === 'stop' || (chatInFlight && btn?.classList.contains('is-stop'))) {
    stopAIMessage();
    return;
  }

  const input = document.getElementById('ai-panel-input');
  const message = input.value.trim();
  if (!message || chatInFlight) return;

  appendMessage('user', message);
  startLiveChatTurn();
  const useDeepThinking = deepThinkingToggle ? deepThinkingToggle.checked : true;
  if (useDeepThinking) {
    beginThinkingTurnUi();
  } else {
    showTypingIndicator(true);
  }
  chatInFlight = true;
  setAiSendButtonMode('stop');
  input.value = '';
  autoResizeTextarea(input);

  resetChatTimeout();

  if (message === '/help') {
    chatInFlight = false;
    setAiSendButtonMode('send');
    if (chatTimeoutId) clearTimeout(chatTimeoutId);
    showTypingIndicator(false);
    const helpText = `可用命令：
直接输入自然语言需求，Agent 会自动执行。
也可手动工具命令：
/tool listProjectStructure [子目录]
/tool searchFiles 关键词
/tool readXml 文件 点路径
/tool writeXml 文件 点路径 新值
/tool backupFile 文件
/tool restoreFile 文件
/tool getUnitInheritance 单位ID
/tool openFileInEditor 文件 [行号]
/tool getXmlStructure 文件 [深度]
/tool setUnitProperty 单位ID 属性路径 新值
/tool addWeaponToUnit 单位ID 武器模板 [槽位]
/tool createUnit 单位ID [模板单位] [显示名称]
/tool createBuilding 建筑ID [模板] [显示名称]
/tool findReferences 关键词
/tool scanProject
说「扫描当前项目」后可选择：标准 MOD 格式（默认）或当前项目格式`;
    appendMessage('agent', helpText + '\n\n扫描项目后可点「标准 MOD 格式」或「当前项目格式」切换写入规范。');
    return;
  }

  const sessionId = typeof AgentSessions !== 'undefined'
    ? AgentSessions.getActiveSessionId()
    : null;

  if (window.api && window.api.agent && window.api.agent.sendChat) {
    try {
      const deepThinking = deepThinkingToggle ? deepThinkingToggle.checked : true;
      window.api.agent.sendChat({ sessionId, message, deepThinking });
    } catch (err) {
      chatInFlight = false;
      setAiSendButtonMode('send');
      if (chatTimeoutId) clearTimeout(chatTimeoutId);
      showTypingIndicator(false);
      appendMessage('agent', '❌ 发送失败: ' + (err.message || String(err)));
    }
    return;
  }

  chatInFlight = false;
  setAiSendButtonMode('send');
  if (chatTimeoutId) clearTimeout(chatTimeoutId);
  showTypingIndicator(false);
  appendMessage('agent', '❌ Agent API 不可用，请确认 preload 已加载并重启 IDE。');
}

function isFactionAvatarActive() {
  return (
    typeof FactionTheme !== 'undefined' &&
    typeof AppTheme !== 'undefined' &&
    AppTheme.isFactionTheme(AppTheme.getCurrentThemeId())
  );
}

/** 新消息使用的阵营头像（当前主题或消息自带） */
function resolveAgentFactionId(options = {}) {
  if (options.factionId && FactionTheme?.getFaction(options.factionId)) {
    return options.factionId;
  }
  if (typeof AppTheme !== 'undefined' && AppTheme.isFactionTheme(AppTheme.getCurrentThemeId())) {
    return AppTheme.getCurrentThemeId();
  }
  return null;
}

function applyAgentMessageAvatar(avatarEl, options = {}) {
  const fid = resolveAgentFactionId(options);
  if (FactionTheme?.applyAgentAvatarToElement) {
    FactionTheme.applyAgentAvatarToElement(avatarEl, fid);
  } else if (fid) {
    avatarEl.classList.add('faction-avatar');
  } else {
    avatarEl.textContent = '🤖';
  }
}

function buildThinkingBlockElement(thinkingText, options = {}) {
  const collapsed = !!options.collapsed;
  const elapsedSec = options.elapsedSec != null ? options.elapsedSec : null;
  const isDone = collapsed || elapsedSec != null;

  const block = document.createElement('div');
  block.className = 'ai-thinking-block' + (isDone ? ' is-done' : ' is-thinking');
  if (collapsed) block.classList.add('is-collapsed');

  const header = document.createElement('div');
  header.className = 'ai-thinking-header';
  const icon = document.createElement('span');
  icon.className = 'ai-thinking-icon';
  header.appendChild(icon);

  const label = document.createElement('span');
  if (isDone && elapsedSec != null) {
    label.textContent = `已思考 (用时 ${elapsedSec} 秒)`;
  } else if (isDone) {
    label.textContent = '已思考';
  } else {
    label.textContent = '思考中';
    const dots = document.createElement('span');
    dots.className = 'ai-thinking-dots';
    dots.innerHTML = '<span></span><span></span><span></span>';
    label.appendChild(dots);
  }
  header.appendChild(label);

  const chevron = document.createElement('span');
  chevron.className = 'ai-thinking-chevron';
  chevron.textContent = '▼';
  header.appendChild(chevron);

  const body = document.createElement('div');
  body.className = 'ai-thinking-content';
  body.textContent = thinkingText || '';

  header.addEventListener('click', () => {
    block.classList.toggle('is-collapsed');
  });

  block.appendChild(header);
  block.appendChild(body);
  return { block, body };
}

function buildAgentTurnElement(thinkingText, options = {}) {
  const div = document.createElement('div');
  div.className = 'ai-message agent ai-turn-composite';
  if (!options.skipStagger) {
    div.style.animationDelay = messageCount * 0.02 + 's';
  }
  messageCount++;

  const avatar = document.createElement('div');
  avatar.className = 'ai-msg-avatar';
  applyAgentMessageAvatar(avatar, options);
  div.appendChild(avatar);

  const msgBody = document.createElement('div');
  msgBody.className = 'ai-msg-body';

  if (thinkingText) {
    const { block } = buildThinkingBlockElement(thinkingText, options);
    msgBody.appendChild(block);
  }

  const answer = document.createElement('div');
  answer.className = 'ai-msg-content ai-answer-content';
  msgBody.appendChild(answer);
  div.appendChild(msgBody);

  if (!options.forHistory) {
    activeTurnEl = div;
    activeThinkingBody = div.querySelector('.ai-thinking-content');
    activeAnswerContent = answer;
  }
  return div;
}

function finishThinkingUi(elapsedMs) {
  if (thinkingUiFinished) return;
  thinkingUiFinished = true;

  const clientMs = thinkingBeginTs ? Date.now() - thinkingBeginTs : elapsedMs || 0;
  const ms = Math.max(clientMs, elapsedMs || 0);
  const sec = ms < 1000 ? 1 : Math.round(ms / 1000);

  const live = document.querySelector('[data-ai-turn-live="1"]');
  if (live && live.dataset.turnId === String(liveChatTurnId)) {
    finalizeThinkingBlocksIn(live, sec);
  } else if (activeTurnEl) {
    finalizeThinkingBlocksIn(activeTurnEl, sec);
  }
  pruneOrphanThinkingTurns();
}

function enqueueAnswerInTurn(text) {
  const job = typewriterChain.then(() => typewriterIntoElement(activeAnswerContent, text));
  typewriterChain = job.catch(() => {});
  return job;
}

async function typewriterIntoElement(contentEl, text) {
  if (!contentEl) return;
  showEmptyState(false);
  const full = text == null ? '' : String(text);
  const token = ++typewriterToken;
  const chunk = full.length > 2000 ? 6 : full.length > 800 ? 4 : 3;
  const delay = full.length > 2000 ? 8 : 14;
  for (let i = 0; i < full.length; i += chunk) {
    if (token !== typewriterToken) return;
    contentEl.textContent = full.slice(0, Math.min(i + chunk, full.length));
    scrollChatToBottom();
    await sleepMs(delay);
  }
  const execIdMatch = full.match(/\[执行ID: ([^\]]+)\]/);
  if (execIdMatch) {
    lastExecutionId = execIdMatch[1];
    addConfirmButton(contentEl, execIdMatch[1]);
  }
  scrollChatToBottom();
}

/** 构建单条消息 DOM（appendMessage / 批量加载共用） */
function buildMessageElement(role, text, options = {}) {
  const div = document.createElement('div');
  div.className = `ai-message ${role}`;
  if (!options.skipStagger) {
    div.style.animationDelay = messageCount * 0.02 + 's';
  }
  messageCount++;

  const avatar = document.createElement('div');
  avatar.className = 'ai-msg-avatar';
  if (role === 'user') {
    if (typeof UserAvatar !== 'undefined') UserAvatar.applyUserAvatarElement(avatar, 'user');
    else avatar.textContent = '🧑';
  } else {
    applyAgentMessageAvatar(avatar, options);
  }
  div.appendChild(avatar);

  const content = document.createElement('div');
  content.className = 'ai-msg-content';

  const safeText = text == null ? '' : typeof text === 'object' ? JSON.stringify(text, null, 2) : String(text);
  if (typeof text === 'object') {
    content.innerHTML = `<pre style="margin:0; white-space:pre-wrap; font-family: 'Cascadia Code', 'Fira Code', Consolas, monospace; font-size:12px;">${escapeHtml(safeText)}</pre>`;
  } else {
    content.textContent = safeText;
  }
  div.appendChild(content);

  const execIdMatch = safeText.match(/\[执行ID: ([^\]]+)\]/);
  if (execIdMatch && role === 'agent') {
    const execId = execIdMatch[1];
    lastExecutionId = execId;
    addConfirmButton(content, execId);
  }
  return div;
}

let agentStatusBubble = null;
let typewriterToken = 0;

function enqueueTypewriter(role, text) {
  const job = typewriterChain.then(() => appendMessageTypewriter(role, text));
  typewriterChain = job.catch(() => {});
  return job;
}

/** 待当前及排队中的打字机全部结束后再执行（用于确认按钮、跟进条等） */
function enqueueAfterTypewriter(fn) {
  typewriterChain = typewriterChain
    .then(async () => {
      await sleepMs(80);
      await fn();
    })
    .catch((e) => console.warn('[agent-ui] enqueueAfterTypewriter:', e));
  return typewriterChain;
}

function sleepMs(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function scrollChatToBottom() {
  if (scrollChatRaf) return;
  scrollChatRaf = requestAnimationFrame(() => {
    scrollChatRaf = 0;
    const container = document.getElementById('ai-panel-messages');
    if (container) container.scrollTop = container.scrollHeight;
  });
}

function updateAgentStatusBubble(text) {
  const t = String(text || '').trim();
  if (!t) {
    if (agentStatusBubble) {
      agentStatusBubble.remove();
      agentStatusBubble = null;
    }
    return;
  }
  showEmptyState(false);
  showTypingIndicator(false);
  const container = document.getElementById('ai-panel-messages');
  if (!container) return;
  if (!agentStatusBubble) {
    agentStatusBubble = buildMessageElement('agent', '', {
      skipStagger: true,
      factionId: resolveAgentFactionId({}),
    });
    agentStatusBubble.classList.add('ai-status-message');
    const content = agentStatusBubble.querySelector('.ai-msg-content');
    if (content) content.classList.add('ai-status-content');
    const indicator = document.getElementById('ai-typing-indicator');
    if (indicator && indicator.parentNode === container) {
      container.insertBefore(agentStatusBubble, indicator);
    } else {
      container.appendChild(agentStatusBubble);
    }
  }
  const content = agentStatusBubble.querySelector('.ai-msg-content');
  if (content) content.textContent = t;
  scrollChatToBottom();
}

async function appendMessageTypewriter(role, text) {
  updateAgentStatusBubble('');
  showEmptyState(false);
  showTypingIndicator(false);

  const full = text == null ? '' : typeof text === 'object' ? JSON.stringify(text, null, 2) : String(text);
  const token = ++typewriterToken;
  const container = document.getElementById('ai-panel-messages');
  if (!container) return;

  const div = buildMessageElement(role, '', {
    skipStagger: true,
    factionId: resolveAgentFactionId({}),
  });
  const content = div.querySelector('.ai-msg-content');
  if (!content) return;

  const indicator = document.getElementById('ai-typing-indicator');
  const insert = () => {
    if (indicator && indicator.parentNode === container) {
      container.insertBefore(div, indicator);
    } else {
      container.appendChild(div);
    }
  };

  if (typeof text === 'object') {
    content.innerHTML = `<pre style="margin:0; white-space:pre-wrap; font-family: 'Cascadia Code', 'Fira Code', Consolas, monospace; font-size:12px;"></pre>`;
    const pre = content.querySelector('pre');
    insert();
    for (let i = 0; i < full.length; i += 4) {
      if (token !== typewriterToken) return;
      pre.textContent = full.slice(0, i + 4);
      scrollChatToBottom();
      await sleepMs(10);
    }
  } else {
    insert();
    for (let i = 0; i < full.length; i += 3) {
      if (token !== typewriterToken) return;
      content.textContent = full.slice(0, Math.min(i + 3, full.length));
      scrollChatToBottom();
      if (role === 'agent') await sleepMs(14);
    }
  }

  const execIdMatch = full.match(/\[执行ID: ([^\]]+)\]/);
  if (execIdMatch && role === 'agent') {
    addConfirmButton(content, execIdMatch[1]);
  }
  scrollChatToBottom();
}

function appendMessage(role, text, opts = {}) {
  const container = document.getElementById('ai-panel-messages');
  if (!container) return;

  if (role === 'agent' && opts.typewriter !== false && typeof text === 'string') {
    enqueueTypewriter(role, text);
    return;
  }
  updateAgentStatusBubble('');
  showEmptyState(false);
  const div = buildMessageElement(role, text);
  const indicator = document.getElementById('ai-typing-indicator');
  if (indicator && indicator.parentNode === container) {
    container.insertBefore(div, indicator);
  } else {
    container.appendChild(div);
  }
  scrollChatToBottom();
}

const HISTORY_DISPLAY_MAX = 60;
const HISTORY_BATCH_CHUNK = 6;

function yieldToMainThread() {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => resolve(), { timeout: 48 });
    } else {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    }
  });
}

/**
 * 批量恢复会话消息（DocumentFragment + 分帧，避免切换 Tab/打开项目时卡顿）
 * @param {Array<{role:string, content:string}>} messages
 */
async function appendMessagesBatch(messages, loadGen) {
  const container = document.getElementById('ai-panel-messages');
  if (!container || !Array.isArray(messages) || messages.length === 0) {
    if (typeof showEmptyState === 'function') showEmptyState(true);
    return;
  }

  const list =
    messages.length > HISTORY_DISPLAY_MAX
      ? messages.slice(-HISTORY_DISPLAY_MAX)
      : messages;

  showEmptyState(false);
  const indicator = document.getElementById('ai-typing-indicator');
  const insertBefore = indicator && indicator.parentNode === container ? indicator : null;

  for (let i = 0; i < list.length; i += HISTORY_BATCH_CHUNK) {
    if (loadGen != null && loadGen !== AgentSessionsLoadGen()) return;

    const slice = list.slice(i, i + HISTORY_BATCH_CHUNK);
    const fragment = document.createDocumentFragment();
    for (const m of slice) {
      const role = m.role === 'user' ? 'user' : 'agent';
      const factionId = m.role === 'assistant' ? m.factionId || null : null;
      if (m.role === 'assistant' && m.thinking) {
        const turn = buildAgentTurnElement(m.thinking, {
          skipStagger: true,
          factionId,
          collapsed: true,
          elapsedSec: 1,
          forHistory: true,
        });
        const answerEl = turn.querySelector('.ai-answer-content');
        if (answerEl) answerEl.textContent = m.content || '';
        fragment.appendChild(turn);
      } else {
        fragment.appendChild(
          buildMessageElement(role, m.content, { skipStagger: true, factionId })
        );
      }
    }
    if (insertBefore) container.insertBefore(fragment, insertBefore);
    else container.appendChild(fragment);

    if (i + HISTORY_BATCH_CHUNK < list.length) {
      await yieldToMainThread();
      if (loadGen != null && loadGen !== AgentSessionsLoadGen()) return;
    }
  }
  if (loadGen != null && loadGen !== AgentSessionsLoadGen()) return;
  container.scrollTop = container.scrollHeight;
  if (typeof UserAvatar !== 'undefined') {
    const refresh = () => UserAvatar.refreshAllUserMessageAvatars();
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(refresh, { timeout: 300 });
    } else {
      setTimeout(refresh, 0);
    }
  }
}

/** 供 appendMessagesBatch 取消过期的会话加载 */
function AgentSessionsLoadGen() {
  return typeof window.__agentSessionsLoadGen === 'number' ? window.__agentSessionsLoadGen : 0;
}

function addConfirmButton(parentElement, execId) {
  if (document.getElementById(`confirm-${execId}`)) return;
  const btn = document.createElement('button');
  btn.id = `confirm-${execId}`;
  btn.className = 'ai-confirm-btn';
  btn.textContent = '✓ 确认正确，记录到知识库';
  btn.onclick = () => {
    if (window.api && window.api.agent && window.api.agent.confirmCorrect) {
      window.api.agent.confirmCorrect(execId);
      btn.textContent = '✅ 已记录';
      btn.disabled = true;
    }
  };
  parentElement.appendChild(btn);
  const container = document.getElementById('ai-panel-messages');
  if (container) container.scrollTop = container.scrollHeight;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

