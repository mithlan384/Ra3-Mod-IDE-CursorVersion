// main/special-power-repair.js —— SpecialPower Unknown asset 规则化诊断与修复

const fs = require('fs');
const path = require('path');

const EALA_NS = 'uri:ea.com:eala:asset';
const WRONG_NS = /xmlns\s*=\s*["']uri:ea\.com:ra3:asset["']/i;

const UNKNOWN_ASSET_RE =
  /Unknown asset\s+'([^:]+):([^']+)'\s+referenced from\s+'([^:]+):([^']+)'\s+in\s+'[^']*[/\\]([^'"]+\.xml)'/gi;

function normalizeRel(p) {
  return String(p || '').replace(/\\/g, '/');
}

function resolveDataDir(root) {
  const r = normalizeRel(root);
  if (fs.existsSync(path.join(r, 'data'))) return path.join(r, 'data');
  if (fs.existsSync(path.join(r, 'Data'))) return path.join(r, 'Data');
  return path.join(r, 'data');
}

/**
 * @param {string} errorText
 * @returns {Array<{assetType:string, assetId:string, refType:string, refId:string, fragmentPath:string}>}
 */
function parseUnknownAssetWarnings(errorText) {
  const out = [];
  const text = String(errorText || '');
  let m;
  const re = new RegExp(UNKNOWN_ASSET_RE.source, 'gi');
  while ((m = re.exec(text)) !== null) {
    out.push({
      assetType: m[1],
      assetId: m[2],
      refType: m[3],
      refId: m[4],
      fragmentPath: normalizeRel(m[5]).toLowerCase(),
    });
  }
  return out;
}

function isSpecialPowerWarning(entry) {
  return (
    entry.assetType === 'SpecialPowerTemplate' ||
    /^SpecialPower_/i.test(entry.assetId)
  );
}

/** 由 logiccommand.xml 片段路径推断单位子目录与包装 XML */
function findUnitPackageByFragment(projectRoot, fragmentPath) {
  const dataDir = resolveDataDir(projectRoot);
  if (!fs.existsSync(dataDir)) return null;

  const frag = normalizeRel(fragmentPath).toLowerCase();
  const parts = frag.split('/');
  const fileName = parts[parts.length - 1] || '';
  const folderSeg = parts.length >= 2 ? parts[parts.length - 2] : '';

  let best = null;

  function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory() && !ent.name.startsWith('.')) {
        walk(full);
        continue;
      }
      if (!/\.xml$/i.test(ent.name)) continue;
      const rel = normalizeRel(path.relative(projectRoot, full));
      const content = fs.readFileSync(full, 'utf-8');
      const folderLower = folderSeg.toLowerCase();
      const includesFrag =
        folderLower &&
        new RegExp(
          `source\\s*=\\s*["']${folderSeg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`,
          'i'
        ).test(content);
      const includesFile =
        fileName && new RegExp(`source\\s*=\\s*["'][^"']*${fileName.replace(/\./g, '\\.')}`, 'i').test(content);

      if (includesFrag || (ent.name.toLowerCase() === `${folderLower}.xml` && includesFile)) {
        const subDir = path.join(path.dirname(full), folderSeg);
        const subDirAlt = path.join(path.dirname(full), ent.name.replace(/\.xml$/i, ''));
        const unitDir = fs.existsSync(subDir)
          ? subDir
          : fs.existsSync(subDirAlt)
            ? subDirAlt
            : null;
        best = {
          wrapperRel: rel,
          wrapperFull: full,
          unitFolderName: folderSeg || ent.name.replace(/\.xml$/i, ''),
          unitDir,
          fragmentPath: frag,
        };
      }
    }
  }
  walk(dataDir);
  return best;
}

function wrapperIncludesFile(wrapperContent, includeFileName) {
  return new RegExp(
    `source\\s*=\\s*["'][^"']*${includeFileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
    'i'
  ).test(wrapperContent);
}

function addIncludeToWrapper(wrapperContent, unitFolderName, includeFile) {
  if (wrapperIncludesFile(wrapperContent, includeFile)) return wrapperContent;

  const line = `    <Include type="all" source="${unitFolderName}/${includeFile}" />`;
  if (/<Includes>/i.test(wrapperContent)) {
    return wrapperContent.replace(/<Includes>/i, `<Includes>\n${line}`);
  }
  return wrapperContent.replace(
    /<AssetDeclaration([^>]*)>/i,
    `<AssetDeclaration$1>\n  <Includes>\n${line}\n  </Includes>`
  );
}

function fixSpecialPowerTemplatesContent(content) {
  let out = content;
  if (!out.includes('<?xml')) {
    out = `<?xml version="1.0" encoding="utf-8"?>\n${out}`;
  }
  out = out.replace(WRONG_NS, `xmlns="${EALA_NS}"`);
  if (!/<AssetDeclaration/i.test(out)) {
    out = `<AssetDeclaration xmlns="${EALA_NS}">\n${out}\n</AssetDeclaration>`;
  } else if (!/xmlns=/i.test(out.slice(0, 200))) {
    out = out.replace(/<AssetDeclaration/i, `<AssetDeclaration xmlns="${EALA_NS}"`);
  }
  return out;
}

function defaultSpecialPowerTemplateXml(powerId) {
  return `<?xml version="1.0" encoding="utf-8"?>
<AssetDeclaration xmlns="${EALA_NS}">
  <SpecialPowerTemplate
    id="${powerId}"
    type="TOGGLE_POWER"
    flags="NEEDS_EMITTER_FX|ALLOWED_TO_BE_ON_STANDARD_OBJECTS"
    rechargeTime="0.0"
    effectDuration="0.0"
    friendliness="NEUTRAL"
    radius="0.0"
    needTarget="NO"
    targetType="NO_OBJECT"
    toggleAbility="true"
    toggleOnPulseTime="1.0"
    toggleOffPulseTime="1.0"
  />
</AssetDeclaration>
`;
}

function templateDefinesId(content, powerId) {
  return new RegExp(`<SpecialPowerTemplate\\b[^>]*\\bid="${powerId}"`, 'i').test(content);
}

/**
 * 扫描：LogicCommand 引用的 SpecialPower 是否在包装 XML 中 Include 了模板文件
 */
function scanSpecialPowerGaps(projectRoot) {
  const dataDir = resolveDataDir(projectRoot);
  const gaps = [];
  if (!fs.existsSync(dataDir)) return gaps;

  const wrappers = [];
  function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory() && !ent.name.startsWith('.')) walk(full);
      else if (/\.xml$/i.test(ent.name) && /<Includes>/i.test(fs.readFileSync(full, 'utf-8'))) {
        wrappers.push({
          rel: normalizeRel(path.relative(projectRoot, full)),
          full,
          content: fs.readFileSync(full, 'utf-8'),
        });
      }
    }
  }
  walk(dataDir);

  for (const w of wrappers) {
    const folderMatch = w.content.match(/source="([^"/]+)\/LogicCommand\.xml"/i);
    if (!folderMatch) continue;
    const unitFolder = folderMatch[1];
    const unitDir = path.join(path.dirname(w.full), unitFolder);
    if (!fs.existsSync(unitDir)) continue;

    const lcPath = path.join(unitDir, 'LogicCommand.xml');
    if (!fs.existsSync(lcPath)) continue;
    const lc = fs.readFileSync(lcPath, 'utf-8');
    const spRe = /<SpecialPower>\s*(SpecialPower_[^<\s]+)\s*<\/SpecialPower>/gi;
    let m;
    while ((m = spRe.exec(lc)) !== null) {
      const powerId = m[1];
      const spFile = path.join(unitDir, 'SpecialPowerTemplates.xml');
      const spRel = normalizeRel(path.relative(projectRoot, spFile));
      const wrapperHasInclude = wrapperIncludesFile(w.content, 'SpecialPowerTemplates.xml');
      let fileOk = false;
      let defines = false;
      if (fs.existsSync(spFile)) {
        fileOk = true;
        defines = templateDefinesId(fs.readFileSync(spFile, 'utf-8'), powerId);
      }
      if (!wrapperHasInclude || !fileOk || !defines) {
        gaps.push({
          powerId,
          unitFolder,
          wrapperRel: w.rel,
          wrapperFull: w.full,
          unitDir,
          spRel,
          wrapperHasInclude,
          fileOk,
          defines,
        });
      }
    }
  }
  return gaps;
}

/**
 * LogicCommandSet.xml 内误含 LogicCommand 节点
 */
function findPollutedCommandSetFiles(projectRoot) {
  const dataDir = resolveDataDir(projectRoot);
  const hits = [];
  if (!fs.existsSync(dataDir)) return hits;

  function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory() && !ent.name.startsWith('.')) walk(full);
      else if (/logiccommandset\.xml$/i.test(ent.name)) {
        const c = fs.readFileSync(full, 'utf-8');
        if (/<LogicCommand\b/i.test(c)) {
          hits.push({
            rel: normalizeRel(path.relative(projectRoot, full)),
            full,
          });
        }
      }
    }
  }
  walk(dataDir);
  return hits;
}

/**
 * @param {string} projectRoot
 * @param {string} [errorText]
 * @param {{ deferWrite?: boolean, onProgress?: (m:string)=>void }} [options]
 */
function repairSpecialPowerWarnings(projectRoot, errorText = '', options = {}) {
  const root = normalizeRel(projectRoot);
  const log = [];
  const fixes = [];
  const pendingWrites = [];
  const onProgress = options.onProgress || (() => {});

  const warnings = parseUnknownAssetWarnings(errorText).filter(isSpecialPowerWarning);
  const gaps = scanSpecialPowerGaps(root);

  const targets = new Map();

  for (const w of warnings) {
    const key = `${w.assetId}|${w.fragmentPath}`;
    if (!targets.has(key)) targets.set(key, { powerId: w.assetId, warning: w });
  }
  for (const g of gaps) {
    const key = `${g.powerId}|${g.unitFolder}`;
    if (!targets.has(key)) targets.set(key, { powerId: g.powerId, gap: g });
  }

  if (!targets.size) {
    return { log, fixes, pendingWrites, changed: false };
  }

  onProgress('🔧 正在修复 SpecialPower 引用（Include / xmlns / 模板文件）…');

  for (const { powerId, warning, gap } of targets.values()) {
    let pkg = gap
      ? {
          wrapperRel: gap.wrapperRel,
          wrapperFull: gap.wrapperFull,
          unitFolderName: gap.unitFolder,
          unitDir: gap.unitDir,
        }
      : null;

    if (!pkg && warning) {
      pkg = findUnitPackageByFragment(root, warning.fragmentPath);
    }
    if (!pkg?.unitDir || !pkg.wrapperFull) {
      log.push(`⚠️ 未定位单位包装：SpecialPower_${powerId}`);
      continue;
    }

    const unitFolderName = pkg.unitFolderName;
    const spPath = path.join(pkg.unitDir, 'SpecialPowerTemplates.xml');
    const spRel = normalizeRel(path.relative(root, spPath));

    let wrapperContent = fs.readFileSync(pkg.wrapperFull, 'utf-8');
    let spContent;

    if (fs.existsSync(spPath)) {
      spContent = fixSpecialPowerTemplatesContent(fs.readFileSync(spPath, 'utf-8'));
      if (!templateDefinesId(spContent, powerId)) {
        log.push(`⚠️ ${spRel} 存在但未定义 id="${powerId}"，请手动补全模板`);
      } else {
        pendingWrites.push({ relativePath: spRel, content: spContent });
        fixes.push({ action: 'fixSpecialPowerXmlns', rel: spRel });
        log.push(`已修正 ${spRel} 的 xmlns / 文件头`);
      }
    } else {
      spContent = defaultSpecialPowerTemplateXml(powerId);
      pendingWrites.push({ relativePath: spRel, content: spContent });
      fixes.push({ action: 'createSpecialPowerTemplates', rel: spRel });
      log.push(`已生成 ${spRel}`);
    }

    const newWrapper = addIncludeToWrapper(wrapperContent, unitFolderName, 'SpecialPowerTemplates.xml');
    if (newWrapper !== wrapperContent) {
      pendingWrites.push({ relativePath: pkg.wrapperRel, content: newWrapper });
      fixes.push({ action: 'addSpecialPowerInclude', rel: pkg.wrapperRel });
      log.push(`已在 ${pkg.wrapperRel} 添加 SpecialPowerTemplates.xml Include`);
    }
  }

  const polluted = findPollutedCommandSetFiles(root);
  for (const p of polluted) {
    log.push(
      `⚠️ ${p.rel} 内含 <LogicCommand>（应只在 LogicCommand.xml）；请手动拆分到 LogicCommandSet 仅保留 <LogicCommandSet>`
    );
    fixes.push({ action: 'notePollutedCommandSet', rel: p.rel });
  }

  if (!options.deferWrite && pendingWrites.length) {
    const { streamTextToFiles } = require('./stream-write');
    // sync write fallback
    for (const w of pendingWrites) {
      const full = path.join(root, w.relativePath);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      try {
        const { captureBeforeMutate } = require('./agent-rollback');
        captureBeforeMutate(root, w.relativePath);
      } catch (e) {
        console.warn('[special-power-repair] rollback capture:', e.message);
      }
      fs.writeFileSync(full, w.content, 'utf-8');
    }
    log.push(`已写入 ${pendingWrites.length} 个文件。`);
  }

  return {
    log,
    fixes,
    pendingWrites,
    changed: pendingWrites.length > 0,
  };
}

function hasSpecialPowerUnknownAsset(errorText) {
  return (
    parseUnknownAssetWarnings(errorText).some(isSpecialPowerWarning) ||
    /Unknown asset\s+'SpecialPowerTemplate:/i.test(errorText)
  );
}

module.exports = {
  parseUnknownAssetWarnings,
  scanSpecialPowerGaps,
  findPollutedCommandSetFiles,
  repairSpecialPowerWarnings,
  hasSpecialPowerUnknownAsset,
  addIncludeToWrapper,
  fixSpecialPowerTemplatesContent,
};
