# GameObject 枚举与常量附录（资料整合）

> 来源：`资料/教程补档/红警3 MOD制作教程：红警3源代码详解.docx`（yangqs）、`资料/RA3DIY：XML源码详解.pdf`。  
> 与 [gameobject-core-reference.md](gameobject-core-reference.md)、[kindof-advanced.md](kindof-advanced.md) **去重**：本文仅列 **枚举表**，不重复 KindOf 全文。

## EditorSorting

| 值 | 含义 |
|----|------|
| SYSTEM | 系统（铁幕光效、召唤轰炸机等） |
| MISC_MAN_MADE | 中立人群 |
| UNIT | 载具/一般单位 |
| STRUCTURE | 建筑 |
| CAMPAIGN_UNITS | 任务单位 |
| OBSOLETE | 过时 |
| MISC_NATURAL | 中立自然物 |
| OPTIMIZED_PROPS | 地面等不可破坏物 |
| DESTRUCTIBLE_PROPS | 可破坏道具（桥等） |
| AUDIO | 环境音（AudioAmbients） |

## ProductionQueueType（由谁建造）

| 值 | 建造厂 |
|----|--------|
| MAIN_STRUCTURE | 主建筑 |
| OTHER_STRUCTURE | 防御建筑 |
| WATERCRAFT | 船坞 |
| AIRCRAFT | 机场 |
| VEHICLE | 战车工厂 |
| INFANTRY | 兵营 |

## UnitCategory

| 值 | 种类 |
|----|------|
| VEHICLE | 载具 |
| AIRCRAFT | 飞机 |
| INFANTRY | 步兵/生物 |
| STRUCTURE | 建筑 |

## SkirmishAIInformation 选址

`BaseBuildingLocation`：`BACK` `FRONT` `DEFENSE` `CENTER` `SPREAD` `NEAR_RESOURCE_NODE`  
`NearResourceNodeType`：常为 `ORE`  
`PreferredBaseTypes` / `PreferredNotBaseTypes`：`MAIN_BASE` `ENEMIES_IN_BASE` `UNDER_ATTACK` `CAPTURED` `NO_BUILD_RADIUS`

## WeaponCategory（粗分类）

仅三种：`GUN`、`CANNON`、`MISSILE`（细武器在 WeaponTemplate）。

## Locomotor Surfaces / Appearance / BehaviorZ

**Surfaces**（可多选）：`GROUND` `WATER` `DEEP_WATER` `CLIFF` `AIR` `CRUSHABLE_OBSTACLE` `CRUSHABLE_WALL`  
**Appearance**：`HOVER` `TWO_LEGS` `SHIP` `TREADS` `WINGS` `FOUR_WHEELS`  
**BehaviorZ**：`FLOATING_Z` `NO_MOTIVE_FORCE` `SEA_LEVEL` `SURFACE_RELATIVE_HEIGHT` `SEA_LEVEL_SMOOTH_Z`

## OCL Disposition

`DISPOSITION_NONE` `LIKE_EXISTING` `ON_GROUND_ALIGNED` `SEND_IT_FLYING` `SEND_IT_UP` `SEND_IT_OUT` `RANDOM_FORCE` `FLOATING` `INHERIT_VELOCITY` `FORWARD_IMPACT` `REVERSE_IMPACT` `BUILDING_CHUNKS` `ANIMATED` `ABSOLUTE_ANGLE` `SPAWN_AROUND` `RELATIVE_ANGLE` `USE_WATER_SURFACE` `USE_CLIFF` `CLAMP_TO_GROUND` `FALL_TO_GROUND` `USE_DYNAMICS_FOR_FLING`

## AudioType（AudioArrayVoice / Sound）

`voiceAttack` `voiceCreated` `voiceMove` `voiceAttackAfterMoving` `voiceRetreatToCastle` `voiceSelect` `voiceSelectBattle` `voiceSelectUnderFire` `voiceAttackUnit`  
`soundMoveStart` `soundCrushing` `soundMoveLoop` `soundTurretMoveLoop` `soundAmbient`

## Geometry ContactPointGeneration

`STRUCTURE` `VEHICLE` `SQUAD_MEMBER`（英雄） `INFANTRY`

## 与现有文档关系

- **KindOf 完整列表** → [kindof-advanced.md](kindof-advanced.md)  
- **装甲/武器/运动详解** → [armor-locomotor-behaviors.md](armor-locomotor-behaviors.md)、[weapon-template-advanced.md](weapon-template-advanced.md)  
- **起义时刻 CSF 名称表**（NAME: 盟军单位等）体量极大，请用 IDE 工具 `findUnitsByName` / 查 SDK CSF，不重复收录  
