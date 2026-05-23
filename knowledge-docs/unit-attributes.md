# RA3 单位属性修改指南

## 修改血量（生命值）

**正确 XML 路径**：`GameObject > Body > ActiveBody` 的 `MaxHealth` 属性

```xml
<Body>
    <ActiveBody id="ModuleTag_Body" MaxHealth="400" />
</Body>
```

**自然语言**：「把守护者坦克血量改成 600」→ findUnitsByName(守护者) → setUnitProperty 路径 `Body.ActiveBody.MaxHealth` 或编辑 XML

**常见值**：步兵 120~160，主战坦克 400~500，天启 更高

## 修改移动速度

**路径**：`GameObject > LocomotorSet` 的 `Speed` 属性

```xml
<LocomotorSet Locomotor="AlliedAntiVehicleVehicleTech1Locomotor" Speed="60" />
```

步兵约 40~50，坦克约 60~75。

## 修改造价与建造时间

**造价**：`<ObjectResourceInfo><BuildCost Account="=$ACCOUNT_ORE" Amount="950"/></ObjectResourceInfo>`

**建造时间**：`GameObject` 属性 `BuildTime="10"`（秒）

## 修改护甲

**路径**：`<ArmorSet Armor="AlliedAntiVehicleVehicleTech1Armor" DamageFX="VehicleDamageFX" />`

护甲类型决定伤害减免，通常沿用蓝本 Armor 名。

## 修改武器伤害

见 `kindof-weapon-dictionary.md`。修改对应 `WeaponTemplate` 内 `DamageNugget` 的 `Damage`。

## 修改视野

部分单位在 `Behaviors` 内 `Vision` 模块；多数沿用蓝本。
