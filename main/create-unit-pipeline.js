// main/create-unit-pipeline.js —— 新建单位：知识库 → 项目 → 多角度联网总结 → IDE 流式写入 → Mod.xml 注册

const { runIntelligentSearch } = require('./intelligent-search');
const { callLLM } = require('./agent-planner');
const { inferUnitKind } = require('./unit-kind');

const UNIT_ALIASES = {
  维和步兵: ['AlliedAntiInfantryInfantry'],
  维和: ['AlliedAntiInfantryInfantry'],
  守护者: ['AlliedAntiVehicleVehicleTech1'],
  守护者坦克: ['AlliedAntiVehicleVehicleTech1'],
  盟军坦克: ['AlliedAntiVehicleVehicleTech1'],
  征召兵: ['SovietAntiInfantryInfantry'],
  动员兵: ['SovietAntiInfantryInfantry'],
  磁暴步兵: ['SovietHeavyAntiVehicleInfantry'],
  磁暴: ['SovietHeavyAntiVehicleInfantry'],
  超级磁暴步兵: ['SovietHeavyAntiVehicleInfantry'],
  铁锤: ['SovietAntiVehicleVehicleTech1'],
  铁锤坦克: ['SovietAntiVehicleVehicleTech1'],
  苏联坦克: ['SovietAntiVehicleVehicleTech1'],
  幻影坦克: ['AlliedAntiVehicleVehicleTech3'],
  幻影: ['AlliedAntiVehicleVehicleTech3'],
  超级幻影坦克: ['AlliedAntiVehicleVehicleTech3'],
  超级幻影: ['AlliedAntiVehicleVehicleTech3'],
  帝国武士: ['JapanAntiInfantryInfantry'],
  海啸: ['JapanAntiVehicleVehicleTech1'],
  海啸坦克: ['JapanAntiVehicleVehicleTech1'],
  僵尸: ['SovietAntiInfantryInfantry'],
  普通僵尸: ['SovietAntiInfantryInfantry'],
  天狗: ['JapanAntiInfantryVehicle'],
  战熊: ['SovietScoutInfantry'],
  熊: ['SovietScoutInfantry'],
  警犬: ['AlliedScoutInfantry'],
  狗: ['AlliedScoutInfantry'],
  多功能: ['AlliedAntiAirVehicleTech1'],
  多功能步兵车: ['AlliedAntiAirVehicleTech1'],
  IFV: ['AlliedAntiAirVehicleTech1'],
  恐怖机械人: ['SovietScoutVehicle'],
  恐怖机器人: ['SovietScoutVehicle'],
  标枪: ['AlliedAntiVehicleInfantry'],
  标枪兵: ['AlliedAntiVehicleInfantry'],
  坦克: ['AlliedAntiVehicleVehicleTech1'],
  天启: ['SovietAntiVehicleVehicleTech3'],
  mytank: ['AlliedAntiVehicleVehicleTech1'],
};

function parseCreateUnitRequest(message) {
  if (/(删|删掉|删除|移除|清除|去掉|清理)/.test(message) && !/(新建|创建)/.test(message)) {
    return null;
  }
  if (!/(新建|创建|做|制作|加).{0,16}(单位|步兵|坦克|僵尸)|单位.{0,12}(叫|名为|是|，)/.test(message)) {
    return null;
  }

  const patterns = [
    // 新建一个叫超级磁暴步兵的单位
    /(?:新建|创建|做|制作)(?:一个|个)?\s*(?:叫|名为|叫做)\s*[「""]?([^」""\n，。]+?)[」""]?\s*(?:的)?\s*单位/,
    // 单位叫XXX / 单位，苏军超级磁暴步兵
    /单位[，,]?\s*(?:叫|名为|叫做)\s*[「""]?([^」""\n，。]+)[」""]?/,
    /单位[，,]\s*[「""]?([^」""\n，。]+)[」""]?/,
    // 帮我新建苏军超级磁暴步兵（可无「单位」二字）
    /(?:帮我)?(?:新建|创建|做|制作)(?:一个|个)?\s*(?:(?:苏军|盟军|日本|苏联|帝国)(?:阵营)?(?:的)?\s*)?((?:超级)?[^\s，,。叫]{2,}(?:步兵|坦克|僵尸)?)/,
    /(?:新建|创建)[「""]?([^」""\n，。叫]+)[」""]?(?:这个)?单位/,
    /现在要(?:新建|创建)\s*(?:一个)?\s*([^\s，,。\n]+?)\s*(?:单位)?/,
    /(?:新建|创建|做|制作)(?:一个|个)?\s*(?:普通|超级)?\s*([^，,。\n叫]{2,}?)\s*(?:的)?\s*(?:单位|步兵|坦克|僵尸)/,
  ];

  for (const re of patterns) {
    const m = message.match(re);
    if (m && m[1]) {
      let displayName = m[1].trim();
      if (/^(一个|个|普通|超级|叫|名为|叫做)$/.test(displayName)) continue;
      if (displayName.length < 2) continue;
      return finalizeCreateReq(displayName, message);
    }
  }

  const isType = message.match(/(?:是普通|叫做|名为|是)\s*([^\s，,。\n]+)/);
  if (isType && isType[1]) {
    return finalizeCreateReq(isType[1].trim(), message);
  }

  return null;
}

/** 解析失败时给用户的固定说明（不走闲聊 LLM，避免「深度思考懂了却答未识别」） */
function formatCreateUnitParseFailure(message) {
  const hint =
    '未能从这句话里提取**单位中文名**。请用例如：\n' +
    '• 「新建一个叫超级磁暴步兵的单位」\n' +
    '• 「新建一个单位，苏军超级磁暴步兵」\n' +
    '• 「帮我新建苏军超级磁暴步兵」';
  if (message && message.trim()) {
    return `⚠️ ${hint}\n\n（您刚才说的是：${message.trim().slice(0, 80)}${message.length > 80 ? '…' : ''}）`;
  }
  return `⚠️ ${hint}`;
}

function finalizeCreateReq(displayName, message) {
  displayName = displayName
    .replace(/^(一个|个|叫|名为|叫做)\s*/, '')
    .replace(/^(盟军|苏联|日本|帝国|苏军)(阵营)?(的)?\s*/i, '')
    .replace(/(?:的)?\s*单位$/, '')
    .replace(/^(的|叫)+/, '')
    .trim();
  if (/^僵尸/.test(displayName) || /僵尸/.test(message)) {
    if (!/僵尸/.test(displayName)) displayName = '僵尸';
  }
  return {
    displayName,
    unitId: null,
    rawMessage: message,
  };
}

function yieldMain() {
  return new Promise((resolve) => setImmediate(resolve));
}

/** 按中文别名直接选模板 ID，避免全项目 walk */
function pickTemplateFromAliases(displayName) {
  const keys = Object.keys(UNIT_ALIASES).sort((a, b) => b.length - a.length);
  for (const alias of keys) {
    if (displayName.includes(alias)) return UNIT_ALIASES[alias][0];
  }
  return null;
}

function collectSearchKeywords(displayName) {
  const keys = new Set([displayName]);
  if (displayName.includes('超级')) keys.add(displayName.replace(/超级/g, ''));
  for (const [alias, ids] of Object.entries(UNIT_ALIASES)) {
    if (displayName.includes(alias)) {
      keys.add(alias);
      ids.forEach((id) => keys.add(id));
    }
  }
  return Array.from(keys);
}

function pickTemplateFromResults(searchResults) {
  for (const r of searchResults) {
    if (!r.success || !r.data) continue;
    for (const entry of r.data) {
      if (entry.unitIds && entry.unitIds.length > 0) return entry.unitIds[0];
    }
  }
  return null;
}

/** 根据联网总结 + 名称推断模板单位 ID */
async function inferTemplateFromResearch(displayName, researchText) {
  for (const [alias, ids] of Object.entries(UNIT_ALIASES)) {
    if (displayName.includes(alias)) return ids[0];
  }
  if (/动员|征召|苏军|苏联/.test(displayName)) return 'SovietAntiInfantryInfantry';
  if (/帝国|日本/.test(displayName)) return 'JapanAntiInfantryInfantry';
  if (/僵尸/.test(displayName)) return 'SovietAntiInfantryInfantry';

  if (!researchText) return 'AlliedAntiInfantryInfantry';

  try {
    const raw = await callLLM(
      [
        {
          role: 'system',
          content:
            '你是 RA3 MOD 专家。根据资料为用户新建单位选一个现有 XML 模板单位 ID（如 AlliedAntiInfantryInfantry）。只回复 JSON：{"templateUnit":"ID","side":"Allied|Soviet|Japan","reason":"一句中文"}',
        },
        {
          role: 'user',
          content: `单位名称：${displayName}\n资料摘要：${researchText.substring(0, 1500)}`,
        },
      ],
      { maxTokens: 200, temperature: 0.2 }
    );
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const j = JSON.parse(cleaned);
    if (j.templateUnit) return j.templateUnit;
  } catch (e) {}

  return 'AlliedAntiInfantryInfantry';
}

async function executeCreateUnitPipeline(req, { tools, onProgress, sessionId = null, senderWin = null }) {
  let { displayName, unitId, rawMessage } = req;
  const steps = [];
  const progress = (msg) => onProgress(msg);

  progress(`🏗️ 开始创建单位「${displayName}」…`);
  const { getSdkRoot, getSageXmlRoot, findVanillaUnitXmlPath } = require('./vanilla-unit-loader');
  const sdkRoot = getSdkRoot();
  const sageRoot = getSageXmlRoot();
  if (sdkRoot && sageRoot) {
    progress(`   ✓ SDK SageXml：\`${sageRoot}\``);
  } else if (!sdkRoot) {
    progress('   ⚠ 未配置 SDK 路径：模板将仅能在 MOD 项目内查找（首选项 → RA3 MOD SDK）');
  }
  await yieldMain();

  const { resolveUnitIdFromDisplayName, isReasonableUnitId } = require('./unit-id-naming');
  if (!unitId || /^CustomUnit[0-9a-f]+$/i.test(unitId) || !isReasonableUnitId(unitId)) {
    progress('🏷️ 按标准 MOD 规范生成**英文**单位 ID（中文名→规则翻译，参考项目样本）…');
    await yieldMain();
    unitId = await resolveUnitIdFromDisplayName(displayName, rawMessage);
    if (!isReasonableUnitId(unitId)) {
      return {
        success: false,
        error: `无法生成合法单位 ID（当前：${unitId || '空'}）。请补充阵营/T 级描述，或说明英文 ID（如 SovietSuperTeslaInfantryTech3）。`,
        steps,
      };
    }
    progress(`   ✓ 单位 ID：**${unitId}**（显示名「${displayName}」仅写入注释）`);
  }

  progress('📚 步骤1/7：检索本地知识库…');
  await yieldMain();
  try {
    const { searchSimilarForContext } = require('./knowledge-base');
    const kbHits = await searchSimilarForContext(
      `标准MOD格式 Insurrection 创建单位 ${displayName} ${rawMessage || ''}`,
      'create_unit_kb',
      rawMessage || displayName
    );
    if (kbHits.length > 0) {
      progress(`   ✓ 知识库 ${kbHits.length} 条`);
    } else {
      progress('   ○ 知识库无现成案例');
    }
  } catch (e) {
    progress(`   ⚠ ${e.message}`);
  }

  progress('📂 步骤2/7：在 MOD 项目中搜索可复制的模板…');
  await yieldMain();
  let templateUnit =
    req.templateUnit ||
    (req.templateHint ? pickTemplateFromAliases(req.templateHint) : null) ||
    pickTemplateFromAliases(displayName) ||
    null;
  if (templateUnit) {
    progress(`   ✓ 别名映射模板: ${templateUnit}`);
  }
  const fromAlias = !!templateUnit && !req.templateUnit && pickTemplateFromAliases(displayName) === templateUnit;
  if (fromAlias) {
    const vanillaHit = findVanillaUnitXmlPath(templateUnit);
    if (vanillaHit) {
      progress(`   ✓ 原版模板：\`${templateUnit}\`（${vanillaHit.rel}）`);
    } else {
      progress(`   ✓ 别名模板 ${templateUnit}（创建时从 SageXml 克隆）`);
    }
  } else if (templateUnit) {
    await yieldMain();
    const check = await tools.getUnitFullXml({ unitId: templateUnit });
    if (check.success) progress(`   ✓ 项目内已有模板 XML`);
    else progress(`   ○ 项目内暂无 ${templateUnit}，将用原版 ID 作继承参考`);
  }
  if (!templateUnit) for (const kw of collectSearchKeywords(displayName)) {
    await yieldMain();
    const res = await tools.findUnitsByName({ keyword: kw });
    if (res.success && res.data && res.data.length > 0) {
      templateUnit = pickTemplateFromResults([res]);
      if (templateUnit) {
        progress(`   ✓ 项目内模板: ${templateUnit}`);
        break;
      }
    }
  }

  let researchSummary = '';
  if (!templateUnit || /僵尸|Remix|remix/i.test(rawMessage || displayName)) {
    progress('🌐 步骤3/7：多角度联网检索并智能总结（非粘贴网页）…');
    const searchQ = `红色警戒3 MOD 新建单位 ${displayName} XML GameObject inheritFrom LogicCommand Mod.xml`;
    const intel = await runIntelligentSearch(searchQ, tools, (m) => progress(`   ${m.replace(/^🌐|^🔍|^📚|^🧠/, '').trim()}`));
    if (intel.success) {
      researchSummary = intel.answer;
      progress('📖 调研结论（摘要）：\n' + intel.answer.split('\n').slice(0, 12).join('\n') + '\n…');
      templateUnit = await inferTemplateFromResearch(displayName, intel.answer);
      progress(`   → 建议模板: ${templateUnit}`);
    }
  } else {
    progress('   （已有模板，跳过联网调研）');
  }

  const { resolveNewUnitPath } = require('./unit-xml-builder');
  const { getCurrentFolder } = require('./project-state');
  const root = getCurrentFolder();
  const previewPath = resolveNewUnitPath(
    unitId,
    /帝国|日本|Japan/.test(displayName) ? 'Japan' : /盟军|Allied|维和/.test(displayName) ? 'Allied' : 'Soviet',
    root
  );
  progress(`📝 步骤4/7：新建 \`${previewPath}\` 并在编辑器中逐字写入…`);
  let tplForCreate = templateUnit;
  if (tplForCreate && !fromAlias) {
    await yieldMain();
    const tplCheck = await tools.getUnitFullXml({ unitId: tplForCreate });
    if (!tplCheck.success) {
      progress(`   ○ 项目无 ${tplForCreate}，使用内置步兵骨架`);
      tplForCreate = null;
    }
  } else if (tplForCreate && fromAlias) {
    progress(`   ✓ 继承模板 ID：${tplForCreate}（无需全项目检索）`);
  }

  const chatSessions = sessionId ? require('./agent-chat-sessions') : null;
  const session =
    sessionId && chatSessions?.getSessionForTools
      ? chatSessions.getSessionForTools(sessionId)
      : null;

  const { parseCreateUnitSpec } = require('./create-unit-spec');
  const folderSide =
    /帝国|日本|Japan/.test(displayName) ? 'Japan' : /盟军|Allied|维和/.test(displayName) ? 'Allied' : 'Soviet';
  const unitSpec = parseCreateUnitSpec(rawMessage, { displayName, side: folderSide });
  if (unitSpec.buildCost != null || unitSpec.maxHealth != null || unitSpec.speed != null) {
    const parts = [];
    if (unitSpec.buildCost != null) parts.push(`造价 ${unitSpec.buildCost}`);
    if (unitSpec.maxHealth != null) parts.push(`血量 ${unitSpec.maxHealth}`);
    if (unitSpec.speed != null) parts.push(`移速 ${unitSpec.speed}`);
    progress(`   ✓ 解析属性：${parts.join('，')}`);
  }
  if (unitSpec.buildPrereq) {
    progress(`   ✓ 建造前提：${unitSpec.buildPrereq.label}（${unitSpec.buildPrereq.requiredObject}）`);
  }

  const {
    classifyCreationMode,
    runUnitAssetWizard,
  } = require('./unit-asset-wizard');
  const creationMode = classifyCreationMode(
    { displayName, rawMessage },
    tplForCreate
  );
  let customAssets = req.customAssets || null;

  if (!customAssets && (creationMode === 'custom' || creationMode === 'hybrid')) {
    const wizardRes = await runUnitAssetWizard({
      req: { displayName, unitId, rawMessage },
      unitId,
      templateUnit: tplForCreate,
      mode: creationMode,
      sessionId,
      senderWin: senderWin || null,
      onProgress: progress,
      folderSide,
      kind: inferUnitKind({ displayName, templateUnit: tplForCreate, rawMessage }),
      rawMessage,
    });
    if (!wizardRes.success) {
      return {
        success: false,
        error: wizardRes.cancelled ? '已取消素材选择' : wizardRes.error || '素材向导未完成',
        steps,
      };
    }
    customAssets = wizardRes.assets;
  } else if (tplForCreate) {
    progress(`ℹ️ 简单改造：将继承模板 **${tplForCreate}** 的模型与音效。`);
  }

  progress('📐 步骤4b：对照 SDK XSD 核对 GameObject 结构（仅读 SDK，不扫 MOD）…');
  await yieldMain();
  const unitKind = inferUnitKind({ displayName, templateUnit: tplForCreate, rawMessage });
  try {
    const { prefetchXsdForUnitCreate } = require('./xsd-unit-prefetch');
    await prefetchXsdForUnitCreate(
      { templateUnit: tplForCreate, kind: unitKind, unitId, displayName },
      { onProgress: progress }
    );
  } catch (e) {
    progress(`   ⚠ XSD 预检: ${e.message}`);
  }
  await yieldMain();

  const createRes = await tools.createUnitStreaming(
    {
      unitId,
      templateUnit: tplForCreate,
      displayName,
      description: displayName,
      rawMessage,
      unitSpec,
      customAssets,
      creationMode,
    },
    { onProgress: progress, chunkSize: 8, delayMs: 30, session }
  );

  if (!createRes.success) {
    progress(`❌ 创建失败: ${createRes.error}`);
    return { success: false, error: createRes.error, steps };
  }

  const file = createRes.data.file;
  progress(`   ✓ 单位 XML 已保存: ${file}`);

  progress('📋 步骤5–6/7：注册 Mod.xml、兵营队列与 LogicCommand…');
  const { finalizeUnitAfterCreate } = require('./create-unit-post');
  const post = await finalizeUnitAfterCreate(
    { ...createRes.data, file, files: createRes.data.files },
    {
      unitId,
      templateUnit: tplForCreate,
      displayName,
      rawMessage,
      unitSpec,
      customAssets,
      creationMode,
    },
    { onProgress: progress, notifyTreeRefresh: (rel) => tools.notifyTreeRefresh?.(rel) }
  );
  for (const line of post.log || []) progress(`   ${line}`);

  progress(
    '✅ 步骤7/7：单位创建流程完成。请检查：\n' +
      `1. 兵营 **${unitSpec.barracksCommandSetId}** 含 Command_Construct${unitId}\n` +
      (unitSpec.buildPrereq ? `2. 建造需 ${unitSpec.buildPrereq.label}\n` : '') +
      '3. 在 SDK 中编译 MOD\n' +
      '详见 knowledge-docs/standard-mod-format-reference.md'
  );
  if (researchSummary) {
    progress('\n---\n💡 参考调研摘要：\n' + researchSummary.substring(0, 1200) + (researchSummary.length > 1200 ? '\n…' : ''));
  }

  return {
    success: true,
    data: { unitId, templateUnit: tplForCreate || templateUnit, displayName, file },
    steps,
  };
}

module.exports = {
  parseCreateUnitRequest,
  finalizeCreateReq,
  formatCreateUnitParseFailure,
  executeCreateUnitPipeline,
  UNIT_ALIASES,
};
