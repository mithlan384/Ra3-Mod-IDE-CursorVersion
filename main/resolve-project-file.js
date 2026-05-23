// main/resolve-project-file.js —— 项目内路径解析（含大小写/中文文件名容错）

const fs = require('fs');
const path = require('path');
const { resolveWithinProject, normalizeSlashes, tryRealpath } = require('./path-sandbox');

const MAX_BASENAME_SCAN_DEPTH = 12;
const MAX_BASENAME_SCAN_FILES = 12000;

function fixCaseInDir(safePath) {
  if (!safePath || fs.existsSync(safePath)) return safePath;
  const dirPath = path.dirname(safePath);
  const targetName = path.basename(safePath).toLowerCase();
  try {
    const items = fs.readdirSync(dirPath);
    for (const item of items) {
      if (item.toLowerCase() === targetName) {
        return path.join(dirPath, item).replace(/\\/g, '/');
      }
    }
  } catch {
    return null;
  }
  return null;
}

/** 若绝对路径含 Mods/<mod>/... 且与当前项目 mod 名一致，映射到项目根下相对路径 */
function remapSiblingModAbsolutePath(projectRoot, raw) {
  const root = normalizeSlashes(projectRoot);
  const abs = normalizeSlashes(raw);
  const m = abs.match(/\/Mods\/([^/]+)\/(.+)$/i);
  if (!m) return null;
  const [, modName, tail] = m;
  const projectMod = path.basename(root);
  if (modName.toLowerCase() !== projectMod.toLowerCase()) return null;
  const candidate = path.join(root, tail).replace(/\\/g, '/');
  return resolveWithinProject(root, candidate);
}

function findByBasename(projectRoot, basename, depth = 0, scanned = { n: 0 }) {
  if (!basename || depth > MAX_BASENAME_SCAN_DEPTH || scanned.n > MAX_BASENAME_SCAN_FILES) {
    return null;
  }
  let entries;
  try {
    entries = fs.readdirSync(projectRoot, { withFileTypes: true });
  } catch {
    return null;
  }
  const target = basename.toLowerCase();
  for (const ent of entries) {
    if (scanned.n > MAX_BASENAME_SCAN_FILES) return null;
    scanned.n++;
    const full = path.join(projectRoot, ent.name);
    if (ent.isFile() && ent.name.toLowerCase() === target) {
      return full.replace(/\\/g, '/');
    }
    if (ent.isDirectory() && !ent.name.startsWith('.')) {
      const hit = findByBasename(full, basename, depth + 1, scanned);
      if (hit) return hit;
    }
  }
  return null;
}

function resolveProjectFile(projectRoot, filePath) {
  if (!projectRoot || !filePath) return null;

  let safePath = resolveWithinProject(projectRoot, filePath);
  if (safePath) {
    if (fs.existsSync(safePath)) return safePath;
    return fixCaseInDir(safePath);
  }

  const raw = normalizeSlashes(filePath);
  const remapped = remapSiblingModAbsolutePath(projectRoot, raw);
  if (remapped && fs.existsSync(remapped)) return remapped;

  if (path.isAbsolute(raw) && fs.existsSync(raw)) {
    const rootResolved = tryRealpath(path.resolve(projectRoot));
    const targetResolved = tryRealpath(path.resolve(raw));
    if (rootResolved && targetResolved) {
      const rel = path.relative(rootResolved, targetResolved);
      if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) {
        return targetResolved.replace(/\\/g, '/');
      }
    }
  }

  const base = path.basename(raw);
  const byName = findByBasename(path.resolve(projectRoot), base);
  if (byName) {
    const canonical = resolveWithinProject(projectRoot, byName);
    if (canonical && fs.existsSync(canonical)) return canonical;
  }

  return null;
}

module.exports = { resolveProjectFile, fixCaseInDir };
