// main/agent-message-channel.js —— 深度思考 / 回答 双通道与进度合并

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const {
  isProgressMessage,
  isOperationalProgress,
  consolidateProgressLines,
} = require('./agent-progress');

/** @type {{ win: import('electron').BrowserWindow|null, turn: object|null, deepThinking: boolean, progressBuffer: string[], thinkingStarted: number|null, thinkingFlushTimer: ReturnType<typeof setTimeout>|null, thinkingEnsurePromise: Promise<boolean>|null, lastThinkingIpcAt: number }|null} */
let ctx = null;

const THINKING_PARTS_CAP = 40;
const THINKING_PROGRESS_FLUSH_MS = 450;
const THINKING_IPC_MIN_INTERVAL_MS = 120;

function readPreferencesSafe() {
  try {
    const prefPath = path.join(app.getPath('userData'), 'preferences.json');
    if (fs.existsSync(prefPath)) {
      return JSON.parse(fs.readFileSync(prefPath, 'utf-8'));
    }
  } catch (e) {
    console.warn('[agent-message-channel] read prefs:', e.message);
  }
  return {};
}

function resolveDeepThinking(payload) {
  if (payload && typeof payload.deepThinking === 'boolean') {
    return payload.deepThinking;
  }
  const prefs = readPreferencesSafe();
  if (typeof prefs.deepThinkingEnabled === 'boolean') {
    return prefs.deepThinkingEnabled;
  }
  return true;
}

function beginMessageTurn(win, turn, deepThinking) {
  if (ctx?.thinkingFlushTimer) clearTimeout(ctx.thinkingFlushTimer);
  ctx = {
    win: win && !win.isDestroyed() ? win : null,
    turn: turn || null,
    deepThinking: !!deepThinking,
    progressBuffer: [],
    thinkingStarted: null,
    thinkingFlushTimer: null,
    thinkingEnsurePromise: null,
    lastThinkingIpcAt: 0,
  };
}

function endMessageTurn() {
  if (ctx?.thinkingFlushTimer) {
    clearTimeout(ctx.thinkingFlushTimer);
    ctx.thinkingFlushTimer = null;
  }
  flushProgressStatus();
  if (ctx?.deepThinking && ctx.win && !ctx.win.isDestroyed()) {
    const elapsedMs = ctx.thinkingStarted ? Date.now() - ctx.thinkingStarted : 0;
    ctx.win.webContents.send('agent:thinking-done', { elapsedMs });
  }
  ctx = null;
}

function isDeepThinkingActive() {
  return !!ctx?.deepThinking;
}

function sendOperationalStatus(text) {
  const s = String(text || '').trim();
  if (!s || !ctx?.win || ctx.win.isDestroyed()) return;
  ctx.win.webContents.send('agent:status', s);
}

function flushProgressStatus() {
  if (!ctx || ctx.progressBuffer.length === 0) return;
  const consolidated = consolidateProgressLines(ctx.progressBuffer);
  ctx.progressBuffer = [];
  if (!consolidated) return;
  sendOperationalStatus(consolidated);
  if (ctx.deepThinking) {
    appendThinking(consolidated, { isProgressSummary: true });
  }
}

function scheduleProgressThinkingFlush() {
  if (ctx.thinkingFlushTimer) return;
  ctx.thinkingFlushTimer = setTimeout(() => {
    ctx.thinkingFlushTimer = null;
    flushProgressStatus();
  }, THINKING_PROGRESS_FLUSH_MS);
}

/**
 * 深度思考区：只推送增量片段（replace:false），避免 UI 对全文反复打字机重播
 */
function appendThinking(text, options = {}) {
  const s = String(text ?? '').trim();
  if (!s || !ctx) return;
  if (!ctx.thinkingStarted) ctx.thinkingStarted = Date.now();
  if (ctx.turn) {
    ctx.turn.thinkingParts = ctx.turn.thinkingParts || [];
    const last = ctx.turn.thinkingParts[ctx.turn.thinkingParts.length - 1];
    if (last !== s) {
      ctx.turn.thinkingParts.push(s);
      if (ctx.turn.thinkingParts.length > THINKING_PARTS_CAP) {
        ctx.turn.thinkingParts = ctx.turn.thinkingParts.slice(-Math.floor(THINKING_PARTS_CAP * 0.75));
      }
    }
  }
  if (!ctx.win || ctx.win.isDestroyed()) return;

  const now = Date.now();
  if (
    options.isProgressSummary &&
    now - (ctx.lastThinkingIpcAt || 0) < THINKING_IPC_MIN_INTERVAL_MS
  ) {
    return;
  }
  ctx.lastThinkingIpcAt = now;

  if (options.replaceFull) {
    const full = (ctx.turn?.thinkingParts || []).join('\n\n');
    ctx.win.webContents.send('agent:thinking', { text: full || s, replace: true });
    return;
  }
  ctx.win.webContents.send('agent:thinking', {
    text: s,
    replace: false,
    instant: !!options.isProgressSummary,
  });
}

function appendAnswer(text) {
  flushProgressStatus();
  const s = String(text ?? '').trim();
  if (!s || !ctx) return;
  if (ctx.turn) {
    ctx.turn.answerParts = ctx.turn.answerParts || [];
    ctx.turn.answerParts.push(s);
  }
  if (ctx.win && !ctx.win.isDestroyed()) {
    ctx.win.webContents.send('agent:response', s);
  }
}

function shouldRouteToThinking(s, options = {}) {
  if (!ctx?.deepThinking || options.forceFinal || options.channel === 'answer') return false;
  if (options.channel === 'thinking') return true;
  if (/^###\s*待确认/.test(s)) return true;
  if (/^[✅❌🔧🧠🗑⏪🏛📦🌐]/.test(s) && s.length < 220) return true;
  if (/^⏹/.test(s)) return true;
  if (/^⚠️\s*本条为\*\*删除\*\*/.test(s)) return true;
  if (/Agent 正在分析|正在根据扫描|正在按\*\*标准|正在扫描并删除|正在诊断|正在安装 Skill|正在联网检索/.test(s)) {
    return true;
  }
  return false;
}

/**
 * 统一出站消息（兼容旧 sendAgentResponse 调用）
 */
function sendAgentResponse(win, text, options = {}) {
  if (!ctx) {
    const deep =
      options.deepThinking != null ? !!options.deepThinking : resolveDeepThinking(null);
    ctx = {
      win: win && !win.isDestroyed() ? win : null,
      turn: null,
      deepThinking: deep,
      progressBuffer: [],
      thinkingStarted: null,
    };
  } else if (win && !win.isDestroyed()) {
    ctx.win = win;
  }

  const s = String(text ?? '').trim();
  if (!s) return;

  if (options.channel === 'thinking') {
    appendThinking(s);
    return;
  }
  if (options.channel === 'answer') {
    appendAnswer(s);
    return;
  }

  if (!options.forceFinal && isOperationalProgress(s)) {
    sendOperationalStatus(s);
    return;
  }

  if (!options.forceFinal && isProgressMessage(s)) {
    ctx.progressBuffer.push(s);
    if (ctx.progressBuffer.length > 24) {
      ctx.progressBuffer = ctx.progressBuffer.slice(-20);
    }
    scheduleProgressThinkingFlush();
    return;
  }

  if (shouldRouteToThinking(s, options)) {
    appendThinking(s);
    return;
  }

  appendAnswer(s);
}

function resetProgressBuffer() {
  if (ctx) ctx.progressBuffer = [];
}

function getAccumulatedThinkingText() {
  return (ctx?.turn?.thinkingParts || []).join('\n\n');
}

/**
 * 深度思考开启时，若尚无足够长的内心独白，则补全后再发正文（全局）
 */
async function ensureSubstantialThinking(userMessage, contextHint = '', options = {}) {
  if (!ctx?.deepThinking) return false;
  const um = String(userMessage || '').trim();
  if (!um) return false;
  if (isAccumulatedThinkingSubstantial()) return true;
  if (ctx.thinkingEnsurePromise) return ctx.thinkingEnsurePromise;

  const THINKING_ENSURE_MS = 18000;
  ctx.thinkingEnsurePromise = (async () => {
    try {
      if (isAccumulatedThinkingSubstantial()) return true;
      const { generateFullInnerThinking } = require('./agent-deep-thinking');
      const thinkingPromise = generateFullInnerThinking(um, contextHint, options);
      const timeoutFallback =
        um.length > 72
          ? `嗯，用户说的是「${um.slice(0, 72)}…」。我先梳理需求与项目约束，再决定查资料或调用工具。`
          : `嗯，用户说的是「${um}」。我先梳理需求与项目约束，再决定查资料或调用工具。`;
      const thinking = await Promise.race([
        thinkingPromise,
        new Promise((resolve) => setTimeout(() => resolve(timeoutFallback), THINKING_ENSURE_MS)),
      ]);
      appendThinking(thinking);
      return true;
    } finally {
      if (ctx) ctx.thinkingEnsurePromise = null;
    }
  })();
  return ctx.thinkingEnsurePromise;
}

function isAccumulatedThinkingSubstantial() {
  const { isSubstantialThinking } = require('./agent-deep-thinking');
  return isSubstantialThinking(getAccumulatedThinkingText());
}

/** 发最终答复前先保证思考区有完整内容 */
async function deliverFinalAnswer(win, text, options = {}) {
  const um = options.userMessage || '';
  const hint = options.thinkingHint || options.contextHint || '';
  const skipEnsure =
    options.skipEnsureThinking ||
    (ctx?.turn?.thinkingParts?.length || 0) >= 2 ||
    isAccumulatedThinkingSubstantial();
  if (ctx?.deepThinking && um && !skipEnsure) {
    await ensureSubstantialThinking(um, hint, options);
  }
  flushProgressStatus();
  sendAgentResponse(win, text, { channel: 'answer', forceFinal: true });
}

module.exports = {
  resolveDeepThinking,
  beginMessageTurn,
  endMessageTurn,
  isDeepThinkingActive,
  sendAgentResponse,
  sendAgentThinking: (win, text) => sendAgentResponse(win, text, { channel: 'thinking' }),
  sendAgentAnswer: (win, text, options) => sendAgentResponse(win, text, { channel: 'answer', ...options }),
  resetProgressBuffer,
  flushProgressStatus,
  getAccumulatedThinkingText,
  isAccumulatedThinkingSubstantial,
  ensureSubstantialThinking,
  deliverFinalAnswer,
};
