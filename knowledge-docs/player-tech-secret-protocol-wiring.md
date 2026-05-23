# 玩家科技 / 机密协议 / 支援技能完整接线（资料整合）

> 来源：`资料/机密协议.doc`、`资料/RA3DIY：代码进阶篇.pdf`（第 10 节）。  
> 基础概念见 [upgrades-tech-tree.md](upgrades-tech-tree.md)；本文补 **从按钮到 OCL 的整条链路**。

## 涉及文件一览

| 文件 | 作用 |
|------|------|
| `PlayerTemplates.xml` | 阵营模板、`PlayerTechUpgradeBinding` |
| `playertechs.xml` / `PlayerTechs.xml` | 科技节点、前置、点数 |
| `PlayerTechStoreTemplates.xml` | 协议/支援 **商店 UI 排列**（`<Row><Button>`） |
| `ButtonStateDataCommon.xml` | 按钮图标、标题、描述 CSF |
| `PlayerPowerButtonTemplates.xml` | 玩家技能按钮 → SpecialPower |
| `ButtonTemplates.xml` / Joypad | 手柄映射 |
| `SpecialPowerTemplates.xml` | 冷却、目标类型、ForbiddenPlayerTech |
| `LogicCommand.xml` | `Type="SPECIAL_POWER"` 命令 |
| `LogicCommandSet`（如 `PlayerSpellBookCommandSet`） | 技能栏 Cmd 列表 |
| `ObjectCreationLists.xml` | 空投、信标、召唤单位 |
| `PlayerSpellBook.xml` | 玩家「魔法书」单位上的 PowerManager / OCLSpecialPower |
| 单位 XML（如运输机） | `InitialPayload`、`EjectPassengers` 等 |

## 链路示意

```
PlayerTechStore（UI 买协议）
  → PlayerTech（解锁）
    → PlayerPowerButtonTemplate / LogicCommand
      → SpecialPowerTemplate
        → 单位 Behaviors：PlayerPowerManager / OCLSpecialPower / SpecialAbilityUpdate
          → ObjectCreationList（生成单位或信标）
```

## PlayerTech 示例

```xml
<PlayerTech id="PlayerTech_Allied_Paradrop_Rank1" TechPointsRequired="1">
  <TechDependency>PlayerTech_Allied_HighTechnology</TechDependency>
</PlayerTech>
```

## 商店按钮

```xml
<PlayerTechStoreTemplate id="PlayerTechStore_Allied" Faction="Allies">
  <Row>
    <Button>Purchase_PlayerTech_Allied_PrecisionStrike</Button>
    <Button></Button>
    <Button>Purchase_PlayerTech_Allied_ChronoSwap</Button>
  </Row>
</PlayerTechStoreTemplate>

<PurchasePlayerTechButtonTemplate
  id="Purchase_PlayerTech_Allied_Paradrop_Rank1"
  PlayerTech=""
  StateData=""/>
```

`StateData` 对应 `ButtonStateDataCommon` 中的 UI 条目。

## SpecialPower → LogicCommand

```xml
<SpecialPowerTemplate
  id="SpecialPowerParadropLvl1"
  ReloadTime="300s"
  TargetType="LOCATION"
  RadiusCursorRadius="100"
  RequiredPlayerTech=""
  Flags="IS_PLAYER_POWER PATHABLE_ONLY ...">
  <GameDependency id="Allied_Paradrop_Rank1_GameDependency">
    <RequiredObject>AlliedConstructionYard</RequiredObject>
  </GameDependency>
  <ForbiddenPlayerTech>PlayerTech_Allied_Paradrop_Rank2</ForbiddenPlayerTech>
</SpecialPowerTemplate>

<LogicCommand Options="NEED_TARGET_POS" Type="SPECIAL_POWER" id="Command_ParadropLvl1">
  <SpecialPower>SpecialPowerParadropLvl1</SpecialPower>
  <AISpecialPowerInfo Heuristic="PLAYER_AOE_BUFF" Manager="SKIRMISH_AI" .../>
</LogicCommand>
```

## PlayerSpellBook 行为

```xml
<GameObject id="PlayerSpellBook" inheritFrom="PlayerSpellBook" CommandSet="" xai:joinAction="Append">
  <Behaviors>
    <PlayerPowerManager id="ModuleTag_PlayerPowerManager_ParadropLvl1" SpecialPowerTemplate=""/>
    <OCLSpecialPower
      id="ModuleTag_ParadropLvl1"
      SpecialPowerTemplate=""
      OCL=""
      DestinationOCL=""
      CreateLocation="CREATE_AT_OFFSET_FROM_TARGET_ALONG_SECONDARY_OBJECT_VECTOR_AND_MOVE_TO_TARGET"
      CreateLocationOffset="1000.0">
      <NearestSecondaryObjectFilter Relationship="SAME_PLAYER">
        <IncludeThing>AlliedConstructionYard</IncludeThing>
      </NearestSecondaryObjectFilter>
    </OCLSpecialPower>
  </Behaviors>
</GameObject>
```

## OCL 空投

```xml
<ObjectCreationList id="OCL_ParaDropLvl1">
  <CreateObject
    Options="IGNORE_ALL_OBJECTS DONT_SET_PRODUCER ISSUE_MOVE_AFTER_CREATION ..."
    Disposition="LIKE_EXISTING"
    FireSpecialPowerTemplate="">
    <Offset x="0" y="0" z="190"/>
    <CreateObject>…</CreateObject>
  </CreateObject>
</ObjectCreationList>
```

精准打击类会先创建 `OCL_PrecisionStrikeBeacon` 信标单位。

## 运输机 + 弹射步兵

修改 `CAMP_AlliedBomberAircraft_*` 等：`<InitialPayload>` 载员、`SpecialPower` + `EjectPassengersSpecialAbilityUpdate`、`RunOffMapBehavior` 从地图外飞入。

## AI 对玩家技能权重

`AlliedAirMarshall.xml` 等个性中的 `<PowerChoice PlayerPower="" Weight="300%"/>` 影响 AI 施放支援技能的倾向。

## 新增协议 Checklist

1. 新建 `PlayerTech` + 依赖  
2. `PlayerTechStoreTemplate` 加 `<Button>`  
3. `ButtonStateData` + `PurchasePlayerTechButtonTemplate`  
4. `SpecialPowerTemplate` + `LogicCommand` + 加入 `PlayerSpellBookCommandSet`  
5. `PlayerSpellBook` 或具体单位上挂 `PlayerPowerManager` / `OCLSpecialPower`  
6. 如需生成单位：`ObjectCreationList` + Mod.xml 注册  
7. CSF：`NAME:` / `DESC:` 条目  

## Agent 提示

- 「加盟军二级空投协议」→ 全套 PlayerTech + Store + SpecialPower + OCL，勿只改 playertechs 一行  
- 「技能栏多一个按钮」→ `PlayerSpellBookCommandSet` 增加 `<Cmd>`  
