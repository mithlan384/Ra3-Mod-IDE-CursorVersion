// main/insurrection-scaffold.js —— 起义时刻标准空项目框架（确定性写入，不依赖 LLM 闲聊）

const fs = require('fs');
const path = require('path');
const {
  CANONICAL_DATA_REL,
  buildInsurrectionModXml,
  buildTopFactionAggregatorXml,
  buildFactionAggregatorXml,
  rebuildModXmlInsurrection,
  assessInsurrectionCompliance,
  syncModBabprojDataPath,
  normalizeDataDirCase,
} = require('./insurrection-migrate');

function resolveProjectPath(root, rel) {
  const r = String(rel || '').replace(/\\/g, '/').replace(/^\/+/, '');
  const { resolveWithinProject } = require('./path-sandbox');
  const safe = resolveWithinProject(root, r);
  if (!safe) throw new Error(`路径越界: ${rel}`);
  return safe;
}

function buildEmptyIncludesXml(comment) {
  return `<?xml version="1.0" encoding="utf-8"?>
<AssetDeclaration xmlns="uri:ea.com:eala:asset">
  <Includes>
    <!-- ${comment} -->
  </Includes>
</AssetDeclaration>
`;
}

const FACTION_CATEGORIES = [
  { folder: 'Infantry', suffix: 'Infantry', comment: (side) => `${sideLabel(side)}步兵在此引入` },
  { folder: 'Vehicle', suffix: 'Vehicle', comment: (side) => `${sideLabel(side)}载具在此引入` },
  { folder: 'Aircraft', suffix: 'Aircraft', comment: (side) => `${sideLabel(side)}飞行单位在此引入` },
  { folder: 'Structures', suffix: 'Structures', comment: (side) => `${sideLabel(side)}建筑在此引入` },
];

function sideLabel(side) {
  if (side === 'Allied') return '盟军';
  if (side === 'Japan') return '帝国';
  return '苏联';
}

function collectScaffoldFiles() {
  const files = [];

  for (const side of ['Allied', 'Soviet', 'Japan']) {
    const includes = [];
    for (const cat of FACTION_CATEGORIES) {
      const rel = `${CANONICAL_DATA_REL}/${side}/${cat.folder}/${side}${cat.suffix}.xml`;
      includes.push(`${cat.folder}/${side}${cat.suffix}.xml`);
      files.push({ rel, content: buildEmptyIncludesXml(cat.comment(side)) });
    }
    files.push({
      rel: `${CANONICAL_DATA_REL}/${side}/${side}.xml`,
      content: buildFactionAggregatorXml(side, includes),
    });
    files.push({
      rel: `${CANONICAL_DATA_REL}/${side}.xml`,
      content: buildTopFactionAggregatorXml(side),
    });
  }

  files.push({
    rel: `${CANONICAL_DATA_REL}/Common/LogicCommandSet/CommonLogicCommandSet.xml`,
    content: buildEmptyIncludesXml('通用 LogicCommand 在此引入'),
  });
  files.push({
    rel: `${CANONICAL_DATA_REL}/Common/Upgrades/CommonUpgrades.xml`,
    content: buildEmptyIncludesXml('通用升级在此引入'),
  });
  files.push({
    rel: `${CANONICAL_DATA_REL}/Common/Common.xml`,
    content: buildFactionAggregatorXml('Common', [
      'LogicCommandSet/CommonLogicCommandSet.xml',
      'Upgrades/CommonUpgrades.xml',
    ]),
  });

  files.push({
    rel: `${CANONICAL_DATA_REL}/Common.xml`,
    content: buildTopFactionAggregatorXml('Common'),
  });

  const modContent = buildInsurrectionModXml(CANONICAL_DATA_REL, ['Allied', 'Soviet', 'Japan'], {
    includeCommon: true,
    includeCommandData: false,
  });
  files.push({ rel: `${CANONICAL_DATA_REL}/Mod.xml`, content: modContent });

  return files;
}

function looksLikeScaffoldFrameworkIntent(message) {
  const m = String(message || '').trim();
  if (!m) return false;
  return (
    /(搭建|建立|生成|初始化|创建|写好|写出).{0,16}(框架|骨架|目录结构|项目结构|基本结构|mod\s*骨架)/i.test(m) ||
    /^(搭建|建立|生成).{0,8}(框架|项目)/i.test(m) ||
    /(项目|mod).{0,8}(为空|空的|空白|从零).{0,12}(搭建|建立|生成|框架)/i.test(m) ||
    /从零.{0,10}(搭建|建立|创建).{0,8}(框架|项目|mod)/i.test(m) ||
    /基本框架|标准框架|起义时刻.{0,8}框架/i.test(m) ||
    /^搭建框架$/i.test(m)
  );
}

/**
 * 写入起义时刻标准空框架（约 18 个 XML + mod.babproj 同步）
 */
async function scaffoldInsurrectionFramework(projectRoot, options = {}) {
  const root = String(projectRoot || '').replace(/\\/g, '/');
  const onProgress = options.onProgress || (() => {});
  const skipExisting = options.skipExisting !== false;
  const log = [];
  const written = [];

  if (!root || !fs.existsSync(root)) {
    return { success: false, error: '项目目录不存在' };
  }

  onProgress('📁 规范 data/ 目录…');
  normalizeDataDirCase(root, onProgress);

  const files = collectScaffoldFiles();
  onProgress(`📝 写入标准 MOD 项目框架（${files.length} 个 XML）…`);

  for (const f of files) {
    const full = resolveProjectPath(root, f.rel);
    if (skipExisting && fs.existsSync(full)) {
      log.push(`跳过已存在: ${f.rel}`);
      continue;
    }
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, f.content, 'utf-8');
    written.push(f.rel);
    onProgress(`   ✓ ${f.rel}`);
  }

  onProgress('📝 同步 Mod.xml 与阵营聚合引用…');
  const rebuild = rebuildModXmlInsurrection(root, { keepCommandData: false });
  if (rebuild.data?.written?.length) {
    for (const rel of rebuild.data.written) {
      if (!written.includes(rel)) written.push(rel);
    }
  }

  const bab = syncModBabprojDataPath(root);
  if (bab.updated) {
    written.push('mod.babproj');
    log.push(bab.source);
  }

  const assessment = assessInsurrectionCompliance(root);

  let report = `## 标准 MOD 项目框架已搭建\n\n`;
  report += `- **项目**：\`${path.basename(root)}\`\n`;
  report += `- **写入/更新**：${written.length} 个文件\n`;
  if (written.length) {
    report += `\n### 文件\n${written.map((r) => `- \`${r}\``).join('\n')}\n`;
  }
  report += `\n### 验收\n${assessment.summary}\n`;
  if (!assessment.compliant && assessment.failedChecks?.length) {
    report += `\n未通过项：${assessment.failedChecks.map((c) => c.id).join(', ')}\n`;
    report += `> 空框架无 GameObject 时 \`layout_sdk_insurrection\` 可能仍为 minimal-flat，添加第一个单位后会升级。\n`;
  }
  report += `\n可在各 \`*Infantry.xml\` 的 Includes 中注册新单位，或使用「新建单位」流程。\n`;

  return {
    success: true,
    written,
    log,
    report,
    assessment,
  };
}

module.exports = {
  looksLikeScaffoldFrameworkIntent,
  scaffoldInsurrectionFramework,
  collectScaffoldFiles,
};
