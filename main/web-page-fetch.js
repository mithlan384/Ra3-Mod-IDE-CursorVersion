// main/web-page-fetch.js —— 抓取搜索结果页面正文（供智能总结，类似 DeepSeek 浏览网页）

const https = require('https');
const http = require('http');
const { URL } = require('url');

function isBaikeSearchUrl(url) {
  return /baike\.baidu\.com\/search/i.test(url || '');
}

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const PREFERRED_HOSTS =
  /baike\.baidu|moegirl|wiki|gamersky|3dm|bilibili|tieba|fandom|wikia|commandandconquer|planet.*cnc|reddit/i;

function isPrivateHost(hostname) {
  const h = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!h || h === 'localhost' || h.endsWith('.local') || h === '0.0.0.0') return true;
  if (h === '::1' || h === '::' || h.startsWith('fe80:') || h.startsWith('fc') || h.startsWith('fd')) {
    return true;
  }
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

function assertFetchUrlAllowed(urlStr) {
  let u;
  try {
    u = new URL(urlStr);
  } catch {
    throw new Error('无效的 URL');
  }
  if (!/^https?:$/i.test(u.protocol)) {
    throw new Error('不支持的协议');
  }
  if (isPrivateHost(u.hostname)) {
    throw new Error('禁止访问本地或内网地址');
  }
}

const MAX_REDIRECTS = 5;

function httpGet(urlStr, timeoutMs = 12000, redirectCount = 0) {
  assertFetchUrlAllowed(urlStr);
  if (redirectCount > MAX_REDIRECTS) {
    return Promise.reject(new Error('重定向次数过多'));
  }
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
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          Referer: 'https://www.bing.com/',
        },
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const next = new URL(res.headers.location, urlStr).href;
          try {
            assertFetchUrlAllowed(next);
          } catch (e) {
            reject(e);
            return;
          }
          httpGet(next, timeoutMs, redirectCount + 1).then(resolve).catch(reject);
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

function decodeHtmlBuffer(buf, contentType = '') {
  const ct = String(contentType).toLowerCase();
  const m = ct.match(/charset=([^;\s]+)/i);
  if (m) {
    try {
      return buf.toString(m[1].trim().replace(/['"]/g, ''));
    } catch (e) {}
  }
  const head = buf.slice(0, 4096).toString('utf-8');
  const meta = head.match(/<meta[^>]+charset=["']?([^"'\s>]+)/i);
  if (meta) {
    try {
      return buf.toString(meta[1]);
    } catch (e) {}
  }
  return buf.toString('utf-8');
}

function htmlToPlainText(html) {
  let s = String(html || '');
  s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  s = s.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  s = s.replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n');
  s = s.replace(/<[^>]+>/g, ' ');
  s = s.replace(/&nbsp;/g, ' ');
  s = s.replace(/&amp;/g, '&');
  s = s.replace(/&lt;/g, '<');
  s = s.replace(/&gt;/g, '>');
  s = s.replace(/&quot;/g, '"');
  s = s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
  s = s.replace(/[ \t]+\n/g, '\n');
  s = s.replace(/\n{3,}/g, '\n\n');
  s = s.replace(/[ \t]{2,}/g, ' ');
  return s.trim();
}

/**
 * @param {string} url
 * @param {number} maxChars
 * @returns {Promise<string>}
 */
async function fetchPageText(url, maxChars = 4000) {
  if (!url || !/^https?:\/\//i.test(url)) return '';
  if (isBaikeSearchUrl(url)) return '';
  try {
    assertFetchUrlAllowed(url);
  } catch {
    return '';
  }

  const buf = await httpGet(url, 14000);
  const html = decodeHtmlBuffer(buf);
  let text = htmlToPlainText(html);
  if (/baike\.baidu\.com\/item/i.test(url)) {
    const { extractBaikeMainContent } = require('./baike-fetch');
    text = extractBaikeMainContent(html);
  }
  if (text.length > maxChars) {
    text = text.slice(0, maxChars) + '\n…（页面已截断）';
  }
  return text;
}

function rankForFetch(result, rankFn) {
  const url = result.url || '';
  let score = result.relevanceScore || 0;
  if (typeof rankFn === 'function') {
    score = rankFn(result);
  }
  if (PREFERRED_HOSTS.test(url)) score += 5;
  if (/baike\.baidu|moegirl/i.test(url)) score += 6;
  if (/fandom\.com\/wiki/i.test(url)) score += 5;
  if (result.snippet && result.snippet.length > 40) score += 1;
  return score;
}

/**
 * 为 Top N 条结果抓取页面正文
 */
async function enrichResultsWithPageContent(results, options = {}) {
  const { maxPages = 8, maxCharsPerPage = 4500, onProgress, rankFn, skipIfFetched = false } =
    options;
  const candidates = [...(results || [])]
    .filter((r) => r.url && /^https?:\/\//i.test(r.url))
    .filter((r) => !isBaikeSearchUrl(r.url))
    .filter((r) => !(skipIfFetched && r.pageText && r.pageText.length > 200))
    .map((r) => ({ r, score: rankForFetch(r, rankFn) }))
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxPages)
    .map((x) => x.r);

  let index = 0;
  for (const r of candidates) {
    index++;
    try {
      if (typeof onProgress === 'function') {
        onProgress(`📄 正在阅读 (${index}/${candidates.length})：${(r.title || r.url).slice(0, 42)}…`);
      }
      const text = await fetchPageText(r.url, maxCharsPerPage);
      if (text && text.length > 120) {
        r.pageText = text;
        r.fetched = true;
      }
    } catch (e) {
      r.fetchError = e.message;
    }
  }

  return results;
}

module.exports = {
  fetchPageText,
  enrichResultsWithPageContent,
  htmlToPlainText,
  isBaikeSearchUrl,
};
