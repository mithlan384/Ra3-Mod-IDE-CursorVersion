// main/game-search-plan.js —— 由大模型解析单位并生成联网检索方案（通用，非硬编码兵种表）

const { callLLM } = require('./agent-planner');

function parsePlanJson(raw) {
  let cleaned = String(raw || '')
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) cleaned = cleaned.slice(start, end + 1);
  return JSON.parse(cleaned.replace(/，/g, ',').replace(/：/g, ':'));
}

function wikiSlugFromEn(unitEn) {
  return String(unitEn || '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^\w_]/g, '');
}

/** 根据 LLM 方案构造百科直达链接 */
function buildDynamicSeeds(plan) {
  const seeds = [];
  const unitEn = plan.unitEn || '';
  const unitCn = plan.unitCn || '';
  const slug = wikiSlugFromEn(unitEn);

  if (slug) {
    seeds.push({
      title: `${unitEn} (Red Alert 3) - C&C Wiki`,
      url: `https://cnc.fandom.com/wiki/${slug}_(Red_Alert_3)`,
      snippet: `Red Alert 3 ${unitEn}`,
      source: 'seed',
      relevanceScore: 95,
    });
  }

  if (unitCn) {
    const enc = encodeURIComponent(unitCn);
    seeds.push({
      title: `${unitCn}_百度百科`,
      url: `https://baike.baidu.com/item/${enc}`,
      snippet: `《红色警戒3》${unitCn}`,
      source: 'seed',
      relevanceScore: 98,
    });
    seeds.push({
      title: `${unitCn} - 萌娘百科`,
      url: `https://zh.moegirl.org.cn/${enc}`,
      snippet: `红色警戒3 ${unitCn}`,
      source: 'seed',
      relevanceScore: 92,
    });
  }

  return seeds;
}

function fallbackPlan(userMessage) {
  const m = String(userMessage || '');
  let unitCn = '';
  let unitEn = '';
  let faction = 'unknown';

  const unitMatch = m.match(
    /(征召兵|动员兵|维和步兵|帝国武士|铁锤坦克|海啸坦克|磁能坦克|天启坦克|防空步兵|牛蛙|双刃|标枪兵|守护者|火箭飞行兵|谭雅|娜塔莎)/
  );
  if (unitMatch) unitCn = unitMatch[1];

  if (/维和/.test(unitCn) || /维和/.test(m)) {
    unitEn = 'Peacekeeper';
    faction = 'Allied';
  } else if (/征召|动员/.test(unitCn)) {
    unitEn = 'Conscript';
    faction = 'Soviet';
  } else if (/帝国武士/.test(unitCn)) {
    unitEn = 'Imperial Warrior';
    faction = 'Japan';
  }

  if (/盟军|Allied/i.test(m)) faction = 'Allied';
  if (/苏联|Soviet/i.test(m)) faction = 'Soviet';
  if (/帝国|日本|Japan/i.test(m)) faction = 'Japan';

  const base = unitCn || '单位';
  const searchQueries = [
    `百度百科 ${base} 红色警戒3`,
    `红色警戒3 ${base} 单位 数据`,
    `Red Alert 3 ${unitEn || base} unit stats`,
    `site:moegirl.org.cn ${base} 红警3`,
    `site:fandom.com ${unitEn || base} Red Alert 3`,
  ].filter(Boolean);

  const excludePhrases = [];
  if (/维和/.test(base)) {
    excludePhrases.push('联合国维和', '中国维和', '维和部队', '蓝盔', '赴黎巴嫩', '军事和平', '中国军网');
  }

  return {
    unitCn: base,
    unitEn: unitEn || '',
    faction,
    searchQueries,
    excludePhrases,
    requiresGameContext: true,
    source: 'fallback',
  };
}

/**
 * LLM 解析用户要问的游戏单位，并生成检索词（类似 DeepSeek 多关键词策略）
 * @returns {Promise<object>}
 */
async function resolveGameSearchPlan(userMessage) {
  const system = `你是《命令与征服：红色警戒3》资料检索专家。用户要查**游戏内单位**的百科数据（血量、速度、武器等），不是现实世界军事新闻。

只输出一个 JSON 对象（不要 markdown）：
{
  "unitCn": "游戏内中文名，如维和步兵、征召兵",
  "unitEn": "游戏内英文官方名，如 Peacekeeper、Conscript、Imperial Warrior",
  "faction": "Allied|Soviet|Japan|unknown",
  "searchQueries": ["6～8条检索词，每条必须能搜到游戏百科，须含 Red Alert 3 或 红色警戒3 或 site:moegirl.org.cn 或 site:fandom.com"],
  "excludePhrases": ["3～8个应排除的现实世界/无关主题词，如联合国维和部队"],
  "requiresGameContext": true
}

规则：
1. 中文名易混淆时必须给英文 id：维和步兵=Peacekeeper(盟军)，征召兵=Conscript(苏联)，帝国武士=Imperial Warrior(日本)
2. searchQueries 优先：英文 wiki「Red Alert 3 {unitEn}」、萌娘百科、百度百科+游戏名；不要只用短中文词（如单独「维和」）
3. excludePhrases 写清楚要排除的误匹配（维和步兵→排除联合国维和、中国维和部队等）
4. 用户提到阵营时 faction 填对`;

  try {
    const raw = await callLLM(
      [
        { role: 'system', content: system },
        { role: 'user', content: String(userMessage || '').trim() },
      ],
      { maxTokens: 500, temperature: 0.1 }
    );
    const parsed = parsePlanJson(raw);
    const plan = {
      unitCn: String(parsed.unitCn || '').trim(),
      unitEn: String(parsed.unitEn || '').trim(),
      faction: String(parsed.faction || 'unknown').trim(),
      searchQueries: Array.isArray(parsed.searchQueries)
        ? parsed.searchQueries.map((q) => String(q).trim()).filter((q) => q.length > 2)
        : [],
      excludePhrases: Array.isArray(parsed.excludePhrases)
        ? parsed.excludePhrases.map((q) => String(q).trim()).filter((q) => q.length > 1)
        : [],
      requiresGameContext: parsed.requiresGameContext !== false,
      source: 'llm',
    };
    if (!plan.unitCn && !plan.unitEn) throw new Error('empty unit');
    if (plan.searchQueries.length < 3) {
      const fb = fallbackPlan(userMessage);
      plan.searchQueries = [...new Set([...plan.searchQueries, ...fb.searchQueries])];
      plan.excludePhrases = [...new Set([...plan.excludePhrases, ...fb.excludePhrases])];
      if (!plan.unitCn) plan.unitCn = fb.unitCn;
      if (!plan.unitEn) plan.unitEn = fb.unitEn;
    }
    return plan;
  } catch (e) {
    console.warn('[game-search-plan] LLM 方案失败，使用兜底:', e.message);
    return fallbackPlan(userMessage);
  }
}

module.exports = {
  resolveGameSearchPlan,
  buildDynamicSeeds,
  fallbackPlan,
};
