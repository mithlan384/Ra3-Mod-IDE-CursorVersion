# 装甲、运动与 Behaviors 模块（进阶）

## 一、ArmorSet（装甲）

单位 XML 内引用 Armor ID，DamageFX 绑定受损视觉（冒烟、着火等）。

```xml
<ArmorSet Armor="VehicleArmor" DamageFX="VehicleDamageFX" />
```

**常用类型**：InfantryArmor、VehicleArmor、StructureArmor、AircraftArmor、NavalArmor、HeroArmor

**伤害计算**：Weapon 中 DamageType 与 Armor 类型在引擎内查表修正（如 CANNON 对 VehicleArmor 全额，对 InfantryArmor 可能约 70%）。

定义表在 `ArmorSet.xml`（GlobalData）。

## 二、Locomotor（运动）

Locomotor 在 `Locomotor.xml` 定义，单位通过 `<LocomotorSet>` 引用：

```xml
<LocomotorSet Locomotor="AlliedAntiVehicleVehicleTech1Locomotor" Speed="60" />
```

| 模式 | 说明 |
|------|------|
| BasicInfantryLocomotor | 步兵行走 |
| Drive | 履带/轮式载具，可设 Crusher 碾压 |
| Hover | 悬浮，可过水面 |
| Aircraft | 飞机，需机场与返航逻辑 |
| Levitate | 漂浮（部分 DLC），特殊硬编码行为 |

**Speed**：非直接像素速度，需游戏内测试手感。

## 三、Behaviors 行为模块

`<Behaviors>` 是单位逻辑核心：

| 模块 | 作用 |
|------|------|
| WeaponSetUpdate | 武器槽 0/1 |
| Die | 死亡动画、OCL、爆炸等 |
| PhysicsBehavior | 物理运动 |
| FiringAttribute | 炮塔开火边（载具） |
| SpecialPowerHolder | 技能，引用 SpecialPowerTemplate |
| AttributeModifierAuraUpdate | 光环 Buff/Debuff |
| StructureUnpackUpdate | 建筑展开/打包 |

## Agent 修改路径速查

| 需求 | 路径 |
|------|------|
| 改护甲类型 | GameObject → ArmorSet → Armor |
| 改速度 | LocomotorSet → Speed |
| 加技能 | Behaviors → SpecialPowerHolder |
| 改死亡效果 | Behaviors → Die |
