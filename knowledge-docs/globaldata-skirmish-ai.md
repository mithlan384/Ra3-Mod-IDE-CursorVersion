# GlobalData 与遭遇战 AI（进阶）

## GlobalData（SageXml\GlobalData）

全局注册表目录，新内容必须在此登记才可被引用：

| 文件 | 内容 |
|------|------|
| Weapon.xml | 武器模板 |
| LogicCommand.xml | 生产/命令 |
| LogicCommandSet.xml | 命令集 |
| Upgrades.xml | 科技升级 |
| ArmorSet.xml | 装甲类型 |
| Locomotor.xml | 运动模式 |
| SpecialPowerTemplates.xml | 特殊能力 |
| ObjectCreationList.xml | OCL |
| FXList.xml | 特效列表 |

复制到 MOD `data/GlobalData/` 后修改，并在 Mod.xml 注册。

## PlayerTemplates

定义阵营与开局：`Side`、`StartingUnit`、`StartupResources`。见 [subfaction-player-template.md](subfaction-player-template.md)。

## 遭遇战 AI（SkirmishAI）

**目录**：`SageXml\SkirmishAI` → 复制到 MOD `data/SkirmishAI`

| 文件类型 | 作用 |
|----------|------|
| *BaseStates.xml | 通用建造逻辑，「能造什么」 |
| *Balanced.xml 等 | 指挥官个性，「爱造什么」 |

**生产请求示例**：
```xml
<BuildRequest>
    <ThingTemplate>MyTank</ThingTemplate>
    <Weight>70</Weight>
    <MaxCount>5</MaxCount>
</BuildRequest>
```

**启发式 Heuristic**：
- RANDOM_UNIT — 随机
- BEST_UNIT_EXPECTED — 最佳期望单位

**战术参数**：
- PercentLow / PercentHigh — 随机建造概率范围
- BlockIfThingNearFactory — 工厂附近有特定敌人时优先克制单位

**MapMetaData**：`data/AdditionalMaps/MapMetaData_Mod.xml` 注册 AI 个性。

## Agent 流程

用户要「AI 也会造新单位」→ 改对应阵营 BaseStates + 个性 xml + MapMetaData + Mod.xml。

## 延伸阅读

- [skirmish-ai-strategic-states.md](skirmish-ai-strategic-states.md) — AIStrategicStateDefinition 战术模块（骚扰、运兵突击等）  
