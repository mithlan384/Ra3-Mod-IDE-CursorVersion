# GameObject 核心属性参考（进阶）

单位由 `<GameObject>` 定义，所有基本特性在此声明。遵循 SDK 官方结构与社区命名约定。

## 完整属性模板

```xml
<GameObject
    id="UnitName"
    inheritFrom="BaseInfantry"
    Side="Allies"
    SubGroupPriority="200"
    EditorSorting="UNIT"
    HealthBoxHeightOffset="20"
    BuildTime="5"
    CommandSet="UnitCommandSet"
    KindOf="SELECTABLE CAN_ATTACK CAN_CAST_REFLECTIONS SCORE INFANTRY CAN_BE_FAVORITE_UNIT"
    WeaponCategory="GUN"
    VoicePriority="100"
    EditorName="UnitName"
    Description="Desc:UnitName"
    TypeDescription="Type:UnitName"
    UnitIntro="Allied_Peacekeeper_UnitIntro">
    ...
</GameObject>
```

## 属性详解

| 属性 | 说明 |
|------|------|
| **id** | 全 MOD 唯一标识符，与文件名一致 |
| **inheritFrom** | BaseInfantry / BaseVehicle / BaseAircraft 等，决定单位类型基础 |
| **Side** | Allies / Soviet / Japan / Neutral（盟军写 Allies） |
| **SubGroupPriority** | 同建筑生产栏排序，**数字越小越靠前** |
| **EditorSorting** | 地图编辑器分类，一般单位填 UNIT |
| **HealthBoxHeightOffset** | 血条高度微调，正值越高 |
| **BuildTime** | 建筑菜单内可见生产时间（**秒**） |
| **CommandSet** | 绑定 LogicCommandSet.xml 中的 id，**能否被生产的关键桥梁** |
| **KindOf** | 单位「本能」属性集，见 [kindof-advanced.md](kindof-advanced.md) |
| **WeaponCategory** | GUN / CANNON / MELEE 等，影响 AI 战术判定 |
| **VoicePriority** | 多选时语音优先级，数值高者优先发声 |
| **EditorName** | 地图编辑器显示名 |
| **Description** | 悬停描述文本引用 ID（Desc: 前缀） |
| **TypeDescription** | 右下角类型文本引用 ID（Type: 前缀） |
| **UnitIntro** | 出场/选中语音事件 ID |

## 造价（常与 GameObject 同级子节点）

```xml
<ObjectResourceInfo>
    <BuildCost Account="=$ACCOUNT_ORE" Amount="200"/>
</ObjectResourceInfo>
```

## Agent 自然语言映射

| 用户说法 | 修改目标 |
|----------|----------|
| 改生产时间 / 建造时间 | `BuildTime` |
| 改造价 / 价格 | `ObjectResourceInfo` → `BuildCost Amount` |
| 改阵营 | `Side` |
| 改命令集 | `CommandSet`（需同步 LogicCommandSet.xml） |
| 改血条高度 | `HealthBoxHeightOffset` |
