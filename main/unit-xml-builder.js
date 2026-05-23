// main/unit-xml-builder.js —— 每个单位独立 XML 文件（红警3：一单位一文件）

const fs = require('fs');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');
const { getCurrentFolder } = require('./project-state');
const { buildTemplateInheritUnitXml, pickSdkTemplate } = require('./unit-xml-repair');
const { getConventionsForWrite, shouldUseInsurrectionPackage } = require('./xml-format-mode');
const {
  buildLogicCommandSnippet,
  buildCommandSetSnippet,
} = require('./logic-command-register');
const {
  parseCreateUnitSpec,
  applySpecToGameObjectXml,
  buildGameDependencyXml,
  buildLocomotorSetXml,
} = require('./create-unit-spec');

const SIDE_FOLDERS = {
  Allies: 'Allied',
  Allied: 'Allied',
  Soviet: 'Soviet',
  Japan: 'Japan',
  Imperial: 'Japan',
};

function toGameObjectSide(folderSide) {
  if (folderSide === 'Allied' || folderSide === 'Allies') return 'Allies';
  if (folderSide === 'Japan' || folderSide === 'Imperial') return 'Japan';
  return 'Soviet';
}

const { inferUnitKind } = require('./unit-kind');

function resolvePath(filePath, root) {
  if (!filePath) return '';
  const normalized = filePath.replace(/\\/g, '/');
  if (path.isAbsolute(normalized)) return normalized;
  if (!root) return normalized;
  return path.join(root, normalized).replace(/\\/g, '/');
}

function searchFilesContent(pattern, root) {
  if (!root) return [];
  const { walkScopedFiles } = require('./xml-search-scope');
  const results = [];
  const lowerPattern = pattern.toLowerCase();
  walkScopedFiles(
    root,
    (fullPath) => {
      try {
        if (fs.readFileSync(fullPath, 'utf-8').toLowerCase().includes(lowerPattern)) {
          results.push(fullPath);
        }
      } catch (e) {}
    },
    { extensions: ['.xml'] }
  );
  return results;
}

function unitExists(unitId, root) {
  return searchFilesContent(`id="${unitId}"`, root).some((f) => {
    try {
      const c = fs.readFileSync(f, 'utf-8');
      return new RegExp(`\\bid="${unitId}"`, 'i').test(c);
    } catch (e) {
      return false;
    }
  });
}

/** 检测项目内现有单位目录布局 */
function detectUnitLayout(root) {
  const layouts = [];
  const check = (rel) => {
    const full = path.join(root, rel).replace(/\\/g, '/');
    if (fs.existsSync(full)) layouts.push(rel);
  };
  for (const side of ['Allied', 'Soviet', 'Japan']) {
    check(`data/${side}/Units`);
    check(`Data/${side}/Units`);
  }
  check('data/XML/Units');
  check('Data/XML/Units');
  return layouts;
}

function inferSide({ displayName, templateSide, templateUnit }) {
  if (templateSide) {
    if (templateSide === 'Allies') return 'Allied';
    return templateSide;
  }
  const d = displayName || '';
  if (/动员|征召|苏军|苏联|Soviet|僵尸|铁锤/.test(d)) return 'Soviet';
  if (/帝国|日本|Japan|Imperial|天狗|海啸|武士/.test(d)) return 'Japan';
  if (/盟军|Allied|Allies|维和|守护者|MyTank/i.test(d)) return 'Allied';
  if (templateUnit && /Soviet|Japan|Allied/i.test(templateUnit)) {
    if (/Soviet/i.test(templateUnit)) return 'Soviet';
    if (/Japan|Imperial/i.test(templateUnit)) return 'Japan';
    return 'Allied';
  }
  return 'Soviet';
}

/**
 * 新单位路径：优先沿用项目已有目录结构；否则 data/{Side}/Units/{unitId}.xml
 */
function resolveNewUnitPath(unitId, side, root) {
  const layouts = detectUnitLayout(root);
  const folder = SIDE_FOLDERS[side] || 'Soviet';

  for (const layout of layouts) {
    if (layout.toLowerCase().includes(folder.toLowerCase())) {
      return `${layout}/${unitId}.xml`.replace(/\\/g, '/');
    }
  }
  if (layouts.length > 0 && layouts[0].includes('XML/Units')) {
    return `${layouts[0]}/${unitId}.xml`.replace(/\\/g, '/');
  }
  return `data/${folder}/Units/${unitId}.xml`;
}

function readTemplateFile(templateUnit, root) {
  try {
    const { loadVanillaUnitXml, getSageXmlRoot, getSdkRoot } = require('./vanilla-unit-loader');
    const vanilla = loadVanillaUnitXml(templateUnit);
    if (vanilla?.content) {
      return {
        content: vanilla.content,
        file: vanilla.dataInclude,
        source: 'sagexml',
        sagePath: vanilla.rel,
        sageRoot: getSageXmlRoot(),
        sdkRoot: getSdkRoot(),
      };
    }
    const sageRoot = getSageXmlRoot();
    const sdkRoot = getSdkRoot();
    if (!sdkRoot) {
      console.warn('[unit-xml-builder] 未配置 SDK 路径，无法读取 SageXml 模板');
    } else if (!sageRoot) {
      console.warn('[unit-xml-builder] SDK 下未找到 SageXml:', sdkRoot);
    }
  } catch (e) {
    console.warn('[unit-xml-builder] sage template:', e.message);
  }

  if (root) {
    const files = searchFilesContent(`id="${templateUnit}"`, root);
    for (const f of files) {
      const content = fs.readFileSync(f, 'utf-8');
      if (new RegExp(`\\bid="${templateUnit}"`, 'i').test(content)) {
        return {
          content,
          file: path.relative(root, f).replace(/\\/g, '/'),
          source: 'project',
        };
      }
    }
  }
  return null;
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 仅替换单位身份相关字段，避免误改武器 Template / Locomotor 等引用 */
function applyUnitIdToClonedBlock(block, templateUnit, unitId) {
  let out = String(block || '');
  const tpl = escapeRegExp(templateUnit);
  const id = unitId;

  out = out.replace(new RegExp(`\\bid="${tpl}"`, 'gi'), `id="${id}"`);
  out = out.replace(
    new RegExp(`CommandSet="${tpl}CommandSet"`, 'gi'),
    `CommandSet="${id}CommandSet"`
  );
  out = out.replace(new RegExp(`EditorName="${tpl}"`, 'gi'), `EditorName="${id}"`);

  const cmdConstruct = `Command_Construct${templateUnit}`;
  if (out.includes(cmdConstruct)) {
    out = out.replace(
      new RegExp(escapeRegExp(cmdConstruct), 'g'),
      `Command_Construct${id}`
    );
  }

  return out;
}

function pathHasChinese(rel) {
  return /[\u4e00-\u9fff\u3400-\u4dbf]/.test(String(rel || ''));
}

function validateUnitFilePaths(paths, unitId) {
  const list = Array.isArray(paths) ? paths : [paths];
  for (const rel of list) {
    if (!rel) continue;
    if (pathHasChinese(rel)) {
      return {
        ok: false,
        error: `文件路径不能包含中文：${rel}。请使用英文单位 ID（当前：${unitId}）作为目录/文件名。`,
      };
    }
  }
  return { ok: true };
}

/** 从模板 XML 提取单个 GameObject/Unit 并替换为新 ID */
function cloneUnitFromTemplate(templateContent, templateUnit, unitId, displayName) {
  const tag = templateContent.match(new RegExp(`<(GameObject|Unit)\\b[^>]*\\bid="${templateUnit}"[^>]*>`, 'i'));
  if (!tag) return null;

  const openTag = tag[0];
  const tagName = tag[1];
  const start = templateContent.indexOf(openTag);
  if (start < 0) return null;

  // 匹配闭合标签（简单深度计数）
  let depth = 0;
  let pos = start;
  const openRe = new RegExp(`<${tagName}\\b`, 'gi');
  const closeRe = new RegExp(`</${tagName}>`, 'gi');
  let end = -1;
  while (pos < templateContent.length) {
    openRe.lastIndex = pos;
    closeRe.lastIndex = pos;
    const o = openRe.exec(templateContent);
    const c = closeRe.exec(templateContent);
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

  let block = templateContent.slice(start, end);
  block = applyUnitIdToClonedBlock(block, templateUnit, unitId);

  const sideMatch = block.match(/\bSide="([^"]+)"/i);
  const templateSide = sideMatch ? sideMatch[1] : null;

  // 收集模板文件中的 Include（AssetDeclaration 常用）
  const includes = [];
  const incRegex = /<Include\s+[^>]*\/?>/gi;
  let im;
  while ((im = incRegex.exec(templateContent)) !== null) {
    includes.push(im[0]);
  }
  const uniqueIncludes = [...new Set(includes)];

  let xml = `<?xml version="1.0" encoding="utf-8"?>\n`;
  xml += `<AssetDeclaration xmlns="uri:ea.com:eala:asset">\n`;
  if (uniqueIncludes.length) {
    uniqueIncludes.forEach((inc) => {
      xml += `  ${inc}\n`;
    });
  } else if (tagName === 'GameObject') {
    const inherit = block.match(/inheritFrom="([^"]+)"/i);
    const base = inherit && /Vehicle/i.test(inherit[1]) ? 'BaseVehicle' : /Aircraft/i.test(inherit[1]) ? 'BaseAircraft' : 'BaseInfantry';
    xml += `  <Include type="instance" source="DATA:BaseObjects/${base}.xml" />\n`;
  }
  xml += `\n  ${block.split('\n').join('\n  ')}\n`;
  xml += `</AssetDeclaration>\n`;

  return { xml, templateSide, displayName };
}

function getActiveConventions(root, session = null) {
  return getConventionsForWrite(root, session);
}

function inferCategory(kind) {
  if (kind === 'vehicle') return 'Vehicle';
  if (kind === 'aircraft') return 'Aircraft';
  return 'Infantry';
}

function displayNameComment(displayName, unitId) {
  const label = String(displayName || '').trim();
  if (!label || label === unitId || !/[\u4e00-\u9fff]/.test(label)) return '';
  const safe = label.replace(/-->/g, '→').replace(/\n/g, ' ');
  return `    <!-- 中文显示名：${safe} -->\n`;
}

/** Insurrection 型：wrapper + 子目录多文件（路径/属性仅英文，中文仅注释） */
function buildInsurrectionUnitPackage({
  unitId,
  displayName,
  folderSide,
  kind,
  conventions,
  unitSpec = null,
}) {
  const dataRoot = conventions?.dataRoot || 'data';
  const category = inferCategory(kind);
  const folderName = String(unitId).replace(/[^A-Za-z0-9]/g, '');
  const goSide = toGameObjectSide(folderSide);
  const nameComment = displayNameComment(displayName, unitId);
  const baseInc =
    conventions?.xmlWriting?.baseIncludePattern || 'DATA:SageXml/BaseObjects/BaseInfantry.xml';
  const inheritFrom = conventions?.xmlWriting?.inheritFromPattern || 'BaseInfantry';
  const defaults = {
    infantry: { cost: 200, hp: 150, speed: 50 },
    vehicle: { cost: 950, hp: 400, speed: 60 },
    aircraft: { cost: 1200, hp: 300, speed: 80 },
  };
  const d0 = defaults[kind] || defaults.infantry;
  const spec = unitSpec || {};
  const d = {
    cost: spec.buildCost ?? d0.cost,
    hp: spec.maxHealth ?? d0.hp,
    speed: spec.speed ?? null,
  };
  const gameDep = spec.buildPrereq
    ? buildGameDependencyXml(spec.buildPrereq.requiredObject)
    : '';
  const locomotor =
    d.speed != null ? buildLocomotorSetXml(d.speed, kind) : '';
  const sub = `${dataRoot}/${folderSide}/${category}/${folderName}`;

  const gameObjectXml = `<?xml version="1.0" encoding="utf-8"?>
<AssetDeclaration xmlns="uri:ea.com:eala:asset" xmlns:xai="uri:ea.com:eala:asset:instance">
  <Includes>
${nameComment}    <Include type="instance" source="${baseInc}" />
  </Includes>
  <GameObject
    id="${unitId}"
    inheritFrom="${inheritFrom}"
    Side="${goSide}"
    EditorName="${unitId}"
    BuildTime="5"
    CommandSet="${unitId}CommandSet"
    EditorSorting="UNIT"
    xai:joinAction="Replace">${gameDep}
    <ObjectResourceInfo>
      <BuildCost Account="=$ACCOUNT_ORE" Amount="${d.cost}"/>
    </ObjectResourceInfo>
    <Body>
      <ActiveBody id="ModuleTag_Body" MaxHealth="${d.hp}"/>
    </Body>${locomotor}
  </GameObject>
</AssetDeclaration>
`;

  const logicCommandXml = `<?xml version="1.0" encoding="utf-8"?>
<AssetDeclaration xmlns="uri:ea.com:eala:asset">
${buildLogicCommandSnippet(unitId)}
</AssetDeclaration>
`;

  const logicCommandSetXml = `<?xml version="1.0" encoding="utf-8"?>
<AssetDeclaration xmlns="uri:ea.com:eala:asset">
${buildCommandSetSnippet(unitId)}
</AssetDeclaration>
`;

  const wrapperXml = `<?xml version="1.0" encoding="utf-8"?>
<AssetDeclaration xmlns="uri:ea.com:eala:asset">
  <Includes>
${nameComment}    <Include type="all" source="${folderName}/GameObject.xml" />
    <Include type="all" source="${folderName}/LogicCommand.xml" />
    <Include type="all" source="${folderName}/LogicCommandSet.xml" />
    <!-- 若 LogicCommand 含 SPECIAL_POWER，请添加 SpecialPowerTemplates.xml 并取消下行注释 -->
    <!-- <Include type="all" source="${folderName}/SpecialPowerTemplates.xml" /> -->
  </Includes>
</AssetDeclaration>
`;

  return {
    layout: 'sdk-insurrection',
    wrapperRel: `${dataRoot}/${folderSide}/${category}/${folderName}.xml`,
    files: [
      { rel: `${sub}/GameObject.xml`, content: gameObjectXml },
      { rel: `${sub}/LogicCommand.xml`, content: logicCommandXml },
      { rel: `${sub}/LogicCommandSet.xml`, content: logicCommandSetXml },
      { rel: `${dataRoot}/${folderSide}/${category}/${folderName}.xml`, content: wrapperXml },
    ],
  };
}

function buildSkeletonUnitXml(unitId, displayName, folderSide, kind = 'infantry', unitSpec = null) {
  const goSide = toGameObjectSide(folderSide);
  const rel = `data/${folderSide}/Units/${unitId}.xml`;
  const templateUnit = pickSdkTemplate(unitId, rel, kind, kind);
  const defaults = {
    infantry: { cost: 200, hp: 150 },
    vehicle: { cost: 950, hp: 400 },
    aircraft: { cost: 1200, hp: 300 },
  };
  const d0 = defaults[kind] || defaults.infantry;
  const spec = unitSpec || {};
  let xml = buildTemplateInheritUnitXml({
    unitId,
    templateUnit,
    side: goSide,
    sideFolder: folderSide,
    buildCost: spec.buildCost ?? d0.cost,
    maxHealth: spec.maxHealth ?? d0.hp,
  });
  return applySpecToGameObjectXml(xml, spec, kind);
}

/**
 * 仅生成 XML 与目标路径；始终新建独立文件，不追加到已有 XML
 */
function buildUnitXml({
  unitId,
  templateUnit,
  displayName,
  description,
  side: sideArg,
  rawMessage,
  unitSpec: unitSpecArg = null,
  session = null,
}) {
  const root = getCurrentFolder();
  if (!root) return { success: false, error: '项目目录未设置' };
  if (!unitId) return { success: false, error: '请指定单位 ID' };

  const { isValidAsciiUnitId, isReasonableUnitId } = require('./unit-id-naming');
  if (!isValidAsciiUnitId(unitId) || !isReasonableUnitId(unitId)) {
    return {
      success: false,
      error: `单位 ID「${unitId}」不合法（需 8~40 位英文 PascalCase，且不能含 CommandSet/LogicCommand 等）。请重新创建或指定简短英文 ID。`,
    };
  }

  if (unitExists(unitId, root)) {
    return { success: false, error: `单位 '${unitId}' 已存在于当前项目，请换一个 ID` };
  }

  const pathCheck = validateUnitFilePaths(
    [
      resolveNewUnitPath(unitId, inferSide({ displayName, templateSide: sideArg, templateUnit }), root),
    ],
    unitId
  );
  if (!pathCheck.ok) return { success: false, error: pathCheck.error };

  let xmlContent = '';
  let templateSide = null;
  const folderSideEarly = SIDE_FOLDERS[inferSide({ displayName, templateSide: sideArg, templateUnit })] || 'Soviet';
  const kindEarly = inferUnitKind({ displayName, templateUnit, rawMessage });
  const unitSpec =
    unitSpecArg ||
    parseCreateUnitSpec(rawMessage, { displayName, side: folderSideEarly, kind: kindEarly });

  if (templateUnit) {
    const tpl = readTemplateFile(templateUnit, root);
    if (!tpl) {
      const { getSdkRoot, getSageXmlRoot } = require('./vanilla-unit-loader');
      const sdk = getSdkRoot();
      const sage = getSageXmlRoot();
      let hint = `模板单位 '${templateUnit}' 未找到。`;
      if (!sdk) {
        hint += ' 请在 **首选项 → RA3 MOD SDK 路径** 设置为含 SageXml 的目录（例如 D:/Ra3ModEditTool/RA3 MODSDK-X）。';
      } else if (!sage) {
        hint += ` 已配置 SDK（${sdk}），但其下没有 SageXml 文件夹。`;
      } else {
        hint += ` 已在 SageXml（${sage}）与当前 MOD 项目中检索，无匹配 GameObject。请核对模板 ID。`;
      }
      return { success: false, error: hint };
    }
    const cloned = cloneUnitFromTemplate(tpl.content, templateUnit, unitId, displayName);
    if (!cloned) {
      return { success: false, error: `无法从模板 '${templateUnit}' 提取单位节点` };
    }
    xmlContent = applySpecToGameObjectXml(cloned.xml, unitSpec, kindEarly);
    templateSide = cloned.templateSide;
  } else {
    const folderSide = inferSide({ displayName, templateSide: sideArg, templateUnit });
    const kind = inferUnitKind({ displayName, templateUnit, rawMessage });
    xmlContent = buildSkeletonUnitXml(unitId, displayName || unitId, folderSide, kind, unitSpec);
    templateSide = folderSide;
  }

  const side = inferSide({ displayName, templateSide, templateUnit });
  const conventions = getActiveConventions(root, session);
  const kind = inferUnitKind({ displayName, templateUnit, rawMessage });
  const folderSide = SIDE_FOLDERS[side] || 'Soviet';

  if (shouldUseInsurrectionPackage(conventions, session) && !templateUnit) {
    const pkg = buildInsurrectionUnitPackage({
      unitId,
      displayName: displayName || unitId,
      folderSide,
      kind,
      conventions,
      unitSpec,
    });
    const primary = pkg.files.find((f) => /GameObject\.xml$/i.test(f.rel)) || pkg.files[0];
    const pkgPathCheck = validateUnitFilePaths(
      pkg.files.map((f) => f.rel).concat(pkg.wrapperRel),
      unitId
    );
    if (!pkgPathCheck.ok) return { success: false, error: pkgPathCheck.error };

    return {
      success: true,
      data: {
        unitId,
        layout: pkg.layout,
        targetFile: primary.rel,
        fullPath: resolvePath(primary.rel, root),
        xmlContent: primary.content,
        files: pkg.files,
        wrapperRel: pkg.wrapperRel,
        appendToExisting: false,
        displayName: displayName || unitId,
        side,
        conventionsProfile: conventions.layoutProfile,
      },
    };
  }

  const targetFile = resolveNewUnitPath(unitId, side, root);
  const fullPath = resolvePath(targetFile, root);

  if (fs.existsSync(fullPath)) {
    return { success: false, error: `目标文件已存在: ${targetFile}（一单位一文件，请更换 unitId）` };
  }

  return {
    success: true,
    data: {
      unitId,
      targetFile,
      fullPath,
      xmlContent,
      appendToExisting: false,
      displayName: displayName || unitId,
      side,
      conventionsProfile: conventions?.layoutProfile || 'minimal-flat',
    },
  };
}

function commitUnitFiles(builtData) {
  const root = getCurrentFolder();
  const written = [];
  if (builtData.files?.length) {
    for (const f of builtData.files) {
      const full = resolvePath(f.rel, root);
      const dir = path.dirname(full);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      try {
        const { captureBeforeMutate } = require('./agent-rollback');
        captureBeforeMutate(root, f.rel);
      } catch (e) {
        console.warn('[unit-xml-builder] rollback capture:', e.message);
      }
      fs.writeFileSync(full, f.content, 'utf-8');
      written.push(path.relative(root, full).replace(/\\/g, '/'));
    }
    return written;
  }
  return [commitUnitXml(builtData)];
}

function commitUnitXml({ targetFile, fullPath, xmlContent }) {
  const root = getCurrentFolder();
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  try {
    const { captureBeforeMutate } = require('./agent-rollback');
    captureBeforeMutate(root, targetFile);
  } catch (e) {
    console.warn('[unit-xml-builder] rollback capture:', e.message);
  }
  fs.writeFileSync(fullPath, xmlContent, 'utf-8');
  return path.relative(root, fullPath).replace(/\\/g, '/');
}

/** 生成唯一单位 ID（避免僵尸等固定名冲突） */
function ensureUniqueUnitId(baseId, root) {
  if (!unitExists(baseId, root)) return baseId;
  for (let i = 2; i < 100; i++) {
    const candidate = `${baseId}${i}`;
    if (!unitExists(candidate, root)) return candidate;
  }
  return `${baseId}${Date.now().toString(36).slice(-4)}`;
}

module.exports = {
  buildUnitXml,
  commitUnitXml,
  commitUnitFiles,
  ensureUniqueUnitId,
  unitExists,
  resolveNewUnitPath,
  detectUnitLayout,
  inferUnitKind,
  inferSide,
  getActiveConventions,
};
