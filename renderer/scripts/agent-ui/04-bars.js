// renderer/scripts/agent-ui/04-bars.js
function removePendingActionBars(proposalId) {
  document
    .querySelectorAll(`.ai-action-proposal-bar[data-proposal-id="${proposalId}"]`)
    .forEach((el) => el.closest('.ai-action-proposal-message')?.remove());
}

function showActionProposalBar(proposal) {
  if (!proposal?.id) return;
  removePendingActionBars(proposal.id);

  const bar = document.createElement('div');
  bar.className = 'ai-action-proposal-bar';
  bar.dataset.proposalId = proposal.id;

  const title = document.createElement('div');
  title.className = 'ai-action-proposal-title';
  title.textContent = proposal.title || '确认操作';
  bar.appendChild(title);

  if (proposal.reason) {
    const reason = document.createElement('div');
    reason.className = 'ai-action-proposal-reason';
    reason.textContent = proposal.reason;
    bar.appendChild(reason);
  }

  const row = document.createElement('div');
  row.className = 'ai-action-proposal-row';

  const confirmBtn = document.createElement('button');
  confirmBtn.type = 'button';
  confirmBtn.className = 'ai-action-proposal-btn primary';
  confirmBtn.textContent = '确认执行';
  confirmBtn.onclick = () => {
    confirmBtn.disabled = true;
    cancelBtn.disabled = true;
    if (window.api?.agent?.confirmAction) {
      window.api.agent.confirmAction(proposal.id, true);
    }
    bar.dataset.consumed = 'true';
    confirmBtn.textContent = '已确认…';
  };

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'ai-action-proposal-btn';
  cancelBtn.textContent = '取消';
  cancelBtn.onclick = () => {
    confirmBtn.disabled = true;
    cancelBtn.disabled = true;
    if (window.api?.agent?.confirmAction) {
      window.api.agent.confirmAction(proposal.id, false);
    }
    bar.dataset.consumed = 'true';
    cancelBtn.textContent = '已取消';
  };

  row.appendChild(confirmBtn);
  row.appendChild(cancelBtn);
  bar.appendChild(row);

  const wrap = document.createElement('div');
  wrap.className = 'ai-message agent ai-action-proposal-message';
  const avatar = document.createElement('div');
  avatar.className = 'ai-msg-avatar';
  applyAgentMessageAvatar(avatar, {});
  wrap.appendChild(avatar);
  const content = document.createElement('div');
  content.className = 'ai-msg-content';
  content.appendChild(bar);
  wrap.appendChild(content);
  insertIntoChatFlow(wrap);
}

function showFollowUpProposalBar(payload) {
  const container = document.getElementById('ai-panel-messages');
  if (!container || !payload?.actions?.length) return;

  const sid = payload.sessionId || 'default';
  const existing = document.getElementById(`follow-up-${sid}`);
  if (existing) existing.remove();

  const bar = document.createElement('div');
  bar.className = 'ai-follow-up-bar';
  bar.id = `follow-up-${sid}`;

  if (payload.preamble) {
    const pre = document.createElement('div');
    pre.className = 'ai-follow-up-preamble';
    pre.textContent = payload.preamble;
    bar.appendChild(pre);
  }

  const row = document.createElement('div');
  row.className = 'ai-follow-up-row';
  for (const action of payload.actions) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ai-follow-up-btn' + (action.variant === 'primary' ? ' primary' : '');
    btn.textContent = action.label;
    btn.onclick = () => {
      const input = document.getElementById('ai-panel-input');
      if (!input) return;
      input.value = action.message || action.label;
      row.querySelectorAll('button').forEach((b) => (b.disabled = true));
      sendAIMessage();
    };
    row.appendChild(btn);
  }
  bar.appendChild(row);

  const wrap = document.createElement('div');
  wrap.className = 'ai-message agent ai-follow-up-message';
  wrap.dataset.sessionId = sid;
  const avatar = document.createElement('div');
  avatar.className = 'ai-msg-avatar';
  applyAgentMessageAvatar(avatar, {});
  wrap.appendChild(avatar);
  const content = document.createElement('div');
  content.className = 'ai-msg-content';
  content.appendChild(bar);
  wrap.appendChild(content);
  insertIntoChatFlow(wrap);
}

if (window.api?.agent?.onActionProposal) {
  window.api.agent.onActionProposal((proposal) => {
    showActionProposalBar(proposal);
  });
}
if (window.api?.agent?.onFollowUpProposal) {
  window.api.agent.onFollowUpProposal((payload) => {
    enqueueAfterTypewriter(() => showFollowUpProposalBar(payload));
  });
}

// ========== 新建单位 · 素材分步确认 ==========
const activeAssetWizardBars = new Map();

function removeAssetWizardBar(flowId, slotId) {
  const key = `${flowId}|${slotId}`;
  const el = activeAssetWizardBars.get(key);
  if (el) {
    el.remove();
    activeAssetWizardBars.delete(key);
  }
}

function showAppearanceChoiceStep(payload) {
  if (!payload?.flowId) return;
  const slotId = payload.slotId;
  if (!slotId) return;

  removeAssetWizardBar(payload.flowId, slotId);

  const bar = document.createElement('div');
  bar.className = 'ai-format-choice-bar ai-asset-wizard-bar ai-appearance-choice-bar';
  bar.dataset.flowId = payload.flowId;
  bar.dataset.slotId = slotId;

  const title = document.createElement('div');
  title.className = 'ai-format-choice-title';
  title.textContent = payload.title || '请选择';
  bar.appendChild(title);

  if (payload.description) {
    const desc = document.createElement('div');
    desc.className = 'ai-asset-wizard-desc';
    desc.textContent = payload.description;
    bar.appendChild(desc);
  }

  const row = document.createElement('div');
  row.className = 'ai-format-choice-row ai-appearance-choice-row';

  const options = Array.isArray(payload.options) ? payload.options : [];
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'ai-format-choice-btn';
  cancelBtn.textContent = '取消';
  cancelBtn.onclick = () => {
    options.forEach((_, i) => {
      const b = row.querySelector(`[data-opt-idx="${i}"]`);
      if (b) b.disabled = true;
    });
    cancelBtn.disabled = true;
    window.api.agent.respondAssetWizard({
      flowId: payload.flowId,
      slotId,
      action: 'cancel_flow',
      cancelled: true,
    });
    markBarDone(bar, '已取消');
  };

  options.forEach((opt, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.optIdx = String(idx);
    btn.className = 'ai-format-choice-btn warn';
    btn.textContent = opt.label || opt.id;
    btn.onclick = () => {
      options.forEach((_, i) => {
        const b = row.querySelector(`[data-opt-idx="${i}"]`);
        if (b) b.disabled = true;
      });
      cancelBtn.disabled = true;
      window.api.agent.respondAssetWizard({
        flowId: payload.flowId,
        slotId,
        action: 'confirm',
        choiceId: opt.id,
      });
      markBarDone(bar, `✓ ${opt.label || opt.id}`);
    };
    row.appendChild(btn);
  });
  row.appendChild(cancelBtn);
  bar.appendChild(row);

  const wrap = wrapFormatChoiceMessage(bar, payload.sessionId);
  wrap.classList.add('ai-asset-wizard-message', 'ai-appearance-choice-message');
  wrap.dataset.flowId = payload.flowId;
  wrap.dataset.slotId = slotId;
  insertIntoChatFlow(wrap);
  activeAssetWizardBars.set(`${payload.flowId}|${slotId}`, wrap);
}

function showAssetWizardStep(payload) {
  if (!payload?.flowId) return;
  if (payload.kind === 'choice') {
    showAppearanceChoiceStep(payload);
    return;
  }
  const slotId = payload.kind === 'clone_confirm' ? 'clone_confirm' : payload.slot?.id;
  if (!slotId) return;

  removeAssetWizardBar(payload.flowId, slotId);

  const bar = document.createElement('div');
  bar.className = 'ai-format-choice-bar ai-asset-wizard-bar';
  bar.dataset.flowId = payload.flowId;
  bar.dataset.slotId = slotId;

  const title = document.createElement('div');
  title.className = 'ai-format-choice-title';
  title.textContent = payload.title || '确认素材';
  bar.appendChild(title);

  if (payload.description) {
    const desc = document.createElement('div');
    desc.className = 'ai-asset-wizard-desc';
    desc.textContent = payload.description;
    bar.appendChild(desc);
  }
  if (payload.vanillaHint) {
    const hint = document.createElement('div');
    hint.className = 'ai-asset-wizard-hint';
    hint.textContent = payload.vanillaHint;
    bar.appendChild(hint);
  }

  const fileBox = document.createElement('div');
  fileBox.className = 'ai-asset-selected-box';
  const fileLabel = document.createElement('span');
  fileLabel.className = 'ai-asset-selected-label';
  fileLabel.textContent = payload.multiple ? '已选文件（可多选）：' : '已选文件：';
  const filePathEl = document.createElement('span');
  filePathEl.className = 'ai-asset-selected-path';
  filePathEl.textContent = payload.prefillPath || '（尚未选择）';
  filePathEl.title = payload.prefillPath || '';
  fileBox.appendChild(fileLabel);
  fileBox.appendChild(filePathEl);
  bar.appendChild(fileBox);

  let selectedPath = payload.prefillPath || '';
  let selectedPaths = payload.prefillPath ? [payload.prefillPath] : [];

  function refreshSelectedDisplay() {
    if (payload.multiple && selectedPaths.length) {
      filePathEl.textContent = selectedPaths.map((p) => pathBasename(p)).join('、');
      filePathEl.title = selectedPaths.join('\n');
      fileBox.classList.add('has-file');
    } else if (selectedPath) {
      filePathEl.textContent = selectedPath;
      filePathEl.title = selectedPath;
      fileBox.classList.add('has-file');
    }
  }

  const row = document.createElement('div');
  row.className = 'ai-format-choice-row';

  const pickBtn = document.createElement('button');
  pickBtn.type = 'button';
  pickBtn.className = 'ai-format-choice-btn';
  pickBtn.textContent = payload.multiple ? '选择文件（可多选）' : '选择文件';
  pickBtn.onclick = async () => {
    if (!window.api?.agent?.pickAssetFile) return;
    const ext = payload.slot?.extensions || ['w3x', 'w3d', 'dds', 'tga', 'wav'];
    const res = await window.api.agent.pickAssetFile({
      title: `选择：${payload.slot?.label || '素材'}`,
      extensions: ext,
      multiple: !!payload.multiple,
    });
    if (!res?.success) return;
    const paths = res.filePaths?.length ? res.filePaths : res.filePath ? [res.filePath] : [];
    if (!paths.length) return;
    if (payload.multiple) {
      selectedPaths = paths;
      selectedPath = paths[0];
    } else {
      selectedPath = paths[0];
      selectedPaths = [paths[0]];
    }
    refreshSelectedDisplay();
  };

  const skipBtn = document.createElement('button');
  skipBtn.type = 'button';
  skipBtn.className = 'ai-format-choice-btn';
  skipBtn.textContent = payload.kind === 'clone_confirm' ? '取消' : '跳过';
  skipBtn.onclick = () => {
    disableRow();
    if (payload.kind === 'clone_confirm') {
      window.api.agent.respondAssetWizard({
        flowId: payload.flowId,
        slotId,
        action: 'cancel_flow',
        cancelled: true,
      });
    } else {
      window.api.agent.respondAssetWizard({
        flowId: payload.flowId,
        slotId,
        action: 'skip',
      });
    }
    markBarDone(bar, payload.kind === 'clone_confirm' ? '已取消' : '已跳过');
  };

  const confirmBtn = document.createElement('button');
  confirmBtn.type = 'button';
  confirmBtn.className = 'ai-format-choice-btn warn';
  confirmBtn.textContent = payload.kind === 'clone_confirm' ? '确认：沿用模板素材' : '确认，下一步';
  confirmBtn.onclick = () => {
    const hasFiles = payload.multiple ? selectedPaths.length > 0 : !!selectedPath;
    if (payload.slot?.required && !hasFiles && payload.kind !== 'clone_confirm') {
      filePathEl.textContent = '（必需项：请选择文件或点跳过）';
      fileBox.classList.add('needs-file');
      return;
    }
    disableRow();
    const respondPayload = {
      flowId: payload.flowId,
      slotId,
      action: 'confirm',
    };
    if (payload.multiple && selectedPaths.length) {
      respondPayload.filePaths = selectedPaths;
      respondPayload.filePath = selectedPaths[0];
    } else if (selectedPath) {
      respondPayload.filePath = selectedPath;
    }
    window.api.agent.respondAssetWizard(respondPayload);
    const doneLabel = payload.multiple && selectedPaths.length
      ? `✓ 已确认 ${selectedPaths.length} 个文件`
      : selectedPath
        ? `✓ 已确认：${pathBasename(selectedPath)}`
        : '✓ 已确认';
    markBarDone(bar, doneLabel);
  };

  function disableRow() {
    pickBtn.disabled = true;
    skipBtn.disabled = true;
    confirmBtn.disabled = true;
  }

  if (payload.prefillPath) fileBox.classList.add('has-file');

  row.appendChild(pickBtn);
  row.appendChild(skipBtn);
  row.appendChild(confirmBtn);
  bar.appendChild(row);

  const wrap = wrapFormatChoiceMessage(bar, payload.sessionId);
  wrap.classList.add('ai-asset-wizard-message');
  wrap.dataset.flowId = payload.flowId;
  wrap.dataset.slotId = slotId;
  insertIntoChatFlow(wrap);
  activeAssetWizardBars.set(`${payload.flowId}|${slotId}`, wrap);
}

function pathBasename(p) {
  if (!p) return '';
  const parts = String(p).replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || p;
}

function markBarDone(bar, statusText) {
  bar.dataset.consumed = 'true';
  const title = bar.querySelector('.ai-format-choice-title');
  if (title && statusText) title.textContent = statusText;
}

if (window.api?.agent?.onAssetWizardStep) {
  window.api.agent.onAssetWizardStep((payload) => {
    const show = () => showAssetWizardStep(payload);
    if (payload.immediate || payload.kind === 'choice' || payload.kind === 'clone_confirm') {
      show();
    } else {
      enqueueAfterTypewriter(show);
    }
  });
}

// ========== onThinking / onResponse / onStatus / onChatDone 回调 ==========
function enqueueThinkingReplace(text) {
  const t = String(text || '').trim();
  if (!t || !liveChatTurnId) return thinkingTypewriterChain;

  const turnId = liveChatTurnId;
  const job = Promise.resolve().then(() => {
    if (turnId !== liveChatTurnId) return;
    if (typeof appendThinkingInstant === 'function') {
      appendThinkingInstant(t, turnId);
      return;
    }
    if (!bindLiveTurnPointers()) beginThinkingTurnUi();
    if (activeThinkingBody) activeThinkingBody.textContent = t;
    scrollChatToBottom();
  });
  thinkingTypewriterChain = job;
  typewriterChain = typewriterChain.then(() => job).catch(() => {});
  return job;
}

if (window.api?.agent?.onThinking) {
  window.api.agent.onThinking((data) => {
    if (!chatInFlight) return;
    resetChatTimeout();
    showTypingIndicator(false);
    if (data?.replace) {
      enqueueThinkingReplace(data?.text || '');
    } else if (data?.instant) {
      const turnId = liveChatTurnId;
      const job = Promise.resolve().then(() => {
        if (typeof appendThinkingInstant === 'function') appendThinkingInstant(data?.text || '', turnId);
      });
      thinkingTypewriterChain = thinkingTypewriterChain.then(() => job).catch(() => {});
    } else {
      enqueueThinkingText(data?.text || '');
    }
  });
}

if (window.api?.agent?.onThinkingDone) {
  window.api.agent.onThinkingDone(() => {
    if (!chatInFlight) return;
    const turnId = liveChatTurnId;
    const finish = () => {
      if (turnId !== liveChatTurnId || thinkingUiFinished) return;
      finishThinkingUi(thinkingBeginTs ? Date.now() - thinkingBeginTs : 0);
    };
    const fallback = setTimeout(finish, 1200);
    Promise.resolve(thinkingTypewriterChain)
      .then(finish)
      .catch(finish)
      .finally(() => clearTimeout(fallback));
  });
}

if (window.api && window.api.agent && window.api.agent.onStatus) {
  window.api.agent.onStatus((text) => {
    if (!chatInFlight) return;
    resetChatTimeout();
    updateAgentStatusBubble(text);
  });
}

if (window.api && window.api.agent && window.api.agent.onResponse) {
  window.api.agent.onResponse((text) => {
    if (!chatInFlight) return;
    resetChatTimeout();
    showTypingIndicator(false);
    updateAgentStatusBubble('');

    const turnId = liveChatTurnId;
    const deliverAnswer = () => {
      if (turnId !== liveChatTurnId) return;
      bindLiveTurnPointers();
      if (activeTurnEl && activeAnswerContent) {
        const prev = activeAnswerContent.textContent.trim();
        const answerJob = prev
          ? enqueueAnswerInTurn('\n\n' + text)
          : enqueueAnswerInTurn(text);
        Promise.resolve(answerJob)
          .then(() => {
            if (turnId !== liveChatTurnId || thinkingUiFinished) return;
            finishThinkingUi(thinkingBeginTs ? Date.now() - thinkingBeginTs : 0);
          })
          .catch(() => {});
      } else {
        enqueueTypewriter('agent', text).then(() => {
          if (turnId !== liveChatTurnId || thinkingUiFinished) return;
          finishThinkingUi(thinkingBeginTs ? Date.now() - thinkingBeginTs : 0);
        });
      }
    };

    Promise.resolve(thinkingTypewriterChain)
      .then(deliverAnswer)
      .catch(() => deliverAnswer());
  });
}

if (window.api && window.api.agent && window.api.agent.onChatDone) {
  window.api.agent.onChatDone(() => {
    const finalizeChatUi = () => {
      chatInFlight = false;
      setAiSendButtonMode('send');
      if (chatTimeoutId) clearTimeout(chatTimeoutId);
      showTypingIndicator(false);
      updateAgentStatusBubble('');
      thinkingTypewriterToken++;
      thinkingTypewriterChain = Promise.resolve();
      if (typeof thinkingPendingText !== 'undefined') thinkingPendingText = '';
      if (typeof thinkingFlushRaf !== 'undefined' && thinkingFlushRaf) {
        cancelAnimationFrame(thinkingFlushRaf);
        thinkingFlushRaf = 0;
      }
      if (!thinkingUiFinished) {
        finishThinkingUi(thinkingBeginTs ? Date.now() - thinkingBeginTs : 0);
      }
      const live = document.querySelector('[data-ai-turn-live="1"]');
      if (live) {
        const sec = thinkingBeginTs ? Math.max(1, Math.round((Date.now() - thinkingBeginTs) / 1000)) : 1;
        finalizeThinkingBlocksIn(live, sec);
        live.removeAttribute('data-ai-turn-live');
      }
      resetAgentTurnUi();
      if (typeof AgentSessions !== 'undefined') AgentSessions.refreshTabs();
    };

    Promise.resolve(typewriterChain)
      .then(finalizeChatUi)
      .catch(finalizeChatUi);
  });
}

async function requestProjectFormatLearn(openPanel = true) {
  if (!window.api?.agent?.ensureProjectFormatLearned) return;
  const sessionId =
    typeof AgentSessions !== 'undefined' ? AgentSessions.getActiveSessionId() : null;
  const res = await window.api.agent.ensureProjectFormatLearned({
    sessionId,
    openPanel: !!openPanel,
  });
  if (openPanel && res?.needsLearn) {
    const panel = document.getElementById('ai-panel');
    if (panel && !panel.classList.contains('open')) toggleAIPanel();
  }
  return res;
}

function getChatFlowAnchor() {
  const container = document.getElementById('ai-panel-messages');
  const indicator = document.getElementById('ai-typing-indicator');
  if (container && indicator && indicator.parentNode === container) return indicator;
  return null;
}

/** 插入到打字指示器之前，与对话消息同序滚动 */
function insertIntoChatFlow(node) {
  const container = document.getElementById('ai-panel-messages');
  if (!container || !node) return;
  const anchor = getChatFlowAnchor();
  if (anchor) container.insertBefore(node, anchor);
  else container.appendChild(node);
  showEmptyState(false);
  container.scrollTop = container.scrollHeight;
}

function wrapFormatChoiceMessage(barEl, sessionId) {
  const wrap = document.createElement('div');
  wrap.className = 'ai-message agent ai-format-choice-message';
  wrap.dataset.sessionId = sessionId || 'default';

  const avatar = document.createElement('div');
  avatar.className = 'ai-msg-avatar';
  applyAgentMessageAvatar(avatar, {});
  wrap.appendChild(avatar);

  const content = document.createElement('div');
  content.className = 'ai-msg-content ai-format-choice-content';
  content.appendChild(barEl);
  wrap.appendChild(content);
  return wrap;
}

function removePendingFormatChoiceBars(sessionId) {
  const sid = sessionId || 'default';
  document
    .querySelectorAll(`.ai-format-choice-message[data-session-id="${sid}"]:not([data-consumed="true"])`)
    .forEach((el) => el.remove());
}

function markFormatChoiceConsumed(messageWrap, mode, acknowledgeRisks) {
  if (!messageWrap) return;
  messageWrap.dataset.consumed = 'true';
  messageWrap.classList.add('ai-format-choice-consumed');
  const title = messageWrap.querySelector('.ai-format-choice-title');
  if (title) {
    title.textContent =
      mode === 'standard'
        ? '✓ 已选择：标准 MOD 格式'
        : acknowledgeRisks
          ? '✓ 已选择：当前项目格式（已确认风险）'
          : '✓ 已选择：当前项目格式';
  }
  messageWrap.querySelectorAll('.ai-format-choice-btn').forEach((b) => {
    b.disabled = true;
    b.classList.remove('warn');
    if (b.dataset.mode === mode) b.classList.add('active');
    else b.classList.remove('active');
  });
}

function formatChoiceBarId(sessionId, scanToken) {
  const sid = sessionId || 'default';
  const token = String(scanToken || Date.now()).replace(/[^a-zA-Z0-9_-]/g, '_');
  return `format-choice-${sid}-${token}`;
}

function showProjectLearnRequiredBar(payload) {
  const container = document.getElementById('ai-panel-messages');
  if (!container) return;

  const id = `learn-required-${payload?.sessionId || 'default'}`;
  const existing = document.getElementById(id);
  if (existing) {
    const wrap = existing.closest('.ai-format-choice-message');
    (wrap || existing).remove();
  }

  const bar = document.createElement('div');
  bar.className = 'ai-format-choice-bar ai-learn-required-bar';

  const title = document.createElement('div');
  title.className = 'ai-format-choice-title';
  title.textContent = payload?.fromPreferences
    ? '已选择「当前项目格式」— 需先学习本项目结构'
    : '使用当前项目格式前，需扫描并确认项目结构';
  bar.appendChild(title);

  const hint = document.createElement('div');
  hint.className = 'ai-format-learn-hint';
  hint.textContent =
    '将分析目录布局、Mod.xml 引用习惯与单位路径，并询问你是否确认采用（不会自动修改文件）。';
  bar.appendChild(hint);

  const row = document.createElement('div');
  row.className = 'ai-format-choice-row';

  const scanBtn = document.createElement('button');
  scanBtn.type = 'button';
  scanBtn.className = 'ai-format-choice-btn';
  scanBtn.textContent = payload?.hasScan ? '重新扫描并确认' : '扫描并学习当前项目';
  scanBtn.onclick = async () => {
    scanBtn.disabled = true;
    scanBtn.textContent = '正在扫描…';
    const sid =
      payload?.sessionId ||
      (typeof AgentSessions !== 'undefined' ? AgentSessions.getActiveSessionId() : null);
    const res = await window.api.agent.scanProjectLearn({ sessionId: sid });
    if (!res?.success) {
      appendMessage('agent', `❌ 扫描失败：${res?.error || '未知错误'}`);
      scanBtn.disabled = false;
      scanBtn.textContent = '扫描并学习当前项目';
      return;
    }
    learnWrap.remove();
  };
  row.appendChild(scanBtn);

  const stdBtn = document.createElement('button');
  stdBtn.type = 'button';
  stdBtn.className = 'ai-format-choice-btn';
  stdBtn.textContent = '改用标准 MOD 格式';
  stdBtn.onclick = async () => {
    const sid =
      payload?.sessionId ||
      (typeof AgentSessions !== 'undefined' ? AgentSessions.getActiveSessionId() : null);
    if (sid && window.api?.agent?.setXmlFormatMode) {
      await window.api.agent.setXmlFormatMode({ sessionId: sid, mode: 'standard' });
    }
    if (window.api?.savePreferences && window.api?.getPreferences) {
      const prefs = await window.api.getPreferences();
      await window.api.savePreferences({ ...prefs, xmlWriteMode: 'standard' });
    }
    learnWrap.remove();
    appendMessage('agent', '✅ 已切换为 **标准 MOD 格式**（默认）。');
    updateXmlWriteModeBadge('standard');
  };
  row.appendChild(stdBtn);

  bar.appendChild(row);
  const learnWrap = wrapFormatChoiceMessage(bar, payload?.sessionId);
  learnWrap.id = id;
  insertIntoChatFlow(learnWrap);
}

function updateXmlWriteModeBadge(mode) {
  const el = document.getElementById('ai-xml-mode-badge');
  if (!el) return;
  const isProject = mode === 'project';
  el.textContent = isProject ? '写入：当前项目格式' : '写入：标准 MOD 格式';
  el.classList.toggle('project-mode', isProject);
}

async function refreshXmlWriteModeBadgeFromPrefs() {
  if (!window.api?.getPreferences) return;
  const prefs = await window.api.getPreferences();
  updateXmlWriteModeBadge(prefs.xmlWriteMode === 'project' ? 'project' : 'standard');
}

function showXmlFormatChoiceBar(payload) {
  const container = document.getElementById('ai-panel-messages');
  if (!container || !payload) return;

  const sessionId = payload.sessionId || 'default';
  const scanToken = payload.scanId || payload.scannedAt || Date.now();
  removePendingFormatChoiceBars(sessionId);

  const bar = document.createElement('div');
  bar.className = 'ai-format-choice-bar';
  bar.id = formatChoiceBarId(sessionId, scanToken);

  const title = document.createElement('div');
  title.className = 'ai-format-choice-title';
  title.textContent = payload.fromPreferences
    ? '设置已更改 XML 写入格式，请确认'
    : payload.needsLearnConfirm
      ? '已扫描项目 — 请确认是否采用当前项目结构'
      : '选择 XML 写入格式（扫描完成后）';
  bar.appendChild(title);

  if (payload.needsLearnConfirm && payload.conventionsSummary) {
    const learnBox = document.createElement('div');
    learnBox.className = 'ai-format-learn-preview';
    const pre = document.createElement('pre');
    pre.textContent = payload.conventionsSummary.slice(0, 900);
    learnBox.appendChild(pre);
    bar.appendChild(learnBox);
  }

  const health = payload.compileHealth;
  if (health?.risks?.length) {
    const riskBox = document.createElement('div');
    riskBox.className = 'ai-format-risk-box';
    const head = document.createElement('div');
    head.className = 'ai-format-risk-head';
    head.textContent = `⚠️ ${health.summary || '发现结构问题'}`;
    riskBox.appendChild(head);
    const list = document.createElement('ul');
    list.className = 'ai-format-risk-list';
    const sorted = [...health.risks].sort((a, b) => {
      const o = { error: 0, warn: 1, info: 2 };
      return (o[a.severity] ?? 9) - (o[b.severity] ?? 9);
    });
    for (const r of sorted.slice(0, 6)) {
      const li = document.createElement('li');
      const icon = r.severity === 'error' ? '🔴' : r.severity === 'warn' ? '🟡' : '🔵';
      li.textContent = `${icon} ${r.title}${r.file ? ` — ${r.file}` : ''}`;
      li.title = r.message + '\n建议：' + r.fix;
      list.appendChild(li);
    }
    if (health.risks.length > 6) {
      const more = document.createElement('li');
      more.textContent = `… 另有 ${health.risks.length - 6} 项（见上方扫描报告）`;
      list.appendChild(more);
    }
    riskBox.appendChild(list);
    bar.appendChild(riskBox);
  }

  const row = document.createElement('div');
  row.className = 'ai-format-choice-row';

  const messageWrap = wrapFormatChoiceMessage(bar, sessionId);
  messageWrap.dataset.scanId = String(scanToken);

  const applyMode = async (mode, acknowledgeRisks = false) => {
    if (messageWrap.dataset.consumed === 'true') return;
    const sessionId =
      payload.sessionId ||
      (typeof AgentSessions !== 'undefined' ? AgentSessions.getActiveSessionId() : null);
    if (!sessionId || !window.api?.agent?.setXmlFormatMode) {
      fillHint(
        acknowledgeRisks
          ? '确认使用当前项目格式'
          : mode === 'standard'
            ? '按标准MOD格式编写XML'
            : '按当前项目已有结构编写XML'
      );
      sendAIMessage();
      return;
    }
    const res = await window.api.agent.setXmlFormatMode({
      sessionId,
      mode,
      acknowledgeRisks,
    });
    if (res?.success) {
      markFormatChoiceConsumed(messageWrap, mode, acknowledgeRisks);
      updateXmlWriteModeBadge(mode);
      appendMessage(
        'agent',
        mode === 'standard'
          ? '✅ 已选择：**标准 MOD 格式**。后续写入将按此规范。'
          : acknowledgeRisks
            ? '✅ 已选择：**当前项目格式**（你已确认在存在编译风险的情况下仍沿用本项目结构）。'
            : '✅ 已选择：**当前项目格式**。AI 将按本次扫描到的目录与引用习惯写入。'
      );
    } else if (res?.needsRiskAck) {
      appendMessage(
        'agent',
        '⚠️ 当前项目存在可能导致编译失败的结构。请点击 **「仍使用当前项目格式」** 确认，或改用标准 MOD 格式。'
      );
      const confirmBtn = bar.querySelector('.ai-format-choice-btn.warn');
      if (confirmBtn) confirmBtn.style.display = '';
    }
  };

  const mkBtn = (label, mode, hint, extraClass = '') => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `ai-format-choice-btn ${extraClass}`.trim();
    btn.dataset.mode = mode;
    btn.textContent = label;
    btn.title = hint;
    btn.onclick = () => applyMode(mode, false);
    return btn;
  };

  const stdBtn = mkBtn('标准 MOD 格式', 'standard', 'SDK 推荐的专业 MOD 结构（默认）');
  if (payload.preferredMode === 'standard') stdBtn.classList.add('active');
  row.appendChild(stdBtn);

  const hasBlock = health?.hasBlockingIssues;
  const projectBtn = mkBtn(
    hasBlock ? '确认：当前项目格式（有风险）' : '确认：当前项目格式',
    'project',
    '与本次扫描到的目录/引用一致；AI 将学习并沿用'
  );
  if (payload.preferredMode === 'project' || payload.needsLearnConfirm) {
    projectBtn.classList.add('active');
  }
  row.appendChild(projectBtn);

  if (hasBlock) {
    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'ai-format-choice-btn warn';
    confirmBtn.dataset.mode = 'project';
    confirmBtn.textContent = '仍使用当前项目格式';
    confirmBtn.title = '确认在存在编译风险的情况下仍沿用本项目结构';
    confirmBtn.onclick = () => applyMode('project', true);
    row.appendChild(confirmBtn);
  }

  bar.appendChild(row);
  insertIntoChatFlow(messageWrap);
}

if (window.api?.agent?.onFormatChoice) {
  window.api.agent.onFormatChoice((payload) => {
    enqueueAfterTypewriter(() => showXmlFormatChoiceBar(payload));
  });
}

if (window.api?.agent?.onProjectLearnRequired) {
  window.api.agent.onProjectLearnRequired((payload) => {
    enqueueAfterTypewriter(() => {
      if (payload?.openPanel) {
        const panel = document.getElementById('ai-panel');
        if (panel && !panel.classList.contains('open')) toggleAIPanel();
      }
      showProjectLearnRequiredBar(payload);
    });
  });
}

if (window.api?.onPreferencesChanged) {
  window.api.onPreferencesChanged((prefs) => {
    updateXmlWriteModeBadge(prefs.xmlWriteMode === 'project' ? 'project' : 'standard');
  });
}

window.requestProjectFormatLearn = requestProjectFormatLearn;
window.resetAIChatInteractionState = resetAIChatInteractionState;
window.__agentSessionsLoadGen = 0;
window.fillHintAndMaybeLearnProject = async function (text) {
  if (/当前项目|项目格式|项目结构/i.test(text)) {
    const prefs = window.api?.getPreferences ? await window.api.getPreferences() : {};
    if (prefs.xmlWriteMode === 'project') {
      const res = await requestProjectFormatLearn(true);
      if (res?.needsLearn) return;
    }
  }
  if (typeof fillHint === 'function') fillHint(text);
};

refreshXmlWriteModeBadgeFromPrefs();

