// main/agent-action-gate.js —— AI 操作确认门闩（T1/T2 按钮确认）

const { randomBytes } = require('crypto');
const {
  getAiPermissionLevel,
  getAiConfirmationMode,
  getConfirmationModeLabel,
  needsRouteConfirmation,
  needsToolConfirmation,
  describePermissionBehavior,
  getPermissionLevelLabel,
  isDestructiveTool,
  isMutatingRoute,
} = require('./ai-permission');

/** @type {Map<string, {resolve:(v:boolean)=>void, reject:(e:Error)=>void, timer:NodeJS.Timeout}>} */
const pending = new Map();

function generateProposalId() {
  return `act_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`;
}

function buildRouteProposal(route, userMessage) {
  const titles = {
    fix_build: '自动修复编译错误',
    create_unit: '创建新单位',
    migrate_insurrection: '按标准 MOD 结构整理项目',
    tool_plan: '修改项目文件（Agent 多步）',
    rollback: '回退上一轮 AI 代码修改',
    remove_mod: '删除项目内的单位/文件',
    scaffold_framework: '搭建标准 MOD 项目框架',
    project_health_fix: '自动修复项目结构',
  };
  const reasons = {
    fix_build:
      '将诊断 BuildLog/ErrorLog，并写入 Mod.xml、单位 XML、CommandData 等以消除编译错误。',
    create_unit: '将按五阶段流程生成单位目录、GameObject、LogicCommand 并注册到聚合链。',
    migrate_insurrection:
      '将扫描项目、调整 data/ 与阵营聚合、重建 Mod.xml，可能移动/删除旧路径文件。',
    tool_plan: 'Agent 将多轮调用读写工具（read/write/create/fix 等）完成您的需求。',
    rollback: '将删除上一轮 AI 新建的文件，并恢复上一轮被 AI 修改或删除的文件（快照在 .ra3-ide/snapshots/）。',
    remove_mod: '将扫描项目并删除匹配的单位 XML，同时从阵营聚合等文件中移除对应 Include 引用。',
    scaffold_framework: '将写入起义时刻标准空框架 XML，并同步 Mod.xml / mod.babproj。',
    project_health_fix: '将根据扫描结果修复 Mod.xml、CommandData 与单位 XML 结构问题。',
  };
  const mode = getAiConfirmationMode();
  return {
    id: generateProposalId(),
    kind: 'route',
    route,
    title: titles[route] || '执行项目修改',
    reason: reasons[route] || '此操作会修改当前 MOD 项目中的文件。',
    userMessage: String(userMessage || '').slice(0, 500),
    level: getAiPermissionLevel(),
    levelLabel: getPermissionLevelLabel(getAiPermissionLevel()),
    confirmationMode: mode,
    confirmationModeLabel: getConfirmationModeLabel(mode),
  };
}

function buildToolProposal(toolName, args, userMessage) {
  const { isKnownTool } = require('./ai-permission');
  const destructive = isDestructiveTool(toolName);
  const unknown = !isKnownTool(toolName);
  let reason = destructive
    ? `工具 \`${toolName}\` 可能删除或移动文件，请确认后继续。`
    : `工具 \`${toolName}\` 将修改项目文件。`;
  if (unknown) {
    reason = `工具 \`${toolName}\` 未在权限白名单中登记，为安全起见需确认后执行。`;
  }
  const mode = getAiConfirmationMode();
  return {
    id: generateProposalId(),
    kind: 'tool',
    tool: toolName,
    args: args || {},
    title: destructive
      ? `确认：${toolName}（破坏性）`
      : unknown
        ? `确认：${toolName}（未登记）`
        : `确认：${toolName}`,
    reason,
    userMessage: String(userMessage || '').slice(0, 300),
    level: getAiPermissionLevel(),
    levelLabel: getPermissionLevelLabel(getAiPermissionLevel()),
    confirmationMode: mode,
    confirmationModeLabel: getConfirmationModeLabel(mode),
  };
}

function formatProposalText(proposal) {
  const lines = [
    `### 待确认：${proposal.title}`,
    '',
    proposal.reason,
    '',
    `权限模式：**${proposal.levelLabel}** — ${describePermissionBehavior(proposal.level)}`,
  ];
  if (proposal.confirmationModeLabel && proposal.level !== 't3') {
    lines.push(`确认方式：**${proposal.confirmationModeLabel}**`);
  }
  if (proposal.route) lines.push('', `将执行路由：\`${proposal.route}\``);
  if (proposal.tool) lines.push('', `将调用工具：\`${proposal.tool}\``);
  if (proposal.planDetail) {
    lines.push('', proposal.planDetail);
  }
  lines.push('', '请在下方点击 **确认执行** 或 **取消**。');
  return lines.join('\n');
}

/**
 * @param {object} proposal
 * @param {number} [timeoutMs]
 * @returns {Promise<boolean>}
 */
function waitForActionConfirmation(proposalId, timeoutMs = 600000) {
  return new Promise((resolve, reject) => {
    if (pending.has(proposalId)) {
      reject(new Error('重复的确认请求'));
      return;
    }
    const timer = setTimeout(() => {
      pending.delete(proposalId);
      reject(new Error('操作确认超时'));
    }, timeoutMs);
    pending.set(proposalId, { resolve, reject, timer });
  });
}

function resolveActionConfirmation(proposalId, approved) {
  const id = String(proposalId || '');
  let entry = pending.get(id);
  let resolvedId = id;
  if (!entry && pending.size === 1) {
    const [[onlyId, onlyEntry]] = pending.entries();
    console.warn('[agent-action-gate] proposalId 未命中，回退到唯一挂起项:', id, '->', onlyId);
    entry = onlyEntry;
    resolvedId = onlyId;
  }
  if (!entry) {
    console.warn('[agent-action-gate] 无效 proposalId:', id, 'pending=', pending.size);
    return false;
  }
  clearTimeout(entry.timer);
  pending.delete(resolvedId);
  entry.resolve(!!approved);
  return true;
}

function cancelAllPending() {
  for (const [id, entry] of pending) {
    clearTimeout(entry.timer);
    entry.resolve(false);
    pending.delete(id);
  }
}

/**
 * 向渲染进程发送提案并等待用户确认
 * @param {import('electron').BrowserWindow|null} win
 * @param {object} proposal
 * @returns {Promise<boolean>}
 */
async function requestUserConfirmation(win, proposal) {
  if (win && !win.isDestroyed()) {
    win.webContents.send('agent:action-proposal', proposal);
  }
  try {
    return await waitForActionConfirmation(proposal.id);
  } catch (e) {
    console.warn('[agent-action-gate]', e.message);
    return false;
  }
}

module.exports = {
  buildRouteProposal,
  buildToolProposal,
  formatProposalText,
  waitForActionConfirmation,
  resolveActionConfirmation,
  cancelAllPending,
  requestUserConfirmation,
  needsRouteConfirmation,
  needsToolConfirmation,
  isMutatingRoute,
};
