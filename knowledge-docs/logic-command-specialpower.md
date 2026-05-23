# LogicCommand、命令集与 SpecialPower（进阶）

## 一、生产命令 LogicCommand.xml

```xml
<LogicCommand
    Type="UNIT_BUILD"
    id="Command_ConstructMyTank">
    <Object>MyTank</Object>
</LogicCommand>
```

- `id`：命令唯一 ID，通常为 `Command_Construct{UnitId}`
- `Object`：目标单位 GameObject 的 id

## 二、命令集 LogicCommandSet.xml

**单位自身 UI**：
```xml
<LogicCommandSet id="MyTankCommandSet">
    <Cmd>Command_Stop</Cmd>
    <Cmd>Command_MoveTo</Cmd>
    <Cmd>Command_AttackMoveTo</Cmd>
    <Cmd>Command_Attack</Cmd>
    <Cmd>Command_Guard</Cmd>
</LogicCommandSet>
```

**加入建筑生产队列**（否则无法建造）：
在 `AlliedWarFactoryCommandSet` / `SovietWarFactoryCommandSet` / `JapanWarFactoryCommandSet` 或兵营对应 CommandSet 中添加：
```xml
<Cmd>Command_ConstructMyTank</Cmd>
```

GameObject 的 `CommandSet="MyTankCommandSet"` 必须与上表 id 一致。

## 三、SpecialPower（特殊能力）

定义在 `SpecialPowerTemplates.xml`：

| 属性 | 说明 |
|------|------|
| id | 能力唯一 ID |
| TargetType | LOCATION_AND_ANGLE / OBJECT 等 |
| PreventConditions | 不可用状态，如 IS_BEING_DRAGGED |
| Flags | WATER_OK、NEEDS_OBJECT_FILTER 等 |
| ObjectFilter | 与 OBJECT 目标配合，Include/Exclude |

**单位连接**：
```xml
<SpecialPowerHolder id="ModuleTag_SpecialPowerHolder">
    <SpecialPowerTemplate id="SpecialPower_TargetPainter" />
</SpecialPowerHolder>
```

## 文件注册

LogicCommand.xml、LogicCommandSet.xml、SpecialPowerTemplates.xml 均需在 Mod.xml `<Includes>` 中 reference。
