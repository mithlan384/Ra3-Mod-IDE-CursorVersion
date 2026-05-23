// main/asset-name-resolver.js —— 解析用户素材文件名/描述，匹配动画角色并规范化命名

const path = require('path');

const FACTION_PREFIX = {
  Soviet: 'SU',
  Allied: 'AU',
  Japan: 'JU',
  Allies: 'AU',
  Imperial: 'JU',
};

/** 动画角色 → GameObject XML 条件（起义时刻 / SageXml 惯例） */
const ANIM_ROLES = [
  {
    role: 'skin',
    label: '皮肤模型',
    patterns: [/_SKN$/i, /\.SKN\./i],
    isModel: true,
    parseType: 'PARSE_DEFAULT',
    conditions: null,
  },
  {
    role: 'die',
    label: '死亡动画',
    patterns: [/_DIE[A-Z]?$/i, /_WDIE/i, /_DTB[A-Z]?$/i, /_CDT[A-Z]?$/i, /死亡/i, /die/i],
    conditions: 'DYING DEATH_1',
    animationMode: 'ONCE',
    conflictWith: ['fire', 'move', 'idle'],
  },
  {
    role: 'fire',
    label: '开火/攻击动画',
    patterns: [/_ATK[A-Z]?$/i, /_FIRE/i, /开火/i, /攻击动画/i, /firing/i],
    conditions: 'FIRING_A',
    animationMode: 'ONCE',
    conflictWith: ['die'],
  },
  {
    role: 'attack_idle',
    label: '战斗待机',
    patterns: [/_AIDLE$/i, /_AIDA$/i, /_ABTA$/i, /_BATA$/i],
    conditions: 'ATTACKING',
    animationMode: 'LOOP',
    conflictWith: ['die'],
  },
  {
    role: 'move',
    label: '移动动画',
    patterns: [/_MOVA$/i, /_RUN[A-Z]?$/i, /_RUNDA$/i, /移动/i],
    conditions: 'MOVING',
    animationMode: 'LOOP',
    conflictWith: ['die', 'fire'],
  },
  {
    role: 'idle',
    label: '待机动画',
    patterns: [/_IDLA$/i, /_IDLE$/i, /_BIDA$/i, /_BIFA$/i, /_BIFB$/i, /待机/i],
    parseType: 'PARSE_DEFAULT',
    conditions: null,
    animationMode: 'LOOP',
  },
  {
    role: 'aux',
    label: '辅助骨骼/碰撞',
    patterns: [/_SKL$/i, /_COL$/i, /_CTR$/i, /_HRC$/i, /\.OBBOX/i],
    isAux: true,
  },
];

const AUDIO_ROLES = [
  { role: 'select', patterns: [/select/i, /选中/i] },
  { role: 'move', patterns: [/move/i, /移动/i, /march/i] },
  { role: 'fire', patterns: [/fire/i, /atk/i, /attack/i, /开火/i, /武器/i] },
  { role: 'die', patterns: [/die/i, /death/i, /死亡/i, /voiDie/i] },
];

function factionPrefix(folderSide) {
  return FACTION_PREFIX[folderSide] || 'SU';
}

function basenameNoExt(filePath) {
  return path.basename(filePath).replace(/\.[^.]+$/, '');
}

/**
 * 从文件名 + 用户描述推断动画角色
 */
function classifyAssetRole(basename, userHint = '') {
  const name = `${basename} ${userHint}`;
  const hintOnly = String(userHint || '');
  const hintRoles = [
    { re: /开火|攻击动画|firing|fir/i, role: 'fire' },
    { re: /死亡|die\b|dying/i, role: 'die' },
    { re: /移动|walk|run|march/i, role: 'move' },
    { re: /待机|idle|bored/i, role: 'idle' },
    { re: /皮肤|模型|skn/i, role: 'skin' },
  ];
  for (const h of hintRoles) {
    if (h.re.test(hintOnly)) {
      const def = ANIM_ROLES.find((d) => d.role === h.role);
      if (def) return { ...def, confidence: 0.95, fromHint: true };
    }
  }
  for (const def of ANIM_ROLES) {
    if (def.patterns.some((p) => p.test(name))) {
      return { ...def, confidence: 0.85 };
    }
  }
  if (/\.w3x$/i.test(basename) || /w3x/i.test(basename)) {
    return { role: 'unknown_anim', label: '未识别动画', confidence: 0.3 };
  }
  return { role: 'unknown', label: '未知', confidence: 0.2 };
}

function classifyAudioRole(basename, userHint = '') {
  const name = `${basename} ${userHint}`;
  for (const def of AUDIO_ROLES) {
    if (def.patterns.some((p) => p.test(name))) return def.role;
  }
  return 'generic';
}

/**
 * 规范化 W3X 资产 ID（起义时刻：大写、阵营前缀 + 单位缩写 + 后缀）
 */
function normalizeW3xAssetId(unitId, basename, roleDef, folderSide) {
  const prefix = factionPrefix(folderSide);
  const core = String(unitId)
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();
  const raw = basenameNoExt(basename).replace(/[^A-Za-z0-9_]/g, '');

  if (roleDef?.isModel || roleDef?.role === 'skin') {
    if (/_SKN$/i.test(raw)) return raw.toUpperCase();
    return `${prefix}${core}_SKN`.slice(0, 48);
  }

  const suffixMap = {
    die: 'DIEE',
    fire: 'ATKA',
    attack_idle: 'AIDLE',
    move: 'MOVA',
    idle: 'IDLA',
  };
  const suffix = suffixMap[roleDef?.role];
  if (suffix && !new RegExp(suffix, 'i').test(raw)) {
    return `${prefix}${core}_${suffix}`.slice(0, 48);
  }
  if (/^(SU|AU|JU|NP|FX|EX)/i.test(raw)) return raw.toUpperCase();
  return `${prefix}${raw}`.toUpperCase().slice(0, 48);
}

/**
 * 从用户消息解析「名称=路径」或「开火动画 xxx.w3x」
 */
function parseNamedAssetsFromMessage(message) {
  const out = {};
  const text = String(message || '');

  const pairs = [
    ...text.matchAll(
      /(皮肤|模型|开火|攻击|死亡|待机|移动|肖像|语音|贴图|音效)\s*[:：]?\s*["']?([^\s"'，。；;]+)["']?/gi
    ),
  ];
  for (const m of pairs) {
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    out[key] = val;
  }

  const pathRe =
    /([a-zA-Z]:[\\/][^\s'"]+\.(w3x|w3d|dds|tga|wav|mp3|png))(?:\s*[（(]([^)）]+)[)）])?/gi;
  let pm;
  while ((pm = pathRe.exec(text)) !== null) {
    const p = pm[1].replace(/\\/g, '/');
    const hint = pm[3] || '';
    out[`path:${p}`] = hint;
  }

  return out;
}

function validateRoleAssignment(assetsByRole) {
  const warnings = [];
  if (assetsByRole.fire && assetsByRole.die) {
    const fireName = assetsByRole.fire.normalizedId || '';
    const dieName = assetsByRole.die.normalizedId || '';
    if (fireName && dieName && fireName === dieName) {
      warnings.push('开火动画与死亡动画被解析为同一资产 ID，请检查文件名。');
    }
    if (/DIE/i.test(fireName) && /ATK/i.test(dieName)) {
      warnings.push('疑似开火/死亡动画 ID 颠倒（开火含 DIE、死亡含 ATK）。');
    }
  }
  return warnings;
}

module.exports = {
  ANIM_ROLES,
  FACTION_PREFIX,
  classifyAssetRole,
  classifyAudioRole,
  normalizeW3xAssetId,
  parseNamedAssetsFromMessage,
  validateRoleAssignment,
  basenameNoExt,
  factionPrefix,
};
