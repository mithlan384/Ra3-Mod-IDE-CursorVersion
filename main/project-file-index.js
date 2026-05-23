// main/project-file-index.js —— 项目文件索引（供文件树搜索）

const fs = require('fs');
const path = require('path');

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  '.ra3-ide',
  '.cache',
  'builtmods',
]);

const MAX_FILES = 80000;
const YIELD_EVERY_DIRS = 80;

function indexProjectFiles(projectRoot) {
  if (!projectRoot || !fs.existsSync(projectRoot)) return [];

  const root = path.resolve(projectRoot);
  const files = [];

  function walk(absDir, relPrefix) {
    if (files.length >= MAX_FILES) return;
    let entries;
    try {
      entries = fs.readdirSync(absDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const ent of entries) {
      if (files.length >= MAX_FILES) break;
      const rel = relPrefix ? `${relPrefix}/${ent.name}` : ent.name;
      const abs = path.join(absDir, ent.name);
      if (ent.isDirectory()) {
        if (SKIP_DIRS.has(ent.name)) continue;
        walk(abs, rel.replace(/\\/g, '/'));
      } else if (ent.isFile()) {
        files.push({
          name: ent.name,
          path: rel.replace(/\\/g, '/'),
        });
      }
    }
  }

  walk(root, '');
  return files;
}

/** 异步索引，定期让出主线程，避免长时间阻塞 UI */
async function indexProjectFilesAsync(projectRoot) {
  if (!projectRoot || !fs.existsSync(projectRoot)) return [];

  const root = path.resolve(projectRoot);
  const files = [];
  let dirCount = 0;

  async function walk(absDir, relPrefix) {
    if (files.length >= MAX_FILES) return;
    let entries;
    try {
      entries = await fs.promises.readdir(absDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const ent of entries) {
      if (files.length >= MAX_FILES) break;
      const rel = relPrefix ? `${relPrefix}/${ent.name}` : ent.name;
      const abs = path.join(absDir, ent.name);
      if (ent.isDirectory()) {
        if (SKIP_DIRS.has(ent.name)) continue;
        dirCount += 1;
        if (dirCount % YIELD_EVERY_DIRS === 0) {
          await new Promise((r) => setImmediate(r));
        }
        await walk(abs, rel.replace(/\\/g, '/'));
      } else if (ent.isFile()) {
        files.push({
          name: ent.name,
          path: rel.replace(/\\/g, '/'),
        });
      }
    }
  }

  await walk(root, '');
  return files;
}

function normalizeForSearch(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\\/g, '/');
}

/** 模糊评分：名称/路径包含、子序列匹配 */
function scoreMatch(query, file) {
  const q = normalizeForSearch(query);
  if (!q) return 0;
  const name = normalizeForSearch(file.name);
  const full = normalizeForSearch(file.path);

  if (name === q || full === q) return 1000;
  if (name.startsWith(q)) return 900 - name.length * 0.01;
  if (full.startsWith(q)) return 850;
  if (name.includes(q)) return 700 - name.indexOf(q);
  if (full.includes(q)) return 600 - full.indexOf(q);

  let qi = 0;
  for (let i = 0; i < name.length && qi < q.length; i++) {
    if (name[i] === q[qi]) qi++;
  }
  if (qi === q.length) return 400 - name.length * 0.01;

  qi = 0;
  for (let i = 0; i < full.length && qi < q.length; i++) {
    if (full[i] === q[qi]) qi++;
  }
  if (qi === q.length) return 300 - full.length * 0.01;

  return 0;
}

function filterCandidates(files, q) {
  if (files.length <= 3000) return files;
  const out = [];
  const q0 = q[0];
  for (const f of files) {
    const name = f.name.toLowerCase();
    const full = f.path.toLowerCase();
    if (name.includes(q) || full.includes(q) || (q0 && name[0] === q0)) {
      out.push(f);
      if (out.length >= 2500) break;
    }
  }
  return out.length ? out : files.slice(0, 2500);
}

function searchProjectFiles(files, query, limit = 40) {
  const q = String(query || '').trim();
  if (!q) return [];

  const qn = normalizeForSearch(q);
  const candidates = filterCandidates(files, qn);
  const scored = [];
  const cap = Math.max(limit * 6, 80);

  for (const f of candidates) {
    const s = scoreMatch(qn, f);
    if (s > 0) scored.push({ ...f, score: s });
    if (scored.length >= cap) break;
  }
  scored.sort((a, b) => b.score - a.score || a.path.length - b.path.length);
  return scored.slice(0, limit);
}

module.exports = {
  indexProjectFiles,
  indexProjectFilesAsync,
  searchProjectFiles,
  MAX_FILES,
};
