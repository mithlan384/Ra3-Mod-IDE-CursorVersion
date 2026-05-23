// renderer/scripts/agent-ui/01-state.js
// renderer/scripts/agent-ui.js
let lastExecutionId = null;
let messageCount = 0;           // 追踪消息数量
let typingIndicator = null;     // 正在输入指示器
/** 串行化打字机与后续 UI（确认框等须等上一条说完） */
let typewriterChain = Promise.resolve();

// 阶段5新增：搜索控件引用
let searchToggle, forceSearchBtn;
let deepThinkingToggle;

/** 深度思考：当前轮次的合并消息 DOM */
let activeTurnEl = null;
let activeThinkingBody = null;
let activeAnswerContent = null;
let thinkingBeginTs = null;
let thinkingTypewriterChain = Promise.resolve();
let thinkingTypewriterToken = 0;
let thinkingUiFinished = false;
/** 深度思考 IPC 合并刷新，避免每条进度触发同步布局导致假卡死 */
let thinkingPendingText = '';
let thinkingFlushRaf = 0;
let scrollChatRaf = 0;
/** 每轮用户发送递增，用于丢弃过期 IPC、保证只有一个「进行中」思考区 */
let liveChatTurnId = 0;

/** 与 agent-panel.css 滑入动画一致，避免动画帧内触发 Monaco layout */
const AI_PANEL_ANIM_MS = 360;
let aiPanelLayoutTimer = null;

