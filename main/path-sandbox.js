// main/path-sandbox.js —— 将文件操作限制在当前项目根目录内

const fs = require('fs');
const path = require('path');
const { getCurrentFolder } = require('./project-state');

function normalizeSlashes(p) {
  return String(p || '').replace(/\\/g, '/');
}

function tryRealpath(absPath) {
  if (!absPath) return null;
  try {
    return fs.realpathSync.native(absPath);
  } catch {
    try {
      return fs.realpathSync(absPath);
    } catch {
      return path.resolve(absPath);
    }
  }
}

function isInsideRoot(rootResolved, targetResolved) {
  if (!rootResolved || !targetResolved) return false;
  const rel = path.relative(rootResolved, targetResolved);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * 解析路径并校验位于 projectRoot 内；越界返回 null
 */
function resolveWithinProject(projectRoot, fileOrDirPath, options = {}) {
  const raw = normalizeSlashes(fileOrDirPath);
  if (!raw) return null;

  const root = projectRoot || getCurrentFolder();
  if (!root) {
    if (options.allowOutsideProject) {
      return path.isAbsolute(raw) ? path.resolve(raw).replace(/\\/g, '/') : null;
    }
    return null;
  }

  const rootResolved = tryRealpath(path.resolve(root)) || path.resolve(root);
  const targetResolved = path.isAbsolute(raw)
    ? tryRealpath(path.resolve(raw)) || path.resolve(raw)
    : tryRealpath(path.resolve(rootResolved, raw)) || path.resolve(rootResolved, raw);

  if (!isInsideRoot(rootResolved, targetResolved)) {
    console.warn(
      '[path-sandbox] 拒绝越界路径:',
      raw,
      '| 当前项目根:',
      normalizeSlashes(root)
    );
    return null;
  }

  return targetResolved.replace(/\\/g, '/');
}

/**
 * 判断 child 是否在 parent 目录树内（realpath + relative，跨平台）
 */
function isPathInsideResolved(parentPath, childPath) {
  if (!parentPath || !childPath) return false;
  try {
    const parentResolved = tryRealpath(path.resolve(parentPath)) || path.resolve(parentPath);
    const childResolved = tryRealpath(path.resolve(childPath)) || path.resolve(childPath);
    return isInsideRoot(parentResolved, childResolved);
  } catch {
    return false;
  }
}

module.exports = {
  resolveWithinProject,
  normalizeSlashes,
  isInsideRoot,
  isPathInsideResolved,
  tryRealpath,
};
