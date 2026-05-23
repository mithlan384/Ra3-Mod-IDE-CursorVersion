// main/game-search-rank.js —— 游戏单位联网搜索：相关性打分（支持 LLM 检索方案）

const BLOCKLIST =
  /红色文化|红色基因|红色传统|红色足迹|求是网|川观新闻|国际在线|央广网|爱词霸|iciba|cambridge|dictionary|词典|翻译|音标|RED\s*Digital|qstheory|cyol\.com|软件下载|电脑版|正版下载|Alert\s*2|红色江山|习话|党史|马克思主义/i;

const GAME_MARKERS =
  /红色警戒\s*3|红警\s*3|Red\s*Alert\s*3|命令与征服|Command\s*&\s*Conquer|\bcnc\b|萌娘百科|moegirl|fandom\.com\/wiki|盟军|Allied|Soviet|苏联|帝国|Japan|Peacekeeper|Conscript|Imperial|Tengu|Apocalypse/i;

/** @deprecated 使用 resolveGameSearchPlan */
function getUnitSearchContext(userMessage) {
  const { fallbackPlan } = require('./game-search-plan');
  const p = fallbackPlan(userMessage);
  return {
    unitCn: p.unitCn,
    unitEn: p.unitEn,
    faction: p.faction,
    excludePhrases: p.excludePhrases,
    requiresGameContext: p.requiresGameContext,
  };
}

function planToCtx(plan) {
  return {
    unitCn: plan.unitCn || '',
    unitEn: plan.unitEn || '',
    faction: plan.faction || '',
    excludePhrases: plan.excludePhrases || [],
    requiresGameContext: plan.requiresGameContext !== false,
  };
}

/**
 * @param {object} result
 * @param {object} ctx - planToCtx 输出
 */
function scoreGameUnitRelevance(result, ctx = {}) {
  const unitCn = ctx.unitCn || '';
  const unitEn = ctx.unitEn || '';
  const title = result.title || '';
  const snippet = result.snippet || '';
  const pageText = (result.pageText || '').slice(0, 2000);
  const url = result.url || '';
  const blob = `${title} ${snippet} ${pageText} ${url}`;

  if (BLOCKLIST.test(blob)) return -100;
  if (/^red\s+means|red是什么意思|what does red mean/i.test(blob)) return -100;
  if (/\bred\b/i.test(blob) && !GAME_MARKERS.test(blob)) return -100;

  for (const phrase of ctx.excludePhrases || []) {
    if (phrase && blob.includes(phrase)) return -100;
  }

  if (unitCn && /维和/.test(unitCn)) {
    if (/联合国|中国维和|维和部队|蓝盔|军事和平|赴黎|军网|国防部/i.test(blob) && !GAME_MARKERS.test(blob)) {
      return -100;
    }
  }

  const needsGame = ctx.requiresGameContext !== false;
  const hasGameMarker = GAME_MARKERS.test(blob);
  const hasUnitRef =
    (unitCn && blob.includes(unitCn)) ||
    (unitEn && new RegExp(unitEn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(blob));

  if (needsGame && !hasGameMarker && !hasUnitRef) return -100;
  if (needsGame && /维和/.test(unitCn) && !/Peacekeeper|和平卫士|盟军|Allied|红警|警戒|萌娘|fandom/i.test(blob)) {
    return -100;
  }

  let score = 0;

  if (unitCn && blob.includes(unitCn)) score += 16;
  if (unitEn && unitEn.length > 2) {
    try {
      if (new RegExp(unitEn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(blob)) score += 18;
    } catch (e) {}
  }
  if (hasGameMarker) score += 10;
  if (/盟军|Allied/i.test(blob) && ctx.faction === 'Allied') score += 4;
  if (/苏联|Soviet/i.test(blob) && ctx.faction === 'Soviet') score += 4;
  if (/帝国|Japan/i.test(blob) && ctx.faction === 'Japan') score += 4;

  if (/baike\.baidu\.com\/item/i.test(url) && hasGameMarker) score += 14;
  if (/baike\.baidu\.com\/search/i.test(url)) score -= 50;
  if (result.source === 'baike-direct') score += 25;
  if (/moegirl\.org/i.test(url)) score += 14;
  if (/fandom\.com\/wiki/i.test(url) && hasGameMarker) score += 16;

  if (result.source === 'seed') score += 20;

  return score;
}

function filterGameUnitResults(results, ctx, minScore = 8) {
  const scored = (results || [])
    .map((r) => ({
      ...r,
      relevanceScore: scoreGameUnitRelevance(r, ctx),
    }))
    .filter((r) => r.relevanceScore >= minScore);
  scored.sort((a, b) => b.relevanceScore - a.relevanceScore);
  return scored;
}

/** @deprecated 使用 buildDynamicSeeds(plan) */
function buildEncyclopediaSeeds() {
  return [];
}

module.exports = {
  scoreGameUnitRelevance,
  filterGameUnitResults,
  buildEncyclopediaSeeds,
  getUnitSearchContext,
  planToCtx,
  BLOCKLIST,
  GAME_MARKERS,
};
