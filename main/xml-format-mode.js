// main/xml-format-mode.js —— XML 写入格式：标准 MOD vs 当前项目

const { STANDARD_REFERENCE_MOD } = require('./project-conventions');

const MODE_STANDARD = 'standard';
const MODE_PROJECT = 'project';

const STANDARD_RULES_LINES = [
  '【XML 写入规范 — 标准 MOD 格式】',
  '- 数据目录固定小写 **data/**（与 mod.babproj 的 data\\mod.xml 一致，勿用 Data/）',
  '- 二级阵营聚合：data/Allied.xml → type="all" source="Allied/Allied.xml"；单位清单在 data/Allied/Allied.xml',
  '- 布局：data/Allied/Infantry|Vehicle|Aircraft|Structures/单位名/…；**禁止** data/{阵营}/Units/',
  '- 清理：删除根目录 Allied/、Soviet/ 空文件夹与 DEPRECATED 占位 XML（mytank.xml 等）',
  '- Mod.xml：reference 仅用于 DATA:Static.xml、Global.xml、Audio.xml；MOD 内容用 type="all" 聚合',
  '- IDE 会拦截/净化 Mod.xml：禁止 </AssetDeclaration> 后 append、禁止中文 source、禁止 reference 直挂单位',
  '- 单位 wrapper：内 Include type="all" 引用子目录 GameObject/LogicCommand/LogicCommandSet 等',
  '- GameObject：Include 必须在 <Includes> 内；instance 引用 DATA:SageXml/BaseObjects/BaseInfantry.xml 等',
  '- inheritFrom 用 BaseInfantry/BaseVehicle；盟军 Side 写 Allies',
  '- LogicCommand / LogicCommandSet 与单位同目录；兵营队列补丁写在 data/Common/LogicCommandSet.xml',
  '- 禁止极简单文件 + WeaponSlot 写法（易触发 BAE Critical）',
];

function getStandardFormatConventions() {
  return {
    standardReferenceMod: STANDARD_REFERENCE_MOD,
    layoutProfile: 'sdk-insurrection',
    commandProfile: 'per-unit-colocated',
    dataRoot: 'data',
    xmlWriting: {
      requireIncludesWrapper: true,
      baseIncludePattern: 'DATA:SageXml/BaseObjects/BaseInfantry.xml',
      inheritFromPattern: 'BaseInfantry',
      sideAllies: 'Allies',
      weaponUseSlotHardpoint: true,
    },
    compactForLLM: STANDARD_RULES_LINES.join('\n'),
    rulesForAI: STANDARD_RULES_LINES,
  };
}

function parseFormatChoiceMessage(message) {
  const m = String(message || '').trim();
  if (!m) return null;

  if (
    /^\/xmlformat\s+(standard|project)\b/i.test(m) ||
    /^\/格式\s+(标准|项目)/.test(m)
  ) {
    if (/project|项目/i.test(m)) return MODE_PROJECT;
    return MODE_STANDARD;
  }

  if (
    /(仍|确认|执意).{0,8}(使用|采用|按).{0,12}(当前|本项目|现有)/i.test(m) ||
    /(按|使用|采用|选择).{0,12}(当前|本项目|现有|扫描).{0,12}(mod|项目).{0,8}(格式|结构|规范)/i.test(m) ||
    (/^(仍)?使用当前项目/i.test(m) && /格式|结构/i.test(m))
  ) {
    return MODE_PROJECT;
  }

  if (
    /(按|使用|采用|选择).{0,12}(标准|起义|insurrection|专业).{0,12}(mod|格式)/i.test(m) ||
    /标准\s*mod\s*格式/i.test(m)
  ) {
    return MODE_STANDARD;
  }

  return null;
}

function isFormatChoiceMessage(message) {
  return parseFormatChoiceMessage(message) != null;
}

function formatChoicePromptBlock(scan) {
  const profile = scan?.conventions?.layoutProfile || '未知';
  const cmd = scan?.conventions?.commandProfile || '未知';
  let text = `\n---\n\n### 请选择后续写 XML 的格式\n\n`;
  text += `已扫描项目 **${scan.projectName}**（布局 \`${profile}\`，命令 \`${cmd}\`）。\n\n`;

  const health = scan?.compileHealth;
  if (health?.risks?.length) {
    const { formatHealthReportBlock } = require('./project-health-check');
    text += formatHealthReportBlock(health);
    text += '\n';
  }

  text += `| 选项 | 说明 |\n|------|------|\n`;
  text += `| **标准 MOD 格式** | SDK 推荐的专业 MOD 结构（**默认**，可避免上述编译风险） |\n`;
  text += `| **当前项目格式** | 与现有目录/引用一致；**若存在 🔴 项，请先确认仍要沿用** |\n\n`;
  text += `请点击下方按钮，或发送：\n`;
  text += `- \`按标准MOD格式编写XML\`\n`;
  text += `- \`按当前项目已有结构编写XML\`（有风险时会二次确认）\n\n`;
  text += `*未选择前默认按 **标准 MOD 格式** 写入。*\n`;
  return text;
}

function formatModeConfirmMessage(mode, options = {}) {
  if (mode === MODE_PROJECT) {
    let msg =
      '✅ **已选择：当前项目格式**\n\n' +
      '后续创建/修改单位、修复编译错误时，将按**本次扫描到的项目结构**写入。\n\n';
    if (options.acknowledgedRisks) {
      msg +=
        '⚠️ 你已确认在存在编译风险的情况下仍沿用本项目结构；建议尽快修复扫描报告中的 🔴 项。\n\n';
    }
    msg += '可随时发送 `按标准MOD格式编写XML` 改回标准格式。';
    return msg;
  }
  return (
    '✅ **已选择：标准 MOD 格式**\n\n' +
    '后续创建/修改单位、修复编译错误时，将按 **SDK 推荐的专业 MOD 结构** 写入。\n\n' +
    '可随时发送 `按当前项目已有结构编写XML` 改用本项目格式。'
  );
}

/**
 * @param {'standard'|'project'} mode
 * @param {object} scan - scanProject().data
 */
function buildProjectContextForMode(scan, mode = MODE_STANDARD) {
  if (!scan) return '';

  const lines = [];
  lines.push(`〖MOD 项目上下文 — 扫描于 ${scan.scannedAt}〗`);
  lines.push(`项目：${scan.projectName}`);
  lines.push(`路径：${scan.root}`);
  lines.push(
    `XML 写入模式：**${mode === MODE_PROJECT ? '当前项目格式' : '标准 MOD 格式（默认）'}**`
  );

  if (scan.stats) {
    lines.push(
      `统计：${scan.stats.xmlFiles} 个 XML，${scan.stats.units} 个 GameObject` +
        (scan.stats.assetFiles ? `，${scan.stats.assetFiles} 个资源文件` : '')
    );
  }

  if (scan.modXml) {
    lines.push(`Mod.xml：${scan.modXml.path}（${scan.modXml.includes?.length || 0} 条 Include）`);
  }

  if (mode === MODE_PROJECT && scan.conventions?.compactForLLM) {
    lines.push('\n' + scan.conventions.compactForLLM);
  } else {
    lines.push('\n' + getStandardFormatConventions().compactForLLM);
    if (scan.conventions?.layoutProfile && scan.conventions.layoutProfile !== 'sdk-insurrection') {
      lines.push(
        `\n> 本项目实际为 \`${scan.conventions.layoutProfile}\` 布局；你已选择标准格式，新建文件将按标准 MOD 结构，不会自动模仿本项目旧文件。`
      );
    }
  }

  if (scan.compileHealth?.hasBlockingIssues && mode === MODE_PROJECT) {
    lines.push(
      '\n⚠️ 编译健康检查：当前项目存在可能导致 BAE 失败的结构（见扫描报告）。修复编译错误时将优先按不合规项自动修正单位 XML。'
    );
  }

  if (scan.units?.length) {
    lines.push('\n单位列表（id → 文件，供查找引用）：');
    const max = 80;
    for (const u of scan.units.slice(0, max)) {
      lines.push(`- ${u.id}${u.side ? ` [${u.side}]` : ''} @ ${u.file}`);
    }
    if (scan.units.length > max) lines.push(`… 另有 ${scan.units.length - max} 个`);
  }

  lines.push(
    '\n说明：修改/新建 XML 时必须遵守上方「XML 写入模式」对应规范；单位 id 与路径以列表为准。'
  );

  let text = lines.join('\n');
  const maxLen = 7000;
  if (text.length > maxLen) text = text.slice(0, maxLen) + '\n…（已截断）';
  return text;
}

/**
 * 解析有效写入模式
 * - 未扫描项目：始终标准 MOD 格式
 * - 已扫描且用户/首选项确认过：按 session.xmlFormatMode
 */
function resolveWriteMode(session, hasScannedProject) {
  if (!hasScannedProject) return MODE_STANDARD;
  if (session?.pendingFormatChoice) return MODE_STANDARD;
  if (session?.xmlFormatMode === MODE_PROJECT && session?.formatChoiceConfirmed) {
    return MODE_PROJECT;
  }
  if (session?.xmlFormatMode === MODE_STANDARD && session?.formatChoiceConfirmed) {
    return MODE_STANDARD;
  }
  try {
    const { getXmlWriteModePreference } = require('./xml-write-prefs');
    const pref = getXmlWriteModePreference();
    if (pref === MODE_PROJECT && session?.projectContext?.conventions && session?.formatChoiceConfirmed) {
      return MODE_PROJECT;
    }
  } catch {
    /* ignore */
  }
  return MODE_STANDARD;
}

/**
 * 供 unit-xml-builder / build-error-fixer 使用
 */
function getConventionsForWrite(root, session = null) {
  const hasScanned = !!session?.projectContext?.scannedAt;
  const mode = resolveWriteMode(session, hasScanned);

  if (mode === MODE_PROJECT) {
    const { getProjectConventions } = require('./project-state');
    const { analyzeProjectConventions } = require('./project-conventions');
    return getProjectConventions() || (root ? analyzeProjectConventions(root) : null);
  }
  return getStandardFormatConventions();
}

function shouldUseInsurrectionPackage(conventions, session) {
  const hasScanned = !!session?.projectContext?.scannedAt;
  const mode = resolveWriteMode(session, hasScanned);
  if (mode === MODE_STANDARD) return true;
  return conventions?.layoutProfile === 'sdk-insurrection';
}

module.exports = {
  MODE_STANDARD,
  MODE_PROJECT,
  getStandardFormatConventions,
  parseFormatChoiceMessage,
  isFormatChoiceMessage,
  formatChoicePromptBlock,
  formatModeConfirmMessage,
  buildProjectContextForMode,
  resolveWriteMode,
  getConventionsForWrite,
  shouldUseInsurrectionPackage,
};
