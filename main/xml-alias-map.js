// main/xml-alias-map.js
// RA3 MOD 常用术语 → XML 标签/属性 映射，用于 Query Rewriting 展开

const ALIAS_MAP = {
  // 血量相关
  '血量': ['Health', 'MaxHealth'],
  '生命值': ['Health', 'MaxHealth'],
  '血': ['Health'],
  '受伤阈值': ['MaxHealthDamaged'],
  '回血': ['RegenRate'],
  '治疗': ['RegenRate', 'Healable'],

  // 装甲/防御
  '护甲': ['ArmorSet'],
  '装甲': ['ArmorSet'],
  '防御': ['ArmorSet', 'Body'],

  // 武器
  '武器': ['Weapon', 'WeaponSetUpdate'],
  '攻击力': ['Weapon.Damage'],
  '伤害': ['Weapon.Damage'],
  '射程': ['Weapon.Range'],
  '射速': ['Weapon.Speed'],
  '装弹': ['Weapon.ReloadTime'],

  // 移动
  '速度': ['Locomotor', 'Speed'],
  '移动速度': ['Locomotor', 'Speed'],
  '跑太慢': ['Locomotor', 'Speed'],
  '太慢': ['Locomotor', 'Speed'],
  '加速': ['Locomotor', 'Speed'],
  ' locomotor': ['Locomotor'],

  // 生产
  '造价': ['Cost'],
  '费用': ['Cost'],
  '生产时间': ['ProductionTime'],
  '建造时间': ['ProductionTime'],

  // 视觉
  '模型': ['Draws', 'Model'],
  '贴图': ['Draws', 'Texture'],
  '外观': ['Draws'],

  // 单位类型
  '步兵': ['KindOf', 'INFANTRY'],
  '车辆': ['KindOf', 'VEHICLE'],
  '飞机': ['KindOf', 'AIRCRAFT'],
  '建筑': ['KindOf', 'STRUCTURE'],
  '海军': ['KindOf', 'NAVAL'],

  // 天启坦克
  '天启': ['ApocalypseTank'],
  '天启坦克': ['ApocalypseTank'],
  'Apocalypse': ['ApocalypseTank'],

  // 动员兵
  '动员兵': ['SovietConscript'],
  '兵': ['SovietConscript'],

  // 阵营
  '盟军': ['Side', 'Allied'],
  '苏联': ['Side', 'Soviet'],
  '升阳': ['Side', 'Imperial'],
};

/**
 * 展开用户查询中的中文术语为 XML 关键词
 * @param {string} query 用户原始输入
 * @returns {string} 展开后的查询（含原始词 + 展开词）
 */
function expandQuery(query) {
  const matched = new Set();
  const keys = Object.keys(ALIAS_MAP).sort((a, b) => b.length - a.length);
  for (const alias of keys) {
    if (query.includes(alias)) {
      for (const t of ALIAS_MAP[alias]) matched.add(t);
    }
  }
  if (matched.size === 0) return query;
  return `${query} ${[...matched].join(' ')}`;
}

module.exports = { ALIAS_MAP, expandQuery };
