// main/project-scanner.js —— 扫描当前 MOD 项目，生成 AI 可理解的结构摘要

const fs = require('fs');
const path = require('path');
const { getCurrentFolder, setProjectConventions } = require('./project-state');
const { findModXml } = require('./mod-register');
const { analyzeProjectConventions, formatConventionsReport } = require('./project-conventions');
const {
  MODE_STANDARD,
  buildProjectContextForMode,
  formatChoicePromptBlock,
} = require('./xml-format-mode');
const { analyzeCompileHealth } = require('./project-health-check');

const SKIP_DIR_NAMES = new Set([
  '.ra3ide',
  '.git',
  'node_modules',
  'compiled',
  'Compiled',
  '__pycache__',
  '.vscode',
]);

const SKIP_EXT = new Set([
  '.w3x',
  '.skn',
  '.skl',
  '.tga',
  '.dds',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.bmp',
  '.big',
  '.exe',
  '.dll',
  '.mix',
  '.wav',
  '.mp3',
  '.bik',
  '.vp6',
  '.zip',
  '.rar',
  '.7z',
]);

const MAX_XML_FILES_DETAIL = 80;
const MAX_UNITS_IN_REPORT = 200;
const COMPACT_CONTEXT_MAX = 7000;
const MAX_ASSETS_IN_CONTEXT = 80;

function formatAssetSize(bytes) {
  if (!bytes || bytes < 1024) return `${bytes || 0}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}

function readTextSafe(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    if (buf.length > 512000) return buf.slice(0, 512000).toString('utf-8');
    return buf.toString('utf-8');
  } catch {
    return '';
  }
}

function shouldSkipDir(name) {
  return SKIP_DIR_NAMES.has(name) || name.startsWith('.');
}

function categorizeRelPath(rel) {
  const lower = rel.replace(/\\/g, '/').toLowerCase();
  if (lower.includes('globaldata')) return 'GlobalData';
  if (lower.includes('skirmishai')) return 'SkirmishAI';
  if (lower.includes('/allied/')) return 'Allied';
  if (lower.includes('/soviet/')) return 'Soviet';
  if (lower.includes('/japan/')) return 'Japan';
  if (lower.includes('/units/')) return 'Units';
  if (lower.includes('/structures/') || lower.includes('/structure/')) return 'Structures';
  if (lower.includes('logiccommand')) return 'LogicCommand';
  if (lower.includes('weapon')) return 'Weapons';
  if (lower.includes('mod.xml')) return 'Mod';
  return 'Other';
}

function extractXmlMeta(content, relPath) {
  const meta = {
    path: relPath,
    gameObjects: [],
    weaponTemplates: [],
    logicCommands: [],
    logicCommandSets: [],
    upgradeTemplates: [],
    specialPowers: [],
    oclIds: [],
  };

  const goRe = /<GameObject\b[^>]*\bid="([^"]+)"[^>]*(?:[^>]*\binheritFrom="([^"]*)")?[^>]*(?:[^>]*\bSide="([^"]*)")?/gi;
  let m;
  while ((m = goRe.exec(content)) !== null) {
    meta.gameObjects.push({
      id: m[1],
      inheritFrom: m[2] || null,
      side: m[3] || null,
    });
  }

  const wtRe = /<WeaponTemplate\b[^>]*\bid="([^"]+)"/gi;
  while ((m = wtRe.exec(content)) !== null) meta.weaponTemplates.push(m[1]);

  const lcRe = /<LogicCommand\b[^>]*\bid="([^"]+)"/gi;
  while ((m = lcRe.exec(content)) !== null) meta.logicCommands.push(m[1]);

  const lcsRe = /<LogicCommandSet\b[^>]*\bid="([^"]+)"/gi;
  while ((m = lcsRe.exec(content)) !== null) meta.logicCommandSets.push(m[1]);

  const upRe = /<UpgradeTemplate\b[^>]*\bid="([^"]+)"/gi;
  while ((m = upRe.exec(content)) !== null) meta.upgradeTemplates.push(m[1]);

  const spRe = /<SpecialPowerTemplate\b[^>]*\bid="([^"]+)"/gi;
  while ((m = spRe.exec(content)) !== null) meta.specialPowers.push(m[1]);

  const oclRe = /<ObjectCreationList\b[^>]*\bid="([^"]+)"/gi;
  while ((m = oclRe.exec(content)) !== null) meta.oclIds.push(m[1]);

  return meta;
}

function collectUnitsFromXml(fullPath, root, out) {
  const content = readTextSafe(fullPath);
  if (!content) return;
  const relFile = path.relative(root, fullPath).replace(/\\/g, '/');
  const meta = extractXmlMeta(content, relFile);
  for (const go of meta.gameObjects) {
    if (go.id.startsWith('ModuleTag_') || go.id.startsWith('Command_')) continue;
    out.push({
      id: go.id,
      file: relFile,
      side: go.side,
      inheritFrom: go.inheritFrom,
    });
  }
}

function parseModIncludes(modPath) {
  const content = readTextSafe(modPath);
  const includes = [];
  const re = /<Include\b[^>]*\bsource="([^"]+)"/gi;
  let m;
  while ((m = re.exec(content)) !== null) includes.push(m[1]);
  return includes;
}

function yieldToEventLoop() {
  return new Promise((resolve) => setImmediate(resolve));
}

/**
 * @param {{ onProgress?: (msg: string) => void }} options
 */
async function scanProject(options = {}) {
  const root = getCurrentFolder();
  if (!root) return { success: false, error: '项目目录未设置，请先在欢迎页打开 MOD 项目' };

  const onProgress = options.onProgress || (() => {});
  const projectName = path.basename(root);
  const scannedAt = new Date().toISOString();

  onProgress('📂 正在遍历项目文件…');

  const allFiles = [];
  const assetFiles = [];
  const xmlFiles = [];
  const extCounts = {};
  const dirCounts = {};

  let walkTicks = 0;
  const walk = async (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      walkTicks++;
      if (walkTicks % 120 === 0) await yieldToEventLoop();
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (shouldSkipDir(ent.name)) continue;
        await walk(full);
      } else {
        const rel = path.relative(root, full).replace(/\\/g, '/');
        const ext = path.extname(ent.name).toLowerCase() || '(无扩展名)';
        let size = 0;
        try {
          size = fs.statSync(full).size;
        } catch {
          continue;
        }
        if (SKIP_EXT.has(ext)) {
          assetFiles.push({ rel, ext, size });
          extCounts[ext] = (extCounts[ext] || 0) + 1;
          const topAsset = rel.split('/')[0] || rel;
          dirCounts[topAsset] = (dirCounts[topAsset] || 0) + 1;
          continue;
        }
        allFiles.push({ rel, ext, size });
        extCounts[ext] = (extCounts[ext] || 0) + 1;
        const top = rel.split('/')[0] || rel;
        dirCounts[top] = (dirCounts[top] || 0) + 1;
        if (ext === '.xml') xmlFiles.push(rel);
      }
    }
  };
  await walk(root);

  if (assetFiles.length) {
    onProgress(`📦 已索引 ${assetFiles.length} 个资源文件（模型/贴图等，未读取内容）…`);
  }
  onProgress(`📄 发现 ${xmlFiles.length} 个 XML，正在解析 Mod.xml…`);

  const mod = findModXml(root);
  const modIncludes = mod ? parseModIncludes(mod.full) : [];

  onProgress('🧬 正在提取单位与 GameObject…');

  const units = [];
  for (let ui = 0; ui < xmlFiles.length; ui++) {
    if (ui > 0 && ui % 25 === 0) await yieldToEventLoop();
    collectUnitsFromXml(path.join(root, xmlFiles[ui]), root, units);
  }
  const unitSeen = new Set();
  const dedupedUnits = [];
  for (const u of units) {
    const key = `${u.id}|${u.file}`;
    if (unitSeen.has(key)) continue;
    unitSeen.add(key);
    dedupedUnits.push(u);
  }
  dedupedUnits.sort((a, b) => a.id.localeCompare(b.id));

  onProgress('📋 正在分析 XML 定义…');

  const xmlMetaList = [];
  const categoryCounts = {};
  let totalWeapons = 0;
  let totalLogicCommands = 0;
  let totalSpecialPowers = 0;
  let totalOcl = 0;

  const xmlToScan = xmlFiles.slice(0, MAX_XML_FILES_DETAIL);
  for (let xi = 0; xi < xmlToScan.length; xi++) {
    const rel = xmlToScan[xi];
    if (xi > 0 && xi % 8 === 0) await yieldToEventLoop();
    const content = readTextSafe(path.join(root, rel));
    const meta = extractXmlMeta(content, rel);
    const cat = categorizeRelPath(rel);
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    totalWeapons += meta.weaponTemplates.length;
    totalLogicCommands += meta.logicCommands.length;
    totalSpecialPowers += meta.specialPowers.length;
    totalOcl += meta.oclIds.length;
    if (
      meta.gameObjects.length ||
      meta.weaponTemplates.length ||
      meta.logicCommands.length ||
      meta.logicCommandSets.length
    ) {
      xmlMetaList.push(meta);
    }
  }

  if (xmlFiles.length > MAX_XML_FILES_DETAIL) {
    categoryCounts._note = `仅详细解析前 ${MAX_XML_FILES_DETAIL} 个 XML`;
  }

  const bySide = { Allied: 0, Soviet: 0, Japan: 0, Other: 0 };
  for (const u of dedupedUnits) {
    const s = (u.side || '').trim();
    if (/allied/i.test(s)) bySide.Allied++;
    else if (/soviet/i.test(s)) bySide.Soviet++;
    else if (/japan|empire/i.test(s)) bySide.Japan++;
    else bySide.Other++;
  }

  const data = {
    projectName,
    root,
    scannedAt,
    modXml: mod ? { path: mod.rel, includes: modIncludes } : null,
    assetFiles,
    stats: {
      totalFiles: allFiles.length + assetFiles.length,
      editableFiles: allFiles.length,
      assetFiles: assetFiles.length,
      xmlFiles: xmlFiles.length,
      units: dedupedUnits.length,
      weaponTemplates: totalWeapons,
      logicCommands: totalLogicCommands,
      specialPowers: totalSpecialPowers,
      oclLists: totalOcl,
      extCounts,
      dirCounts,
      categoryCounts,
      unitsBySide: bySide,
    },
    units: dedupedUnits,
    xmlMetaList,
    xmlFiles,
  };

  onProgress('📐 正在分析项目 XML 规范（结构/引用习惯）…');
  data.conventions = analyzeProjectConventions(root, data);
  setProjectConventions(data.conventions);
  onProgress('🏥 正在检查可能导致编译失败的 XML 结构…');
  data.compileHealth = analyzeCompileHealth(root, data.conventions);
  data.compactForLLM = buildProjectContextForMode(data, MODE_STANDARD);
  return { success: true, data };
}

function buildCompactContext(scan) {
  const lines = [];
  lines.push(`〖MOD 项目上下文 — 扫描于 ${scan.scannedAt}〗`);
  lines.push(`项目：${scan.projectName}`);
  lines.push(`路径：${scan.root}`);
  lines.push(
    `统计：${scan.stats.xmlFiles} 个 XML，${scan.stats.units} 个 GameObject 单位，` +
      `${scan.stats.weaponTemplates} 个 WeaponTemplate，${scan.stats.logicCommands} 个 LogicCommand` +
      (scan.stats.assetFiles ? `，${scan.stats.assetFiles} 个资源文件（仅索引路径，未读内容）` : '')
  );

  if (scan.modXml) {
    lines.push(`Mod.xml：${scan.modXml.path}（${scan.modXml.includes.length} 条 Include）`);
    if (scan.modXml.includes.length) {
      lines.push('Includes：' + scan.modXml.includes.slice(0, 25).join(' | ') +
        (scan.modXml.includes.length > 25 ? ' …' : ''));
    }
  }

  if (scan.conventions?.compactForLLM) {
    lines.push('\n' + scan.conventions.compactForLLM);
  }

  lines.push(
    `阵营单位约：盟军 ${scan.stats.unitsBySide.Allied}，苏联 ${scan.stats.unitsBySide.Soviet}，` +
      `帝国 ${scan.stats.unitsBySide.Japan}，其它 ${scan.stats.unitsBySide.Other}`
  );

  const cats = Object.entries(scan.stats.categoryCounts)
    .filter(([k]) => k !== '_note')
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}(${v})`)
    .join('，');
  if (cats) lines.push(`XML 分类：${cats}`);

  lines.push('\n单位列表（id → 文件）：');
  const unitLines = scan.units.slice(0, MAX_UNITS_IN_REPORT).map((u) => {
    let s = u.side ? ` [${u.side}]` : '';
    let inh = u.inheritFrom ? ` ←${u.inheritFrom}` : '';
    return `- ${u.id}${s}${inh} @ ${u.file}`;
  });
  lines.push(unitLines.join('\n'));
  if (scan.units.length > MAX_UNITS_IN_REPORT) {
    lines.push(`… 另有 ${scan.units.length - MAX_UNITS_IN_REPORT} 个单位未列出`);
  }

  if (scan.assetFiles?.length) {
    lines.push('\n资源文件索引（模型/贴图等，未读二进制内容）：');
    const topAssets = [...scan.assetFiles]
      .sort((a, b) => b.size - a.size)
      .slice(0, MAX_ASSETS_IN_CONTEXT);
    for (const a of topAssets) {
      lines.push(`- ${a.rel} (${a.ext}, ${formatAssetSize(a.size)})`);
    }
    if (scan.assetFiles.length > MAX_ASSETS_IN_CONTEXT) {
      lines.push(`… 另有 ${scan.assetFiles.length - MAX_ASSETS_IN_CONTEXT} 个资源文件未列出`);
    }
  }

  const keyFiles = scan.xmlMetaList
    .filter((m) => m.logicCommandSets.length || m.logicCommands.length > 3)
    .slice(0, 15);
  if (keyFiles.length) {
    lines.push('\n关键逻辑文件：');
    for (const m of keyFiles) {
      const parts = [];
      if (m.logicCommandSets.length) parts.push(`CommandSet: ${m.logicCommandSets.slice(0, 5).join(', ')}`);
      if (m.logicCommands.length) parts.push(`Command: ${m.logicCommands.length} 条`);
      lines.push(`- ${m.path}（${parts.join('；')}）`);
    }
  }

  lines.push(
    '\n说明：默认按标准 MOD 格式写入；扫描后可选择「当前项目格式」。单位列表供查找 id 与路径。'
  );

  let text = lines.join('\n');
  if (text.length > COMPACT_CONTEXT_MAX) {
    text = text.slice(0, COMPACT_CONTEXT_MAX) + '\n…（项目上下文已截断）';
  }
  return text;
}

function formatScanReport(scan) {
  const s = scan.stats;
  let text = `## MOD 项目扫描完成\n\n`;
  text += `- **项目**：${scan.projectName}\n`;
  text += `- **路径**：\`${scan.root}\`\n`;
  text += `- **扫描时间**：${scan.scannedAt}\n\n`;

  text += `### 概览\n\n`;
  text += `| 类型 | 数量 |\n|------|------|\n`;
  text += `| 文件总数 | ${s.totalFiles} |\n`;
  text += `| 可编辑/文本类 | ${s.editableFiles ?? s.totalFiles} |\n`;
  text += `| 资源文件（仅路径索引） | ${s.assetFiles || 0} |\n`;
  text += `| XML | ${s.xmlFiles} |\n`;
  text += `| GameObject 单位 | ${s.units} |\n`;
  text += `| WeaponTemplate（抽样） | ${s.weaponTemplates} |\n`;
  text += `| LogicCommand（抽样） | ${s.logicCommands} |\n`;
  text += `| SpecialPower（抽样） | ${s.specialPowers} |\n`;
  text += `| ObjectCreationList（抽样） | ${s.oclLists} |\n\n`;

  if (scan.modXml) {
    text += `### Mod.xml\n\n`;
    text += `- 文件：\`${scan.modXml.path}\`\n`;
    text += `- Include 条目：${scan.modXml.includes.length} 个\n\n`;
    if (scan.modXml.includes.length) {
      text += '```\n' + scan.modXml.includes.map((i) => `- ${i}`).join('\n') + '\n```\n\n';
    }
  }

  if (scan.conventions) {
    text += formatConventionsReport(scan.conventions) + '\n';
  }

  text += `### 阵营分布（按 Side 属性）\n\n`;
  text += `- 盟军：${s.unitsBySide.Allied} · 苏联：${s.unitsBySide.Soviet} · 帝国：${s.unitsBySide.Japan} · 其它：${s.unitsBySide.Other}\n\n`;

  if (Object.keys(s.categoryCounts).length) {
    text += `### XML 分类\n\n`;
    for (const [cat, n] of Object.entries(s.categoryCounts).sort((a, b) => b[1] - a[1])) {
      if (cat === '_note') continue;
      text += `- ${cat}：${n} 个文件\n`;
    }
    text += '\n';
  }

  text += `### 单位清单\n\n`;
  text += `| 单位 ID | Side | 继承 | 文件 |\n|---------|------|------|------|\n`;
  const show = scan.units.slice(0, MAX_UNITS_IN_REPORT);
  for (const u of show) {
    text += `| ${u.id} | ${u.side || '-'} | ${u.inheritFrom || '-'} | \`${u.file}\` |\n`;
  }
  if (scan.units.length > MAX_UNITS_IN_REPORT) {
    text += `\n*另有 ${scan.units.length - MAX_UNITS_IN_REPORT} 个单位，已写入会话记忆供后续对话使用。*\n`;
  }

  text += `\n---\n\n`;
  text += `✅ **已写入当前会话记忆**（单位清单与项目概览）。\n\n`;
  text += formatChoicePromptBlock(scan);
  text += `\n\n如需刷新全量扫描，请再说「扫描全部项目」或「扫描全部代码结构」。`;

  return text.trim();
}

/** 全量扫描必须含「全部/所有/完整/全量/整个」等范围词（避免「分析某.xml」误触发） */
const FULL_SCOPE_KEYWORDS_RE = /全部|所有|完整|全量|整个/;

function hasFullScopeKeyword(msg) {
  return FULL_SCOPE_KEYWORDS_RE.test(String(msg || ''));
}

const ANALYZE_FILE_VERBS_RE =
  /(?:分析|解读|查看|检查|解释|说明|讲讲|介绍|帮我看|帮我分析|打开|阅读)/i;

/** 从用户消息中提取要分析的单个 .xml（无全量范围词时；支持空格文件名） */
function extractXmlFileTarget(msg) {
  const m = String(msg || '').trim();
  if (!m || hasFullScopeKeyword(m)) return null;

  const quoted = m.match(/[`"']([^`"']+\.xml)[`"']/i);
  if (quoted) return quoted[1].trim();

  // 「分析D:/…」无空格时，勿用 \s*(.+?\.xml)（会从冒号起匹配，丢掉盘符 D）
  const winAbsAfterVerb = m.match(
    new RegExp(
      `${ANALYZE_FILE_VERBS_RE.source}(?:一下|下)?\\s*([A-Za-z]:[/\\\\][^\\s]+?\\.xml)\\s*$`,
      'i'
    )
  );
  if (winAbsAfterVerb) return winAbsAfterVerb[1].trim();

  const dataGluedAfterVerb = m.match(
    new RegExp(
      `${ANALYZE_FILE_VERBS_RE.source}(?:一下|下)?\\s*((?:Data[/\\\\])[^\\s]+?\\.xml)\\s*$`,
      'i'
    )
  );
  if (dataGluedAfterVerb) return dataGluedAfterVerb[1].trim();

  // 「分析Future tank X-1.xml」等（非盘符路径，紧贴动词）
  const gluedAfterVerb = m.match(
    new RegExp(
      `${ANALYZE_FILE_VERBS_RE.source}(?:一下|下)?(?![A-Za-z]:[/\\\\])(.+?\\.xml)\\s*$`,
      'i'
    )
  );
  if (gluedAfterVerb) return gluedAfterVerb[1].trim();

  const verbPath = m.match(
    new RegExp(
      `${ANALYZE_FILE_VERBS_RE.source}(?:一下|下)?\\s+(.+?\\.xml)\\s*$`,
      'i'
    )
  );
  if (verbPath) return verbPath[1].trim();

  const politePath = m.match(
    /(?:请|麻烦)?(?:帮我|帮忙)?(?:分析|解读|查看|检查|解释|说明|讲讲|介绍|阅读)(?:一下|下)?\s*([A-Za-z]:[/\\][^\s]+?\.xml|(?:Data[/\\])[^\s]+?\.xml|.+?\.xml)\s*$/i
  );
  if (politePath) return politePath[1].trim();

  const bare = m.match(/^(.+?\.xml)\s*$/i);
  if (bare && ANALYZE_FILE_VERBS_RE.test(m)) return bare[1].trim();
  if (bare && !/\s/.test(bare[1]) && bare[1].length < 80) return bare[1].trim();

  return null;
}

/** 仅分析/查看单个文件，不涉及改项目（T2 无需 Agent 多步确认） */
function isReadOnlyFileAnalysisIntent(msg) {
  if (!extractXmlFileTarget(msg)) return false;
  const m = String(msg || '');
  return !/(修改|改成|设为|设置|创建|新建|制作|删除|移除|写入|覆盖|生成|注册|迁移|修复)/.test(m);
}

/** 用户只点名单个 XML/路径，不应全项目遍历 */
function isSingleFileInquiry(msg) {
  return !!extractXmlFileTarget(msg);
}

function isScanProjectIntent(msg) {
  const m = String(msg || '').trim();
  if (!m) return false;
  if (isSingleFileInquiry(m)) return false;

  // 仅当含「全部/所有/完整/全量/整个」等全量范围词时才遍历所有文件
  if (!hasFullScopeKeyword(m)) return false;

  return (
    /扫描.{0,32}(全部|所有|完整|全量|整个)/i.test(m) ||
    /(全部|所有|完整|全量|整个).{0,20}(扫描|遍历|索引|阅读|浏览|代码|文件|结构|目录|xml|项目|mod|模组)/i.test(m) ||
    /(阅读|浏览|遍历|索引|分析|理解|熟悉).{0,24}(全部|所有|完整|全量|整个)/i.test(m) ||
    /(让|请).{0,12}(ai|助手).{0,20}(理解|熟悉|掌握|分析).{0,20}(全部|所有|完整|全量|整个)/i.test(m) ||
    /项目.{0,8}(全量|完整|深度).{0,8}(扫描|分析|理解)/i.test(m) ||
    /重新扫描.{0,8}(全部|所有|完整|全量|整个).{0,8}(项目|mod|代码|文件)?/i.test(m)
  );
}

/** 是否允许执行全项目 scanProject（工具层二次校验） */
function assertFullProjectScanAllowed(userMessage) {
  const m = String(userMessage || '').trim();
  if (!m) {
    return {
      ok: false,
      error:
        '未识别到全量扫描意图。请明确说「扫描全部代码/扫描整个项目」等；分析单个文件请直接说「分析 xxx.xml」。',
    };
  }
  if (isSingleFileInquiry(m)) {
    return {
      ok: false,
      error: `已识别为单文件请求（${extractXmlFileTarget(m)}），请使用 readProjectFile 读取该文件，勿调用 scanProject。`,
    };
  }
  if (!isScanProjectIntent(m)) {
    return {
      ok: false,
      error:
        '全项目扫描需包含「全部/所有/完整/全量/整个」等字样，例如：扫描全部代码结构、扫描整个 MOD 项目。',
    };
  }
  return { ok: true };
}

/** 纯读取扫描：不强制弹出 XML 格式选择条 */
function isReadOnlyScanIntent(msg) {
  const m = String(msg || '');
  if (!isScanProjectIntent(m)) return false;
  if (/格式|标准\s*mod|当前项目格式|写入规范|按.*格式/i.test(m)) return false;
  return true;
}

module.exports = {
  scanProject,
  formatScanReport,
  buildCompactContext,
  hasFullScopeKeyword,
  extractXmlFileTarget,
  isReadOnlyFileAnalysisIntent,
  isSingleFileInquiry,
  isScanProjectIntent,
  assertFullProjectScanAllowed,
  isReadOnlyScanIntent,
  analyzeProjectConventions: (root) => analyzeProjectConventions(root),
};
