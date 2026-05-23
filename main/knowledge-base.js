// main/knowledge-base.js —— BM25 + XML 别名搜索（纯 JS，零依赖 @xenova/transformers）

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DOCS_DIR = path.join(__dirname, '..', 'knowledge-docs');
const INDEXED_MARKER = '_docs_indexed';
const SDK_INDEXED_MARKER = '_sdk_indexed';
const XSD_INDEXED_MARKER = '_xsd_indexed';
const SCHEMA_MARKER = '_schema_version';
const KNOWLEDGE_SCHEMA_VERSION = 7;
const XSD_SEARCH_BOOST = 2.8;

// ----- 状态变量 -----
let dataFile = '';
let embedder = null; // 已废弃，保留以防其他代码调用

// ----- BM25 索引 -----
let bm25Index = null;

function tokenize(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[\p{Punctuation}\p{Symbol}]+/gu, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1);
}

function rebuildBM25() {
  const list = readJSON();
  bm25Index = list
    .map((item) => {
      if (isSystemEntry(item)) return null;
      const text = [
        item.intent || '',
        item.summary || '',
        item.content || '',
        (item.tags || []).join(' '),
      ].join(' ');
      const tokens = tokenize(text);
      return { docId: item.id, tokens, length: tokens.length };
    })
    .filter((d) => d && d.tokens.length > 0);
}

/** 读取文本：UTF-8 优先，乱码时回退 GB18030（SDK 中文 txt 多为 GBK） */
function readTextFileAutoEncoding(filePath) {
  const buf = fs.readFileSync(filePath);
  let start = 0;
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) start = 3;
  const slice = start ? buf.subarray(start) : buf;
  const utf8 = slice.toString('utf-8');
  if (!looksGarbled(utf8)) return utf8;
  try {
    return new TextDecoder('gb18030').decode(slice);
  } catch {
    try {
      return new TextDecoder('gbk').decode(slice);
    } catch {
      return utf8;
    }
  }
}

function looksGarbled(text) {
  if (!text || text.length < 8) return false;
  if ((text.match(/\uFFFD/g) || []).length >= 2) return true;
  if (/锟斤拷|烫烫烫|屯屯屯/.test(text)) return true;
  if (/[\u00C3\u00C2\u00E6\u00E5]{6,}/.test(text)) return true;
  const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const weird = (text.match(/[^\x00-\x7F\u4e00-\u9fff\s\w.,;:!?'"()[\]{}<>\/\\#@\-+=*]/g) || []).length;
  if (text.length > 80 && cjk < 3 && weird > text.length * 0.15) return true;
  return false;
}

function isSystemEntry(item) {
  if (!item || !item.id) return false;
  if (
    item.id === INDEXED_MARKER ||
    item.id === SDK_INDEXED_MARKER ||
    item.id === XSD_INDEXED_MARKER ||
    item.id === SCHEMA_MARKER
  ) {
    return true;
  }
  if (item._hidden) return true;
  const intent = item.intent || '';
  return intent.startsWith('_') && intent !== '_schema_version';
}

function getEntryCategory(item) {
  if (item.category === 'xsd' || (item.tags || []).includes('xsd-schema')) return 'xsd';
  if ((item.tags || []).includes('learned')) return 'learned';
  if (item.category === 'sdk' || (item.tags || []).includes('sdk')) return 'sdk';
  if (item._isDoc || item.category === 'doc' || (item.tags || []).includes('docs')) return 'doc';
  return 'learned';
}

// ----- JSON 内存缓存（避免每次检索同步读盘） -----
let jsonCache = null;
let jsonCacheMtime = 0;

// ----- BM25 搜索 -----
function bm25Search(query, topN = 10, options = {}) {
  if (!bm25Index || bm25Index.length === 0) return [];
  const qTokens = tokenize(query);
  if (qTokens.length === 0) return [];
  const excludeCategories = options.excludeCategories || [];
  const includeCategories = options.categories || null;
  const maxXsdHits = Number.isFinite(options.maxXsdHits) ? options.maxXsdHits : null;

  const N = bm25Index.length;
  const docFreq = {};
  for (const t of qTokens) docFreq[t] = 0;
  for (const doc of bm25Index) {
    const uniqueTokens = new Set(doc.tokens);
    for (const t of qTokens) {
      if (uniqueTokens.has(t)) docFreq[t] = (docFreq[t] || 0) + 1;
    }
  }

  const idf = {};
  for (const t of qTokens) {
    const df = docFreq[t] || 0;
    idf[t] = Math.log((N - df + 0.5) / (df + 0.5) + 1);
  }

  const avgLen = bm25Index.reduce((s, d) => s + d.length, 0) / N;
  const k1 = 1.5;
  const b = 0.75;

  const scores = new Map();
  for (const doc of bm25Index) {
    let docScore = 0;
    const tokenCounts = {};
    for (const t of doc.tokens) {
      tokenCounts[t] = (tokenCounts[t] || 0) + 1;
    }
    for (const t of qTokens) {
      const tf = tokenCounts[t] || 0;
      if (tf === 0) continue;
      docScore += idf[t] * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (doc.length / (avgLen || 1)))));
    }
    if (docScore > 0) scores.set(doc.id, docScore);
  }

  const list = readJSON();
  const byId = new Map(list.map((item) => [item.id, item]));

  let xsdUsed = 0;
  const ranked = Array.from(scores.entries())
    .map(([id, score]) => {
      const item = byId.get(id);
      const cat = item ? getEntryCategory(item) : 'learned';
      const boost = cat === 'xsd' ? XSD_SEARCH_BOOST : cat === 'sdk' ? 1.15 : 1;
      return { id, score: score * boost, cat };
    })
    .sort((a, b) => b.score - a.score || (a.cat === 'xsd' ? -1 : 0));

  const out = [];
  for (const row of ranked) {
    if (excludeCategories.includes(row.cat)) continue;
    if (includeCategories && !includeCategories.includes(row.cat)) continue;
    if (row.cat === 'xsd' && maxXsdHits != null && xsdUsed >= maxXsdHits) continue;
    if (row.cat === 'xsd') xsdUsed += 1;
    out.push({ id: row.id });
    if (out.length >= topN) break;
  }
  return out;
}

// ----- Query Rewriting + XML 别名 -----
let llmCallFn = null;
function setLLMCallFn(fn) { llmCallFn = fn; }

function simpleExtractKeywords(text) {
  const stopWords = new Set(['的','了','是','在','和','有','我','你','把','给','要','想','请','帮','怎么','如何','为什么','什么','吗','呢','吧','啊','嗯']);
  return tokenize(text).filter(t => !stopWords.has(t) && t.length > 1).slice(0, 8).join(' ');
}

async function rewriteQuery(userMessage) {
  // XML 别名映射展开（始终执行）
  const { expandQuery } = require('./xml-alias-map');
  const expanded = expandQuery(userMessage);

  // 优先尝试 LLM 改写（如果有注入）
  if (llmCallFn) {
    try {
      const result = await llmCallFn([{
        role: 'user',
        content: `你是一个 RA3 MOD 开发查询改写器。
原始问题：${userMessage}
已展开的 XML 术语：${expanded}
请改写为 3~5 个关键词，只返回关键词，用空格分隔。
例子：原始问题"把天启坦克的血量改高" → 输出：天启坦克 血量 Health MaxHealth`
      }]);
      return result.trim();
    } catch (e) {
      console.error('Query rewriting 失败:', e.message);
    }
  }

  // 降级：只做别名展开 + 简单提取
  return simpleExtractKeywords(expanded);
}

// ----- JSON 读写 -----
function getPaths(projectRoot) {
  const base = path.join(projectRoot || app.getPath('userData'), '.knowledge');
  return { base, dataFile: path.join(base, 'data.json') };
}

function readJSON() {
  if (!dataFile) return [];
  try {
    const stat = fs.statSync(dataFile);
    if (jsonCache && stat.mtimeMs === jsonCacheMtime) return jsonCache;
    const parsed = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
    jsonCache = parsed;
    jsonCacheMtime = stat.mtimeMs;
    return parsed;
  } catch {
    jsonCache = [];
    jsonCacheMtime = 0;
    return [];
  }
}

function writeJSON(data) {
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), 'utf-8');
  jsonCache = data;
  try {
    jsonCacheMtime = fs.statSync(dataFile).mtimeMs;
  } catch {
    jsonCacheMtime = Date.now();
  }
}

// ----- 初始化 -----
let dbInitialized = false;
let backgroundIndexPromise = null;

async function initDatabase(projectRoot, options = {}) {
  const { backgroundIndex = false } = options;
  const { getCurrentFolder } = require('./project-state');
  const root = projectRoot || getCurrentFolder();
  const paths = getPaths(root);
  dataFile = paths.dataFile;

  if (!fs.existsSync(paths.base)) fs.mkdirSync(paths.base, { recursive: true });
  if (!fs.existsSync(dataFile)) writeJSON([]);

  rebuildBM25();
  dbInitialized = true;

  if (backgroundIndex) {
    if (!backgroundIndexPromise) {
      backgroundIndexPromise = runBackgroundIndexing();
    }
    return;
  }

  // 同步路径：仅当显式需要时等待索引（测试/导入用）
  await runBackgroundIndexing();
}

function yieldToMainThread() {
  return new Promise((resolve) => setImmediate(resolve));
}

async function runBackgroundIndexing() {
  try {
    await migrateKnowledgeSchemaIfNeeded();
    await yieldToMainThread();
    await indexKnowledgeDocs();
    await yieldToMainThread();
    await indexSdkReferenceDocs();
    await yieldToMainThread();
    await indexXsdSchemas();
    await yieldToMainThread();
    rebuildBM25();
  } catch (e) {
    console.error('[知识文档] 索引失败:', e.message);
  }
}

function getSchemaVersion(list) {
  const m = (list || readJSON()).find((i) => i.id === SCHEMA_MARKER);
  return m && m._version ? m._version : 1;
}

function setSchemaVersion(list) {
  const base = list || readJSON();
  const rest = base.filter((i) => i.id !== SCHEMA_MARKER);
  rest.push({
    id: SCHEMA_MARKER,
    _version: KNOWLEDGE_SCHEMA_VERSION,
    _hidden: true,
    intent: '_schema_version',
    summary: `v${KNOWLEDGE_SCHEMA_VERSION}`,
    tags: ['_system'],
  });
  writeJSON(rest);
}

/** 旧版碎片化索引 / GBK 乱码 → 清理后按「每文件一条」重建 */
async function migrateKnowledgeSchemaIfNeeded() {
  const list = readJSON();
  const ver = getSchemaVersion(list);
  const hasGarbled = list.some(
    (item) =>
      !isSystemEntry(item) &&
      looksGarbled(`${item.intent || ''} ${item.summary || ''} ${(item.content || '').slice(0, 200)}`)
  );
  const needsRebuild = ver < KNOWLEDGE_SCHEMA_VERSION || hasGarbled;

  if (!needsRebuild) return;

  console.log('[知识库] 迁移索引 → schema v' + KNOWLEDGE_SCHEMA_VERSION + (hasGarbled ? '（修复乱码）' : ''));

  const userEntries = list.filter(
    (item) =>
      !isSystemEntry(item) &&
      !item._isDoc &&
      item.category !== 'doc' &&
      item.category !== 'sdk' &&
      item.category !== 'xsd' &&
      !(item.tags || []).includes('docs') &&
      !(item.tags || []).includes('sdk') &&
      !(item.tags || []).includes('xsd-schema') &&
      !looksGarbled(`${item.intent || ''} ${item.summary || ''}`)
  );

  writeJSON(userEntries);
  await indexKnowledgeDocs(true);
  await indexSdkReferenceDocs(true);
  await indexXsdSchemas(true);
  setSchemaVersion();
}

async function rebuildKnowledgeIndex() {
  const list = readJSON();
  const userEntries = list.filter(
    (item) =>
      !isSystemEntry(item) &&
      !item._isDoc &&
      item.category !== 'doc' &&
      item.category !== 'sdk' &&
      item.category !== 'xsd' &&
      !(item.tags || []).includes('docs') &&
      !(item.tags || []).includes('sdk') &&
      !(item.tags || []).includes('xsd-schema')
  );
  writeJSON(userEntries);
  await indexKnowledgeDocs(true);
  await indexSdkReferenceDocs(true);
  await indexXsdSchemas(true);
  setSchemaVersion();
  rebuildBM25();
}

function ensureDbReady() {
  if (!dataFile) {
    const paths = getPaths(app.getPath('userData'));
    dataFile = paths.dataFile;
    if (!fs.existsSync(paths.base)) fs.mkdirSync(paths.base, { recursive: true });
    if (!fs.existsSync(dataFile)) writeJSON([]);
    rebuildBM25();
    dbInitialized = true;
  }
}

// ----- 添加知识条目 -----
async function addKnowledge(record) {
  ensureDbReady();

  record.id = `kb_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  record.timestamp = new Date().toISOString();

  const list = readJSON();
  list.push(record);
  writeJSON(list);
  rebuildBM25();
  return record;
}

/** 批量添加（索引文档时用，只 rebuild 一次） */
async function addKnowledgeBatch(records) {
  ensureDbReady();
  if (!records || records.length === 0) return [];

  const list = readJSON();
  const now = new Date().toISOString();
  const added = records.map((record) => {
    const r = { ...record };
    r.id = `kb_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    r.timestamp = now;
    list.push(r);
    return r;
  });
  writeJSON(list);
  rebuildBM25();
  return added;
}

// ----- 混合搜索（只用 BM25）-----
function buildSearchFilterOptions(options = {}) {
  const filter = {};
  if (options.excludeXsd) {
    filter.excludeCategories = ['xsd'];
  } else if (options.categories) {
    filter.categories = options.categories;
  }
  if (options.maxXsdHits != null) {
    filter.maxXsdHits = options.maxXsdHits;
  } else if (options.excludeXsd) {
    filter.maxXsdHits = 0;
  }
  return filter;
}

async function searchSimilar(query, topN = 3, options = {}) {
  ensureDbReady();
  // 后台全量索引仅在 app 启动时 initDatabase({ backgroundIndex: true }) 触发，对话检索不再触发
  const list = readJSON();
  if (list.length === 0) return [];

  // Query Rewriting（包含 XML 别名展开）
  let searchQuery = query;
  if (options.skipLlmRewrite) {
    const { expandQuery } = require('./xml-alias-map');
    searchQuery = expandQuery(query) || query;
  } else if (!options.excludeXsd) {
    try {
      const rewritten = await rewriteQuery(query);
      if (rewritten && rewritten !== query) {
        console.log('[Query Rewrite]', query, '→', rewritten);
        searchQuery = rewritten;
      }
    } catch (e) {
      console.error('Query rewrite 失败:', e.message);
    }
  } else {
    searchQuery = simpleExtractKeywords(query) || query;
  }

  const filterOpts = buildSearchFilterOptions(options);
  const results = bm25Search(searchQuery, topN, filterOpts);

  // 按 ID 取出条目
  const idSet = new Set(results.map((r) => r.id));
  return list
    .filter((item) => idSet.has(item.id) && !isSystemEntry(item))
    .filter((item) => !looksGarbled(`${item.intent || ''} ${item.summary || ''}`))
    .sort((a, b) => results.findIndex((r) => r.id === a.id) - results.findIndex((r) => r.id === b.id))
    .map((item) => ({
      ...item,
      summary: item.summary || (item.content || '').substring(0, 500),
    }));
}

// ----- 自动索引预置知识文档 -----
function getDefaultSdkRefDirs() {
  try {
    const { guessSdkPath } = require('./sdk-build');
    const root = guessSdkPath();
    if (!root) return [];
    return [path.join(root, '重要xml'), path.join(root, 'tools')];
  } catch {
    return [];
  }
}

function chunkMarkdown(content, maxChunkLen = 600) {
  const sections = content.split(/(?=^#+\s)/m);
  const chunks = [];
  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed) continue;
    if (trimmed.length <= maxChunkLen) {
      chunks.push(trimmed);
    } else {
      const lines = trimmed.split('\n');
      let buf = '';
      for (const line of lines) {
        if ((buf + '\n' + line).length > maxChunkLen && buf) {
          chunks.push(buf.trim());
          buf = line;
        } else {
          buf += '\n' + line;
        }
      }
      if (buf.trim()) chunks.push(buf.trim());
    }
  }
  return chunks;
}

function collectMarkdownFiles(dir, base = DOCS_DIR) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) out.push(...collectMarkdownFiles(full, base));
    else if (name.endsWith('.md')) out.push(path.relative(base, full).replace(/\\/g, '/'));
  }
  return out;
}

async function indexKnowledgeDocs(force = false) {
  if (!fs.existsSync(DOCS_DIR)) { console.log('[知识文档] 目录不存在:', DOCS_DIR); return; }

  const mdFiles = collectMarkdownFiles(DOCS_DIR);
  const list = readJSON();
  const marker = list.find(item => item.id === INDEXED_MARKER);
  const indexedFiles = marker ? (marker._files || []) : [];
  const needsMigration = marker && !marker._files; // 旧格式标记需要全量重建

  // 增量检测：只索引新文件（旧格式标记时全量重建）
  const newFiles = (force || needsMigration) ? mdFiles : mdFiles.filter(f => !indexedFiles.includes(f));
  if (newFiles.length === 0) {
    console.log('[知识文档] 所有文档已索引，跳过');
    return;
  }

  console.log(`[知识文档] 发现 ${newFiles.length}/${mdFiles.length} 个${needsMigration?'(旧格式迁移)':''}新文档，开始索引...`);

  // 强制或迁移时清除旧文档条目
  if (force || needsMigration) {
    const cleaned = list.filter(
      (item) =>
        !item._isDoc &&
        item.category !== 'doc' &&
        !(item.tags || []).includes('docs')
    );
    writeJSON(cleaned);
  }

  const batch = [];
  for (const filename of newFiles) {
    if (filename.toLowerCase() === 'readme.md') continue;
    const filePath = path.join(DOCS_DIR, ...filename.split('/'));
    const content = readTextFileAutoEncoding(filePath);
    if (looksGarbled(content)) {
      console.warn('[知识文档] 跳过乱码文件:', filename);
      continue;
    }
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : filename.replace(/\.md$/i, '');
    const excerpt = content
      .replace(/^#+\s+.+$/gm, '')
      .replace(/```[\s\S]*?```/g, '')
      .trim()
      .substring(0, 600);
    batch.push({
      intent: title,
      plan: [],
      summary: excerpt,
      content: content.substring(0, 16000),
      source_files: filename,
      category: 'doc',
      tags: ['docs', filename.replace(/\.md$/i, '')],
      _isDoc: true,
    });
  }
  if (batch.length > 0) await addKnowledgeBatch(batch);
  const indexed = batch.length;

  // 更新标记（记录所有已索引的文件名）
  const listAfter = readJSON();
  const newMarker = {
    id: INDEXED_MARKER,
    timestamp: new Date().toISOString(),
    intent: '_docs_indexed',
    summary: `${indexed} chunks from ${mdFiles.length} docs`,
    tags: ['_system'],
    _files: mdFiles, // 记录所有文档文件名，下次不再重复索引
  };
  // 移除旧标记（如果有）并添加新标记
  const noMarker = listAfter.filter(item => item.id !== INDEXED_MARKER);
  noMarker.push(newMarker);
  writeJSON(noMarker);
  rebuildBM25();

  console.log(`[知识文档] 索引完成: ${indexed} 条`);
}

/** 索引 MOD SDK-X 下的中文说明 txt（单位对照表、关键字等） */
async function indexSdkReferenceDocs(force = false) {
  const list = readJSON();
  const marker = list.find((item) => item.id === SDK_INDEXED_MARKER);
  if (marker && !force) {
    console.log('[SDK文档] 已索引，跳过');
    return;
  }

  if (force) {
    const cleaned = list.filter(
      (item) =>
        item.category !== 'sdk' &&
        !(item.tags || []).includes('sdk') &&
        !(item.source_files || '').startsWith('SDK:')
    );
    writeJSON(cleaned.filter((i) => i.id !== SDK_INDEXED_MARKER));
  }

  const batch = [];
  const MAX_SDK_FILE_BYTES = 512 * 1024;
  for (const dir of getDefaultSdkRefDirs()) {
    if (!fs.existsSync(dir)) {
      console.log('[SDK文档] 目录不存在:', dir);
      continue;
    }
    const files = fs.readdirSync(dir).filter((f) => /\.(txt|md)$/i.test(f) && !f.startsWith('.'));
    for (const filename of files) {
      const filePath = path.join(dir, filename);
      let content;
      try {
        const stat = fs.statSync(filePath);
        if (stat.size > MAX_SDK_FILE_BYTES) {
          console.log('[SDK文档] 跳过大文件:', filename);
          continue;
        }
        content = readTextFileAutoEncoding(filePath);
      } catch {
        continue;
      }
      if (content.length < 20) continue;
      if (looksGarbled(content)) {
        console.warn('[SDK文档] 跳过无法解码的文件:', filename);
        continue;
      }
      const title = filename.replace(/\.(txt|md)$/i, '');
      let body = content;
      if (body.length > 12000) {
        body = content.substring(0, 12000) + '\n\n…（内容已截断）';
      }
      batch.push({
        intent: `SDK参考：${title}`,
        plan: [],
        summary: body.substring(0, 500),
        content: body,
        source_files: `SDK:${filename}`,
        category: 'sdk',
        tags: ['sdk', filename.replace(/\.\w+$/, '')],
        _isDoc: true,
      });
    }
  }
  const indexed = batch.length;
  if (batch.length > 0) await addKnowledgeBatch(batch);

  if (indexed > 0) {
    const listAfter = readJSON().filter((item) => item.id !== SDK_INDEXED_MARKER);
    listAfter.push({
      id: SDK_INDEXED_MARKER,
      timestamp: new Date().toISOString(),
      intent: '_sdk_indexed',
      summary: `${indexed} SDK chunks`,
      tags: ['_system'],
    });
    writeJSON(listAfter);
    rebuildBM25();
    console.log(`[SDK文档] 索引完成: ${indexed} 条`);
  }
}

// ----- 通用接口 -----
async function getAllEntries() {
  ensureDbReady();
  return readJSON()
    .filter((item) => !isSystemEntry(item))
    .filter(
      (item) =>
        !looksGarbled(`${item.intent || ''} ${item.summary || ''} ${(item.content || '').slice(0, 300)}`)
    )
    .map((item) => ({
      ...item,
      category: getEntryCategory(item),
    }))
    .sort((a, b) => {
      const order = { xsd: 0, doc: 1, sdk: 2, learned: 3 };
      return (order[a.category] ?? 9) - (order[b.category] ?? 9);
    });
}

async function deleteEntry(id) {
  ensureDbReady();
  let list = readJSON();
  const newList = list.filter(item => item.id !== id);
  if (newList.length === list.length) return;
  writeJSON(newList);
  rebuildBM25();
}

async function clearAll() {
  ensureDbReady();
  writeJSON([]);
  rebuildBM25();
}

async function importFrom(filePath) {
  const data = JSON.parse(await fs.promises.readFile(filePath, 'utf-8'));
  for (const record of data) {
    await addKnowledge(record);
  }
}

async function exportTo(filePath) {
  const list = readJSON();
  await fs.promises.writeFile(filePath, JSON.stringify(list, null, 2), 'utf-8');
}

async function getStats() {
  ensureDbReady();
  const list = await getAllEntries();
  let size = 0;
  try {
    if (fs.existsSync(dataFile)) size = fs.statSync(dataFile).size;
  } catch (e) {}
  const doc = list.filter((i) => i.category === 'doc').length;
  const sdk = list.filter((i) => i.category === 'sdk').length;
  const xsd = list.filter((i) => i.category === 'xsd').length;
  const learned = list.filter((i) => i.category === 'learned').length;
  let xsdRoot = null;
  try {
    xsdRoot = require('./xsd-knowledge-indexer').getSdkXsdRoot();
  } catch (e) {}
  return {
    count: list.length,
    size,
    doc,
    sdk,
    xsd,
    learned,
    totalEntries: list.length,
    schemaVersion: getSchemaVersion(readJSON()),
    xsdRoot,
  };
}

/** 索引 SDK Schemas/xsd（XML 写法权威来源，搜索权重最高） */
async function indexXsdSchemas(force = false) {
  const list = readJSON();
  const marker = list.find((item) => item.id === XSD_INDEXED_MARKER);
  if (marker && !force) {
    console.log('[XSD] 已索引，跳过');
    return { indexed: 0, skipped: true };
  }

  if (force) {
    const cleaned = list.filter(
      (item) =>
        item.category !== 'xsd' &&
        !(item.tags || []).includes('xsd-schema') &&
        !(item.source_files || '').startsWith('XSD:')
    );
    writeJSON(cleaned.filter((i) => i.id !== XSD_INDEXED_MARKER));
  }

  const { indexXsdSchemas: runIndexer } = require('./xsd-knowledge-indexer');

  const paths = getPaths(
    (() => {
      try {
        const { getCurrentFolder } = require('./project-state');
        return getCurrentFolder();
      } catch {
        return null;
      }
    })()
  );

  const res = await runIndexer({
    force,
    knowledgeBaseDir: paths.base,
    addBatch: async (records) => {
      if (records.length) await addKnowledgeBatch(records);
    },
  });

  if (res.success && res.indexed > 0) {
    const listAfter = readJSON().filter((item) => item.id !== XSD_INDEXED_MARKER);
    listAfter.push({
      id: XSD_INDEXED_MARKER,
      timestamp: new Date().toISOString(),
      intent: '_xsd_indexed',
      summary: `${res.indexed} XSD chunks @ ${res.xsdRoot || ''}`,
      tags: ['_system'],
      _xsdRoot: res.xsdRoot,
      _fileCount: res.totalFiles,
    });
    writeJSON(listAfter);
    rebuildBM25();
  }

  return res;
}

/** 符号表快速命中（不扫盘） */
function lookupXsdSymbolsForQuery(query, knowledgeBaseDir) {
  const q = String(query || '').trim();
  if (!q || q.length < 2) return [];
  const { loadSymbolIndex } = require('./xsd-sdk-tools');
  const base = knowledgeBaseDir || getPaths(app.getPath('userData')).base;
  const index = loadSymbolIndex(base);
  if (!index?.symbols) return [];

  const tokens = tokenize(q).filter((t) => t.length > 2);
  const out = [];
  const seen = new Set();
  for (const t of tokens) {
    for (const key of [t, t.charAt(0).toUpperCase() + t.slice(1), t.toUpperCase()]) {
      const arr = index.symbols[key];
      if (!arr) continue;
      for (const hit of arr) {
        const id = `${key}|${hit.file}|${hit.kind}`;
        if (seen.has(id)) continue;
        seen.add(id);
        out.push({ symbol: key, ...hit });
        if (out.length >= 12) return out;
      }
    }
  }
  return out;
}

/** 将检索结果格式化为 Agent 上下文（标注 XSD 权威条目） */
function formatKnowledgeContextForAgent(hits, options = {}) {
  if (!hits || !hits.length) return '';
  const { formatXsdAuthorityPromptBlock } = require('./xsd-knowledge-indexer');
  const paths = getPaths(
    (() => {
      try {
        const { getCurrentFolder } = require('./project-state');
        return getCurrentFolder();
      } catch {
        return null;
      }
    })()
  );
  const symHits = options.includeSymbols !== false ? lookupXsdSymbolsForQuery(options.query || '', paths.base) : [];
  let symBlock = '';
  if (symHits.length) {
    symBlock =
      '〖XSD 符号表命中〗\n' +
      symHits.map((h) => `- ${h.symbol} → ${h.file} (${h.kind})`).join('\n') +
      '\n\n';
  }
  const lines = hits.map((c, i) => {
    const cat = getEntryCategory(c);
    const tag =
      cat === 'xsd'
        ? '【SDK XSD 权威·最高优先级】'
        : cat === 'sdk'
          ? '【SDK 参考】'
          : cat === 'doc'
            ? '【教程】'
            : '【案例】';
    const src = c.source_files ? ` (${c.source_files})` : '';
    const body = (c.summary || c.content || '').slice(0, options.maxChars || 900);
    return `${tag} ${i + 1}：${c.intent}${src}\n${body}`;
  });
  const header = options.includeAuthorityBlock !== false ? formatXsdAuthorityPromptBlock() + '\n\n' : '';
  return `${header}${symBlock}〖知识库检索〗\n${lines.join('\n\n')}`;
}

// ----- 导出 -----
/** 按场景检索（XSD 权威 / 性能策略见 xsd-search-policy.js） */
async function searchSimilarForContext(query, context = 'general', messageForPolicy = null) {
  const { getKnowledgeSearchOptions } = require('./xsd-search-policy');
  const policy = getKnowledgeSearchOptions(messageForPolicy || query, context);
  const { topN, ...opts } = policy;
  return searchSimilar(query, topN, opts);
}

module.exports = {
  initDatabase,
  addKnowledge,
  addKnowledgeBatch,
  searchSimilar,
  searchSimilarForContext,
  getAllEntries,
  deleteEntry,
  clearAll,
  importFrom,
  exportTo,
  getStats,
  setLLMCallFn,
  rewriteQuery,
  rebuildBM25,
  indexKnowledgeDocs,
  indexSdkReferenceDocs,
  indexXsdSchemas,
  formatKnowledgeContextForAgent,
  lookupXsdSymbolsForQuery,
  getEntryCategory,
  rebuildKnowledgeIndex,
  XSD_SEARCH_BOOST,
  migrateKnowledgeSchemaIfNeeded,
  looksGarbled,
};