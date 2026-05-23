# RA3 MOD XML 标签速查（GameObject 体系）

## 根结构

- `<AssetDeclaration xmlns="uri:ea.com:eala:asset">` — 文件根
- `<Include type="instance" source="DATA:BaseObjects/BaseInfantry.xml" />` — 继承步兵/车辆/飞机基类

## 生命值

- **路径**：`<Body><ActiveBody id="ModuleTag_Body" MaxHealth="400" /></Body>`
- 勿与旧版 `<Health MaxHealth>` 混淆

## 移动

- `<LocomotorSet Locomotor="..." Speed="60" />` — Speed 为面板速度值

## 造价

- `<ObjectResourceInfo><BuildCost Account="=$ACCOUNT_ORE" Amount="950"/></ObjectResourceInfo>`
- `BuildTime` 在 GameObject 属性上（秒）

## 护甲

- `<ArmorSet Armor="..." DamageFX="VehicleDamageFX" />`

## 武器

- `<WeaponSetUpdate>` → `<WeaponSlot ID="0" WeaponTemplate="武器ID" />`
- 武器定义见 [weapon-config.md](weapon-config.md)

## 绘制

- `<Draws><SkinnedDraw Model="模型资源名" /></Draws>`

## 行为模块（Behaviors 常用）

| 模块 | 作用 |
|------|------|
| WeaponSetUpdate | 武器槽 |
| Die | 死亡表现 |
| PhysicsBehavior | 物理移动 |
| FiringAttribute | 炮塔开火（载具） |
| SpecialPowerHolder | 技能 |

## KindOf / Side

- Side：`Allies` | `Soviet` | `Japan`
- KindOf 列表见 [kindof-weapon-dictionary.md](kindof-weapon-dictionary.md)
