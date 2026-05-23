# 单位经验等级与维修无人机（资料整合）

> 来源：`资料/RA3DIY：代码进阶篇.pdf` 第 7–8 节。

## 维修工蜂 / 无人机

在单位 `<Behaviors>` 中加入（示例结构，具体 SpecialPower 以原版为准）：

```xml
<AssignSlavesTargetObjectSpecialPower
  id="ModuleTag_SpecialPowerRepairVehicle"
  SpecialPowerTemplate="SpecialPower_TargetedRepairVehicle" />
<SpawnBehavior
  id="ModuleTag_SpawnRepairDrones"
  SpawnNumberData="3"
  InitialBurst="1"
  ...>
  <SpawnTemplate>SovietRepairDrone</SpawnTemplate>
</SpawnBehavior>
```

- `SpawnNumberData`：维修机总数  
- `InitialBurst`：单位建造完成时立即生成数量  

参考原版带维修的建筑/载具 XML。护卫单位变种见 [ocl-dynamic-units-and-escorts.md](ocl-dynamic-units-and-escorts.md)。

## 经验等级 ExperienceLevels.xml

路径：`GlobalData/ExperienceLevels.xml`（复制到 MOD 后修改）。

新单位需添加 **4 级**模板（1 级默认 + 3 次晋升），示例：

```xml
<ExperienceLevelTemplate
  id="AlliedAntiNavalScoutExperienceLevel_1"
  inheritFrom="ExperienceLevel_AlliedRank1"
  RequiredExperience="1"
  ExperienceAward="750">
  <Target>AlliedAntiNavalScout</Target>
</ExperienceLevelTemplate>
<!-- Level 2–4：Prerequisite 链式引用上一级 -->
```

| 字段 | 含义 |
|------|------|
| `RequiredExperience` | 升到该级所需累计经验 |
| `ExperienceAward` | **击杀**该等级单位时给予击杀者的经验 |
| `Prerequisite` | 上一等级模板 id |
| `<Target>` | 绑定的单位 id |

经验设计经验法则（教程建议）：

- 升级所需经验 ≈ **造价 × 3**  
- `ExperienceAward` ≈ **造价**（勿过于夸张）

## Agent 提示

- 「三级兵经验太慢」→ 改对应 `ExperienceLevelTemplate` 的 RequiredExperience  
- 「给坦克配维修机」→ SpawnBehavior + 原版 RepairDrone 模板  
