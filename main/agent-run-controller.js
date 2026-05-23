// main/agent-run-controller.js —— Agent 对话运行中终止（用户点击「停止」）

let activeRunId = null;
let abortRequested = false;

function beginRun(runId) {
  activeRunId = runId || `run_${Date.now()}`;
  abortRequested = false;
  return activeRunId;
}

function endRun(runId) {
  if (runId && activeRunId !== runId) return;
  activeRunId = null;
  abortRequested = false;
}

function requestAbort(runId) {
  if (runId && activeRunId !== runId) return false;
  if (!activeRunId) return false;
  abortRequested = true;
  return true;
}

function isAbortRequested(runId) {
  if (!activeRunId) return false;
  if (runId && activeRunId !== runId) return false;
  return abortRequested;
}

function getActiveRunId() {
  return activeRunId;
}

module.exports = {
  beginRun,
  endRun,
  requestAbort,
  isAbortRequested,
  getActiveRunId,
};
