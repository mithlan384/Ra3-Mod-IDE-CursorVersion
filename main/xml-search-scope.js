// main/xml-search-scope.js —— 将 XML 内容搜索限制在 data/xml，避免大 MOD 全盘遍历卡死

const fs = require('fs');
const path = require('path');

const XML_ROOT_CANDIDATES = ['data/xml', 'Data/Xml', 'DATA/XML', 'data\\xml', 'Data\\Xml'];

function getModXmlSearchRoots(projectRoot) {
  if (!projectRoot) return [];
  const roots = [];
  const seen = new Set();
  for (const rel of XML_ROOT_CANDIDATES) {
    const p = path.normalize(path.join(projectRoot, rel));
    if (fs.existsSync(p) && fs.statSync(p).isDirectory() && !seen.has(p)) {
      seen.add(p);
      roots.push(p);
    }
  }
  return roots;
}

function walkScopedFiles(projectRoot, onFile, options = {}) {
  const { extensions = ['.xml'], maxFiles = 25000, skipDirs = new Set(['node_modules', '.git', '.cache']) } =
    options;
  const extSet = new Set(extensions.map((e) => e.toLowerCase()));
  const roots = getModXmlSearchRoots(projectRoot);
  const dirs = roots.length ? roots : [projectRoot];
  let count = 0;

  function walk(dir) {
    if (count >= maxFiles) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (count >= maxFiles) return;
      if (ent.name.startsWith('.') && ent.name !== '.') continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (skipDirs.has(ent.name)) continue;
        walk(full);
      } else if (extSet.has(path.extname(ent.name).toLowerCase())) {
        count += 1;
        onFile(full.replace(/\\/g, '/'));
      }
    }
  }

  for (const root of dirs) walk(root);
}

module.exports = { getModXmlSearchRoots, walkScopedFiles };
