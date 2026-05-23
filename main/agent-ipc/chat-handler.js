// main/agent-ipc/chat-handler.js — agent:chat 主路由
const ctx = require('./context');
const { resolveChatRoute } = require('../chat-intent');
const {
  parseFormatChoiceMessage,
  formatModeConfirmMessage,
} = require('../xml-format-mode');

function registerAgentChatHandler(ipcMain, runControl) {
  const { beginRun, endRun, isAbortRequested } = runControl;
  const {
    agentTools,
    chatSessions,
    pendingExecutions,
    getCurrentChatTurn,
    setCurrentChatTurn,
    getChatTurnFinished,
    setChatTurnFinished,
    getSenderWindow,
    parseChatPayload,
    finishChatTurn,
    sendAgentResponse,
    resetProgressBuffer,
    beginMessageTurn,
    deliverFinalAnswer,
    flushProgressStatus,
    deliverAssistantReply,
    deliverCapabilityBoundaryReply,
    makeThinkingEmitter,
    gateMutatingRoute,
    sendT3ChangeReport,
    runMutatingWithSnapshot,
    generateExecutionId,
    applyScanToSession,
    tryHandleAppearanceModFlow,
    getCurrentFolder,
    getAiPermissionLevel,
    isDeepThinkingActive,
    isOperationalCommand,
    buildRoutePlanDetail,
    suggestFollowUpActions,
    respondCasually,
    respondOfflineKnowledge,
    summarizeExecution,
  } = ctx;

  ipcMain.on('agent:chat', async (event, payload) => {
    const senderWin = getSenderWindow(event);
    if (!senderWin) return;

    let { sessionId, message, deepThinking } = parseChatPayload(payload);
    if (!message) return;

    if (!sessionId) {
      const listed = chatSessions.listSessions();
      if (listed.success) sessionId = listed.data.activeSessionId;
    }

    const chatRunId = beginRun();
    const abortIfRequested = () => {
      if (isAbortRequested(chatRunId)) {
        const err = new Error('用户已终止对话');
        err.code = 'AGENT_ABORTED';
        throw err;
      }
    };

    setChatTurnFinished(false);
    resetProgressBuffer();
    const turn = { sessionId, thinkingParts: [], answerParts: [], parts: [] };
    setCurrentChatTurn(turn);
    beginMessageTurn(senderWin, turn, deepThinking);

    if (sessionId) {
      try {
        chatSessions.appendMessage(sessionId, 'user', message);
      } catch (e) {
        console.warn('[Agent] 记录用户消息失败:', e.message);
      }
    }

    let conversationHistory = [];
    if (sessionId) {
      conversationHistory = chatSessions.getContextForLLM(sessionId);
      const last = conversationHistory[conversationHistory.length - 1];
      if (last?.role === 'user' && last.content === message) {
        conversationHistory = conversationHistory.slice(0, -1);
      }
    }

    const projectContext = sessionId ? chatSessions.getProjectContextBlock(sessionId) : '';

    const sessionPersonality = sessionId
      ? chatSessions.getSessionPersonality(sessionId, null)
      : (() => {
          try {
            const { resolvePersonalityFromPrefs } = require('../agent-theme-resolve');
            const fs = require('fs');
            const path = require('path');
            const { app } = require('electron');
            const prefPath = path.join(app.getPath('userData'), 'preferences.json');
            if (fs.existsSync(prefPath)) {
              return resolvePersonalityFromPrefs(JSON.parse(fs.readFileSync(prefPath, 'utf-8')));
            }
          } catch (e) {}
          return 'default';
        })();

    const planOpts = (extra = {}) => ({
      forceSearch: false,
      allowSearch: true,
      history: conversationHistory,
      projectContext,
      aiPersonality: sessionPersonality,
      ...extra,
    });

    let executionId = null;

    try {
      abortIfRequested();
      const {
        isRollbackRequest,
        previewRollbackPlan,
        formatRollbackPlanPreview,
        rollbackLastAiChanges,
        formatRollbackReport,
      } = require('../agent-rollback');

      const { parseSkillInstallRequest } = require('../skill-install-intent');
      const skillReq = parseSkillInstallRequest(message);
      if (skillReq) {
        const {
          installFromSkillhubSlug,
          installFromUrl,
          uninstallSkill,
          listInstalledSkills,
        } = require('../skill-registry');
        if (skillReq.action === 'install') {
          sendAgentResponse(
            senderWin,
            `📦 正在安装 Skill **${skillReq.slug}**${skillReq.sourceUrl ? `（${skillReq.sourceUrl}）` : ''}…`
          );
          try {
            const res = skillReq.rawUrl
              ? await installFromUrl(skillReq.rawUrl)
              : await installFromSkillhubSlug(skillReq.slug, { sourceUrl: skillReq.sourceUrl });
            const sk = res.skill;
            sendAgentResponse(
              senderWin,
              `✅ Skill 已安装：**${sk.displayName || sk.id}** (${sk.id})${sk.version ? ` v${sk.version}` : ''}\n` +
                `可在 **知识库 → Skill** 标签页查看、开关或卸载。`
            );
          } catch (err) {
            sendAgentResponse(senderWin, `❌ Skill 安装失败：${err.message}`);
          }
          return;
        }
        if (skillReq.action === 'uninstall') {
          const installed = listInstalledSkills();
          const target =
            installed.find((s) => s.id === skillReq.slug) ||
            installed.find((s) => s.name === skillReq.slug);
          if (!target) {
            sendAgentResponse(senderWin, `❌ 未找到已安装的 Skill：${skillReq.slug}`);
            return;
          }
          try {
            uninstallSkill(target.id);
            sendAgentResponse(senderWin, `✅ 已卸载 Skill：**${target.displayName || target.id}**`);
          } catch (err) {
            sendAgentResponse(senderWin, `❌ 卸载失败：${err.message}`);
          }
          return;
        }
      }

      if (isRollbackRequest(message)) {
        const root = getCurrentFolder();
        if (!root) {
          sendAgentResponse(senderWin, '❌ 请先打开 MOD 项目，才能回退 AI 修改。');
          return;
        }
        const preview = previewRollbackPlan(root);
        if (!preview.success) {
          sendAgentResponse(senderWin, `❌ ${preview.error}`);
          return;
        }
        const planText = formatRollbackPlanPreview(preview);
        if (!(await gateMutatingRoute(senderWin, 'rollback', message, { planDetail: planText }))) {
          sendAgentResponse(senderWin, '已取消回退，项目文件未改动。');
          return;
        }
        sendAgentResponse(senderWin, '⏪ 正在按已确认的方案回退…');
        const rollbackRes = rollbackLastAiChanges(root);
        const report = formatRollbackReport(rollbackRes);
        sendAgentResponse(senderWin, report);
        const touched = [...(rollbackRes.restored || []), ...(rollbackRes.deleted || [])];
        for (const rel of touched) {
          agentTools.notifyTreeRefresh(rel);
        }
        return;
      }

      const formatChoice = parseFormatChoiceMessage(message);
      if (formatChoice && sessionId) {
        const acknowledgeRisks = /仍|确认|执意/i.test(message);
        const setRes = chatSessions.setXmlFormatMode(sessionId, formatChoice, null, {
          acknowledgeRisks,
        });
        if (setRes.success) {
          sendAgentResponse(
            senderWin,
            formatModeConfirmMessage(formatChoice, {
              acknowledgedRisks: setRes.data?.acknowledgedProjectRisks,
            })
          );
        } else if (setRes.needsRiskAck) {
          sendAgentResponse(
            senderWin,
            `⚠️ ${setRes.error}\n\n请点击聊天区 **「仍使用当前项目格式」** 按钮确认，或发送：\`确认使用当前项目格式\``
          );
          if (senderWin && !senderWin.isDestroyed()) {
            senderWin.webContents.send('agent:format-choice', {
              sessionId,
              scanId: String(Date.now()),
              needsRiskAck: true,
              compileHealth: setRes.compileHealth,
            });
          }
        } else {
          sendAgentResponse(senderWin, `❌ ${setRes.error || '设置格式失败'}`);
        }
        return;
      }

      if (message.startsWith('/tool ')) {
        const parts = message.substring(6).split(/\s+/);
        const toolName = parts[0];
        const argsArray = parts.slice(1);
        try {
          const { executeAgentTool } = require('../agent-loop');
          const result = await executeAgentTool(toolName, argsArray, {
            senderWin,
            permissionLevel: getAiPermissionLevel(),
            userMessage: message,
          });
          if (result.cancelled) {
            sendAgentResponse(senderWin, '已取消工具执行。');
            return;
          }
          if (toolName === 'scanProject') {
            applyScanToSession(sessionId, result, senderWin, { promptFormatChoice: true });
            if (result.success && result.data?.report) {
              sendAgentResponse(senderWin, result.data.report);
            } else {
              sendAgentResponse(senderWin, JSON.stringify(result, null, 2));
            }
          } else {
            sendAgentResponse(senderWin, JSON.stringify(result, null, 2));
          }
        } catch (err) {
          sendAgentResponse(senderWin, JSON.stringify({ success: false, error: err.message }));
        }
        return;
      }

      let allowSearch = false;
      let forceSearch = false;
      try {
        const fs = require('fs');
        const path = require('path');
        const { app } = require('electron');
        const prefPath = path.join(app.getPath('userData'), 'preferences.json');
        if (fs.existsSync(prefPath)) {
          allowSearch = !!JSON.parse(fs.readFileSync(prefPath, 'utf-8')).allowWebSearch;
        }
      } catch (e) {}
      if (
        message.includes('强制搜索') ||
        message.includes('上网查') ||
        message.includes('联网搜索') ||
        message.startsWith('/search')
      ) {
        forceSearch = true;
        allowSearch = true;
        message = message
          .replace(/强制搜索/g, '')
          .replace(/上网查/g, '')
          .replace(/联网搜索/g, '')
          .replace(/^\/search\s*/i, '')
          .trim();
      }

      // 单文件分析：在 LLM 意图路由之前直接读文件，避免误走 tool_plan 确认与全项目扫描
      if (getCurrentFolder()) {
        const { isReadOnlyFileAnalysisIntent } = require('../project-scanner');
        if (isReadOnlyFileAnalysisIntent(message)) {
          const { tryRouteProjectIntent } = require('../project-intent-router');
          const earlyFileRoute = await tryRouteProjectIntent(message, agentTools, {
            sessionId,
            onProgress: (m) => sendAgentResponse(senderWin, m),
            chatSessions,
          });
          if (earlyFileRoute.handled) {
            await deliverFinalAnswer(senderWin, earlyFileRoute.response, {
              userMessage: message,
              thinkingHint: '单文件 XML 分析，概括结构与引用关系。',
            });
            return;
          }
        }
      }

      const routeDecision = await resolveChatRoute(message, {
        forceSearch,
        allowSearch,
        history: conversationHistory,
        hasProject: !!getCurrentFolder(),
        sessionId,
      });
      console.log('[Agent] 意图路由:', routeDecision.route, routeDecision.reason, `(${routeDecision.source})`);

      if (routeDecision.route === 'readonly_file') {
        const { tryRouteProjectIntent } = require('../project-intent-router');
        const readOnlyRoute = await tryRouteProjectIntent(message, agentTools, {
          sessionId,
          onProgress: (m) => sendAgentResponse(senderWin, m),
          chatSessions,
        });
        if (readOnlyRoute.handled) {
          await deliverFinalAnswer(senderWin, readOnlyRoute.response, {
            userMessage: message,
            thinkingHint: '单文件 XML 分析，概括结构与引用关系。',
          });
          return;
        }
        sendAgentResponse(
          senderWin,
          '❌ 未能分析该文件。请确认已打开项目，且文件名/路径正确（支持带空格的文件名）。'
        );
        return;
      }

      const {
        detectUnsupportedRequest,
        formatBoundaryMessage,
      } = require('../capability-boundary');
      const capabilityBlock = detectUnsupportedRequest(message, {
        hasProject: !!getCurrentFolder(),
      });
      if (capabilityBlock.blocked) {
        await deliverCapabilityBoundaryReply(senderWin, capabilityBlock, message);
        return;
      }

      if (routeDecision.route === 'web_search') {
        const { runIntelligentSearch } = require('../intelligent-search');
        sendAgentResponse(senderWin, '🌐 正在联网检索并整理答案…');
        const intel = await runIntelligentSearch(message, agentTools, (m) => sendAgentResponse(senderWin, m));
        const answer = intel.success
          ? intel.answer
          : `❌ 智能搜索失败：${intel.error || '未知错误'}`;
        await deliverFinalAnswer(senderWin, answer, {
          userMessage: message,
          thinkingHint: '用户要求联网检索，说明检索思路与如何整理答案。',
        });
        return;
      }

      const { looksLikeScaffoldFrameworkIntent } = require('../insurrection-scaffold');
      if (looksLikeScaffoldFrameworkIntent(message) && getCurrentFolder()) {
        if (!(await gateMutatingRoute(senderWin, 'scaffold_framework', message))) {
          sendAgentResponse(senderWin, '已取消搭建框架。');
          return;
        }
      }

      const { tryRouteProjectIntent } = require('../project-intent-router');
      const projectRoute = await tryRouteProjectIntent(message, agentTools, {
        sessionId,
        onProgress: (m) => sendAgentResponse(senderWin, m),
        chatSessions,
      });
      if (projectRoute.handled) {
        const { isReadOnlyFileAnalysisIntent } = require('../project-scanner');
        await deliverFinalAnswer(senderWin, projectRoute.response, {
          userMessage: message,
          thinkingHint: isReadOnlyFileAnalysisIntent(message)
            ? '用户要求分析单个 XML，说明文件结构、引用与要点。'
            : '处理项目相关意图（扫描/列单位等），说明执行思路。',
        });
        if (sessionId && projectRoute.scanData) {
          applyScanToSession(
            sessionId,
            { success: true, data: projectRoute.scanData },
            senderWin,
            { promptFormatChoice: !!projectRoute.needsFormatChoice }
          );
        }
        return;
      }

      const { looksLikeInsurrectionMigrateIntent } = require('../insurrection-migrate');
      if (looksLikeInsurrectionMigrateIntent(message) && getCurrentFolder()) {
        if (!(await gateMutatingRoute(senderWin, 'migrate_insurrection', message))) {
          sendAgentResponse(senderWin, '已取消迁移。');
          return;
        }
        sendAgentResponse(senderWin, '🏛 正在按**标准 MOD 结构**整理项目（扫描→分包→Mod.xml→删重复→验收）…');
        const migrateResult = await runMutatingWithSnapshot(
          { label: '项目结构整理', userMessage: message, sessionId },
          () =>
            agentTools.migrateToInsurrectionStandard({}, { onProgress: (m) => sendAgentResponse(senderWin, m) }),
          { senderWin }
        );
        if (migrateResult.data?.changedFiles?.length) {
          for (const rel of migrateResult.data.changedFiles) {
            if (!String(rel).startsWith('(deleted)')) agentTools.notifyTreeRefresh(rel);
          }
        }
        const report =
          migrateResult.data?.report ||
          migrateResult.error ||
          '迁移流程结束。';
        sendAgentResponse(senderWin, report);
        sendT3ChangeReport(senderWin, migrateResult.data?.changedFiles, '项目结构整理', {
          userMessage: message,
          planSummary: buildRoutePlanDetail('migrate_insurrection', message),
          bodyReport: migrateResult.data?.report,
        });
        return;
      }

      if (routeDecision.route === 'migrate_insurrection' && getCurrentFolder()) {
        if (!(await gateMutatingRoute(senderWin, 'migrate_insurrection', message))) {
          sendAgentResponse(senderWin, '已取消迁移。');
          return;
        }
        sendAgentResponse(senderWin, '🏛 正在按标准 MOD 结构整理项目…');
        const migrateResult = await runMutatingWithSnapshot(
          { label: '项目结构整理', userMessage: message, sessionId },
          () =>
            agentTools.migrateToInsurrectionStandard({}, { onProgress: (m) => sendAgentResponse(senderWin, m) }),
          { senderWin }
        );
        if (migrateResult.data?.changedFiles?.length) {
          for (const rel of migrateResult.data.changedFiles) {
            if (!String(rel).startsWith('(deleted)')) agentTools.notifyTreeRefresh(rel);
          }
        }
        sendAgentResponse(
          senderWin,
          migrateResult.data?.report || migrateResult.error || '迁移结束。'
        );
        sendT3ChangeReport(senderWin, migrateResult.data?.changedFiles, '项目结构整理', {
          userMessage: message,
          planSummary: buildRoutePlanDetail('migrate_insurrection', message),
          bodyReport: migrateResult.data?.report,
        });
        return;
      }

      const {
        looksLikeProjectRepairIntent,
        executeProjectHealthFix,
      } = require('../build-error-fixer');
      if (looksLikeProjectRepairIntent(message) && getCurrentFolder()) {
        if (!(await gateMutatingRoute(senderWin, 'project_health_fix', message))) {
          sendAgentResponse(senderWin, '已取消修复。');
          return;
        }
        sendAgentResponse(senderWin, '🔧 正在根据扫描结果**自动修复**项目结构（写入 Mod.xml 与单位 XML）…');
        const fixResult = await runMutatingWithSnapshot(
          { label: '项目结构修复', userMessage: message, sessionId },
          () =>
            executeProjectHealthFix({
              sessionId,
              onProgress: (m) => sendAgentResponse(senderWin, m),
            }),
          { senderWin }
        );
        if (fixResult.changedFiles?.length) {
          for (const rel of fixResult.changedFiles) {
            agentTools.notifyTreeRefresh(rel);
          }
        }
        sendAgentResponse(senderWin, fixResult.report || fixResult.error || '修复流程结束。');
        sendT3ChangeReport(senderWin, fixResult.changedFiles, '项目结构修复', {
          userMessage: message,
          planSummary: buildRoutePlanDetail('project_health_fix', message),
          bodyReport: fixResult.report,
        });
        return;
      }

      if (
        getCurrentFolder() &&
        (routeDecision.route === 'tool_plan' || routeDecision.route === 'create_unit') &&
        (await tryHandleAppearanceModFlow({
          message,
          sessionId,
          senderWin,
          conversationHistory,
          sessionPersonality,
        }))
      ) {
        return;
      }

      if (routeDecision.route === 'casual' || routeDecision.route === 'meta') {
        const thinkEmit = makeThinkingEmitter(senderWin);
        const reply = await respondCasually(message, {
          history: conversationHistory,
          intent: routeDecision.route === 'meta' ? 'meta_no_search' : 'casual',
          aiPersonality: sessionPersonality,
          deepThinking: isDeepThinkingActive(),
          onThinking: thinkEmit.onThinking,
        });
        await deliverAssistantReply(
          senderWin,
          reply,
          '（助手未返回内容。若你刚才是要修复项目，请发送：**进行修复操作** 或 **修复不规范的 XML**。）',
          {
            userMessage: message,
            thinkingHint: '闲聊或元对话，简短自然回复。',
            thinkingAlreadySent: thinkEmit.thinkingAlreadySent,
          }
        );
        return;
      }

      if (routeDecision.route === 'offline_answer') {
        const thinkEmit = makeThinkingEmitter(senderWin);
        const reply = await respondOfflineKnowledge(message, {
          history: conversationHistory,
          aiPersonality: sessionPersonality,
          deepThinking: isDeepThinkingActive(),
          onThinking: thinkEmit.onThinking,
        });
        await deliverAssistantReply(senderWin, reply, '', {
          userMessage: message,
          thinkingHint: '离线知识问答，结合知识库组织回答。',
          thinkingAlreadySent: thinkEmit.thinkingAlreadySent,
        });
        if (!isOperationalCommand(message) && senderWin && !senderWin.isDestroyed()) {
          const actions = suggestFollowUpActions(message, {
            hasProject: !!getCurrentFolder(),
          });
          if (actions.length) {
            senderWin.webContents.send('agent:follow-up-proposal', {
              sessionId,
              preamble: '如需我代为修改项目，可选择：',
              actions,
            });
          }
        }
        return;
      }

      if (routeDecision.route === 'fix_build') {
        if (!(await gateMutatingRoute(senderWin, 'fix_build', message))) {
          sendAgentResponse(senderWin, '已取消修复操作。');
          return;
        }
        const { executeBuildErrorFix } = require('../build-error-fixer');
        sendAgentResponse(senderWin, '🔧 正在诊断并**自动修复**编译问题（会写入项目文件）…');
        const fixResult = await runMutatingWithSnapshot(
          { label: '修复编译', userMessage: message, sessionId },
          () =>
            executeBuildErrorFix({
              errorText: message,
              allowWebSearch: allowSearch,
              sessionId,
              onProgress: (m) => sendAgentResponse(senderWin, m),
            }),
          { senderWin }
        );
        if (fixResult.changedFiles?.length) {
          for (const rel of fixResult.changedFiles) {
            agentTools.notifyTreeRefresh(rel);
          }
        }
        sendAgentResponse(senderWin, fixResult.report || fixResult.error || '修复流程结束。');
        sendT3ChangeReport(senderWin, fixResult.changedFiles, '修复编译', {
          userMessage: message,
          planSummary: buildRoutePlanDetail('fix_build', message),
          bodyReport: fixResult.report,
        });
        return;
      }

      if (routeDecision.route === 'remove_mod' && getCurrentFolder()) {
        if (!(await gateMutatingRoute(senderWin, 'remove_mod', message))) {
          sendAgentResponse(senderWin, '已取消删除。');
          return;
        }
        const { executeModContentRemoval } = require('../mod-content-remove');
        sendAgentResponse(senderWin, '🗑 正在扫描并删除匹配的单位与引用…');
        const delResult = await runMutatingWithSnapshot(
          { label: '删除项目内容', userMessage: message, sessionId },
          () =>
            executeModContentRemoval(getCurrentFolder(), message, {
              onProgress: (m) => sendAgentResponse(senderWin, m),
            }),
          { senderWin }
        );
        if (delResult.changedFiles?.length) {
          for (const rel of delResult.changedFiles) {
            agentTools.notifyTreeRefresh(rel);
          }
        }
        sendAgentResponse(senderWin, delResult.report || delResult.error || '删除流程结束。');
        sendT3ChangeReport(senderWin, delResult.changedFiles, '删除项目内容', {
          userMessage: message,
          bodyReport: delResult.report,
        });
        return;
      }

      if (routeDecision.route === 'create_unit') {
        if (!(await gateMutatingRoute(senderWin, 'create_unit', message))) {
          sendAgentResponse(senderWin, '已取消创建单位。');
          return;
        }
        const { formatCreateUnitParseFailure, executeCreateUnitPipeline } = require('../create-unit-pipeline');
        const { resolveCreateUnitRequest } = require('../create-unit-intent');
        sendAgentResponse(senderWin, '🧠 正在结合对话理解要创建的单位…');
        await flushProgressStatus();
        const createReq = await resolveCreateUnitRequest(message, conversationHistory);
        if (!createReq) {
          const { looksLikeDeleteModIntent, executeModContentRemoval } = require('../mod-content-remove');
          if (looksLikeDeleteModIntent(message) && getCurrentFolder()) {
            sendAgentResponse(
              senderWin,
              '⚠️ 本条为**删除**请求（非创建单位）。正在按删除流程处理…'
            );
            const delResult = await runMutatingWithSnapshot(
              { label: '删除项目内容', userMessage: message, sessionId },
              () =>
                executeModContentRemoval(getCurrentFolder(), message, {
                  onProgress: (m) => sendAgentResponse(senderWin, m),
                }),
              { senderWin }
            );
            if (delResult.changedFiles?.length) {
              for (const rel of delResult.changedFiles) {
                agentTools.notifyTreeRefresh(rel);
              }
            }
            sendAgentResponse(senderWin, delResult.report || delResult.error || '删除结束。');
            return;
          }
          await deliverAssistantReply(senderWin, formatCreateUnitParseFailure(message), '', {
            userMessage: message,
            skipEnsureThinking: true,
          });
          return;
        }
        sendAgentResponse(
          senderWin,
          `🏗️ 已识别创建单位「${createReq.displayName}」，正在执行流水线（共 7 步）…`
        );
        await flushProgressStatus();
        executionId = generateExecutionId();
        const pipeResult = await runMutatingWithSnapshot(
          { label: '创建单位', userMessage: message, sessionId },
          () =>
            executeCreateUnitPipeline(createReq, {
              tools: agentTools,
              sessionId,
              senderWin,
              onProgress: (msg) => sendAgentResponse(senderWin, msg),
            }),
          { senderWin }
        );
        pendingExecutions[executionId] = {
          userMessage: message,
          plan: [{ tool: 'createUnit', args: createReq }],
          log: [{ tool: 'createUnit', result: pipeResult }],
          success: pipeResult.success,
        };
        flushProgressStatus();
        if (pipeResult.success) {
          const data = pipeResult.data || {};
          let summary = '';
          if (isDeepThinkingActive()) {
            summary =
              `✅ 已创建单位 **${data.displayName || createReq.displayName}**\n\n` +
              `- 单位 ID：\`${data.unitId}\`\n` +
              (data.file ? `- 文件：\`${data.file}\`\n` : '') +
              (data.templateUnit ? `- 模板：\`${data.templateUnit}\`\n` : '') +
              `\n请用 SDK 编译 MOD 并在游戏中测试。`;
          } else {
            summary = await summarizeExecution(
              [{ stepIndex: 0, tool: 'createUnit', args: createReq, result: pipeResult }],
              message,
              { aiPersonality: sessionPersonality }
            );
          }
          await deliverFinalAnswer(senderWin, `${summary}\n[执行ID: ${executionId}]`, {
            userMessage: message,
            skipEnsureThinking: true,
            thinkingHint: '新建单位流程已完成，向用户说明结果与后续编译步骤。',
          });
          sendT3ChangeReport(
            senderWin,
            pipeResult.changedFiles || pipeResult.data?.changedFiles,
            '创建单位',
            {
              userMessage: message,
              planSummary: buildRoutePlanDetail('create_unit', message),
              bodyReport: summary,
            }
          );
        } else {
          const { formatBoundaryMessage } = require('../capability-boundary');
          const errText = pipeResult.error || '未知错误';
          await deliverFinalAnswer(
            senderWin,
            `❌ 创建单位失败: ${errText}\n[执行ID: ${executionId}]\n\n` +
              formatBoundaryMessage({
                blocked: true,
                title: '创建流程中断',
                reason: errText,
                suggestions: [
                  '检查是否已配置 SDK、项目是否为标准 MOD 结构。',
                  '若缺模型素材，请走外观向导或说明「全部沿用原版」。',
                  '可先说「扫描全部项目」再重试创建。',
                ],
              }),
            { userMessage: message, skipEnsureThinking: true }
          );
        }
        return;
      }

      if (routeDecision.route !== 'tool_plan') {
        sendAgentResponse(senderWin, '⚠️ 意图路由异常，请重新描述需求。');
        return;
      }

      const { looksLikeFixBuildIntent, looksLikeBuildErrorMessage } = require('../build-error-fixer');
      if (looksLikeFixBuildIntent(message) || (looksLikeBuildErrorMessage(message) && /修复|执行|解决/.test(message))) {
        if (!(await gateMutatingRoute(senderWin, 'fix_build', message))) {
          sendAgentResponse(senderWin, '已取消修复操作。');
          return;
        }
        const { executeBuildErrorFix } = require('../build-error-fixer');
        sendAgentResponse(senderWin, '🔧 正在自动修复编译问题…');
        const fixResult = await runMutatingWithSnapshot(
          { label: '修复编译', userMessage: message, sessionId },
          () =>
            executeBuildErrorFix({
              errorText: message,
              allowWebSearch: allowSearch,
              sessionId,
              onProgress: (m) => sendAgentResponse(senderWin, m),
            }),
          { senderWin }
        );
        if (fixResult.changedFiles?.length) {
          for (const rel of fixResult.changedFiles) {
            agentTools.notifyTreeRefresh(rel);
          }
        }
        sendAgentResponse(senderWin, fixResult.report || fixResult.error || '完成');
        sendT3ChangeReport(senderWin, fixResult.changedFiles, '修复编译', {
          userMessage: message,
          planSummary: buildRoutePlanDetail('fix_build', message),
          bodyReport: fixResult.report,
        });
        return;
      }

      // —— Agent 主循环（多轮工具调用，替代单次 JSON 计划） ——
      if (routeDecision.route === 'tool_plan') {
        const { tryHandleSimpleStatModFlow } = require('../simple-stat-mod-flow');
        if (
          getCurrentFolder() &&
          (await tryHandleSimpleStatModFlow({
            message,
            sessionId,
            senderWin,
            conversationHistory,
            tools: agentTools,
            sendAgentResponse,
            gateMutatingRoute,
            runAgentLoopWithExtras: async ({ contextAppendix, label }) => {
              sendAgentResponse(senderWin, '🧠 Agent 正在分析并执行任务（可多步读写项目）…');
              const { runAgentLoop } = require('../agent-loop');
              const loopExecutionId = generateExecutionId();
              const loopRes = await runMutatingWithSnapshot(
                { label: label || 'Agent 多步任务', userMessage: message, sessionId },
                () =>
                  runAgentLoop({
                    userMessage: message,
                    projectContext,
                    history: conversationHistory,
                    aiPersonality: sessionPersonality,
                    contextAppendix,
                    senderWin,
                    runId: chatRunId,
                    permissionLevel: getAiPermissionLevel(),
                    onProgress: (m) => sendAgentResponse(senderWin, m),
                    onStep: (_step, tool, stepResult) => {
                      const icon = stepResult.success ? '✅' : '❌';
                      const detail = stepResult.error ? ` (${stepResult.error})` : '';
                      sendAgentResponse(senderWin, `${icon} ${tool}${detail}`);
                    },
                    hooks: {
                      onProgress: (m) => sendAgentResponse(senderWin, m),
                      afterTool: (toolName, _args, result) => {
                        if (toolName === 'scanProject') {
                          applyScanToSession(sessionId, result, senderWin);
                        }
                        if (result?.success && result?.data?.changedFiles) {
                          for (const rel of result.data.changedFiles) {
                            agentTools.notifyTreeRefresh(rel);
                          }
                        }
                      },
                    },
                  }),
                { senderWin }
              );
              if (loopRes.changedFiles?.length) {
                for (const rel of loopRes.changedFiles) {
                  agentTools.notifyTreeRefresh(rel);
                }
              }
              pendingExecutions[loopExecutionId] = {
                userMessage: message,
                plan: loopRes.log?.map((l) => ({ tool: l.tool, args: l.args })) || [],
                log: loopRes.log,
                success: loopRes.success,
              };
              const failHint =
                !loopRes.success && loopRes.error
                  ? `\n\n⚠️ **未能完成**：${loopRes.error}\n建议：检查单位 ID/文件路径、是否需先扫描项目，或换一种说法重试。`
                  : '';
              await deliverFinalAnswer(
                senderWin,
                (loopRes.finalMessage || loopRes.error || 'Agent 结束。') +
                  failHint +
                  `\n[执行ID: ${loopExecutionId}]`,
                {
                  userMessage: message,
                  thinkingHint: '多步 Agent 结束，概括已调用工具、修改与结论。',
                }
              );
              sendT3ChangeReport(senderWin, loopRes.changedFiles, label || 'Agent 多步任务', {
                userMessage: message,
                planSummary: buildRoutePlanDetail('tool_plan', message),
                bodyReport: loopRes.finalMessage,
              });
            },
          }))
        ) {
          return;
        }

        const { isScanProjectIntent } = require('../project-scanner');
        const scanOnly = isScanProjectIntent(message) && getCurrentFolder();
        if (scanOnly) {
          const { tryRouteProjectIntent: routeScan } = require('../project-intent-router');
          const scanRoute = await routeScan(message, agentTools, {
            sessionId,
            onProgress: (m) => sendAgentResponse(senderWin, m),
            chatSessions,
          });
          if (scanRoute.handled) {
            await deliverFinalAnswer(senderWin, scanRoute.response, {
              userMessage: message,
              thinkingHint: '用户主动扫描项目结构，说明将如何归纳目录与规范。',
            });
            if (sessionId && scanRoute.scanData) {
              applyScanToSession(
                sessionId,
                { success: true, data: scanRoute.scanData },
                senderWin,
                { promptFormatChoice: !!scanRoute.needsFormatChoice }
              );
            }
            return;
          }
        }
        const { isReadOnlyFileAnalysisIntent } = require('../project-scanner');
        if (isReadOnlyFileAnalysisIntent(message)) {
          const readOnlyRoute = await tryRouteProjectIntent(message, agentTools, {
            sessionId,
            onProgress: (m) => sendAgentResponse(senderWin, m),
            chatSessions,
          });
          if (readOnlyRoute.handled) {
            await deliverFinalAnswer(senderWin, readOnlyRoute.response, {
              userMessage: message,
              thinkingHint: '单文件 XML 分析，概括结构与引用关系。',
            });
            return;
          }
        }

        if (!(await gateMutatingRoute(senderWin, 'tool_plan', message))) {
          sendAgentResponse(senderWin, '已取消 Agent 操作。');
          return;
        }
        sendAgentResponse(senderWin, '✅ 已确认，开始执行…');
        if (looksLikeProjectRepairIntent(message)) {
          if (!(await gateMutatingRoute(senderWin, 'project_health_fix', message))) {
            sendAgentResponse(senderWin, '已取消修复。');
            return;
          }
          sendAgentResponse(senderWin, '🔧 正在根据扫描结果**自动修复**项目结构…');
          const fixResult = await runMutatingWithSnapshot(
            { label: '项目结构修复', userMessage: message, sessionId },
            () =>
              executeProjectHealthFix({
                sessionId,
                onProgress: (m) => sendAgentResponse(senderWin, m),
              }),
            { senderWin }
          );
          if (fixResult.changedFiles?.length) {
            for (const rel of fixResult.changedFiles) {
              agentTools.notifyTreeRefresh(rel);
            }
          }
          sendAgentResponse(senderWin, fixResult.report || fixResult.error || '修复流程结束。');
          sendT3ChangeReport(senderWin, fixResult.changedFiles, '项目结构修复', {
            userMessage: message,
            planSummary: buildRoutePlanDetail('project_health_fix', message),
            bodyReport: fixResult.report,
          });
          return;
        }

        let appearanceContextAppendix = '';
        const appearanceFlow = require('../unit-appearance-flow');
        if (
          getCurrentFolder() &&
          appearanceFlow.isAppearanceInquiryActive(sessionId, message, conversationHistory) &&
          !appearanceFlow.shouldRunAppearanceWizard(message, sessionId, conversationHistory)
        ) {
          const flow = appearanceFlow.ensureInquiryState(
            sessionId,
            message,
            conversationHistory,
            getCurrentFolder()
          );
          if (flow) appearanceContextAppendix = appearanceFlow.buildAppearanceInquiryAppendix(flow);
        }

        sendAgentResponse(senderWin, '🧠 Agent 正在分析并执行任务（可多步读写项目）…');
        const { runAgentLoop } = require('../agent-loop');
        executionId = generateExecutionId();
        const loopRes = await runMutatingWithSnapshot(
          { label: 'Agent 多步任务', userMessage: message, sessionId },
          () =>
            runAgentLoop({
              userMessage: message,
              projectContext,
              history: conversationHistory,
              aiPersonality: sessionPersonality,
              contextAppendix: appearanceContextAppendix,
              senderWin,
              runId: chatRunId,
              permissionLevel: getAiPermissionLevel(),
              onProgress: (m) => sendAgentResponse(senderWin, m),
              onStep: (_step, tool, stepResult) => {
                const icon = stepResult.success ? '✅' : '❌';
                const detail = stepResult.error ? ` (${stepResult.error})` : '';
                sendAgentResponse(senderWin, `${icon} ${tool}${detail}`);
              },
              hooks: {
                onProgress: (m) => sendAgentResponse(senderWin, m),
                afterTool: (toolName, _args, result) => {
                  if (toolName === 'scanProject') {
                    applyScanToSession(sessionId, result, senderWin);
                  }
                  if (result?.success && result?.data?.changedFiles) {
                    for (const rel of result.data.changedFiles) {
                      agentTools.notifyTreeRefresh(rel);
                    }
                  }
                },
              },
            }),
          { senderWin }
        );
        if (loopRes.changedFiles?.length) {
          for (const rel of loopRes.changedFiles) {
            agentTools.notifyTreeRefresh(rel);
          }
        }
        pendingExecutions[executionId] = {
          userMessage: message,
          plan: loopRes.log?.map((l) => ({ tool: l.tool, args: l.args })) || [],
          log: loopRes.log,
          success: loopRes.success,
        };
        await deliverFinalAnswer(
          senderWin,
          (loopRes.finalMessage || loopRes.error || 'Agent 结束。') + `\n[执行ID: ${executionId}]`,
          {
            userMessage: message,
            thinkingHint: '多步 Agent 结束，概括已调用工具、修改与结论。',
          }
        );
        const flowAfter = appearanceFlow.getFlowState(sessionId);
        if (
          flowAfter?.phase === 'inquiry' &&
          appearanceFlow.isAppearancePrerequisitesMet(flowAfter, message, conversationHistory) &&
          senderWin &&
          !senderWin.isDestroyed()
        ) {
          senderWin.webContents.send('agent:follow-up-proposal', {
            sessionId,
            preamble: '对话信息已齐。下一步请用按钮确认「沿用原版」与各素材文件：',
            actions: [
              { id: 'start_appearance_wizard', label: '开始素材确认向导', message: '开始素材向导' },
            ],
          });
        }
        sendT3ChangeReport(senderWin, loopRes.changedFiles, 'Agent 多步任务', {
          userMessage: message,
          planSummary: buildRoutePlanDetail('tool_plan', message),
          bodyReport: loopRes.finalMessage,
        });
        return;
      }

      sendAgentResponse(senderWin, '⚠️ 未匹配到可执行的任务类型，请重新描述需求。');
    } catch (err) {
      if (err.code === 'AGENT_ABORTED' || isAbortRequested(chatRunId)) {
        sendAgentResponse(senderWin, '⏹ 任务已终止。');
      } else if (err.cancelled || /用户已取消/.test(err.message || '')) {
        sendAgentResponse(senderWin, '已取消操作。');
      } else if (/before initialization/i.test(err.message || '')) {
        console.error('[Agent IPC] 初始化顺序错误:', err);
        sendAgentResponse(
          senderWin,
          '❌ 内部初始化错误（已记录）。请重试；若仍失败请重启 IDE。常见触发：回退代码、多步 Agent。'
        );
      } else {
        console.error('[Agent IPC] 异常:', err);
        sendAgentResponse(senderWin, `❌ 发生异常: ${err.message}`);
      }
    } finally {
      endRun(chatRunId);
      finishChatTurn(senderWin);
    }
  });
}

module.exports = { registerAgentChatHandler };
