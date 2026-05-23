# OCL 动态单位、死亡触发与护卫单位（资料整合）

> 来源：`资料/RA3DIY：OCL(动态创建)和守护单位.pdf`、`资料/教程补档/红警3DIY---动态创建单位和守护单位.doc`（doc 多为图片）。  
> 基础见 [ocl-fx-effects.md](ocl-fx-effects.md)、[Disposition 枚举](gameobject-enums-appendix.md)。

## OCL 是什么

`ObjectCreationList.xml` 中的 **动态创建**：坦克杀手钻出、死亡跳恐怖机器人、娜塔莎召唤轰炸机、空降等。

## CreateObject 常用字段

| 字段 | 说明 |
|------|------|
| `Options` | `IGNORE_ALL_OBJECTS`、`CREATE_AT_TARGET`、`ISSUE_MOVE_AFTER_CREATION` 等 |
| `Disposition` | 如 `ON_GROUND_ALIGNED` |
| `StartingBusyTime` / `DisabledWhileBusy` | 出现后多久可动 |
| `Count` | 数量 |
| `TempModel` | 出现动作（钻出洞等）持续时间 |
| `Offset` x/y/z | 生成偏移 |
| `<CreateObject>UnitId</CreateObject>` | 创建的单位 id |

### 坦克杀手埋伏示例

`OCL_Japan_Abmbush`：`CREATE_AT_TARGET` + `StartingBusyTime="10s"` + `JapanAntiVehicleInfantry`。

## 抛物线召唤（轰炸机）

```xml
<ObjectCreationList id="OCL_SovietBombingRun">
  <ParabolicCurve
    CreateObject="Soviet_BombingRun"
    Options="TRACK_TARGET_OBJECT"
    InitialDelay="3.5s"
    ApproachTime="1.5s"
    StartDistanceFromTarget="500.0"
    EndDistanceFromTarget="750.0"
    CruiseHeight="500.0"
    AttackHeight="150.0"/>
</ObjectCreationList>
```

## WeaponOCLNugget（开枪生成单位）

`TerrorDroneEggsPlayerPowerWeapon`：

```xml
<WeaponTemplate id="TerrorDroneEggsPlayerPowerWeapon">
  <Nuggets>
    <WeaponOCLNugget>
      <WeaponOCL>…</WeaponOCL>
      <RequiredUpgrade>Upgrade_SovietTerrorDroneEggs</RequiredUpgrade>
    </WeaponOCLNugget>
  </Nuggets>
</WeaponTemplate>
```

- 可把维和步兵武器的 `<Nuggets>` 换成此结构（去掉 `RequiredUpgrade` 即无需协议）  
- 生成位置在 **开火者** 处，非弹着点；可与其他 Nugget 并列恢复攻击力  

## FireWeaponWhenDead（死亡触发）

```xml
<FireWeaponWhenDead
  id="ModuleTag_TerrorDroneEggsSpawn"
  InitiallyActive="true"
  DeathWeapon="TerrorDroneEggsPlayerPowerWeapon">
  <DieMuxData DeathTypes="ALL" DeathTypesForbidden="KNOCKBACK"/>
  <WeaponFireProbability DeathType="ALL" ChancePercentage="20" />
</FireWeaponWhenDead>
```

通过 `xi:include` 引入 `SovietTerrorDroneSpawnUpgradePlayerPower.xml`。可做自爆、死亡召唤等。

## 护卫单位（SpawnBehavior + SlavedUpdate）

与维修机类似，但 `SpawnTemplate` 换为攻击单位（如双刃）：

```xml
<SpawnBehavior
  id="ModuleTag_SpawnRepairDrones"
  SpawnNumberData="3"
  InitialBurst="3"
  SpawnReplaceDelayData="10s"
  SpawnedRequireSpawner="true"
  KillSpawnsOnSpawnerDeath="true"
  SpawnInsideBuilding="true">
  <Die DeathTypes="ALL" />
  <SpawnTemplate>SovietAntiGroundAircraft</SpawnTemplate>
</SpawnBehavior>
```

护卫需从 `SovietRepairDrone.xml` 复制 **SlavedUpdate** 到护卫单位 XML：

| 字段 | 说明 |
|------|------|
| `LeashRange` | 束缚/护卫最大距离 |
| `GuardWanderRange` | 闲置环绕半径 |
| `AttackRange` | 护卫攻击距离 |

护卫单位 KindOf 建议含：`PASS_EXPERIENCE_TO_PRODUCER`、`NO_COLLIDE`、`SKIP_IDLE_WHEN_CAPTURED` 等，并参考舰载机 **不可单独选中** 的写法。

## Agent 提示

- 「死亡出小单位」→ FireWeaponWhenDead + WeaponOCLNugget + OCL  
- 「身边跟几架飞机」→ SpawnBehavior + SlavedUpdate + 改 SpawnTemplate  
