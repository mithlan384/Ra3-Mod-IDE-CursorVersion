// main/unit-resolve.js —— 从用户消息解析单位：先项目内，再 SageXml 原版

const { UNIT_ALIASES } = require('./create-unit-pipeline');
const { UNIT_ID_BY_CN } = require('./biligame-wiki-clean');
const { loadVanillaUnitXml, getSageXmlRoot } = require('./vanilla-unit-loader');

/** @typedef {'project'|'vanilla'|'unknown'} UnitLocation */

/**
 * @param {string} message
 * @returns {{ displayNames: string[], unitIds: string[], searchTerms: string[] }}
 */
function extractUnitHintsFromMessage(message) {
  const m = String(message || '');
  const displayNames = [];
  const unitIds = new Set();
  const searchTerms = new Set();

  const aliasKeys = [
    ...Object.keys(UNIT_ID_BY_CN),
    ...Object.keys(UNIT_ALIASES),
  ].sort((a, b) => b.length - a.length);

  for (const alias of aliasKeys) {
    if (m.includes(alias)) {
      displayNames.push(alias);
      searchTerms.add(alias);
      const ids = UNIT_ID_BY_CN[alias] ? [UNIT_ID_BY_CN[alias]] : UNIT_ALIASES[alias] || [];
      ids.forEach((id) => unitIds.add(id));
    }
  }

  const named = m.match(
    /(?:把|将|给|对)?\s*[「""]?([^」""\n，。]{2,16}?)[」""]?\s*(?:的)?(?:血量|生命值|造价|费用|移速|速度|武器|装甲)/i
  );
  if (named?.[1]) {
    const n = named[1].trim().replace(/^(一个|个)/, '');
    if (n.length >= 2 && !/^(它|这个|那个)$/.test(n)) {
      displayNames.push(n);
      searchTerms.add(n);
    }
  }

  const idMatch = m.match(/\b([A-Z][a-zA-Z0-9]{7,38})\b/);
  if (idMatch?.[1]) unitIds.add(idMatch[1]);

  return {
    displayNames: [...new Set(displayNames)],
    unitIds: [...unitIds],
    searchTerms: [...searchTerms],
  };
}

function pickProjectUnitId(dataEntries, keyword) {
  const kw = String(keyword || '').toLowerCase();
  let best = null;
  let bestScore = 0;
  for (const entry of dataEntries) {
    for (const id of entry.unitIds || []) {
      let score = 0;
      if (id.toLowerCase().includes(kw)) score += 3;
      if (entry.file?.toLowerCase().includes(kw)) score += 1;
      if (score > bestScore) {
        bestScore = score;
        best = { unitId: id, file: entry.file };
      }
    }
  }
  return best;
}

/**
 * @param {string} message
 * @param {object} tools - agent-tools 模块
 * @returns {Promise<object>}
 */
async function resolveUnitTarget(message, tools) {
  const hints = extractUnitHintsFromMessage(message);
  const tried = new Set();

  for (const term of hints.searchTerms) {
    if (tried.has(term)) continue;
    tried.add(term);
    const res = tools.findUnitsByName({ keyword: term });
    if (res.success && res.data?.length) {
      const pick = pickProjectUnitId(res.data, term);
      if (pick?.unitId) {
        const full = tools.getUnitFullXml({ unitId: pick.unitId });
        if (full.success) {
          return {
            location: 'project',
            unitId: pick.unitId,
            file: full.data.file,
            displayName: term,
            keyword: term,
          };
        }
      }
    }
  }

  for (const unitId of hints.unitIds) {
    const full = tools.getUnitFullXml({ unitId });
    if (full.success) {
      return {
        location: 'project',
        unitId,
        file: full.data.file,
        displayName: hints.displayNames[0] || unitId,
        keyword: unitId,
      };
    }
  }

  if (!getSageXmlRoot()) {
    return {
      location: 'unknown',
      unitId: hints.unitIds[0] || null,
      displayName: hints.displayNames[0] || null,
      reason: 'no_sdk',
    };
  }

  for (const unitId of hints.unitIds) {
    const vanilla = loadVanillaUnitXml(unitId);
    if (vanilla) {
      return {
        location: 'vanilla',
        unitId,
        vanilla,
        displayName: hints.displayNames[0] || unitId,
        keyword: unitId,
        dataInclude: vanilla.dataInclude,
      };
    }
  }

  for (const term of hints.searchTerms) {
    for (const [alias, ids] of Object.entries({ ...UNIT_ID_BY_CN, ...UNIT_ALIASES })) {
      if (term !== alias && !term.includes(alias)) continue;
      for (const unitId of Array.isArray(ids) ? ids : [ids]) {
        const vanilla = loadVanillaUnitXml(unitId);
        if (vanilla) {
          return {
            location: 'vanilla',
            unitId,
            vanilla,
            displayName: term,
            keyword: term,
            dataInclude: vanilla.dataInclude,
          };
        }
      }
    }
  }

  return {
    location: 'unknown',
    unitId: hints.unitIds[0] || null,
    displayName: hints.displayNames[0] || hints.searchTerms[0] || null,
    reason: 'not_found',
  };
}

module.exports = {
  extractUnitHintsFromMessage,
  resolveUnitTarget,
};
