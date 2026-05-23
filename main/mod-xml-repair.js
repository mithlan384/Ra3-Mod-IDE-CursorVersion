// main/mod-xml-repair.js —— 检测并生成/修复 data/Mod.xml（RA3 AssetDeclaration 格式）

const fs = require('fs');
const path = require('path');
const { findModXml } = require('./mod-register');

const MOD_XML_NAMES = new Set(['mod.xml', 'mod.xml'.toLowerCase()]);
const UNIT_CATEGORY_RE = /(?:Infantry|Vehicle|Aircraft|Structures)\//i;

function getDataDir(projectRoot) {
  const root = projectRoot.replace(/\\/g, '/');
  if (fs.existsSync(path.join(root, 'data'))) return path.join(root, 'data');
  if (fs.existsSync(path.join(root, 'Data'))) return path.join(root, 'Data');
  return path.join(root, 'data');
}

/**
 * @returns {{ status: 'ok'|'missing'|'empty'|'invalid', path?: string, rel?: string, hint?: string }}
 */
function assessModXml(projectRoot) {
  const mod = findModXml(projectRoot);
  if (!mod) {
    return {
      status: 'missing',
      hint: '未找到 data/Mod.xml 或 data/mod.xml',
    };
  }

  let content = '';
  try {
    content = fs.readFileSync(mod.full, 'utf-8');
  } catch (e) {
    return { status: 'missing', hint: e.message };
  }

  const trimmed = content.trim();
  if (trimmed.length < 40) {
    return { status: 'empty', path: mod.full, rel: mod.rel, hint: '文件存在但内容为空或过短' };
  }

  if (!/<(AssetDeclaration|Mod)\b/i.test(trimmed)) {
    return { status: 'invalid', path: mod.full, rel: mod.rel, hint: '缺少 AssetDeclaration 或 Mod 根节点' };
  }

  if (/<Mod\s+name=/i.test(trimmed) && !/<Includes/i.test(trimmed) && trimmed.length < 200) {
    return { status: 'invalid', path: mod.full, rel: mod.rel, hint: '仅有占位 Mod 节点，未包含 Includes' };
  }

  return { status: 'ok', path: mod.full, rel: mod.rel };
}

/** 收集应注册到 Mod.xml 的 data 下 XML（排除 Mod.xml 自身） */
function collectDataXmlIncludes(projectRoot) {
  const dataDir = getDataDir(projectRoot);
  if (!fs.existsSync(dataDir)) return [];

  const includes = [];
  const seen = new Set();

  function walk(dir, relBase) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = relBase ? `${relBase}/${ent.name}` : ent.name;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(full, rel);
        continue;
      }
      if (!/\.xml$/i.test(ent.name)) continue;
      if (MOD_XML_NAMES.has(ent.name.toLowerCase())) continue;

      const dataRel = rel.replace(/\\/g, '/');
      const source = dataRel.startsWith('DATA:') ? dataRel : `DATA:${dataRel}`;
      if (seen.has(source)) continue;
      seen.add(source);
      includes.push({ rel: dataRel, source, full });
    }
  }

  walk(dataDir, '');
  includes.sort((a, b) => a.rel.localeCompare(b.rel));
  return includes;
}

function buildModXmlContent(projectRoot, options = {}) {
  const modName = options.modName || path.basename(projectRoot);
  const { isInsurrectionProject } = require('./mod-xml-guard');

  if (isInsurrectionProject(projectRoot) && !options.forceFlatIncludes) {
    const factions = [];
    for (const side of ['Soviet', 'Allied', 'Japan']) {
      const top = path.join(projectRoot, 'data', `${side}.xml`);
      if (fs.existsSync(top)) factions.push(side);
    }
    const commonPath = path.join(projectRoot, 'data', 'Common.xml');
    const cmdPath = path.join(projectRoot, 'data', 'CommandData.xml');
    const lines = [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<AssetDeclaration xmlns="uri:ea.com:eala:asset">',
      '  <Includes>',
      '    <Include type="reference" source="DATA:Static.xml" />',
      '    <Include type="reference" source="DATA:Global.xml" />',
      '    <Include type="reference" source="DATA:Audio.xml" />',
    ];
    if (fs.existsSync(commonPath)) lines.push('    <Include type="all" source="Common.xml" />');
    for (const f of factions) lines.push(`    <Include type="all" source="${f}.xml" />`);
    if (fs.existsSync(cmdPath)) {
      try {
        const cmd = fs.readFileSync(cmdPath, 'utf-8');
        if (/<LogicCommand\b/i.test(cmd)) lines.push('    <Include type="all" source="CommandData.xml" />');
      } catch (e) {}
    }
    lines.push('  </Includes>', '</AssetDeclaration>', '');
    return { content: lines.join('\n'), includes: [], modName, layout: 'sdk-insurrection' };
  }

  const includes = collectDataXmlIncludes(projectRoot);
  const lines = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<AssetDeclaration xmlns="uri:ea.com:eala:asset" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
    '  <Includes>',
    '    <Include type="reference" source="DATA:static.xml" />',
    '    <Include type="reference" source="DATA:global.xml" />',
    '    <Include type="reference" source="DATA:audio.xml" />',
  ];

  const hasCommandData = includes.some((i) => /commanddata\.xml/i.test(i.rel));
  if (hasCommandData) {
    lines.push('    <Include type="all" source="CommandData.xml" />');
  }

  for (const item of includes) {
    if (/commanddata\.xml/i.test(item.rel)) continue;
    if (/static\.xml|global\.xml|audio\.xml/i.test(item.rel)) continue;
    if (UNIT_CATEGORY_RE.test(item.rel) || /GameObject\.xml$/i.test(item.rel)) continue;
    lines.push(`    <Include type="reference" source="${item.source}" />`);
  }

  lines.push('  </Includes>', '</AssetDeclaration>', '');
  return { content: lines.join('\n'), includes, modName };
}

/**
 * 写入 data/Mod.xml（标准路径）
 */
function repairModXml(projectRoot, options = {}) {
  const dataDir = getDataDir(projectRoot);
  const targetRel = 'data/Mod.xml';
  const targetFull = path.join(projectRoot, 'data', 'Mod.xml');
  const built = buildModXmlContent(projectRoot, options);
  const result = {
    success: true,
    path: targetFull.replace(/\\/g, '/'),
    rel: targetRel,
    content: built.content,
    registeredCount: built.includes.length,
    preview: built.content.slice(0, 800),
  };
  if (!options.deferWrite) {
    const { prepareModXmlWrite } = require('./mod-xml-guard');
    const prep = prepareModXmlWrite(targetRel, built.content, projectRoot);
    const content = prep.allowed ? prep.content : built.content;
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(targetFull, content, 'utf-8');
  }
  return result;
}

/** 若 Mod.xml 在子目录（如 zmobie2），提示并可选合并路径 */
function findAlternateModXmlLocations(projectRoot) {
  const hits = [];
  function walk(dir, depth) {
    if (depth > 4) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name.startsWith('.')) continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full, depth + 1);
      else if (/^mod\.xml$/i.test(ent.name)) {
        hits.push(path.relative(projectRoot, full).replace(/\\/g, '/'));
      }
    }
  }
  if (fs.existsSync(projectRoot)) walk(projectRoot, 0);
  return hits.filter((p) => !/^data\/mod\.xml$/i.test(p));
}

module.exports = {
  assessModXml,
  collectDataXmlIncludes,
  buildModXmlContent,
  repairModXml,
  findAlternateModXmlLocations,
  getDataDir,
};
