// main/project-conventions.js —— 分析当前 MOD 项目结构/引用规范（与 Insurrection 标准对照）

const fs = require('fs');
const path = require('path');
const { findModXml } = require('./mod-register');

const STANDARD_REFERENCE_MOD = 'Insurrection';

function readTextSafe(filePath, max = 120000) {
  try {
    const buf = fs.readFileSync(filePath);
    const slice = buf.length > max ? buf.subarray(0, max) : buf;
    return slice.toString('utf-8');
  } catch {
    return '';
  }
}

function resolveDataDir(root) {
  const lower = path.join(root, 'data');
  const upper = path.join(root, 'Data');
  if (fs.existsSync(lower)) return { rel: 'data', full: lower };
  if (fs.existsSync(upper)) return { rel: 'data', full: upper, legacyPath: 'Data' };
  return { rel: 'data', full: lower };
}

function parseModIncludeMeta(modPath) {
  const content = readTextSafe(modPath);
  const includes = [];
  const re = /<Include\b([^>]*)\bsource="([^"]+)"([^>]*)\/?>/gi;
  let m;
  while ((m = re.exec(content)) !== null) {
    const attrs = (m[1] || '') + (m[3] || '');
    const typeM = attrs.match(/\btype="([^"]+)"/i);
    includes.push({
      type: (typeM ? typeM[1] : 'reference').toLowerCase(),
      source: m[2],
    });
  }
  return includes;
}

function walkXmlUnder(dir, relBase, out, depth = 0) {
  if (depth > 8) return;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    if (ent.name.startsWith('.')) continue;
    const full = path.join(dir, ent.name);
    const rel = relBase ? `${relBase}/${ent.name}` : ent.name;
    if (ent.isDirectory()) walkXmlUnder(full, rel, out, depth + 1);
    else if (/\.xml$/i.test(ent.name)) out.push({ rel, full, name: ent.name });
  }
}

/**
 * 分析项目规范
 * @param {string} projectRoot
 * @param {object} [scanData] - scanProject 的 data，可选
 */
function analyzeProjectConventions(projectRoot, scanData = null) {
  const root = projectRoot.replace(/\\/g, '/');
  const data = resolveDataDir(root);
  const mod = findModXml(root);
  const modIncludes = mod ? parseModIncludeMeta(mod.full) : [];

  const xmlUnderData = [];
  if (fs.existsSync(data.full)) walkXmlUnder(data.full, data.rel, xmlUnderData);

  let gameObjectInSubfolder = 0;
  let unitWrapperFiles = 0;
  let flatUnitXml = 0;
  const examples = { unitWrapper: null, gameObject: null, commandFile: null, modXml: mod?.rel || null };

  for (const f of xmlUnderData) {
    const lower = f.rel.toLowerCase();
    if (/\/gameobject\.xml$/i.test(lower)) {
      gameObjectInSubfolder++;
      if (!examples.gameObject) examples.gameObject = f.rel;
    }
    if (/\/units\/[^/]+\.xml$/i.test(lower) && !/\/[^/]+\/[^/]+\.xml$/.test(lower.replace(/\\/g, '/'))) {
      const content = readTextSafe(f.full, 8000);
      if (/<Include\s+type="all"\s+source="[^"]+\/GameObject\.xml"/i.test(content)) {
        unitWrapperFiles++;
        if (!examples.unitWrapper) examples.unitWrapper = f.rel;
      } else if (/<GameObject\b/i.test(content)) {
        flatUnitXml++;
      }
    }
  }

  const hasCommandData = xmlUnderData.some((f) => /commanddata\.xml$/i.test(f.name));
  const hasCommonLogicCommandSet = xmlUnderData.some((f) =>
    /common\/logiccommandset\.xml$/i.test(f.rel.replace(/\\/g, '/'))
  );
  const factionAggregators = ['Allied.xml', 'Soviet.xml', 'Japan.xml', 'Other.xml'].filter((name) =>
    xmlUnderData.some((f) => f.name.toLowerCase() === name.toLowerCase())
  );

  const refVanilla = modIncludes.filter((i) => i.type === 'reference' && /static|global|audio/i.test(i.source));
  const allAggregators = modIncludes.filter((i) => i.type === 'all');
  const refOwnUnits = modIncludes.filter(
    (i) => i.type === 'reference' && /units\/|infantry\/|vehicle\//i.test(i.source)
  );

  let layoutProfile = 'minimal-flat';
  if (gameObjectInSubfolder >= 2 || (factionAggregators.length >= 2 && unitWrapperFiles >= 1)) {
    layoutProfile = 'sdk-insurrection';
  } else if (hasCommandData && !gameObjectInSubfolder) {
    layoutProfile = 'commanddata-bundle';
  } else if (flatUnitXml >= 1 && !hasCommandData) {
    layoutProfile = 'minimal-flat';
  }

  let commandProfile = 'distributed-common';
  if (hasCommandData) commandProfile = 'commanddata-central';
  else if (gameObjectInSubfolder >= 2) commandProfile = 'per-unit-colocated';
  else if (hasCommonLogicCommandSet) commandProfile = 'common-patch';

  const sampleGo = xmlUnderData.find((f) => {
    const c = readTextSafe(f.full, 16000);
    return /<GameObject\b/i.test(c);
  });
  let baseIncludePattern = 'DATA:SageXml/BaseObjects/BaseInfantry.xml';
  let inheritFromPattern = 'BaseInfantry';
  if (sampleGo) {
    const c = readTextSafe(sampleGo.full, 32000);
    const inc = c.match(/<Include[^>]*source="([^"]+Base(?:Infantry|Vehicle|Aircraft)[^"]*)"/i);
    if (inc) baseIncludePattern = inc[1];
    const inh = c.match(/<GameObject[^>]*inheritFrom="([^"]+)"/i);
    if (inh) inheritFromPattern = inh[1];
    if (/SovietAnti|AlliedAnti|JapanAnti/i.test(inheritFromPattern)) {
      inheritFromPattern = 'BaseInfantry';
      baseIncludePattern = 'DATA:SageXml/BaseObjects/BaseInfantry.xml';
    }
  }

  const rulesForAI = buildRulesForAI({
    layoutProfile,
    commandProfile,
    dataRoot: data.rel,
    modXmlPath: mod?.rel,
    factionAggregators,
    hasCommandData,
    hasCommonLogicCommandSet,
    examples,
    baseIncludePattern,
    inheritFromPattern,
    refOwnUnits: refOwnUnits.length,
  });

  return {
    standardReferenceMod: STANDARD_REFERENCE_MOD,
    layoutProfile,
    commandProfile,
    dataRoot: data.rel,
    modXmlPath: mod?.rel || `${data.rel}/Mod.xml`,
    modIncludes: modIncludes.slice(0, 30),
    factionAggregators,
    hasCommandData,
    hasCommonLogicCommandSet,
    stats: {
      xmlUnderData: xmlUnderData.length,
      gameObjectInSubfolder,
      unitWrapperFiles,
      flatUnitXml,
      refVanillaCount: refVanilla.length,
      allIncludeCount: allAggregators.length,
    },
    examples,
    xmlWriting: {
      requireIncludesWrapper: true,
      baseIncludePattern,
      inheritFromPattern,
      sideAllies: 'Allies',
      weaponUseSlotHardpoint: layoutProfile === 'sdk-insurrection',
    },
    rulesForAI,
    compactForLLM: rulesForAI.join('\n'),
  };
}

function buildRulesForAI(ctx) {
  const lines = [];
  lines.push(`【本项目 XML 规范 — 写入前必须遵守】`);
  lines.push(`布局类型：${ctx.layoutProfile}；命令组织：${ctx.commandProfile}`);
  lines.push(`数据根目录：${ctx.dataRoot}/；Mod.xml：${ctx.modXmlPath || '(未找到)'}`);

  if (ctx.modIncludes?.length) {
    const types = [...new Set(ctx.modIncludes.map((i) => i.type))].join(', ');
    lines.push(`Mod.xml Include 类型：${types}`);
  }

  if (ctx.layoutProfile === 'sdk-insurrection') {
    lines.push(
      '- 数据目录：小写 data/；阵营二级聚合 data/Allied.xml → Allied/Allied.xml，单位路径相对 data/Allied/ 如 Infantry/单位.xml'
    );
    lines.push(
      '- 新单位：阵营/类型目录 + 显示名子文件夹；wrapper XML 用 type="all" 引用 GameObject/LogicCommand/LogicCommandSet 等'
    );
    if (ctx.examples.unitWrapper) lines.push(`- 包装清单示例：${ctx.examples.unitWrapper}`);
    if (ctx.examples.gameObject) lines.push(`- GameObject 示例：${ctx.examples.gameObject}`);
  } else if (ctx.layoutProfile === 'commanddata-bundle') {
    lines.push(`- 新单位：单文件放在 ${ctx.dataRoot} 下阵营/Units/；LogicCommand 写入 CommandData.xml`);
    lines.push('- Mod.xml：reference 原版三件套 + type="all" CommandData.xml + reference 单位文件');
  } else {
    lines.push(`- 新单位：单 XML 文件（如 ${ctx.dataRoot}/Soviet/Units/UnitId.xml）`);
    lines.push('- Include 必须在 <Includes> 内；优先 instance 继承 SDK 官方单位或 BaseObjects');
  }

  if (ctx.commandProfile === 'commanddata-central') {
    lines.push('- 命令：追加到 data/CommandData.xml，含 LogicCommandSet');
  } else if (ctx.commandProfile === 'per-unit-colocated') {
    lines.push('- 命令：单位目录内 LogicCommand.xml + LogicCommandSet.xml');
    if (ctx.hasCommonLogicCommandSet) {
      lines.push('- 兵营建造：在 data/Common/LogicCommandSet.xml 补丁对应 BarracksCommandSet');
    }
  } else if (ctx.hasCommonLogicCommandSet) {
    lines.push('- 命令：Common/LogicCommandSet.xml 补丁 + 单位侧 LogicCommand');
  }

  lines.push(`- GameObject 基类 Include：${ctx.baseIncludePattern}`);
  lines.push(`- inheritFrom 习惯：${ctx.inheritFromPattern}；盟军 Side 写 Allies`);
  lines.push('- 禁止 Mod.xml 用 reference 指向 MOD 自建单位（应用 type="all" 聚合）');
  if (ctx.refOwnUnits > 0) {
    lines.push(`- 注意：当前 Mod.xml 有 ${ctx.refOwnUnits} 条 reference 指向单位，新建时跟随现有习惯或建议改为 all`);
  }
  lines.push('- 标准参考（知识库）：标准 MOD 格式（Insurrection 范例）；若与本项目冲突，以本项目扫描为准');

  return lines;
}

function formatConventionsReport(conventions) {
  let text = `### 项目 XML 规范（自动识别）\n\n`;
  text += `- **布局**：\`${conventions.layoutProfile}\`\n`;
  text += `- **命令**：\`${conventions.commandProfile}\`\n`;
  text += `- **数据目录**：\`${conventions.dataRoot}/\`\n`;
  if (conventions.factionAggregators?.length) {
    text += `- **阵营聚合**：${conventions.factionAggregators.join(', ')}\n`;
  }
  text += `\n`;
  for (const line of conventions.rulesForAI) {
    text += `${line}\n`;
  }
  text += `\n> 专业 MOD 标准格式见知识库 **standard-mod-format-reference**。\n`;
  return text;
}

module.exports = {
  STANDARD_REFERENCE_MOD,
  analyzeProjectConventions,
  formatConventionsReport,
};
