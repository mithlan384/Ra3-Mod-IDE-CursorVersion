// main/skill-registry.js —— RA3 IDE 内置 Agent Skill 安装/卸载/启用

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const { execFile } = require('child_process');
const { app } = require('electron');

const SKILLHUB_API = 'https://api.skillhub.cn';
const SKILLHUB_PAGE_RE = /https?:\/\/(?:www\.)?skillhub\.cn\/skills\/([a-zA-Z0-9_-]+)/i;
const MAX_SKILL_PROMPT_CHARS = 12000;

function getSkillsRoot() {
  return path.join(app.getPath('userData'), 'ra3-skills');
}

function getRegistryPath() {
  return path.join(getSkillsRoot(), 'registry.json');
}

function ensureSkillsRoot() {
  const root = getSkillsRoot();
  fs.mkdirSync(path.join(root, 'installed'), { recursive: true });
  return root;
}

function readRegistry() {
  ensureSkillsRoot();
  const p = getRegistryPath();
  if (!fs.existsSync(p)) {
    return { version: 1, skills: [] };
  }
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
    if (!data.skills) data.skills = [];
    return data;
  } catch {
    return { version: 1, skills: [] };
  }
}

function writeRegistry(reg) {
  ensureSkillsRoot();
  fs.writeFileSync(getRegistryPath(), JSON.stringify(reg, null, 2), 'utf-8');
}

function parseFrontmatter(md) {
  const text = String(md || '');
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return { meta: {}, body: text.trim() };
  const block = m[1];
  const meta = {};
  for (const line of block.split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    meta[key] = val;
  }
  return { meta, body: text.slice(m[0].length).trim() };
}

function readJsonSafe(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    return null;
  }
}

function findSkillMdRoot(dir, depth = 0) {
  if (depth > 5) return null;
  const skillMd = path.join(dir, 'SKILL.md');
  if (fs.existsSync(skillMd)) return dir;
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    if (['node_modules', '.git', '.ra3-ide'].includes(ent.name)) continue;
    const found = findSkillMdRoot(path.join(dir, ent.name), depth + 1);
    if (found) return found;
  }
  return null;
}

function deriveSkillId(skillRoot) {
  const metaPath = path.join(skillRoot, '_meta.json');
  const meta = fs.existsSync(metaPath) ? readJsonSafe(metaPath) : null;
  if (meta?.slug) return String(meta.slug).trim();

  const skillMd = path.join(skillRoot, 'SKILL.md');
  if (fs.existsSync(skillMd)) {
    const { meta: fm } = parseFrontmatter(fs.readFileSync(skillMd, 'utf-8'));
    if (fm.name) return String(fm.name).trim().replace(/\s+/g, '-');
  }
  return path.basename(skillRoot);
}

function sanitizeId(id) {
  return String(id || 'skill')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'skill';
}

function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, ent.name);
    const d = path.join(dest, ent.name);
    if (ent.isDirectory()) copyDirRecursive(s, d);
    else fs.copyFileSync(s, d);
  }
}

function rmDirRecursive(dir) {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) rmDirRecursive(p);
    else fs.unlinkSync(p);
  }
  fs.rmdirSync(dir);
}

function httpGetFollow(url, maxRedirects = 8) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.get(
      url,
      {
        headers: {
          'User-Agent': 'RA3-IDE/1.0',
          Accept: 'application/zip,application/octet-stream,*/*',
        },
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && maxRedirects > 0) {
          const next = new URL(res.headers.location, url).href;
          res.resume();
          httpGetFollow(next, maxRedirects - 1).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode >= 400) {
          reject(new Error(`下载失败 HTTP ${res.statusCode}`));
          res.resume();
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      }
    );
    req.on('error', reject);
    req.setTimeout(120000, () => {
      req.destroy();
      reject(new Error('下载超时'));
    });
  });
}

function expandZip(zipPath, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  const zipEsc = zipPath.replace(/'/g, "''");
  const destEsc = destDir.replace(/'/g, "''");
  const ps = `Expand-Archive -LiteralPath '${zipEsc}' -DestinationPath '${destEsc}' -Force`;
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps],
      { windowsHide: true, timeout: 120000 },
      (err, stdout, stderr) => {
        if (err) reject(new Error(stderr || err.message || '解压失败'));
        else resolve();
      }
    );
  });
}

function resolveSourcePath(sourcePath) {
  const p = path.resolve(String(sourcePath || '').trim());
  if (!fs.existsSync(p)) throw new Error('路径不存在');
  return p;
}

async function installFromDirectory(sourceDir, options = {}) {
  const src = resolveSourcePath(sourceDir);
  if (!fs.statSync(src).isDirectory()) throw new Error('请选择文件夹（内含 SKILL.md）');

  const skillRoot = findSkillMdRoot(src);
  if (!skillRoot) throw new Error('未找到 SKILL.md，请确认这是有效的 Skill 包文件夹');

  const id = sanitizeId(deriveSkillId(skillRoot));
  const dest = path.join(getSkillsRoot(), 'installed', id);
  if (fs.existsSync(dest)) rmDirRecursive(dest);
  copyDirRecursive(skillRoot, dest);

  return registerInstalledSkill(dest, {
    source: options.source || 'local',
    sourceUrl: options.sourceUrl || '',
    version: options.version || '',
  });
}

async function installFromZip(zipPath, options = {}) {
  const src = resolveSourcePath(zipPath);
  if (!fs.statSync(src).isFile()) throw new Error('请选择 zip 压缩包');
  if (!/\.zip$/i.test(src)) throw new Error('仅支持 .zip 格式');

  const tmp = path.join(getSkillsRoot(), '_tmp', `extract_${Date.now()}`);
  fs.mkdirSync(tmp, { recursive: true });
  try {
    await expandZip(src, tmp);
    const skillRoot = findSkillMdRoot(tmp);
    if (!skillRoot) throw new Error('压缩包内未找到 SKILL.md');

    const id = sanitizeId(deriveSkillId(skillRoot));
    const dest = path.join(getSkillsRoot(), 'installed', id);
    if (fs.existsSync(dest)) rmDirRecursive(dest);
    copyDirRecursive(skillRoot, dest);

    return registerInstalledSkill(dest, {
      source: options.source || 'local',
      sourceUrl: options.sourceUrl || '',
      version: options.version || '',
    });
  } finally {
    try {
      rmDirRecursive(tmp);
    } catch (e) {}
    try {
      fs.rmdirSync(path.join(getSkillsRoot(), '_tmp'));
    } catch (e) {}
  }
}

async function installFromPath(sourcePath, options = {}) {
  const src = resolveSourcePath(sourcePath);
  const stat = fs.statSync(src);
  if (stat.isDirectory()) return installFromDirectory(src, options);
  if (/\.zip$/i.test(src)) return installFromZip(src, options);
  throw new Error('请选择 .zip 压缩包或已解压的 Skill 文件夹');
}

function registerInstalledSkill(skillRoot, options = {}) {
  const skillMdPath = path.join(skillRoot, 'SKILL.md');
  if (!fs.existsSync(skillMdPath)) throw new Error('SKILL.md 缺失');

  const raw = fs.readFileSync(skillMdPath, 'utf-8');
  const { meta, body } = parseFrontmatter(raw);
  const metaJson = readJsonSafe(path.join(skillRoot, '_meta.json'));

  const id = sanitizeId(metaJson?.slug || deriveSkillId(skillRoot));
  const name = metaJson?.slug || meta.name || id;
  const displayName =
    options.displayName ||
    (metaJson && meta.name) ||
    meta.name ||
    name;
  const description = meta.description || body.slice(0, 280);
  const version = options.version || metaJson?.version || '';

  const reg = readRegistry();
  const now = new Date().toISOString();
  const relInstall = path.join('installed', id);
  const entry = {
    id,
    name,
    displayName,
    description,
    version,
    enabled: true,
    source: options.source || 'local',
    sourceUrl: options.sourceUrl || '',
    installPath: relInstall,
    installedAt: now,
    updatedAt: now,
  };

  const idx = reg.skills.findIndex((s) => s.id === id);
  if (idx >= 0) reg.skills[idx] = { ...reg.skills[idx], ...entry };
  else reg.skills.push(entry);

  writeRegistry(reg);
  return { success: true, skill: getSkillDetail(id) };
}

function parseSkillhubSlug(input) {
  const s = String(input || '').trim();
  const page = s.match(SKILLHUB_PAGE_RE);
  if (page) return { slug: page[1], sourceUrl: page[0] };
  if (/^[a-zA-Z0-9_-]+$/.test(s)) return { slug: s, sourceUrl: `${SKILLHUB_API.replace('api.', '')}/skills/${s}` };
  return null;
}

async function fetchSkillhubMeta(slug) {
  const url = `${SKILLHUB_API}/api/v1/skills/${encodeURIComponent(slug)}`;
  const buf = await httpGetFollow(url);
  const json = JSON.parse(buf.toString('utf-8'));
  if (!json.skill) throw new Error('SkillHub 未返回技能信息');
  return json;
}

async function installFromSkillhubSlug(slug, options = {}) {
  const parsed = parseSkillhubSlug(slug);
  if (!parsed) throw new Error('无效的 SkillHub 技能标识');
  const { slug: s, sourceUrl } = parsed;

  let version = options.version || '';
  let displayName = '';
  try {
    const meta = await fetchSkillhubMeta(s);
    version = version || meta.latestVersion?.version || meta.skill?.tags?.latest || '';
    displayName = meta.skill?.displayName || meta.skill?.summary_zh?.slice(0, 80) || '';
  } catch (e) {
    console.warn('[Skill] 元数据获取失败，继续下载:', e.message);
  }

  const downloadUrl = `${SKILLHUB_API}/api/v1/download?slug=${encodeURIComponent(s)}`;
  const zipBuf = await httpGetFollow(downloadUrl);
  if (zipBuf.length < 100 || zipBuf[0] !== 0x50 || zipBuf[1] !== 0x4b) {
    throw new Error('下载内容不是有效的 zip 包');
  }

  const tmpZip = path.join(getSkillsRoot(), '_tmp', `${s}_${Date.now()}.zip`);
  const tmpDir = path.join(getSkillsRoot(), '_tmp', `extract_${s}_${Date.now()}`);
  fs.mkdirSync(path.dirname(tmpZip), { recursive: true });
  fs.writeFileSync(tmpZip, zipBuf);

  try {
    await expandZip(tmpZip, tmpDir);
    const skillRoot = findSkillMdRoot(tmpDir);
    if (!skillRoot) throw new Error('SkillHub 包内未找到 SKILL.md');

    const id = sanitizeId(deriveSkillId(skillRoot));
    const dest = path.join(getSkillsRoot(), 'installed', id);
    if (fs.existsSync(dest)) rmDirRecursive(dest);
    copyDirRecursive(skillRoot, dest);

    return registerInstalledSkill(dest, {
      source: 'skillhub',
      sourceUrl: sourceUrl || `https://skillhub.cn/skills/${s}`,
      version,
      displayName,
    });
  } finally {
    try {
      fs.unlinkSync(tmpZip);
    } catch (e) {}
    try {
      rmDirRecursive(tmpDir);
    } catch (e) {}
  }
}

async function installFromUrl(url) {
  const parsed = parseSkillhubSlug(url);
  if (!parsed) throw new Error('目前仅支持 SkillHub 链接（skillhub.cn/skills/...）');
  return installFromSkillhubSlug(parsed.slug, { sourceUrl: parsed.sourceUrl });
}

function listInstalledSkills() {
  const reg = readRegistry();
  return reg.skills.map((s) => getSkillDetail(s.id)).filter(Boolean);
}

function getSkillDetail(id) {
  const reg = readRegistry();
  const entry = reg.skills.find((s) => s.id === id);
  if (!entry) return null;

  const abs = path.join(getSkillsRoot(), entry.installPath);
  let hasSkillMd = fs.existsSync(path.join(abs, 'SKILL.md'));
  if (!hasSkillMd) {
    return { ...entry, missing: true };
  }

  const raw = fs.readFileSync(path.join(abs, 'SKILL.md'), 'utf-8');
  const { meta } = parseFrontmatter(raw);
  return {
    ...entry,
    description: entry.description || meta.description || '',
    displayName: entry.displayName || meta.name || entry.id,
    missing: false,
  };
}

function setSkillEnabled(id, enabled) {
  const reg = readRegistry();
  const entry = reg.skills.find((s) => s.id === id);
  if (!entry) throw new Error('Skill 未安装');
  entry.enabled = !!enabled;
  entry.updatedAt = new Date().toISOString();
  writeRegistry(reg);
  return { success: true, skill: getSkillDetail(id) };
}

function uninstallSkill(id) {
  const reg = readRegistry();
  const idx = reg.skills.findIndex((s) => s.id === id);
  if (idx < 0) throw new Error('Skill 未安装');

  const entry = reg.skills[idx];
  const abs = path.join(getSkillsRoot(), entry.installPath);
  try {
    if (fs.existsSync(abs)) rmDirRecursive(abs);
  } catch (e) {
    console.warn('[Skill] 删除目录失败:', e.message);
  }

  reg.skills.splice(idx, 1);
  writeRegistry(reg);
  return { success: true, id };
}

function buildSkillsPromptBlock() {
  const enabled = listInstalledSkills().filter((s) => s.enabled && !s.missing);
  if (!enabled.length) return '';

  const parts = [];
  let total = 0;
  for (const sk of enabled) {
    const abs = path.join(getSkillsRoot(), sk.installPath, 'SKILL.md');
    if (!fs.existsSync(abs)) continue;
    const raw = fs.readFileSync(abs, 'utf-8');
    const { meta, body } = parseFrontmatter(raw);
    const header = `### Skill: ${sk.displayName || sk.id}\n${meta.description || sk.description || ''}\n`;
    let chunk = header + body;
    if (total + chunk.length > MAX_SKILL_PROMPT_CHARS) {
      const remain = MAX_SKILL_PROMPT_CHARS - total - header.length - 80;
      if (remain > 200) chunk = header + body.slice(0, remain) + '\n…（Skill 正文已截断）';
      else break;
    }
    parts.push(chunk);
    total += chunk.length;
    if (total >= MAX_SKILL_PROMPT_CHARS) break;
  }

  if (!parts.length) return '';
  return `\n## 已启用的 Agent Skills（请按下列说明执行）\n${parts.join('\n\n---\n\n')}\n`;
}

module.exports = {
  getSkillsRoot,
  listInstalledSkills,
  getSkillDetail,
  installFromPath,
  installFromSkillhubSlug,
  installFromUrl,
  uninstallSkill,
  setSkillEnabled,
  buildSkillsPromptBlock,
  parseSkillhubSlug,
};
