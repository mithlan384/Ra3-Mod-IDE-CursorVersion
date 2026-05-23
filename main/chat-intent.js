// main/chat-intent.js —— 由大模型判断用户意图（规则仅作 API 失败时的兜底）

const { callLLM } = require('./agent-planner');
const { buildPersonalitySystemBlock, loadPreferences } = require('./agent-personality');
const { isExplicitWebSearchIntent } = require('./search-query');
const { isOperationalCommand, isBuildLogInquiryOnly } = require('./inquiry-intent');

const VALID_ROUTES = new Set([
  'casual',
  'meta',
  'web_search',
  'offline_answer',
  'create_unit',
  'fix_build',
  'migrate_insurrection',
  'remove_mod',
  'tool_plan',
]);

/**
 * @typedef {object} ChatRouteDecision
 * @property {'casual'|'meta'|'web_search'|'offline_answer'|'tool_plan'} route
 * @property {string} reason
 * @property {number} confidence
 * @property {'llm'|'override'|'fallback'} source
 */

function parseRouteJson(raw) {
  const rawStr = String(raw || '').trim();
  if (!rawStr) throw new Error('empty router response');

  let cleaned = rawStr.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) cleaned = cleaned.slice(start, end + 1);
  else {
    const routeOnly = cleaned.match(
      /\b(casual|meta|web_search|offline_answer|create_unit|fix_build|migrate_insurrection|remove_mod|tool_plan)\b/i
    );
    if (routeOnly && VALID_ROUTES.has(routeOnly[1].toLowerCase())) {
      return {
        route: routeOnly[1].toLowerCase(),
        reason: '模型仅返回路由名',
        confidence: 0.65,
        source: 'llm',
      };
    }
  }
  cleaned = cleaned.replace(/，/g, ',').replace(/：/g, ':');

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    const routeMatch = cleaned.match(/"route"\s*:\s*"([a-z_]+)"/i);
    if (!routeMatch || !VALID_ROUTES.has(routeMatch[1])) throw e;
    const reasonMatch = cleaned.match(/"reason"\s*:\s*"([^"]*)"/);
    const confMatch = cleaned.match(/"confidence"\s*:\s*([\d.]+)/);
    parsed = {
      route: routeMatch[1],
      reason: reasonMatch ? reasonMatch[1] : '',
      confidence: confMatch ? Number(confMatch[1]) : 0.7,
    };
  }

  const route = String(parsed.route || '').trim();
  if (!VALID_ROUTES.has(route)) throw new Error(`invalid route: ${route}`);

  let confidence = Number(parsed.confidence);
  if (!Number.isFinite(confidence)) confidence = 0.7;
  confidence = Math.max(0, Math.min(1, confidence));

  return {
    route,
    reason: String(parsed.reason || '').slice(0, 80),
    confidence,
    source: 'llm',
  };
}

function formatHistorySnippet(history, maxMessages = 4) {
  if (!Array.isArray(history) || !history.length) return '（无）';
  return history
    .slice(-maxMessages)
    .map((m) => `${m.role === 'assistant' ? '助手' : '用户'}: ${String(m.content || '').slice(0, 200)}`)
    .join('\n');
}

/**
 * 调用已配置的 DeepSeek 等 API，判断本条消息应走哪条通道
 */
async function classifyWithLLM(message, context = {}) {
  const { history = [], hasProject = false, allowSearch = true } = context;
  const personalityBlock = buildPersonalitySystemBlock(loadPreferences().aiPersonality);
  const system = `你是 RA3 Mod IDE 的「意图路由器」，只负责分类，不回答问题。
${personalityBlock}
必须只输出一个 JSON 对象，不要 markdown，不要解释（单行）：
{"route":"casual|meta|web_search|offline_answer|create_unit|fix_build|migrate_insurrection|remove_mod|tool_plan","reason":"10字以内","confidence":0.9}

route 含义：
- casual：打招呼、闲聊、感谢、告别、无实质 MOD 需求
- meta：评价助手、要求别乱搜索/别扫描、问你是谁/能否正常说话
- web_search：用户明确要求「搜索/上网查/联网查」某话题，或问题必须依赖外网且与红警3/MOD 相关
- offline_answer：红警3 MOD 知识问答（概念、XML 路径、教程、怎么做），不需要改项目文件、不需要联网
- create_unit：明确要求**新建/创建**单位、步兵、坦克、僵尸等（将走专用创建流程）；**绝不是**删除/删掉
- remove_mod：明确要求**删除/删掉/移除**单位、代码、文件或某功能的 MOD 残留（如「删掉守护者相关代码」）
- fix_build：用户**明确要求**修复/解决/执行编译报错（含「自动修复」「按方案修复」），将自动改项目文件
- offline_answer：含粘贴 Warning/ErrorLog 但仅咨询「怎么回事/怎么办/为什么」、未要求自动改文件 → 先解答，勿走 fix_build
- migrate_insurrection：按标准 MOD 格式迁移或整理整个项目结构（非仅修编译）
- tool_plan：要在当前 MOD 项目里改已有内容（改属性、打开文件、列单位、分析单个 XML、搭建空项目框架等），不含「从零创建新单位」；**全项目扫描**仅当用户明确说「全部/所有/整个/全量」等（如扫描全部代码）

硬性规则（优先级最高）：
1. 默认 route 不是 web_search；绝大多数消息应是 casual、offline_answer、create_unit 或 tool_plan
2. 用户说「不要搜索」「别乱搜」「别什么都搜」→ meta，禁止 web_search
3. 「你好」「在吗」「谢谢」→ casual
4. 「新建单位」「帮我做一个苏军坦克」「创建一个僵尸步兵」→ create_unit（含新建/创建意图即可；具体中文名由后续专用提取器结合对话理解，不要求固定句式）
5. 「删掉/删除/移除…代码/文件/单位/守护者/双管…」→ remove_mod，**禁止** create_unit
6. 「把某单位血量改成200」「打开 Mod.xml」→ tool_plan
7. 粘贴编译错误且用户要求修复/执行/解决 → fix_build；仅粘贴日志或问原因/怎么办 → offline_answer
8. 「按标准 MOD 格式整理、迁移、标准化项目结构」→ migrate_insurrection
9. 「搭建框架/建立项目骨架/空项目搭建」→ tool_plan（将自动写入 XML）
10. 「修复不规范/进行修复操作/修复项目结构/按扫描结果修复」→ tool_plan（将自动改文件）
11. 「如何修改血量」且未要求改具体文件 → offline_answer
12. 「回退代码」「撤销刚才的修改」「恢复 AI 操作之前」→ rollback（T1/T2 须确认；T3 直接回退）
13. allowWebSearch=${allowSearch ? 'true' : 'false'}；若为 false，禁止 web_search
14. 当前是否已打开 MOD 项目：${hasProject ? '是' : '否'}`;

  const user = `【最近对话】
${formatHistorySnippet(history)}

【用户本条消息】
${message}`;

  const raw = await callLLM(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    { maxTokens: 280, temperature: 0.05, profile: 'summary' }
  );

  return parseRouteJson(raw);
}

/** API 不可用时的极简兜底（不追求覆盖所有句式） */
function fallbackRoute(message, { allowSearch = true, forceSearch = false } = {}) {
  const msg = String(message || '').trim();
  if (!msg) return { route: 'casual', reason: '空消息', confidence: 0.5, source: 'fallback' };
  if (forceSearch) return { route: 'web_search', reason: '强制搜索', confidence: 1, source: 'override' };
  if (/不要|别|勿|不想/.test(msg) && /搜|联网/.test(msg)) {
    return { route: 'meta', reason: '拒绝搜索', confidence: 0.9, source: 'fallback' };
  }
  if (/^(你好|您好|嗨|hello|hi|谢谢|再见)/i.test(msg) && msg.length < 12) {
    return { route: 'casual', reason: '问候', confidence: 0.85, source: 'fallback' };
  }
  if (allowSearch && isExplicitWebSearchIntent(msg)) {
    return { route: 'web_search', reason: '显式联网', confidence: 0.9, source: 'fallback' };
  }
  try {
    const { looksLikeDeleteModIntent } = require('./mod-content-remove');
    if (looksLikeDeleteModIntent(msg)) {
      return { route: 'remove_mod', reason: '删除项目内容', confidence: 0.92, source: 'fallback' };
    }
  } catch (e) {}
  if (/(新建|创建|制作).{0,8}(单位|步兵|坦克|僵尸)/.test(msg) && !/(删|移除|清除)/.test(msg)) {
    if (/新建\s*一?个[，,]/.test(msg) && !/(单位|步兵|坦克|僵尸)/.test(msg)) {
      // 「新建一个，分两组…」多为外观改造续答，勿误判为 create_unit
    } else {
      return { route: 'create_unit', reason: '新建单位', confidence: 0.75, source: 'fallback' };
    }
  }
  const { looksLikeInsurrectionMigrateIntent } = require('./insurrection-migrate');
  if (looksLikeInsurrectionMigrateIntent(msg)) {
    return { route: 'migrate_insurrection', reason: '项目结构整理', confidence: 0.93, source: 'fallback' };
  }
  const {
    looksLikeBuildErrorMessage,
    looksLikeFixBuildIntent,
    looksLikeProjectRepairIntent,
  } = require('./build-error-fixer');
  if (looksLikeProjectRepairIntent(msg)) {
    return { route: 'tool_plan', reason: '项目结构修复', confidence: 0.92, source: 'fallback' };
  }
  if (looksLikeFixBuildIntent(msg)) {
    return { route: 'fix_build', reason: '修复编译', confidence: 0.88, source: 'fallback' };
  }
  if (isBuildLogInquiryOnly(msg)) {
    return { route: 'offline_answer', reason: '编译咨询', confidence: 0.82, source: 'fallback' };
  }
  try {
    const { looksLikeScaffoldFrameworkIntent } = require('./insurrection-scaffold');
    if (looksLikeScaffoldFrameworkIntent(msg)) {
      return { route: 'tool_plan', reason: '搭建框架', confidence: 0.92, source: 'fallback' };
    }
  } catch (e) {}
  try {
    const { isRollbackRequest } = require('./agent-rollback');
    if (isRollbackRequest(msg)) {
      return { route: 'rollback', reason: '回退代码', confidence: 0.98, source: 'fallback' };
    }
  } catch (e) {}

  if (isOperationalCommand(msg)) {
    if (/(新建|创建).{0,8}(单位|步兵|坦克)/.test(msg)) {
      return { route: 'create_unit', reason: '新建单位', confidence: 0.75, source: 'fallback' };
    }
    return { route: 'tool_plan', reason: '操作请求', confidence: 0.7, source: 'fallback' };
  }
  if (/如何|怎么|什么是|为什么|怎么回事|怎么办/.test(msg)) {
    return { route: 'offline_answer', reason: '知识问答', confidence: 0.65, source: 'fallback' };
  }
  return { route: 'casual', reason: '默认闲聊', confidence: 0.4, source: 'fallback' };
}

/**
 * 统一入口：优先 LLM 判断，失败则 fallback
 * @returns {Promise<ChatRouteDecision>}
 */
async function resolveChatRoute(message, options = {}) {
  const { forceSearch = false, allowSearch = true, history = [], hasProject = false, sessionId = null } =
    options;

  if (forceSearch) {
    return { route: 'web_search', reason: '用户强制搜索', confidence: 1, source: 'override' };
  }

  if (allowSearch && isExplicitWebSearchIntent(message)) {
    return { route: 'web_search', reason: '联网检索', confidence: 0.95, source: 'override' };
  }

  try {
    const { looksLikeDeleteModIntent } = require('./mod-content-remove');
    if (looksLikeDeleteModIntent(message)) {
      return { route: 'remove_mod', reason: '删除项目内容', confidence: 0.99, source: 'override' };
    }
    const { isRollbackRequest } = require('./agent-rollback');
    if (isRollbackRequest(message)) {
      return { route: 'rollback', reason: '回退代码', confidence: 0.99, source: 'override' };
    }
    try {
      const { isReadOnlyFileAnalysisIntent } = require('./project-scanner');
      if (hasProject && isReadOnlyFileAnalysisIntent(message)) {
        return { route: 'readonly_file', reason: '单文件分析', confidence: 0.96, source: 'override' };
      }
    } catch (e) {}

    const { looksLikeScaffoldFrameworkIntent } = require('./insurrection-scaffold');
    if (looksLikeScaffoldFrameworkIntent(message)) {
      return { route: 'tool_plan', reason: '搭建框架', confidence: 0.97, source: 'override' };
    }
    const { looksLikeInsurrectionMigrateIntent } = require('./insurrection-migrate');
    if (looksLikeInsurrectionMigrateIntent(message)) {
      return { route: 'migrate_insurrection', reason: '项目结构整理', confidence: 0.97, source: 'override' };
    }
    const {
      looksLikeFixBuildIntent,
      looksLikeBuildErrorMessage,
      looksLikeProjectRepairIntent,
    } = require('./build-error-fixer');
    if (looksLikeProjectRepairIntent(message)) {
      return { route: 'tool_plan', reason: '项目结构修复', confidence: 0.96, source: 'override' };
    }
    if (looksLikeFixBuildIntent(message)) {
      return { route: 'fix_build', reason: '修复编译', confidence: 0.95, source: 'override' };
    }
    if (isBuildLogInquiryOnly(message)) {
      return { route: 'offline_answer', reason: '编译咨询', confidence: 0.94, source: 'override' };
    }
  } catch (e) {}

  try {
    const { isAppearanceInquiryActive, shouldRunAppearanceWizard } = require('./unit-appearance-flow');
    if (
      isAppearanceInquiryActive(sessionId, message, history) &&
      !shouldRunAppearanceWizard(message, sessionId, history)
    ) {
      return {
        route: 'tool_plan',
        reason: '外观改造追问',
        confidence: 0.96,
        source: 'override',
      };
    }
  } catch (e) {}

  const ruleHint = fallbackRoute(message, { allowSearch, forceSearch });
  if (ruleHint.confidence >= 0.85 && ruleHint.route !== 'casual' && ruleHint.route !== 'offline_answer') {
    return ruleHint;
  }

  try {
    const decision = await classifyWithLLM(message, { history, hasProject, allowSearch });
    if (!allowSearch && decision.route === 'web_search') {
      return { route: 'offline_answer', reason: '联网已关闭', confidence: decision.confidence, source: 'llm' };
    }
    try {
      const { looksLikeDeleteModIntent } = require('./mod-content-remove');
      if (looksLikeDeleteModIntent(message) && decision.route === 'create_unit') {
        return {
          route: 'remove_mod',
          reason: '删除而非创建',
          confidence: 0.95,
          source: 'override',
        };
      }
    } catch (e) {}
    try {
      const { isAppearanceInquiryActive, shouldRunAppearanceWizard } = require('./unit-appearance-flow');
      if (
        decision.route === 'create_unit' &&
        isAppearanceInquiryActive(options.sessionId, message, history) &&
        !shouldRunAppearanceWizard(message, options.sessionId, history)
      ) {
        return {
          route: 'tool_plan',
          reason: '外观改造追问',
          confidence: 0.95,
          source: 'override',
        };
      }
    } catch (e) {}
    return decision;
  } catch (err) {
    console.warn('[chat-intent] LLM 路由失败，使用兜底:', err.message);
    return fallbackRoute(message, { allowSearch, forceSearch });
  }
}

// 兼容旧调用（同步规则已移除，统一走 LLM）
async function classifyChatIntent(message, options) {
  const d = await resolveChatRoute(message, options);
  return d.route === 'meta' ? 'meta_no_search' : d.route === 'offline_answer' ? 'mod_question' : d.route === 'tool_plan' ? 'mod_action' : d.route === 'web_search' ? 'explicit_web' : 'casual';
}

async function shouldRunIntelligentSearch(message, options = {}) {
  const d = await resolveChatRoute(message, options);
  return d.route === 'web_search';
}

async function isCasualOrMeta(message, options = {}) {
  const d = await resolveChatRoute(message, options);
  return d.route === 'casual' || d.route === 'meta';
}

async function isOfflineKnowledgeQuestion(message, options = {}) {
  const d = await resolveChatRoute(message, options);
  return d.route === 'offline_answer';
}

module.exports = {
  resolveChatRoute,
  classifyWithLLM,
  fallbackRoute,
  classifyChatIntent,
  shouldRunIntelligentSearch,
  isOfflineKnowledgeQuestion,
  isCasualOrMeta,
};
