# KindOf 与武器系统词典（简明版）

> 完整 KindOf 分类见 [kindof-advanced.md](kindof-advanced.md)。武器进阶见 [weapon-template-advanced.md](weapon-template-advanced.md)。

## KindOf 常用标签

| 标签 | 含义 |
|------|------|
| SELECTABLE | 可被鼠标选中 |
| CAN_ATTACK | 拥有攻击能力 |
| INFANTRY | 步兵（受围墙、驻军影响） |
| VEHICLE | 车辆 |
| STRUCTURE | 建筑 |
| AIRCRAFT | 飞机 |
| CAN_BE_FAVORITE_UNIT | 可设为集结点爱用单位 |
| T2_UNIT / T3_UNIT | 单位层级，影响 AI |
| CAN_CAST_REFLECTIONS | 反射效果 |
| SCORE | 计入分数 |
| IGNORE_FORCE_MOVE | 无视强制移动 |
| REVEAL_AS_ATTACKER | 攻击后短暂暴露于小地图 |

**步兵示例 KindOf**：
`SELECTABLE CAN_ATTACK CAN_CAST_REFLECTIONS SCORE INFANTRY CAN_BE_FAVORITE_UNIT`

**车辆示例 KindOf**：
`SELECTABLE CAN_ATTACK CAN_CAST_REFLECTIONS SCORE VEHICLE CAN_BE_FAVORITE_UNIT T2_UNIT`

## WeaponCategory

| 值 | 适用 |
|----|------|
| GUN / RIFLE | 步枪类步兵 |
| CANNON | 坦克主炮 |
| MELEE | 近战 |

## WeaponTemplate 与 Nuggets

武器定义在 `Weapon.xml` 或单位 XML 内的 `<WeaponTemplate>`。

**DamageNugget 常用属性**：
- `Damage` — 伤害数值
- `DamageType` — CANNON / MELEE / EXPLOSIVE / FLAME 等
- `DeathType` — NORMAL 等死亡动画类
- `Radius` — 溅射半径

**RequiredAntiMask**（可攻击目标域，空格分隔）：
- ANTI_GROUND — 地面
- ANTI_WATER — 水面/水下
- ANTI_STRUCTURE — 建筑

## 步兵附加

- `ShockwaveResistance` — 抗碾压等级，0 易被车辆碾死
- 载具需 `<FiringAttribute>` 绑定炮塔开火边

## 修改武器伤害的自然语言

用户说「把 MyTank 主炮伤害改成 80」→ 找到 `WeaponTemplate` id（如 MyTankGun）→ 修改 `<DamageNugget Damage="80"/>`
