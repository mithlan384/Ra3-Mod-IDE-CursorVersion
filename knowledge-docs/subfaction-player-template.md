# 阵营与子阵营（进阶）

引擎原生阵营：**Allies、Soviet、Japan、Neutral**。新派系通常通过 `PlayerTemplate.xml` 子阵营实现。

## 子阵营模板

```xml
<PlayerTemplate
    id="Soviet_Elite"
    Side="Soviet"
    StartingUnit="SovietEliteMCV"
    FactionIconImageName="GameSetup_flag_Soviet"
    DisplayName="DESC:Soviet_Elite_Name">
    <StartupResources Ore="10000"/>
</PlayerTemplate>
```

| 字段 | 说明 |
|------|------|
| id | 子阵营唯一 ID |
| Side | **只能是** Allies / Soviet / Japan / Neutral |
| StartingUnit | 开局单位，区分科技树的核心 |
| StartupResources | 开局资源 |

## 关键警告

- **Side 不可自创**：填 Allies/Soviet/Japan/Neutral 以外值会编译失败
- 强行扩展需改 `Schemas\xsd\Includes\FactionType.xsd`，易导致 UI 严重错误
- 独立 UI（国旗、生产栏背景）需改 AptUI（.apt / .const），放入 `Mod名\Additional\Data`，并在 Mod.xml 注册

## 与单位 Side 的关系

单位 GameObject 的 `Side="Soviet"` 与子阵营 `Side="Soviet"` 挂靠同一引擎阵营；子阵营通过不同 StartingUnit、建筑队列区分玩法。

详见 [create-faction.md](create-faction.md)。
