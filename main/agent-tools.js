// main/agent-tools.js
const fs = require('fs');
const path = require('path');
const { XMLParser, XMLBuilder } = require('fast-xml-parser');
const { getCurrentFolder } = require('./project-state');
const { resolveWithinProject } = require('./path-sandbox');
const { search, formatSearchResultsForDisplay, searchWebWithValidation } = require('./search-engine');
const { loadSearchConfig, readAllowWebSearch } = require('./search-config');

let refreshFileCallback = null;
function setRefreshFileCallback(cb) { refreshFileCallback = cb; }

let openFileCallback = null;
function setOpenFileCallback(cb) { openFileCallback = cb; }

let streamWriteCallback = null;
function setStreamWriteCallback(cb) { streamWriteCallback = cb; }

function notifyStreamWrite(payload) {
  if (streamWriteCallback) streamWriteCallback(payload);
}

function notifyFileRefresh(relativePath) {
  if (refreshFileCallback) refreshFileCallback(relativePath);
}
function notifyOpenFile(relativePath, line = 1, column = 1) {
  if (openFileCallback) openFileCallback(relativePath, line, column);
}

/** 新建/修改文件后刷新左侧文件树 */
function notifyTreeRefresh(relativePath) {
  notifyFileRefresh(relativePath);
}

/** AI 改文件统一走流式写入（编辑器实时显示 + 文件树联动） */
async function persistProjectFileStream(relativePath, content, options = {}) {
  const { streamTextToFile } = require('./stream-write');
  const rel = String(relativePath).replace(/\\/g, '/');
  await streamTextToFile({
    relativePath: rel,
    content,
    mode: options.mode || 'replace',
    chunkSize: options.chunkSize ?? 8,
    delayMs: options.delayMs ?? 20,
    onProgress: options.onProgress,
  });
  return rel;
}

/** 解析为项目内绝对路径；越界返回空字符串 */
function resolvePath(filePath) {
  if (!filePath) return '';
  const root = getCurrentFolder();
  if (!root) return '';
  const safe = resolveWithinProject(root, filePath);
  return safe || '';
}

function pathOutOfSandboxError(filePath, label = '路径') {
  return { success: false, error: `${label}越界或无效: ${filePath || '(空)'}` };
}

function parseXmlFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    isArray: (name) => false,
  });
  return parser.parse(content);
}

function findNodeById(obj, targetId) {
  if (!obj || typeof obj !== 'object') return null;
  if (obj.id && obj.id.toLowerCase() === targetId.toLowerCase()) return obj;
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (Array.isArray(val)) {
      for (const item of val) {
        const found = findNodeById(item, targetId);
        if (found) return found;
      }
    } else if (typeof val === 'object') {
      const found = findNodeById(val, targetId);
      if (found) return found;
    }
  }
  return null;
}

function normalizeArgs(args, paramNames) {
  if (typeof args === 'object' && !Array.isArray(args)) {
    return args;
  }
  if (Array.isArray(args)) {
    const obj = {};
    paramNames.forEach((name, i) => {
      obj[name] = args[i] !== undefined ? args[i] : undefined;
    });
    return obj;
  }
  return {};
}

async function setUnitProperty(args, options = {}) {
  const params = normalizeArgs(args, ['unitId', 'propertyPath', 'newValue']);
  const { unitId, propertyPath, newValue } = params;
  const root = getCurrentFolder();
  if (!root) return { success: false, error: '项目目录未设置' };

  const unitResult = getUnitFullXml({ unitId });
  if (!unitResult.success) return unitResult;

  const file = unitResult.data.file;
  const fullPath = resolvePath(file);
  if (!fullPath) return pathOutOfSandboxError(file, '文件');
  if (!fs.existsSync(fullPath)) return { success: false, error: `文件不存在: ${fullPath}` };

  let obj;
  try {
    obj = parseXmlFile(fullPath);
  } catch (e) {
    return { success: false, error: `XML 解析失败: ${e.message}` };
  }

  const unitNode = findNodeById(obj, unitId);
  if (!unitNode) return { success: false, error: `未找到单位节点: ${unitId}` };

  const parts = propertyPath.split('.');
  let current = unitNode;
  let createdNodes = [];

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (current[part] !== undefined) {
      current = current[part];
    } else {
      const newNode = {};
      current[part] = newNode;
      createdNodes.push({ parent: current, key: part, node: newNode });
      current = newNode;
    }
  }

  const attrName = parts[parts.length - 1];
  const oldValue = current[attrName] !== undefined ? current[attrName] : '无';
  current[attrName] = newValue;

  backupFile({ file: file });

  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    format: true,
    indentBy: '  ',
  });
  let newXml;
  try {
    newXml = builder.build(obj);
    await persistProjectFileStream(file, newXml, options);
  } catch (e) {
    return { success: false, error: `写入 XML 失败: ${e.message}` };
  }

  return {
    success: true,
    data: {
      unitId,
      property: propertyPath,
      oldValue,
      newValue,
      file
    }
  };
}

async function addWeaponToUnit(args, options = {}) {
  const params = normalizeArgs(args, ['unitId', 'weaponTemplate', 'slot']);
  const { unitId, weaponTemplate, slot = 'PRIMARY_WEAPON' } = params;
  const root = getCurrentFolder();
  if (!root) return { success: false, error: '项目目录未设置' };

  const unitResult = getUnitFullXml({ unitId });
  if (!unitResult.success) return unitResult;

  const file = unitResult.data.file;
  const fullPath = resolvePath(file);
  if (!fullPath) return pathOutOfSandboxError(file, '文件');
  if (!fs.existsSync(fullPath)) return { success: false, error: `文件不存在: ${fullPath}` };

  let obj;
  try {
    obj = parseXmlFile(fullPath);
  } catch (e) {
    return { success: false, error: `XML 解析失败: ${e.message}` };
  }

  const unitNode = findNodeById(obj, unitId);
  if (!unitNode) return { success: false, error: `未找到单位节点: ${unitId}` };

  let behaviors = unitNode.Behaviors;
  if (!behaviors) {
    behaviors = {};
    unitNode.Behaviors = behaviors;
  }
  let weaponSet = behaviors.WeaponSetUpdate;
  if (!weaponSet) {
    weaponSet = { id: 'ModuleTag_WeaponSetUpdate' };
    behaviors.WeaponSetUpdate = weaponSet;
  }

  let slotNode = weaponSet.WeaponSlotTurret;
  if (!slotNode) {
    slotNode = { ID: '1' };
    weaponSet.WeaponSlotTurret = slotNode;
  }

  const newWeapon = {
    Ordering: slot,
    Template: weaponTemplate
  };
  if (!slotNode.Weapon) {
    slotNode.Weapon = newWeapon;
  } else {
    const existing = Array.isArray(slotNode.Weapon) ? slotNode.Weapon : [slotNode.Weapon];
    existing.push(newWeapon);
    slotNode.Weapon = existing;
  }

  backupFile({ file });

  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    format: true,
    indentBy: '  ',
  });
  try {
    await persistProjectFileStream(file, builder.build(obj), options);
  } catch (e) {
    return { success: false, error: `写入失败: ${e.message}` };
  }

  return {
    success: true,
    data: {
      unitId,
      addedWeapon: weaponTemplate,
      slot,
      file
    }
  };
}

// ========== 搜索工具 ==========
function findReferences(args) {
  const params = normalizeArgs(args, ['keyword']);
  const { keyword } = params;
  const root = getCurrentFolder();
  if (!root) return { success: false, error: '项目目录未设置' };

  const lowerKeyword = keyword.toLowerCase();
  const results = [];
  function walk(dir) {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(dir, item.name).replace(/\\/g, '/');
      if (item.isDirectory()) {
        walk(fullPath);
      } else {
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const lines = content.split(/\r?\n/);
          const matches = [];
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].toLowerCase().includes(lowerKeyword)) {
              matches.push({ line: i + 1, text: lines[i].trim().substring(0, 120) });
            }
          }
          if (matches.length > 0) {
            results.push({
              file: path.relative(root, fullPath).replace(/\\/g, '/'),
              matchCount: matches.length,
              matches: matches.slice(0, 10)
            });
          }
        } catch (e) {}
      }
    }
  }
  walk(root);
  return { success: true, data: results };
}

function searchFiles(args) {
  const params = normalizeArgs(args, ['pattern', 'dirPath']);
  const { pattern, dirPath } = params;
  let root = getCurrentFolder();
  if (dirPath) {
    root = resolvePath(dirPath);
    if (!root) return pathOutOfSandboxError(dirPath, '目录');
  }
  if (!root || !fs.existsSync(root)) return { success: false, error: '项目目录不存在' };
  const results = [];
  function walk(currentDir) {
    const items = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(currentDir, item.name).replace(/\\/g, '/');
      if (item.isDirectory()) walk(fullPath);
      else {
        const nameMatch = item.name.toLowerCase().includes(pattern.toLowerCase());
        let contentMatch = false;
        let matches = [];
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const lines = content.split(/\r?\n/);
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].toLowerCase().includes(pattern.toLowerCase())) {
              matches.push(`L${i + 1}: ${lines[i].trim().substring(0, 80)}`);
            }
          }
          if (matches.length > 0) contentMatch = true;
        } catch (e) {}
        if (nameMatch || contentMatch) {
          results.push({
            filePath: fullPath,
            relativePath: path.relative(getCurrentFolder(), fullPath).replace(/\\/g, '/'),
            nameMatch,
            matches: contentMatch ? matches.slice(0, 5) : []
          });
        }
      }
    }
  }
  walk(root);
  return { success: true, data: results };
}

function readXml(args) {
  const params = normalizeArgs(args, ['file', 'path']);
  const { file, path: pathStr } = params;
  if (pathStr === undefined) return { success: false, error: '缺少路径参数' };
  const fullPath = resolvePath(file);
  if (!fullPath) return pathOutOfSandboxError(file, '文件');
  if (!fs.existsSync(fullPath)) return { success: false, error: `文件不存在: ${fullPath}` };
  try {
    const obj = parseXmlFile(fullPath);
    const value = getValueByPath(obj, pathStr);
    if (value === undefined) return { success: false, error: `路径 '${pathStr}' 未找到` };
    return { success: true, data: value };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function writeXml(args, options = {}) {
  const params = normalizeArgs(args, ['file', 'path', 'value']);
  const { file, path: pathStr, value: newValue } = params;
  if (pathStr === undefined || newValue === undefined) return { success: false, error: '缺少参数' };
  const fullPath = resolvePath(file);
  if (!fullPath) return pathOutOfSandboxError(file, '文件');
  if (!fs.existsSync(fullPath)) return { success: false, error: `文件不存在: ${fullPath}` };
  try {
    backupFile({ file });
    const obj = parseXmlFile(fullPath);
    const setResult = setValueByPath(obj, pathStr, newValue);
    if (!setResult.success) return setResult;
    const builder = new XMLBuilder({
      ignoreAttributes: false,
      attributeNamePrefix: '',
      format: true,
      indentBy: '  ',
    });
    const relativePath = path.relative(getCurrentFolder(), fullPath).replace(/\\/g, '/');
    await persistProjectFileStream(relativePath, builder.build(obj), options);
    return { success: true, data: { modifiedFile: relativePath } };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function scanProjectTool(_args, options = {}) {
  const { scanProject, formatScanReport, assertFullProjectScanAllowed } = require('./project-scanner');
  const gate = assertFullProjectScanAllowed(options.userMessage || '');
  if (!gate.ok) return { success: false, error: gate.error };
  const scanRes = await scanProject({ onProgress: options.onProgress });
  if (!scanRes.success) return scanRes;
  return {
    success: true,
    data: {
      ...scanRes.data,
      stats: scanRes.data.stats,
      modXml: scanRes.data.modXml,
      unitCount: scanRes.data.units.length,
      report: formatScanReport(scanRes.data),
      compactForLLM: scanRes.data.compactForLLM,
      scan: scanRes.data,
    },
  };
}

function listProjectStructure(args) {
  const params = normalizeArgs(args, ['subDir']);
  const { subDir = '' } = params;
  const root = getCurrentFolder();
  if (!root) return { success: false, error: '项目目录未设置' };
  const targetDir = subDir ? resolvePath(subDir) : root;
  if (subDir && !targetDir) return pathOutOfSandboxError(subDir, '目录');
  if (!fs.existsSync(targetDir)) return { success: false, error: `目录不存在: ${targetDir}` };
  function readTree(dir, depth = 0, maxDepth = 2, maxItems = 100) {
    if (depth > maxDepth) return null;
    const items = fs.readdirSync(dir, { withFileTypes: true });
    const result = { name: path.basename(dir), path: dir.replace(/\\/g, '/'), type: 'directory', children: [] };
    let count = 0;
    for (const item of items) {
      if (count >= maxItems) break;
      const childPath = path.join(dir, item.name).replace(/\\/g, '/');
      if (item.isDirectory()) {
        const childTree = readTree(childPath, depth + 1, maxDepth, maxItems - count);
        if (childTree) { result.children.push(childTree); count++; }
      } else {
        result.children.push({ name: item.name, path: childPath, type: 'file' });
        count++;
      }
    }
    return result;
  }
  return { success: true, data: readTree(targetDir) };
}

function getUnitInheritance(args) {
  const params = normalizeArgs(args, ['unitId']);
  const { unitId } = params;
  const root = getCurrentFolder();
  if (!root) return { success: false, error: '项目目录未设置' };
  const chain = [];
  let currentId = unitId;
  const visited = new Set();
  while (currentId) {
    if (visited.has(currentId)) return { success: false, error: `继承循环: ${currentId}` };
    visited.add(currentId);
    const files = searchFilesContent(`id="${currentId}"`);
    let foundNode = null;
    for (const f of files) {
      try {
        const obj = parseXmlFile(f);
        const node = findNodeById(obj, currentId);
        if (node) { foundNode = node; break; }
      } catch (e) {}
    }
    if (!foundNode) {
      chain.push({ id: currentId, inheritFrom: null, file: null });
      break;
    }
    chain.push({ id: currentId, inheritFrom: foundNode.inheritFrom || null, file: foundNode._file || null });
    currentId = foundNode.inheritFrom || null;
  }
  return { success: true, data: chain };
}

function backupFile(args) {
  const params = normalizeArgs(args, ['file']);
  const { file } = params;
  const fullPath = resolvePath(file);
  if (!fullPath) return pathOutOfSandboxError(file, '文件');
  if (!fs.existsSync(fullPath)) return { success: false, error: `文件不存在: ${fullPath}` };
  const bakPath = fullPath + '.bak';
  try {
    fs.copyFileSync(fullPath, bakPath);
    return { success: true, data: path.relative(getCurrentFolder(), bakPath).replace(/\\/g, '/') };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function restoreFile(args) {
  const params = normalizeArgs(args, ['file']);
  const { file } = params;
  const fullPath = resolvePath(file);
  if (!fullPath) return pathOutOfSandboxError(file, '文件');
  const bakPath = fullPath + '.bak';
  if (!fs.existsSync(bakPath)) return { success: false, error: `备份文件不存在: ${bakPath}` };
  try {
    fs.copyFileSync(bakPath, fullPath);
    const relativePath = path.relative(getCurrentFolder(), fullPath).replace(/\\/g, '/');
    notifyFileRefresh(relativePath);
    return { success: true, data: { restoredFile: relativePath } };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function openFileInEditor(args) {
  const params = normalizeArgs(args, ['filePath', 'line', 'column']);
  const { filePath, line = 1, column = 1 } = params;
  if (!filePath) return { success: false, error: '请指定要打开的文件' };
  const fullPath = resolvePath(filePath);
  if (!fullPath) return pathOutOfSandboxError(filePath, '文件');
  if (!fs.existsSync(fullPath)) return { success: false, error: `文件不存在: ${fullPath}` };
  const relative = path.relative(getCurrentFolder(), fullPath).replace(/\\/g, '/');
  notifyOpenFile(relative, line, column);
  return { success: true, data: { file: relative, line, column } };
}

function getXmlStructure(args) {
  const params = normalizeArgs(args, ['file', 'depth']);
  const { file, depth = 2 } = params;
  const fullPath = resolvePath(file);
  if (!fullPath) return pathOutOfSandboxError(file, '文件');
  if (!fs.existsSync(fullPath)) return { success: false, error: `文件不存在: ${fullPath}` };
  try {
    const obj = parseXmlFile(fullPath);
    return { success: true, data: extractStructure(obj, 0, Math.min(depth, 3)) };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function extractStructure(obj, currentDepth, maxDepth) {
  if (currentDepth > maxDepth || typeof obj !== 'object' || obj === null) return null;
  if (Array.isArray(obj)) return obj.length > 0 ? extractStructure(obj[0], currentDepth, maxDepth) : [];
  const result = {};
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      result[key] = extractStructure(val, currentDepth + 1, maxDepth);
    } else if (Array.isArray(val) && val.length > 0) {
      result[key] = `Array of ${val.length}, first: ${JSON.stringify(extractStructure(val[0], currentDepth + 1, maxDepth))}`;
    } else {
      result[key] = typeof val;
    }
  }
  return result;
}

function getValueByPath(obj, pathStr) {
  if (!obj || !pathStr) return undefined;
  const parts = pathStr.split('.');
  let current = obj;
  for (const part of parts) {
    const match = part.match(/^(.+?)\[(\d+)\]$/);
    if (match) {
      const name = match[1];
      const idx = parseInt(match[2]);
      current = current[name];
      if (Array.isArray(current)) current = current[idx];
      else return undefined;
    } else {
      current = current[part];
    }
    if (current === undefined) return undefined;
  }
  return current;
}

function setValueByPath(obj, pathStr, value) {
  const parts = pathStr.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    const match = part.match(/^(.+?)\[(\d+)\]$/);
    if (match) {
      const name = match[1];
      const idx = parseInt(match[2]);
      if (!current[name]) return { success: false, error: `路径不存在: ${part}` };
      current = current[name];
      if (Array.isArray(current)) current = current[idx];
      else return { success: false, error: `不是数组: ${part}` };
    } else {
      if (current[part] === undefined) return { success: false, error: `路径不存在: ${part}` };
      current = current[part];
    }
  }
  const lastPart = parts[parts.length - 1];
  const lastMatch = lastPart.match(/^(.+?)\[(\d+)\]$/);
  if (lastMatch) {
    const name = lastMatch[1];
    const idx = parseInt(lastMatch[2]);
    if (!Array.isArray(current[name])) return { success: false, error: '目标不是数组' };
    current[name][idx] = value;
  } else {
    current[lastPart] = value;
  }
  return { success: true };
}

function searchFilesContent(pattern) {
  const root = getCurrentFolder();
  if (!root) return [];
  const { walkScopedFiles } = require('./xml-search-scope');
  const results = [];
  const lowerPattern = pattern.toLowerCase();
  walkScopedFiles(
    root,
    (fullPath) => {
      try {
        if (fs.readFileSync(fullPath, 'utf-8').toLowerCase().includes(lowerPattern)) {
          results.push(fullPath);
        }
      } catch (e) {}
    },
    { extensions: ['.xml'] }
  );
  return results;
}

// ========== 语义查询工具 ==========
function findUnitsByName(args) {
  const params = normalizeArgs(args, ['keyword']);
  const { keyword } = params;
  const root = getCurrentFolder();
  if (!root) return { success: false, error: '项目目录未设置' };
  const { walkScopedFiles } = require('./xml-search-scope');
  const results = [];
  const processXmlFile = (fullPath) => {
    if (!fullPath.endsWith('.xml')) return;
    try {
      const obj = parseXmlFile(fullPath);
      const unitNodes = [];
      const collect = (node) => {
        if (!node || typeof node !== 'object') return;
        if (
          node.id &&
          !node.id.startsWith('ModuleTag_') &&
          !node.id.startsWith('Command_') &&
          !node.id.endsWith('CommandSet')
        ) {
          if (node.Behaviors || node.Body || node.Draws || node.AI || node.WeaponSetUpdate) {
            unitNodes.push(node.id);
          }
        }
        for (const key of Object.keys(node)) {
          const child = node[key];
          if (Array.isArray(child)) child.forEach((c) => collect(c));
          else if (typeof child === 'object') collect(child);
        }
      };
      collect(obj);
      const matched = unitNodes.filter((id) => id.toLowerCase().includes(keyword.toLowerCase()));
      if (matched.length > 0 || fullPath.toLowerCase().includes(keyword.toLowerCase())) {
        results.push({
          file: path.relative(root, fullPath).replace(/\\/g, '/'),
          unitIds: matched,
          allIds: unitNodes.slice(0, 30),
        });
      }
    } catch (e) {}
  };
  walkScopedFiles(root, processXmlFile, { extensions: ['.xml'] });
  return { success: true, data: results };
}

function getUnitFullXml(args) {
  const params = normalizeArgs(args, ['unitId']);
  const { unitId } = params;
  const root = getCurrentFolder();
  if (!root) return { success: false, error: '项目目录未设置' };
  const files = searchFilesContent(`id="${unitId}"`);
  let targetFile = null;
  let xmlContent = null;
  for (const f of files) {
    try {
      const obj = parseXmlFile(f);
      const node = findNodeById(obj, unitId);
      if (node && (obj.GameObject || obj.Unit || node.GameObject || node.Unit || node.Behaviors || node.Body)) {
        targetFile = f;
        xmlContent = fs.readFileSync(f, 'utf-8');
        break;
      }
    } catch (e) {}
  }
  if (!targetFile) {
    try {
      const { loadVanillaUnitXml } = require('./vanilla-unit-loader');
      const vanilla = loadVanillaUnitXml(unitId);
      if (vanilla?.content) {
        return {
          success: true,
          data: {
            file: vanilla.dataInclude || vanilla.rel,
            xml: vanilla.content,
            source: 'sagexml',
            sagePath: vanilla.rel,
          },
        };
      }
    } catch (e) {}
    return { success: false, error: `未找到单位 '${unitId}' 的定义文件` };
  }
  const relativeFile = path.relative(root, targetFile).replace(/\\/g, '/');
  return { success: true, data: { file: relativeFile, xml: xmlContent, source: 'project' } };
}

function collectUnitsFromXml(fullPath, root, out) {
  try {
    const obj = parseXmlFile(fullPath);
    const relFile = path.relative(root, fullPath).replace(/\\/g, '/');
    const collect = (node) => {
      if (!node || typeof node !== 'object') return;
      if (
        node.id &&
        !node.id.startsWith('ModuleTag_') &&
        !node.id.startsWith('Command_') &&
        !node.id.endsWith('CommandSet') &&
        !node.id.match(/^\d+$/)
      ) {
        if (node.Behaviors || node.Body || node.Draws || node.AI || node.WeaponSetUpdate || node.GameObject) {
          out.push({ id: node.id, file: relFile });
        }
      }
      for (const key of Object.keys(node)) {
        const child = node[key];
        if (Array.isArray(child)) child.forEach((c) => collect(c));
        else if (typeof child === 'object') collect(child);
      }
    };
    collect(obj);
  } catch (e) {}
}

function listAllUnitsDetailed() {
  const root = getCurrentFolder();
  if (!root) return { success: false, error: '项目目录未设置' };
  const units = [];
  const walkDir = (dir) => {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(dir, item.name).replace(/\\/g, '/');
      if (item.isDirectory()) walkDir(fullPath);
      else if (item.name.endsWith('.xml')) collectUnitsFromXml(fullPath, root, units);
    }
  };
  walkDir(root);
  const seen = new Set();
  const deduped = [];
  for (const u of units) {
    const key = u.id + '|' + u.file;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(u);
  }
  deduped.sort((a, b) => a.id.localeCompare(b.id));
  return { success: true, data: { units: deduped, count: deduped.length } };
}

function listAllUnits() {
  const detailed = listAllUnitsDetailed();
  if (!detailed.success) return detailed;
  return { success: true, data: detailed.data.units.map((u) => u.id) };
}

function getWeaponsOfUnit(args) {
  const params = normalizeArgs(args, ['unitId']);
  const { unitId } = params;
  const root = getCurrentFolder();
  if (!root) return { success: false, error: '项目目录未设置' };
  const result = getUnitFullXml({ unitId });
  if (!result.success) return result;
  try {
    const obj = parseXmlFile(path.join(root, result.data.file));
    const node = findNodeById(obj, unitId);
    if (!node) return { success: false, error: `无法定位单位节点 ${unitId}` };
    const weapons = [];
    let weaponSet = node.WeaponSetUpdate || node.Behaviors?.WeaponSetUpdate;
    if (weaponSet) {
      const slots = weaponSet.WeaponSlotTurret || weaponSet.WeaponSlot || [];
      const slotList = Array.isArray(slots) ? slots : [slots];
      for (const slot of slotList) {
        const weaponList = slot.Weapon || [];
        const weaponsInSlot = Array.isArray(weaponList) ? weaponList : [weaponList];
        for (const w of weaponsInSlot) {
          weapons.push({ slot: slot.ID || w.Ordering || '未知', template: w.Template || w.id || '未知', forbiddenStatus: w.ForbiddenObjectStatus || '' });
        }
      }
    }
    if (node.Weapon) {
      const list = Array.isArray(node.Weapon) ? node.Weapon : [node.Weapon];
      for (const w of list) weapons.push({ slot: '直接', template: w.Template || w.id || '未知' });
    }
    return { success: true, data: { unitId, weapons } };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ========== 创建单位/建筑工具 ==========
async function createUnit(args, options = {}) {
  const { buildUnitXml } = require('./unit-xml-builder');
  const { streamTextToFile, streamTextToFiles } = require('./stream-write');
  const params = normalizeArgs(args, [
    'unitId',
    'templateUnit',
    'displayName',
    'description',
    'rawMessage',
    'unitSpec',
  ]);
  const built = buildUnitXml({ ...params, session: options.session || null });
  if (!built.success) return built;
  const { targetFile, xmlContent, unitId, displayName, files } = built.data;
  backupFile({ file: targetFile });
  let relativeFiles;
  if (files?.length) {
    await streamTextToFiles(
      files.map((f, i) => ({
        relativePath: f.rel,
        content: f.content,
        fast: files.length > 2 && i > 0 && !/GameObject\.xml$/i.test(f.rel),
      })),
      { onProgress: options.onProgress, delayMs: 20 }
    );
    relativeFiles = files.map((f) => f.rel);
  } else {
    await streamTextToFile({
      relativePath: targetFile,
      content: xmlContent,
      onProgress: options.onProgress,
      delayMs: 20,
    });
    relativeFiles = [targetFile];
  }

  const { finalizeUnitAfterCreate } = require('./create-unit-post');
  const post = await finalizeUnitAfterCreate(
    { ...built.data, file: relativeFiles[0], files: relativeFiles },
    params,
    { onProgress: options.onProgress, notifyTreeRefresh }
  );

  return {
    success: true,
    data: {
      unitId,
      displayName: displayName || unitId,
      file: relativeFiles[0],
      files: relativeFiles,
      layout: built.data.layout,
      wrapperRel: built.data.wrapperRel,
      side: built.data.side,
      registrationLog: post.log,
      changedFiles: post.changedFiles,
    },
  };
}

async function createBuilding(args, options = {}) {
  const params = normalizeArgs(args, ['buildingId', 'template', 'displayName']);
  const { buildingId, template, displayName } = params;
  const root = getCurrentFolder();
  if (!root) return { success: false, error: '项目目录未设置' };
  if (!buildingId) return { success: false, error: '请指定建筑 ID' };

  const display = displayName || buildingId;
  const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<Building
  xmlns="uri:ea.com:eala:asset"
  id="${buildingId}"
  inheritFrom="BaseBuilding"
  Side="Allied"
  ProductionTime="20"
  CommandSet="${buildingId}CommandSet"
  KindOf="SELECTABLE STRUCTURE"
  DisplayName="${display}"
  Cost="600">
  <Behaviors>
    <Body id="ModuleTag_Body">
      <MaxHealth>500</MaxHealth>
      <ArmorSet>StructureArmor</ArmorSet>
    </Body>
  </Behaviors>
</Building>`;

  const buildingsDir = path.join(root, 'data', 'XML', 'Buildings');
  if (!fs.existsSync(buildingsDir)) fs.mkdirSync(buildingsDir, { recursive: true });
  const filePath = path.join(buildingsDir, buildingId + '.xml').replace(/\\/g, '/');
  const relativeFile = path.relative(root, filePath).replace(/\\/g, '/');
  await persistProjectFileStream(relativeFile, xmlContent, options);
  return { success: true, data: { buildingId, displayName: display, file: relativeFile } };
}

// ========== webSearch：真实联网搜索 + 相关性校验 ==========
async function webSearch(args) {
  const params = normalizeArgs(args, ['query', 'maxResults', 'preferWeb', 'forceWeb']);
  const { query, maxResults = 5, forceWeb = false } = params;
  if (!query || query.trim() === '') {
    return { success: false, error: '搜索关键词不能为空' };
  }

  const preferWeb = forceWeb || params.preferWeb !== false;
  const limit = Math.min(maxResults, 8);

  console.log('[webSearch] 原始:', query, 'preferWeb:', preferWeb);

  try {
    if (forceWeb || preferWeb) {
      const config = loadSearchConfig({ preferWeb: true });
      const validated = await searchWebWithValidation(query, limit, { config });
      return {
        success: true,
        data: {
          query,
          actualQuery: validated.actualQuery,
          results: validated.results,
          displayText: validated.displayText,
          usedRealWeb: validated.usedRealWeb,
          searchEngine: validated.engine,
          isLowQuality: validated.isLowQuality,
          retried: validated.retried,
        },
      };
    }

    const config = loadSearchConfig({ preferWeb: false });
    const results = await search(query, { maxResults: limit, config });
    return {
      success: true,
      data: {
        query,
        results,
        displayText: formatSearchResultsForDisplay(results),
        usedRealWeb: false,
        searchEngine: 'offline/llm',
      },
    };
  } catch (err) {
    console.error('[webSearch] 失败:', err.message);
    try {
      const llmResults = await search(query, { maxResults: limit, config: { provider: 'llm' } });
      return {
        success: true,
        data: {
          query,
          results: llmResults,
          displayText: `⚠️ 联网失败 (${err.message})，以下为 AI 知识回答：\n\n${formatSearchResultsForDisplay(llmResults)}`,
          usedRealWeb: false,
          searchEngine: 'llm-fallback',
        },
      };
    } catch (llmErr) {
      return { success: false, error: `联网搜索失败: ${err.message}；LLM 兜底失败: ${llmErr.message}` };
    }
  }
}

/** 流式写入单位 XML（编辑器打字机效果，Cline 风格） */
async function createUnitStreaming(args, options = {}) {
  const { buildUnitXml } = require('./unit-xml-builder');
  const { streamTextToFile } = require('./stream-write');
  const { onProgress, session } = options;
  const params = normalizeArgs(args, [
    'unitId',
    'templateUnit',
    'displayName',
    'description',
    'rawMessage',
    'unitSpec',
  ]);
  const built = buildUnitXml({ ...params, session: session || null });
  if (!built.success) return built;

  const { targetFile, xmlContent, unitId, displayName, files } = built.data;
  const written = [];

  if (files?.length) {
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const isPrimary = /GameObject\.xml$/i.test(f.rel) || i === 0;
      onProgress?.(`📝 写入 ${f.rel}…`);
      await streamTextToFile({
        relativePath: f.rel,
        content: f.content,
        mode: 'replace',
        chunkSize: isPrimary ? options.chunkSize || 8 : 512,
        delayMs: isPrimary ? options.delayMs || 32 : 0,
        fast: !isPrimary && files.length > 2,
        onProgress: isPrimary ? onProgress : undefined,
      });
      written.push(f.rel);
    }
  } else {
    await streamTextToFile({
      relativePath: targetFile,
      content: xmlContent,
      mode: 'replace',
      chunkSize: options.chunkSize || 8,
      delayMs: options.delayMs || 32,
      onProgress,
    });
    written.push(targetFile);
  }

  const { finalizeUnitAfterCreate } = require('./create-unit-post');
  const post = await finalizeUnitAfterCreate(
    {
      ...built.data,
      file: written[0],
      files: written,
    },
    params,
    { onProgress, notifyTreeRefresh: notifyTreeRefresh }
  );

  return {
    success: true,
    data: {
      unitId,
      displayName,
      file: written[0],
      files: written,
      layout: built.data.layout,
      wrapperRel: built.data.wrapperRel,
      side: built.data.side,
      registrationLog: post.log,
      changedFiles: post.changedFiles,
    },
  };
}

function deleteProjectFileTool(args) {
  const params = normalizeArgs(args, ['file']);
  const root = getCurrentFolder();
  if (!root) return { success: false, error: '项目目录未设置' };
  const { deleteProjectFile } = require('./insurrection-migrate');
  try {
    const result = deleteProjectFile(root, params.file);
    if (result.success) notifyTreeRefresh(params.file);
    return result;
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function moveProjectFileTool(args) {
  const params = normalizeArgs(args, ['from', 'to']);
  const root = getCurrentFolder();
  if (!root) return { success: false, error: '项目目录未设置' };
  const { moveProjectFile } = require('./insurrection-migrate');
  try {
    const result = moveProjectFile(root, params.from, params.to);
    if (result.success) {
      notifyTreeRefresh(params.from);
      notifyTreeRefresh(params.to);
    }
    return result;
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function rebuildModXmlInsurrectionTool(args, options = {}) {
  const root = getCurrentFolder();
  if (!root) return { success: false, error: '项目目录未设置' };
  const params = normalizeArgs(args, ['dryRun']);
  const { rebuildModXmlInsurrection } = require('./insurrection-migrate');
  const dryRun = params.dryRun === true || params.dryRun === 'true';
  try {
    const result = rebuildModXmlInsurrection(root, { dryRun, ...options });
    if (!dryRun && result.data?.written) {
      for (const rel of result.data.written) notifyTreeRefresh(rel);
    }
    return result;
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function assessInsurrectionComplianceTool() {
  const root = getCurrentFolder();
  if (!root) return { success: false, error: '项目目录未设置' };
  const { assessInsurrectionCompliance } = require('./insurrection-migrate');
  const assessment = assessInsurrectionCompliance(root);
  return { success: true, data: assessment };
}

function planInsurrectionMigrationTool() {
  const root = getCurrentFolder();
  if (!root) return { success: false, error: '项目目录未设置' };
  const { buildMigrationPlan } = require('./insurrection-migrate');
  const plan = buildMigrationPlan(root);
  return { success: true, data: plan };
}

async function refineInsurrectionLayoutTool(args, options = {}) {
  const root = getCurrentFolder();
  if (!root) return { success: false, error: '项目目录未设置' };
  const { refineInsurrectionLayout } = require('./insurrection-migrate');
  const result = await refineInsurrectionLayout(root, { onProgress: options.onProgress });
  if (result.changedFiles?.length) {
    for (const rel of result.changedFiles) {
      if (!String(rel).startsWith('(deleted)')) notifyTreeRefresh(rel);
    }
  }
  return {
    success: result.success,
    data: {
      compliant: result.compliant,
      report: result.report,
      changedFiles: result.changedFiles,
      assessment: result.assessment,
    },
    error: result.success ? undefined : '布局精炼未完成验收',
  };
}

async function migrateToInsurrectionStandardTool(args, options = {}) {
  const root = getCurrentFolder();
  if (!root) return { success: false, error: '项目目录未设置' };
  const params = normalizeArgs(args, ['dryRun']);
  const { migrateToInsurrectionStandard } = require('./insurrection-migrate');
  const dryRun = params.dryRun === true || params.dryRun === 'true';
  const result = await migrateToInsurrectionStandard(root, {
    dryRun,
    onProgress: options.onProgress,
  });
  if (!dryRun && result.changedFiles?.length) {
    for (const rel of result.changedFiles) {
      if (!rel.startsWith('(deleted)')) notifyTreeRefresh(rel.replace(/^\(deleted\)\s*/, ''));
    }
  }
  return {
    success: result.success,
    data: {
      compliant: result.compliant,
      layoutProfile: result.layoutProfile,
      report: result.report,
      changedFiles: result.changedFiles,
      assessment: result.assessment,
      plan: result.plan,
    },
    error: result.success ? undefined : '迁移未完成：未通过结构验收',
  };
}

async function fixBuildErrors(args, options = {}) {
  const params = normalizeArgs(args, ['errorLog', 'allowWebSearch', 'errorText']);
  const errorText = params.errorLog || params.errorText || '';
  const { executeBuildErrorFix } = require('./build-error-fixer');
  const { onProgress } = options;

  const result = await executeBuildErrorFix({
    errorText,
    allowWebSearch: params.allowWebSearch !== false,
    onProgress,
  });

  return {
    success: result.success,
    data: {
      report: result.report,
      changedFiles: result.changedFiles || [],
      modStatus: result.diagnosis?.modState?.status,
    },
    error: result.error,
  };
}

module.exports = {
  searchFiles,
  readXml,
  writeXml,
  listProjectStructure,
  scanProject: scanProjectTool,
  getUnitInheritance,
  backupFile,
  restoreFile,
  openFileInEditor,
  getXmlStructure,
  findUnitsByName,
  getUnitFullXml,
  listAllUnits,
  listAllUnitsDetailed,
  getWeaponsOfUnit,
  setUnitProperty,
  addWeaponToUnit,
  createUnit,
  createBuilding,
  findReferences,
  webSearch,
  createUnitStreaming,
  fixBuildErrors,
  deleteProjectFile: deleteProjectFileTool,
  moveProjectFile: moveProjectFileTool,
  rebuildModXmlInsurrection: rebuildModXmlInsurrectionTool,
  assessInsurrectionCompliance: assessInsurrectionComplianceTool,
  planInsurrectionMigration: planInsurrectionMigrationTool,
  migrateToInsurrectionStandard: migrateToInsurrectionStandardTool,
  refineInsurrectionLayout: refineInsurrectionLayoutTool,
  notifyTreeRefresh,
  setRefreshFileCallback,
  setOpenFileCallback,
  setStreamWriteCallback,
};