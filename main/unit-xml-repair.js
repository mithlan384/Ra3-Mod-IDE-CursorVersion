// main/unit-xml-repair.js —— 修复单位 XML 结构（BAE Critical/Error）

const fs = require('fs');
const path = require('path');
const { getDataDir } = require('./mod-xml-repair');
const {
  findLogicCommandFile,
  buildLogicCommandSnippet,
  buildCommandSetSnippet,
} = require('./logic-command-register');

const SDK_UNIT_TEMPLATES = {
  infantry: {
    Allied: 'AlliedAntiInfantryInfantry',
    Soviet: 'SovietAntiInfantryInfantry',
    Japan: 'JapanAntiInfantryInfantry',
  },
  vehicle: {
    Allied: 'AlliedAntiVehicleVehicleTech1',
    Soviet: 'SovietAntiVehicleVehicleTech1',
    Japan: 'JapanAntiVehicleVehicleTech1',
  },
  aircraft: {
    Allied: 'AlliedAntiAirAircraft',
    Soviet: 'SovietAntiAirAircraft',
    Japan: 'JapanAntiAirVehicle',
  },
};

function parseBaeErrors(errorText) {
  const lines = String(errorText || '').split(/\r?\n/);
  const errors = [];
  for (const line of lines) {
    const critical = line.match(/Critical:\s*(.+)/i);
    const err = line.match(/\bError:\s*(.+)/i);
    const warn = line.match(/Warning:\s*(.+)/i);
    if (critical) errors.push({ level: 'critical', message: critical[1].trim(), raw: line });
    else if (err) errors.push({ level: 'error', message: err[1].trim(), raw: line });
    else if (warn) errors.push({ level: 'warning', message: warn[1].trim(), raw: line });
  }
  return errors;
}

function extractUnitIdsFromErrors(errorText) {
  const ids = new Set();
  const re = /([\w/\\.-]+\.xml)[^]*?(?:Critical|Error):/gi;
  let m;
  while ((m = re.exec(errorText))) {
    const base = path.basename(m[1], '.xml');
    if (base && !/^mod$/i.test(base) && !/^commanddata$/i.test(base)) {
      ids.add(base.replace(/[^a-z0-9_]/gi, ''));
    }
  }
  for (const m2 of errorText.matchAll(/Compiling GameObject:(\w+)/gi)) {
    ids.add(m2[1]);
  }
  return Array.from(ids);
}

function folderSideFromPath(relPath) {
  const m = relPath.match(/data\/(Allied|Soviet|Japan)\//i);
  return m ? m[1] : 'Soviet';
}

function pickSdkTemplate(unitId, relPath, content, kindOverride) {
  const sideFolder = folderSideFromPath(relPath);
  let kind = kindOverride || 'infantry';
  const text = typeof content === 'string' ? unitId + content : unitId;
  if (!kindOverride) {
    if (/Vehicle|Tank|Hammer/i.test(text)) kind = 'vehicle';
    if (/Aircraft|Air|Plane|Tengu/i.test(text)) kind = 'aircraft';
  }
  const sideKey = sideFolder === 'Allied' ? 'Allied' : sideFolder === 'Japan' ? 'Japan' : 'Soviet';
  return SDK_UNIT_TEMPLATES[kind][sideKey] || SDK_UNIT_TEMPLATES.infantry.Soviet;
}

function unitXmlNeedsRepair(content) {
  if (!content || !/<GameObject\b/i.test(content)) return false;
  const bareInclude =
    /<AssetDeclaration[^>]*>[\s\S]*?<Include\b/i.test(content) && !/<Includes>/i.test(content);
  const badWeapon = /<WeaponSlot\b/i.test(content);
  const bareBase =
    /inheritFrom="BaseInfantry"/i.test(content) || /inheritFrom="BaseVehicle"/i.test(content);
  return bareInclude || badWeapon || (bareBase && !/type="instance"\s+source="DATA:[^"]+\/Units\//i.test(content));
}

function resolveGameObjectSide(side, sideFolder) {
  if (/^Allies?$/i.test(side)) return 'Allies';
  if (/^Japan|Imperial$/i.test(side)) return 'Japan';
  if (/^Soviet$/i.test(side)) return 'Soviet';
  if (sideFolder === 'Allied') return 'Allies';
  if (sideFolder === 'Japan') return 'Japan';
  return 'Soviet';
}

function buildTemplateInheritUnitXml({ unitId, templateUnit, side, sideFolder, buildCost = 200, maxHealth = 150 }) {
  const folder = sideFolder || 'Soviet';
  const resolvedSide = resolveGameObjectSide(side, folder);

  return `<?xml version="1.0" encoding="utf-8"?>
<AssetDeclaration xmlns="uri:ea.com:eala:asset" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xai="uri:ea.com:eala:asset:instance">
  <Includes>
    <Include type="instance" source="DATA:${folder}/Units/${templateUnit}.xml" />
  </Includes>

  <GameObject
    id="${unitId}"
    inheritFrom="${templateUnit}"
    Side="${resolvedSide}"
    EditorName="${unitId}"
    BuildTime="5"
    CommandSet="${unitId}CommandSet"
    EditorSorting="UNIT"
    xai:joinAction="Replace">

    <ObjectResourceInfo>
      <BuildCost Account="=$ACCOUNT_ORE" Amount="${buildCost}"/>
    </ObjectResourceInfo>

    <Body>
      <ActiveBody id="ModuleTag_Body" MaxHealth="${maxHealth}"/>
    </Body>
  </GameObject>
</AssetDeclaration>
`;
}

function parseUnitMeta(content) {
  const idM = content.match(/<GameObject[^>]*\bid="([^"]+)"/i);
  const sideM = content.match(/\bSide="([^"]+)"/i);
  const costM = content.match(/BuildCost[^>]*Amount="(\d+)"/i);
  const hpM = content.match(/MaxHealth="(\d+)"/i);
  return {
    unitId: idM ? idM[1] : null,
    side: sideM ? sideM[1] : 'Soviet',
    buildCost: costM ? parseInt(costM[1], 10) : 200,
    maxHealth: hpM ? parseInt(hpM[1], 10) : 150,
  };
}

function listProjectUnitXmlFiles(projectRoot) {
  const dataDir = getDataDir(projectRoot);
  if (!fs.existsSync(dataDir)) return [];
  const files = [];
  function walk(dir, relBase) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = relBase ? `${relBase}/${ent.name}` : ent.name;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full, rel);
      else if (/\.xml$/i.test(ent.name) && !/^mod\.xml$/i.test(ent.name) && !/commanddata/i.test(ent.name)) {
        files.push({ rel: rel.replace(/\\/g, '/'), full });
      }
    }
  }
  walk(dataDir, '');
  return files;
}

function repairUnitXmlFile(fullPath, relPath, options = {}) {
  const content = fs.readFileSync(fullPath, 'utf-8');
  if (!unitXmlNeedsRepair(content) && !options.force) {
    return { changed: false, rel: relPath };
  }
  const meta = parseUnitMeta(content);
  if (!meta.unitId) return { changed: false, rel: relPath, error: '无法解析单位 id' };

  const sideFolder = folderSideFromPath(relPath);
  const templateUnit = pickSdkTemplate(meta.unitId, relPath, content);
  const newContent = buildTemplateInheritUnitXml({
    unitId: meta.unitId,
    templateUnit,
    side: meta.side,
    sideFolder,
    buildCost: meta.buildCost,
    maxHealth: meta.maxHealth,
  });
  if (!options.deferWrite) {
    fs.writeFileSync(fullPath, newContent, 'utf-8');
  }
  return {
    changed: true,
    rel: relPath,
    content: newContent,
    unitId: meta.unitId,
    templateUnit,
  };
}

function repairCommandDataForUnits(projectRoot, unitIds, onProgress, options = {}) {
  const { registerUnitsInCommandData } = require('./command-data-repair');
  return registerUnitsInCommandData(projectRoot, unitIds, onProgress, options);
}

/**
 * 根据 BAE 报错与项目扫描修复单位 XML + CommandData
 */
function repairProjectUnits(projectRoot, errorText = '', onProgress, options = {}) {
  const log = [];
  const fixes = [];
  const pendingWrites = [];
  const deferWrite = options.deferWrite === true;
  const baeErrors = parseBaeErrors(errorText);
  const errText = baeErrors.map((e) => e.message).join('\n');
  const forceRepair =
    /has no id attribute|unexpected WeaponSlot|Bad XML|not found.*referenced from/i.test(errText) ||
    /未生成 mod\.manifest|mod\.manifest/i.test(errorText);

  const unitFiles = listProjectUnitXmlFiles(projectRoot);
  const touchedUnitIds = new Set();

  for (const f of unitFiles) {
    let content = '';
    try {
      content = fs.readFileSync(f.full, 'utf-8');
    } catch {
      continue;
    }
    if (!unitXmlNeedsRepair(content) && !forceRepair) continue;
    if (!/<GameObject\b/i.test(content)) continue;

    onProgress?.(`🔧 正在修复单位 XML：${f.rel}…`);
    const result = repairUnitXmlFile(f.full, f.rel, {
      force: forceRepair,
      preferStandardTemplate: options.preferStandardTemplate !== false,
      deferWrite,
    });
    if (result.changed) {
      fixes.push({ action: 'repairUnitXml', result });
      if (result.content) {
        pendingWrites.push({ relativePath: result.rel, content: result.content });
      }
      log.push(`已重写 ${f.rel}（继承 SDK 模板 ${result.templateUnit}）`);
      touchedUnitIds.add(result.unitId);
    }
  }

  for (const uid of extractUnitIdsFromErrors(errorText)) {
    if (/^[A-Z]/i.test(uid)) touchedUnitIds.add(uid);
  }

  const cmdResult = repairCommandDataForUnits(
    projectRoot,
    Array.from(touchedUnitIds),
    onProgress,
    { deferWrite }
  );
  log.push(...cmdResult.log);
  fixes.push(...cmdResult.fixes);
  if (cmdResult.pendingWrites?.length) {
    pendingWrites.push(...cmdResult.pendingWrites);
  } else if (cmdResult.content && cmdResult.rel && deferWrite) {
    pendingWrites.push({ relativePath: cmdResult.rel, content: cmdResult.content });
  }

  return {
    fixes,
    log,
    changed: fixes.length > 0,
    unitIds: Array.from(touchedUnitIds),
    pendingWrites,
  };
}

module.exports = {
  parseBaeErrors,
  unitXmlNeedsRepair,
  repairProjectUnits,
  repairUnitXmlFile,
  buildTemplateInheritUnitXml,
  pickSdkTemplate,
};
