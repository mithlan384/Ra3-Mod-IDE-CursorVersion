// main/insurrection-migrate.js —— 起义时刻 Insurrection 标准格式迁移（扫描→计划→执行→验收）

const fs = require('fs');
const path = require('path');
const { findModXml } = require('./mod-register');
const { analyzeProjectConventions } = require('./project-conventions');
const { scanProject } = require('./project-scanner');
const {
  buildLogicCommandSnippet,
  buildCommandSetSnippet,
} = require('./logic-command-register');
const { repairCommandDataStructure } = require('./command-data-repair');

const SKIP_DIRS = new Set(['.git', '.ra3ide', 'node_modules', 'compiled', 'Compiled', 'builtmods', '.vscode']);
/** 起义时刻/BAE 约定：数据目录固定小写 data/ */
const CANONICAL_DATA_REL = 'data';
const FORBIDDEN_SUCCESS_PHRASES = [
  '已按起义时刻标准化',
  '已完成起义时刻标准化',
  '已标准化为起义时刻',
  '已是起义时刻标准',
  '已按标准 MOD 结构完成',
  '已完成结构整理',
  '已符合标准 MOD 结构',
];

function readTextSafe(filePath, max = 200000) {
  try {
    const buf = fs.readFileSync(filePath);
    return (buf.length > max ? buf.subarray(0, max) : buf).toString('utf-8');
  } catch {
    return '';
  }
}

function resolveDataDir(root) {
  const lower = path.join(root, CANONICAL_DATA_REL);
  const upper = path.join(root, 'Data');
  if (fs.existsSync(lower)) {
    return { rel: CANONICAL_DATA_REL, full: lower };
  }
  if (fs.existsSync(upper)) {
    return { rel: CANONICAL_DATA_REL, full: upper, legacyCase: 'Data' };
  }
  return { rel: CANONICAL_DATA_REL, full: lower, missing: true };
}

/**
 * NTFS 上通过临时名把目录显示名改为小写 data
 */
function fixDataFolderNameToLowercase(root) {
  const current = path.join(root, CANONICAL_DATA_REL);
  if (!fs.existsSync(current)) return false;
  const tmp = path.join(root, '__ra3ide_data_case__');
  try {
    if (fs.existsSync(tmp)) fs.rmSync(tmp, { recursive: true, force: true });
    fs.renameSync(current, tmp);
    fs.renameSync(tmp, path.join(root, CANONICAL_DATA_REL));
    return true;
  } catch {
    return false;
  }
}

/**
 * 将 Data/ 规范为 data/（与 Insurrection、mod.babproj 一致）
 */
function normalizeDataDirCase(projectRoot, onProgress) {
  const root = String(projectRoot || '').replace(/\\/g, '/');
  const lower = path.join(root, CANONICAL_DATA_REL);
  const upper = path.join(root, 'Data');
  const log = [];

  const hasLower = fs.existsSync(lower);
  const hasUpper = fs.existsSync(upper);

  if (!hasLower && !hasUpper) {
    fs.mkdirSync(lower, { recursive: true });
    log.push('已创建空 data/');
    return { success: true, created: true, rel: CANONICAL_DATA_REL, full: lower, log };
  }

  let sameFolder = false;
  if (hasLower && hasUpper) {
    try {
      sameFolder =
        fs.realpathSync(lower).toLowerCase() === fs.realpathSync(upper).toLowerCase();
    } catch {
      sameFolder = lower.toLowerCase() === upper.toLowerCase();
    }
  }
  if (hasLower && hasUpper && !sameFolder) {
    onProgress?.('⚠️ 同时存在 data/ 与 Data/（区分大小写磁盘），请手动合并');
    log.push('同时存在 data/ 与 Data/');
    return { success: false, rel: CANONICAL_DATA_REL, full: lower, log };
  }

  onProgress?.('📁 规范数据目录名为小写 data/…');
  if (fixDataFolderNameToLowercase(root)) {
    log.push('目录名已规范为 data/（NTFS 大小写修正）');
  }
  return { success: true, renamed: true, rel: CANONICAL_DATA_REL, full: path.join(root, CANONICAL_DATA_REL), log };
}

/** 同步 mod.babproj 中 Stream Source 为 …/data/mod.xml */
function syncModBabprojDataPath(projectRoot) {
  const root = String(projectRoot || '').replace(/\\/g, '/');
  const babPath = path.join(root, 'mod.babproj');
  if (!fs.existsSync(babPath)) return { updated: false, reason: '无 mod.babproj' };

  let content = fs.readFileSync(babPath, 'utf-8');
  const modXmlFull = path.join(root, CANONICAL_DATA_REL, 'Mod.xml').replace(/\\/g, '/');
  const modXmlExists = fs.existsSync(modXmlFull);
  const targetSource = modXmlExists
    ? modXmlFull
    : path.join(root, CANONICAL_DATA_REL, 'mod.xml').replace(/\\/g, '/');

  const streamRe = /(<Stream\s+Source=")[^"]+(")/i;
  if (!streamRe.test(content)) return { updated: false, reason: '未找到 Stream Source' };

  const next = content.replace(streamRe, `$1${targetSource}$2`);
  if (next === content) return { updated: false, reason: '路径已正确' };
  trackedWriteUtf8(root, 'mod.babproj', next);
  return { updated: true, path: 'mod.babproj', source: targetSource };
}

function buildTopFactionAggregatorXml(side) {
  return `<?xml version="1.0" encoding="utf-8"?>
<AssetDeclaration xmlns="uri:ea.com:eala:asset">
  <Includes>
    <Include type="all" source="${side}/${side}.xml" />
  </Includes>
</AssetDeclaration>
`;
}

/** 路径转为阵营子聚合内相对路径（相对 data/Allied/） */
function toFactionSubInclude(side, includePath) {
  const p = normalizeRel(includePath);
  const prefix = `${side}/`;
  if (p.toLowerCase().startsWith(prefix.toLowerCase())) {
    return p.slice(prefix.length);
  }
  return p;
}

function normalizeRel(rel) {
  return String(rel || '').replace(/\\/g, '/').replace(/^\/+/, '');
}

function trackedWriteUtf8(root, rel, content) {
  const r = normalizeRel(rel);
  try {
    require('./agent-rollback').captureBeforeMutate(root, r);
  } catch (e) {
    console.warn('[insurrection-migrate] rollback capture:', e.message);
  }
  const full = resolveProjectPath(root, r);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf-8');
}

function resolveProjectPath(root, rel) {
  const r = normalizeRel(rel);
  const { resolveWithinProject } = require('./path-sandbox');
  const safe = resolveWithinProject(root, r);
  if (!safe) throw new Error(`路径越界: ${rel}`);
  return safe;
}

function isDeprecatedFile(content) {
  return /<!--\s*DEPRECATED/i.test(String(content || '').slice(0, 800));
}

function inferSideFromRel(rel) {
  const lower = normalizeRel(rel).toLowerCase();
  if (/\/allied\b|\/allies\b/i.test(lower)) return 'Allied';
  if (/\/soviet\b/i.test(lower)) return 'Soviet';
  if (/\/japan\b|\/imperial\b/i.test(lower)) return 'Japan';
  return 'Soviet';
}

function inferCategoryFromRel(rel, kind = 'infantry') {
  const lower = normalizeRel(rel).toLowerCase();
  if (/\/vehicle\b|\/vehicles\b/i.test(lower) || kind === 'vehicle') return 'Vehicle';
  if (/\/aircraft\b/i.test(lower) || kind === 'aircraft') return 'Aircraft';
  if (/\/structure\b/i.test(lower)) return 'Structures';
  if (/\/infantry\b/i.test(lower)) return 'Infantry';
  if (/\/units\b/i.test(lower)) {
    if (kind === 'vehicle') return 'Vehicle';
    if (kind === 'aircraft') return 'Aircraft';
    return 'Infantry';
  }
  return 'Infantry';
}

function inferUnitKindFromContent(content) {
  const c = String(content || '');
  if (/\bBaseVehicle\b|inheritFrom="[^"]*Vehicle/i.test(c)) return 'vehicle';
  if (/\bBaseAircraft\b|inheritFrom="[^"]*Aircraft/i.test(c)) return 'aircraft';
  return 'infantry';
}

function collectGameObjectUnits(root) {
  const byId = new Map();

  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (ent.name.startsWith('.') || SKIP_DIRS.has(ent.name)) continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.xml$/i.test(ent.name) || /\.bak$/i.test(ent.name)) continue;
      const rel = normalizeRel(path.relative(root, full));
      const content = readTextSafe(full, 120000);
      if (isDeprecatedFile(content)) continue;
      const goMatch = content.match(/<GameObject\b[^>]*\bid="([A-Za-z][\w]*)"/i);
      if (!goMatch) continue;
      const unitId = goMatch[1];
      const key = unitId.toLowerCase();
      const isPackage =
        /\/gameobject\.xml$/i.test(rel) ||
        (/<Include\s+type="all"\s+source="[^"]+\/GameObject\.xml"/i.test(content) &&
          !/<GameObject\b/i.test(content));
      const entry = {
        unitId,
        file: rel,
        side: inferSideFromRel(rel),
        category: inferCategoryFromRel(rel, inferUnitKindFromContent(content)),
        isPackage,
        content,
      };
      if (!byId.has(key)) byId.set(key, { primary: entry, duplicates: [] });
      else byId.get(key).duplicates.push(entry);
    }
  }
  walk(root);
  const units = [];
  for (const { primary, duplicates } of byId.values()) {
    units.push({ ...primary, duplicates: duplicates.map((d) => d.file) });
  }
  return units;
}

function scoreCanonicalPath(rel, dataRel = CANONICAL_DATA_REL) {
  const n = normalizeRel(rel).toLowerCase().replace(/^data\//, 'data/');
  let score = 0;
  if (n.startsWith('data/')) score += 50;
  if (/\/units\//i.test(n)) score += 10;
  if (/\/infantry\/|\/vehicle\/|\/aircraft\//i.test(n)) score += 20;
  if (/\/gameobject\.xml$/i.test(n)) score += 30;
  if (!/^mod\.xml$/i.test(n) && !/^allied\.xml$/i.test(n)) score += 5;
  if (/^allied\/|^soviet\/|^japan\//i.test(n) && !n.startsWith(`${dataRel.toLowerCase()}/`)) score -= 40;
  if (/^mod\.xml$/i.test(n)) score -= 100;
  return score;
}

function pickCanonicalUnit(units, dataRel) {
  const byId = new Map();
  for (const u of units) {
    const key = u.unitId.toLowerCase();
    if (!byId.has(key)) byId.set(key, []);
    byId.get(key).push(u);
  }
  const canonical = [];
  const duplicatesToDelete = [];
  for (const [, list] of byId) {
    const sorted = [...list].sort(
      (a, b) => scoreCanonicalPath(b.file, dataRel) - scoreCanonicalPath(a.file, dataRel)
    );
    const best = sorted[0];
    canonical.push(best);
    for (let i = 1; i < sorted.length; i++) {
      duplicatesToDelete.push({ rel: sorted[i].file, reason: `重复单位 ${best.unitId}` });
    }
    for (const dupRel of best.duplicates || []) {
      if (dupRel !== best.file) {
        duplicatesToDelete.push({ rel: dupRel, reason: `重复单位 ${best.unitId}` });
      }
    }
  }
  return { canonical, duplicatesToDelete };
}

function findLegacyDuplicatePaths(root, dataRel) {
  const toDelete = [];
  const rootMod = path.join(root, 'Mod.xml');
  const dataMod = path.join(root, dataRel, 'Mod.xml');
  if (fs.existsSync(rootMod) && fs.existsSync(dataMod)) {
    toDelete.push({ rel: 'Mod.xml', reason: '根目录 Mod.xml 与 data/Mod.xml 重复' });
  }
  for (const side of ['Allied', 'Soviet', 'Japan']) {
    const legacyDir = path.join(root, side);
    const canonicalDir = path.join(root, dataRel, side);
    if (!fs.existsSync(legacyDir) || !fs.existsSync(canonicalDir)) continue;
    function walk(dir, prefix) {
      let entries;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const ent of entries) {
        const relPart = prefix ? `${prefix}/${ent.name}` : ent.name;
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) walk(full, relPart);
        else if (/\.xml$/i.test(ent.name) && fs.existsSync(path.join(canonicalDir, relPart))) {
          toDelete.push({
            rel: `${side}/${relPart}`,
            reason: '根目录阵营目录与 data 下重复',
          });
        }
      }
    }
    walk(legacyDir, '');
  }
  return toDelete;
}

const INSURRECTION_FACTION_CATEGORIES = new Set([
  'Infantry',
  'Vehicle',
  'Aircraft',
  'Structures',
  'Structure',
  'Naval',
  'Ship',
]);

/** 起义时刻不允许 data/{阵营}/Units/，应为 Infantry/Vehicle 等 */
function findForbiddenUnitsFolders(root, dataRel = CANONICAL_DATA_REL) {
  const targets = [];
  for (const side of ['Allied', 'Soviet', 'Japan']) {
    const unitsDir = path.join(root, dataRel, side, 'Units');
    if (!fs.existsSync(unitsDir)) continue;
    targets.push({
      rel: `${dataRel}/${side}/Units`,
      reason: '标准 MOD 不使用 Units 目录，应使用 Infantry/Vehicle/Aircraft/Structures',
      isDirectory: true,
    });
  }
  return targets;
}

/** 根目录遗留：Allied/、Soviet/（迁移前扁平布局）、DEPRECATED 占位 XML */
function findRootLegacyFactionDirs(root, dataRel = CANONICAL_DATA_REL) {
  const targets = [];
  for (const side of ['Allied', 'Soviet', 'Japan']) {
    const legacyDir = path.join(root, side);
    const canonicalDir = path.join(root, dataRel, side);
    if (!fs.existsSync(legacyDir) || !fs.existsSync(canonicalDir)) continue;
    targets.push({
      rel: side,
      reason: `根目录 ${side}/ 为旧版遗留（单位应在 data/${side}/ 下）`,
      isDirectory: true,
    });
  }
  return targets;
}

function findDeprecatedStubFiles(root) {
  const targets = [];
  const stubs = ['mytank.xml', 'SuperApocalypseTank.xml', 'Mod.xml'];
  for (const name of stubs) {
    const full = path.join(root, name);
    if (!fs.existsSync(full)) continue;
    const content = readTextSafe(full, 500);
    if (/DEPRECATED/i.test(content) || name !== 'Mod.xml') {
      targets.push({ rel: name, reason: '根目录废弃占位 XML' });
    } else if (name === 'Mod.xml' && fs.existsSync(path.join(root, CANONICAL_DATA_REL, 'Mod.xml'))) {
      targets.push({ rel: name, reason: '根目录 Mod.xml 与 data/Mod.xml 重复' });
    }
  }
  return targets;
}

function walkFilesForCleanup(dir, relBase, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    const rel = relBase ? `${relBase}/${ent.name}` : ent.name;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (!SKIP_DIRS.has(ent.name)) walkFilesForCleanup(full, rel, out);
    } else if (/\.(bak|tmp)$/i.test(ent.name) || /\.xml\.bak$/i.test(ent.name)) {
      out.push({ rel, reason: '备份/临时文件' });
    }
  }
}

function findBackupAndOrphanFiles(root, dataRel = CANONICAL_DATA_REL) {
  const files = [];
  const dataFull = path.join(root, dataRel);
  if (fs.existsSync(dataFull)) walkFilesForCleanup(dataFull, dataRel, files);
  walkFilesForCleanup(root, '', files);
  return files.filter((f) => !f.rel.startsWith('.ra3ide') && !f.rel.startsWith('.knowledge'));
}

function collectLegacyCleanupTargets(root, dataRel = CANONICAL_DATA_REL) {
  return [
    ...findLegacyDuplicatePaths(root, dataRel),
    ...findRootLegacyFactionDirs(root, dataRel),
    ...findForbiddenUnitsFolders(root, dataRel),
    ...findDeprecatedStubFiles(root),
    ...findBackupAndOrphanFiles(root, dataRel),
  ];
}

function deleteProjectDir(projectRoot, rel) {
  const full = resolveProjectPath(projectRoot, rel);
  if (!fs.existsSync(full)) return { success: false, error: `目录不存在: ${rel}` };
  if (isProtectedModXml(`${rel}/Mod.xml`) || /[/\\]data[/\\]mod\.xml$/i.test(full)) {
    return { success: false, error: '禁止删除 data 目录' };
  }
  fs.rmSync(full, { recursive: true, force: true });
  return { success: true, data: { deletedDir: normalizeRel(rel) } };
}

function applyLegacyCleanup(projectRoot, targets, onProgress) {
  const root = String(projectRoot || '').replace(/\\/g, '/');
  const log = [];
  const changed = [];
  for (const t of targets) {
    if (t.isDirectory) {
      onProgress?.(`🗑 删除目录: ${t.rel}（${t.reason}）`);
      const res = deleteProjectDir(root, t.rel);
      if (res.success) changed.push(`(deleted-dir) ${t.rel}`);
      else log.push(`${t.rel}: ${res.error}`);
      continue;
    }
    const full = resolveProjectPath(root, t.rel);
    if (!fs.existsSync(full)) continue;
    onProgress?.(`🗑 删除: ${t.rel}`);
    const res = deleteProjectFile(root, t.rel);
    if (res.success) changed.push(`(deleted) ${t.rel}`);
    else log.push(`${t.rel}: ${res.error}`);
  }
  return { changed, log };
}

function extractGameObjectBlock(content, unitId) {
  const tag = content.match(new RegExp(`<GameObject\\b[^>]*\\bid="${unitId}"[^>]*>`, 'i'));
  if (!tag) return null;
  const tagName = 'GameObject';
  const start = content.indexOf(tag[0]);
  let depth = 0;
  let pos = start;
  const openRe = /<GameObject\b/gi;
  const closeRe = /<\/GameObject>/gi;
  let end = -1;
  while (pos < content.length) {
    openRe.lastIndex = pos;
    closeRe.lastIndex = pos;
    const o = openRe.exec(content);
    const c = closeRe.exec(content);
    if (!o && !c) break;
    if (o && (!c || o.index <= c.index)) {
      depth++;
      pos = o.index + o[0].length;
    } else if (c) {
      depth--;
      pos = c.index + c[0].length;
      if (depth === 0) {
        end = pos;
        break;
      }
    }
  }
  if (end < 0) return null;
  return content.slice(start, end).trim();
}

function extractIncludesFromContent(content) {
  const includesBlock = content.match(/<Includes>([\s\S]*?)<\/Includes>/i);
  if (includesBlock) return includesBlock[1].trim();
  const loose = [];
  const re = /<Include\s+[^>]*\/?>/gi;
  let m;
  while ((m = re.exec(content))) loose.push(m[0]);
  return loose.length ? loose.map((x) => `    ${x}`).join('\n') : '';
}

function buildGameObjectXmlFromFlat(content, unitId, conventions) {
  const block = extractGameObjectBlock(content, unitId);
  if (!block) return null;
  const includesInner = extractIncludesFromContent(content);
  const baseInc =
    conventions?.xmlWriting?.baseIncludePattern || 'DATA:SageXml/BaseObjects/BaseInfantry.xml';
  const includes =
    includesInner ||
    `    <Include type="instance" source="${baseInc}" />`;
  return `<?xml version="1.0" encoding="utf-8"?>
<AssetDeclaration xmlns="uri:ea.com:eala:asset" xmlns:xai="uri:ea.com:eala:asset:instance">
  <Includes>
${includes}
  </Includes>
  ${block}
</AssetDeclaration>
`;
}

function extractCommandDataBlocksForUnit(content, unitId) {
  const cmdId = `Command_Construct${unitId}`;
  const setId = `${unitId}CommandSet`;
  const blocks = [];
  const cmdRe = new RegExp(
    `<LogicCommand\\b[\\s\\S]*?\\bid="${cmdId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[\\s\\S]*?<\\/LogicCommand>`,
    'i'
  );
  const setRe = new RegExp(
    `<LogicCommandSet\\b[\\s\\S]*?\\bid="${setId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[\\s\\S]*?<\\/LogicCommandSet>`,
    'i'
  );
  const cmdM = content.match(cmdRe);
  const setM = content.match(setRe);
  if (cmdM) blocks.push(cmdM[0]);
  if (setM) blocks.push(setM[0]);
  return blocks;
}

function stripCommandDataBlocksForUnit(content, unitId) {
  let c = String(content || '');
  const cmdId = `Command_Construct${unitId}`;
  const setId = `${unitId}CommandSet`;
  c = c.replace(
    new RegExp(
      `\\s*<!--[^\\n]*${unitId}[^\\n]*-->\\s*<LogicCommand[\\s\\S]*?<\\/LogicCommand>`,
      'gi'
    ),
    '\n'
  );
  c = c.replace(
    new RegExp(`<LogicCommand\\b[\\s\\S]*?\\bid="${cmdId}"[\\s\\S]*?<\\/LogicCommand>`, 'gi'),
    '\n'
  );
  c = c.replace(
    new RegExp(`<LogicCommandSet\\b[\\s\\S]*?\\bid="${setId}"[\\s\\S]*?<\\/LogicCommandSet>`, 'gi'),
    '\n'
  );
  return repairCommandDataStructure(c).content;
}

function buildUnitPackageFiles(unit, dataRel, conventions, commandDataContent) {
  const folderName = unit.unitId.replace(/[\\/:*?"<>|]/g, '_');
  const side = unit.side || 'Soviet';
  const category = unit.category || 'Infantry';
  const sub = `${dataRel}/${side}/${category}/${folderName}`;
  const wrapperRel = `${dataRel}/${side}/${category}/${folderName}.xml`;

  const gameObjectXml = buildGameObjectXmlFromFlat(unit.content, unit.unitId, conventions);
  if (!gameObjectXml) return null;

  let logicBlocks = commandDataContent
    ? extractCommandDataBlocksForUnit(commandDataContent, unit.unitId)
    : [];
  const logicCommandBody =
    logicBlocks.find((b) => /<LogicCommand\b/i.test(b)) || buildLogicCommandSnippet(unit.unitId).trim();
  const logicSetBody =
    logicBlocks.find((b) => /<LogicCommandSet\b/i.test(b)) || buildCommandSetSnippet(unit.unitId).trim();

  const logicCommandXml = `<?xml version="1.0" encoding="utf-8"?>
<AssetDeclaration xmlns="uri:ea.com:eala:asset">
${logicCommandBody}
</AssetDeclaration>
`;

  const logicCommandSetXml = `<?xml version="1.0" encoding="utf-8"?>
<AssetDeclaration xmlns="uri:ea.com:eala:asset">
${logicSetBody}
</AssetDeclaration>
`;

  const wrapperXml = `<?xml version="1.0" encoding="utf-8"?>
<AssetDeclaration xmlns="uri:ea.com:eala:asset">
  <Includes>
    <Include type="all" source="${folderName}/GameObject.xml" />
    <Include type="all" source="${folderName}/LogicCommand.xml" />
    <Include type="all" source="${folderName}/LogicCommandSet.xml" />
  </Includes>
</AssetDeclaration>
`;

  return {
    wrapperRel,
    aggregatorInclude: `${category}/${folderName}.xml`,
    files: [
      { rel: `${sub}/GameObject.xml`, content: gameObjectXml },
      { rel: `${sub}/LogicCommand.xml`, content: logicCommandXml },
      { rel: `${sub}/LogicCommandSet.xml`, content: logicCommandSetXml },
      { rel: wrapperRel, content: wrapperXml },
    ],
    deleteSource: unit.file,
  };
}

/**
 * 严格验收：禁止用 compileHealth.blocking===0 代替
 */
function assessInsurrectionCompliance(projectRoot, scanData = null) {
  const root = String(projectRoot || '').replace(/\\/g, '/');
  const conventions = analyzeProjectConventions(root, scanData);
  const data = resolveDataDir(root);
  const mod = findModXml(root);
  const checks = [];

  const pass = (id, ok, message) => {
    checks.push({ id, pass: !!ok, message });
    return !!ok;
  };

  pass('mod_xml_exists', !!mod, mod ? `Mod.xml: ${mod.rel}` : '未找到 data/Mod.xml');

  const refOwn = (conventions.modIncludes || []).filter(
    (i) => i.type === 'reference' && /units\/|infantry\/|vehicle\/|aircraft\//i.test(i.source)
  );
  pass(
    'mod_no_ref_own_units',
    refOwn.length === 0,
    refOwn.length
      ? `Mod.xml 仍有 ${refOwn.length} 条 reference 指向自建单位`
      : 'Mod.xml 未用 reference 引用自建单位'
  );

  const allAgg = (conventions.modIncludes || []).filter((i) => i.type === 'all');
  const factionAll = allAgg.filter((i) =>
    /allied\.xml|soviet\.xml|japan\.xml|other\.xml|common\.xml/i.test(i.source)
  );
  pass(
    'mod_faction_aggregators',
    factionAll.length >= 1,
    factionAll.length
      ? `阵营聚合 Include: ${factionAll.map((i) => i.source).join(', ')}`
      : 'Mod.xml 缺少 type="all" 的阵营聚合（Allied.xml 等）'
  );

  const vanillaRef = (conventions.modIncludes || []).filter(
    (i) => i.type === 'reference' && /static|global|audio/i.test(i.source)
  );
  pass(
    'mod_vanilla_reference',
    vanillaRef.length >= 2,
    `原版 reference 条目: ${vanillaRef.length}`
  );

  pass(
    'layout_sdk_insurrection',
    conventions.layoutProfile === 'sdk-insurrection',
    `layoutProfile=${conventions.layoutProfile}（需 sdk-insurrection：子目录 GameObject 或 wrapper+聚合）`
  );

  const modRelOk = mod && mod.rel === `${CANONICAL_DATA_REL}/Mod.xml`;
  let pathUsesData = false;
  try {
    const entries = fs.readdirSync(root, { withFileTypes: true });
    pathUsesData = entries.some((e) => e.isDirectory() && e.name === 'Data');
  } catch {
    /* ignore */
  }
  pass(
    'data_dir_lowercase',
    modRelOk && !pathUsesData,
    modRelOk
      ? pathUsesData
        ? '目录列表仍显示 Data/，请运行 refineInsurrectionLayout 规范大小写'
        : 'Mod.xml 位于 data/Mod.xml（小写）'
      : `Mod.xml 应为 data/Mod.xml，当前: ${mod?.rel || '(未找到)'}`
  );

  const dataDir = path.join(root, CANONICAL_DATA_REL);
  for (const side of ['Allied', 'Soviet', 'Japan']) {
    const topAgg = path.join(dataDir, `${side}.xml`);
    if (!fs.existsSync(topAgg)) continue;
    const topContent = readTextSafe(topAgg, 8000);
    const subRef = `${side}/${side}.xml`;
    pass(
      `faction_sub_agg_${side}`,
      new RegExp(`type="all"\\s+source="${subRef.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'i').test(
        topContent
      ),
      `data/${side}.xml 应 Include type="all" source="${subRef}"（二级阵营聚合）`
    );
    const subAgg = path.join(dataDir, side, `${side}.xml`);
    pass(
      `faction_sub_file_${side}`,
      fs.existsSync(subAgg),
      fs.existsSync(subAgg)
        ? `data/${side}/${side}.xml 存在`
        : `缺少 data/${side}/${side}.xml`
    );
  }

  const legacyDup = findLegacyDuplicatePaths(root, CANONICAL_DATA_REL);
  const rootDup = legacyDup.filter((d) => !d.rel.startsWith(`${data.rel}/`));
  pass(
    'no_root_duplicate_tree',
    rootDup.length === 0,
    rootDup.length ? `仍存在根目录重复: ${rootDup.map((d) => d.rel).join(', ')}` : '无根目录重复 Mod/阵营树'
  );

  const units = collectGameObjectUnits(root);
  const { duplicatesToDelete } = pickCanonicalUnit(units, data.rel);
  pass(
    'no_duplicate_unit_paths',
    duplicatesToDelete.length === 0,
    duplicatesToDelete.length
      ? `仍有 ${duplicatesToDelete.length} 处重复单位路径待清理`
      : '无重复单位路径'
  );

  const unitsDirs = findForbiddenUnitsFolders(root, CANONICAL_DATA_REL);
  pass(
    'no_units_folder',
    unitsDirs.length === 0,
    unitsDirs.length
      ? `仍存在 Units 目录: ${unitsDirs.map((d) => d.rel).join(', ')}`
      : '阵营下无 Units/ 目录（符合 Infantry/Vehicle 分类）'
  );

  const rootFactionDirs = findRootLegacyFactionDirs(root, CANONICAL_DATA_REL);
  pass(
    'no_root_faction_dirs',
    rootFactionDirs.length === 0,
    rootFactionDirs.length
      ? `根目录仍有遗留阵营文件夹: ${rootFactionDirs.map((d) => d.rel).join(', ')}`
      : '无根目录 Allied/Soviet 遗留目录'
  );

  const deprecatedStubs = findDeprecatedStubFiles(root);
  pass(
    'no_deprecated_root_xml',
    deprecatedStubs.length === 0,
    deprecatedStubs.length
      ? `根目录废弃 XML: ${deprecatedStubs.map((d) => d.rel).join(', ')}`
      : '无根目录 DEPRECATED 占位 XML'
  );

  if (conventions.commandProfile === 'commanddata-central') {
    pass(
      'command_not_only_commanddata',
      conventions.stats?.gameObjectInSubfolder >= 2,
      '仍为 CommandData 集中式；标准 MOD 应使用单位目录内 LogicCommand'
    );
  } else {
    pass('command_distributed', true, `命令组织: ${conventions.commandProfile}`);
  }

  const failed = checks.filter((c) => !c.pass);
  const compliant = failed.length === 0;

  return {
    compliant,
    layoutProfile: conventions.layoutProfile,
    commandProfile: conventions.commandProfile,
    checks,
    failedChecks: failed,
    summary: compliant
      ? '✅ 已通过标准 MOD 结构验收（Mod.xml 聚合与分包布局正确）。'
      : `❌ 未通过结构验收（${failed.length} 项未满足）。请勿声称「已完成结构整理」。`,
    forbiddenPhrasesIfNotCompliant: FORBIDDEN_SUCCESS_PHRASES,
  };
}

function buildMigrationPlan(projectRoot) {
  const root = String(projectRoot || '').replace(/\\/g, '/');
  const data = resolveDataDir(root);
  const conventions = analyzeProjectConventions(root);
  const units = collectGameObjectUnits(root);
  const { canonical, duplicatesToDelete } = pickCanonicalUnit(units, data.rel);
  const legacyDeletes = findLegacyDuplicatePaths(root, data.rel);

  const commandDataRel = conventions.hasCommandData
    ? `${data.rel}/CommandData.xml`
    : null;
  const commandDataPath = commandDataRel ? path.join(root, commandDataRel) : null;
  const commandDataContent =
    commandDataPath && fs.existsSync(commandDataPath) ? readTextSafe(commandDataPath) : '';

  const conversions = [];
  const keepFlat = [];

  for (const unit of canonical) {
    if (unit.isPackage) {
      keepFlat.push({ unitId: unit.unitId, file: unit.file, action: 'keep_package' });
      continue;
    }
    const pkg = buildUnitPackageFiles(unit, data.rel, conventions, commandDataContent);
    if (!pkg) {
      keepFlat.push({ unitId: unit.unitId, file: unit.file, action: 'keep_flat_failed_parse' });
      continue;
    }
    conversions.push({
      unitId: unit.unitId,
      from: unit.file,
      to: pkg.wrapperRel,
      files: pkg.files.map((f) => f.rel),
      deleteAfter: [unit.file],
      aggregatorInclude: pkg.aggregatorInclude,
    });
  }

  const deletes = [
    ...duplicatesToDelete,
    ...legacyDeletes,
    ...collectLegacyCleanupTargets(root, data.rel),
  ];
  const factions = new Set(canonical.map((u) => u.side).filter(Boolean));

  return {
    dataRoot: data.rel,
    modXmlPath: conventions.modXmlPath,
    layoutBefore: conventions.layoutProfile,
    unitCount: canonical.length,
    conversions,
    keepFlat,
    deletes,
    factions: [...factions],
    commandDataRel,
  };
}

function buildInsurrectionModXml(dataRel, factionNames, options = {}) {
  const lines = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<AssetDeclaration xmlns="uri:ea.com:eala:asset">',
    '  <Includes>',
    '    <Include type="reference" source="DATA:Static.xml" />',
    '    <Include type="reference" source="DATA:Global.xml" />',
    '    <Include type="reference" source="DATA:Audio.xml" />',
  ];
  if (options.includeCommon) {
    lines.push('    <Include type="all" source="Common.xml" />');
  }
  for (const f of factionNames) {
    lines.push(`    <Include type="all" source="${f}.xml" />`);
  }
  if (options.includeCommandData) {
    lines.push(`    <Include type="all" source="CommandData.xml" />`);
  }
  lines.push('  </Includes>', '</AssetDeclaration>', '');
  return lines.join('\n');
}

function buildFactionAggregatorXml(side, includes) {
  const unique = [...new Set(includes)].sort();
  const body = unique.map((src) => `    <Include type="all" source="${src}" />`).join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<AssetDeclaration xmlns="uri:ea.com:eala:asset">
  <Includes>
${body || '    <!-- 暂无单位 -->'}
  </Includes>
</AssetDeclaration>
`;
}

function collectAggregatorIncludesFromDisk(root, dataRel = CANONICAL_DATA_REL) {
  const aggregatorIncludes = { Allied: [], Soviet: [], Japan: [] };
  const units = collectGameObjectUnits(root);
  const { canonical } = pickCanonicalUnit(units, dataRel);
  const dataPrefix = new RegExp(`^(?:data|Data)/`, 'i');

  for (const unit of canonical) {
    const side = unit.side || 'Soviet';
    if (!aggregatorIncludes[side]) continue;
    const rel = normalizeRel(unit.file).replace(dataPrefix, `${CANONICAL_DATA_REL}/`);
    if (/\/gameobject\.xml$/i.test(rel)) {
      const wrapper = rel.replace(/\/gameobject\.xml$/i, '.xml');
      const m = wrapper.match(/^data\/(Allied|Soviet|Japan)\/(.+)$/i);
      if (m) aggregatorIncludes[m[1]].push(m[2]);
      continue;
    }
    const wrapperMatch = rel.match(/^data\/(Allied|Soviet|Japan)\/([^/]+)\/([^/]+)\.xml$/i);
    if (wrapperMatch && /<Include\s+type="all"/i.test(unit.content)) {
      aggregatorIncludes[wrapperMatch[1]].push(`${wrapperMatch[2]}/${wrapperMatch[3]}.xml`);
      continue;
    }
    const flatUnderSide = rel.match(
      /^data\/(Allied|Soviet|Japan)\/(Units|Infantry|Vehicle|Aircraft|Structures)\/([^/]+)\.xml$/i
    );
    if (flatUnderSide) {
      aggregatorIncludes[flatUnderSide[1]].push(`${flatUnderSide[2]}/${flatUnderSide[3]}.xml`);
    }
  }
  for (const side of Object.keys(aggregatorIncludes)) {
    aggregatorIncludes[side] = [...new Set(aggregatorIncludes[side])].sort();
  }
  return aggregatorIncludes;
}

function rebuildModXmlInsurrection(projectRoot, options = {}) {
  const root = String(projectRoot || '').replace(/\\/g, '/');
  const plan = buildMigrationPlan(root);
  const data = resolveDataDir(root);
  const mod = findModXml(root);
  const modRel = `${CANONICAL_DATA_REL}/Mod.xml`;

  const aggregatorIncludes = collectAggregatorIncludesFromDisk(root, data.rel);

  const factionsPresent = [...new Set([
    ...plan.factions,
    ...Object.keys(aggregatorIncludes).filter((s) => aggregatorIncludes[s].length),
  ])].filter((s) => aggregatorIncludes[s]?.length || plan.factions.includes(s));
  const factionFiles = [];
  const written = [];

  const dataRel = CANONICAL_DATA_REL;
  for (const side of ['Allied', 'Soviet', 'Japan']) {
    if (!factionsPresent.includes(side) && !aggregatorIncludes[side]?.length) continue;
    const subIncludes = (aggregatorIncludes[side] || []).map((p) => toFactionSubInclude(side, p));
    const subRel = `${dataRel}/${side}/${side}.xml`;
    const topRel = `${dataRel}/${side}.xml`;
    factionFiles.push({
      rel: subRel,
      content: buildFactionAggregatorXml(side, subIncludes),
    });
    factionFiles.push({
      rel: topRel,
      content: buildTopFactionAggregatorXml(side),
    });
    written.push(subRel, topRel);
  }

  const commonPath = path.join(root, CANONICAL_DATA_REL, 'Common.xml');
  const cmdPath = plan.commandDataRel ? resolveProjectPath(root, plan.commandDataRel) : null;
  const cmdHasContent =
    cmdPath &&
    fs.existsSync(cmdPath) &&
    /<LogicCommand\b/i.test(readTextSafe(cmdPath, 50000));
  const modContent = buildInsurrectionModXml(
    data.rel,
    factionsPresent,
    {
      includeCommon: fs.existsSync(commonPath),
      includeCommandData: options.keepCommandData !== false && cmdHasContent,
    }
  );

  if (options.dryRun) {
    return {
      success: true,
      dryRun: true,
      data: {
        modXml: modRel,
        modContent,
        factionFiles,
        aggregatorIncludes,
        plan,
      },
    };
  }

  trackedWriteUtf8(root, modRel, modContent);
  written.push(modRel);

  for (const f of factionFiles) {
    trackedWriteUtf8(root, f.rel, f.content);
    written.push(f.rel);
  }

  return { success: true, data: { written, modRel, factionFiles: factionFiles.map((f) => f.rel) } };
}

function isProtectedModXml(rel) {
  return normalizeRel(rel).toLowerCase() === 'data/mod.xml';
}

function deleteProjectFile(projectRoot, rel, options = {}) {
  const full = resolveProjectPath(projectRoot, rel);
  if (!fs.existsSync(full)) return { success: false, error: `文件不存在: ${rel}` };
  if (isProtectedModXml(rel) && !options.allowProtected) {
    return { success: false, error: '禁止删除 data/Mod.xml（BAE 编译入口）' };
  }
  try {
    const { captureBeforeDelete } = require('./agent-rollback');
    captureBeforeDelete(projectRoot, rel);
  } catch (e) {
    console.warn('[insurrection-migrate] rollback capture:', e.message);
  }
  fs.unlinkSync(full);
  return { success: true, data: { deleted: normalizeRel(rel) } };
}

/** 迁移收尾：删除与 data/Mod.xml 重复的根目录 Mod.xml */
function deleteRootDuplicateModXml(projectRoot, dataRel) {
  const root = String(projectRoot || '').replace(/\\/g, '/');
  const rootMod = path.join(root, 'Mod.xml');
  const dataMod = path.join(root, dataRel, 'Mod.xml');
  if (!fs.existsSync(rootMod) || !fs.existsSync(dataMod)) {
    return { success: true, data: { skipped: true } };
  }
  return deleteProjectFile(root, 'Mod.xml');
}

function moveProjectFile(projectRoot, fromRel, toRel) {
  const from = resolveProjectPath(projectRoot, fromRel);
  const to = resolveProjectPath(projectRoot, toRel);
  if (!fs.existsSync(from)) return { success: false, error: `源文件不存在: ${fromRel}` };
  fs.mkdirSync(path.dirname(to), { recursive: true });
  if (fs.existsSync(to)) fs.unlinkSync(to);
  fs.renameSync(from, to);
  return { success: true, data: { from: normalizeRel(fromRel), to: normalizeRel(toRel) } };
}

function looksLikeInsurrectionMigrateIntent(message) {
  const m = String(message || '');
  return (
    /(迁移|转换|整理|标准化|升级).{0,20}(起义|insurrection|标准\s*mod|专业\s*mod)/i.test(m) ||
    /(起义|insurrection).{0,20}(结构|格式|标准|布局)/i.test(m) ||
    /按.{0,8}(起义|标准\s*mod|insurrection).{0,12}(整理|重组|迁移)/i.test(m) ||
    /(整理|重组|迁移|标准化).{0,12}(项目|代码|结构|xml)/i.test(m) ||
    /标准\s*mod.{0,12}(整理|结构)/i.test(m) ||
    /rebuildModXmlInsurrection|migrateToInsurrection/i.test(m)
  );
}

/**
 * 已分包项目：仅修正 data/ 大小写 + 二级阵营聚合 + mod.babproj（不重新转单位）
 */
async function refineInsurrectionLayout(projectRoot, options = {}) {
  const root = String(projectRoot || '').replace(/\\/g, '/');
  const onProgress = options.onProgress || (() => {});
  const log = [];
  const changedFiles = [];

  const caseFix = normalizeDataDirCase(root, onProgress);
  if (caseFix.log?.length) log.push(...caseFix.log);

  onProgress('📝 重建二级阵营聚合与 Mod.xml…');
  const rebuild = rebuildModXmlInsurrection(root, options);
  if (rebuild.data?.written) changedFiles.push(...rebuild.data.written);

  onProgress('🧹 清理遗留 Units/、根目录阵营目录、DEPRECATED 与 .bak…');
  const cleanup = applyLegacyCleanup(root, collectLegacyCleanupTargets(root), onProgress);
  changedFiles.push(...cleanup.changed);
  log.push(...cleanup.log);

  const bab = syncModBabprojDataPath(root);
  if (bab.updated) {
    changedFiles.push('mod.babproj');
    log.push(`mod.babproj → ${bab.source}`);
  }

  const assessment = assessInsurrectionCompliance(root);
  const report = formatMigrationReport({
    plan: buildMigrationPlan(root),
    assessment,
    changedFiles,
    compliant: assessment.compliant,
    log,
  });

  return {
    success: assessment.compliant,
    compliant: assessment.compliant,
    assessment,
    changedFiles,
    report,
    log,
  };
}

async function migrateToInsurrectionStandard(projectRoot, options = {}) {
  const root = String(projectRoot || '').replace(/\\/g, '/');
  const dryRun = !!options.dryRun;
  const onProgress = options.onProgress || (() => {});
  const changedFiles = [];
  const log = [];

  onProgress('📋 生成迁移计划…');
  const caseFix = normalizeDataDirCase(root, onProgress);
  if (caseFix.log?.length) log.push(...caseFix.log);

  const plan = buildMigrationPlan(root);
  log.push(`计划: ${plan.conversions.length} 个单位转包, ${plan.deletes.length} 个重复/遗留删除`);

  if (dryRun) {
    const assessment = assessInsurrectionCompliance(root);
    return {
      success: true,
      dryRun: true,
      plan,
      assessment,
      report: formatMigrationReport({ plan, assessment, changedFiles: [], compliant: false }),
    };
  }

  const data = resolveDataDir(root);
  let commandDataContent = '';
  const commandDataFull = plan.commandDataRel
    ? resolveProjectPath(root, plan.commandDataRel)
    : null;
  if (commandDataFull && fs.existsSync(commandDataFull)) {
    commandDataContent = readTextSafe(commandDataFull);
  }

  const conventions = analyzeProjectConventions(root);
  for (const conv of plan.conversions) {
    onProgress(`📦 转换单位 ${conv.unitId} → Insurrection 分包…`);
    const srcUnit = collectGameObjectUnits(root).find(
      (u) => u.unitId.toLowerCase() === conv.unitId.toLowerCase()
    );
    if (!srcUnit) continue;
    const pkg = buildUnitPackageFiles(srcUnit, data.rel, conventions, commandDataContent);
    if (!pkg) continue;
    for (const f of pkg.files) {
      trackedWriteUtf8(root, f.rel, f.content);
      changedFiles.push(f.rel);
    }
    if (commandDataContent) {
      commandDataContent = stripCommandDataBlocksForUnit(commandDataContent, conv.unitId);
    }
    for (const del of conv.deleteAfter || []) {
      try {
        deleteProjectFile(root, del);
        changedFiles.push(`(deleted) ${del}`);
      } catch {
        /* ignore */
      }
    }
  }

  if (commandDataFull && commandDataContent) {
    trackedWriteUtf8(root, plan.commandDataRel, commandDataContent);
    changedFiles.push(plan.commandDataRel);
  }

  onProgress('📝 重建 Mod.xml 与阵营聚合（二级 Allied/Allied.xml）…');
  const rebuild = rebuildModXmlInsurrection(root, { keepCommandData: true });
  if (rebuild.data?.written) changedFiles.push(...rebuild.data.written);

  const bab = syncModBabprojDataPath(root);
  if (bab.updated) {
    changedFiles.push('mod.babproj');
    log.push(`mod.babproj → ${bab.source}`);
    onProgress('📝 已同步 mod.babproj 为 data/mod.xml');
  }

  const cleanupTargets = plan.deletes?.length
    ? plan.deletes
    : collectLegacyCleanupTargets(root, CANONICAL_DATA_REL);
  const cleanup = applyLegacyCleanup(root, cleanupTargets, onProgress);
  changedFiles.push(...cleanup.changed);
  log.push(...cleanup.log);

  onProgress('🗑 清理根目录重复 Mod.xml…');
  const rootModDel = deleteRootDuplicateModXml(root, data.rel);
  if (rootModDel.success && rootModDel.data?.deleted) {
    changedFiles.push('(deleted) Mod.xml');
  } else if (!rootModDel.success && rootModDel.error) {
    log.push(`根目录 Mod.xml: ${rootModDel.error}`);
  }

  onProgress('🔍 重新扫描并验收…');
  const scanRes = await scanProject({ onProgress });
  const assessment = assessInsurrectionCompliance(root, scanRes?.data);

  const report = formatMigrationReport({
    plan,
    assessment,
    changedFiles,
    compliant: assessment.compliant,
    log,
  });

  return {
    success: assessment.compliant,
    compliant: assessment.compliant,
    layoutProfile: assessment.layoutProfile,
    plan,
    assessment,
    changedFiles: [...new Set(changedFiles)],
    report,
    log,
  };
}

function formatMigrationReport({ plan, assessment, changedFiles, compliant, log = [] }) {
  let s = '## 项目结构整理报告\n\n';
  s += `- 迁移前布局: \`${plan.layoutBefore}\`\n`;
  s += `- 转换单位包: ${plan.conversions.length}\n`;
  s += `- 删除重复/遗留: ${plan.deletes.length}\n`;
  s += `- 写入/变更文件: ${changedFiles.length}\n\n`;
  if (log?.length) {
    s += '### 操作日志\n\n';
    for (const line of log) s += `- ${line}\n`;
    s += '\n';
  }
  s += `### 验收结果\n\n${assessment.summary}\n\n`;
  if (assessment.failedChecks?.length) {
    s += '未通过项:\n';
    for (const c of assessment.failedChecks) {
      s += `- **${c.id}**: ${c.message}\n`;
    }
  }
  if (!compliant) {
    s +=
      '\n> ⚠️ **结构整理尚未完成**。请说明剩余项并建议再次运行 `migrateToInsurrectionStandard` 或手动处理。\n';
  } else {
    s += '\n> ✅ 已通过严格验收，可以说明项目已符合标准 MOD 的 Mod.xml 与分包结构。请用户自行编译验证。\n';
  }
  return s;
}

function sanitizeAgentReply(text, assessment) {
  if (assessment?.compliant) return text;
  let out = String(text || '');
  for (const phrase of FORBIDDEN_SUCCESS_PHRASES) {
    if (out.includes(phrase)) {
      out = out.replace(
        new RegExp(phrase, 'g'),
        '（迁移尚未通过验收，不能宣称已完成结构整理）'
      );
    }
  }
  return out;
}

module.exports = {
  CANONICAL_DATA_REL,
  FORBIDDEN_SUCCESS_PHRASES,
  assessInsurrectionCompliance,
  buildMigrationPlan,
  buildInsurrectionModXml,
  buildTopFactionAggregatorXml,
  buildFactionAggregatorXml,
  rebuildModXmlInsurrection,
  migrateToInsurrectionStandard,
  refineInsurrectionLayout,
  normalizeDataDirCase,
  syncModBabprojDataPath,
  deleteProjectFile,
  deleteRootDuplicateModXml,
  moveProjectFile,
  looksLikeInsurrectionMigrateIntent,
  sanitizeAgentReply,
  formatMigrationReport,
};
