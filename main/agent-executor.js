// main/agent-executor.js
const agentTools = require('./agent-tools');
const { plan } = require('./agent-planner');

async function executePlan(steps, onStep, userMessage, hooks = {}) {
  const log = [];
  let currentPlan = steps;
  let retryCount = 0;
  const maxRetries = 3;

  while (retryCount <= maxRetries) {
    let stepFailed = false;
    for (let i = 0; i < currentPlan.length; i++) {
      const step = currentPlan[i];
      const toolName = step.tool;
      // 直接传对象参数，兼容旧数组调用
      const toolArgs = step.args || {};

      let result;
      try {
        if (typeof agentTools[toolName] !== 'function') {
          result = { success: false, error: `工具 ${toolName} 不存在` };
        } else {
          const toolOptions = hooks.onProgress ? { onProgress: hooks.onProgress } : {};
          result = await agentTools[toolName](toolArgs, toolOptions);
        }
      } catch (err) {
        result = { success: false, error: err.message };
      }

      log.push({ stepIndex: i, tool: toolName, args: toolArgs, result });
      if (onStep) {
        onStep(i, step, result);
      }
      if (hooks.afterTool) {
        try {
          await hooks.afterTool(toolName, toolArgs, result);
        } catch (e) {
          console.warn('[executePlan] afterTool hook failed:', e.message);
        }
      }

      if (!result.success) {
        stepFailed = true;
        break;
      }
    }

    if (!stepFailed) {
      return { success: true, log };
    }

    if (retryCount < maxRetries) {
      retryCount++;
      const failedLog = log
        .filter(l => l.result && !l.result.success)
        .map(l => `步骤${l.stepIndex + 1}(${l.tool})失败: ${l.result.error}`)
        .join('\n');
      const retryMessage = `
执行失败：
${failedLog}

原始需求：
${userMessage}

请修复计划，要求：
1. 不要重复失败的工具调用
2. 优先使用 setUnitProperty、addWeaponToUnit 等高级工具
3. 输出 JSON 数组
`;

      let newPlan;
      try {
        newPlan = await plan(retryMessage);
      } catch (err) {
        return { success: false, log, error: `重试时规划调用失败: ${err.message}` };
      }

      if (Array.isArray(newPlan)) {
        currentPlan = newPlan;
        log.push({ retry: retryCount, newPlan });
        if (onStep) {
          onStep(-1, { tool: '_retry', args: { retryCount } }, { success: true, data: '重新规划计划' });
        }
      } else {
        if (newPlan && newPlan.error) {
          return { success: false, log, error: newPlan.error };
        }
        return { success: false, log, error: '重试规划失败，返回格式不正确' };
      }
    } else {
      return { success: false, log, error: '超过最大重试次数' };
    }
  }
}

module.exports = { executePlan };