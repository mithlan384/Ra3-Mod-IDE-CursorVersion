// main/xsd-knowledge-indexer.js —— SDK Schemas/xsd 全量分片索引 + 符号表

const fs = require('fs');
const path = require('path');

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const CHUNK_MAX_LINES = 12000;
const ELEMENTS_PER_CHUNK = 36;
const ATTRS_PER_CHUNK = 32;
const ENUMS_PER_CHUNK = 70;
const YIELD_EVERY = 25;
const BATCH_FLUSH = 60;

function getSdkXsdRoot() {
  const envSdk = process.env.RA3_SDK_PATH || process.env.RA3_MOD_SDK_PATH;
  if (envSdk) {
    for (const sub of ['Schemas/xsd', 'schemas/xsd']) {
      const c = path.join(envSdk, ...sub.split('/'));
      if (fs.existsSync(c)) return c.replace(/\\/g, '/');
    }
  }
  try {
    const { getGlobalSdkPath } = require('./project-manager');
    const sdk = getGlobalSdkPath();
    if (!sdk) return null;
    for (const sub of ['Schemas/xsd', 'schemas/xsd', 'Schema/xsd']) {
      const c = path.join(sdk, ...sub.split('/'));
      if (fs.existsSync(c)) return c.replace(/\\/g, '/');
    }
  } catch (e) {
    console.warn('[xsd-indexer] getSdkXsdRoot:', e.message);
  }
  return null;
}

function collectXsdFiles(root, base = root) {
  const out = [];
  if (!root || !fs.existsSync(root)) return out;
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const ent of entries) {
    const full = path.join(root, ent.name);
    if (ent.isDirectory()) {
      if (ent.name.startsWith('.')) continue;
      out.push(...collectXsdFiles(full, base));
    } else if (/\.xsd$/i.test(ent.name)) {
      out.push(path.relative(base, full).replace(/\\/g, '/'));
    }
  }
  return out;
}

function stripXmlComments(text) {
  return String(text || '').replace(/<!--[\s\S]*?-->/g, '');
}

function parseAllElements(body) {
  const out = [];
  const re = /<xs:element\s+([^>]+)\/?>/gi;
  let m;
  while ((m = re.exec(body)) !== null) {
    const attrs = m[1];
    const nameM = attrs.match(/\bname="([^"]+)"/);
    if (!nameM) continue;
    const typeM = attrs.match(/\btype="([^"]+)"/);
    const minM = attrs.match(/\bminOccurs="([^"]+)"/);
    const maxM = attrs.match(/\bmaxOccurs="([^"]+)"/);
    let line = nameM[1];
    if (typeM) line += ` : ${typeM[1]}`;
    if (minM || maxM) line += ` [${minM?.[1] || '1'}..${maxM?.[1] || '1'}]`;
    out.push({ name: nameM[1], line, kind: 'element' });
  }
  return out;
}

function parseAllAttributes(body) {
  const out = [];
  const re = /<xs:attribute\s+([^>]+)\/?>/gi;
  let m;
  while ((m = re.exec(body)) !== null) {
    const attrs = m[1];
    const nameM = attrs.match(/\bname="([^"]+)"/);
    if (!nameM) continue;
    const typeM = attrs.match(/\btype="([^"]+)"/);
    const useM = attrs.match(/\buse="([^"]+)"/);
    const defM = attrs.match(/\bdefault="([^"]+)"/);
    let line = `@${nameM[1]}`;
    if (typeM) line += ` ${typeM[1]}`;
    if (useM) line += ` use=${useM[1]}`;
    if (defM) line += ` default=${defM[1]}`;
    out.push({ name: nameM[1], line, kind: 'attribute' });
  }
  return out;
}

function parseAllEnums(body) {
  const out = [];
  const re = /<xs:enumeration\s+value="([^"]+)"/gi;
  let m;
  while ((m = re.exec(body)) !== null) {
    out.push({ name: m[1], line: m[1], kind: 'enum' });
  }
  return out;
}

function parseComplexAndSimpleTypes(body) {
  const complex = [];
  const simple = [];
  let m;
  const reC = /<xs:complexType\s+name="([^"]+)"/gi;
  while ((m = reC.exec(body)) !== null) complex.push(m[1]);
  const reS = /<xs:simpleType\s+name="([^"]+)"/gi;
  while ((m = reS.exec(body)) !== null) simple.push(m[1]);
  return { complex, simple };
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks.length ? chunks : [[]];
}

function buildChunkText(relPath, partIndex, partTotal, header, elementLines, attrLines, enumLines) {
  const lines = [
    `【SDK XSD 权威】${relPath}`,
    partTotal > 1 ? `分片 ${partIndex + 1}/${partTotal}` : null,
    header,
  ].filter(Boolean);
  if (elementLines.length) {
    lines.push('elements:');
    lines.push(...elementLines.map((l) => `  - ${l}`));
  }
  if (attrLines.length) {
    lines.push('attributes:');
    lines.push(...attrLines.map((l) => `  - ${l}`));
  }
  if (enumLines.length) {
    lines.push('enumeration:');
    lines.push(enumLines.join(', '));
  }
  let text = lines.join('\n');
  if (text.length > CHUNK_MAX_LINES) {
    text = text.slice(0, CHUNK_MAX_LINES) + '\n…(分片截断，用 readSdkXsd 读全文)';
  }
  return text;
}

/**
 * 全量解析并分片；返回 { chunks, symbols }
 */
function parseXsdToChunks(content, relPath) {
  const body = stripXmlComments(content);
  const baseName = path.basename(relPath, '.xsd');
  const { complex, simple } = parseComplexAndSimpleTypes(body);
  const elements = parseAllElements(body);
  const attributes = parseAllAttributes(body);
  const enums = parseAllEnums(body);

  const header = [
    `根类型: ${baseName}`,
    complex.length ? `complexType(${complex.length}): ${complex.slice(0, 20).join(', ')}${complex.length > 20 ? '…' : ''}` : '',
    simple.length ? `simpleType(${simple.length}): ${simple.slice(0, 12).join(', ')}` : '',
    `统计: ${elements.length} elements, ${attributes.length} attributes, ${enums.length} enums`,
  ]
    .filter(Boolean)
    .join('\n');

  const symbols = {};
  const addSym = (name, entry) => {
    if (!name) return;
    if (!symbols[name]) symbols[name] = [];
    if (symbols[name].length < 8) symbols[name].push(entry);
  };

  for (const t of complex) addSym(t, { file: relPath, kind: 'complexType' });
  for (const t of simple) addSym(t, { file: relPath, kind: 'simpleType' });
  for (const e of elements) addSym(e.name, { file: relPath, kind: 'element', type: e.line });
  for (const a of attributes) addSym(a.name, { file: relPath, kind: 'attribute' });
  for (const en of enums) addSym(en.name, { file: relPath, kind: 'enum' });

  const elChunks = chunkArray(elements, ELEMENTS_PER_CHUNK);
  const atChunks = chunkArray(attributes, ATTRS_PER_CHUNK);
  const enChunks = chunkArray(enums, ENUMS_PER_CHUNK);
  const partTotal = Math.max(elChunks.length, atChunks.length, enChunks.length, 1);

  const chunks = [];
  for (let i = 0; i < partTotal; i++) {
    const elLines = (elChunks[i] || []).map((e) => e.line);
    const atLines = (atChunks[i] || []).map((a) => a.line);
    const enLines = (enChunks[i] || []).map((e) => e.line);
    const text = buildChunkText(relPath, i, partTotal, header, elLines, atLines, enLines);
    if (text.length < 30) continue;
    const title =
      partTotal > 1
        ? `${relPath.replace(/\.xsd$/i, '')}#${i + 1}`
        : relPath.replace(/\.xsd$/i, '');
    chunks.push({
      title,
      relPath,
      partIndex: i,
      partTotal,
      digest: text,
      summary: text.slice(0, 600),
    });
  }

  if (!chunks.length) {
    const text = buildChunkText(relPath, 0, 1, header, [], [], []);
    chunks.push({
      title: relPath.replace(/\.xsd$/i, ''),
      relPath,
      partIndex: 0,
      partTotal: 1,
      digest: text,
      summary: text.slice(0, 400),
    });
  }

  return { chunks, symbols };
}

function yieldMain() {
  return new Promise((r) => setImmediate(r));
}

function mergeSymbolMaps(target, source) {
  for (const [k, arr] of Object.entries(source || {})) {
    if (!target[k]) target[k] = [];
    for (const e of arr) {
      if (target[k].length >= 12) break;
      const dup = target[k].some((x) => x.file === e.file && x.kind === e.kind);
      if (!dup) target[k].push(e);
    }
  }
}

function writeSymbolIndex(knowledgeBaseDir, xsdRoot, symbols, fileCount) {
  if (!knowledgeBaseDir) return;
  const p = path.join(knowledgeBaseDir, 'xsd-symbol-index.json');
  const payload = {
    version: 1,
    xsdRoot,
    fileCount,
    symbolCount: Object.keys(symbols).length,
    builtAt: new Date().toISOString(),
    symbols,
  };
  fs.writeFileSync(p, JSON.stringify(payload), 'utf-8');
}

/**
 * @param {{ force?: boolean, onProgress?: (msg:string)=>void, addBatch?: (records:object[])=>Promise<void>, knowledgeBaseDir?: string }} options
 */
async function indexXsdSchemas(options = {}) {
  const { onProgress, addBatch, knowledgeBaseDir } = options;
  const xsdRoot = getSdkXsdRoot();
  if (!xsdRoot) {
    return { success: false, error: '未配置 SDK 或缺少 Schemas/xsd 目录', indexed: 0 };
  }

  const files = collectXsdFiles(xsdRoot);
  if (!files.length) {
    return { success: false, error: 'Schemas/xsd 下无 .xsd 文件', indexed: 0 };
  }

  onProgress?.(`📐 全量索引 XSD（${files.length} 个文件，分片入库）…`);
  console.log(`[XSD] 全量索引 ${files.length} @ ${xsdRoot}`);

  const batch = [];
  const allSymbols = {};
  let chunkCount = 0;
  let skipped = 0;
  let ticks = 0;

  for (const rel of files) {
    ticks++;
    if (ticks % YIELD_EVERY === 0) {
      await yieldMain();
      if (ticks % 150 === 0) {
        onProgress?.(`   …${ticks}/${files.length} 文件，已 ${chunkCount} 条分片`);
      }
    }

    const full = path.join(xsdRoot, ...rel.split('/'));
    let stat;
    try {
      stat = fs.statSync(full);
    } catch {
      skipped++;
      continue;
    }
    if (stat.size > MAX_FILE_BYTES) {
      console.warn('[XSD] 跳过大文件:', rel, stat.size);
      skipped++;
      continue;
    }

    let content;
    try {
      content = fs.readFileSync(full, 'utf-8');
    } catch {
      skipped++;
      continue;
    }

    const { chunks, symbols } = parseXsdToChunks(content, rel);
    mergeSymbolMaps(allSymbols, symbols);

    for (const ch of chunks) {
      batch.push({
        intent: `XSD规范：${ch.title}`,
        plan: [],
        summary: ch.summary,
        content: ch.digest,
        source_files: `XSD:${rel}${ch.partTotal > 1 ? `#${ch.partIndex + 1}` : ''}`,
        category: 'xsd',
        tags: ['xsd', 'xsd-schema', 'sdk-authority', ch.title.replace(/[/\\]/g, '-')],
        priority: 100,
        _isDoc: true,
        _xsdPath: rel,
        _xsdPart: ch.partIndex,
      });
      chunkCount++;
      if (batch.length >= BATCH_FLUSH && addBatch) {
        await addBatch(batch.splice(0, batch.length));
        await yieldMain();
      }
    }
  }

  if (batch.length && addBatch) await addBatch(batch);

  if (knowledgeBaseDir) {
    writeSymbolIndex(knowledgeBaseDir, xsdRoot, allSymbols, files.length);
  }

  console.log(`[XSD] 完成: ${chunkCount} 分片, ${Object.keys(allSymbols).length} 符号, 跳过 ${skipped} 文件`);
  onProgress?.(`✓ XSD 全量索引：${chunkCount} 条分片，${Object.keys(allSymbols).length} 个符号`);
  return {
    success: true,
    indexed: chunkCount,
    totalFiles: files.length,
    skipped,
    symbolCount: Object.keys(allSymbols).length,
    xsdRoot,
  };
}

function formatXsdAuthorityPromptBlock() {
  const root = getSdkXsdRoot();
  return (
    '## XML 规范权威来源（最高优先级）\n' +
    '- 标签/属性/枚举/模块结构以 SDK `Schemas/xsd` 为准；与教程冲突时**以 XSD 为准**。\n' +
    '- 工具：**lookupXsdSymbol**（符号表）→ **grepSdkXsd** / **readSdkXsd**（仅搜 SDK，不扫 MOD 项目）。\n' +
    '- 写 XML 前对关键模块用 grepSdkXsd 或 readSdkXsd 核对必填属性。\n' +
    (root ? `- XSD 路径：\`${root}\`\n` : '- 请配置 SDK 路径并重建知识库索引。\n')
  );
}

/** @deprecated 兼容旧测试 */
function parseXsdToDigest(content, relPath) {
  const { chunks } = parseXsdToChunks(content, relPath);
  const first = chunks[0] || { digest: '', summary: '', title: relPath };
  return {
    title: first.title,
    relPath,
    digest: first.digest,
    summary: first.summary,
    elementCount: 0,
    attrCount: 0,
    enumCount: 0,
  };
}

module.exports = {
  getSdkXsdRoot,
  collectXsdFiles,
  parseXsdToChunks,
  parseXsdToDigest,
  indexXsdSchemas,
  formatXsdAuthorityPromptBlock,
};
