# RA3 单位 ID 中文对照与蓝本选择

> **完整原版对照**：[vanilla-ra3-biligame-wiki.md](vanilla-ra3-biligame-wiki.md)、[vanilla-ra3-unit-id-master.md](vanilla-ra3-unit-id-master.md)（SDK CSF `NAME:`）。  
> 百科技巧：[biligame-wiki-index.md](biligame-wiki-index.md)（[红警3 B站百科](https://wiki.biligame.com/redalert3/%E9%A6%96%E9%A1%B5)）。

## 盟军

| 中文 | unitId | 类型 |
|------|--------|------|
| 警犬 | AlliedScoutInfantry | 步兵 |
| 维和步兵 | AlliedAntiInfantryInfantry | 步兵 |
| 标枪兵 | AlliedAntiVehicleInfantry | 步兵 |
| 激流 ACV | AlliedAntiInfantryVehicle | 车辆 |
| 多功能步兵战斗车 | **AlliedAntiAirVehicleTech1** | 车辆 |
| 守护者坦克 | AlliedAntiVehicleVehicleTech1 | 车辆 |

## 苏联

| 中文 | unitId | 类型 |
|------|--------|------|
| 战熊 | SovietScoutInfantry | 步兵 |
| 征召兵/动员兵 | SovietAntiInfantryInfantry | 步兵 |
| 恐怖机械人 | SovietScoutVehicle | 车辆 |
| 铁锤坦克 | SovietAntiVehicleVehicleTech1 | 车辆 |
| 磁暴坦克 | SovietAntiVehicleVehicleTech2 | 车辆 |
| 天启坦克 | SovietAntiVehicleVehicleTech3 | 车辆 |
| 娜塔莎 | SovietCommandoTech1 | 步兵 |

## 旭日帝国

| 中文 | unitId | 类型 |
|------|--------|------|
| 帝国武士 | **JapanAntiInfantryInfantry** | 步兵 |
| 天狗 | JapanAntiInfantryVehicle | 车辆（变形） |
| 打击者-VX | JapanAntiAirVehicleTech1 | 车辆（变形） |
| 海啸坦克 | JapanAntiVehicleVehicleTech1 | 车辆 |

## Side 属性值（GameObject）

- 盟军 → `Allies`（不是 Allied）
- 苏联 → `Soviet`
- 帝国 → `Japan`

## 新建单位流程（Agent）

1. `findUnitsByName` 或查本表确定 `templateUnit`
2. `createUnit` / 流水线：复制蓝本 → 新文件 `data/{阵营}/Units/{unitId}.xml`
3. `registerUnitInMod` 注册 Mod.xml
4. 提示用户：LogicCommand、LogicCommandSet、兵营/重工队列、可选 SkirmishAI

## 示例

**超级维和步兵**：

- unitId: `SuperAlliedAntiInfantry`
- templateUnit: `AlliedAntiInfantryInfantry`
- Side: Allies

**自定义坦克 MyTank**：

- unitId: `MyTank`
- templateUnit: `AlliedAntiVehicleVehicleTech1`
- 路径: `data/Allied/Units/MyTank.xml`
