// main/xsd-unit-prefetch.js —— 创建单位写 XML 前：轻量 XSD 核对（符号表 + 限量 grep，不扫 MOD）

const { app } = require('electron');

const CORE_XSD_CANDIDATES = [
  'AssetTypeGameObject.xsd',
  'Includes/AssetTypeGameObject.xsd',
  'GameObject.xsd',
  'Includes/GameObject.xsd',
];

const KIND_GREP = {
  infantry: ['Infantry', 'ActiveBody', 'LocomotorSet'],
  vehicle: ['Vehicle', 'ActiveBody', 'LocomotorSet'],
  aircraft: ['Aircraft', 'ActiveBody', 'LocomotorSet'],
};

function getKnowledgeBaseDir() {
  try {
    const { getPaths } = require('./knowledge-base');
    const { getCurrentFolder } = require('./project-state');
    return getPaths(getCurrentFolder() || app.getPath('userData')).base;
  } catch {
    return null;
  }
}

/**
 * 创建单位生成 XML 前：对照 SDK XSD（仅 SDK，限量文件）
 * @returns {Promise<{ success: boolean, summary: string, hints: string[] }>}
 */
async function prefetchXsdForUnitCreate({ templateUnit, kind, unitId, displayName }, options = {}) {
  const onProgress = options.onProgress || (() => {});
  const hints = [];
  const kbDir = getKnowledgeBaseDir();

  try {
    const { lookupXsdSymbol, grepSdkXsd, readSdkXsd } = require('./xsd-sdk-tools');
    const { resolveXsdRel } = require('./xsd-sdk-tools');

    if (templateUnit && kbDir) {
      const sym = lookupXsdSymbol(templateUnit, kbDir);
      if (sym.success && sym.data?.hits?.length) {
        for (const h of sym.data.hits.slice(0, 4)) {
          hints.push(`模板 ${templateUnit} → ${h.file} (${h.kind || 'symbol'})`);
        }
      }
    }

    for (const rel of CORE_XSD_CANDIDATES) {
      const hit = resolveXsdRel(rel);
      if (hit) {
        hints.push(`GameObject 规范：\`${rel}\``);
        break;
      }
    }

    const patterns = ['GameObject', ...(KIND_GREP[kind] || KIND_GREP.infantry)];
    for (const pattern of patterns.slice(0, 3)) {
      const g = await grepSdkXsd({ pattern, maxMatches: 6, maxFiles: 35 });
      if (g.success && g.data?.matches?.length) {
        const top = g.data.matches.slice(0, 3).map((m) => `${m.file}:${m.line}`);
        hints.push(`grep「${pattern}」→ ${top.join('；')}`);
      }
    }

    let snippet = '';
    const primaryRel = CORE_XSD_CANDIDATES.find((r) => resolveXsdRel(r));
    if (primaryRel) {
      const rd = await readSdkXsd({ file: primaryRel, startLine: 1, endLine: 45 });
      if (rd.success && rd.data?.content) {
        snippet = rd.data.content.split('\n').slice(0, 12).join('\n');
      }
    }

    const summary =
      hints.length > 0
        ? hints.join('\n')
        : '（未命中 XSD 符号表；请确认 SDK 路径与知识库索引）';

    onProgress('📐 XSD 核对（SDK 权威）：\n' + summary.slice(0, 600) + (summary.length > 600 ? '\n…' : ''));
    if (snippet) {
      onProgress('   GameObject XSD 片段（前若干行）：\n' + snippet.slice(0, 400));
    }

    return { success: true, summary, hints, snippet };
  } catch (e) {
    onProgress(`   ⚠ XSD 预检跳过: ${e.message}`);
    return { success: false, summary: '', hints: [], error: e.message };
  }
}

module.exports = { prefetchXsdForUnitCreate, CORE_XSD_CANDIDATES };
