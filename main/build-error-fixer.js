// main/build-error-fixer.js —— AI 可执行的编译错误诊断与修复（知识库 + 可选联网 + 实际写文件）

const fs = require('fs');
const path = require('path');
const { callLLM } = require('./agent-planner');
const { getCurrentFolder } = require('./project-state');
const {
  assessModXml,
  repairModXml,
  findAlternateModXmlLocations,
  collectDataXmlIncludes,
} = require('./mod-xml-repair');
const { parseBaeErrors, repairProjectUnits } = require('./unit-xml-repair');
const {
  analyzeCompileHealth,
  inferRootCauseFromErrorText,
  formatRootCauseSection,
} = require('./project-health-check');

function normalizeErrorText(text) {
  return String(text || '').trim();
}

function diagnoseProject(projectRoot, errorText = '') {
  const root = projectRoot.replace(/\\/g, '/');
  const modState = assessModXml(root);
  const altMods = findAlternateModXmlLocations(root);
  const includes = collectDataXmlIncludes(root);
  const err = normalizeErrorText(errorText);

  const issues = [];
  if (modState.status !== 'ok') {
    issues.push({
      code: 'MOD_XML_' + modState.status.toUpperCase(),
      message: modState.hint || `Mod.xml 状态: ${modState.status}`,
      autoFixable: true,
    });
  }
  if (altMods.length > 0 && modState.status !== 'ok') {
    issues.push({
      code: 'MOD_XML_WRONG_FOLDER',
      message: `在子目录发现 Mod.xml：${altMods.join(', ')}，但编译需要 data/Mod.xml`,
      autoFixable: true,
    });
  }
  if (includes.length === 0) {
    issues.push({
      code: 'NO_UNIT_XML',
      message: 'data 目录下没有可注册的单位/数据 XML',
      autoFixable: false,
    });
  }

  if (/缺少.*mod\.xml|missing.*mod\.xml/i.test(err) && modState.status === 'ok') {
    issues.push({
      code: 'REPORT_MISMATCH',
      message: '报错称缺少 mod.xml，但检测到文件存在；可能是空文件或路径大小写问题',
      autoFixable: modState.status !== 'ok',
    });
  }

  const baeEntries = parseBaeErrors(err);
  const baeErrors = baeEntries.filter((e) => e.level !== 'warning');
  const baeWarnings = baeEntries.filter((e) => e.level === 'warning');
  const { isCommandDataXmlError } = require('./command-data-repair');
  if (isCommandDataXmlError(err)) {
    issues.push({
      code: 'COMMAND_DATA_XML_FORMAT',
      message: 'CommandData.xml 格式错误（常见于 </AssetDeclaration> 之后仍有节点）',
      autoFixable: true,
    });
  }
  const baeAll = [...baeErrors, ...baeWarnings];
  for (const e of baeAll) {
    if (/Unknown asset\s+'SpecialPowerTemplate:/i.test(e.message)) {
      issues.push({
        code: 'SPECIAL_POWER_NOT_INCLUDED',
        message:
          'LogicCommand 引用了 SpecialPowerTemplate，但单位包装 XML 未 Include SpecialPowerTemplates.xml 或模板 xmlns/ID 有误',
        autoFixable: true,
      });
    }
  }
  for (const e of baeErrors) {
    if (/XmlFormattingError/i.test(e.message) && /commanddata/i.test(err)) {
      issues.push({
        code: 'COMMAND_DATA_XML_FORMAT',
        message: e.message,
        autoFixable: true,
      });
    }
    if (/has no id attribute/i.test(e.message)) {
      issues.push({
        code: 'UNIT_XML_INCLUDE',
        message: '单位 XML 的 Include 未放在 <Includes> 内，BinaryAssetBuilder 会报错',
        autoFixable: true,
      });
    }
    if (/unexpected WeaponSlot|Bad XML/i.test(e.message)) {
      issues.push({
        code: 'UNIT_XML_WEAPON',
        message: '单位 XML 武器节点格式不符合 SDK（应继承官方单位模板）',
        autoFixable: true,
      });
    }
    if (/未生成 mod\.manifest|mod\.manifest/i.test(err)) {
      issues.push({
        code: 'BUILD_NO_MANIFEST',
        message: '未生成 mod.manifest，通常是 data 下单位/命令 XML 编译失败',
        autoFixable: true,
      });
    }
  }

  return {
    projectRoot: root,
    modState,
    alternateModPaths: altMods,
    dataXmlCount: includes.length,
    dataXmlSamples: includes.slice(0, 12).map((i) => i.rel),
    baeErrorCount: baeErrors.length,
    baeWarningCount: baeWarnings.length,
    issues,
  };
}

async function searchKnowledgeForError(errorText, topN = 5) {
  const q = `红警3 MOD 编译错误 standard-mod-format Insurrection Include ${errorText.slice(0, 200)} mod.xml sdk-build`;
  try {
    const kb = require('./knowledge-base');
    await kb.initDatabase();
    const hits = await kb.searchSimilarForContext(q, 'build_error', errorText);
    if (hits && hits.length) {
      return hits
        .map((h, i) => `[${i + 1}] ${h.title || h.id}\n${(h.content || h.text || '').slice(0, 600)}`)
        .join('\n\n');
    }
  } catch (e) {
    console.warn('[build-error-fixer] 向量知识库不可用:', e.message);
  }
  try {
    const { searchOffline } = require('./search-engine');
    const offline = searchOffline(q, topN);
    if (offline.length) {
      return offline.map((h, i) => `[${i + 1}] ${h.title}\n${h.snippet}`).join('\n\n');
    }
  } catch (e) {}
  return '';
}

async function searchWebForError(errorText) {
  try {
    const { runIntelligentSearch } = require('./intelligent-search');
    const q = `红色警戒3 MOD 编译 ${errorText.slice(0, 120)} mod.xml BinaryAssetBuilder`;
    const intel = await runIntelligentSearch(q, null, () => {});
    if (intel.success && intel.answer) {
      return intel.answer.slice(0, 2500);
    }
  } catch (e) {
    console.warn('[build-error-fixer] 联网检索失败:', e.message);
  }
  return '';
}

/**
 * 规则化自动修复（不依赖 LLM）
 */
async function applyRuleBasedFixes(projectRoot, diagnosis, errorText, onProgress, session = null) {
  const { streamTextToFiles } = require('./stream-write');
  const { isCommandDataXmlError, repairCommandDataXml } = require('./command-data-repair');
  const log = [];
  const fixes = [];
  const pendingWrites = [];

  const cmdDataFormatIssue = diagnosis.issues.some((i) => i.code === 'COMMAND_DATA_XML_FORMAT');
  const cmdDataErr = isCommandDataXmlError(errorText) || cmdDataFormatIssue;

  if (cmdDataErr) {
    onProgress?.('🔧 正在修复 CommandData.xml 结构（移回 </AssetDeclaration> 内的孤儿节点）…');
    const cmdFix = repairCommandDataXml(projectRoot, { onProgress, deferWrite: true });
    if (cmdFix.log.length) log.push(...cmdFix.log);
    fixes.push(...cmdFix.fixes);
    if (cmdFix.pendingWrites?.length) pendingWrites.push(...cmdFix.pendingWrites);
  }

  const modBad = diagnosis.modState.status !== 'ok';
  const errSaysMod = /缺少.*mod\.xml|missing.*mod\.xml|MOD_XML/i.test(
    diagnosis.issues.map((i) => i.code).join(' ') + errorText
  );
  let modContentCorrupt = false;
  let modOrphanIncludes = false;
  try {
    const { findModXml, repairModXmlStructure } = require('./mod-register');
    const modFile = findModXml(projectRoot);
    if (modFile?.full) {
      const raw = fs.readFileSync(modFile.full, 'utf-8');
      if (/&quot;|source\s*=\s*["']\.xml|"\s*\.xml\s*"/i.test(raw)) modContentCorrupt = true;
      const closeIdx = raw.search(/<\/AssetDeclaration>/i);
      if (closeIdx >= 0 && /<Include\b/i.test(raw.slice(closeIdx + '</AssetDeclaration>'.length))) {
        modOrphanIncludes = true;
      }
    }
    if (modOrphanIncludes && modFile?.full) {
      onProgress?.('🔧 正在修复 Mod.xml 结构（移回 </AssetDeclaration> 外的 Include）…');
      const modStruct = repairModXmlStructure(projectRoot);
      if (modStruct.changed) {
        log.push(...(modStruct.log || []));
        fixes.push({ action: 'repairModXmlStructure', rel: modStruct.rel });
        pendingWrites.push({
          relativePath: modStruct.rel,
          content: fs.readFileSync(modFile.full, 'utf-8'),
        });
      }
    }
  } catch (e) {
    console.warn('[build-error-fixer] mod.xml check:', e.message);
  }

  const wantsStructureFix = /编译健康|结构风险|不规范|Include 未包|WeaponSlot|修复.*(项目|mod|xml)/i.test(
    errorText
  );

  if (modBad || errSaysMod || modContentCorrupt || wantsStructureFix) {
    onProgress?.('📝 正在生成 data/Mod.xml 并注册项目内 XML…');
    const repair = repairModXml(projectRoot, {
      modName: path.basename(projectRoot),
      deferWrite: true,
    });
    fixes.push({ action: 'repairModXml', result: repair });
    pendingWrites.push({ relativePath: repair.rel, content: repair.content });
    log.push(`已准备 ${repair.rel}，注册 ${repair.registeredCount} 个引用。`);
  }

  const hasUnitIssue = diagnosis.issues.some((i) =>
    /^UNIT_XML_|BUILD_NO_MANIFEST/.test(i.code)
  );
  const unitSpecificErr =
    /has no id attribute|unexpected WeaponSlot|Bad XML/i.test(errorText);
  const errImpliesUnit =
    unitSpecificErr ||
    (/未生成 mod\.manifest|sovietcustominfantry|\.manifest, file not found/i.test(errorText) &&
      !cmdDataErr);

  const shouldRepairUnits =
    (hasUnitIssue || errImpliesUnit || wantsStructureFix) && (unitSpecificErr || wantsStructureFix || !cmdDataErr);

  if (shouldRepairUnits) {
    onProgress?.('🔧 正在修复不合规的单位 XML（改为 SDK 可编译结构）…');
    const unitRepair = repairProjectUnits(projectRoot, errorText, onProgress, {
      preferStandardTemplate: true,
      deferWrite: true,
    });
    if (unitRepair.log.length) log.push(...unitRepair.log);
    fixes.push(...unitRepair.fixes);
    if (unitRepair.pendingWrites?.length) {
      pendingWrites.push(...unitRepair.pendingWrites);
    }
  }

  const {
    repairSpecialPowerWarnings,
    hasSpecialPowerUnknownAsset,
    findPollutedCommandSetFiles,
  } = require('./special-power-repair');
  const spIssue = diagnosis.issues.some((i) => i.code === 'SPECIAL_POWER_NOT_INCLUDED');
  if (spIssue || hasSpecialPowerUnknownAsset(errorText)) {
    const spFix = repairSpecialPowerWarnings(projectRoot, errorText, {
      deferWrite: true,
      onProgress,
    });
    if (spFix.log.length) log.push(...spFix.log);
    fixes.push(...spFix.fixes);
    if (spFix.pendingWrites?.length) pendingWrites.push(...spFix.pendingWrites);
  }

  for (const p of findPollutedCommandSetFiles(projectRoot)) {
    if (!log.some((l) => l.includes(p.rel))) {
      log.push(`⚠️ ${p.rel} 混入了 LogicCommand，应拆到 LogicCommand.xml`);
    }
  }

  if (pendingWrites.length) {
    await streamTextToFiles(pendingWrites, { onProgress, delayMs: 20 });
    log.push(`已写入 ${pendingWrites.length} 个文件。`);
  }

  return { fixes, log, changed: fixes.length > 0 || pendingWrites.length > 0 };
}

async function planExtraFixesWithLLM(errorText, diagnosis, knowledgeContext, webContext) {
  const system = `你是 RA3 MOD 编译修复专家。根据诊断与资料，输出**仅一个 JSON 对象**（不要 markdown）：
{
  "summary": "一句话说明根因",
  "actions": [
    { "type": "write_file", "relativePath": "data/xxx.xml", "content": "完整文件内容" },
    { "type": "note", "message": "需要用户手动处理的事项" }
  ]
}

规则：
- 若 Mod.xml 已通过工具修复，actions 可为空数组
- 不要编造不存在的文件路径；write_file 仅用于确实需要新建/覆盖的小文件
- content 必须是合法 RA3 XML（AssetDeclaration 或 GameObject）
- 禁止输出“请用户自己创建”而不给 write_file`;

  const user = `【编译报错原文】
${errorText}

【项目诊断】
${JSON.stringify(diagnosis, null, 2)}

【知识库】
${knowledgeContext || '（无）'}

【联网摘要】
${webContext || '（未检索）'}`;

  try {
    const raw = await callLLM(
      [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      { maxTokens: 2000, temperature: 0.15 }
    );
    let cleaned = raw.replace(/```json|```/gi, '').trim();
    const s = cleaned.indexOf('{');
    const e = cleaned.lastIndexOf('}');
    if (s >= 0 && e > s) cleaned = cleaned.slice(s, e + 1);
    return JSON.parse(cleaned.replace(/，/g, ','));
  } catch (e) {
    return { summary: 'LLM 规划跳过', actions: [], error: e.message };
  }
}

async function executeLlmActions(projectRoot, plan, onProgress) {
  const root = projectRoot.replace(/\\/g, '/');
  const results = [];
  const toStream = [];
  for (const action of plan.actions || []) {
    if (action.type === 'write_file' && action.relativePath && action.content) {
      toStream.push({
        relativePath: action.relativePath.replace(/\\/g, '/'),
        content: action.content,
      });
    } else if (action.type === 'note') {
      results.push({ action, success: true, note: action.message });
    }
  }
  if (toStream.length) {
    const { streamTextToFiles } = require('./stream-write');
    await streamTextToFiles(toStream, { onProgress, delayMs: 20 });
    for (const f of toStream) {
      const full = path.join(root, f.relativePath);
      results.push({ action: { type: 'write_file', relativePath: f.relativePath }, success: true, path: full });
    }
  }
  return results;
}

/**
 * @param {object} options
 * @param {string} options.errorText - 用户粘贴的 BuildLog/ErrorLog
 * @param {string} [options.projectPath]
 * @param {boolean} [options.allowWebSearch]
 * @param {(msg:string)=>void} [options.onProgress]
 */
async function executeBuildErrorFix(options = {}) {
  const errorText = normalizeErrorText(options.errorText);
  const projectPath = (options.projectPath || getCurrentFolder() || '').replace(/\\/g, '/');
  const onProgress = options.onProgress || (() => {});

  if (!projectPath) {
    return { success: false, error: '未打开 MOD 项目，无法修复。' };
  }
  if (!errorText) {
    return { success: false, error: '请粘贴编译报错或 ErrorLog 内容。' };
  }

  onProgress('🔍 正在诊断项目与编译错误…');
  const rootCauses = inferRootCauseFromErrorText(errorText);
  const diagnosis = diagnoseProject(projectPath, errorText);
  const compileHealth = analyzeCompileHealth(
    projectPath,
    require('./project-state').getProjectConventions()
  );

  onProgress('📚 正在检索知识库…');
  const knowledgeContext = await searchKnowledgeForError(errorText);

  let webContext = '';
  if (options.allowWebSearch !== false) {
    onProgress('🌐 正在联网检索相关解决方案（可选）…');
    webContext = await searchWebForError(errorText);
  }

  onProgress('🔧 正在应用自动修复（写入文件）…');
  let session = null;
  if (options.sessionId) {
    try {
      session = require('./agent-chat-sessions').getSessionForTools(
        options.sessionId,
        projectPath
      );
    } catch (e) {}
  }
  const ruleResult = await applyRuleBasedFixes(projectPath, diagnosis, errorText, onProgress, session);

  let llmPlan = { summary: '', actions: [] };
  if (ruleResult.changed) {
    const kinds = new Set(ruleResult.fixes.map((f) => f.action || f.result?.action));
    if (kinds.has('repairCommandDataXml')) {
      llmPlan.summary =
        '已修复 CommandData.xml：将 </AssetDeclaration> 之后的孤儿 LogicCommand 移回根节点内。请重新编译验证。';
    } else if (kinds.has('repairUnitXml')) {
      llmPlan.summary =
        '已修复单位 XML 结构（改为继承 SDK 官方单位模板），并更新 CommandData；若 Mod.xml 有改动也已同步。请重新编译验证。';
    } else {
      llmPlan.summary = '已通过规则修复项目文件；请重新 Ctrl+B 编译验证。';
    }
  } else {
    llmPlan = await planExtraFixesWithLLM(errorText, diagnosis, knowledgeContext, webContext);
    onProgress('🧠 正在执行补充修复步骤…');
    await executeLlmActions(projectPath, llmPlan, onProgress);
  }

  const after = diagnoseProject(projectPath, errorText);
  const modOk = after.modState.status === 'ok';
  const unitFixed = ruleResult.fixes.some((f) => f.action === 'repairUnitXml');
  const buildLikelyOk = modOk && (unitFixed || ruleResult.changed);

  let report = `## 诊断\n`;
  report += `- 项目：\`${projectPath}\`\n`;
  report += `- Mod.xml：${after.modState.status}${after.modState.rel ? ` (\`${after.modState.rel}\`)` : ''}\n`;
  if (diagnosis.alternateModPaths?.length) {
    report += `- 注意：子目录另有 Mod.xml：${diagnosis.alternateModPaths.join(', ')}\n`;
  }
  report += `- data 下 XML 数量：${after.dataXmlCount}\n`;
  if (after.baeWarningCount) report += `- 编译警告：${after.baeWarningCount} 条（见 WarningLog，通常仍可成功出包）\n`;
  if (after.baeErrorCount) report += `- 编译错误：${after.baeErrorCount} 条（见 ErrorLog）\n`;
  if (diagnosis.issues.length) {
    report += `- 检测到问题：${diagnosis.issues.map((i) => i.message).join('；')}\n`;
  }
  report += '\n';

  report += formatRootCauseSection(rootCauses);

  if (compileHealth?.risks?.length) {
    const blocking = compileHealth.risks.filter((r) => r.severity === 'error');
    if (blocking.length) {
      report += `### 项目中仍存在的结构风险（${blocking.length} 项）\n\n`;
      for (const r of blocking.slice(0, 8)) {
        report += `- 🔴 ${r.title}${r.file ? ` (\`${r.file}\`)` : ''}\n`;
      }
      report += '\n';
    }
  }

  if (ruleResult.log.length) {
    report += `## 已执行修复\n${ruleResult.log.map((l) => `- ${l}`).join('\n')}\n\n`;
  }
  if (llmPlan.summary) {
    report += `## 分析\n${llmPlan.summary}\n\n`;
  }

  if (buildLikelyOk) {
    report += `✅ **已应用自动修复**。请在 IDE 中再次 **Ctrl+B** 编译验证。\n`;
    if (unitFixed) {
      report += `\n> **根因**：单位 XML 不符合 BinaryAssetBuilder 规范（非缺少 .manifest 文件）。已改为 \`<Includes>\` + 继承 SDK 官方单位模板；\`.manifest\` 会在 \`builtmods\` 中由编译自动生成。\n`;
    }
    const modFix = ruleResult.fixes.find((f) => f.action === 'repairModXml');
    if (modFix?.result?.preview) {
      report += `\n**Mod.xml 预览（前 800 字）：**\n\`\`\`xml\n${modFix.result.preview}\n\`\`\`\n`;
    }
  } else if (modOk) {
    report += `⚠️ Mod.xml 正常，但单位/命令 XML 可能仍有问题。请把最新 ErrorLog 再发给我。\n`;
  } else {
    report += `⚠️ 仍有问题：${after.modState.hint || after.modState.status}。请把最新 ErrorLog 再发给我。\n`;
  }

  return {
    success: buildLikelyOk,
    report,
    diagnosis: after,
    ruleResult,
    llmPlan,
    changedFiles: ruleResult.fixes.map((f) => f.result?.rel).filter(Boolean),
  };
}

function looksLikeBuildErrorMessage(message) {
  const m = String(message || '');
  return (
    /编译\s*(失败|报错|错误)|退出码|BuildLog|ErrorLog|缺少\s*data\/mod\.xml|mod\.manifest|binaryassetbuilder/i.test(
      m
    ) || (/(修复|解决|按.*方案).{0,20}(编译|报错|错误)/.test(m) && /mod\.xml|编译/i.test(m))
  );
}

function looksLikeFixBuildIntent(message) {
  const m = String(message || '');
  return (
    /(修复|解决|处理|按.{0,12}方案).{0,24}(编译|报错|错误)/i.test(m) ||
    /(执行|动手|自动).{0,12}(修复|解决)/i.test(m) ||
    /^\/fixbuild\b/i.test(m)
  );
}

/** 扫描后修复项目结构（Mod.xml / 单位 XML），无需粘贴 BuildLog */
function looksLikeProjectRepairIntent(message) {
  const m = String(message || '').trim();
  if (!m) return false;
  if (
    /(进行|开始|立刻|马上|请)?修复/.test(m) &&
    /(操作|一下|项目|mod|xml|结构|规范|问题|上述|这些|扫描|健康|不规范)/i.test(m)
  ) {
    return true;
  }
  if (/(修复|改正|纠正|规范化).{0,16}(不规范|问题|结构|xml|mod|项目)/i.test(m)) {
    return true;
  }
  if (/不规范.{0,12}(修复|改正|处理)/.test(m)) {
    return true;
  }
  if (/按.{0,8}(标准|当前).{0,8}(格式|结构).{0,8}(修复|编写)/i.test(m)) {
    return true;
  }
  return false;
}

/**
 * 根据编译健康检查 / 扫描结果自动修复（规则优先，不依赖意图路由 LLM）
 */
async function executeProjectHealthFix(options = {}) {
  const projectPath = (options.projectPath || getCurrentFolder() || '').replace(/\\/g, '/');
  const onProgress = options.onProgress || (() => {});

  if (!projectPath) {
    return { success: false, error: '未打开 MOD 项目，无法修复。' };
  }

  onProgress('🔍 正在根据扫描结果诊断项目结构…');
  const compileHealth = analyzeCompileHealth(
    projectPath,
    require('./project-state').getProjectConventions()
  );
  const diagnosis = diagnoseProject(projectPath, '');

  const riskLines = (compileHealth?.risks || [])
    .filter((r) => r.severity === 'error' || r.severity === 'warning')
    .map((r) => `${r.title || ''} ${r.message || ''} ${r.file || ''}`)
    .join('\n');

  const syntheticError = [
    '项目结构不规范，需修复 Mod.xml 与单位 XML',
    'XmlFormattingError commanddata.xml',
    'Include has no id attribute',
    'unexpected WeaponSlot',
    riskLines,
  ]
    .filter(Boolean)
    .join('\n');

  onProgress('🔧 正在写入修复（CommandData 结构 + Mod.xml + 单位 XML）…');
  let session = null;
  if (options.sessionId) {
    try {
      session = require('./agent-chat-sessions').getSessionForTools(options.sessionId, projectPath);
    } catch (e) {}
  }

  const ruleResult = await applyRuleBasedFixes(
    projectPath,
    diagnosis,
    syntheticError,
    onProgress,
    session
  );

  const after = diagnoseProject(projectPath, syntheticError);
  const afterHealth = analyzeCompileHealth(
    projectPath,
    require('./project-state').getProjectConventions()
  );

  let report = `## 项目结构修复\n\n`;
  report += `- 项目：\`${projectPath}\`\n`;
  report += `- Mod.xml：${after.modState.status}${after.modState.rel ? ` (\`${after.modState.rel}\`)` : ''}\n`;

  if (ruleResult.log.length) {
    report += `\n### 已执行\n${ruleResult.log.map((l) => `- ${l}`).join('\n')}\n`;
  } else {
    report += `\n⚠️ 未检测到可自动修复的变更（可能文件已符合规范，或需手动处理）。\n`;
  }

  if (afterHealth?.hasBlockingIssues) {
    const blocking = afterHealth.risks.filter((r) => r.severity === 'error');
    report += `\n### 仍存在的风险（${blocking.length} 项）\n`;
    for (const r of blocking.slice(0, 6)) {
      report += `- 🔴 ${r.title}${r.file ? ` (\`${r.file}\`)` : ''}\n`;
    }
    report += `\n可将最新 **ErrorLog** 发给我继续修复，或说明要改用「标准 MOD 格式」重建单位。\n`;
  } else {
    report += `\n✅ **结构修复已完成**。请 **Ctrl+B** 重新编译验证。\n`;
  }

  const changedFiles = ruleResult.fixes.map((f) => f.result?.rel).filter(Boolean);

  return {
    success: ruleResult.changed || changedFiles.length > 0,
    report,
    changedFiles,
    diagnosis: after,
    ruleResult,
  };
}

module.exports = {
  diagnoseProject,
  executeBuildErrorFix,
  executeProjectHealthFix,
  looksLikeBuildErrorMessage,
  looksLikeFixBuildIntent,
  looksLikeProjectRepairIntent,
  applyRuleBasedFixes,
  isCommandDataXmlError: require('./command-data-repair').isCommandDataXmlError,
};
