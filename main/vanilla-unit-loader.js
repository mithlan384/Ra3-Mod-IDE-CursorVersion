// main/vanilla-unit-loader.js —— 从 SageXml 读取原版单位 XML 供模板参考

const fs = require('fs');
const path = require('path');

const FACTION_DIRS = ['Soviet', 'Japan', 'Allied', 'Other'];
const UNIT_SUBDIRS = ['Units', 'Infantry', 'Vehicle', 'Aircraft', 'Structures', 'Props'];

function getSdkRoot() {
  const envSdk = process.env.RA3_SDK_PATH || process.env.RA3_MOD_SDK_PATH;
  if (envSdk && fs.existsSync(path.join(envSdk, 'EALAModStudio.exe'))) {
    return envSdk.replace(/\\/g, '/');
  }
  try {
    const { getGlobalSdkPath } = require('./project-manager');
    return getGlobalSdkPath();
  } catch {
    return null;
  }
}

function getSageXmlRoot() {
  const sdk = getSdkRoot();
  if (!sdk) return null;
  const candidates = [
    path.join(sdk, 'SageXml'),
    path.join(sdk, 'sagexml'),
    path.join(sdk, '..', 'SageXml'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c.replace(/\\/g, '/');
  }
  return null;
}

function findVanillaUnitXmlPath(unitId) {
  const sage = getSageXmlRoot();
  if (!sage || !unitId) return null;

  const names = [`${unitId}.xml`];
  for (const faction of FACTION_DIRS) {
    for (const sub of UNIT_SUBDIRS) {
      for (const name of names) {
        const full = path.join(sage, faction, sub, name);
        if (fs.existsSync(full)) {
          return {
            full: full.replace(/\\/g, '/'),
            rel: `${faction}/${sub}/${name}`,
            dataInclude: `DATA:${faction}/${sub}/${name}`,
            faction,
          };
        }
      }
    }
    for (const name of names) {
      const direct = path.join(sage, faction, name);
      if (fs.existsSync(direct)) {
        return {
          full: direct.replace(/\\/g, '/'),
          rel: `${faction}/${name}`,
          dataInclude: `DATA:${faction}/${name}`,
          faction,
        };
      }
    }
  }
  return null;
}

function loadVanillaUnitXml(unitId) {
  const hit = findVanillaUnitXmlPath(unitId);
  if (!hit) return null;
  try {
    const content = fs.readFileSync(hit.full, 'utf-8');
    return { ...hit, content };
  } catch {
    return null;
  }
}

/** 从原版 GameObject 提取 AnimationName / Model Name 样本 */
function extractDrawAssetIds(xml) {
  const models = [];
  const animations = [];
  const animRe = /<Animation\s+[^>]*AnimationName="([^"]+)"/gi;
  const modelRe = /<Model\s+[^>]*Name="([^"]+)"/gi;
  const condRe = /ConditionsYes="([^"]+)"/gi;
  let m;
  while ((m = animRe.exec(xml))) {
    const conditions = [];
    const slice = xml.slice(Math.max(0, m.index - 400), m.index + 200);
    const cm = slice.match(/ConditionsYes="([^"]+)"/i);
    animations.push({
      id: m[1],
      conditions: cm ? cm[1] : '',
    });
  }
  while ((m = modelRe.exec(xml))) models.push(m[1]);
  return { models: [...new Set(models)], animations };
}

function getVanillaDataIncludeForTemplate(templateUnitId) {
  const hit = findVanillaUnitXmlPath(templateUnitId);
  return hit?.dataInclude || null;
}

module.exports = {
  getSdkRoot,
  getSageXmlRoot,
  findVanillaUnitXmlPath,
  loadVanillaUnitXml,
  extractDrawAssetIds,
  getVanillaDataIncludeForTemplate,
};
