// main/simple-stat-mod-flow.js —— 简单数值修改：先项目 → 再原版 → 按需问沿用

const { parseCreateUnitSpec } = require('./create-unit-spec');
const { resolveUnitTarget } = require('./unit-resolve');
const { formatUnitNotFoundBoundary } = require('./capability-boundary');
const { runSimpleStatReuseConfirm } = require('./unit-appearance-flow');

function isSimpleStatModIntent(message) {
  const m = String(message || '');
  if (/(四管|换模型|新模型|\.w3x|\.w3d)/i.test(m)) return false;
  return (
    /(血量|生命值|HP|MaxHealth|造价|费用|Cost|移速|速度|Speed|视野|射程|装甲|伤害)/i.test(m) &&
    /(改成|改为|设为|调到|设置为|\d{2,})/.test(m)
  );
}

function parseReuseAnswerFromMessage(message) {
  const m = String(message || '');
  if (/不沿用|自备|自己提供|不用原版|全部自备/i.test(m)) return { answered: true, reuseAll: false };
  if (/全部沿用|沿用原版|用原版|都可以沿用/i.test(m)) return { answered: true, reuseAll: true };
  return { answered: false };
}

function buildProjectStatAppendix(target, message, spec) {
  const parts = [];
  if (spec.maxHealth != null) parts.push(`MaxHealth → ${spec.maxHealth}（路径 Body.ActiveBody MaxHealth）`);
  if (spec.buildCost != null) parts.push(`BuildCost → ${spec.buildCost}`);
  if (spec.speed != null) parts.push(`移动相关 → ${spec.speed}`);
  return `

## 简单属性修改（项目内已存在单位）
- 已在当前 MOD 中找到：**${target.displayName || target.unitId}**（\`${target.unitId}\`）
- 文件：\`${target.file}\`
- **不要**询问是否沿用原版素材（项目内已有完整定义）。
- **不要** createUnit；请用 **setUnitProperty** 或 readProjectFile 后精准修改。
- 用户要求：${message}
${parts.length ? `- 解析目标：${parts.join('；')}` : '- 从用户句中解析具体属性与数值'}
- 修改成功后简要说明改了什么；若失败说明原因（路径错误、节点不存在等）。
`;
}

function buildVanillaStatAppendix(target, message, spec) {
  const inc = target.dataInclude || `DATA:${target.vanilla?.faction}/Units/${target.unitId}.xml`;
  const parts = [];
  if (spec.maxHealth != null) parts.push(`MaxHealth=${spec.maxHealth}`);
  if (spec.buildCost != null) parts.push(`BuildCost=${spec.buildCost}`);
  return `

## 简单属性修改（从原版 SageXml 引入）
- 项目内**无**该单位；原版可查：**${target.unitId}**（\`${inc}\`）
- 用户已确认 **沿用原版** 模型/音效/动画（仅改数值）。
- 做法：在 data 下创建 instance 单位（Include type="instance" source="${inc}" + xai:joinAction="Replace"），覆盖 ${parts.join('、') || '用户指定的属性'}，并注册到兵营聚合链；**不要**要求用户提供 W3X。
- 参考 unit-xml-repair 的 buildTemplateInheritUnitXml 模式；新 ID 建议带 Mod 前缀避免冲突（如 Mod${target.unitId} 或根据显示名生成）。
- 用户原话：${message}
`;
}

/**
 * @returns {Promise<boolean>} 是否已处理（true = 已响应，调用方应 return）
 */
async function tryHandleSimpleStatModFlow(ctx) {
  const {
    message,
    sessionId,
    senderWin,
    conversationHistory,
    gateMutatingRoute,
    runAgentLoopWithExtras,
  } = ctx;

  if (!isSimpleStatModIntent(message)) return false;

  const spec = parseCreateUnitSpec(message);
  const target = await resolveUnitTarget(message, ctx.tools);

  if (target.location === 'unknown') {
    ctx.sendAgentResponse(senderWin, formatUnitNotFoundBoundary(target, message), {
      forceFinal: true,
    });
    return true;
  }

  if (target.location === 'project') {
    ctx.sendAgentResponse(
      senderWin,
      `✓ 已在当前 MOD 中找到 **${target.displayName || target.unitId}**（\`${target.unitId}\`），将直接修改项目内 XML，无需确认沿用原版。`
    );
    if (!(await gateMutatingRoute(senderWin, 'tool_plan', message))) {
      ctx.sendAgentResponse(senderWin, '已取消修改。');
      return true;
    }
    await runAgentLoopWithExtras({
      contextAppendix: buildProjectStatAppendix(target, message, spec),
      label: '修改单位属性（项目内）',
    });
    return true;
  }

  if (target.location === 'vanilla') {
    const reuseFromMsg = parseReuseAnswerFromMessage(message);
    let reuseAll = reuseFromMsg.reuseAll;

    if (!reuseFromMsg.answered) {
      ctx.sendAgentResponse(
        senderWin,
        `ℹ️ 当前 MOD **没有**「${target.displayName || target.unitId}」，但原版 SageXml 中有 **\`${target.unitId}\`**，可通过 instance 引用直接改数据。\n\n请确认是否**全部沿用原版**模型、动画与音效（仅改数值）：`
      );
      const reuseRes = await runSimpleStatReuseConfirm(senderWin, sessionId);
      if (reuseRes.cancelled) {
        ctx.sendAgentResponse(senderWin, '已取消。');
        return true;
      }
      reuseAll = reuseRes.reuseAll;
    }

    if (!reuseAll) {
      const { formatBoundaryMessage } = require('./capability-boundary');
      ctx.sendAgentResponse(
        senderWin,
        formatBoundaryMessage({
          blocked: true,
          title: '仅改数值时无法「不沿用原版」',
          reason:
            '你要求修改的是血量/造价等**数据属性**，而项目里还没有这个单位。不沿用原版则必须自备模型、动画、贴图等，这属于**外观级新建**，不是简单改数。',
          suggestions: [
            '若接受沿用原版：请说「全部沿用原版」或点选「全部沿用原版素材」后重试。',
            '若必须换模型：请说「新建一个某某单位」或「把某某改成四管」走外观改造流程。',
            '自备 W3X 后给出完整路径，并说「开始素材向导」。',
          ],
        }),
        { forceFinal: true }
      );
      return true;
    }

    ctx.sendAgentResponse(
      senderWin,
      `✓ 将基于原版 **${target.unitId}** 在 MOD 中建立 instance 覆盖并修改数值（沿用原版素材）。`
    );
    if (!(await gateMutatingRoute(senderWin, 'tool_plan', message))) {
      ctx.sendAgentResponse(senderWin, '已取消。');
      return true;
    }
    await runAgentLoopWithExtras({
      contextAppendix: buildVanillaStatAppendix(target, message, spec),
      label: '修改单位属性（从原版引入）',
    });
    return true;
  }

  return false;
}

module.exports = {
  isSimpleStatModIntent,
  tryHandleSimpleStatModFlow,
  buildProjectStatAppendix,
  buildVanillaStatAppendix,
};
