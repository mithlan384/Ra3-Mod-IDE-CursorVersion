# 遭遇战 AI 战略状态模块（资料整合）

> 来源：`资料/AI教程之添加新技能.doc`、`资料/AI基础教程.doc`（部分为图片未能提取）。  
> 与 [globaldata-skirmish-ai.md](globaldata-skirmish-ai.md) 互补：该文讲 BuildRequest/MapMetaData；本文讲 **AIStrategicStateDefinition** 战术模块。

## 目录与文件

| 路径 | 作用 |
|------|------|
| `SageXml/SkirmishAI/States/` | 各 AI **能力模块**（骚扰、主攻等）定义 |
| `SkirmishAI/AIMicroManagerLibrary` | 所有 **MicroManager**（撤退/技能权限等） |
| `*Personality.xml` / `*BaseStates.xml` | 指挥官个性：引用哪些 StrategicState |

**关键规则**：不要直接改原版模块 id；复制后改 **新 id**，再在个性文件中引用。

## 引用关系

个性文件（如 `AlliedSpecialForces`）中：

```xml
<StrategicState id="IFVHarrassment" State="IFVHarrassment" Difficulty="MEDIUM HARD BRUTAL"/>
<StrategicState id="SpecialForces_MainAttack" State="SpecialForces_MainAttack" Difficulty="MEDIUM HARD BRUTAL"/>
```

- `id`：本个性中的引用名  
- `State`：对应 `AIStrategicStateDefinition` 的 **id**（须在 States 目录有定义）

## 模块结构示例：IFV 骚扰

```xml
<AIStrategicStateDefinition id="IFVHarrassment" MaxTargets="1">
  <Heuristic>
    <EnemyNearbyHeuristic Distance="900.0" EnemyNearby="false"/>
  </Heuristic>
  <TargetHeuristic TargetHeuristic="SafestToGroundHarvesterHeuristic" Priority="20"/>
  <TargetHeuristic TargetHeuristic="SafestToGroundPowerPlantHeuristic" Priority="10"/>
  <Tactic id="Attack" Tactic="SimpleAttack" EndBehavior="DISBAND"
          DisbandAfterRetreatTeamSize="0" UseAestheticsManager="false">
    <TeamTemplate MinUnits="10" MaxUnits="10" MinPowerAdvantage="0.5"
                  RegisteredObjectSet="INFANTRY"
                  IncludeKindOf="CAN_ATTACK INFANTRY"
                  ExcludeKindOf="IGNORES_SELECT_ALL HARVESTER"
                  MicroManager="HarrassmentMicroManager">
      <CreateUnits UnitName="AlliedAntiAirVehicleTech1" MinUnits="5" MaxUnits="5"/>
    </TeamTemplate>
  </Tactic>
</AIStrategicStateDefinition>
```

| 节点 | 含义 |
|------|------|
| Heuristic | 何时启用（附近无敌、已有某单位等） |
| TargetHeuristic | 攻击谁（矿车、电厂、建筑…）及优先级 |
| TeamTemplate | 队伍规模、KindOf 过滤、**MicroManager** |
| CreateUnits | 为此战术 **额外生产** 的单位（与 RegisteredObjectSet 配合） |

## 主攻模块示例

`SpecialForces_MainAttack`：`MinUnits="12"` → 利塞特首波约 6 辆 IFV（每车 2 步兵）。`Tactic="DefenseAvoidanceAttack"`，`EndBehavior="RAMPAGE"`。

## 新增技能：步兵骚扰模板

```xml
<AIStrategicStateDefinition id="InfantryHarrassment" MaxTargets="2">
  <Heuristic>
    <EnemyNearbyHeuristic Distance="900.0" EnemyNearby="false"/>
    <ObjectOfTypeExistsHeuristic PassIfExists="true">
      <ObjectFilter Relationship="SAME_PLAYER" Rule="ANY">
        <IncludeThing>AlliedAntiInfantryInfantry</IncludeThing>
      </ObjectFilter>
    </ObjectOfTypeExistsHeuristic>
  </Heuristic>
  <TargetHeuristic TargetHeuristic="SafestToGroundHarvesterHeuristic" Priority="20"/>
  <Tactic id="Attack" Tactic="DefenseAvoidanceAttack" DisbandAfterRetreatTeamSize="999">
    <TeamTemplate MinUnits="8" MaxUnits="10" MinPowerAdvantage="0.75"
                  RegisteredObjectSet="SKIRMISH_AI_NORMAL_COMBAT_UNITS"
                  IncludeKindOf="CAN_ATTACK"
                  ExcludeKindOf="IGNORES_SELECT_ALL HARVESTER"
                  AllowedLocomotorTypes="LAND AMPHIBIOUS AIR"
                  MicroManager="StandardMicroManager">
      <ObjectFilter Rule="ANY">
        <IncludeThing>AlliedAntiInfantryInfantry</IncludeThing>
      </ObjectFilter>
    </TeamTemplate>
  </Tactic>
</AIStrategicStateDefinition>
```

要点：招募单位用 `<IncludeThing>` / `<CreateUnits>`；多参考同类原版 State 再改。

## 复杂示例：激流运兵突击

`AlliedTransportAttack` 组合：

- `IntervalHeuristic` + `EnemyNearbyHeuristic` + `ObjectOfTypeExistsHeuristic`（已有 PK/标枪）
- `PathToTargetHeuristic`（路径不可达时不发动）
- `<CreateUnits UnitName="AlliedAntiInfantryVehicle" MinUnits="1" MaxUnits="1"/>` 生产 1 辆激流，载 3–5 步兵打建筑

## MicroManager

| 名称 | 说明 |
|------|------|
| `StandardMicroManager` | 通用，多数战术可用 |
| `HarrassmentMicroManager` | 骚扰撤退/技能策略 |
| `SpecialForcesMicroManager` | 特战主攻 |

新 Manager 需 **新文件 + 新 id**；在 `AIMicroManagerLibrary` 注册。

## 集成 checklist

1. 在 `States/` 新建或复制 `AIStrategicStateDefinition`（**新 id**）  
2. 在对应 `*Personality.xml` 增加 `<StrategicState … State="你的id"/>`  
3. `EditorName` 与 BaseStates 中 `BuildRequest` 的建造名一致（若模块会生产单位）  
4. Mod.xml 注册修改过的 SkirmishAI 文件  
5. MapMetaData 绑定该 AI 个性  

## Agent 提示

- 「给 AI 加骚扰矿车战术」→ 复制 `IFVHarrassment` 类模块，改 `CreateUnits` 与 `TargetHeuristic`  
- 「AI 用新单位进攻」→ 除 BaseStates 的 BuildRequest 外，常需在 StrategicState 的 `CreateUnits` / `IncludeThing` 中声明  
