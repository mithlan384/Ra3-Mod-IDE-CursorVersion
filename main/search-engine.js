// main/search-engine.js —— 多源搜索（真实联网 + 离线知识库 + LLM 兜底）

const https = require('https');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const { URL } = require('url');

const DOCS_DIR = path.join(__dirname, '..', 'knowledge-docs');

// 公网搜索源（无需 API Key）
const PUBLIC_SEARX_INSTANCES = [
  'https://searx.be',
  'https://search.bus-hit.me',
];
const BING_SEARCH_HOSTS = ['https://cn.bing.com', 'https://www.bing.com'];

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const { extractSearchQuery } = require('./search-query');

function enhanceWebQuery(query) {
  return extractSearchQuery(query);
}

/**
 * @param {string} query
 * @param {Object} options
 * @param {number} options.maxResults
 * @param {Object} options.config
 * @param {string} options.config.provider - 'google' | 'searxng' | 'offline' | 'llm' | 'auto' | 'web'
 */
async function search(query, { maxResults = 3, config } = {}) {
  const provider = (config && config.provider && config.provider.toLowerCase()) || 'auto';
  const limit = Math.min(Math.max(maxResults, 1), 10);

  if (provider === 'google') {
    const results = await searchGoogle(query, limit, config);
    return results.map((r) => ({ ...r, source: 'google' }));
  }
  if (provider === 'searxng') {
    const results = await searchSearXNG(query, limit, config);
    return results.map((r) => ({ ...r, source: 'searxng' }));
  }
  if (provider === 'llm') {
    return searchWithLLM(query, limit);
  }
  if (provider === 'offline') {
    const offlineResults = searchOffline(query, limit);
    if (offlineResults.length > 0) return offlineResults;
    console.warn('[搜索] 离线无结果，回退 LLM');
    return searchWithLLM(query, limit);
  }
  if (provider === 'web') {
    const webResults = await searchPublicWeb(enhanceWebQuery(query), limit);
    if (webResults.length > 0) return webResults;
    const offlineResults = searchOffline(query, limit);
    if (offlineResults.length > 0) return offlineResults;
    return searchWithLLM(query, limit);
  }

  // auto：已配置 API → 公网实例 → Bing → 离线文档 → LLM
  if (config && config.apiKey && config.cx) {
    try {
      const results = await searchGoogle(query, limit, config);
      if (results.length > 0) return results.map((r) => ({ ...r, source: 'google' }));
    } catch (e) {
      console.warn('[搜索] Google 失败:', e.message);
    }
  }
  if (config && config.baseUrl) {
    try {
      const results = await searchSearXNG(query, limit, config);
      if (results.length > 0) return results.map((r) => ({ ...r, source: 'searxng' }));
    } catch (e) {
      console.warn('[搜索] 自建 SearXNG 失败:', e.message);
    }
  }

  try {
    const webResults = await searchPublicWeb(enhanceWebQuery(query), limit);
    if (webResults.length > 0) return webResults;
  } catch (e) {
    console.warn('[搜索] 公网搜索失败:', e.message);
  }

  const offlineResults = searchOffline(query, limit);
  if (offlineResults.length > 0) return offlineResults;

  console.warn('[搜索] 全部联网源无结果，回退 LLM');
  return searchWithLLM(query, limit);
}

function dedupeWebResults(results) {
  const seen = new Set();
  return results.filter((r) => {
    const key = ((r.url || '') + (r.title || '')).toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** 百度网页搜索（HTML 解析，无需 API Key） */
async function searchBaidu(query, maxResults = 5) {
  const url = `https://www.baidu.com/s?wd=${encodeURIComponent(query)}&rn=${Math.min(maxResults, 10)}`;
  const html = await httpRequest(url, {
    timeoutMs: 15000,
    headers: {
      'User-Agent': BROWSER_UA,
      Accept: 'text/html',
      'Accept-Language': 'zh-CN,zh;q=0.9',
    },
  });

  const results = [];
  const seen = new Set();
  // 百度结果：h3 标题 + 相邻链接
  const blockRegex =
    /<h3[^>]*class="[^"]*t[^"]*"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h3>/gi;
  let match;
  while ((match = blockRegex.exec(html)) !== null && results.length < maxResults) {
    let href = match[1].replace(/&amp;/g, '&');
    const title = match[2].replace(/<[^>]+>/g, '').trim();
    if (!title || href.startsWith('javascript:')) continue;
    if (href.includes('baidu.com/link?')) {
      const u = href.match(/url=([^&]+)/);
      if (u) href = decodeURIComponent(u[1]);
    }
    const key = href + title;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({ title, snippet: '', url: href, source: 'baidu' });
  }

  // 备用：通用 result 链接
  if (results.length === 0) {
    const linkRegex = /<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    while ((match = linkRegex.exec(html)) !== null && results.length < maxResults) {
      const href = match[1];
      const title = match[2].replace(/<[^>]+>/g, '').trim();
      if (!title || title.length < 4 || href.includes('baidu.com')) continue;
      if (seen.has(href)) continue;
      seen.add(href);
      results.push({ title, snippet: '', url: href, source: 'baidu' });
    }
  }

  return results;
}

/**
 * 多引擎并行聚合（Bing + 百度 + SearXNG + DuckDuckGo + 可选 Google）
 * 不「谁先返回就用谁」，而是合并去重后取最相关的一批
 */
async function searchPublicWebAggregated(query, maxResults = 8, config = null) {
  const perEngine = Math.max(4, Math.ceil(maxResults / 2));
  const jobs = [
    withTimeout(searchBingRss(query, perEngine), 14000, 'Bing').catch(() => []),
    withTimeout(searchBaidu(query, perEngine), 14000, 'Baidu').catch(() => []),
    withTimeout(searchDuckDuckGoLite(query, perEngine), 14000, 'DuckDuckGo').catch(() => []),
    ...PUBLIC_SEARX_INSTANCES.map((base) =>
      withTimeout(searchSearXNG(query, perEngine, { baseUrl: base }), 12000, base)
        .then((r) => r.map((x) => ({ ...x, source: 'searxng' })))
        .catch(() => [])
    ),
  ];

  if (config && config.apiKey && config.cx) {
    jobs.push(
      withTimeout(searchGoogle(query, perEngine, config), 12000, 'Google')
        .then((r) => r.map((x) => ({ ...x, source: 'google' })))
        .catch(() => [])
    );
  }

  const settled = await Promise.allSettled(jobs);
  const merged = [];
  const engines = [];
  for (const s of settled) {
    if (s.status === 'fulfilled' && s.value && s.value.length) {
      const src = s.value[0]?.source || 'web';
      if (!engines.includes(src)) engines.push(src);
      merged.push(...s.value);
    }
  }

  const deduped = dedupeWebResults(merged);
  console.log(`[搜索] 聚合 ${engines.join('+') || '无'} → 合并 ${deduped.length} 条`);
  return { results: deduped.slice(0, maxResults * 2), engines };
}

/** 站点定向检索（MODDB、B站、贴吧等） */
async function searchTargetSites(query, maxPerSite = 3) {
  const sites = [
    { label: 'MODDB', q: `site:moddb.com ${query}` },
    { label: 'Bilibili', q: `site:bilibili.com ${query}` },
    { label: '贴吧', q: `site:tieba.baidu.com ${query}` },
    { label: '游民', q: `site:gamersky.com ${query} 红警3` },
  ];
  const all = [];
  await Promise.all(
    sites.map(async ({ label, q }) => {
      try {
        const { results } = await searchPublicWebAggregated(q, maxPerSite);
        results.forEach((r) => all.push({ ...r, site: label }));
      } catch (e) {}
    })
  );
  return dedupeWebResults(all);
}

// ========== 公网搜索（多源聚合）==========
async function searchPublicWeb(query, maxResults = 5, config = null) {
  const { results } = await searchPublicWebAggregated(query, maxResults, config);
  return results.slice(0, maxResults);
}

function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

async function searchBingRss(query, maxResults = 5) {
  const results = [];
  for (const host of BING_SEARCH_HOSTS) {
    try {
      const url = `${host}/search?q=${encodeURIComponent(query)}&format=rss`;
      const xml = await httpRequest(url, { timeoutMs: 12000 });
      const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
      let match;
      while ((match = itemRegex.exec(xml)) !== null && results.length < maxResults) {
        const block = match[1];
        const title = extractXmlTag(block, 'title');
        const link = extractXmlTag(block, 'link');
        const desc = extractXmlTag(block, 'description');
        if (!title || !link) continue;
        if (title.includes('必应：') && results.length === 0 && !desc) continue;
        results.push({
          title: title.replace(/^必应：/, '').trim(),
          snippet: (desc || '').replace(/<[^>]+>/g, '').trim().substring(0, 300),
          url: link.trim(),
          source: 'bing',
        });
      }
      if (results.length > 0) return results;
    } catch (e) {
      console.warn(`[搜索] ${host} RSS 失败:`, e.message);
    }
  }
  return results;
}

function extractXmlTag(block, tag) {
  const cdata = new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`, 'i');
  const plain = new RegExp(`<${tag}>([^<]*)</${tag}>`, 'i');
  const m = block.match(cdata) || block.match(plain);
  return m ? m[1].trim() : '';
}

function httpRequest(urlStr, { method = 'GET', headers = {}, body = null, timeoutMs = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const lib = url.protocol === 'https:' ? https : http;
    const opts = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'text/html,application/json,*/*',
        ...headers,
      },
    };

    const req = lib.request(opts, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const next = new URL(res.headers.location, urlStr).href;
        httpRequest(next, { method: 'GET', headers, timeoutMs })
          .then(resolve)
          .catch(reject);
        return;
      }
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        resolve(data);
      });
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error('请求超时'));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function searchDuckDuckGoLite(query, maxResults = 5) {
  const postBody = `q=${encodeURIComponent(query)}&kl=wt-wt`;
  const html = await httpRequest('https://lite.duckduckgo.com/lite/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postBody),
    },
    body: postBody,
    timeoutMs: 20000,
  });

  const results = [];
  // DuckDuckGo Lite: 结果在表格行中，标题链接 class="result-link"
  const rowRegex =
    /<a[^>]*class="[^"]*result-link[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  const seen = new Set();

  while ((match = rowRegex.exec(html)) !== null && results.length < maxResults) {
    let href = match[1].replace(/&amp;/g, '&');
    const title = match[2].replace(/<[^>]+>/g, '').trim();
    if (!title || href.startsWith('javascript:')) continue;

    if (href.startsWith('//')) href = 'https:' + href;
    if (href.includes('duckduckgo.com/l/')) {
      const uddg = href.match(/uddg=([^&]+)/);
      if (uddg) href = decodeURIComponent(uddg[1]);
    }

    const key = href + title;
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      title,
      snippet: '',
      url: href,
      source: 'duckduckgo',
    });
  }

  // 补充摘要：紧跟在链接后的 td 文本
  if (results.length > 0) {
    const snippetRegex = /<td[^>]*class="[^"]*result-snippet[^"]*"[^>]*>([\s\S]*?)<\/td>/gi;
    let si = 0;
    let sm;
    while ((sm = snippetRegex.exec(html)) !== null && si < results.length) {
      results[si].snippet = sm[1].replace(/<[^>]+>/g, '').trim().substring(0, 300);
      si++;
    }
  }

  return results;
}

// ========== 离线搜索 ==========
function searchOffline(query, maxResults = 5) {
  const results = [];
  const qLower = query.toLowerCase();
  const keywords = qLower.split(/\s+/).filter((k) => k.length > 1);

  if (!fs.existsSync(DOCS_DIR)) {
    return [];
  }

  const mdFiles = fs.readdirSync(DOCS_DIR).filter((f) => f.endsWith('.md'));
  for (const filename of mdFiles) {
    const filePath = path.join(DOCS_DIR, filename);
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    let currentSection = '';
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('#')) {
        currentSection = line.replace(/^#+\s*/, '');
      }
      const lineLower = line.toLowerCase();
      const matchCount = keywords.filter((k) => lineLower.includes(k)).length;
      if (matchCount > 0) {
        results.push({
          title: currentSection || filename,
          snippet: line.substring(0, 200),
          url: `file://${filePath}`,
          source: 'offline',
          file: filename,
          line: i + 1,
          matchScore: matchCount,
        });
      }
    }
  }

  results.sort((a, b) => b.matchScore - a.matchScore);
  return results.slice(0, maxResults).map((r) => {
    delete r.matchScore;
    return r;
  });
}

function searchGoogle(query, maxResults, config) {
  const key = config.apiKey;
  const cx = config.cx;
  if (!key || !cx) throw new Error('Google 搜索配置不完整 (缺少 apiKey 或 cx)');

  const url = `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(query)}&key=${key}&cx=${cx}&num=${Math.min(maxResults, 10)}`;

  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.error) return reject(new Error(json.error.message));
            const items = json.items || [];
            resolve(
              items.map((item) => ({
                title: item.title,
                snippet: item.snippet,
                url: item.link,
              }))
            );
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });
}

function searchSearXNG(query, maxResults, config) {
  const baseUrl = (config.baseUrl || '').replace(/\/$/, '');
  if (!baseUrl) throw new Error('SearXNG 配置不完整 (缺少 baseUrl)');

  const url = `${baseUrl}/search?format=json&q=${encodeURIComponent(query)}&categories=general`;

  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        {
          headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' },
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            try {
              const json = JSON.parse(data);
              if (json.results && json.results.length > 0) {
                resolve(
                  json.results.slice(0, maxResults).map((r) => ({
                    title: r.title || '',
                    snippet: (r.content || r.snippet || '').substring(0, 300),
                    url: r.url || '',
                  }))
                );
              } else {
                resolve([]);
              }
            } catch (e) {
              reject(e);
            }
          });
        }
      )
      .on('error', reject);
  });
}

async function searchKnowledgeBase(query, topN = 5, options = {}) {
  const kb = require('./knowledge-base');
  await kb.initDatabase();
  if (options.context) {
    return kb.searchSimilarForContext(query, options.context, query);
  }
  const { getKnowledgeSearchOptions } = require('./xsd-search-policy');
  const isPanel = options.fromKnowledgePanel === true;
  const policy = getKnowledgeSearchOptions(
    query,
    isPanel ? 'knowledge_panel' : 'general'
  );
  return kb.searchSimilar(query, topN || policy.topN, policy);
}

async function searchWithLLM(query, maxResults = 5) {
  const configPath = path.join(app.getPath('userData'), 'ra3-ai-config.json');
  let llmConfig = {
    apiKey: 'sk-placeholder',
    apiUrl: 'https://api.deepseek.com/v1/chat/completions',
    model: 'deepseek-chat',
  };
  if (fs.existsSync(configPath)) {
    try {
      const userCfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (userCfg.apiKey) llmConfig.apiKey = userCfg.apiKey;
      if (userCfg.apiUrl) llmConfig.apiUrl = userCfg.apiUrl;
      if (userCfg.model) llmConfig.model = userCfg.model;
    } catch (e) {}
  }

  const url = new URL(llmConfig.apiUrl);
  const body = JSON.stringify({
    model: llmConfig.model,
    messages: [
      {
        role: 'system',
        content:
          '你是红色警戒3（RA3）MOD开发专家。请根据用户的搜索查询，提供详细、准确的回答。包括相关的XML标签、属性路径、单位ID、数值范围等具体信息。如果不确定，请说明。',
      },
      { role: 'user', content: query },
    ],
    temperature: 0.3,
    max_tokens: 1500,
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${llmConfig.apiKey}`,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.error) {
              reject(new Error(json.error.message || JSON.stringify(json.error)));
              return;
            }
            const answer = json.choices[0].message.content;
            resolve([
              {
                title: `AI 知识回答: ${query.substring(0, 40)}`,
                snippet: answer.substring(0, 200),
                url: '',
                source: 'llm',
                fullAnswer: answer,
              },
            ]);
          } catch (e) {
            reject(new Error('LLM 搜索响应解析失败'));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/** 将搜索结果格式化为可读文本（供直接展示） */
function formatSearchResultsForDisplay(results) {
  if (!results || results.length === 0) return '未找到相关结果。';
  const webHits = results.filter(
    (r) =>
      r.source &&
      !['llm', 'offline'].includes(r.source) &&
      r.url &&
      !r.url.startsWith('file://')
  );
  if (webHits.length > 0) {
    let text = `🌐 联网搜索找到 ${webHits.length} 条结果：\n\n`;
    webHits.forEach((r, i) => {
      text += `${i + 1}. **${r.title}**\n`;
      if (r.snippet) text += `   ${r.snippet}\n`;
      if (r.url) text += `   ${r.url}\n`;
      text += '\n';
    });
    return text.trim();
  }
  const llmHit = results.find((r) => r.fullAnswer);
  if (llmHit) return llmHit.fullAnswer;
  return results.map((r, i) => `${i + 1}. ${r.title}\n${r.snippet || ''}`).join('\n\n');
}

/**
 * 智能联网搜索：提取关键词 → Bing → 相关性过滤 → 低质量时自动换词重试
 */
async function searchWebWithValidation(originalQuery, maxResults = 5, options = {}) {
  const { buildSearchReport } = require('./search-query');
  const config = options.config || null;
  const query = extractSearchQuery(originalQuery);

  const { results: general, engines } = await searchPublicWebAggregated(query, maxResults, config);
  let siteResults = [];
  if (/红警|RA3|Red Alert|mod|单位|xml|僵尸|Remix/i.test(query)) {
    try {
      siteResults = await searchTargetSites(query, 3);
    } catch (e) {
      console.warn('[搜索] 站点定向失败:', e.message);
    }
  }

  let results = dedupeWebResults([...siteResults, ...general]).slice(0, maxResults * 2);
  const engine = [...new Set([...engines, ...siteResults.map((r) => r.site).filter(Boolean)])].join('+') || 'multi';

  let usedRealWeb = results.some(
    (r) => r.url && r.source && !['llm', 'offline'].includes(r.source) && !r.url.startsWith('file://')
  );

  let report = buildSearchReport({
    query,
    originalQuery,
    results,
    engine,
    usedRealWeb,
    retried: false,
  });

  let actualQuery = query;
  let retried = false;

  if (report.isLowQuality && usedRealWeb) {
    retried = true;
    const altQuery = /Red Alert|Command.*Conquer|红警/i.test(query)
      ? query
      : `${query} "Red Alert 3" mod`;
    const retryPack = await searchPublicWebAggregated(altQuery, maxResults, config);
    const retryReport = buildSearchReport({
      query: altQuery,
      originalQuery,
      results: retryPack.results,
      engine: retryPack.engines.join('+'),
      usedRealWeb: true,
      retried: true,
    });
    if (!retryReport.isLowQuality) {
      report = retryReport;
      results = retryPack.results;
      actualQuery = altQuery;
    }
  }

  const finalResults = (report.relevant.length > 0 ? report.relevant : results).slice(0, maxResults);

  return {
    displayText: report.text,
    results: finalResults,
    usedRealWeb,
    actualQuery,
    originalQuery,
    engine,
    isLowQuality: report.isLowQuality,
    retried,
  };
}

module.exports = {
  search,
  searchOffline,
  searchPublicWeb,
  searchPublicWebAggregated,
  searchTargetSites,
  searchBaidu,
  searchBingRss,
  searchKnowledgeBase,
  formatSearchResultsForDisplay,
  searchWebWithValidation,
  extractSearchQuery,
};
