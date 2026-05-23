// main/insurrection-art-packager.js —— 起义时刻标准：复制 Art/Units、生成 W3X/Texture/Audio XML、Draw 引用

const fs = require('fs');
const path = require('path');
const {
  classifyAssetRole,
  classifyAudioRole,
  normalizeW3xAssetId,
  validateRoleAssignment,
  basenameNoExt,
  factionPrefix,
} = require('./asset-name-resolver');
const { getVanillaDataIncludeForTemplate, loadVanillaUnitXml, extractDrawAssetIds } = require('./vanilla-unit-loader');

function resolveArtFolderName(unitId, displayName) {
  const dn = String(displayName || '').trim();
  if (dn && /^[\x20-\x7E]+$/.test(dn) && dn.length <= 40) return dn;
  return unitId.replace(/([a-z])([A-Z])/g, '$1 $2');
}

function artUnitsPath(artFolder) {
  return `Units/${artFolder}`;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function isInsideProject(projectRoot, filePath) {
  const rel = path.relative(projectRoot, path.resolve(filePath));
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * 安装单个文件到 Art/Units/{folder}/（起义时刻布局）
 */
function installArtFile(projectRoot, artFolder, sourcePath, options = {}) {
  const src = path.resolve(sourcePath);
  if (!fs.existsSync(src)) return { success: false, error: '文件不存在' };

  const ext = path.extname(src).toLowerCase();
  const roleHint = options.roleHint || options.userHint || '';
  const unitId = options.unitId;
  const folderSide = options.folderSide || 'Soviet';
  const kind = options.kind || 'infantry';

  let roleDef = options.roleDef;
  if (!roleDef && ['.w3x', '.w3d'].includes(ext)) {
    roleDef = classifyAssetRole(basenameNoExt(src), roleHint);
  }

  const normalizedId =
    options.normalizedId ||
    (roleDef && unitId
      ? normalizeW3xAssetId(unitId, src, roleDef, folderSide)
      : basenameNoExt(src).toUpperCase());

  const destDir = path.join(projectRoot, 'Art', 'Units', artFolder);
  ensureDir(destDir);

  const destName = `${normalizedId}${ext}`;
  const destFull = path.join(destDir, destName);
  const rel = path.relative(projectRoot, destFull).replace(/\\/g, '/');

  try {
    const { captureBeforeMutate } = require('./agent-rollback');
    captureBeforeMutate(projectRoot, rel);
  } catch (e) {
    console.warn('[insurrection-art-packager] rollback capture:', e.message);
  }

  if (!isInsideProject(projectRoot, src)) {
    fs.copyFileSync(src, destFull);
  } else if (path.resolve(src) !== path.resolve(destFull)) {
    fs.copyFileSync(src, destFull);
  }

  const artRef = `ART:${artUnitsPath(artFolder)}/${destName}`;

  return {
    success: true,
    normalizedId,
    artRef,
    rel,
    destFull,
    ext,
    role: roleDef?.role || (['.wav', '.mp3', '.ogg'].includes(ext) ? classifyAudioRole(normalizedId, roleHint) : 'file'),
    roleLabel: roleDef?.label,
    conditions: roleDef?.conditions,
    animationMode: roleDef?.animationMode,
    isModel: !!roleDef?.isModel,
    isAux: !!roleDef?.isAux,
    originalPath: src,
  };
}

function buildW3xXml(artFolder, w3xEntries) {
  const lines = w3xEntries
    .filter((e) => e.artRef)
    .map((e) => `    <Include type="all" source="${e.artRef}" />`);
  return `<?xml version="1.0" encoding="utf-8"?>
<AssetDeclaration xmlns="uri:ea.com:eala:asset">
  <Includes>
${lines.join('\n')}
  </Includes>
</AssetDeclaration>
`;
}

function buildTextureXml(textureId, artRef) {
  return `<?xml version="1.0" encoding="utf-8"?>
<AssetDeclaration xmlns="uri:ea.com:eala:asset">
  <Texture id="${textureId}" File="${artRef}" Scale="1" />
</AssetDeclaration>
`;
}

function buildAudioFileXml(entries, artFolder) {
  const lines = entries.map(
    (e) =>
      `  <AudioFile id="${e.audioId}" File="${e.artRef}" Type="TYPE_UNKNOWN" />`
  );
  return `<?xml version="1.0" encoding="utf-8"?>
<AssetDeclaration xmlns="uri:ea.com:eala:asset">
${lines.join('\n')}
</AssetDeclaration>
`;
}

/** 生成 Draw 片段（步兵 ScriptedModelDraw；避免开火/死亡条件写反） */
function buildDrawXmlSnippet(assetsByRole, options = {}) {
  const drawId = options.drawModuleId || 'ModuleTag_Draw';
  const skin = assetsByRole.skin;
  if (!skin?.normalizedId) return '';

  const lines = [];
  lines.push(`    <Draws>`);
  lines.push(`      <ScriptedModelDraw`);
  lines.push(`        id="${drawId}"`);
  lines.push(`        OkToChangeModelColor="true">`);
  lines.push(`        <ModelConditionState ParseCondStateType="PARSE_DEFAULT" RetainSubObjects="true">`);
  lines.push(`          <Model Name="${skin.normalizedId}" />`);
  lines.push(`        </ModelConditionState>`);

  const idle = assetsByRole.idle;
  if (idle?.normalizedId) {
    lines.push(`        <AnimationState ParseCondStateType="PARSE_DEFAULT">`);
    lines.push(`          <Animation AnimationName="${idle.normalizedId}" AnimationMode="LOOP" />`);
    lines.push(`        </AnimationState>`);
  }

  const move = assetsByRole.move;
  if (move?.normalizedId && move.conditions) {
    lines.push(`        <AnimationState ParseCondStateType="PARSE_NORMAL" ConditionsYes="${move.conditions}">`);
    lines.push(`          <Animation AnimationName="${move.normalizedId}" AnimationMode="LOOP" />`);
    lines.push(`        </AnimationState>`);
  }

  const fire = assetsByRole.fire;
  if (fire?.normalizedId) {
    lines.push(`        <AnimationState ParseCondStateType="PARSE_NORMAL" ConditionsYes="FIRING_A">`);
    lines.push(
      `          <Animation AnimationName="${fire.normalizedId}" AnimationMode="${fire.animationMode || 'ONCE'}" />`
    );
    lines.push(`        </AnimationState>`);
  }

  const atkIdle = assetsByRole.attack_idle;
  if (atkIdle?.normalizedId) {
    lines.push(`        <AnimationState ParseCondStateType="PARSE_NORMAL" ConditionsYes="ATTACKING">`);
    lines.push(`          <Animation AnimationName="${atkIdle.normalizedId}" AnimationMode="LOOP" />`);
    lines.push(`        </AnimationState>`);
  }

  const die = assetsByRole.die;
  if (die?.normalizedId) {
    lines.push(`        <AnimationState ParseCondStateType="PARSE_NORMAL" ConditionsYes="DYING DEATH_1">`);
    lines.push(
      `          <Animation AnimationName="${die.normalizedId}" AnimationMode="${die.animationMode || 'ONCE'}" />`
    );
    lines.push(`        </AnimationState>`);
  }

  lines.push(`      </ScriptedModelDraw>`);
  lines.push(`    </Draws>`);
  return lines.join('\n');
}

function processWizardAssets(projectRoot, unitId, displayName, folderSide, rawAssets, options = {}) {
  const artFolder = resolveArtFolderName(unitId, displayName);
  const kind = options.kind || 'infantry';
  const templateUnit = options.templateUnit || rawAssets._templateUnit;
  const w3xInstalled = [];
  const audioInstalled = [];
  const textures = [];
  const byRole = {};
  const log = [];

  const namedHints = require('./asset-name-resolver').parseNamedAssetsFromMessage(
    options.rawMessage || ''
  );

  function hintForSlot(slotId) {
    const map = {
      model: '皮肤|模型',
      texture: '贴图',
      portrait: '肖像',
      voice: '语音',
      sfx_weapon: '开火|武器',
      sfx_die: '死亡',
      sfx_move: '移动',
      animations: '动画',
    };
    for (const [key, re] of Object.entries(map)) {
      if (slotId === key || slotId.startsWith(key)) {
        for (const [k, v] of Object.entries(namedHints)) {
          if (new RegExp(re).test(k)) return v;
        }
      }
    }
    return '';
  }

  const multiPaths = rawAssets.animations?.paths || rawAssets.animations?.files || [];

  const processFile = (slotId, filePath, extra = {}) => {
    if (!filePath || !fs.existsSync(filePath)) return;
    const hint = extra.hint || hintForSlot(slotId) || '';
    const ext = path.extname(filePath).toLowerCase();
    if (['.w3x', '.w3d'].includes(ext)) {
      const roleDef = classifyAssetRole(basenameNoExt(filePath), hint);
      if (roleDef.isAux) {
        const inst = installArtFile(projectRoot, artFolder, filePath, {
          unitId,
          folderSide,
          roleDef,
          userHint: hint,
        });
        if (inst.success) {
          w3xInstalled.push(inst);
          log.push(`辅助: ${inst.normalizedId} (${roleDef.label})`);
        }
        return;
      }
      const roleKey =
        roleDef.role === 'unknown_anim' ? slotId === 'model' ? 'skin' : 'unknown' : roleDef.role;
      const inst = installArtFile(projectRoot, artFolder, filePath, {
        unitId,
        folderSide,
        roleDef: { ...roleDef, role: roleKey === 'skin' ? 'skin' : roleDef.role },
        userHint: hint,
      });
      if (inst.success) {
        w3xInstalled.push(inst);
        if (!byRole[roleKey] || roleKey === 'skin') byRole[roleKey] = inst;
        log.push(`${roleDef.label || roleKey}: ${inst.normalizedId} ← ${path.basename(filePath)}`);
      }
    } else if (['.dds', '.tga', '.png'].includes(ext)) {
      const isPortrait = slotId === 'portrait';
      const tid = isPortrait
        ? `Portrait_${unitId}`
        : `${factionPrefix(folderSide)}${unitId.replace(/[^A-Za-z0-9]/g, '')}`.slice(0, 32);
      const inst = installArtFile(projectRoot, artFolder, filePath, {
        unitId,
        folderSide,
        normalizedId: tid,
      });
      if (inst.success) {
        const texEntry = { textureId: tid, ...inst };
        textures.push(texEntry);
        if (isPortrait) {
          byRole.portrait = {
            ...inst,
            portraitId: tid,
            buttonId: `Button_${unitId}`,
          };
        } else {
          byRole.bodyTexture = inst;
        }
        log.push(`${isPortrait ? '肖像' : '贴图'}: ${tid}`);
      }
    } else if (['.wav', '.mp3', '.ogg'].includes(ext)) {
      const audioRole = classifyAudioRole(basenameNoExt(filePath), hint || slotId);
      const audioId = `${factionPrefix(folderSide)}${unitId.slice(0, 8)}_${audioRole}`.replace(/[^A-Za-z0-9_]/g, '');
      const inst = installArtFile(projectRoot, artFolder, filePath, {
        unitId,
        folderSide,
        normalizedId: audioId,
      });
      if (inst.success) {
        audioInstalled.push({ audioId, audioRole, ...inst });
        log.push(`音频[${audioRole}]: ${audioId}`);
      }
    }
  };

  for (const [slotId, data] of Object.entries(rawAssets)) {
    if (slotId.startsWith('_')) continue;
    if (data.skipped) continue;
    const fp = data.sourcePath || data.projectRel;
    if (fp) processFile(slotId, path.isAbsolute(fp) ? fp : path.join(projectRoot, fp));
  }

  for (const item of multiPaths) {
    const p =
      typeof item === 'string' ? item : item?.sourcePath || item?.path || item?.projectRel;
    if (!p) continue;
    processFile('animations', path.isAbsolute(p) ? p : path.join(projectRoot, p));
  }

  const warnings = validateRoleAssignment(byRole);
  for (const w of warnings) log.push(`⚠️ ${w}`);

  let vanillaRef = null;
  if (templateUnit) {
    vanillaRef = loadVanillaUnitXml(templateUnit);
    if (vanillaRef) {
      log.push(`原版参考: ${vanillaRef.dataInclude} (SageXml)`);
    }
  }

  return {
    artFolder,
    artUnitsPath: artUnitsPath(artFolder),
    w3xInstalled,
    audioInstalled,
    textures,
    byRole,
    log,
    warnings,
    vanillaRef,
    templateDataInclude: templateUnit ? getVanillaDataIncludeForTemplate(templateUnit) : null,
    vanillaDrawSample: vanillaRef ? extractDrawAssetIds(vanillaRef.content) : null,
  };
}

function patchWrapperIncludes(wrapperContent, unitFolderName, extraIncludes) {
  let xml = wrapperContent;
  for (const inc of extraIncludes) {
    if (xml.includes(inc)) continue;
    if (/<Includes>/i.test(xml)) {
      xml = xml.replace(/<Includes>/i, `<Includes>\n    <Include type="all" source="${inc}" />`);
    }
  }
  return xml;
}

/**
 * 将起义时刻美术包写入单位目录（W3X.xml、Texture、Audio、GameObject Draw）
 */
function applyInsurrectionArtPackage(projectRoot, unitSubDir, wrapperRel, packaged, options = {}) {
  const changed = [];
  const unitFolder = path.basename(unitSubDir);
  const artFolder = packaged.artFolder;

  const w3xPath = path.join(projectRoot, unitSubDir, 'W3X.xml');
  if (packaged.w3xInstalled.length) {
    fs.writeFileSync(w3xPath, buildW3xXml(artFolder, packaged.w3xInstalled), 'utf-8');
    changed.push(path.relative(projectRoot, w3xPath).replace(/\\/g, '/'));
  }

  if (packaged.textures.length) {
    const texPath = path.join(projectRoot, unitSubDir, 'Texture.xml');
    const lines = packaged.textures
      .map(
        (tex) =>
          `  <Texture id="${tex.textureId}" File="${tex.artRef}" Scale="1" GenerateMipMaps="false" AllowAutomaticResize="false" />`
      )
      .join('\n');
    const texXml = `<?xml version="1.0" encoding="utf-8"?>
<AssetDeclaration xmlns="uri:ea.com:eala:asset">
${lines}
</AssetDeclaration>
`;
    fs.writeFileSync(texPath, texXml, 'utf-8');
    changed.push(path.relative(projectRoot, texPath).replace(/\\/g, '/'));
  }

  if (packaged.audioInstalled.length) {
    const afPath = path.join(projectRoot, unitSubDir, 'AudioFile.xml');
    fs.writeFileSync(afPath, buildAudioFileXml(packaged.audioInstalled, artFolder), 'utf-8');
    changed.push(path.relative(projectRoot, afPath).replace(/\\/g, '/'));
  }

  const goPath = path.join(projectRoot, unitSubDir, 'GameObject.xml');
  if (fs.existsSync(goPath) && packaged.byRole?.skin) {
    let go = fs.readFileSync(goPath, 'utf-8');

    if (packaged.templateDataInclude && !go.includes(packaged.templateDataInclude)) {
      go = go.replace(
        /<Includes>/i,
        `<Includes>\n    <Include type="instance" source="${packaged.templateDataInclude}" />`
      );
    }

    const drawBlock = buildDrawXmlSnippet(packaged.byRole, options);
    if (drawBlock && !go.includes('ModuleTag_Draw')) {
      go = go.replace(/<GameObject\b/i, `${drawBlock}\n  <GameObject`);
    } else if (drawBlock && go.includes('<Draws>')) {
      go = go.replace(/<Draws>[\s\S]*?<\/Draws>/i, drawBlock.trim());
    }

    const portrait = packaged.byRole.portrait;
    if (portrait?.portraitId && !/SelectPortrait=/i.test(go)) {
      go = go.replace(
        /<GameObject\s+/i,
        `<GameObject SelectPortrait="${portrait.portraitId}" ButtonImage="${portrait.buttonId || `Button_${options.unitId}`}" `
      );
    }

    fs.writeFileSync(goPath, go, 'utf-8');
    changed.push(path.relative(projectRoot, goPath).replace(/\\/g, '/'));
  }

  if (wrapperRel && fs.existsSync(path.join(projectRoot, wrapperRel))) {
    const extra = [];
    if (packaged.w3xInstalled.length) extra.push(`${unitFolder}/W3X.xml`);
    if (packaged.textures.length) extra.push(`${unitFolder}/Texture.xml`);
    if (packaged.audioInstalled.length) extra.push(`${unitFolder}/AudioFile.xml`);
    const wFull = path.join(projectRoot, wrapperRel);
    const patched = patchWrapperIncludes(fs.readFileSync(wFull, 'utf-8'), unitFolder, extra);
    fs.writeFileSync(wFull, patched, 'utf-8');
    changed.push(wrapperRel.replace(/\\/g, '/'));
  }

  return { changed: [...new Set(changed)], packaged };
}

module.exports = {
  resolveArtFolderName,
  artUnitsPath,
  installArtFile,
  processWizardAssets,
  applyInsurrectionArtPackage,
  buildDrawXmlSnippet,
  buildW3xXml,
  isInsideProject,
};
