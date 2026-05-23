// main/baike-fetch.js —— 百度百科游戏单位词条（直连 item 页，不依赖百度搜索）

const { fetchPageText, htmlToPlainText } = require('./web-page-fetch');
const https = require('https');
const http = require('http');
const { URL } = require('url');

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function buildBaikeItemUrl(unitCn) {
  if (!unitCn) return '';
  return `https://baike.baidu.com/item/${encodeURIComponent(unitCn)}`;
}

function httpGetBuffer(urlStr, timeoutMs = 14000) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: 'GET',
        headers: {
          'User-Agent': BROWSER_UA,
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'zh-CN,zh;q=0.9',
          Referer: 'https://baike.baidu.com/',
        },
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const next = new URL(res.headers.location, urlStr).href;
          httpGetBuffer(next, timeoutMs).then(resolve).catch(reject);
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }
          resolve(Buffer.concat(chunks));
        });
      }
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error('timeout'));
    });
    req.on('error', reject);
    req.end();
  });
}

/** 从百度百科 HTML 提取词条正文（比全页 strip 更干净） */
function extractBaikeMainContent(html) {
  const parts = [];
  const summary = html.match(/class="lemma-summary"[^>]*>([\s\S]*?)<\/div>/i);
  if (summary) parts.push(htmlToPlainText(summary[1]));

  const paras = html.match(/data-tag="paragraph"[^>]*>([\s\S]*?)<\/div>/gi) || [];
  for (const block of paras.slice(0, 40)) {
    const t = htmlToPlainText(block);
    if (t.length > 8) parts.push(t);
  }

  if (parts.length < 2) {
    const main = html.match(/class="J-lemma-content"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i);
    if (main) parts.push(htmlToPlainText(main[1]));
  }

  let text = parts.join('\n\n').trim();
  if (text.length < 200) {
    text = htmlToPlainText(html);
  }

  const anchor = text.search(/《红色警戒\s*3》|红色警戒\s*3|红警\s*3/);
  if (anchor > 0 && anchor < 600) {
    text = text.slice(Math.max(0, anchor - 40));
  }

  return text.replace(/\n{3,}/g, '\n\n').trim();
}

function isGameBaikeContent(text, plan) {
  if (!text || text.length < 180) return false;
  const hasGame = /《红色警戒\s*3》|红色警戒\s*3|红警\s*3|命令与征服/i.test(text);
  if (!hasGame) return false;

  const unitCn = plan.unitCn || '';
  if (unitCn && !text.includes(unitCn)) return false;

  if (/维和/.test(unitCn)) {
    if (/联合国维和部队|中国维和部队|蓝盔部队/.test(text) && !/游戏《/.test(text)) {
      return false;
    }
  }

  return true;
}

/**
 * 直连百度百科 item 页获取游戏单位资料
 * @returns {Promise<object|null>}
 */
async function fetchGameUnitFromBaike(plan) {
  const unitCn = (plan && plan.unitCn) || '';
  if (!unitCn) return null;

  const url = buildBaikeItemUrl(unitCn);
  try {
    const buf = await httpGetBuffer(url);
    const html = buf.toString('utf-8');
    let pageText = extractBaikeMainContent(html);
    if (pageText.length > 6500) {
      pageText = pageText.slice(0, 6500) + '\n…（已截断）';
    }

    if (!isGameBaikeContent(pageText, plan)) {
      return null;
    }

    return {
      title: `${unitCn}_百度百科`,
      url,
      snippet: pageText.slice(0, 200),
      pageText,
      fetched: true,
      source: 'baike-direct',
      relevanceScore: 99,
    };
  } catch (e) {
    console.warn('[baike-fetch] 直连失败:', e.message);
    try {
      const fallback = await fetchPageText(url, 6500);
      if (!isGameBaikeContent(fallback, plan)) return null;
      return {
        title: `${unitCn}_百度百科`,
        url,
        snippet: fallback.slice(0, 200),
        pageText: fallback,
        fetched: true,
        source: 'baike-direct',
        relevanceScore: 99,
      };
    } catch (e2) {
      return null;
    }
  }
}

function isBaikeSearchUrl(url) {
  return /baike\.baidu\.com\/search/i.test(url || '');
}

function isLikelyWrongBaikeItem(result, ctx) {
  const url = result.url || '';
  const title = result.title || '';
  const text = `${title} ${result.pageText || ''} ${result.snippet || ''}`;
  if (!/baike\.baidu\.com\/item/i.test(url)) return false;

  const unitCn = ctx.unitCn || '';
  if (unitCn && title.includes(unitCn)) return false;
  if (unitCn && text.includes(unitCn) && /红色警戒|红警|游戏《/.test(text)) return false;

  if (/peacekeeper/i.test(url + title) && !/红色警戒|红警|维和步兵/.test(text)) {
    return true;
  }
  if (/中国维和|联合国维和/.test(text) && !/红色警戒|红警|游戏《/.test(text)) {
    return true;
  }
  return false;
}

module.exports = {
  buildBaikeItemUrl,
  fetchGameUnitFromBaike,
  extractBaikeMainContent,
  isBaikeSearchUrl,
  isLikelyWrongBaikeItem,
};
