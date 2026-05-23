# KindOf 单位行为属性详解（进阶）

KindOf 为空格分隔的预定义字符串，定义单位「本能」与核心交互逻辑。

## 基础交互类

| 标签 | 效果 |
|------|------|
| SELECTABLE | 可被鼠标选中 |
| CAN_ATTACK | 拥有攻击能力 |
| CAN_CAST_REFLECTIONS | 允许反射（水面倒影等） |
| SCORE | 被摧毁计入得分 |
| CAN_BE_FAVORITE_UNIT | 可设为集结点爱用单位 |
| IGNORE_FORCE_MOVE | 无视强制移动命令 |
| REVEAL_AS_ATTACKER | 攻击后小地图短暂暴露 |

## 移动与定位类

| 标签 | 效果 |
|------|------|
| INFANTRY | 步兵，受围墙、驻军影响 |
| VEHICLE | 载具 |
| STRUCTURE | 建筑，不可移动 |
| AIRCRAFT | 空中单位，通常需机场 |
| SHIP | 海军，可水上移动 |
| AMPHIBIOUS | 两栖 |
| SUBMERSIBLE | 可潜水 |

## AI 与科技等级类

| 标签 | 效果 |
|------|------|
| T2_UNIT / T3_UNIT | 单位层级，影响 AI 决策 |
| UNIQUE_UNIT | 唯一单位，不可同时建造多个 |
| HERO | 英雄单位 |

## 特殊机制类

| 标签 | 效果 |
|------|------|
| INERT | 惰性单位，多用于 Lua/事件，玩家无法正常选中 |

## 常用组合示例

**步兵**：
```
SELECTABLE CAN_ATTACK CAN_CAST_REFLECTIONS SCORE INFANTRY CAN_BE_FAVORITE_UNIT
```

**主战坦克**：
```
SELECTABLE CAN_ATTACK CAN_CAST_REFLECTIONS SCORE VEHICLE CAN_BE_FAVORITE_UNIT T2_UNIT
```

## 修改建议

- 把步兵改成载具：去掉 INFANTRY，加 VEHICLE，inheritFrom 改为 BaseVehicle
- 用户说「让单位能上 T2 科技」→ 在 KindOf 中加入 T2_UNIT
