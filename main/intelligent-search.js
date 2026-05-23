// main/intelligent-search.js —— LLM 规划检索词 + 多源搜索 + 正文校验 + 总结

const { extractSearchQuery } = require('./search-query');
const { searchBaidu, searchPublicWebAggregated, searchTargetSites } = require('./search-engine');
const { enrichResultsWithPageContent } = require('./web-page-fetch');
const { resolveGameSearchPlan, buildDynamicSeeds } = require('./game-search-plan');
const { filterGameUnitResults, planToCtx, scoreGameUnitRelevance } = require('./game-search-rank');
const {
  fetchGameUnitFromBaike,
  isBaikeSearchUrl,
  isLikelyWrongBaikeItem,
} = require('./baike-fetch');
const { callLLM } = require('./agent-planner');

function isGameUnitInfoQuery(userMessage) {
  const m = String(userMessage || '');
  if (/(mod|xml|sdk|改|修改|创建|新建|inherit|gameobject)/i.test(m) && !/信息|数据|介绍/.test(m)) {
    return false;
  }
  return (
    (/(单位|兵种|步兵|坦克|飞机|舰船|英雄)/.test(m) &&
      /(信息|数据|属性|血量|生命|速度|造价|武器|技能|伤害|护甲|介绍|怎么样|是什么)/.test(m)) ||
    /(搜索|搜|查).{0,24}(红警|警戒|RA3).{0,24}(单位|兵种|步兵|坦克)/i.test(m) ||
    /阵营.{0,8}.{0,12}(兵|坦克|单位)/.test(m)
  );
}

function dedupeResults(results) {
  const seen = new Set();
  return results.filter((r) => {
    if (isBaikeSearchUrl(r.url)) return false;
    const key = (r.url || r.title || '').toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function stripBadBaike(results, ctx) {
  return (results || []).filter((r) => !isLikelyWrongBaikeItem(r, ctx));
}

/** 游戏单位：LLM 生成检索方案 → 多词搜索 → 严格过滤 */
async function runGameUnitSearch(userMessage, onProgress) {
  onProgress('🧠 正在分析单位与检索关键词…');
  const plan = await resolveGameSearchPlan(userMessage);
  const ctx = planToCtx(plan);
  const engines = new Set();

  onProgress(
    `   → 单位：${plan.unitCn || '—'}${plan.unitEn ? `（${plan.unitEn}）` : ''}` +
      `${plan.faction && plan.faction !== 'unknown' ? ` [${plan.faction}]` : ''}`
  );

  let all = [...buildDynamicSeeds(plan)];

  onProgress('📖 正在读取百度百科词条…');
  const baikeHit = await fetchGameUnitFromBaike(plan);
  if (baikeHit) {
    all.unshift(baikeHit);
    engines.add('baike-direct');
    onProgress(`   ✓ 百度百科已获取（${baikeHit.pageText.length} 字）`);
  } else {
    onProgress('   ⚠ 百度百科未命中，继续多源检索…');
  }

  const queries = [...new Set(plan.searchQueries || [])].slice(0, 8);
  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    onProgress(`🌐 检索 ${i + 1}/${queries.length}：${q}`);
    try {
      const baiduRaw = await searchBaidu(q, 12);
      engines.add('baidu');
      const baikeOnly = baiduRaw.filter((r) => /baike\.baidu\.com\/item/i.test(r.url || ''));
      const fromBaidu = filterGameUnitResults(baikeOnly.length ? baikeOnly : baiduRaw, ctx, 8);
      all.push(...fromBaidu);

      const { results, engines: eng } = await searchPublicWebAggregated(q, 8);
      eng.forEach((e) => engines.add(e));
      const fromWeb = filterGameUnitResults(results, ctx, 8);
      all.push(...fromWeb);

      onProgress(`   ✓ 保留 ${fromBaidu.length + fromWeb.length} 条相关`);
    } catch (e) {
      onProgress(`   ✗ ${e.message}`);
    }
  }

  let merged = dedupeResults(stripBadBaike(filterGameUnitResults(all, ctx, 8), ctx));

  if (merged.length < 3) {
    onProgress('🌐 补充检索游戏攻略站…');
    try {
      const siteQ = `红色警戒3 ${plan.unitCn || plan.unitEn || ''}`.trim();
      const siteHits = stripBadBaike(
        filterGameUnitResults(await searchTargetSites(siteQ, 4), ctx, 6),
        ctx
      );
      all.push(...siteHits);
      engines.add('gamersky+bilibili');
      merged = dedupeResults(stripBadBaike(filterGameUnitResults(all, ctx, 8), ctx));
    } catch (e) {
      onProgress(`   ✗ 攻略站：${e.message}`);
    }
  }

  if (merged.length === 0) {
    onProgress('⚠️ 无结果，尝试百科直达…');
    merged = stripBadBaike(buildDynamicSeeds(plan), ctx);
    if (baikeHit) merged = dedupeResults([baikeHit, ...merged]);
  }

  return {
    merged: merged.slice(0, 12),
    engines,
    anyRealWeb: true,
    ctx,
    plan,
  };
}

async function runGeneralSearch(angles, onProgress) {
  const allResults = [];
  const engines = new Set();
  for (let i = 0; i < angles.length; i++) {
    onProgress(`🌐 检索 ${i + 1}/${angles.length}：${angles[i]}`);
    try {
      const { results, engines: eng } = await searchPublicWebAggregated(angles[i], 8);
      eng.forEach((e) => engines.add(e));
      allResults.push(...results);
      onProgress(`   ✓ ${results.length} 条`);
    } catch (e) {
      onProgress(`   ✗ ${e.message}`);
    }
  }
  const query = extractSearchQuery(angles[0] || '');
  const { filterRelevantResults } = require('./search-query');
  const { relevant } = filterRelevantResults(query, allResults, 2);
  return {
    merged: dedupeResults(relevant.length > 0 ? relevant : allResults).slice(0, 16),
    engines,
    anyRealWeb: true,
  };
}

function buildSearchAngles(userMessage) {
  return [extractSearchQuery(userMessage)];
}

/** 抓取后再次校验正文，去掉误读的现实新闻页 */
function filterResultsAfterFetch(results, ctx, minScore = 10) {
  return stripBadBaike(results || [], ctx).filter((r) => {
    if (r.source === 'baike-direct' && r.pageText && r.pageText.length > 200) {
      return true;
    }
    if (!r.pageText || r.pageText.length < 150) {
      return (r.relevanceScore || 0) >= 12;
    }
    return scoreGameUnitRelevance(r, ctx) >= minScore;
  });
}

async function synthesizeAnswer(userMessage, searchResults, options = {}) {
  const { gameInfoMode = false, plan = null } = options;
  let context = `用户问题：${userMessage}\n\n`;
  if (plan) {
    context += `【检索目标】游戏单位 ${plan.unitCn}（${plan.unitEn}，${plan.faction}）\n\n`;
  }

  const ranked = [...(searchResults || [])].sort(
    (a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0)
  );

  const forSummary = ranked
    .filter((r) => (r.pageText && r.pageText.length > 150) || (r.relevanceScore || 0) >= 12)
    .slice(0, 8);

  if (forSummary.length > 0) {
    context += `【网页资料（共 ${forSummary.length} 篇，仅据此作答）】\n`;
    forSummary.forEach((r, i) => {
      context += `\n--- 资料 ${i + 1}：${r.title || '无标题'} ---\n`;
      if (r.url) context += `链接：${r.url}\n`;
      if (r.pageText) {
        context += `正文摘录：\n${r.pageText.slice(0, 5500)}\n`;
      } else if (r.snippet) {
        context += `摘要：${r.snippet}\n`;
      }
    });
  } else {
    context += '【未获得与红警3游戏相关的网页正文，请勿编造单位数据】\n';
  }

  const { buildPersonalitySystemBlock, loadPreferences } = require('./agent-personality');
  const personalityBlock = buildPersonalitySystemBlock(loadPreferences().aiPersonality);

  const gameRules = gameInfoMode
    ? `你是《红色警戒3》游戏百科助手。只回答**游戏原版**数据。

规则：
1. 仅使用【网页资料】中的事实；禁止编造
2. 禁止编造 XML / Object ID
3. 若资料是联合国维和、现实军事新闻，视为无关，不要用来回答游戏单位
4. 优先采用标注为百度百科、且含《红色警戒3》字样的资料
5. 结构：简介 → 核心数据表（HP/造价/速度/武器/护甲）→ 武器与技能 → 背景/战术 → 参考来源（附链接）
6. 资料中有数据时必须写出，不要说「无法提供」`
    : `你是 RA3 MOD 开发助手。`;

  const raw = await callLLM(
    [
      { role: 'system', content: `${gameRules}\n${personalityBlock}` },
      { role: 'user', content: context },
    ],
    { maxTokens: 4200, temperature: 0.2 }
  );

  return raw.trim();
}

async function runIntelligentSearch(userMessage, tools, onProgress) {
  const progress = (msg) => {
    if (typeof onProgress === 'function') onProgress(msg);
  };

  const gameInfoMode = isGameUnitInfoQuery(userMessage);

  let merged;
  let engines;
  let ctx;
  let plan;

  if (gameInfoMode) {
    progress('🔍 游戏单位联网检索（大模型规划关键词）…');
    const pack = await runGameUnitSearch(userMessage, progress);
    merged = pack.merged;
    engines = pack.engines;
    ctx = pack.ctx;
    plan = pack.plan;
  } else {
    const angles = buildSearchAngles(userMessage);
    progress(`🔍 将从 ${angles.length} 个角度联网检索…`);
    const pack = await runGeneralSearch(angles, progress);
    merged = pack.merged;
    engines = pack.engines;
    ctx = planToCtx({ unitCn: '', unitEn: '', excludePhrases: [], requiresGameContext: true });
    plan = null;
  }

  if (!merged.length) {
    return { success: false, error: '未获取到相关搜索结果，请检查网络或换种问法（可带上英文单位名）。' };
  }

  const alreadyRead = merged.filter((r) => r.pageText && r.pageText.length > 200).length;
  progress(
    `📚 已筛选 ${merged.length} 条链接（已预读 ${alreadyRead} 篇），继续阅读其余页面…`
  );
  await enrichResultsWithPageContent(merged, {
    maxPages: Math.min(merged.length, 8),
    maxCharsPerPage: 6500,
    onProgress: progress,
    rankFn: (r) => scoreGameUnitRelevance(r, ctx),
    skipIfFetched: true,
  });

  const validated = filterResultsAfterFetch(merged, ctx, 10);
  const forSummary = validated.length > 0 ? validated : merged;

  const fetchedCount = forSummary.filter((r) => r.pageText && r.pageText.length > 200).length;
  progress(`🧠 已校验 ${fetchedCount} 篇游戏相关正文，正在总结…`);

  const answer = await synthesizeAnswer(userMessage, forSummary, { gameInfoMode, plan });

  const meta = `（LLM 规划检索；阅读 ${fetchedCount} 篇；${plan?.unitEn || plan?.unitCn || ''}；引擎：${[...engines].join('+') || '多源'}）`;

  return {
    success: true,
    answer: answer + '\n\n' + meta,
    results: forSummary,
    usedRealWeb: true,
    pagesRead: fetchedCount,
  };
}

module.exports = {
  runIntelligentSearch,
  buildSearchAngles,
  synthesizeAnswer,
  isGameUnitInfoQuery,
};
