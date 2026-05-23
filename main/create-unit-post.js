// main/create-unit-post.js —— 单位文件写入后的 Mod/兵营/LogicCommand 挂接（createUnit 与 pipeline 共用）

const { getCurrentFolder } = require('./project-state');
const { registerCreatedUnit } = require('./mod-register');
const { patchBarracksCommandSet } = require('./barracks-command-set-patch');
const { prepareLogicCommandRegistration } = require('./logic-command-register');
const { registerUnitsInCommandData } = require('./command-data-repair');
const { inferUnitKind } = require('./unit-kind');

const SIDE_TO_FOLDER = {
  Allies: 'Allied',
  Allied: 'Allied',
  Soviet: 'Soviet',
  Japan: 'Japan',
  Imperial: 'Japan',
};

function resolveFolderSide(builtData, params = {}) {
  const side = builtData?.side || params.side || 'Soviet';
  return SIDE_TO_FOLDER[side] || (typeof side === 'string' && /Allied/i.test(side) ? 'Allied' : 'Soviet');
}

/**
 * 单位 XML 已落盘后的统一收尾
 * @param {object} builtData buildUnitXml / createUnitStreaming 的 data
 * @param {object} [params] 原始 create 参数（displayName, rawMessage, unitSpec）
 */
async function finalizeUnitAfterCreate(builtData, params = {}, options = {}) {
  const root = getCurrentFolder();
  const onProgress = options.onProgress || (() => {});
  const log = [];
  const changedFiles = [];

  if (!root || !builtData?.unitId) {
    return { success: false, error: '项目未打开或缺少 unitId', log, changedFiles };
  }

  const unitId = builtData.unitId;
  const file = builtData.file || builtData.targetFile || builtData.files?.[0];
  const kind = inferUnitKind({
    displayName: params.displayName || builtData.displayName,
    templateUnit: params.templateUnit,
    rawMessage: params.rawMessage,
  });
  const folderSide = resolveFolderSide(builtData, params);

  onProgress?.('📋 注册 Mod.xml / 阵营聚合链…');
  const reg = registerCreatedUnit(root, {
    unitId,
    file,
    wrapperRel: builtData.wrapperRel || file,
    layout: builtData.layout,
    side: folderSide,
    kind,
    unitSpec: params.unitSpec,
  });
  if (!reg.success) {
    log.push(reg.error || 'Mod 注册失败');
  } else {
    log.push(...(reg.log || []));
    changedFiles.push(...(reg.changedFiles || []));
  }

  if (kind === 'infantry') {
    onProgress?.('📋 挂接兵营建造队列…');
    const barracks = patchBarracksCommandSet(root, { unitId, side: folderSide });
    log.push(...(barracks.log || []));
    if (barracks.changed && barracks.rel) changedFiles.push(barracks.rel);
  }

  if (params.customAssets && builtData.files?.length) {
    const goRel = builtData.files.find((f) => /GameObject\.xml$/i.test(f));
    if (goRel) {
      const pathMod = require('path');
      const subDir = pathMod.dirname(goRel);
      const { applyAssetsToGameObject } = require('./unit-asset-wizard');
      const kind = inferUnitKind({
        displayName: params.displayName || builtData.displayName,
        templateUnit: params.templateUnit,
        rawMessage: params.rawMessage,
      });
      const applied = applyAssetsToGameObject(root, subDir, params.customAssets, unitId, {
        wrapperRel: builtData.wrapperRel,
        kind,
      });
      if (applied.changed?.length) {
        log.push(`已按标准 MOD 结构写入美术资源：${applied.changed.join(', ')}`);
        changedFiles.push(...applied.changed);
      } else if (applied.changed) {
        log.push(`已写入素材：${goRel}`);
        changedFiles.push(goRel.replace(/\\/g, '/'));
      }
    }
  }

  const isInsurrection = builtData.layout === 'sdk-insurrection';
  if (!isInsurrection) {
    onProgress?.('📋 注册 LogicCommand…');
    const lc = prepareLogicCommandRegistration(unitId, root);
    if (lc.skipped) {
      log.push(lc.skipReason);
    } else if (lc.exists) {
      log.push(`${lc.relativePath} 已包含 ${lc.cmdId}`);
    } else if (lc.isNew && lc.newFileContent) {
      const fs = require('fs');
      const pathMod = require('path');
      const dir = pathMod.dirname(lc.fullPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      try {
        const { captureBeforeMutate } = require('./agent-rollback');
        captureBeforeMutate(root, lc.relativePath);
      } catch (e) {
        console.warn('[create-unit-post] rollback capture:', e.message);
      }
      fs.writeFileSync(lc.fullPath, lc.newFileContent, 'utf-8');
      log.push(`已创建 ${lc.relativePath}`);
      changedFiles.push(lc.relativePath);
    } else {
      const regCmd = registerUnitsInCommandData(root, [unitId], onProgress, { deferWrite: false });
      log.push(...(regCmd.log || []));
      if (regCmd.changed && regCmd.rel) changedFiles.push(regCmd.rel);
    }
  } else {
    log.push('LogicCommand 已写入单位子目录（标准分包）');
  }

  const { sanitizeModXmlOnDisk } = require('./mod-xml-guard');
  const modGuard = sanitizeModXmlOnDisk(root);
  if (modGuard.changed) {
    log.push(...(modGuard.log || []));
    if (modGuard.rel) changedFiles.push(modGuard.rel);
  }

  if (options.notifyTreeRefresh) {
    for (const rel of [...new Set(changedFiles)]) {
      options.notifyTreeRefresh(rel);
    }
  }

  return {
    success: reg.success !== false,
    log,
    changedFiles: [...new Set(changedFiles)],
    registration: reg,
  };
}

module.exports = {
  finalizeUnitAfterCreate,
  resolveFolderSide,
};
