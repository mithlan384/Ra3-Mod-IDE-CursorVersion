// main/search-query.js —— 从用户自然语言提取搜索词 + 结果相关性校验

const CHINESE_STOP_PHRASES = [
  '帮我', '请', '能不能', '可以', '麻烦', '想要', '我想',
  '搜索', '搜', '查', '查找', '查询', '上网查', '强制搜索', '联网', '联网搜索', '网上搜索',
  '一下', '下', '关于', '什么是', '什么叫', '有哪些', '有没有',
  '如何', '怎么', '怎样', '吗', '呢', '吧', '啊', '的', '了',
  '在', '是', '有', '我', '你', '我们', '告诉',
];

const RA3_RELEVANCE = /红警|红色警戒|命令与征服|Command\s*&\s*Conquer|Red\s*Alert|\bRA3\b|MOD\b|将军|起义|阵营|Soviet|Allied|Imperial|盟军|苏军|帝国|单位|XML|SDK|EA\s*LA/i;

const IRRELEVANT_HINT = /汉语|字典|国学|百度百科.*[^红警]|帮[,，\s]|拼音|笔顺|部首|仓颉/i;

/**
 * 用户明确要求联网/外网检索（区别于「在项目里搜单位」）
 */
function isExplicitWebSearchIntent(msg) {
  const m = String(msg || '').trim();
  if (!m) return false;
  if (/不要|别|勿|不想|别再|停止|关闭/.test(m) && /搜|联网|上网/.test(m)) return false;
  if (/强制搜索|上网查|\/search|联网搜索|联网查|网上搜|网上查|网络搜索|外网查/.test(m)) return true;
  if (/^(联网)?搜索/.test(m)) return true;
  if (/^搜[\s一下]/.test(m)) return true;
  if (/^查[\s一下]/.test(m) && !/^查(项目|看)/.test(m)) return true;
  if (/^查找(?!项目)/.test(m) && !/^查找项目/.test(m)) return true;
  if (/^查询/.test(m)) return true;
  if (/搜索一下|搜一下|帮我搜|帮我查|查一下/.test(m)) return true;
  if (
    /(搜索|搜|查|查找|查询).{0,24}(红警|警戒|RA3|征召|动员|天启|单位信息|兵种|百科|wiki)/i.test(m)
  ) {
    return true;
  }
  if (
    /(血|生命|HP|速度|造价|伤害|武器|护甲).{0,16}(等|基础|属性|信息|多少)/i.test(m) &&
    /(搜索|搜|联网|网上|查)/.test(m)
  ) {
    return true;
  }
  return false;
}

/** 在已打开的 MOD 项目目录内查找单位（非外网） */
function isProjectUnitSearchIntent(msg) {
  if (isExplicitWebSearchIntent(msg)) return false;
  if (/(项目|mod|模组|当前|目录|data|mymod)/i.test(msg) && /(找|搜索|查找|查询).{0,16}(单位|兵种)/.test(msg)) {
    return true;
  }
  if (/(找|搜索|查找|查询).{0,12}(项目|mod|模组).{0,12}(单位|兵种|里的|中的)/.test(msg)) {
    return true;
  }
  return false;
}

/**
 * 从用户整句提取适合搜索引擎的关键词（避免「帮」误匹配）
 */
function extractSearchQuery(userMessage) {
  let q = (userMessage || '').trim();
  if (!q) return '红色警戒3';

  q = q.replace(/^(帮我|请|能不能|可以)?\s*(联网)?(搜索|搜|查|查找|查询|上网查|强制搜索|联网搜索)\s*/i, '');
  q = q.replace(/^(一下|下)\s*/, '');
  q = q.replace(/[？?。！!，,；;]+$/g, '').trim();

  const quoted = q.match(/[「""]([^」""]+)[」""]/);
  if (quoted) q = quoted[1].trim();

  for (const phrase of CHINESE_STOP_PHRASES.sort((a, b) => b.length - a.length)) {
    q = q.split(phrase).join(' ');
  }

  q = q.replace(/\s+/g, ' ').trim();
  q = q.replace(/的\s+/g, ' ').replace(/\s+的$/g, '').trim();

  // 去掉单字噪声（如残留的「帮」）
  q = q
    .split(/\s+/)
    .filter((t) => t.length > 1 || /[红警RA3]/i.test(t))
    .join(' ');

  if (/阵营/.test(userMessage) && !/阵营/.test(q)) q += ' 阵营';
  if (/单位/.test(userMessage) && !/单位/.test(q)) q += ' 单位';
  if (/建筑/.test(userMessage) && !/建筑/.test(q)) q += ' 建筑';

  if (!RA3_RELEVANCE.test(q)) {
    q = `红色警戒3 ${q}`;
  }

  return q.trim() || userMessage.trim();
}

function scoreResultRelevance(query, result) {
  const blob = `${result.title || ''} ${result.snippet || ''} ${result.url || ''}`;
  let score = 0;
  if (RA3_RELEVANCE.test(blob)) score += 3;
  if (IRRELEVANT_HINT.test(blob) && !RA3_RELEVANCE.test(blob)) score -= 5;
  if (/wiki|baike|游侠|3dm|bilibili|贴吧|知乎/i.test(result.url || '')) score += 1;
  const qTokens = query.split(/\s+/).filter((t) => t.length > 1);
  for (const t of qTokens) {
    if (blob.toLowerCase().includes(t.toLowerCase())) score += 1;
  }
  return score;
}

function filterRelevantResults(query, results, minScore = 1) {
  const scored = (results || []).map((r) => ({
    ...r,
    relevanceScore: scoreResultRelevance(query, r),
  }));
  const relevant = scored.filter((r) => r.relevanceScore >= minScore);
  relevant.sort((a, b) => b.relevanceScore - a.relevanceScore);
  return { relevant, all: scored };
}

function buildSearchReport({ query, originalQuery, results, engine, usedRealWeb, retried }) {
  const { relevant, all } = filterRelevantResults(query, results);
  const lines = [];
  lines.push('━━━ 联网搜索报告 ━━━');
  lines.push(`来源: ${usedRealWeb ? `✅ 真实联网 (${engine})` : '⚠️ 非网页结果（本地/AI 兜底）'}`);
  lines.push(`原始提问: ${originalQuery}`);
  lines.push(`实际查询: ${query}${retried ? ' (已自动优化关键词)' : ''}`);
  lines.push(`相关结果: ${relevant.length}/${all.length} 条`);

  if (relevant.length === 0) {
    lines.push('\n⚠️ 未找到与红警3/MOD 明显相关的网页，可能关键词需调整。');
    if (all.length > 0) {
      lines.push('（以下为首轮返回，供参考，可能不相关）');
      all.slice(0, 2).forEach((r, i) => {
        lines.push(`${i + 1}. ${r.title}\n   ${r.url}`);
      });
    }
    return { text: lines.join('\n'), relevant, all, isLowQuality: true };
  }

  lines.push('');
  relevant.forEach((r, i) => {
    lines.push(`${i + 1}. **${r.title}**`);
    if (r.snippet) lines.push(`   ${r.snippet.substring(0, 180)}`);
    if (r.url) lines.push(`   ${r.url}`);
    lines.push('');
  });

  return { text: lines.join('\n').trim(), relevant, all, isLowQuality: false };
}

module.exports = {
  extractSearchQuery,
  filterRelevantResults,
  buildSearchReport,
  isExplicitWebSearchIntent,
  isProjectUnitSearchIntent,
  RA3_RELEVANCE,
};
