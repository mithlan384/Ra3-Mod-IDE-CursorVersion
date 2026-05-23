// main/agent-loop.js —— ReAct Agent 主循环（多轮工具调用）

const agentTools = require('./agent-tools');
const { runSenseTool, SENSE_TOOL_NAMES } = require('./agent-sense-tools');
const { buildOpenAIToolsFromDefinitions } = require('./agent-tool-schemas');
const { buildContextBundle, trimText } = require('./agent-context');
const { chatCompletion, loadAIConfig, abortActiveLlmRequest } = require('./llm-client');
const { sendAgentThinking, isDeepThinkingActive } = require('./agent-message-channel');
const { buildPersonalitySystemBlock, loadPreferences } = require('./agent-personality');
const { resolveAgentMaxSteps } = require('./agent-max-steps');
const {
  beginRun,
  endRun,
  isAbortRequested,
  getActiveRunId,
} = require('./agent-run-controller');

const MAX_TOOL_RESULT_CHARS = 14000;

function serializeToolResult(result) {
  let text;
  if (result == null) text = 'null';
  else if (typeof result === 'string') text = result;
  else text = JSON.stringify(result, null, 0);
  if (text.length > MAX_TOOL_RESULT_CHARS) {
    return text.slice(0, MAX_TOOL_RESULT_CHARS) + '\n…（工具输出已截断）';
  }
  return text;
}

function buildAgentSystemPrompt(personalityPrompt, contextAppendix) {
  let xsdBlock = '';
  try {
    xsdBlock = require('./xsd-knowledge-indexer').formatXsdAuthorityPromptBlock() + '\n\n';
  } catch (e) {}

  return `你是 RA3 MOD IDE 的智能开发 Agent，可以**多轮**调用工具完成用户需求。

${personalityPrompt ? personalityPrompt + '\n\n' : ''}
${xsdBlock}## 工作方式
1. 先理解需求；**凡将写入或修改项目 XML**（含 setUnitProperty、writeProjectFile、createUnit），必须先 lookupXsdSymbol → grepSdkXsd / readSdkXsd 对照 SDK XSD，再动手；禁止仅凭教程猜测标签名。改项目文件前用 readProjectFile / grepProject。
2. 用户要求「搭建框架/空项目骨架」→ 项目路由会自动 scaffoldInsurrectionFramework；勿只回复目录树文字。用户要求「按标准 MOD 格式整理、迁移、标准化项目」→ **优先** migrateToInsurrectionStandard；若单位已分包仅需改聚合/目录 → refineInsurrectionLayout。须保证 **data/** 小写 + **data/Allied.xml → Allied/Allied.xml** 二级聚合，勿用 Data/。
3. 编译相关：若报错含 CommandData.xml / XmlFormattingError，必须先 fixBuildErrors，不要只改单位 XML。
4. Include 必须在 <Includes> 内；禁止往 Mod.xml / CommandData.xml 的 </AssetDeclaration> 后面 append。**禁止**用 writeProjectFile 直接往 Mod.xml 添加单位 reference（标准 MOD 结构下会被 IDE 拒绝）。
4b. **XML 元素名、属性名、枚举值、Behavior/Body 模块结构**以 SDK \`Schemas/xsd\` 为准；与教程/论坛冲突时**以 XSD 为准**（知识库 category=xsd）。
5. 新建单位**必须** createUnit / createUnitPipeline；注册走 SovietInfantry.xml 等聚合链，**不要**手写 Mod.xml Include。改属性优先 setUnitProperty。
6. 血量路径：<Body><ActiveBody MaxHealth="xxx"/></Body>；单位 ID、文件路径、文件夹名、Include source、EditorName 等**必须英文 PascalCase**；中文显示名**只能**写在 XML 注释（<!-- -->）中，禁止用中文作路径或属性值。
7. Mod.xml（标准 MOD）：仅 reference 原版 Static/Global/Audio + type="all" 引用 Soviet.xml、Common.xml 等顶层聚合；**禁止** reference 指向 Infantry/.../GameObject.xml。
8. 收尾可调用 assessInsurrectionCompliance 验收；通过前禁止说「已完成结构整理/已标准化」。

## 红警3原版单位（与当前 MOD 项目区分）
- **原版数据**以知识库 \`vanilla-ra3-biligame-wiki.md\` 与 \`unit-id-reference.md\` 为准（来源：[红警3 B站百科](https://wiki.biligame.com/redalert3/%E9%A6%96%E9%A1%B5)）；**守护者坦克** unitId = **AlliedAntiVehicleVehicleTech1**，模型 AVTank_Grdn，**单炮塔**。
- **当前打开的项目**内的单位用 findUnitsByName / listAllUnits 确认；**禁止**把项目里乱命名的文件（如 AlliedAntiVehicleInfantryTech1）当成守护者。
- **禁止**在用户只分析/查看某一个 `.xml` 时调用全项目 scanProject；全量扫描仅当用户明确说「全部/所有/整个/全量」等；单文件用 readProjectFile / grepProject。
- 改「原版单位行为」：优先 instance 蓝本 \`DATA:SageXml/{阵营}/Units/{unitId}.xml\` + xai:joinAction Replace；**不要**在未确认项目内存在该单位时 createUnit 冒充「已修改原版」。

## 外观/模型级改动（四管炮塔、换模型、新造型）— 两阶段
**阶段一（当前默认）：对话追问** — 只用自然语言，不要弹出按钮、不要 createUnit/writeProjectFile：
1. 先诊断项目内目标单位；原版天启 ID = **SovietAntiVehicleVehicleTech3**（勿写 SovietSuperTank）。
2. 逐项追问：改造方式（改现有/另建/仅数据）、多管开火方式、是否有 W3X 模型、音效/武器/属性/技能/FX/UI 等能否沿用原版。
3. 缺项时继续追问；信息未齐前**禁止**写文件。
**阶段二：按钮向导** — 仅当用户回复「开始素材向导」或点击跟进按钮后，由 IDE 弹出按钮确认「沿用原版」与各素材文件；此阶段你无需重复追问改造方式/开火方式。
4. 阶段一结束时提示：「请回复 **开始素材向导**」。
5. **禁止**用原版单管模型 + 多 WeaponSlot 冒充多管外观。

## 观战与遭遇战人数（必读，勿写 Observer MOD 糊弄）
- **房间最多 6 个玩家位**（真人 + AI 槽），不是 8 人。
- **战败观战**：用户作为 6 人之一参战，输了继续看 → **原版已有，不需要 MOD**。
- **实时看别人 3v3、自己不参战**：靠**地图**让 **PlyrCreeps**、**PlyrCivilian** 占 2 战斗位，真人 4～5 人 + 1 人选**观战位**；**不靠 MOD** 新建 Observer PlayerTemplate/全图单位。
- **不要系统 AI 占坑又要额外真人实时观战** → **MOD 做不到**，说明回放/外部插件/exe，禁止编造 Observer XML 教程。
- 详见知识库 \`ra3-spectator-and-multiplayer-slots.md\`；用户问观战时**先分清上述三种**，不要默认写 XML。

## 无法完成时必须说明原因（容错）
- 若需求超出 MOD 数据能力（改 exe、遭遇战 8 人、引擎第五阵营、代下载素材、额外联机观战位等），**明确告知不能做的原因**，并给出 2～3 条可行替代建议（子阵营、instance 原版、新建单位、地图观战位、手动编译等）。
- 若找不到单位：说明已查项目与 SageXml；建议正确中文名/ID 或先打开 SDK 路径。
- 若工具失败：写出错误信息，不要假装成功。

## 禁止
- 未调用工具成功修改文件时，声称「已完成」。
- 用 compileHealth blocking=0 代替结构验收（必须用 assessInsurrectionCompliance / layoutProfile=sdk-insurrection）。
- 只给教程不操作（用户要求修编译/改 MOD 时必须写文件）。
- 把 builtmods 里的 .manifest 当源码修改。

${contextAppendix || ''}`;
}

async function executeAgentTool(toolName, args, hooks = {}) {
  const { needsToolConfirmation } = require('./ai-permission');
  const {
    buildToolProposal,
    formatProposalText,
    requestUserConfirmation,
  } = require('./agent-action-gate');
  const level = hooks.permissionLevel || require('./ai-permission').getAiPermissionLevel();

  if (needsToolConfirmation(level, toolName)) {
    const proposal = buildToolProposal(toolName, args, hooks.userMessage);
    if (hooks.onProgress) hooks.onProgress(formatProposalText(proposal));
    const approved = await requestUserConfirmation(hooks.senderWin || null, proposal);
    if (!approved) {
      return { success: false, error: '用户已取消操作', cancelled: true };
    }
  }

  if (SENSE_TOOL_NAMES.has(toolName)) {
    return runSenseTool(toolName, args, { onProgress: hooks.onProgress });
  }
  if (typeof agentTools[toolName] !== 'function') {
    return { success: false, error: `未知工具: ${toolName}` };
  }

  if (toolName === 'scanProject') {
    const { assertFullProjectScanAllowed } = require('./project-scanner');
    const gate = assertFullProjectScanAllowed(hooks.userMessage || '');
    if (!gate.ok) return { success: false, error: gate.error };
  }

  const { isWriteTool } = require('./ai-permission');
  const { notifyUiLock } = require('./stream-write');
  const needsIdeLock = isWriteTool(toolName) && toolName !== 'backupFile';
  if (needsIdeLock) notifyUiLock(true, { reason: 'AI 正在修改项目文件，请稍候…' });
  try {
    return await agentTools[toolName](args, {
      onProgress: hooks.onProgress,
      userMessage: hooks.userMessage,
    });
  } finally {
    if (needsIdeLock) notifyUiLock(false);
  }
}

function parseToolArgs(raw) {
  if (raw == null) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * @param {object} options
 * @param {string} options.userMessage
 * @param {string} [options.projectContext]
 * @param {Array} [options.history]
 * @param {string} [options.aiPersonality]
 * @param {(msg:string)=>void} [options.onProgress]
 * @param {(step:number, tool:string, result:object)=>void} [options.onStep]
 * @param {object} [options.hooks] - afterTool(sessionId etc.)
 * @param {string} [options.runId] - 与 agent-run-controller 关联，用于用户终止
 */
async function runAgentLoop(options = {}) {
  const {
    userMessage,
    projectContext = '',
    history = [],
    aiPersonality,
    onProgress,
    onStep,
    hooks = {},
    senderWin = null,
    permissionLevel,
    runId: externalRunId,
    contextAppendix = '',
  } = options;
  const permLevel = permissionLevel || require('./ai-permission').getAiPermissionLevel();

  const config = loadAIConfig();
  const stepPolicy = resolveAgentMaxSteps(config.agentMaxSteps);
  const maxSteps = stepPolicy.maxSteps;
  const unlimitedSteps = stepPolicy.unlimited;

  const runId = externalRunId || beginRun();

  const throwIfAborted = () => {
    if (isAbortRequested(runId)) {
      const err = new Error('用户已终止 Agent 任务');
      err.code = 'AGENT_ABORTED';
      throw err;
    }
  };
  const tools = buildOpenAIToolsFromDefinitions();
  const personalityPrompt = buildPersonalitySystemBlock(
    aiPersonality || loadPreferences().aiPersonality
  );
  const ctx = await buildContextBundle({ userMessage, projectContext, history });
  const appendix = (ctx.systemAppendix || '') + (contextAppendix || '');
  const systemContent = buildAgentSystemPrompt(personalityPrompt, appendix);

  const messages = [{ role: 'system', content: systemContent }];
  if (Array.isArray(history)) {
    for (const m of history.slice(-6)) {
      if (!m?.content) continue;
      messages.push({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: trimText(m.content, 2000),
      });
    }
  }
  messages.push({ role: 'user', content: userMessage });

  const log = [];
  const changedFiles = [];
  let finalMessage = '';
  let step = 0;
  let userCancelled = false;
  let aborted = false;

  if (isDeepThinkingActive()) {
    const { isAccumulatedThinkingSubstantial } = require('./agent-message-channel');
    if (!isAccumulatedThinkingSubstantial()) {
      try {
        const { generateFullInnerThinking } = require('./agent-deep-thinking');
        const intro = await generateFullInnerThinking(
          userMessage,
          '分析用户 MOD 需求，决定先扫描、读文件还是直接改 XML，以及可能用到的工具。'
        );
        sendAgentThinking(null, intro);
      } catch (e) {
        console.warn('[agent-loop] intro thinking:', e.message);
      }
    }
  }

  try {
  while (unlimitedSteps || step < maxSteps) {
    throwIfAborted();
    step++;
    let response;
    try {
      response = await chatCompletion(messages, {
        tools,
        tool_choice: 'auto',
        temperature: 0.12,
      });
    } catch (err) {
      if (err.code === 'AGENT_ABORTED' || isAbortRequested(runId)) {
        aborted = true;
        finalMessage = '任务已由用户终止。';
        break;
      }
      return {
        success: false,
        error: err.message,
        log,
        finalMessage: `❌ AI 调用失败: ${err.message}`,
        changedFiles,
        aborted: false,
        runId,
      };
    }

    throwIfAborted();

    if (isDeepThinkingActive() && response.reasoning_content) {
      const reasoning = String(response.reasoning_content).trim();
      const { isSubstantialThinking } = require('./agent-deep-thinking');
      if (reasoning && isSubstantialThinking(reasoning)) {
        sendAgentThinking(null, reasoning);
      }
    }

    const toolCalls = response.tool_calls;
    if (!toolCalls?.length) {
      finalMessage = (response.content || '').trim() || '任务已处理完毕。';
      break;
    }

    messages.push({
      role: 'assistant',
      content: response.content || null,
      tool_calls: toolCalls,
    });

    for (const tc of toolCalls) {
      throwIfAborted();
      const name = tc.function?.name;
      const args = parseToolArgs(tc.function?.arguments);
      if (onProgress) onProgress(`🔧 ${name}…`);

      let result;
      try {
        result = await executeAgentTool(name, args, {
          onProgress: hooks.onProgress || onProgress,
          userMessage,
          senderWin,
          permissionLevel: permLevel,
        });
        if (result?.cancelled) {
          finalMessage = '操作已按您的选择取消。';
          userCancelled = true;
          break;
        }
      } catch (err) {
        if (err.code === 'AGENT_ABORTED' || isAbortRequested(runId)) {
          aborted = true;
          finalMessage = '任务已由用户终止。';
          userCancelled = true;
          break;
        }
        result = { success: false, error: err.message };
      }

      if (hooks.afterTool) {
        try {
          await hooks.afterTool(name, args, result);
        } catch (e) {
          console.warn('[agent-loop] afterTool:', e.message);
        }
      }

      if (result?.success && result?.data?.file) changedFiles.push(result.data.file);
      if (result?.success && result?.data?.modifiedFile) changedFiles.push(result.data.modifiedFile);
      if (result?.success && result?.data?.changedFiles) {
        changedFiles.push(...result.data.changedFiles);
      }
      if (result?.success && result?.data?.files) {
        changedFiles.push(...result.data.files);
      }

      log.push({ step, tool: name, args, result });
      if (onStep) onStep(step, name, result);

      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: serializeToolResult(result),
      });
    }
    if (userCancelled || aborted) break;
  }
  } catch (loopErr) {
    if (loopErr.code === 'AGENT_ABORTED' || isAbortRequested(runId)) {
      aborted = true;
      if (!finalMessage) finalMessage = '任务已由用户终止。';
    } else {
      endRun(runId);
      throw loopErr;
    }
  } finally {
    endRun(runId);
  }

  if (!finalMessage && !aborted) {
    finalMessage =
      !unlimitedSteps && step >= maxSteps
        ? `已达到最大步骤数（${maxSteps}），可在「设置→首选项→AI 设置」调高或设为无限制，或缩小任务后继续说明下一步。`
        : '处理结束。';
  }

  const uniqueFiles = [...new Set(changedFiles.filter(Boolean))];
  if (uniqueFiles.length) {
    finalMessage += `\n\n📁 涉及文件: ${uniqueFiles.join(', ')}`;
  }

  const migrationTools = new Set([
    'migrateToInsurrectionStandard',
    'rebuildModXmlInsurrection',
    'assessInsurrectionCompliance',
  ]);
  if (log.some((l) => migrationTools.has(l.tool))) {
    const { getCurrentFolder } = require('./project-state');
    const root = getCurrentFolder();
    if (root) {
      const { assessInsurrectionCompliance, sanitizeAgentReply } = require('./insurrection-migrate');
      const assessment = assessInsurrectionCompliance(root);
      finalMessage = sanitizeAgentReply(finalMessage, assessment);
      if (!assessment.compliant) {
        finalMessage += `\n\n${assessment.summary}`;
        if (assessment.failedChecks?.length) {
          finalMessage += '\n未通过: ' + assessment.failedChecks.map((c) => c.id).join(', ');
        }
      }
    }
  }

  const anySuccess = log.some((l) => l.result?.success);
  const anyFail = log.some((l) => l.result && !l.result.success);

  return {
    success: aborted ? false : anySuccess && !anyFail ? true : anySuccess ? true : log.length === 0,
    log,
    finalMessage,
    changedFiles: uniqueFiles,
    steps: step,
    aborted,
    runId,
  };
}

function abortAgentLoop(runId) {
  const { requestAbort } = require('./agent-run-controller');
  const ok = requestAbort(runId || getActiveRunId());
  if (ok) abortActiveLlmRequest();
  return ok;
}

module.exports = { runAgentLoop, buildAgentSystemPrompt, executeAgentTool, abortAgentLoop };
