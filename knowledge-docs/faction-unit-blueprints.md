# 三大阵营标准单位蓝本 ID

创建新单位时，优先从 SageXml 复制对应蓝本，或在项目中 `findUnitsByName` 查找。

## 苏联

| 中文 | unitId | 类型 | 推荐 templateUnit |
|------|--------|------|-------------------|
| 动员兵/征召兵 | SovietAntiInfantryInfantry | 步兵 | 同左 |
| 铁锤坦克 | SovietAntiVehicleVehicleTech1 | 车辆 | 同左 |
| 天启坦克 | SovietAntiVehicleVehicleTech3 | 车辆 | 同左 |

**动员兵要点**：Side=Soviet，Model=SUInfantry_Conscript，武器 SovietInfantryConscriptRifle

**铁锤坦克要点**：MaxHealth=500，WeaponTemplate=SovietAntiVehicleVehicleTech1Cannon，Model=SVTank_HmTk

## 盟军

| 中文 | unitId | 类型 | 推荐 templateUnit |
|------|--------|------|-------------------|
| 维和步兵 | AlliedAntiInfantryInfantry | 步兵 | 同左 |
| 守护者坦克 | AlliedAntiVehicleVehicleTech1 | 车辆 | 同左 |

**维和步兵要点**：Side=Allies，武器 AlliedAntiInfantryInfantryShotgun，Model=AUInfantry_Peckeeper

**守护者坦克要点**：MaxHealth=400，Model=AVTank_Grdn，可借用 SpecialPower_TargetPainter

## 旭日帝国

| 中文 | unitId | 类型 | 推荐 templateUnit |
|------|--------|------|-------------------|
| 帝国武士 | JapanAntiInfantryInfantry | 步兵 | 同左 |
| 海啸坦克 | JapanAntiVehicleVehicleTech1 | 车辆 | 同左 |

**帝国武士要点**：Side=Japan，Model=JUInfantry_ImpWarr

**海啸坦克要点**：双武器槽（主炮+鱼雷），Speed=75，Model=JVTank_TsnTk

## 建筑 CommandSet 对照（加入生产队列）

| 单位类型 | 盟军 | 苏联 | 帝国 |
|----------|------|------|------|
| 步兵 | AlliedBarracksCommandSet | SovietBarracksCommandSet | JapanBarracksCommandSet |
| 车辆 | AlliedWarFactoryCommandSet | SovietWarFactoryCommandSet | JapanWarFactoryCommandSet |

## 自然语言 → templateUnit

- 「新建盟军坦克」→ AlliedAntiVehicleVehicleTech1
- 「新建苏联步兵」→ SovietAntiInfantryInfantry
- 「新建帝国坦克」→ JapanAntiVehicleVehicleTech1
- 「像守护者一样的新坦克」→ AlliedAntiVehicleVehicleTech1，新 id 如 MyTank
