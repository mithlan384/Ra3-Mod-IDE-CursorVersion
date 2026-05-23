// main/agent-deep-thinking.js —— 深度思考正文校验与补全（全局）

const THINKING_MIN_PROSE_LEN = 12;

/** 从思考文本中提取「内心独白」部分（排除工具进度行） */
function innerThinkingBody(text) {
  const lines = String(text || '')
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const proseLines = lines.filter(
    (l) =>
      !/^[✅❌🔧🧠🗑⏪🏛📦🌐⏹]/.test(l) &&
      !/^Agent 正在|^正在根据扫描|^正在按\*\*|^🌐 正在|^🔧 |^🏛 正在|^🗑 正在/.test(l)
  );
  return proseLines
    .join(' ')
    .replace(/^嗯，\s*/, '')
    .replace(/^嗯\s*/, '')
    .trim();
}

function isSubstantialThinking(text) {
  return innerThinkingBody(text).length >= THINKING_MIN_PROSE_LEN;
}

/**
 * 生成足够长的内心推理；过短时用结构化 fallback，避免 UI 只显示「嗯，」
 * @param {string} userMessage
 * @param {string} [contextHint]
 * @param {{ boundaryBlock?: object }} [options]
 */
async function generateFullInnerThinking(userMessage, contextHint = '', options = {}) {
  const um = String(userMessage || '').trim();
  const hint = String(contextHint || '').trim();

  if (options.boundaryBlock) {
    const { buildBoundaryInnerThinking } = require('./capability-boundary');
    let thinking = buildBoundaryInnerThinking(um, options.boundaryBlock);
    try {
      const { generateInnerThinking } = require('./agent-planner');
      const llmThink = await generateInnerThinking(um, hint);
      if (isSubstantialThinking(llmThink)) thinking = llmThink;
    } catch (e) {
      console.warn('[deep-thinking] boundary LLM think:', e.message);
    }
    return thinking;
  }

  const { generateInnerThinking } = require('./agent-planner');
  let thinking = await generateInnerThinking(um, hint);
  if (isSubstantialThinking(thinking)) return thinking;

  const snippet = um.length > 72 ? `${um.slice(0, 72)}…` : um;
  const tail = hint
    ? hint.slice(0, 200)
    : '我先理解用户意图、项目与引擎边界，再决定是直接说明、查知识库还是调用工具。';
  return `嗯，用户说的是「${snippet}」。${tail}`;
}

module.exports = {
  THINKING_MIN_PROSE_LEN,
  innerThinkingBody,
  isSubstantialThinking,
  generateFullInnerThinking,
};
