// renderer/scripts/agent-sessions.js —— Cursor 风格多会话 Tab



const AgentSessions = (() => {

  let sessions = [];

  let activeSessionId = null;

  let projectPath = null;



  function sessionsApi() {

    return window.api?.agent?.sessions;

  }



  async function loadForProject(path) {

    projectPath = path || null;

    if (!sessionsApi() || !projectPath) {

      sessions = [];

      activeSessionId = null;

      renderTabs();

      return;

    }

    const res = await sessionsApi().list();

    if (!res?.success) {

      sessions = [];

      activeSessionId = null;

      renderTabs();

      return;

    }

    sessions = res.data?.sessions || [];

    activeSessionId = res.data?.activeSessionId || sessions[0]?.id || null;

    if (!activeSessionId) {

      const created = await sessionsApi().create('新对话');

      if (created?.success) {

        activeSessionId = created.data.id;

        sessions = [{ id: created.data.id, title: created.data.title, messageCount: 0 }];

      }

    }

    renderTabs();

    bumpLoadGeneration();
    scheduleLoadActiveSessionMessages();

  }



  let loadMessagesGeneration = 0;

  function bumpLoadGeneration() {
    loadMessagesGeneration++;
    if (typeof window !== 'undefined') {
      window.__agentSessionsLoadGen = loadMessagesGeneration;
    }
    return loadMessagesGeneration;
  }

  async function loadActiveSessionMessages() {
    if (!activeSessionId || !sessionsApi()) return;

    const gen = loadMessagesGeneration;
    const sessionId = activeSessionId;

    const res = await sessionsApi().get(sessionId);
    if (!res?.success || gen !== loadMessagesGeneration || sessionId !== activeSessionId) {
      return;
    }

    const msgs = res.data?.messages || [];
    if (gen !== loadMessagesGeneration || sessionId !== activeSessionId) return;

    if (msgs.length === 0) {
      if (typeof showEmptyState === 'function') showEmptyState(true);
    } else if (typeof appendMessagesBatch === 'function') {
      await appendMessagesBatch(msgs, gen);
    } else {
      msgs.forEach((m) => {
        if (typeof appendMessage === 'function') {
          appendMessage(m.role === 'user' ? 'user' : 'agent', m.content, { persist: false });
        }
      });
    }
  }

  /** 先清空界面再异步拉取消息，避免删除/切换会话时长时间卡住输入 */
  function scheduleLoadActiveSessionMessages() {
    bumpLoadGeneration();
    if (typeof window.resetAIChatInteractionState === 'function') {
      window.resetAIChatInteractionState();
    }
    if (typeof clearAIMessages === 'function') clearAIMessages(true);

    const run = () => loadActiveSessionMessages();
    setTimeout(run, 0);
  }



  function renderTabs() {

    const bar = document.getElementById('ai-session-tabs');

    if (!bar) return;

    bar.innerHTML = '';



    const scroll = document.createElement('div');

    scroll.className = 'ai-session-tabs-scroll';



    sessions.forEach((s) => {

      const tab = document.createElement('div');

      tab.className = 'ai-session-tab' + (s.id === activeSessionId ? ' active' : '');

      tab.title = s.title;



      const label = document.createElement('span');

      label.className = 'ai-session-tab-label';

      label.textContent = s.title || '新对话';

      tab.appendChild(label);



      const closeBtn = document.createElement('button');

      closeBtn.className = 'ai-session-tab-close';

      closeBtn.innerHTML = '×';

      closeBtn.title = '关闭会话';

      closeBtn.addEventListener('click', (e) => {

        e.stopPropagation();

        closeSession(s.id);

      });

      tab.appendChild(closeBtn);



      tab.addEventListener('click', () => switchSession(s.id));

      scroll.appendChild(tab);

    });



    bar.appendChild(scroll);



    const addBtn = document.createElement('button');

    addBtn.className = 'ai-session-tab-add';

    addBtn.title = '新建会话';

    addBtn.textContent = '+';

    addBtn.addEventListener('click', () => createSession());

    bar.appendChild(addBtn);

  }



  async function switchSession(sessionId) {

    if (sessionId === activeSessionId) return;

    if (typeof chatInFlight !== 'undefined' && chatInFlight) {

      alert('请等待当前回复完成后再切换会话');

      return;

    }

    await sessionsApi().setActive(sessionId);

    activeSessionId = sessionId;

    renderTabs();

    scheduleLoadActiveSessionMessages();

  }



  async function createSession() {

    if (!sessionsApi()) return;

    const res = await sessionsApi().create();

    if (!res?.success) return;

    sessions.push({ id: res.data.id, title: res.data.title, messageCount: 0 });

    await switchSession(res.data.id);

  }



  async function closeSession(sessionId) {

    const s = sessions.find((x) => x.id === sessionId);

    const name = s?.title || '此会话';

    if (!confirm(`确定关闭会话「${name}」吗？\n关闭后会话记录将删除，且无法恢复。`)) return;

    bumpLoadGeneration();

    if (typeof chatInFlight !== 'undefined' && chatInFlight) {
      const abortMsg =
        sessionId === activeSessionId
          ? '当前会话正在回复，关闭将终止任务。是否继续？'
          : '有其他会话正在回复，关闭标签不会停止后台任务。是否继续关闭？';
      if (!confirm(abortMsg)) return;
      if (sessionId === activeSessionId && window.api?.agent?.abortChat) {
        window.api.agent.abortChat();
      }
    }
    if (typeof window.resetAIChatInteractionState === 'function') {
      window.resetAIChatInteractionState();
    }

    if (typeof clearAIMessages === 'function') clearAIMessages(true);

    const res = await sessionsApi().delete(sessionId);

    if (!res?.success) {

      alert(res?.error || '无法关闭（至少保留一个会话）');

      return;

    }

    sessions = sessions.filter((x) => x.id !== sessionId);

    activeSessionId = res.data?.activeSessionId || sessions[0]?.id;

    renderTabs();

    scheduleLoadActiveSessionMessages();

    const input = document.getElementById('ai-panel-input');
    if (input) {
      input.focus();
      input.disabled = false;
    }

  }



  async function refreshTabs() {

    if (!projectPath || !sessionsApi()) return;

    const res = await sessionsApi().list();

    if (res?.success) {

      sessions = res.data.sessions || [];

      activeSessionId = res.data.activeSessionId;

    }

    renderTabs();

  }



  function getActiveSessionId() {

    return activeSessionId;

  }

  async function reloadActiveSessionMessages() {
    bumpLoadGeneration();
    if (typeof clearAIMessages === 'function') clearAIMessages(false);
    await loadActiveSessionMessages();
  }

  return {

    loadForProject,

    refreshTabs,

    getActiveSessionId,

    createSession,

    reloadActiveSessionMessages,

  };

})();

if (typeof window !== 'undefined') {
  window.AgentSessions = AgentSessions;
}

