// main/agent-sense-tools.js —— L0 感知/写入工具

const fs = require('fs');
const path = require('path');
const agentTools = require('./agent-tools');
const { getCurrentFolder } = require('./project-state');
const { resolveWithinProject } = require('./path-sandbox');

function resolveRel(file) {
  const root = getCurrentFolder();
  if (!root) return null;
  return resolveWithinProject(root, file);
}

async function readProjectFile(args) {
  const file = args.file || args[0];
  const startLine = Number(args.startLine) || 1;
  const endLine = args.endLine ? Number(args.endLine) : null;
  const full = resolveRel(file);
  if (!full || !fs.existsSync(full)) {
    return { success: false, error: `文件不存在: ${file}` };
  }
  try {
    const content = fs.readFileSync(full, 'utf-8');
    const lines = content.split(/\r?\n/);
    const end = endLine ? Math.min(endLine, lines.length) : lines.length;
    const slice = lines.slice(Math.max(0, startLine - 1), end);
    const rel = path.relative(getCurrentFolder(), full).replace(/\\/g, '/');
    return {
      success: true,
      data: {
        file: rel,
        lineCount: lines.length,
        startLine,
        endLine: end,
        content: slice.join('\n'),
      },
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function writeProjectFile(args, options = {}) {
  const file = args.file || args[0];
  const content = args.content ?? args[1];
  if (content == null) return { success: false, error: '缺少 content' };
  const full = resolveRel(file);
  if (!full) return { success: false, error: '项目未打开' };
  const rel = path.relative(getCurrentFolder(), full).replace(/\\/g, '/');
  if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(rel)) {
    return {
      success: false,
      error: `文件路径不能包含中文：${rel}。请使用英文 PascalCase 单位 ID 作为目录/文件名。`,
    };
  }
  const dir = path.dirname(full);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const root = getCurrentFolder();
  if (/(?:^|\/)mod\.xml$/i.test(rel)) {
    const { prepareModXmlWrite } = require('./mod-xml-guard');
    const prep = prepareModXmlWrite(rel, String(content), root);
    if (!prep.allowed) {
      return {
        success: false,
        error:
          prep.message ||
          `Mod.xml 写入被拒绝：${prep.errors.join('；')}。请使用 registerCreatedUnit / 标准聚合链，勿手写 reference 单位路径。`,
      };
    }
    if (prep.sanitizeLog?.length) {
      console.warn('[mod-xml-guard] writeProjectFile:', prep.sanitizeLog.join('；'));
    }
    content = prep.content;
  }

  const { streamTextToFile } = require('./stream-write');
  await streamTextToFile({
    relativePath: rel,
    content: String(content),
    mode: 'replace',
    chunkSize: options.chunkSize ?? 12,
    delayMs: options.delayMs ?? 16,
    onProgress: options.onProgress,
  });
  agentTools.notifyTreeRefresh(rel);
  return { success: true, data: { file: rel, bytes: Buffer.byteLength(String(content), 'utf8') } };
}

async function grepProject(args) {
  const pattern = args.pattern || args[0];
  return agentTools.searchFiles({ pattern });
}

async function diagnoseBuild(args) {
  const errorLog = args.errorLog || args.errorText || args[0] || '';
  const { getCurrentFolder } = require('./project-state');
  const root = getCurrentFolder();
  const {
    analyzeCompileHealth,
    inferRootCauseFromErrorText,
    formatRootCauseSection,
  } = require('./project-health-check');
  const { assessModXml, collectDataXmlIncludes } = require('./mod-xml-repair');
  const { parseBaeErrors } = require('./unit-xml-repair');

  const issues = [];
  if (root) {
    const health = analyzeCompileHealth(root);
    if (health?.risks?.length) {
      issues.push(...health.risks.map((r) => `[${r.severity}] ${r.message}`));
    }
    const mod = assessModXml(root);
    if (mod.status !== 'ok') issues.push(`Mod.xml: ${mod.hint || mod.status}`);
    const includes = collectDataXmlIncludes(root);
    if (!includes.length) issues.push('data 下未发现可注册的单位 XML');
  }

  const inferred = inferRootCauseFromErrorText(errorLog);
  const bae = parseBaeErrors(errorLog);
  return {
    success: true,
    data: {
      rootCause: inferred,
      rootCauseSection: formatRootCauseSection(inferred),
      baeErrors: bae.slice(0, 20),
      projectIssues: issues,
      hint: '自动修复请调用 fixBuildErrors；不要只给用户教程而不改文件。',
    },
  };
}

const SENSE_TOOL_NAMES = new Set([
  'readProjectFile',
  'writeProjectFile',
  'grepProject',
  'diagnoseBuild',
  'lookupXsdSymbol',
  'grepSdkXsd',
  'readSdkXsd',
]);

async function runSenseTool(name, args, options = {}) {
  switch (name) {
    case 'readProjectFile':
      return readProjectFile(args);
    case 'writeProjectFile':
      return writeProjectFile(args, options);
    case 'grepProject':
      return grepProject(args);
    case 'diagnoseBuild':
      return diagnoseBuild(args);
    case 'lookupXsdSymbol':
    case 'grepSdkXsd':
    case 'readSdkXsd': {
      const { lookupXsdSymbol, grepSdkXsd, readSdkXsd } = require('./xsd-sdk-tools');
      const { app } = require('electron');
      const kbDir = path.join(app.getPath('userData'), '.knowledge');
      if (name === 'lookupXsdSymbol') return lookupXsdSymbol(args.symbol || args[0], kbDir);
      if (name === 'grepSdkXsd') return grepSdkXsd(args);
      return readSdkXsd(args);
    }
    default:
      return null;
  }
}

module.exports = {
  SENSE_TOOL_NAMES,
  readProjectFile,
  writeProjectFile,
  grepProject,
  diagnoseBuild,
  runSenseTool,
};
