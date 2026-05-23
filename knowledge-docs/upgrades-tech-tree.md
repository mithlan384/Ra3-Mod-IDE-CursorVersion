# 升级与科技树（进阶）

## 可研发升级（Researchable Upgrade）

定义在 `GlobalData/Upgrades.xml`：

```xml
<UpgradeTemplate
    id="Upgrade_AlliedTech2"
    inheritFrom="BasePurchasableUpgrade"
    Type="OBJECT"
    BuildTime="15.0s"
    BuildCost="1500"
    IconImage="Button_UpgradeMortar"
    Options="OBJECT_UPGRADE_PROJECTED">
    <GameDependency>
        <RequiredObject>AlliedRefinery</RequiredObject>
    </GameDependency>
</UpgradeTemplate>
```

| 字段 | 说明 |
|------|------|
| Type | OBJECT=作用于建筑；PLAYER=作用于整个玩家 |
| GameDependency | 前置建筑等依赖 |
| Options | 如 OBJECT_UPGRADE_PROJECTED |

需在 Mod.xml 注册，并在建筑 Upgrade 模块中引用。

## 玩家科技 / 秘密协议

需同时修改：

- `playertechs.xml` — 协议逻辑层级与前置依赖
- `PlayerTechStoreTemplates.xml` — 协议界面排列（`<Row>` 等）

## 自然语言

- 「加盟军 T2 科技」→ 查 Upgrades.xml 中 Upgrade_AlliedTech2 类条目
- 「秘密协议」→ playertechs + PlayerTechStoreTemplates

## 延伸阅读

- [player-tech-secret-protocol-wiring.md](player-tech-secret-protocol-wiring.md) — 协议从 UI 按钮到 SpecialPower、OCL 的完整接线  
