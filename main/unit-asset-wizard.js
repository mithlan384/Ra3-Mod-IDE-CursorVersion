// main/unit-asset-wizard.js —— 新建单位时分步确认模型/贴图/音效等素材

const fs = require('fs');
const path = require('path');
const { randomBytes } = require('crypto');
const { getCurrentFolder } = require('./project-state');
const { UNIT_ALIASES } = require('./create-unit-pipeline');

/** @type {Map<string, {resolve:(v:object)=>void, reject:(e:Error)=>void, timer:NodeJS.Timeout}>} */
const pendingSteps = new Map();

const ASSET_SLOT_DEFS = [
  {
    id: 'model',
    label: '3D 皮肤模型 (_SKN)',
    description:
      '主模型 W3X（文件名宜含 _SKN）。将复制到 Art/Units/单位名/ 并按标准 MOD 规范重命名。',
    extensions: ['w3x', 'w3d'],
    required: true,
  },
  {
    id: 'animations',
    label: '动画 W3X（可多选）',
    description:
      '开火 _ATK*、死亡 _DIE*、移动 _MOVA/_RUN*、待机 _IDLA。系统按文件名匹配 XML 条件（FIRING_A 与 DYING 不会搞混）。',
    extensions: ['w3x', 'w3d'],
    required: false,
    multiple: true,
  },
  {
    id: 'texture',
    label: '贴图',
    description: 'DDS/TGA 贴图 → Art/Units/单位名/，写入 Texture.xml',
    extensions: ['dds', 'tga', 'png'],
    required: false,
  },
  {
    id: 'portrait',
    label: '肖像 / 建造按钮图',
    description: '128×128 等单位 UI 头像（TGA/DDS），对应 SelectPortrait / ButtonImage',
    extensions: ['tga', 'dds', 'png', 'jpg', 'jpeg'],
    required: false,
  },
  {
    id: 'voice',
    label: '语音',
    description: '单位语音包或代表性语音文件（可跳过，沿用模板/原版）',
    extensions: ['wav', 'mp3', 'ogg'],
    required: false,
  },
  {
    id: 'sfx_move',
    label: '移动音效',
    description: '行走、履带、引擎等移动相关音效',
    extensions: ['wav', 'mp3', 'ogg'],
    required: false,
  },
  {
    id: 'sfx_weapon',
    label: '武器 / 攻击音效',
    description: '开火、命中等战斗音效',
    extensions: ['wav', 'mp3', 'ogg'],
    required: false,
  },
  {
    id: 'sfx_die',
    label: '死亡音效',
    description: '单位死亡、爆炸等音效',
    extensions: ['wav', 'mp3', 'ogg'],
    required: false,
  },
];

function generateFlowId() {
  return `asset_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`;
}

function classifyCreationMode(req, templateUnit) {
  const msg = String(req.rawMessage || '');
  const name = String(req.displayName || '');

  const explicitCustom =
    /全新|原创|自制|自定义|独立模型|新模型|不用.*模板|不继承|单独.*模型|从零/i.test(msg);
  const hasModelPath = /\.w3x\b|\.w3d\b/i.test(msg);
  const hasAnyAssetPath = /[a-zA-Z]:[\\/][^\s'"]+\.(w3x|w3d|dds|tga|wav|mp3)/i.test(msg);

  if (explicitCustom || hasModelPath || (hasAnyAssetPath && !templateUnit)) {
    return 'custom';
  }

  const nameMatchesAlias = Object.keys(UNIT_ALIASES).some((alias) => name.includes(alias));

  if (templateUnit && nameMatchesAlias && !explicitCustom && !hasModelPath) {
    return 'clone';
  }

  if (!templateUnit) return 'custom';

  if (templateUnit && !explicitCustom) return 'hybrid';

  return 'custom';
}

function extractPathsFromMessage(message, extensions) {
  const found = [];
  const extGroup = extensions.map((e) => e.replace(/^\./, '')).join('|');
  const re = new RegExp(
    `([a-zA-Z]:[\\\\/][^\\s'"]+\\.(${extGroup})|[^\\s'"]+\\.(${extGroup}))`,
    'gi'
  );
  let m;
  while ((m = re.exec(message)) !== null) {
    const p = m[1].replace(/\\/g, '/');
    if (fs.existsSync(p)) found.push(p);
  }
  return [...new Set(found)];
}

function buildSlotList(mode, templateUnit) {
  if (mode === 'clone') return [];
  return ASSET_SLOT_DEFS.map((s) => ({
    ...s,
    vanillaHint: templateUnit
      ? `可跳过以沿用模板「${templateUnit}」或原版默认素材`
      : '可跳过；创建后需在 XML 中手动指定原版引用',
  }));
}

function waitForAssetStep(flowId, slotId, timeoutMs = 900000) {
  const key = `${flowId}|${slotId}`;
  return new Promise((resolve, reject) => {
    if (pendingSteps.has(key)) {
      reject(new Error('重复的素材确认请求'));
      return;
    }
    const timer = setTimeout(() => {
      pendingSteps.delete(key);
      reject(new Error('素材选择超时'));
    }, timeoutMs);
    pendingSteps.set(key, { resolve, reject, timer });
  });
}

function resolveAssetStep(flowId, slotId, payload) {
  const key = `${flowId}|${slotId}`;
  const entry = pendingSteps.get(key);
  if (!entry) return false;
  clearTimeout(entry.timer);
  pendingSteps.delete(key);
  entry.resolve(payload);
  return true;
}

function cancelFlow(flowId) {
  for (const [key, entry] of pendingSteps) {
    if (key.startsWith(`${flowId}|`)) {
      clearTimeout(entry.timer);
      entry.resolve({ action: 'cancel_flow', cancelled: true });
      pendingSteps.delete(key);
    }
  }
}

function ensureArtImportDir(projectRoot, unitId) {
  const dir = path.join(projectRoot, 'Art', 'Imported', unitId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function copyAssetIntoProject(projectRoot, unitId, slotId, sourcePath, options = {}) {
  const { installArtFile, resolveArtFolderName } = require('./insurrection-art-packager');
  const artFolder = resolveArtFolderName(unitId, options.displayName);
  return installArtFile(projectRoot, artFolder, sourcePath, {
    unitId,
    folderSide: options.folderSide || 'Soviet',
    roleHint: options.roleHint || slotId,
    userHint: options.userHint || '',
  });
}

/**
 * @param {import('electron').BrowserWindow|null} win
 * @param {object} stepPayload
 */
function sendAssetWizardStep(win, stepPayload) {
  if (win && !win.isDestroyed()) {
    win.webContents.send('agent:asset-wizard-step', {
      immediate: true,
      ...stepPayload,
    });
  }
}

/**
 * @param {object} options
 * @param {import('electron').BrowserWindow|null} [options.senderWin]
 */
async function runUnitAssetWizard(options = {}) {
  const {
    req,
    unitId,
    templateUnit = null,
    mode: modeIn,
    sessionId = null,
    senderWin = null,
    onProgress = () => {},
    folderSide = 'Soviet',
    kind = 'infantry',
    rawMessage = '',
  } = options;

  const mode = modeIn || classifyCreationMode(req, templateUnit);
  const flowId = generateFlowId();
  const assets = {};
  const root = getCurrentFolder();

  if (!root) {
    return { success: false, error: '未打开 MOD 项目', mode, assets };
  }

  if (mode === 'clone') {
    onProgress(
      `ℹ️ **${req.displayName}** 将按模板 **${templateUnit || '官方单位'}** 继承模型、动画与音效（简单改造）。`
    );
    sendAssetWizardStep(senderWin, {
      flowId,
      sessionId,
      kind: 'clone_confirm',
      unitId,
      displayName: req.displayName,
      templateUnit,
      title: '确认：沿用模板素材',
      description: `无需单独选择 W3X/贴图/音效，将继承「${templateUnit}」已有配置。确认后开始生成 XML。`,
    });
    const res = await waitForAssetStep(flowId, 'clone_confirm');
    if (res.cancelled || res.action === 'cancel_flow') {
      return { success: false, cancelled: true, mode, assets };
    }
    assets._mode = 'clone';
    assets._templateUnit = templateUnit;
    return { success: true, mode, assets, flowId };
  }

  onProgress(
    `🎨 检测到**全新单位**「${req.displayName}」，无法仅靠改模板完成。请逐步确认各素材（可跳过非必需项）。`
  );

  const slots = buildSlotList(mode, templateUnit);
  const msg = req.rawMessage || '';

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    const prefillPaths = extractPathsFromMessage(msg, slot.extensions);
    const prefillPath = prefillPaths[0] || '';

    onProgress(`📎 素材 ${i + 1}/${slots.length}：**${slot.label}**`);

    sendAssetWizardStep(senderWin, {
      flowId,
      sessionId,
      kind: 'slot',
      unitId,
      displayName: req.displayName,
      templateUnit,
      slot,
      stepIndex: i,
      totalSteps: slots.length,
      prefillPath,
      title: `素材 ${i + 1}/${slots.length}：${slot.label}`,
      description: slot.description,
      vanillaHint: slot.vanillaHint,
      required: slot.required,
      extensions: slot.extensions,
      multiple: !!slot.multiple,
    });

    const res = await waitForAssetStep(flowId, slot.id);
    if (res.cancelled || res.action === 'cancel_flow') {
      cancelFlow(flowId);
      return { success: false, cancelled: true, mode, assets };
    }

    if (res.action === 'skip') {
      assets[slot.id] = { skipped: true, reason: res.reason || '用户跳过' };
      onProgress(`   ○ 已跳过：${slot.label}`);
      continue;
    }

    const paths = res.filePaths || (res.filePath || prefillPath ? [res.filePath || prefillPath] : []);
    if (!paths.length) {
      if (slot.required) {
        onProgress(`   ⚠️ ${slot.label} 为必需项，但未选择文件`);
        assets[slot.id] = { skipped: true, required: true, missing: true };
      } else {
        assets[slot.id] = { skipped: true };
      }
      continue;
    }

    if (slot.multiple) {
      assets[slot.id] = { skipped: false, paths: [], files: [] };
      for (const fp of paths) {
        assets[slot.id].paths.push(fp);
        assets[slot.id].files.push({ sourcePath: fp });
        onProgress(`   ✓ 已登记：${path.basename(fp)}`);
      }
    } else {
      const filePath = paths[0];
      const copied = copyAssetIntoProject(root, unitId, slot.id, filePath, {
        displayName: req.displayName,
        folderSide,
        userHint: rawMessage,
      });
      if (!copied.success) {
        assets[slot.id] = { error: copied.error, sourcePath: filePath };
        onProgress(`   ❌ 复制失败：${copied.error}`);
        continue;
      }
      assets[slot.id] = {
        skipped: false,
        sourcePath: filePath,
        projectRel: copied.rel,
        artRef: copied.artRef,
        normalizedId: copied.normalizedId,
        role: copied.role,
      };
      onProgress(`   ✓ ${slot.label} → \`${copied.normalizedId}\` (${copied.rel})`);
    }
  }

  const { processWizardAssets } = require('./insurrection-art-packager');
  const packaged = processWizardAssets(root, unitId, req.displayName, folderSide, assets, {
    templateUnit,
    rawMessage: rawMessage || req.rawMessage,
    kind,
  });
  for (const line of packaged.log) onProgress(`   ${line}`);
  for (const w of packaged.warnings) onProgress(`   ⚠️ ${w}`);

  if (assets.model?.missing || (mode === 'custom' && !packaged.byRole?.skin)) {
    onProgress(
      '⚠️ **未提供皮肤模型 (_SKN)**：将仍生成 XML；若沿用原版模板，请在描述中写明模板单位 ID。'
    );
  }

  assets._mode = mode;
  assets._templateUnit = templateUnit;
  assets._packaged = packaged;
  assets._artFolder = packaged.artFolder;
  writeAssetsManifest(root, unitId, assets, req, packaged);

  return { success: true, mode, assets, flowId, packaged };
}

function writeAssetsManifest(projectRoot, unitId, assets, req, packaged = null) {
  try {
    const artFolder = packaged?.artFolder || unitId;
    const manifestPath = path.join(
      projectRoot,
      'Art',
      'Units',
      artFolder,
      'assets.manifest.json'
    );
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          unitId,
          displayName: req.displayName,
          createdAt: new Date().toISOString(),
          assets,
          packaged: packaged
            ? {
                artFolder: packaged.artFolder,
                byRole: Object.fromEntries(
                  Object.entries(packaged.byRole || {}).map(([k, v]) => [
                    k,
                    { normalizedId: v.normalizedId, artRef: v.artRef, conditions: v.conditions },
                  ])
                ),
                vanillaTemplate: packaged.templateDataInclude,
              }
            : null,
        },
        null,
        2
      ),
      'utf-8'
    );
  } catch (e) {
    console.warn('[unit-asset-wizard] manifest:', e.message);
  }
}

/**
 * 创建单位后把已选素材写入 GameObject 注释与可选 Include
 */
function applyAssetsToGameObject(projectRoot, unitSubDir, assets, unitId, options = {}) {
  if (assets?._packaged?.byRole?.skin) {
    const { applyInsurrectionArtPackage } = require('./insurrection-art-packager');
    const wrapperRel = options.wrapperRel || null;
    return applyInsurrectionArtPackage(projectRoot, unitSubDir, wrapperRel, assets._packaged, {
      unitId,
      kind: options.kind || 'infantry',
      skipDrawInject: assets._mode === 'clone',
    });
  }
  return { changed: false };
}

module.exports = {
  ASSET_SLOT_DEFS,
  classifyCreationMode,
  generateFlowId,
  sendAssetWizardStep,
  waitForAssetStep,
  buildSlotList,
  runUnitAssetWizard,
  resolveAssetStep,
  cancelFlow,
  copyAssetIntoProject,
  applyAssetsToGameObject,
  extractPathsFromMessage,
};
