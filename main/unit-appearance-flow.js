// main/unit-appearance-flow.js —— 外观/换模型改造：策略 → 沿用原版 → 分步素材

const path = require('path');
const {
  generateFlowId,
  sendAssetWizardStep,
  waitForAssetStep,
  cancelFlow,
  extractPathsFromMessage,
  buildSlotList,
  copyAssetIntoProject,
  classifyCreationMode,
} = require('./unit-asset-wizard');
const { inferUnitKind } = require('./unit-kind');

function detectKind(message, templateUnit, displayName) {
  return inferUnitKind({ displayName, templateUnit, rawMessage: message });
}

/** @type {Map<string, object>} */
const flowStateBySession = new Map();

const VANILLA_REUSE_CATEGORIES = [
  { id: 'base_stats', label: '基础属性', hint: '血量、造价、建造时间、视野等' },
  { id: 'locomotor_armor', label: '机动与护甲', hint: 'Locomotor、ArmorSet、速度相关' },
  { id: 'weapons', label: '武器与伤害', hint: 'WeaponSlot、WeaponTemplate、开火逻辑' },
  { id: 'weapon_fx', label: '开火/命中特效', hint: 'MuzzleFlash、Projectile FX 等' },
  { id: 'special_powers', label: '技能与特殊能力', hint: 'SpecialPower、磁力鱼叉等' },
  { id: 'audio_move', label: '移动音效', hint: '履带、引擎、转向' },
  { id: 'audio_weapon', label: '武器音效', hint: '开火、命中' },
  { id: 'audio_voice', label: '语音/台词', hint: '单位语音包（可选）' },
  { id: 'ui_portrait', label: '建造图标与肖像', hint: 'ButtonImage、SelectPortrait' },
  { id: 'command_set', label: '命令条与生产', hint: 'LogicCommandSet、兵营队列' },
];

const VEHICLE_EXTRA_SLOTS = [
  {
    id: 'model_damaged',
    label: '损毁模型 / 碎块 COL（可选）',
    description: '载具消亡碎块或损毁 W3X；可跳过',
    extensions: ['w3x', 'w3d'],
    required: false,
  },
  {
    id: 'skl_skeleton',
    label: '骨骼 SKL（可选）',
    description: '若动画 W3X 引用独立 SKL，请在此提供',
    extensions: ['w3x', 'w3d'],
    required: false,
  },
];

function isAppearanceModIntent(message) {
  return /(四管|三管|双管|多管|换模型|新模型|新造型|炮塔改|外观改|改成.{0,6}管|模型改|自定义模型|四根炮)/i.test(
    String(message || '')
  );
}

function isSimpleStatOnlyIntent(message) {
  try {
    const { isSimpleStatModIntent } = require('./simple-stat-mod-flow');
    return isSimpleStatModIntent(message);
  } catch {
    const m = String(message || '');
    if (isAppearanceModIntent(m)) return false;
    return (
      /(血量|生命值|HP|MaxHealth|造价|费用|Cost|移速|速度|Speed|视野|射程)/i.test(m) &&
      /(改成|改为|设为|调到|设置为|\d{2,})/.test(m) &&
      !/(\.w3x|\.w3d|\.dds|四管|换模型|新模型)/i.test(m)
    );
  }
}

function getFlowState(sessionId) {
  if (!sessionId) return null;
  return flowStateBySession.get(sessionId) || null;
}

function setFlowState(sessionId, state) {
  if (!sessionId) return;
  flowStateBySession.set(sessionId, { ...state, updatedAt: Date.now() });
}

function clearFlowState(sessionId) {
  if (sessionId) flowStateBySession.delete(sessionId);
}

function parseStrategyFromMessage(message) {
  const m = String(message || '');
  if (/另建|全新|新建.*单位|重新创建|新单位/i.test(m)) return 'new_unit';
  if (/改现有|修改现有|改\s*Super|改造现有|在现有/i.test(m)) return 'modify_existing';
  if (/仅数据|不改模型|只加武器|数据层面/i.test(m)) return 'data_only';
  if (/新建|创建/i.test(m)) return 'new_unit';
  return null;
}

function parseFireModeFromMessage(message) {
  const m = String(message || '');
  if (/同时|齐射|一起开火/i.test(m)) return 'simultaneous';
  if (/两组|交替|2\+2|分两组/i.test(m)) return 'alternating_pairs';
  if (/轮流|依次|循环/i.test(m)) return 'sequential';
  return null;
}

function accumulateAppearanceText(flow, message, history = []) {
  const parts = [];
  if (flow?.rawMessage) parts.push(flow.rawMessage);
  for (const m of history || []) {
    if (m?.content) parts.push(m.content);
  }
  if (message) parts.push(message);
  return parts.join('\n');
}

function needsFireModeChoice(text) {
  return /(四管|三管|双管|多管|四根|两根|分两组|交替开火)/i.test(text);
}

function hasModelAvailabilityAnswer(text) {
  return (
    /\.w3x\b|\.w3d\b/i.test(text) ||
    /有现成|已有模型|自带模型|准备好了|模型在这/i.test(text) ||
    /没有模型|无模型|还没模型|需自制|要自己做模型/i.test(text) ||
    /沿用原版模型|用原版模型|不改模型外观/i.test(text)
  );
}

function updateFlowFromMessage(flow, message, history = []) {
  const text = accumulateAppearanceText(flow, message, history);
  const st = parseStrategyFromMessage(text);
  if (st) flow.strategy = st;
  const fm = parseFireModeFromMessage(text);
  if (fm) flow.fireMode = fm;
  const mp = extractPathsFromMessage(text, ['w3x', 'w3d']);
  if (mp[0]) flow.prefillModelPath = mp[0];
  if (/没有模型|无模型|还没/i.test(text)) flow.modelAvailability = 'none';
  else if (flow.prefillModelPath || /有现成|已有模型/i.test(text)) flow.modelAvailability = 'has';
  flow.displayName = inferDisplayNameFromMessage(text, flow.displayName);
  if (/天启|Apocalypse/i.test(text)) flow.templateUnit = 'SovietAntiVehicleVehicleTech3';
  flow.rawMessage = text;
  return flow;
}

function isAppearancePrerequisitesMet(flow, message, history = []) {
  if (!flow) return false;
  const text = accumulateAppearanceText(flow, message, history);
  updateFlowFromMessage(flow, message, history);
  const strategy = flow.strategy || parseStrategyFromMessage(text);
  if (!strategy) return false;
  if (strategy === 'data_only') return true;
  if (needsFireModeChoice(text) && !(flow.fireMode || parseFireModeFromMessage(text))) return false;
  if (!hasModelAvailabilityAnswer(text) && !flow.prefillModelPath) return false;
  return true;
}

function isWizardTriggerMessage(message) {
  return /(开始素材向导|进入素材向导|开始按钮向导|确认素材|开始创建单位|进入向导)/i.test(
    String(message || '')
  );
}

/** 对话追问阶段是否仍活跃（尚未进入按钮向导） */
function isAppearanceInquiryActive(sessionId, message, history = []) {
  const flow = getFlowState(sessionId);
  if (flow?.phase === 'wizard') return false;
  if (flow?.phase === 'inquiry') return true;
  if (isAppearanceModIntent(message)) return true;
  const recent = (history || []).slice(-8).map((m) => m.content || '').join('\n');
  return isAppearanceModIntent(recent) && !isWizardTriggerMessage(message);
}

/** 是否应进入按钮素材向导（须用户明确触发，且追问信息已齐） */
function shouldRunAppearanceWizard(message, sessionId, history = []) {
  if (!isWizardTriggerMessage(message)) return false;
  const flow = getFlowState(sessionId);
  if (!flow) return false;
  return isAppearancePrerequisitesMet(flow, message, history);
}

function ensureInquiryState(sessionId, message, history = [], projectRoot = null) {
  let flow = getFlowState(sessionId);
  if (!flow && isAppearanceModIntent(message)) {
    flow = {
      flowId: generateFlowId(),
      sessionId,
      phase: 'inquiry',
      strategy: null,
      fireMode: null,
      modelAvailability: null,
      displayName: inferDisplayNameFromMessage(message),
      unitId: null,
      templateUnit: /天启|Apocalypse/i.test(message) ? 'SovietAntiVehicleVehicleTech3' : null,
      folderSide: /盟军|Allied|维和/.test(message) ? 'Allied' : 'Soviet',
      kind: 'vehicle',
      vanillaPolicy: {},
      assets: {},
      rawMessage: message,
      projectRoot,
      topic: message.slice(0, 120),
    };
    setFlowState(sessionId, flow);
  }
  if (flow) {
    if (projectRoot) flow.projectRoot = projectRoot;
    updateFlowFromMessage(flow, message, history);
    if (flow.phase !== 'wizard') flow.phase = 'inquiry';
    setFlowState(sessionId, flow);
  }
  return flow;
}

function buildAppearanceInquiryAppendix(flow) {
  const missing = [];
  if (!flow.strategy) missing.push('改造方式（改现有 / 另建单位 / 仅改数据）');
  if (flow.strategy !== 'data_only' && needsFireModeChoice(flow.rawMessage || flow.topic || '')) {
    if (!flow.fireMode) missing.push('多管开火方式（齐射 / 两组交替 / 轮流）');
  }
  if (flow.strategy !== 'data_only' && !flow.prefillModelPath && flow.modelAvailability !== 'has' && flow.modelAvailability !== 'none') {
    missing.push('是否有现成 W3X 模型（或说明需自制）');
  }
  const checklist =
    missing.length > 0
      ? `【当前仍缺】${missing.join('；')}`
      : '【当前】追问项已基本齐全；请用文字总结方案，并提示用户回复「开始素材向导」进入按钮确认（勿在本轮弹出按钮、勿 createUnit/write）。';

  return `

## 外观/换模型 — 当前处于「对话追问」阶段（尚未进入按钮向导）
- 你必须**先用自然语言**向用户追问：项目内目标单位、改造方式、开火逻辑、模型素材、哪些项可沿用原版（音效/武器/属性/技能/FX/UI 等）。
- **禁止**在本阶段调用 createUnit / writeProjectFile 改 Draw 模型；**禁止**替用户假定已确认的方案。
- 原版天启 unitId = **SovietAntiVehicleVehicleTech3**（勿写 SovietSuperTank）。
- ${checklist}
- 信息齐后，结尾明确写：「请回复 **开始素材向导** 或点击「开始素材确认向导」，再进入按钮逐步确认沿用原版与文件。」
`;
}

function inferDisplayNameFromMessage(message, fallback = '自定义单位') {
  const m = String(message || '');
  if (/天启|Apocalypse/i.test(m)) return '四管天启坦克';
  if (/守护者|Guardian/i.test(m)) return '自定义守护者';
  if (/铁锤|Hammer/i.test(m)) return '自定义铁锤';
  const named = m.match(/(?:叫|名为|叫做)\s*[「""]?([^」""\n，。]+)[」""]?/);
  if (named?.[1]) return named[1].trim();
  return fallback;
}

async function sendChoiceStep(senderWin, payload) {
  sendAssetWizardStep(senderWin, { ...payload, immediate: true });
  const slotId = payload.slotId || payload.kind;
  return waitForAssetStep(payload.flowId, slotId);
}

async function askVanillaReuseBulk(senderWin, flow, onProgress) {
  const step = await sendChoiceStep(senderWin, {
    flowId: flow.flowId,
    sessionId: flow.sessionId,
    kind: 'choice',
    slotId: 'vanilla_bulk',
    title: '是否全部沿用原版素材？',
    description:
      '若选「全部沿用」，将直接基于原版 SageXml 蓝本改 XML（适合只改血量/造价等）。若选「逐项确认」，将对语音、武器、特效、技能等逐项询问；你标记为「不沿用」的项，稍后会要求你提供对应文件。',
    options: [
      { id: 'all_yes', label: '全部沿用原版' },
      { id: 'each', label: '逐项确认（推荐换模型）' },
      { id: 'all_no', label: '全部自备素材' },
    ],
  });
  if (step.cancelled || step.action === 'cancel_flow') return { cancelled: true };
  const choice = step.choiceId || step.action;
  if (choice === 'all_yes') {
    flow.vanillaPolicy = Object.fromEntries(VANILLA_REUSE_CATEGORIES.map((c) => [c.id, true]));
    onProgress('   ✓ 已确认：**全部沿用原版**（模型/动画/贴图除外，按你提供的 W3X 处理）');
    return { ok: true };
  }
  if (choice === 'all_no') {
    flow.vanillaPolicy = Object.fromEntries(VANILLA_REUSE_CATEGORIES.map((c) => [c.id, false]));
    onProgress('   ✓ 已确认：**全部自备**（稍后逐步收集文件）');
    return { ok: true };
  }
  for (const cat of VANILLA_REUSE_CATEGORIES) {
    const res = await sendChoiceStep(senderWin, {
      flowId: flow.flowId,
      sessionId: flow.sessionId,
      kind: 'choice',
      slotId: `vanilla_${cat.id}`,
      title: `${cat.label} — 是否沿用原版？`,
      description: cat.hint,
      options: [
        { id: 'yes', label: '沿用原版' },
        { id: 'no', label: '不沿用（稍后提供）' },
      ],
    });
    if (res.cancelled || res.action === 'cancel_flow') return { cancelled: true };
    flow.vanillaPolicy[cat.id] = res.choiceId === 'yes' || res.action === 'yes';
    onProgress(`   · ${cat.label}：${flow.vanillaPolicy[cat.id] ? '沿用原版' : '自备'}`);
  }
  return { ok: true };
}

function buildAssetSlotsForKind(kind, templateUnit) {
  const base = buildSlotList('custom', templateUnit);
  if (kind === 'structure') {
    return base.filter((s) => s.id !== 'animations');
  }
  if (kind === 'vehicle' || kind === 'aircraft') {
    return [...base, ...VEHICLE_EXTRA_SLOTS];
  }
  return base;
}

async function collectCustomAssets(senderWin, flow, onProgress) {
  flow.kind = flow.kind || detectKind(flow.rawMessage, flow.templateUnit, flow.displayName);
  const slots = buildAssetSlotsForKind(flow.kind, flow.templateUnit);
  const msg = flow.rawMessage || '';
  flow.assets = flow.assets || {};

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    const mustProvide =
      slot.id === 'model' ||
      (flow.vanillaPolicy && flow.vanillaPolicy[slot.id] === false);
    const prefillPaths = extractPathsFromMessage(msg, slot.extensions);
    let prefillPath = prefillPaths[0] || '';
    if (slot.id === 'model' && flow.prefillModelPath) prefillPath = flow.prefillModelPath;

    if (slot.id === 'model' && prefillPath && fs.existsSync(prefillPath)) {
      const copied = copyAssetIntoProject(flow.projectRoot, flow.unitId || 'PendingUnit', slot.id, prefillPath, {
        displayName: flow.displayName,
        folderSide: flow.folderSide,
        userHint: msg,
      });
      flow.assets[slot.id] = copied.success
        ? { sourcePath: prefillPath, projectRel: copied.rel, artRef: copied.artRef }
        : { sourcePath: prefillPath, error: copied.error };
      onProgress(
        copied.success
          ? `   ✓ 已使用你提供的模型：\`${path.basename(prefillPath)}\``
          : `   ❌ 模型复制失败：${copied.error}`
      );
      continue;
    }

    onProgress(`📎 素材 ${i + 1}/${slots.length}：**${slot.label}**`);

    sendAssetWizardStep(senderWin, {
      flowId: flow.flowId,
      sessionId: flow.sessionId,
      kind: 'slot',
      slot,
      slotId: slot.id,
      stepIndex: i,
      totalSteps: slots.length,
      prefillPath,
      title: `素材 ${i + 1}/${slots.length}：${slot.label}`,
      description: slot.description,
      vanillaHint: mustProvide
        ? '此项需提供文件（或已在消息中给出路径）'
        : slot.vanillaHint || '可跳过',
      required: !!slot.required || mustProvide,
      extensions: slot.extensions,
      multiple: !!slot.multiple,
      immediate: true,
    });

    const res = await waitForAssetStep(flow.flowId, slot.id);
    if (res.cancelled || res.action === 'cancel_flow') {
      cancelFlow(flow.flowId);
      return { cancelled: true };
    }
    if (res.action === 'skip') {
      if (slot.required || mustProvide) {
        onProgress(`   ⚠️ ${slot.label} 标记为跳过但未提供文件`);
        flow.assets[slot.id] = { skipped: true, required: true, missing: true };
      } else {
        flow.assets[slot.id] = { skipped: true };
        onProgress(`   ○ 已跳过：${slot.label}`);
      }
      continue;
    }

    const paths = res.filePaths || (res.filePath || prefillPath ? [res.filePath || prefillPath] : []);
    if (!paths.length) {
      flow.assets[slot.id] = { skipped: true, missing: mustProvide };
      continue;
    }
    if (slot.multiple) {
      flow.assets[slot.id] = { paths, files: paths.map((p) => ({ sourcePath: p })) };
      onProgress(`   ✓ 已登记 ${paths.length} 个文件`);
    } else {
      const copied = copyAssetIntoProject(flow.projectRoot, flow.unitId, slot.id, paths[0], {
        displayName: flow.displayName,
        folderSide: flow.folderSide,
        userHint: msg,
      });
      flow.assets[slot.id] = copied.success
        ? { sourcePath: paths[0], projectRel: copied.rel, artRef: copied.artRef }
        : { sourcePath: paths[0], error: copied.error };
      onProgress(
        copied.success
          ? `   ✓ ${slot.label} → \`${path.basename(paths[0])}\``
          : `   ❌ 复制失败：${copied.error}`
      );
    }
  }
  return { ok: true };
}

/**
 * 运行外观改造向导（阻塞直至完成或取消）
 */
async function runAppearanceModWizard(options = {}) {
  const {
    message,
    sessionId = null,
    senderWin = null,
    onProgress = () => {},
    history = [],
    templateUnit = 'SovietAntiVehicleVehicleTech3',
    projectRoot,
  } = options;

  if (!projectRoot) {
    return { success: false, error: '未打开 MOD 项目' };
  }

  let flow = ensureInquiryState(sessionId, message, history, projectRoot);
  if (!flow) {
    return { success: false, error: '无法初始化外观改造会话' };
  }
  flow.phase = 'wizard';
  updateFlowFromMessage(flow, message, history);
  if (!flow.templateUnit) {
    flow.templateUnit = /天启|Apocalypse/i.test(flow.rawMessage) ? 'SovietAntiVehicleVehicleTech3' : templateUnit;
  }
  setFlowState(sessionId, flow);

  if (!isAppearancePrerequisitesMet(flow, message, history)) {
    flow.phase = 'inquiry';
    setFlowState(sessionId, flow);
    return {
      success: false,
      needInquiry: true,
      error: '对话追问尚未完成。请先回答改造方式、开火方式、模型素材等问题，再回复「开始素材向导」。',
    };
  }

  onProgress('📋 **素材确认（按钮向导）** — 沿用原版与文件路径请在下方逐项点击确认。');

  if (!flow.strategy) {
    return { success: false, needInquiry: true, error: '缺少改造方式，请先在对话中说明。' };
  }

  if (flow.strategy === 'data_only') {
    clearFlowState(sessionId);
    return {
      success: true,
      done: true,
      mode: 'data_only',
      message: '已记录为仅数据改造；可在对话中说明要改的属性，无需新 W3X。',
      flow,
    };
  }

  const simple = isSimpleStatOnlyIntent(message) && !flow.prefillModelPath;
  if (!flow.vanillaPolicyDone) {
    onProgress(simple ? '③ 简单属性修改：确认是否沿用原版素材' : '③ 确认哪些项沿用原版');
    const vr = await askVanillaReuseBulk(senderWin, flow, onProgress);
    if (vr.cancelled) {
      clearFlowState(sessionId);
      return { success: false, cancelled: true };
    }
    flow.vanillaPolicyDone = true;
    setFlowState(sessionId, flow);
  }

  const needCustomModel =
    !!flow.prefillModelPath ||
    flow.strategy === 'new_unit' ||
    flow.vanillaPolicy?.model === false ||
    !simple;

  if (needCustomModel && !flow.assetsDone) {
    if (!flow.unitId) {
      flow.unitId = /天启|Apocalypse/i.test(flow.displayName)
        ? 'QuadApocalypseTank'
        : `Custom${Date.now().toString(36).slice(-6)}`;
    }
    flow.kind = detectKind(flow.rawMessage, flow.templateUnit, flow.displayName);
    onProgress('④ 请逐步提供模型/动画/贴图等文件（每项单独确认）');
    const ar = await collectCustomAssets(senderWin, flow, onProgress);
    if (ar.cancelled) {
      clearFlowState(sessionId);
      return { success: false, cancelled: true };
    }
    flow.assetsDone = true;
    setFlowState(sessionId, flow);
  }

  const unitId =
    flow.unitId ||
    (flow.displayName.includes('天启') ? 'QuadApocalypseTank' : `Custom${Date.now().toString(36).slice(-6)}`);

  clearFlowState(sessionId);

  return {
    success: true,
    done: true,
    readyForCreate: flow.strategy === 'new_unit' || flow.strategy === 'modify_existing',
    createReq: {
      displayName: flow.displayName,
      unitId,
      rawMessage: flow.rawMessage,
      templateUnit: flow.templateUnit,
      fireMode: flow.fireMode,
      strategy: flow.strategy,
      vanillaPolicy: flow.vanillaPolicy,
      customAssets: flow.assets,
      prefillModelPath: flow.prefillModelPath,
    },
    flow,
  };
}

/** @deprecated 请用 isAppearanceInquiryActive / shouldRunAppearanceWizard */
function shouldHandleAsAppearanceFlow(message, sessionId, history = []) {
  return isAppearanceInquiryActive(sessionId, message, history) || shouldRunAppearanceWizard(message, sessionId, history);
}

/** 简单属性修改：一步确认是否全部沿用原版素材 */
async function runSimpleStatReuseConfirm(senderWin, sessionId) {
  const flowId = generateFlowId();
  const step = await sendChoiceStep(senderWin, {
    flowId,
    sessionId,
    kind: 'choice',
    slotId: 'simple_stat_reuse',
    title: '简单属性修改',
    description:
      '仅改血量/造价/速度等数值时，通常可全部沿用原版模型、动画、音效与 UI。若选「不沿用」，请说明要更换哪些素材。',
    options: [
      { id: 'all_yes', label: '全部沿用原版素材' },
      { id: 'all_no', label: '不沿用（需自备素材）' },
    ],
  });
  if (step.cancelled || step.action === 'cancel_flow') return { cancelled: true };
  return { reuseAll: step.choiceId === 'all_yes' || step.action === 'all_yes' };
}

module.exports = {
  isAppearanceModIntent,
  isSimpleStatOnlyIntent,
  isAppearanceInquiryActive,
  shouldRunAppearanceWizard,
  isAppearancePrerequisitesMet,
  shouldHandleAsAppearanceFlow,
  ensureInquiryState,
  buildAppearanceInquiryAppendix,
  updateFlowFromMessage,
  getFlowState,
  setFlowState,
  clearFlowState,
  runAppearanceModWizard,
  runSimpleStatReuseConfirm,
  VANILLA_REUSE_CATEGORIES,
};
