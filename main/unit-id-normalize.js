/**
 * 将 ziliao/SDK 中的 NAME:ALLIEDANTIVEHICLEVEHICLETECH1 转为 SageXml PascalCase：
 * AlliedAntiVehicleVehicleTech1
 */

const FACTIONS = [
  { upper: 'ALLIED', pascal: 'Allied' },
  { upper: 'SOVIET', pascal: 'Soviet' },
  { upper: 'JAPAN', pascal: 'Japan' },
];

/** 按长度降序，贪心切分 */
const SEGMENTS = [
  'AntiInfantry',
  'AntiVehicle',
  'AntiStructure',
  'AntiNaval',
  'AntiNavy',
  'AntiGround',
  'AntiAir',
  'Infantry',
  'Vehicle',
  'Structure',
  'Naval',
  'Ground',
  'Aircraft',
  'Ship',
  'Scout',
  'Commando',
  'Artillery',
  'Bomber',
  'Fighter',
  'Support',
  'Gunship',
  'Walker',
  'Transport',
  'Crusher',
  'Mortar',
  'Desolator',
  'Legionnaire',
  'Infiltration',
  'Archer',
  'Sentinel',
  'Fortress',
  'Grinder',
  'Surveyor',
  'Large',
  'Heavy',
  'Light',
  'Tech3',
  'Tech2',
  'Tech1',
  'MCV',
  'Miner',
  'Egg',
  'Return',
  'To',
  'Base',
  'Field',
  'Yard',
  'Barracks',
  'Ship',
  'Air',
  'Sea',
  'Land',
].sort((a, b) => b.length - a.length);

/** 是否像可玩单位/建筑的 SageXml id（过滤 Ability、ReturnToBase 子串） */
function isLikelyGameObjectId(normalized) {
  if (!normalized || normalized.length > 48) return false;
  if (!/^(Allied|Soviet|Japan)/.test(normalized)) return false;
  if (/ReturnTo|Transform|Ability/i.test(normalized)) return false;
  return /(Infantry|Vehicle|Tech[123]|Ship|Aircraft|Scout|Commando|Artillery|Future|Miner|MCV|Walker|Cycle|Transport|Sentinel|Fortress|Grinder|Surveyor|Gunship|Bomber|Fighter|Support|Structure|Barracks|WarFactory|Refinery|Construction|PowerPlant|NavalYard|Airfield|OutPost|BaseDefense|SuperWeapon|WallPiece)$/i.test(
    normalized
  );
}

function splitUpperRest(rest) {
  const parts = [];
  let s = rest;
  while (s.length > 0) {
    const seg = SEGMENTS.find((t) => s.startsWith(t.toUpperCase()));
    if (seg) {
      parts.push(seg);
      s = s.slice(seg.length);
      continue;
    }
    const m = s.match(/^(TECH\d|MCV|AIR|SEA)/i);
    if (m) {
      const raw = m[1];
      const norm =
        raw.toUpperCase() === 'MCV'
          ? 'MCV'
          : raw.toUpperCase().startsWith('TECH')
            ? 'Tech' + raw.replace(/\D/g, '')
            : raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
      parts.push(norm);
      s = s.slice(raw.length);
      continue;
    }
    parts.push(s.charAt(0) + s.slice(1).toLowerCase());
    s = s.slice(1);
  }
  return parts.join('');
}

/**
 * @param {string} raw - e.g. ALLIEDANTIVEHICLEVEHICLETECH1 or AlliedArtilleryVehicle
 * @returns {string}
 */
function normalizeUnitId(raw) {
  if (!raw || typeof raw !== 'string') return raw;
  let id = raw.trim().replace(/^NAME:/i, '');
  if (!id) return id;

  if (/[a-z]/.test(id) && /[A-Z]/.test(id.slice(1))) {
    return id.charAt(0).toUpperCase() + id.slice(1);
  }

  const upper = id.toUpperCase();
  for (const f of FACTIONS) {
    if (upper.startsWith(f.upper)) {
      const rest = upper.slice(f.upper.length);
      return f.pascal + splitUpperRest(rest);
    }
  }

  if (/^[A-Z_]+$/.test(id)) {
    return id
      .toLowerCase()
      .split('_')
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join('');
  }
  return id.charAt(0).toUpperCase() + id.slice(1);
}

module.exports = { normalizeUnitId, splitUpperRest, isLikelyGameObjectId };
