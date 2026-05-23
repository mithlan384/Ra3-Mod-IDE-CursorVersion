// main/ai-permission.js —— AI 自主操作权限等级 T1 / T2 / T3

const fs = require('fs');
const path = require('path');
const { getUserDataPath } = require('./electron-safe');

/** @typedef {'t1'|'t2'|'t3'} AiPermissionLevel */
/** @typedef {'per_item'|'batch_all'} AiConfirmationMode */

const VALID_LEVELS = new Set(['t1', 't2', 't3']);
const VALID_CONFIRMATION_MODES = new Set(['per_item', 'batch_all']);

const DESTRUCTIVE_TOOLS = new Set([
  'deleteProjectFile',
  'moveProjectFile',
  'migrateToInsurrectionStandard',
  'refineInsurrectionLayout',
  'rebuildModXmlInsurrection',
  'restoreFile',
]);

/** 仅读取/分析，T1/T2 下无需逐次确认 */
const READ_TOOLS = new Set([
  'readProjectFile',
  'grepProject',
  'diagnoseBuild',
  'readXml',
  'searchFiles',
  'listProjectStructure',
  'scanProject',
  'getUnitInheritance',
  'getUnitFullXml',
  'findUnitsByName',
  'listAllUnits',
  'listAllUnitsDetailed',
  'getWeaponsOfUnit',
  'getXmlStructure',
  'findReferences',
  'webSearch',
  'openFileInEditor',
  'assessInsurrectionCompliance',
  'planInsurrectionMigration',
  'lookupXsdSymbol',
  'grepSdkXsd',
  'readSdkXsd',
]);

const WRITE_TOOLS = new Set([
  'writeProjectFile',
  'writeXml',
  'setUnitProperty',
  'addWeaponToUnit',
  'createUnit',
  'createUnitStreaming',
  'createBuilding',
  'fixBuildErrors',
  'backupFile',
  'scaffoldInsurrectionFramework',
]);

/** T1 下整条路由会改项目（确认方式见 aiConfirmationMode） */
const MUTATING_ROUTES = new Set([
  'fix_build',
  'create_unit',
  'migrate_insurrection',
  'remove_mod',
  'scaffold_framework',
  'project_health_fix',
]);

function readPreferencesSafe() {
  try {
    const prefPath = path.join(getUserDataPath(), 'preferences.json');
    if (fs.existsSync(prefPath)) {
      return JSON.parse(fs.readFileSync(prefPath, 'utf-8'));
    }
  } catch (e) {
    console.warn('[ai-permission] read prefs:', e.message);
  }
  return {};
}

function getAiPermissionLevel() {
  const raw = String(readPreferencesSafe().aiPermissionLevel || 't2').toLowerCase();
  return VALID_LEVELS.has(raw) ? /** @type {AiPermissionLevel} */ (raw) : 't2';
}

/**
 * T1/T2 有效：逐条确认 vs 一次列出方案后确认
 * @returns {AiConfirmationMode}
 */
function getAiConfirmationMode() {
  const level = getAiPermissionLevel();
  if (level === 't3') return 'batch_all';
  const raw = String(readPreferencesSafe().aiConfirmationMode || 'batch_all').toLowerCase();
  return VALID_CONFIRMATION_MODES.has(raw) ? /** @type {AiConfirmationMode} */ (raw) : 'batch_all';
}

function isBatchConfirmationMode() {
  const level = getAiPermissionLevel();
  return level !== 't3' && getAiConfirmationMode() === 'batch_all';
}

function isPerItemConfirmationMode() {
  const level = getAiPermissionLevel();
  return level !== 't3' && getAiConfirmationMode() === 'per_item';
}

function getConfirmationModeLabel(mode = getAiConfirmationMode()) {
  if (mode === 'per_item') return '逐条确认';
  return '确认所有';
}

function getPermissionLevelLabel(level) {
  const map = {
    t1: 'T1 · 读取自动',
    t2: 'T2 · 部分自主',
    t3: 'T3 · 完全自主',
  };
  return map[level] || map.t2;
}

function isReadTool(toolName) {
  return READ_TOOLS.has(toolName);
}

function isDestructiveTool(toolName) {
  return DESTRUCTIVE_TOOLS.has(toolName);
}

function isWriteTool(toolName) {
  return WRITE_TOOLS.has(toolName) || isDestructiveTool(toolName);
}

function isKnownTool(toolName) {
  return isReadTool(toolName) || isWriteTool(toolName);
}

function isMutatingTool(toolName) {
  return isWriteTool(toolName);
}

function isMutatingRoute(route) {
  return MUTATING_ROUTES.has(route);
}

/** 含删除/覆盖等项目内破坏性整批操作（T1/T2 须先确认） */
function isDestructiveRoute(route) {
  return route === 'rollback';
}

/**
 * @param {AiPermissionLevel} level
 * @param {string} route
 * @param {AiConfirmationMode} confirmationMode
 */
function needsRouteConfirmationFor(level, route, confirmationMode, userMessage = '') {
  if (level === 't3') return false;
  if (route === 'readonly_file') return false;
  if (route === 'tool_plan' && userMessage) {
    try {
      const { isReadOnlyFileAnalysisIntent } = require('./project-scanner');
      if (isReadOnlyFileAnalysisIntent(userMessage)) return false;
    } catch (e) {}
  }
  if (isDestructiveRoute(route)) return true;
  if (level === 't2' && (route === 'migrate_insurrection' || route === 'remove_mod')) return true;
  if (level === 't1' && isMutatingRoute(route)) return true;
  if (level !== 't3' && confirmationMode === 'batch_all' && route === 'tool_plan') return true;
  return false;
}

/**
 * 整条对话路由执行前是否需要用户确认
 */
function needsRouteConfirmation(level, route, userMessage = '') {
  return needsRouteConfirmationFor(level, route, getAiConfirmationMode(), userMessage);
}

/**
 * @param {AiPermissionLevel} level
 * @param {string} toolName
 * @param {AiConfirmationMode} confirmationMode
 */
function needsToolConfirmationFor(level, toolName, confirmationMode) {
  if (level === 't3') return false;
  if (isReadTool(toolName)) return false;
  if (!isKnownTool(toolName)) return true;
  if (confirmationMode === 'batch_all') return false;
  if (level === 't1') return isWriteTool(toolName);
  if (level === 't2') return isDestructiveTool(toolName);
  return false;
}

/**
 * Agent 循环内单个工具调用前是否需要确认（仅「逐条确认」模式）
 */
function needsToolConfirmation(level, toolName) {
  return needsToolConfirmationFor(level, toolName, getAiConfirmationMode());
}

function describePermissionBehavior(level) {
  const modeHint =
    level === 't3'
      ? ''
      : `；确认方式：**${getConfirmationModeLabel()}**`;
  if (level === 't1') {
    return (
      '可自动读取、搜索与扫描项目；写入、删除或回退前会' +
      (isBatchConfirmationMode() ? '先展示整体方案并一次确认' : '逐项请求确认') +
      modeHint
    );
  }
  if (level === 't2') {
    return (
      '可自动写入/修改代码；删除、移动、迁移与回退等破坏性操作前会' +
      (isBatchConfirmationMode() ? '先展示整体方案并一次确认' : '逐项请求确认') +
      modeHint
    );
  }
  return '将自动完成所有读写与迁移操作，结束后汇报方案与修改痕迹。';
}

module.exports = {
  VALID_LEVELS,
  VALID_CONFIRMATION_MODES,
  DESTRUCTIVE_TOOLS,
  READ_TOOLS,
  WRITE_TOOLS,
  MUTATING_ROUTES,
  getAiPermissionLevel,
  getAiConfirmationMode,
  isBatchConfirmationMode,
  isPerItemConfirmationMode,
  getConfirmationModeLabel,
  getPermissionLevelLabel,
  describePermissionBehavior,
  isReadTool,
  isDestructiveTool,
  isWriteTool,
  isKnownTool,
  isMutatingTool,
  isMutatingRoute,
  isDestructiveRoute,
  needsRouteConfirmation,
  needsRouteConfirmationFor,
  needsToolConfirmation,
  needsToolConfirmationFor,
};
