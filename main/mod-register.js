// main/mod-register.js —— Mod.xml / 起义时刻阵营聚合链安全注册

const fs = require('fs');
const path = require('path');
const { getCurrentFolder } = require('./project-state');
const { insertBeforeRootClose } = require('./command-data-repair');

const CANONICAL_DATA_REL = 'data';

const CATEGORY_SUFFIX = {
  Infantry: 'Infantry',
  Vehicle: 'Vehicle',
  Aircraft: 'Aircraft',
  Structures: 'Structures',
};

function normalizeRel(rel) {
  return String(rel || '').replace(/\\/g, '/').replace(/^\/+/, '');
}

function toDataSource(rel) {
  const normalized = normalizeRel(rel);
  if (normalized.startsWith('DATA:')) return normalized;
  return `DATA:${normalized.replace(/^data\//i, '').replace(/^Data\//, '')}`;
}

function findModXml(root) {
  const projectRoot = root || getCurrentFolder();
  if (!projectRoot) return null;

  const candidates = [
    'data/Mod.xml',
    'data/mod.xml',
    'Data/Mod.xml',
    'Data/mod.xml',
    'Mod.xml',
  ];
  for (const rel of candidates) {
    const full = path.join(projectRoot, rel).replace(/\\/g, '/');
    if (fs.existsSync(full)) return { rel: rel.replace(/\\/g, '/'), full };
  }
  const found = searchFile(projectRoot, 'Mod.xml');
  if (found) {
    return { rel: path.relative(projectRoot, found).replace(/\\/g, '/'), full: found };
  }
  return null;
}

function searchFile(dir, name) {
  let items;
  try {
    items = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const item of items) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) {
      const hit = searchFile(full, name);
      if (hit) return hit;
    } else if (item.name.toLowerCase() === name.toLowerCase()) {
      return full.replace(/\\/g, '/');
    }
  }
  return null;
}

function inferCategoryFromPath(rel, kind) {
  const lower = normalizeRel(rel).toLowerCase();
  if (/\/vehicle\b|\/vehicles\b/i.test(lower) || kind === 'vehicle') return 'Vehicle';
  if (/\/aircraft\b/i.test(lower) || kind === 'aircraft') return 'Aircraft';
  if (/\/structure\b/i.test(lower)) return 'Structures';
  return 'Infantry';
}

function categoryAggregatorRel(side, category, dataRoot = CANONICAL_DATA_REL) {
  const suffix = CATEGORY_SUFFIX[category] || 'Infantry';
  return `${dataRoot}/${side}/${category}/${side}${suffix}.xml`;
}

function insertIncludeInIncludes(content, includeTag) {
  const tag = String(includeTag || '').trim();
  if (!tag) return { content, changed: false };
  if (content.includes(tag)) return { content, changed: false, already: true };

  const sourceMatch = tag.match(/source="([^"]+)"/i);
  if (sourceMatch && content.includes(sourceMatch[1])) {
    return { content, changed: false, already: true };
  }

  if (/<Includes>/i.test(content)) {
    const patched = content.replace(/<Includes>/i, `<Includes>\n    ${tag}`);
    return { content: patched, changed: true };
  }

  const patched = content.replace(
    /<AssetDeclaration\b([^>]*)>/i,
    (m) => `${m}\n  <Includes>\n    ${tag}\n  </Includes>`
  );
  return { content: patched, changed: true };
}

function writeFileSafe(fullPath, content, options = {}) {
  const root = options.projectRoot || getCurrentFolder();
  const rel = root
    ? path.relative(root, fullPath).replace(/\\/g, '/')
    : String(fullPath).replace(/\\/g, '/');
  let out = content;
  if (root && /(?:^|\/)mod\.xml$/i.test(rel)) {
    const { prepareModXmlWrite } = require('./mod-xml-guard');
    const prep = prepareModXmlWrite(rel, out, root, { strictReject: options.strictModGuard !== false });
    if (!prep.allowed) {
      throw new Error(prep.message || prep.errors.join('；'));
    }
    if (prep.sanitizeLog?.length) {
      console.warn('[mod-xml-guard]', prep.sanitizeLog.join('；'));
    }
    out = prep.content;
  }
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  try {
    const { captureBeforeMutate } = require('./agent-rollback');
    captureBeforeMutate(root, rel);
  } catch (e) {
    console.warn('[mod-register] rollback capture:', e.message);
  }
  fs.writeFileSync(fullPath, out, 'utf-8');
}

function ensureCategoryAggregatorFile(root, side, category, dataRoot) {
  const rel = categoryAggregatorRel(side, category, dataRoot);
  const full = path.join(root, rel).replace(/\\/g, '/');
  if (fs.existsSync(full)) return { rel, full, created: false };

  const empty = `<?xml version="1.0" encoding="utf-8"?>
<AssetDeclaration xmlns="uri:ea.com:eala:asset">
  <Includes>
    <!-- ${side} ${category} 单位在此引入 -->
  </Includes>
</AssetDeclaration>
`;
  writeFileSafe(full, empty);
  return { rel, full, created: true };
}

/**
 * 起义时刻：在 data/{Side}/{Category}/{Side}{Category}.xml 注册单位 wrapper
 */
function registerUnitInFactionAggregator(root, options = {}) {
  const log = [];
  const side = options.side || 'Soviet';
  const category = options.category || inferCategoryFromPath(options.wrapperRel, options.kind);
  const dataRoot = options.dataRoot || CANONICAL_DATA_REL;
  const wrapperRel = normalizeRel(options.wrapperRel || options.file);
  const unitId = options.unitId;

  if (!wrapperRel) {
    return { success: false, error: '缺少 wrapper 路径', log };
  }

  const wrapperName = path.basename(wrapperRel);
  const includeTag = `<Include type="all" source="${wrapperName}" />`;

  const agg = ensureCategoryAggregatorFile(root, side, category, dataRoot);
  let content = fs.readFileSync(agg.full, 'utf-8');
  const inserted = insertIncludeInIncludes(content, includeTag);
  content = inserted.content;

  if (inserted.changed) {
    writeFileSafe(agg.full, content);
    log.push(`已在 ${agg.rel} 加入 ${wrapperName}`);
  } else if (inserted.already) {
    log.push(`${agg.rel} 已包含 ${wrapperName}`);
  }

  if (agg.created) log.push(`已创建阵营分类聚合 ${agg.rel}`);

  return {
    success: true,
    changed: inserted.changed || agg.created,
    log,
    rel: agg.rel,
    wrapperRel,
    unitId,
  };
}

/**
 * 在 Mod.xml 的 <Includes> 内安全插入（禁止 append 到 </AssetDeclaration> 之后）
 */
function registerIncludeInModXml(mod, includeTag, options = {}) {
  const log = [];
  let content = fs.readFileSync(mod.full, 'utf-8');
  const tag = String(includeTag || '').trim();

  if (content.includes(tag)) {
    return { success: true, changed: false, already: true, log, modFile: mod.rel };
  }

  const sourceMatch = tag.match(/source="([^"]+)"/i);
  if (sourceMatch && content.includes(sourceMatch[1])) {
    return { success: true, changed: false, already: true, log, modFile: mod.rel };
  }

  let patched;
  if (/<Includes>/i.test(content)) {
    const ins = insertIncludeInIncludes(content, tag);
    patched = ins.content;
  } else {
    patched = insertBeforeRootClose(content, tag);
  }

  if (!options.deferWrite) {
    writeFileSafe(mod.full, patched, { projectRoot: options.projectRoot });
  }
  log.push(`已写入 ${mod.rel}: ${tag}`);
  return {
    success: true,
    changed: true,
    log,
    modFile: mod.rel,
    content: patched,
  };
}

/**
 * 创建单位后的统一注册（Insurrection 聚合链 + 扁平 Mod.xml）
 */
function registerCreatedUnit(projectRoot, options = {}) {
  const root = String(projectRoot || getCurrentFolder() || '').replace(/\\/g, '/');
  if (!root) return { success: false, error: '项目未打开' };

  const unitId = options.unitId;
  const file = normalizeRel(options.file);
  const wrapperRel = normalizeRel(options.wrapperRel || file);
  const layout = options.layout;
  const side = options.side || 'Soviet';
  const kind = options.kind || 'infantry';
  const conventions =
    options.conventions ||
    (() => {
      const { analyzeProjectConventions } = require('./project-conventions');
      return analyzeProjectConventions(root);
    })();

  const isInsurrection =
    layout === 'sdk-insurrection' ||
    conventions?.layoutProfile === 'sdk-insurrection' ||
    (/\/Infantry\/[^/]+\.xml$/i.test(wrapperRel) && !/\/Units\//i.test(wrapperRel));

  const log = [];
  const changedFiles = [];

  if (isInsurrection && wrapperRel) {
    const category = inferCategoryFromPath(wrapperRel, kind);
    const aggResult = registerUnitInFactionAggregator(root, {
      side,
      category,
      wrapperRel,
      unitId,
      kind,
      dataRoot: conventions?.dataRoot || CANONICAL_DATA_REL,
    });
    log.push(...(aggResult.log || []));
    if (aggResult.changed && aggResult.rel) changedFiles.push(aggResult.rel);

    const mod = findModXml(root);
    if (mod) {
      const factionTop = `${conventions?.dataRoot || CANONICAL_DATA_REL}/${side}.xml`;
      const factionTag = `<Include type="all" source="${side}.xml" />`;
      let modContent = fs.readFileSync(mod.full, 'utf-8');
      if (!modContent.includes(factionTop) && !modContent.includes(`${side}.xml`)) {
        const reg = registerIncludeInModXml(mod, factionTag, { projectRoot: root });
        log.push(...(reg.log || []));
        if (reg.changed) changedFiles.push(mod.rel);
      } else {
        log.push(`Mod.xml 已引用阵营聚合 ${side}.xml`);
      }
    }

    return {
      success: true,
      mode: 'insurrection-aggregator',
      log,
      changedFiles,
      wrapperRel,
      includePath: toDataSource(wrapperRel),
    };
  }

  const mod = findModXml(root);
  if (!mod) return { success: false, error: '未找到 Mod.xml', log };

  const targetRel = file || wrapperRel;
  const includePath = toDataSource(targetRel);
  const useAll =
    /\/Units\//i.test(targetRel) === false &&
    (conventions?.layoutProfile === 'sdk-insurrection' || /<Include\s+type="all"/i.test(
      fs.readFileSync(mod.full, 'utf-8').slice(0, 4000)
    ));
  const includeType = useAll ? 'all' : 'reference';
  const tag = `<Include type="${includeType}" source="${includePath}" />`;

  const reg = registerIncludeInModXml(mod, tag);
  log.push(...(reg.log || []));
  if (reg.changed) changedFiles.push(mod.rel);

  return {
    success: reg.success !== false,
    mode: 'mod-xml-direct',
    log,
    changedFiles,
    includePath,
    modFile: mod.rel,
  };
}

/** @deprecated 请用 registerCreatedUnit；保留兼容 */
function registerUnitInMod(unitRelativePath, options = {}) {
  const root = getCurrentFolder();
  return registerCreatedUnit(root, {
    file: unitRelativePath,
    wrapperRel: unitRelativePath,
    ...options,
  });
}

/**
 * 修复 Mod.xml 在 </AssetDeclaration> 之后的孤儿 Include/节点
 */
function repairModXmlStructure(projectRoot) {
  const { sanitizeModXmlOnDisk } = require('./mod-xml-guard');
  const result = sanitizeModXmlOnDisk(projectRoot);
  return {
    changed: result.changed,
    rel: result.rel,
    orphansMoved: result.log?.filter((l) => /孤儿|删除|移除/.test(l)).length || 0,
    log: result.log || [],
  };
}

module.exports = {
  findModXml,
  registerUnitInMod,
  registerCreatedUnit,
  registerUnitInFactionAggregator,
  registerIncludeInModXml,
  repairModXmlStructure,
  categoryAggregatorRel,
  toDataSource,
  insertIncludeInIncludes,
};
