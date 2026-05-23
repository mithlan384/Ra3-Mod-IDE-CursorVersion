// main/agent-progress.js —— 合并多条 Agent 进度为一条状态消息

const PROGRESS_LINE_RE =
  /^(?:🔧|📋|🌐|📖|🧠|🏛|📝|⌨️|✓|✗|⚠|○|○|▶|→|—|检索|正在|扫描|写入|注册|迁移|修复|诊断|分析|联网|步骤|模板|Insurrection|标准MOD|起义)/i;

function isProgressMessage(text) {
  const t = String(text || '').trim();
  if (!t || t.length > 1200) return false;
  if (/^\[执行ID:/.test(t)) return false;
  if (/^[✅❌]\s+\w+/.test(t) && t.length < 200) return true;
  if (/^✅[\s\S]{80,}/.test(t)) return false;
  if (/^##\s|^━━━/.test(t)) return false;
  if (PROGRESS_LINE_RE.test(t)) return true;
  if (/^   [⌨️✓✗○○·📝]/.test(t)) return true;
  if (/^\s*(?:检索|步骤)\s*\d+\//.test(t)) return true;
  if (t.length < 90 && /(…|进行中|完成|跳过|失败)$/.test(t)) return true;
  return false;
}

/** 写入文件 / 流水线步骤等：应走状态条 + 编辑器流式，勿塞进「内心思考」区 */
function isOperationalProgress(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  if (/⌨️|📝\s*写入|流式写入|对照 SDK XSD|正在执行流水线|步骤\s*\d+\/|步骤\s*\d+b/i.test(t)) return true;
  if (/^🏗️|^📐|^📂|^📚|^🌐|^📋\s*步骤/.test(t)) return true;
  if (/^   [⌨️📝✓✗○·]/.test(t)) return true;
  if (/\.xml[`'"]?/i.test(t) && t.length < 220) return true;
  return false;
}

function consolidateProgressLines(lines) {
  const unique = [];
  for (const line of lines) {
    const t = String(line || '').trim();
    if (!t) continue;
    if (unique[unique.length - 1] !== t) unique.push(t);
  }
  if (unique.length === 0) return '';
  if (unique.length <= 3) return unique.join('\n');
  const first = unique[0];
  const lastTwo = unique.slice(-2);
  const omitted = unique.length - 3;
  return [first, `… 已执行 ${unique.length} 步（省略 ${omitted} 条中间进度）…`, ...lastTwo].join('\n');
}

module.exports = { isProgressMessage, isOperationalProgress, consolidateProgressLines };
