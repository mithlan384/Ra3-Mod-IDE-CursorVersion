// main/xsd-sdk-tools.js —— 按需读取 SDK XSD（不扫 MOD 项目，轻量异步）

const fs = require('fs');
const path = require('path');
const { getSdkXsdRoot, collectXsdFiles } = require('./xsd-knowledge-indexer');

const YIELD_EVERY = 40;
const DEFAULT_MAX_MATCHES = 48;
const DEFAULT_MAX_FILE_BYTES = 512 * 1024;

function yieldMain() {
  return new Promise((r) => setImmediate(r));
}

function resolveXsdRel(relPath) {
  const root = getSdkXsdRoot();
  if (!root || !relPath) return null;
  const norm = String(relPath).replace(/\\/g, '/').replace(/^\/+/, '');
  if (norm.includes('..')) return null;
  const full = path.resolve(root, norm);
  const rootResolved = path.resolve(root);
  if (!full.toLowerCase().startsWith(rootResolved.toLowerCase())) return null;
  if (!fs.existsSync(full) || !/\.xsd$/i.test(full)) return null;
  return { root: rootResolved.replace(/\\/g, '/'), full, rel: norm };
}

function loadSymbolIndex(knowledgeBaseDir) {
  if (!knowledgeBaseDir) return null;
  const p = path.join(knowledgeBaseDir, 'xsd-symbol-index.json');
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    return null;
  }
}

/** 从符号表查 element / complexType / enum / attribute 名 */
function lookupXsdSymbol(symbol, knowledgeBaseDir) {
  const key = String(symbol || '').trim();
  if (!key) return { success: false, error: '缺少 symbol' };
  const index = loadSymbolIndex(knowledgeBaseDir);
  if (!index?.symbols) {
    return {
      success: false,
      error: 'XSD 符号表未建立。请在知识库执行「重建索引」并确认已配置 SDK 路径。',
    };
  }
  const hits = index.symbols[key] || index.symbols[key.toUpperCase()] || [];
  if (!hits.length) {
    return {
      success: true,
      data: { symbol: key, hits: [], hint: '未命中；可改用 grepSdkXsd 在 Schemas/xsd 全文搜索。' },
    };
  }
  return { success: true, data: { symbol: key, hits: hits.slice(0, 24) } };
}

async function readSdkXsd(args) {
  const rel = args.file || args.path || args[0];
  const startLine = Number(args.startLine) || 1;
  const endLine = args.endLine ? Number(args.endLine) : null;
  const hit = resolveXsdRel(rel);
  if (!hit) {
    return {
      success: false,
      error: `无法读取 XSD：${rel}。请使用相对路径如 Modules/SpecialPower.xsd，并确认首选项已配置 SDK。`,
    };
  }
  try {
    const stat = fs.statSync(hit.full);
    if (stat.size > 2 * 1024 * 1024) {
      return {
        success: false,
        error: `文件过大 (${Math.round(stat.size / 1024)}KB)，请指定 startLine/endLine 分段读取。`,
      };
    }
    const content = fs.readFileSync(hit.full, 'utf-8');
    const lines = content.split(/\r?\n/);
    const end = endLine ? Math.min(endLine, lines.length) : lines.length;
    const slice = lines.slice(Math.max(0, startLine - 1), end);
    return {
      success: true,
      data: {
        file: hit.rel,
        xsdRoot: hit.root,
        lineCount: lines.length,
        startLine,
        endLine: end,
        content: slice.join('\n'),
        authority: 'SDK Schemas/xsd（最高优先级）',
      },
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * 仅在 Schemas/xsd 下搜索（不触及 MOD 项目）
 */
async function grepSdkXsd(args) {
  const pattern = String(args.pattern || args[0] || '').trim();
  if (!pattern) return { success: false, error: '缺少 pattern' };
  const root = getSdkXsdRoot();
  if (!root) {
    return { success: false, error: '未配置 SDK 或缺少 Schemas/xsd 目录' };
  }

  const lower = pattern.toLowerCase();
  const maxMatches = Math.min(Number(args.maxMatches) || DEFAULT_MAX_MATCHES, 80);
  const maxFiles = Math.min(Number(args.maxFiles) || 120, 200);
  const files = collectXsdFiles(root);
  const matches = [];
  let scanned = 0;
  let ticks = 0;

  for (const rel of files) {
    if (matches.length >= maxMatches || scanned >= maxFiles) break;
    ticks++;
    if (ticks % YIELD_EVERY === 0) await yieldMain();

    const full = path.join(root, ...rel.split('/'));
    let stat;
    try {
      stat = fs.statSync(full);
    } catch {
      continue;
    }
    if (stat.size > DEFAULT_MAX_FILE_BYTES) continue;
    scanned++;

    let text;
    try {
      text = fs.readFileSync(full, 'utf-8');
    } catch {
      continue;
    }
    if (!text.toLowerCase().includes(lower)) continue;

    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length && matches.length < maxMatches; i++) {
      if (lines[i].toLowerCase().includes(lower)) {
        matches.push({
          file: rel,
          line: i + 1,
          text: lines[i].trim().slice(0, 240),
        });
      }
    }
  }

  return {
    success: true,
    data: {
      pattern,
      xsdRoot: root,
      matchCount: matches.length,
      scannedFiles: scanned,
      matches,
      authority: 'SDK Schemas/xsd（最高优先级）',
    },
  };
}

module.exports = {
  lookupXsdSymbol,
  readSdkXsd,
  grepSdkXsd,
  loadSymbolIndex,
  resolveXsdRel,
};
