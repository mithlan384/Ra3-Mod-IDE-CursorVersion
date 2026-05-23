# RA3 建筑配置指南

## 建筑基础属性

- Health > MaxHealth — 建筑生命值
- Cost — 造价
- BuildTime — 建造时间
- TechLevel — 科技等级（1~10）

## 建筑功能模块

- Production — 生产功能
  - Produces — 可生产单位列表
- Power — 电力
  - PowerBonus — 提供/消耗电力
- ArmorSet — 建筑护甲
- SupplyCenter — 资源收集中心
- Defense — 防御功能

## 建造前置要求

**XML 路径：** Prerequisites

**示例：**
```xml
<Prerequisites>
  <Prerequisite>建筑ID</Prerequisite>
</Prerequisites>
```

## 建筑升级

**XML 路径：** Upgrade

**示例：**
```xml
<Upgrade>
  <TargetUpgrade>升级名</TargetUpgrade>
</Upgrade>
```
