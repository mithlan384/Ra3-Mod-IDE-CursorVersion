# 红警3 原版单位与百科参考（B站 WIKI + SDK 对照）

> **游戏原版数据**（非当前 MOD 项目里的自定义 XML）。  
> 百科：[红警3 WIKI 首页](https://wiki.biligame.com/redalert3/%E9%A6%96%E9%A1%B5) · [盟军单位](https://wiki.biligame.com/redalert3/%E7%9B%9F%E5%86%9B%E5%8D%95%E4%BD%8D) · [苏联单位](https://wiki.biligame.com/redalert3/%E8%8B%8F%E8%81%94%E5%8D%95%E4%BD%8D) · [帝国单位](https://wiki.biligame.com/redalert3/%E5%B8%9D%E5%9B%BD%E5%8D%95%E4%BD%8D)  
> **unitId 以 SDK / CSF `NAME:` 为准**（见 [vanilla-ra3-unit-id-master.md](vanilla-ra3-unit-id-master.md)）；百科中文名、数值、技巧见 [biligame-wiki-index.md](biligame-wiki-index.md) 下各页。

## Agent 必读：权威顺序

1. **SageXml `GameObject id`**（本表、`vanilla-ra3-unit-id-master.md`）
2. **百科**（血量、DPS、战术；**不写 unitId** 时需查上表）
3. **当前 MOD 项目**（`findUnitsByName` / `scanProject` 才有「项目内单位」）

| 概念 | 说明 |
|------|------|
| 原版单位 | `DATA:SageXml/{阵营}/Units/{unitId}.xml`，未写入 MOD `data/` 时由 SDK 原版加载 |
| MOD 单位 | 仅当项目 XML 里存在同 `id` 的 GameObject |
| 改数值 | `inheritFrom` + `xai:joinAction="Replace"` 继承原版 |
| 换模型/双管 | 需 W3X/动画/贴图；**不能**靠多加 WeaponSlot 变外观 |

## 易错对照（旧文档/口语 → 正确 unitId）

| 口语/错误 | 正确中文 | **unitId** |
|-----------|----------|------------|
| 狗、苏联军犬 | **战熊** | **SovietScoutInfantry** |
| 警犬、盟军狗 | 警犬 | AlliedScoutInfantry |
| 多功能 IFV、步兵车 | 多功能步兵战斗车 | **AlliedAntiAirVehicleTech1**（不是 AlliedAntiInfantryVehicleTech1） |
| 激流、ACV | 激流 ACV | AlliedAntiInfantryVehicle |
| 守护者、盟军坦克 | 守护者坦克 | **AlliedAntiVehicleVehicleTech1** |
| 标枪 | 标枪兵 | AlliedAntiVehicleInfantry |
| 恐怖机器人、恐怖步兵 | 恐怖机械人 | **SovietScoutVehicle**（不是 SovietAntiVehicleInfantryTech1） |
| 磁能坦克 | 磁暴坦克 | SovietAntiVehicleVehicleTech2 |
| V4、火箭车 | V4 导弹发射车 | SovietAntiStructureVehicle |
| 鲍里斯 | **娜塔莎** | SovietCommandoTech1 |
| 牛蛙 | 牛蛙载具 | SovietAntiAirShip |
| 镰刀 | 镰刀机甲 | SovietAntiInfantryVehicle |
| 帝国武士 | 帝国武士 | **JapanAntiInfantryInfantry**（不是 JapanInfantryAntiInfantryInfantry） |
| 天狗、机甲天狗 | 天狗 | **JapanAntiInfantryVehicle**（陆地/喷气变形） |
| 打击者、VX | 打击者-VX | JapanAntiAirVehicleTech1 |
| 海豚 | 海豚 | AlliedAntiNavalScout |

## 守护者坦克（双管改造）

| 项 | 原版值 |
|----|--------|
| unitId | **AlliedAntiVehicleVehicleTech1** |
| Side | Allies |
| Model | AVTank_Grdn |
| 炮塔 | **单管**；双管 = 新模型或新单位 |
| 蓝本 | `DATA:SageXml/Allied/Units/AlliedAntiVehicleVehicleTech1.xml` |

## 战熊（百科示例）

| 项 | 值 |
|----|-----|
| unitId | **SovietScoutInfantry** |
| 百科 | [战熊](https://wiki.biligame.com/redalert3/%E6%88%98%E7%86%8A) · 本地 [biligame-wiki/战熊.md](biligame-wiki/战熊.md) |
| 造价/血量 | 225 / 150（百科 1.12） |
| 技能 | 增幅怒吼（反步兵眩晕）、反隐 |

## 盟军 — 步兵

| 中文 | unitId |
|------|--------|
| 警犬 | AlliedScoutInfantry |
| 维和步兵 | AlliedAntiInfantryInfantry |
| 标枪兵 | AlliedAntiVehicleInfantry |
| 工兵 | AlliedEngineer |
| 间谍 | AlliedInfiltrationInfantry |
| 冰冻兵团 | AlliedLegionnaireInfantry |
| 谭雅 | AlliedCommandoTech1 |

## 盟军 — 车辆 / 海军 / 飞机

| 中文 | unitId |
|------|--------|
| 探矿车 | AlliedMiner |
| 激流 ACV | AlliedAntiInfantryVehicle |
| 多功能步兵战斗车 | AlliedAntiAirVehicleTech1 |
| 守护者坦克 | AlliedAntiVehicleVehicleTech1 |
| 雅典娜炮 | AlliedAntiStructureVehicle |
| 幻影坦克 | AlliedAntiVehicleVehicleTech3 |
| 平定者 | AlliedArtilleryVehicle |
| 未来坦克 X-1 | AlliedFutureTank |
| 盟军 MCV | AlliedMCV |
| 海豚 | AlliedAntiNavalScout |
| 水翼船 | AlliedAntiAirShip |
| 突袭驱逐舰 | AlliedAntiNavyShipTech1（CSF 写作 AntiNavy） |
| 航空母舰 | AlliedAntiStructureShip |
| 维和轰炸机 | AlliedAntiGroundAircraft |
| 阿波罗战斗机 | AlliedFighterAircraft |
| 冰冻直升机 | AlliedSupportAircraft |
| 世纪轰炸机 | AlliedBomberAircraft |
| 先锋武装战艇机 | AlliedGunshipAircraft |

## 苏联 — 步兵

| 中文 | unitId |
|------|--------|
| 战熊 | SovietScoutInfantry |
| 征召兵 / 动员兵 | SovietAntiInfantryInfantry |
| 防空部队 | SovietAntiVehicleInfantry |
| 战斗工兵 | SovietEngineer |
| 磁暴部队 | SovietHeavyAntiVehicleInfantry |
| 化学部队 | SovietDesolatorInfantry |
| 娜塔莎 | SovietCommandoTech1 |
| 巨熊（特殊） | SovietLargeScoutInfantry |

## 苏联 — 车辆 / 海军 / 飞机

| 中文 | unitId |
|------|--------|
| 采矿车 | SovietMiner |
| 史普尼克勘查车 | SovietSurveyor |
| 恐怖机械人 | SovietScoutVehicle |
| 镰刀机甲 | SovietAntiInfantryVehicle |
| 牛蛙载具 | SovietAntiAirShip |
| 铁锤坦克 | SovietAntiVehicleVehicleTech1 |
| 磁暴坦克 | SovietAntiVehicleVehicleTech2 |
| 天启坦克 | SovietAntiVehicleVehicleTech3 |
| V4 导弹发射车 | SovietAntiStructureVehicle |
| 收割机甲 | SovietHeavyWalkerVehicle |
| 粉碎者 | SovietGrinderVehicle |
| 苏联 MCV | SovietMCV |
| 磁暴快艇 | SovietAntiNavyShipTech1 |
| 阿库拉潜艇 | SovietAntiNavyShipTech2 |
| 无畏战舰 | SovietAntiStructureShip |
| 双刃直升机 | SovietAntiGroundAircraft |
| 米格战斗机 | SovietFighterAircraft |
| 基洛夫飞艇 | SovietBomberAircraft |

## 旭日帝国 — 步兵

| 中文 | unitId |
|------|--------|
| 爆裂机械人 | JapanScoutInfantry |
| 帝国武士 | JapanAntiInfantryInfantry |
| 坦克杀手 | JapanAntiVehicleInfantry |
| 工兵 | JapanEngineer |
| 弓箭少女 | JapanArcherInfantry |
| 忍者 | JapanInfiltrationInfantry |
| 火箭天使 | JapanAntiVehicleInfantryTech3 |
| 百合子 | JapanCommandoTech1 |

## 旭日帝国 — 车辆 / 海军

| 中文 | unitId |
|------|--------|
| 采矿车 | JapanMiner |
| 迅雷运输艇 | JapanLightTransportVehicle |
| 天狗 | JapanAntiInfantryVehicle |
| 海啸坦克 | JapanAntiVehicleVehicleTech1 |
| 打击者-VX / 直升机-VX | JapanAntiAirVehicleTech1 |
| 钢铁浪人 | JapanSentinelVehicle |
| 波能坦克 | JapanAntiStructureVehicle |
| 鬼王 | JapanAntiVehicleVehicleTech3 |
| 帝国 MCV | JapanMCV |
| 长枪迷你潜艇 | JapanNavyScoutShip |
| 海翼/天翼 | JapanAntiAirShip |
| 薙刀巡洋舰 | JapanAntiVehicleShip |
| 将军战舰 | JapanAntiStructureShip |
| 超级要塞 | JapanFortressShip |

## 常见建筑 id

| 中文 | id |
|------|-----|
| 盟军重工 | AlliedWarFactory |
| 苏联重工 | SovietWarFactory |
| 帝国重工 | JapanWarFactory |
| 盟军兵营 | AlliedBarracks |
| 苏联兵营 | SovietBarracks |
| 帝国兵营 | JapanBarracks |

**Side 属性**：盟军 `Allies`、苏联 `Soviet`、帝国 `Japan`（不是 Allied）。

## 百科「游戏知识」栏目（机制）

抓取索引见 [biligame-wiki-index.md](biligame-wiki-index.md)；可手动运行 `node scripts/ingest-biligame-wiki.js` 更新（遇 HTTP 567 时需隔段时间重试）。

| 主题 | 百科链接 |
|------|----------|
| 武器系统 | https://wiki.biligame.com/redalert3/%E6%AD%A6%E5%99%A8%E7%B3%BB%E7%BB%9F |
| 护甲系统 | https://wiki.biligame.com/redalert3/%E6%8A%A4%E7%94%B2%E7%B3%BB%E7%BB%9F |
| 单位应变状态 | https://wiki.biligame.com/redalert3/%E5%8D%95%E4%BD%8D%E5%BA%94%E5%8F%98%E7%8A%B6%E6%80%81 |
| 经验机制 | https://wiki.biligame.com/redalert3/%E7%BB%8F%E9%AA%8C%E6%9C%BA%E5%88%B6 |
| 维修机制 | https://wiki.biligame.com/redalert3/%E7%BB%B4%E4%BF%AE%E6%9C%BA%E5%88%B6 |
| 最高机密协议 | https://wiki.biligame.com/redalert3/%E6%9C%80%E9%AB%98%E6%9C%BA%E5%AF%86%E5%8D%8F%E8%AE%AE |

## MOD 流程（外观级改动）

1. `findUnitsByName` + `scanProject` → 项目是否已有目标单位。  
2. 若无 → 新建并继承上表 unitId 的 `DATA:SageXml/...` instance。  
3. 双管/换模型 → 列出 W3X/动画/贴图/图标，**等用户确认**后再 `createUnit`。  
4. 禁止：原版单管模型 + 双 WeaponSlot 即声称「双管完成」。  

## IDE 内相关文档

- [unit-id-reference.md](unit-id-reference.md) — Agent 速查  
- [faction-unit-blueprints.md](faction-unit-blueprints.md) — 蓝本与 CommandSet  
- [mod-development-workflow.md](mod-development-workflow.md) — 五阶段 MOD 流程  
