# 红警3 MOD 开发全流程（五阶段）

## 核心原则

- 所有单位由 `<GameObject>` 包裹的 XML 定义，根节点为 `<AssetDeclaration>`.
- **一单位一 XML 文件**，文件名与 `id` 一致（如 `MyTank.xml` → `id="MyTank"`）.
- 从 `SageXml\{阵营}\Units` 复制蓝本到 MOD 的 `data` 目录，取消只读后修改.

## 五阶段总览

| 阶段 | 内容 | 涉及文件 |
|------|------|----------|
| 1 | 单位属性定义 | `data/{阵营}/Units/YourUnit.xml` |
| 2 | 注册全局命令条 | `LogicCommand.xml`、`LogicCommandSet.xml` |
| 3 | Mod.xml 报备 | `data/Mod.xml` |
| 4 | 武器（可选内嵌或独立） | 单位 XML 内或 `Weapon.xml` |
| 5 | AI 遭遇战生产（可选） | `SkirmishAI/*`、`MapMetaData_Mod.xml` |

## 阶段一：复制蓝本并改 GameObject

**步兵蓝本路径**：`SageXml\{Allied|Soviet|Japan}\Units\*Infantry*.xml`  
**车辆蓝本路径**：`SageXml\{阵营}\Units\*Vehicle*.xml`  

**继承 Include**：
- 步兵：`<Include type="instance" source="DATA:BaseObjects/BaseInfantry.xml" />`
- 车辆：`<Include type="instance" source="DATA:BaseObjects/BaseVehicle.xml" />`
- 飞机：`<Include type="instance" source="DATA:BaseObjects/BaseAircraft.xml" />`

**必须修改的关键属性**：
- `id` — 全局唯一英文 ID
- `inheritFrom` — BaseInfantry / BaseVehicle / BaseAircraft
- `Side` — `Allies` | `Soviet` | `Japan`（注意盟军是 Allies 不是 Allied）
- `CommandSet` — 通常为 `{unitId}CommandSet`
- `KindOf` — 单位类型标签（见 kindof-weapon-dictionary.md）
- `WeaponCategory` — GUN / CANNON / MELEE 等

**生命值路径**：`<Body><ActiveBody id="ModuleTag_Body" MaxHealth="400" /></Body>`

**造价路径**：`<ObjectResourceInfo><BuildCost Account="=$ACCOUNT_ORE" Amount="950"/></ObjectResourceInfo>`

## 阶段二：LogicCommand 与 LogicCommandSet

从 `SageXml\GlobalData` 复制到 MOD `data`：

**LogicCommand.xml** — 生产命令：
```xml
<LogicCommand Type="UNIT_BUILD" id="Command_ConstructMyTank">
    <Object>MyTank</Object>
</LogicCommand>
```

**LogicCommandSet.xml** — 单位指令集 + 建筑队列：
```xml
<LogicCommandSet id="MyTankCommandSet">
    <Cmd>Command_Stop</Cmd>
    <Cmd>Command_MoveTo</Cmd>
    <Cmd>Command_AttackMoveTo</Cmd>
    <Cmd>Command_Attack</Cmd>
    <Cmd>Command_Guard</Cmd>
</LogicCommandSet>
```

将 `<Cmd>Command_ConstructMyTank</Cmd>` 加入对应建筑 CommandSet，例如：
- 盟军坦克 → `AlliedWarFactoryCommandSet`
- 苏联坦克 → `SovietWarFactoryCommandSet`
- 帝国坦克 → `JapanWarFactoryCommandSet`
- 步兵 → 各阵营 `*Barracks*CommandSet`

## 阶段三：Mod.xml 注册

```xml
<Mod>
    <Includes>
        <Include type="reference" source="DATA:GlobalData/LogicCommand.xml" />
        <Include type="reference" source="DATA:GlobalData/LogicCommandSet.xml" />
        <Include type="reference" source="DATA:Allied/Units/MyTank.xml" />
    </Includes>
</Mod>
```

## 阶段四：武器

- 可在单位 XML 底部内嵌 `<WeaponTemplate id="MyTankGun" ...>`
- 或在 `GlobalData/Weapon.xml` 中定义，单位用 `WeaponSlot WeaponTemplate="MyTankGun"`

## 阶段五：遭遇战 AI（可选）

在 `SkirmishAI\{阵营}BaseStates.xml` 添加：
```xml
<BuildRequest>
    <ThingTemplate>MyTank</ThingTemplate>
    <Weight>70</Weight>
    <MaxCount>5</MaxCount>
</BuildRequest>
```

并配置 `data/AdditionalMaps/MapMetaData_Mod.xml` 注册 AI 个性。

## IDE 自然语言 → 工具映射

| 用户说法 | Agent 应做 |
|----------|------------|
| 新建/创建 XX 单位 | createUnit + Mod.xml 注册 + 提示 LogicCommand |
| 列出项目所有单位 | listAllUnitsDetailed |
| 改 XX 血量/造价/速度 | findUnitsByName → setUnitProperty |
| 如何造坦克/步兵 | 检索本知识库 mod-development-workflow |
| 注册到 Mod.xml | registerUnitInMod（自动）或 writeXml |

## 推荐蓝本 ID（复制模板）

| 类型 | 盟军 | 苏联 | 帝国 |
|------|------|------|------|
| 步兵 | AlliedAntiInfantryInfantry | SovietAntiInfantryInfantry | JapanAntiInfantryInfantry |
| 主战坦克 | AlliedAntiVehicleVehicleTech1 | SovietAntiVehicleVehicleTech1 | JapanAntiVehicleVehicleTech1 |
| 重坦/天启 | — | SovietAntiVehicleVehicleTech3 | — |
