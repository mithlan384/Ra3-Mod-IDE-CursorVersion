// main/unit-id-naming.js —— 单位 ID：规则命名优先（中文名），LLM 仅作补充

const fs = require('fs');
const path = require('path');
const { getCurrentFolder } = require('./project-state');
const { inferUnitKind } = require('./unit-kind');

/** 词表兜底用（LLM 失败时） */
const CN_WORD_MAP = {
  '\u72b7\u9053\u8005': 'Martyr',
  '\u72b7\u9053': 'Martyr',
  超级: 'Super',
  磁暴步兵: 'TeslaTrooper',
  磁暴: 'Tesla',
  磁能: 'Tesla',
  重装: 'Heavy',
  维和: 'Peacekeeper',
  动员兵: 'Conscript',
  征召兵: 'Conscript',
  守护者: 'Guardian',
  幻影: 'Mirage',
  铁锤: 'Hammer',
  海啸: 'Tsunami',
  天启: 'Apocalypse',
  步兵: 'Infantry',
  坦克: 'Tank',
  战车: 'Vehicle',
  飞机: 'Aircraft',
  飞行器: 'Aircraft',
  船: 'Ship',
  舰艇: 'Ship',
};

const SIDE_PREFIX = { Allied: 'Allied', Soviet: 'Soviet', Japan: 'Japan' };

const FORBIDDEN_ID_PARTS = [
  'CommandSet',
  'LogicCommand',
  'Command_',
  'Construct',
  'GameObject',
  'Include',
  'AssetDeclaration',
  'InfantryInfantry',
  'VehicleVehicle',
  'SovietSoviet',
  'AlliedAllied',
  'JapanJapan',
];

const MIN_UNIT_ID_LEN = 8;
const MAX_UNIT_ID_LEN = 40;

const NAMING_GUIDE = `红色警戒3 MOD 的 GameObject「id」命名（PascalCase，无下划线）：

推荐结构：[阵营][角色名][兵种类型][科技等级]
- 阵营：Allied / Soviet / Japan
- 示例：SovietAntiInfantryInfantry、SovietHeavyAntiVehicleInfantry、AlliedAntiVehicleVehicleTech3

硬性：
- 只输出**一个** ID，8~35 个字符为宜
- 仅英文字母与数字；禁止中文、下划线、CommandSet、LogicCommand 等词
- 科技后缀最多一个：Tech3 或 T3（二选一，放末尾）`;

function inferSideFromText(text) {
  if (/动员|征召|苏军|苏联|Soviet|铁锤|天启|僵尸|磁暴|磁能/.test(text)) return 'Soviet';
  if (/帝国|日本|Japan|天狗|海啸|武士|忍者/.test(text)) return 'Japan';
  if (/盟军|Allied|维和|守护者|幻影/.test(text)) return 'Allied';
  return null;
}

function stripNoise(name) {
  return String(name || '')
    .replace(/^(一个|个|普通|新型|新的)\s*/g, '')
    .replace(/\s*(单位|兵种|部队)$/g, '')
    .trim();
}

function extractTechSuffix(rawMessage) {
  const msg = String(rawMessage || '');
  const tech = msg.match(/Tech\s*([1-4])/i);
  if (tech) return `Tech${tech[1]}`;
  if (/[二三]阶|T3|高科|三级|3阶|三阶|\bT3\b/i.test(msg)) return 'Tech3';
  const t = msg.match(/\bT([1-4])\b/i);
  if (t) return `Tech${t[1]}`;
  return '';
}

function hasCjk(text) {
  return /[\u4e00-\u9fff\u3400-\u4dbf]/.test(String(text || ''));
}

function collectProjectUnitIdSamples(root, max = 48) {
  if (!root || !fs.existsSync(root)) return [];
  const ids = new Set();
  const idRe = /\bid="([A-Za-z][A-Za-z0-9]{2,})"/g;
  const { walkScopedFiles } = require('./xml-search-scope');

  walkScopedFiles(
    root,
    (fullPath) => {
      if (ids.size >= max) return;
      try {
        const text = fs.readFileSync(fullPath, 'utf-8');
        let m;
        while ((m = idRe.exec(text)) !== null) {
          const id = m[1];
          if (id.length >= 4 && !/^Command_/i.test(id) && isReasonableUnitId(id)) ids.add(id);
        }
      } catch (e) {}
    },
    { extensions: ['.xml'], maxFiles: 800 }
  );
  return Array.from(ids).sort().slice(0, max);
}

function detectTechLevelConvention(samples) {
  let techCount = 0;
  let tCount = 0;
  for (const id of samples) {
    if (/Tech[1-4]$/i.test(id)) techCount++;
    if (/T[1-4]$/i.test(id)) tCount++;
  }
  if (techCount >= tCount && techCount > 0) return 'Tech1~Tech4';
  if (tCount > 0) return 'T1~T4';
  return 'Tech1~Tech4';
}

function isValidAsciiUnitId(id) {
  return typeof id === 'string' && /^[A-Z][A-Za-z0-9]{3,}$/.test(id);
}

function isReasonableUnitId(id) {
  if (!isValidAsciiUnitId(id)) return false;
  if (id.length < MIN_UNIT_ID_LEN || id.length > MAX_UNIT_ID_LEN) return false;
  for (const bad of FORBIDDEN_ID_PARTS) {
    if (id.includes(bad)) return false;
  }
  if ((id.match(/Tech[1-4]/gi) || []).length > 1) return false;
  if ((id.match(/T[1-4]/gi) || []).length > 1) return false;
  return true;
}

function extractUnitIdCandidates(raw) {
  const text = String(raw || '').replace(/```[\s\S]*?```/g, ' ');
  const candidates = new Set();

  const jsonMatch = text.match(/\{[\s\S]*?"unitId"\s*:\s*"([^"]+)"[\s\S]*?\}/i);
  if (jsonMatch) candidates.add(jsonMatch[1].replace(/[^A-Za-z0-9]/g, ''));

  for (const m of text.matchAll(/\bid="([A-Za-z][A-Za-z0-9]{4,})"/gi)) {
    candidates.add(m[1]);
  }

  for (const m of text.matchAll(/"([A-Z][A-Za-z0-9]{5,35})"/g)) {
    candidates.add(m[1]);
  }

  for (const m of text.matchAll(/\b([A-Z][a-z]+(?:[A-Z][A-Za-z0-9]*){1,6})\b/g)) {
    if (m[1].length <= MAX_UNIT_ID_LEN) candidates.add(m[1]);
  }

  const firstToken = text.trim().split(/\s+/)[0]?.replace(/[^A-Za-z0-9]/g, '');
  if (firstToken) candidates.add(firstToken);

  return [...candidates].filter(isValidAsciiUnitId).sort((a, b) => a.length - b.length);
}

function parseUnitIdFromLlmRaw(raw) {
  const candidates = extractUnitIdCandidates(raw);
  for (const id of candidates) {
    if (isReasonableUnitId(id)) return id;
  }
  return null;
}

function translateDisplayNameTokens(name) {
  let translated = String(name || '');
  const keys = Object.keys(CN_WORD_MAP).sort((a, b) => b.length - a.length);
  for (const cn of keys) {
    if (translated.includes(cn)) translated = translated.split(cn).join(CN_WORD_MAP[cn]);
  }
  return translated.replace(/[\u4e00-\u9fff\u3400-\u4dbf]/g, '').trim();
}

function appendKindSuffix(body, kind) {
  if (/(Infantry|Trooper|Soldier|Vehicle|Aircraft|Structure|Tank)$/i.test(body)) return body;
  if (kind === 'vehicle') return body + 'Vehicle';
  if (kind === 'aircraft') return body + 'Aircraft';
  if (kind === 'structure') return body + 'Structure';
  return body + 'Infantry';
}

function buildIdFromCore(side, core, kind, rawMessage) {
  let body = String(core || '').replace(/[^A-Za-z0-9]/g, '');
  if (body.length < 3) return null;
  body = body.charAt(0).toUpperCase() + body.slice(1);
  body = appendKindSuffix(body, kind);
  const sideP = side && SIDE_PREFIX[side] ? SIDE_PREFIX[side] : '';
  let id = sideP + body;
  const tech = extractTechSuffix(rawMessage);
  if (tech && !id.endsWith(tech)) id += tech;
  return isReasonableUnitId(id) ? id : null;
}

function resolveUnitIdSyncFallback(displayName, rawMessage) {
  const name = stripNoise(displayName);
  const kind = inferUnitKind({ displayName: name, rawMessage });
  const side = inferSideFromText(`${name} ${rawMessage || ''}`);

  if (/^[A-Za-z][A-Za-z0-9]{4,}$/.test(name)) {
    const id = buildIdFromCore(side, name, kind, rawMessage);
    if (id) return id;
  }

  if (CN_WORD_MAP[name]) {
    return buildIdFromCore(side, CN_WORD_MAP[name], kind, rawMessage);
  }

  const tokenized = translateDisplayNameTokens(name);
  if (tokenized.length >= 3) {
    return buildIdFromCore(side, tokenized, kind, rawMessage);
  }

  if (/磁暴|磁能|Tesla/i.test(name + rawMessage)) {
    return buildIdFromCore(side, 'SuperTeslaTrooper', kind, rawMessage);
  }

  return null;
}

async function resolveUnitIdWithLLM(displayName, rawMessage, context = {}) {
  const { callLLM } = require('./agent-planner');
  const { kind, side, samples = [], techConvention } = context;
  const sampleBlock =
    samples.length > 0
      ? `项目已有 ID（模仿风格与长度）：\n${samples.slice(0, 12).join('\n')}`
      : '（无样本，参考 SovietAntiInfantryInfantry、SovietMagneticSoldier）';

  const userBlock = `显示名：${displayName}
用户原话：${rawMessage || '（无）'}
阵营：${side || '推断'}
类型：${kind || 'infantry'}
科技后缀惯例：${techConvention || 'Tech1~Tech4'}

${sampleBlock}

只输出 JSON：{"unitId":"PascalCaseId"}`;

  try {
    const raw = await callLLM(
      [
        { role: 'system', content: `你是 RA3 MOD 单位命名专家。${NAMING_GUIDE}` },
        { role: 'user', content: userBlock },
      ],
      { maxTokens: 64, temperature: 0.1 }
    );
    return parseUnitIdFromLlmRaw(raw);
  } catch (e) {
    console.warn('[unit-id-naming] LLM 命名失败:', e.message);
    return null;
  }
}

/**
 * 中文显示名 → 规则命名优先；LLM 仅补充；必须通过 isReasonableUnitId
 */
async function resolveUnitIdFromDisplayName(displayName, rawMessage = '') {
  const root = getCurrentFolder();
  const kind = inferUnitKind({ displayName, rawMessage });
  const side = inferSideFromText(`${displayName} ${rawMessage || ''}`);

  let base = null;

  if (hasCjk(displayName)) {
    base = resolveUnitIdSyncFallback(displayName, rawMessage);
  }

  // 规则命名成功则跳过全项目采样 + LLM，避免大 MOD 同步遍历卡死主进程
  if (isReasonableUnitId(base)) {
    if (!root) return base;
    const { ensureUniqueUnitId } = require('./unit-xml-builder');
    return ensureUniqueUnitId(base, root);
  }

  const samples = collectProjectUnitIdSamples(root);
  const techConvention = detectTechLevelConvention(samples);

  if (!base) {
    base = await resolveUnitIdWithLLM(stripNoise(displayName), rawMessage, {
      kind,
      side,
      samples,
      techConvention,
    });
  }

  if (!isReasonableUnitId(base)) {
    base = resolveUnitIdSyncFallback(displayName, rawMessage);
  }

  if (!isReasonableUnitId(base)) {
    base =
      buildIdFromCore(side, 'SuperTeslaTrooper', kind, rawMessage) ||
      buildIdFromCore(side, 'CustomUnit', kind, rawMessage);
  }

  if (!isReasonableUnitId(base)) {
    const sideP = side && SIDE_PREFIX[side] ? SIDE_PREFIX[side] : 'Soviet';
    base = `${sideP}Custom${kind === 'vehicle' ? 'Vehicle' : 'Infantry'}${extractTechSuffix(rawMessage) || 'Tech1'}`;
  }

  if (!root) return base;
  const { ensureUniqueUnitId } = require('./unit-xml-builder');
  return ensureUniqueUnitId(base, root);
}

module.exports = {
  resolveUnitIdFromDisplayName,
  resolveUnitIdSync: resolveUnitIdSyncFallback,
  isValidAsciiUnitId,
  isReasonableUnitId,
  stripNoise,
  collectProjectUnitIdSamples,
  NAMING_GUIDE,
};
