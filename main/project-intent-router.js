// main/project-intent-router.js —— 项目内操作意图识别（不依赖 LLM 猜工具）

const fs = require('fs');
const path = require('path');
const { getCurrentFolder } = require('./project-state');
const {
  scanProject,
  formatScanReport,
  isScanProjectIntent,
  extractXmlFileTarget,
} = require('./project-scanner');
const { findModXml } = require('./mod-register');
const { resolveProjectFile } = require('./resolve-project-file');
const { isExplicitWebSearchIntent, isProjectUnitSearchIntent } = require('./search-query');
const {
  looksLikeScaffoldFrameworkIntent,
  scaffoldInsurrectionFramework,
} = require('./insurrection-scaffold');

function getProjectLabel() {
  const root = getCurrentFolder();
  if (!root) return null;
  const path = require('path');
  return { root, name: path.basename(root) };
}

/** 列出/统计当前 MOD 项目内所有单位 */
function isListAllUnitsIntent(msg) {
  return (
    /(列出|列举|显示|统计|汇总|查看|有哪些).{0,20}(所有|全部|整个|当前).{0,12}(单位|兵种|部队)/.test(msg) ||
    /(项目|mod|模组|当前).{0,15}(所有|全部).{0,8}(单位|兵种)/.test(msg) ||
    /单位.{0,8}(列表|清单|汇总|统计)/.test(msg) ||
    /有哪些单位/.test(msg)
  );
}

function isFindUnitInProjectIntent(msg) {
  if (isListAllUnitsIntent(msg)) return false;
  return isProjectUnitSearchIntent(msg);
}

function isListProjectStructureIntent(msg) {
  return /(列出|显示|查看).{0,12}(项目|目录|文件|结构)/.test(msg) && !/单位/.test(msg);
}

function extractUnitKeyword(msg) {
  const patterns = [
    /(?:找|搜索|查找|查询)\s*(?:名为|叫)?\s*[「""]?([^」""\n，。?？]+)[」""]?\s*(?:单位|兵种)?/,
    /单位\s*[「""]([^」""]+)[」""]/,
    /(?:名为|叫做|叫)\s*([^\s，,。\n]+)/,
  ];
  for (const re of patterns) {
    const m = msg.match(re);
    if (m && m[1] && m[1].trim().length >= 1) {
      const kw = m[1].trim().replace(/^(一个|个)/, '');
      if (!/所有|全部|项目/.test(kw)) return kw;
    }
  }
  return null;
}

function formatUnitInventory(units, projectName, root) {
  if (!units.length) {
    return `当前项目「${projectName}」中未扫描到单位定义。\n路径：${root}\n\n请确认已在欢迎页打开正确的 MOD 目录，且 data 下存在单位 XML。`;
  }

  const byFile = new Map();
  for (const u of units) {
    const key = u.file || '(未知文件)';
    if (!byFile.has(key)) byFile.set(key, []);
    byFile.get(key).push(u.id);
  }

  let text = `## 项目单位汇总\n\n`;
  text += `- **项目**：${projectName}\n`;
  text += `- **路径**：\`${root}\`\n`;
  text += `- **单位总数**：${units.length} 个（按 GameObject/Unit 节点统计）\n\n`;
  text += `| 单位 ID | 所在文件 |\n|--------|----------|\n`;
  for (const u of units) {
    text += `| ${u.id} | \`${u.file}\` |\n`;
  }
  text += `\n### 按文件分组\n`;
  for (const [file, ids] of [...byFile.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    text += `\n**\`${file}\`**（${ids.length}）\n`;
    text += ids.map((id) => `- ${id}`).join('\n') + '\n';
  }
  return text.trim();
}

function normalizeBasename(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function collectFilesByBasename(root, basename) {
  const want = normalizeBasename(path.basename(basename));
  if (!want) return [];
  const hits = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (/^(builtmods|\.git|node_modules|\.ra3-ide)$/i.test(ent.name)) continue;
        walk(full);
      } else if (normalizeBasename(ent.name) === want) {
        hits.push(full);
      }
    }
  };
  walk(root);
  return hits;
}

/** 多个同名文件时，用路径片段（Soviet/Grinder 等）选最匹配的一项 */
function findFileByBasenameBest(root, basename, pathHint) {
  const hits = collectFilesByBasename(root, basename);
  if (!hits.length) return null;
  if (hits.length === 1) return hits[0];

  const hint = String(pathHint || '')
    .replace(/\\/g, '/')
    .toLowerCase()
    .split('/')
    .filter((p) => p && p !== '.' && p !== '..');
  if (!hint.length) return null;

  let best = null;
  let bestScore = 0;
  for (const full of hits) {
    const rel = path.relative(root, full).replace(/\\/g, '/').toLowerCase();
    let score = 0;
    for (const part of hint) {
      if (rel.includes(part.toLowerCase())) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      best = full;
    }
  }
  return best;
}

function tryResolveRelativeUnderRoot(root, relPath) {
  const rel = String(relPath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!rel) return null;
  const full = path.join(root, rel);
  if (fs.existsSync(full)) return rel;
  const resolved = resolveProjectFile(root, rel);
  if (resolved && fs.existsSync(resolved)) {
    return path.relative(path.resolve(root), path.resolve(resolved)).replace(/\\/g, '/');
  }
  return null;
}

function resolveXmlTargetRel(root, target) {
  const raw = String(target || '').replace(/\\/g, '/').trim();
  if (!raw) return null;

  if (/^mod\.xml$/i.test(raw)) {
    const mod = findModXml(root);
    return mod?.rel || null;
  }

  const resolved = resolveProjectFile(root, raw);
  if (resolved && fs.existsSync(resolved)) {
    return path.relative(path.resolve(root), path.resolve(resolved)).replace(/\\/g, '/');
  }

  const tailCandidates = [];
  const modTail = raw.match(/\/Mods\/[^/]+\/(.+)$/i);
  if (modTail) tailCandidates.push(modTail[1]);
  const dataTail = raw.match(/(?:^|\/)((?:Data|data)\/.+)$/i);
  if (dataTail) tailCandidates.push(dataTail[1]);
  if (raw.includes('/') && !/^[A-Za-z]:/.test(raw)) {
    tailCandidates.push(raw.replace(/^\/+/, ''));
  }

  for (const tail of tailCandidates) {
    const hit = tryResolveRelativeUnderRoot(root, tail);
    if (hit) return hit;
  }

  const base = path.basename(raw);
  if (/^[^/\\]+\.xml$/i.test(raw) || (raw.includes('/') && base)) {
    const hint = raw.includes('/') ? raw : null;
    const best = findFileByBasenameBest(root, base, hint || raw);
    if (best) return path.relative(root, best).replace(/\\/g, '/');
  }

  return null;
}

async function analyzeSingleXmlFile(message, root, rel, onProgress) {
  const fs = require('fs');
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) {
    return { handled: true, response: `❌ 未找到文件：\`${rel}\`` };
  }
  onProgress?.(`📄 正在读取 \`${rel}\`…`);
  let content = '';
  try {
    content = fs.readFileSync(full, 'utf-8');
  } catch (e) {
    return { handled: true, response: `❌ 读取失败：${e.message}` };
  }
  const maxChars = 14000;
  const body =
    content.length > maxChars
      ? content.slice(0, maxChars) + '\n…（文件过长，已截断）'
      : content;
  onProgress?.('🧠 正在分析该 XML 内容（不扫描整个项目）…');
  const { callLLM } = require('./agent-planner');
  const { loadPreferences, buildPersonalitySystemBlock } = require('./agent-personality');
  const personality = buildPersonalitySystemBlock(loadPreferences().aiPersonality);
  const reply = await callLLM(
    [
      {
        role: 'system',
        content: `你是 RA3 MOD XML 分析助手。用户只要求分析**一个文件**，禁止建议「扫描整个项目」。
${personality}
请用中文 Markdown 说明：文件角色、主要节点/引用、Include 或继承关系、潜在问题与修改建议（如有）。不要编造文件中不存在的 ID。`,
      },
      {
        role: 'user',
        content: `用户问题：${message}\n\n文件路径：\`${rel}\`\n\n文件内容：\n\`\`\`xml\n${body}\n\`\`\``,
      },
    ],
    { maxTokens: 2000, temperature: 0.2, profile: 'summary' }
  );
  return {
    handled: true,
    response: `## 单文件分析：\`${rel}\`\n\n${String(reply || '').trim() || '（未生成分析内容）'}`,
  };
}

/**
 * @returns {{ handled: boolean, response?: string }}
 */
async function tryRouteProjectIntent(message, tools, options = {}) {
  const { sessionId = null, onProgress = null, chatSessions = null } = options;
  const progress = (msg) => {
    if (typeof onProgress === 'function') onProgress(msg);
  };

  if (isExplicitWebSearchIntent(message)) {
    return { handled: false };
  }

  const xmlTarget = extractXmlFileTarget(message);
  if (xmlTarget) {
    const proj = getProjectLabel();
    if (!proj) {
      return {
        handled: true,
        response: '❌ 未打开 MOD 项目。请先在欢迎界面选择项目目录后再分析 XML 文件。',
      };
    }
    const rel = resolveXmlTargetRel(proj.root, xmlTarget);
    if (!rel) {
      const base = path.basename(xmlTarget);
      const dupes = collectFilesByBasename(proj.root, base);
      if (dupes.length > 1) {
        const list = dupes
          .slice(0, 8)
          .map((f) => `- \`${path.relative(proj.root, f).replace(/\\/g, '/')}\``)
          .join('\n');
        return {
          handled: true,
          response:
            `❌ 项目中有 **${dupes.length}** 个 \`${base}\`，无法仅凭文件名定位。\n\n` +
            `请指定更完整路径，例如：\`Data/Soviet/Vehicle/Grinder/AudioEvent.xml\`\n\n` +
            `匹配到的文件：\n${list}${dupes.length > 8 ? '\n- …' : ''}`,
        };
      }
      return {
        handled: true,
        response: `❌ 在项目「${proj.name}」中未找到 \`${xmlTarget}\`。请检查路径或文件名。`,
      };
    }
    return analyzeSingleXmlFile(message, proj.root, rel, progress);
  }

  if (looksLikeScaffoldFrameworkIntent(message)) {
    const proj = getProjectLabel();
    if (!proj) {
      return {
        handled: true,
        response:
          '❌ 未打开 MOD 项目。请先在欢迎界面选择 MOD 目录（如 `Mods\\你的项目名`），再说「搭建框架」。',
      };
    }
    progress('🏗 正在按**标准 MOD 结构**自动搭建项目框架（写入 XML，非仅文字说明）…');
    const result = await scaffoldInsurrectionFramework(proj.root, { onProgress: progress });
    if (!result.success) {
      return { handled: true, response: `❌ 搭建失败：${result.error}` };
    }
    if (result.written?.length && tools?.notifyTreeRefresh) {
      for (const rel of result.written) tools.notifyTreeRefresh(rel);
    }
    return { handled: true, response: result.report };
  }

  if (isScanProjectIntent(message)) {
    const proj = getProjectLabel();
    if (!proj) {
      return {
        handled: true,
        response: '❌ 未打开 MOD 项目。请先在欢迎界面选择 MOD 目录（如 `Mods\\mymod`），再执行项目扫描。',
      };
    }
    progress('🔍 开始扫描当前 MOD 项目…');
    const scanRes = await scanProject({ onProgress: progress });
    if (!scanRes.success) {
      return { handled: true, response: `❌ 扫描失败：${scanRes.error}` };
    }
    if (sessionId && chatSessions?.setProjectContext) {
      chatSessions.setProjectContext(sessionId, scanRes.data);
    }
    return {
      handled: true,
      response: formatScanReport(scanRes.data),
      needsFormatChoice: true,
      scanData: scanRes.data,
    };
  }

  const proj = getProjectLabel();
  if (!proj) {
    if (isListAllUnitsIntent(message) || isFindUnitInProjectIntent(message)) {
      return {
        handled: true,
        response: '❌ 未打开 MOD 项目。请先在欢迎界面选择项目（如 `Mods\\mymod`），再询问项目内单位。',
      };
    }
    return { handled: false };
  }

  if (isListAllUnitsIntent(message)) {
    const res = tools.listAllUnitsDetailed ? tools.listAllUnitsDetailed() : tools.listAllUnits();
    if (!res.success) return { handled: true, response: `❌ ${res.error}` };
    const units = res.data?.units || (res.data || []).map((id) => ({ id, file: '' }));
    return {
      handled: true,
      response: formatUnitInventory(units, proj.name, proj.root),
    };
  }

  if (isFindUnitInProjectIntent(message)) {
    const kw = extractUnitKeyword(message) || message.replace(/找|搜索|查找|查询|单位|兵种|项目|中的|里的/g, '').trim();
    if (!kw || kw.length < 1) {
      return { handled: true, response: '请说明要查找的单位名称或 ID，例如：「查找项目里的 mytank」' };
    }
    const res = await tools.findUnitsByName({ keyword: kw });
    if (!res.success) return { handled: true, response: `❌ ${res.error}` };
    const hits = res.data || [];
    if (!hits.length) {
      return {
        handled: true,
        response: `在项目「${proj.name}」中未找到与「${kw}」匹配的单位。\n路径：\`${proj.root}\`\n\n可尝试「列出项目中所有单位」查看完整列表。`,
      };
    }
    let text = `在项目「${proj.name}」中找到 ${hits.length} 个相关文件：\n\n`;
    for (const h of hits) {
      text += `- **${h.file}**\n`;
      if (h.unitIds?.length) text += `  匹配单位：${h.unitIds.join(', ')}\n`;
      if (h.allIds?.length) text += `  文件内其它单位：${h.allIds.slice(0, 8).join(', ')}${h.allIds.length > 8 ? '…' : ''}\n`;
    }
    return { handled: true, response: text.trim() };
  }

  if (isListProjectStructureIntent(message)) {
    const res = await tools.listProjectStructure({});
    if (!res.success) return { handled: true, response: `❌ ${res.error}` };
    return {
      handled: true,
      response: `## 项目结构\n\n**${proj.name}** — \`${proj.root}\`\n\n${res.data || JSON.stringify(res, null, 2)}`,
    };
  }

  return { handled: false };
}

module.exports = {
  resolveXmlTargetRel,
  collectFilesByBasename,
  tryRouteProjectIntent,
  isListAllUnitsIntent,
  isFindUnitInProjectIntent,
  isScanProjectIntent,
  looksLikeScaffoldFrameworkIntent,
  getProjectLabel,
};
