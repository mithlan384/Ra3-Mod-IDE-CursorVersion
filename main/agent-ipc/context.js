// main/agent-ipc/context.js — 共享状态与聊天辅助函数
const { BrowserWindow } = require('electron');
const agentTools = require('../agent-tools');
const { summarizeExecution, respondCasually, respondOfflineKnowledge } = require('../agent-planner');
const { isExplicitWebSearchIntent } = require('../search-query');
const chatSessions = require('../agent-chat-sessions');
const { getCurrentFolder } = require('../project-state');
const {
  parseFormatChoiceMessage,
  isFormatChoiceMessage,
  formatModeConfirmMessage,
} = require('../xml-format-mode');
const {
  buildRouteProposal,
  formatProposalText,
  requestUserConfirmation,
  resolveActionConfirmation,
} = require('../agent-action-gate');
const { getAiPermissionLevel, needsRouteConfirmation } = require('../ai-permission');
const { buildRoutePlanDetail, formatT3CompletionReport } = require('../agent-confirm-plan');
const { suggestFollowUpActions, isOperationalCommand } = require('../inquiry-intent');
const {
  resolveDeepThinking,
  beginMessageTurn,
  endMessageTurn,
  sendAgentResponse,
  resetProgressBuffer,
  flushProgressStatus,
  isDeepThinkingActive,
  ensureSubstantialThinking,
  deliverFinalAnswer,
  getAccumulatedThinkingText,
  isAccumulatedThinkingSubstantial,
} = require('../agent-message-channel');
const { isSubstantialThinking, generateFullInnerThinking } = require('../agent-deep-thinking');

const pendingExecutions = {};
let currentChatTurn = null;
let chatTurnFinished = false;

async function tryHandleAppearanceModFlow(ctx) {
  const {
    message,
    sessionId,
    senderWin,
    conversationHistory,
    sessionPersonality,
  } = ctx;
  const root = getCurrentFolder();
  if (!root) return false;

  const { shouldRunAppearanceWizard, runAppearanceModWizard } = require('../unit-appearance-flow');
  if (!shouldRunAppearanceWizard(message, sessionId, conversationHistory)) return false;

  const wizardResult = await runAppearanceModWizard({
    message,
    sessionId,
    senderWin,
    onProgress: (m) => sendAgentResponse(senderWin, m),
    history: conversationHistory,
    projectRoot: root,
  });

  if (wizardResult.cancelled) {
    sendAgentResponse(senderWin, '已取消外观/换模型向导。');
    return true;
  }
  if (!wizardResult.success) {
    if (wizardResult.needInquiry) {
      sendAgentResponse(
        senderWin,
        (wizardResult.error || '请先完成对话追问，再回复「开始素材向导」。') +
          '\n\n**建议**：在对话中说明改造方式、开火方式、是否有 W3X；信息齐后再发「开始素材向导」。',
        { forceFinal: true }
      );
    } else {
      const { formatBoundaryMessage } = require('../capability-boundary');
      sendAgentResponse(
        senderWin,
        formatBoundaryMessage({
          blocked: true,
          title: '外观改造向导未完成',
          reason: wizardResult.error || '未知错误',
          suggestions: [
            '勿跳过追问步骤；先回答改造方式与模型素材问题。',
            '若仅需改血量/造价且单位已在项目中，请直接说「把某某血量改成 N」。',
          ],
        }) || `❌ 向导未完成：${wizardResult.error || '未知错误'}`
      );
    }
    return true;
  }
  if (wizardResult.mode === 'data_only') {
    sendAgentResponse(
      senderWin,
      wizardResult.message ||
        '已记录为仅数据改造。请继续说明要修改的属性（如血量、造价、武器数量）。',
      { forceFinal: true }
    );
    return true;
  }
  if (!wizardResult.readyForCreate || !wizardResult.createReq) return true;

  const cr = wizardResult.createReq;
  const planMsg =
    `将新建单位 **${cr.displayName}**（ID: \`${cr.unitId}\`），模板 \`${cr.templateUnit}\`，开火方式：${cr.fireMode || '默认'}。`;
  if (!(await gateMutatingRoute(senderWin, 'create_unit', message, { planDetail: planMsg }))) {
    sendAgentResponse(senderWin, '已取消创建单位。');
    return true;
  }

  const { executeCreateUnitPipeline } = require('../create-unit-pipeline');
  const createReq = {
    displayName: cr.displayName,
    unitId: cr.unitId,
    rawMessage: [
      cr.rawMessage,
      `模板单位:${cr.templateUnit}`,
      cr.fireMode ? `开火方式:${cr.fireMode}` : '',
      cr.strategy ? `策略:${cr.strategy}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    templateUnit: cr.templateUnit,
    customAssets: cr.customAssets,
  };

  const executionId = generateExecutionId();
  const pipeResult = await runMutatingWithSnapshot(
    { label: '创建单位（外观向导）', userMessage: message, sessionId },
    () =>
      executeCreateUnitPipeline(createReq, {
        tools: agentTools,
        sessionId,
        senderWin,
        onProgress: (msg) => sendAgentResponse(senderWin, msg),
      }),
    { senderWin }
  );
  pendingExecutions[executionId] = {
    userMessage: message,
    plan: [{ tool: 'createUnit', args: createReq }],
    log: [{ tool: 'createUnit', result: pipeResult }],
    success: pipeResult.success,
  };
  if (pipeResult.success) {
    const summary = await summarizeExecution(
      [{ stepIndex: 0, tool: 'createUnit', args: createReq, result: pipeResult }],
      message,
      { aiPersonality: sessionPersonality }
    );
    sendAgentResponse(senderWin, summary + `\n[执行ID: ${executionId}]`);
    sendT3ChangeReport(senderWin, pipeResult.changedFiles || pipeResult.data?.changedFiles, '创建单位', {
      userMessage: message,
      planSummary: planMsg,
      bodyReport: summary,
    });
  } else {
    sendAgentResponse(
      senderWin,
      `❌ 创建单位失败: ${pipeResult.error || '未知错误'}\n[执行ID: ${executionId}]`
    );
  }
  return true;
}

async function gateMutatingRoute(win, route, message, extras = {}) {
  const level = getAiPermissionLevel();
  if (!needsRouteConfirmation(level, route, message)) return true;
  const proposal = buildRouteProposal(route, message);
  if (extras.planDetail) {
    proposal.planDetail = extras.planDetail;
  } else {
    const detail = buildRoutePlanDetail(route, message, extras.planOptions || {});
    if (detail) proposal.planDetail = detail;
  }
  const { isReadOnlyFileAnalysisIntent } = require('../project-scanner');
  if (!isReadOnlyFileAnalysisIntent(message)) {
    sendAgentResponse(win, formatProposalText(proposal));
  }
  return requestUserConfirmation(win, proposal);
}

function sendT3ChangeReport(win, changedFiles, title, meta = {}) {
  const level = getAiPermissionLevel();
  if (level !== 't3') return;
  const hasFiles = changedFiles?.length;
  const hasReport = meta.bodyReport || meta.planSummary || meta.userMessage;
  if (!hasFiles && !hasReport) return;
  const text = formatT3CompletionReport({
    title,
    userMessage: meta.userMessage,
    changedFiles: changedFiles || [],
    planSummary: meta.planSummary,
    bodyReport: meta.bodyReport,
  });
  sendAgentResponse(win, `\n\n${text}`, { forceFinal: true });
}

async function runMutatingWithSnapshot(meta, fn, hooks = {}) {
  const { beginAiChangeTurn, endAiChangeTurn, sendRollbackFollowUp } = require('../agent-rollback');
  beginAiChangeTurn(meta);
  let result;
  let snap = null;
  try {
    result = await fn();
  } finally {
    const changed =
      result?.changedFiles ||
      result?.data?.changedFiles ||
      (Array.isArray(result?.data?.files) ? result.data.files : null);
    snap = endAiChangeTurn({ changedFiles: changed || [] });
    if (snap && hooks.senderWin) {
      sendRollbackFollowUp(hooks.senderWin, meta.sessionId);
    }
  }
  return result;
}

function generateExecutionId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

function isSearchQuery(msg) {
  return isExplicitWebSearchIntent(msg);
}

function isOpenFileRequest(msg) {
  return /打开|开启|查看.*\.xml/i.test(msg) && /\.xml|Mod\.xml/i.test(msg);
}

function isCreationQuery(msg) {
  return ['创建', '新建', '造', '构建', '做', '添加', '加个', '增加'].some((kw) => msg.includes(kw));
}

function looksLikeNotFound(text) {
  return ['找不到', '没有找到', '未找到', '没有结果', '无法找到', '不存在', '没搜到'].some((kw) =>
    text.includes(kw)
  );
}

function getSenderWindow(event) {
  if (!event || !event.sender) return null;
  try {
    if (typeof event.sender.getOwnerBrowserWindow === 'function') {
      const win = event.sender.getOwnerBrowserWindow();
      if (win) return win;
    }
  } catch (e) {}
  return BrowserWindow.fromWebContents(event.sender);
}

/** 闲聊/知识回答：深度思考时拆成 thinking + content（全局保证思考区有完整独白） */
async function deliverAssistantReply(win, payload, fallback = '', opts = {}) {
  const userMessage = opts.userMessage || '';
  const thinkingHint = opts.thinkingHint || '';

  const hasThinkingProgress =
    (getAccumulatedThinkingText() || '').length > 80 ||
    isAccumulatedThinkingSubstantial();
  if (isDeepThinkingActive() && userMessage && !opts.skipEnsureThinking && !hasThinkingProgress) {
    await ensureSubstantialThinking(userMessage, thinkingHint, {
      boundaryBlock: opts.boundaryBlock,
    });
  }

  if (payload && typeof payload === 'object' && ('thinking' in payload || 'content' in payload || 'thinkingAlreadySent' in payload)) {
    let thinking = String(payload.thinking || '').trim();
    const content = String(payload.content || '').trim() || fallback;
    if (
      thinking &&
      !opts.thinkingAlreadySent &&
      !payload.thinkingAlreadySent &&
      !isAccumulatedThinkingSubstantial()
    ) {
      if (!isSubstantialThinking(thinking) && userMessage) {
        thinking = await generateFullInnerThinking(userMessage, thinkingHint, {
          boundaryBlock: opts.boundaryBlock,
        });
      }
      sendAgentResponse(win, thinking, { channel: 'thinking' });
    }
    if (content) sendAgentResponse(win, content, { channel: 'answer', forceFinal: true });
    else if (fallback) sendAgentResponse(win, fallback, { channel: 'answer', forceFinal: true });
    return;
  }
  const text = (typeof payload === 'string' ? payload : '').trim() || fallback;
  if (text) sendAgentResponse(win, text, { channel: 'answer', forceFinal: true });
}

function makeThinkingEmitter(win) {
  let sent = false;
  const onThinking = (text) => {
    const s = String(text || '').trim();
    if (!s) return;
    sent = true;
    sendAgentResponse(win, s, { channel: 'thinking' });
  };
  return { onThinking, get thinkingAlreadySent() { return sent; } };
}

/** 能力边界答复：深度思考时走全局 ensure + 固定正文 */
async function deliverCapabilityBoundaryReply(senderWin, capabilityBlock, userMessage) {
  const { formatBoundaryMessage } = require('../capability-boundary');
  const content = formatBoundaryMessage(capabilityBlock);
  if (!content) return;

  const category = capabilityBlock.category || 'boundary';
  let thinkingHint =
    '用户请求可能超出 MOD 数据能力。说明如何理解诉求、引擎/IDE 限制；不要复述系统正文全文。';
  if (category === 'spectator_not_mod') {
    thinkingHint =
      '用户问观战或实时看遭遇战。须区分：①参战战败观战=原版 ②看别人打=地图 PlyrCreeps/PlyrCivilian+观战位 ③满员3v3再加观众=MOD做不到。';
  } else if (category === 'multiplayer_slots') {
    thinkingHint = '用户想改遭遇战人数。说明 RA3 房间最多 6 槽，勿承诺 MOD 可改 8 人。';
  }

  await deliverAssistantReply(
    senderWin,
    { content, thinkingAlreadySent: false },
    content,
    {
      userMessage,
      thinkingHint,
      boundaryBlock: capabilityBlock,
      thinkingAlreadySent: false,
      skipEnsureThinking: false,
    }
  );
}

function parseChatPayload(payload) {
  if (typeof payload === 'string') {
    return { sessionId: null, message: payload.trim(), deepThinking: resolveDeepThinking(null) };
  }
  return {
    sessionId: payload?.sessionId || null,
    message: String(payload?.message || '').trim(),
    deepThinking: resolveDeepThinking(payload),
  };
}

function emitFormatChoiceAfterScan(sessionId, scan, win, extra = {}) {
  if (!sessionId || !scan || !win || win.isDestroyed()) return;
  let preferredMode = 'standard';
  try {
    const { getXmlWriteModePreference } = require('../xml-write-prefs');
    preferredMode = getXmlWriteModePreference();
  } catch {
    /* ignore */
  }
  win.webContents.send('agent:format-choice', {
    sessionId,
    scannedAt: scan.scannedAt,
    scanId: scan.scannedAt || String(Date.now()),
    projectName: scan.projectName,
    layoutProfile: scan.conventions?.layoutProfile,
    commandProfile: scan.conventions?.commandProfile,
    conventionsSummary: scan.conventions?.compactForLLM?.slice(0, 1200) || '',
    compileHealth: scan.compileHealth,
    hasBlockingIssues: scan.compileHealth?.hasBlockingIssues,
    preferredMode,
    needsLearnConfirm: preferredMode === 'project',
    ...extra,
  });
}

/** 写入扫描上下文；仅当 options.promptFormatChoice 为 true 时弹出 XML 格式选择（用户主动扫描） */
function applyScanToSession(sessionId, toolResult, win, options = {}) {
  if (!sessionId || !toolResult?.success || !toolResult.data) return;
  const scan = toolResult.data.scan || toolResult.data;
  chatSessions.setProjectContext(sessionId, scan);
  if (options.promptFormatChoice && win && !win.isDestroyed()) {
    emitFormatChoiceAfterScan(sessionId, scan, win, options.formatChoiceExtra || {});
  }
}

function finishChatTurn(win) {
  if (chatTurnFinished) return;
  chatTurnFinished = true;
  const turn = currentChatTurn;
  currentChatTurn = null;
  endMessageTurn();
  if (turn?.sessionId) {
    const thinking = (turn.thinkingParts || []).join('\n\n').trim();
    const answer = (turn.answerParts || turn.parts || []).join('\n\n').trim();
    const legacy = (turn.parts || []).join('\n\n').trim();
    const content = answer || legacy;
    if (content || thinking) {
      try {
        const { getActiveFactionIdForChat } = require('../agent-theme-resolve');
        const factionId = getActiveFactionIdForChat(null);
        chatSessions.appendMessage(turn.sessionId, 'assistant', content || '(无正文)', null, {
          factionId: factionId || undefined,
          thinking: thinking || undefined,
        });
      } catch (e) {
        console.warn('[Agent] 保存会话记忆失败:', e.message);
      }
    }
  }
  if (win && !win.isDestroyed()) {
    win.webContents.send('agent:status', '');
    win.webContents.send('agent:chat-done', { sessionId: turn?.sessionId || null });
  }
}

module.exports = {
  agentTools,
  chatSessions,
  pendingExecutions,
  getCurrentChatTurn: () => currentChatTurn,
  setCurrentChatTurn: (t) => { currentChatTurn = t; },
  getChatTurnFinished: () => chatTurnFinished,
  setChatTurnFinished: (v) => { chatTurnFinished = v; },
  tryHandleAppearanceModFlow,
  gateMutatingRoute,
  sendT3ChangeReport,
  runMutatingWithSnapshot,
  generateExecutionId,
  isSearchQuery,
  isOpenFileRequest,
  isCreationQuery,
  looksLikeNotFound,
  getSenderWindow,
  deliverAssistantReply,
  makeThinkingEmitter,
  deliverCapabilityBoundaryReply,
  parseChatPayload,
  emitFormatChoiceAfterScan,
  applyScanToSession,
  finishChatTurn,
  sendAgentResponse,
  resetProgressBuffer,
  flushProgressStatus,
  beginMessageTurn,
  deliverFinalAnswer,
  isDeepThinkingActive,
  getAiPermissionLevel,
  resolveActionConfirmation,
  formatProposalText,
  requestUserConfirmation,
  buildRouteProposal,
  needsRouteConfirmation,
  buildRoutePlanDetail,
  formatT3CompletionReport,
  suggestFollowUpActions,
  isOperationalCommand,
  respondCasually,
  respondOfflineKnowledge,
  summarizeExecution,
  getCurrentFolder,
  parseFormatChoiceMessage,
  isFormatChoiceMessage,
  formatModeConfirmMessage,
};
