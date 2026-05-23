// main/agent-max-steps.js —— 解析首选项 / AI 配置中的 Agent 最大步数

const DEFAULT_AGENT_MAX_STEPS = 24;

/**
 * @param {number|string|undefined|null} raw
 * @returns {{ unlimited: boolean, maxSteps: number, displayLabel: string }}
 */
function resolveAgentMaxSteps(raw) {
  const n = parseInt(raw, 10);
  if (raw === 0 || raw === '0' || n === 0) {
    return { unlimited: true, maxSteps: 0, displayLabel: '无限制' };
  }
  if (!Number.isFinite(n) || n < 1) {
    return {
      unlimited: false,
      maxSteps: DEFAULT_AGENT_MAX_STEPS,
      displayLabel: String(DEFAULT_AGENT_MAX_STEPS),
    };
  }
  return { unlimited: false, maxSteps: n, displayLabel: String(n) };
}

module.exports = { DEFAULT_AGENT_MAX_STEPS, resolveAgentMaxSteps };
