// main/agent-confirm-plan.js —— 路由级「确认所有」方案文案

const path = require('path');
const { getCurrentFolder } = require('./project-state');
const { collectScaffoldFiles } = require('./insurrection-scaffold');
const { previewRollbackPlan, formatRollbackPlanPreview } = require('./agent-rollback');

function listPreview(items, label, max = 30) {
  if (!items?.length) return '';
  const lines = [`**${label}**（${items.length} 项）：`];
  for (const item of items.slice(0, max)) lines.push(`- \`${item}\``);
  if (items.length > max) lines.push(`- … 另有 ${items.length - max} 项`);
  return lines.join('\n');
}

function buildScaffoldPlanDetail(root) {
  const files = collectScaffoldFiles();
  const rels = files.map((f) => f.rel);
  return [
    '#### 操作方案',
    '',
    '将在当前 MOD 项目写入**起义时刻标准空框架**（约 18 个 XML），并同步 Mod.xml / mod.babproj。',
    '',
    listPreview(rels, '将创建或更新的主要文件'),
    '',
    '> 已存在的同名文件默认跳过，不覆盖。',
  ].join('\n');
}

function buildMigratePlanDetail(root) {
  try {
    const { buildMigrationPlan } = require('./insurrection-migrate');
    const plan = buildMigrationPlan(root);
    const lines = [
      '#### 操作方案',
      '',
      '将扫描项目并按**标准 MOD 结构**整理：单位分包、重建 Mod.xml 聚合、删除重复/遗留路径。',
    ];
    if (plan.conversions?.length) {
      lines.push('', `**单位分包**（${plan.conversions.length} 个）：`);
      for (const c of plan.conversions.slice(0, 20)) {
        lines.push(`- \`${c.unitId}\`：\`${c.from}\` → \`${c.to}\``);
      }
      if (plan.conversions.length > 20) {
        lines.push(`- … 另有 ${plan.conversions.length - 20} 个`);
      }
    }
    const deletes = (plan.deletes || []).filter(Boolean);
    const uniqueDeletes = [...new Set(deletes.map((d) => (typeof d === 'string' ? d : d.file || d.rel || String(d))))];
    if (uniqueDeletes.length) {
      lines.push('', listPreview(uniqueDeletes, '可能删除的重复/遗留文件', 25));
    }
    if (plan.keepFlat?.length) {
      lines.push('', `- 保持现状（不分包）：${plan.keepFlat.length} 个单位`);
    }
    return lines.join('\n');
  } catch (e) {
    return (
      '#### 操作方案\n\n将扫描并整理 data/ 目录、阵营聚合 XML、Mod.xml；可能移动/删除重复路径并重建 Include 链。'
    );
  }
}

function buildFixBuildPlanDetail(message) {
  return [
    '#### 操作方案',
    '',
    '将解析 BuildLog/ErrorLog，并写入/修正 Mod.xml、CommandData.xml、单位 XML 等以消除编译错误。',
    '',
    message && /CommandData|XmlFormatting/i.test(message)
      ? '- 检测到 CommandData/格式类报错，将优先修复 CommandData 结构。'
      : '- 将按报错类型自动匹配修复规则。',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildCreateUnitPlanDetail(message) {
  const { parseCreateUnitRequest } = require('./create-unit-pipeline');
  const req = parseCreateUnitRequest(message);
  const lines = [
    '#### 操作方案',
    '',
    '将按五阶段流程：检索知识库 → 联网参考 → 生成单位 XML → 流式写入 → 注册到阵营聚合链。',
  ];
  if (req) {
    lines.push(
      '',
      `- **单位名**：${req.displayName || req.unitId || '（待解析）'}`,
      `- **阵营**：${req.faction || '（自动推断）'}`,
      `- **类型**：${req.unitKind || 'infantry'}`
    );
    if (req.templateId) lines.push(`- **蓝本 ID**：\`${req.templateId}\``);
  }
  return lines.join('\n');
}

function buildToolPlanDetail(message) {
  const level = require('./ai-permission').getAiPermissionLevel();
  const hints = [
    '#### 操作方案',
    '',
    'Agent 将多轮调用工具完成任务：先读取/搜索确认现状，再按需写入或修复。',
    '',
    `- **权限**：${level.toUpperCase()} + **确认所有**（本对话内写操作不再逐项弹窗）`,
  ];
  if (/迁移|标准\s*mod|起义|整理项目|insurrection/i.test(message)) {
    hints.push('- 可能调用：`migrateToInsurrectionStandard` / `refineInsurrectionLayout`');
  }
  if (/删除|移除|移动|rename/i.test(message)) {
    hints.push('- 可能调用：`deleteProjectFile` / `moveProjectFile`');
  }
  if (/新建|创建|单位|步兵|坦克/i.test(message)) {
    hints.push('- 可能调用：`createUnit` / `writeProjectFile`');
  }
  if (/修复|编译|build\s*log|error\s*log/i.test(message)) {
    hints.push('- 可能调用：`fixBuildErrors` / `diagnoseBuild`');
  }
  return hints.join('\n');
}

function buildProjectHealthFixPlanDetail() {
  return [
    '#### 操作方案',
    '',
    '将根据项目扫描与编译健康检查，自动修复 Mod.xml、CommandData 结构与单位 XML（规则优先）。',
    '',
    '- 可能修改：Mod.xml、CommandData.xml、单位定义与 Include 链',
    '- 不会删除整个项目目录',
  ].join('\n');
}

/**
 * @param {string} route
 * @param {string} [message]
 * @param {object} [options]
 * @returns {string}
 */
function buildRoutePlanDetail(route, message = '', options = {}) {
  const root = options.projectRoot || getCurrentFolder();
  const msg = String(message || '');

  switch (route) {
    case 'rollback': {
      if (!root) return '（请先打开 MOD 项目）';
      const preview = previewRollbackPlan(root);
      return preview.success ? formatRollbackPlanPreview(preview) : preview.error || '';
    }
    case 'scaffold_framework':
      return root ? buildScaffoldPlanDetail(root) : buildScaffoldPlanDetail('');
    case 'migrate_insurrection':
      return root ? buildMigratePlanDetail(root) : '#### 操作方案\n\n将整理为标准 MOD 结构。';
    case 'fix_build':
      return buildFixBuildPlanDetail(msg);
    case 'create_unit':
      return buildCreateUnitPlanDetail(msg);
    case 'remove_mod': {
      const { planModContentRemoval, formatDeletePlanPreview } = require('./mod-content-remove');
      const root = options.projectRoot || getCurrentFolder();
      const plan = planModContentRemoval(root, msg);
      return formatDeletePlanPreview(plan);
    }
    case 'project_health_fix':
      return buildProjectHealthFixPlanDetail();
    case 'tool_plan':
      return buildToolPlanDetail(msg);
    default:
      return options.fallback || '';
  }
}

/**
 * T3 完成后汇报（方案 + 变更文件）
 */
function formatT3CompletionReport({ title, userMessage, changedFiles, planSummary, bodyReport }) {
  const unique = [...new Set((changedFiles || []).filter(Boolean))];
  const lines = [`### T3 自主操作完成：${title}`, ''];
  if (userMessage) {
    lines.push('**您的请求**：', userMessage.slice(0, 400), '');
  }
  if (planSummary) {
    lines.push('**执行方案**：', planSummary, '');
  } else if (bodyReport && bodyReport.length < 800) {
    lines.push('**执行摘要**：', bodyReport.slice(0, 800), '');
  }
  if (unique.length) {
    lines.push(`**已修改 ${unique.length} 个文件**：`, ...unique.map((f) => `- \`${f}\``));
  } else {
    lines.push('**文件变更**：未记录到具体路径（可能仅为分析或未写入）。');
  }
  lines.push('', '> T3 模式下未弹确认；如需撤销最近一次 AI 写入，可说「回退代码」。');
  return lines.join('\n');
}

module.exports = {
  buildRoutePlanDetail,
  formatT3CompletionReport,
};
