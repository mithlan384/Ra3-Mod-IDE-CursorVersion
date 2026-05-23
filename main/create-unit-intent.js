// main/create-unit-intent.js —— 新建单位：LLM 理解对话提取参数（正则仅作快速/离线兜底）

const { callLLM } = require('./agent-planner');
const { parseCreateUnitRequest, finalizeCreateReq } = require('./create-unit-pipeline');

function formatHistorySnippet(history, maxMessages = 6) {
  if (!Array.isArray(history) || !history.length) return '';
  return history
    .slice(-maxMessages)
    .map((m) => `${m.role === 'assistant' ? '助手' : '用户'}: ${String(m.content || '').slice(0, 240)}`)
    .join('\n');
}

function isSuspiciousDisplayName(name) {
  const n = String(name || '').trim();
  if (!n || n.length < 2) return true;
  if (/^(叫|名为|叫做|一个|个|的)/.test(n)) return true;
  if (/的单位$/.test(n)) return true;
  return false;
}

function parseExtractJson(raw) {
  let cleaned = String(raw || '')
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) cleaned = cleaned.slice(start, end + 1);
  const parsed = JSON.parse(cleaned);
  const displayName = String(parsed.displayName || parsed.name || '').trim();
  if (!displayName || displayName === 'null') return null;
  const side = parsed.side ? String(parsed.side).trim() : null;
  let templateHint = parsed.templateHint ? String(parsed.templateHint).trim() : null;
  if (!templateHint && parsed.templateUnit) templateHint = String(parsed.templateUnit);
  return {
    displayName,
    side: side && /^(Allied|Soviet|Japan)$/i.test(side) ? side : null,
    templateHint: templateHint || null,
    unitId: parsed.unitId ? String(parsed.unitId).trim() : null,
    confidence: Number(parsed.confidence) || 0.75,
    source: 'llm',
  };
}

/**
 * 用大模型从当前句 + 最近对话提取新建单位关键信息
 */
async function extractCreateUnitWithLLM(message, history = []) {
  const hist = formatHistorySnippet(history);
  const system = `你是 RA3 MOD IDE 的「新建单位信息提取器」。只分析用户是否要**新建/创建**游戏单位，并抽取参数。
必须只输出一个 JSON 对象（不要 markdown）：
{"displayName":"中文单位名","side":"Soviet|Allied|Japan|null","templateHint":"参考原版单位中文名或null","unitId":null,"confidence":0.0~1}

规则：
1. displayName 只要核心名称（如「超级磁暴步兵」），不要含「叫」「的单位」「新建」等
2. 本条不完整时，结合【最近对话】补全（如上条说「苏军超级磁暴步兵」、本条说「新建一个」）
3. 若用户其实在删除/修改已有单位、或纯闲聊，displayName 设为 null
4. side 从「苏军/盟军/日本/苏联/帝国」等推断，无法推断用 null
5. templateHint 仅当用户明确要仿某原版单位时填写`;

  const user = `${hist ? `【最近对话】\n${hist}\n\n` : ''}【用户本条】\n${message}`;

  const raw = await callLLM(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    { maxTokens: 160, temperature: 0.08, profile: 'summary' }
  );

  const extracted = parseExtractJson(raw);
  if (!extracted || isSuspiciousDisplayName(extracted.displayName)) return null;

  const req = finalizeCreateReq(extracted.displayName, message);
  req.side = extracted.side;
  req.templateHint = extracted.templateHint;
  if (extracted.unitId) req.unitId = extracted.unitId;
  req.confidence = extracted.confidence;
  req.source = 'llm';
  return req;
}

/**
 * 统一入口：正则快速路径 → LLM 理解对话（含历史）
 */
async function resolveCreateUnitRequest(message, history = [], options = {}) {
  const { preferLlm = false, skipLlm = false } = options;
  const regexReq = parseCreateUnitRequest(message);

  if (!preferLlm && regexReq && !isSuspiciousDisplayName(regexReq.displayName)) {
    return { ...regexReq, source: 'regex', confidence: 0.85 };
  }

  if (!skipLlm) {
    try {
      const llmReq = await extractCreateUnitWithLLM(message, history);
      if (llmReq) return llmReq;
    } catch (e) {
      console.warn('[create-unit-intent] LLM 提取失败:', e.message);
    }
  }

  if (regexReq && !isSuspiciousDisplayName(regexReq.displayName)) {
    return { ...regexReq, source: 'regex', confidence: 0.7 };
  }

  return null;
}

module.exports = {
  extractCreateUnitWithLLM,
  resolveCreateUnitRequest,
  isSuspiciousDisplayName,
};
