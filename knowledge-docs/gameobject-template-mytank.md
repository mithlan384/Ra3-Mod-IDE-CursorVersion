# GameObject 完整结构模板（盟军坦克 MyTank 范例）

## 文件位置

`data/Allied/Units/MyTank.xml`（从 `SageXml\Allied\Units\AlliedAntiVehicleVehicleTech1.xml` 守护者坦克复制）

## 完整 XML 骨架

```xml
<?xml version="1.0" encoding="utf-8"?>
<AssetDeclaration xmlns="uri:ea.com:eala:asset">
    <Include type="instance" source="DATA:BaseObjects/BaseVehicle.xml" />

    <GameObject
        id="MyTank"
        inheritFrom="BaseVehicle"
        SelectPortrait="Portrait_MyTank"
        ButtonImage="Button_MyTank_on"
        Side="Allies"
        SubGroupPriority="430"
        EditorSorting="UNIT"
        HealthBoxHeightOffset="25"
        BuildTime="10"
        CommandSet="MyTankCommandSet"
        KindOf="SELECTABLE CAN_ATTACK CAN_CAST_REFLECTIONS SCORE VEHICLE CAN_BE_FAVORITE_UNIT T2_UNIT"
        WeaponCategory="CANNON"
        VoicePriority="190"
        EditorName="MyTank"
        Description="Desc:MyTank"
        TypeDescription="Type:MyTank"
        UnitIntro="Allied_GuardianTank_UnitIntro">

        <ObjectResourceInfo>
            <BuildCost Account="=$ACCOUNT_ORE" Amount="950"/>
        </ObjectResourceInfo>

        <ArmorSet
            Armor="AlliedAntiVehicleVehicleTech1Armor"
            DamageFX="VehicleDamageFX" />

        <LocomotorSet
            Locomotor="AlliedAntiVehicleVehicleTech1Locomotor"
            Speed="60" />

        <Body>
            <ActiveBody id="ModuleTag_Body" MaxHealth="400" />
        </Body>

        <Behaviors>
            <WeaponSetUpdate id="ModuleTag_WeaponSetUpdate">
                <WeaponSlot ID="0" WeaponTemplate="MyTankGun" />
            </WeaponSetUpdate>
            <Die id="ModuleTag_Die">
                <DieMuxData DeathTypes="ALL" />
            </Die>
            <PhysicsBehavior id="ModuleTag_Physics">
                <PhysicsLocomotion />
            </PhysicsBehavior>
            <FiringAttribute id="ModuleTag_FiringAttribute">
                <FiringEdge ID="0" Edge="WEAPON_A" />
            </FiringAttribute>
            <SpecialPowerHolder id="ModuleTag_SpecialPowerHolder">
                <SpecialPowerTemplate id="SpecialPower_TargetPainter" />
            </SpecialPowerHolder>
        </Behaviors>

        <Draws>
            <SkinnedDraw id="ModuleTag_Draw" Model="AVTank_Grdn" />
        </Draws>
    </GameObject>

    <WeaponTemplate
        id="MyTankGun"
        Name="MyTankGun"
        AttackRange="200.0"
        WeaponSpeed="2.0"
        RadiusDamageAffects="ALLIES ENEMIES NEUTRALS"
        FireSound="Allied_GuardianTank_Fire"
        FireFX="FX_GuardianTank">
        <FiringDuration MinDelay="1000" MaxDelay="1200" />
        <Nuggets>
            <DamageNugget Damage="60" DamageType="CANNON" DeathType="NORMAL" />
        </Nuggets>
    </WeaponTemplate>
</AssetDeclaration>
```

## 属性说明速查

| 属性 | 含义 |
|------|------|
| id | 系统内部 ID，全局唯一 |
| inheritFrom | BaseVehicle / BaseInfantry / BaseAircraft |
| Side | Allies / Soviet / Japan |
| CommandSet | 绑定 LogicCommandSet 中的 id |
| KindOf | 可选中、可攻击、载具、T2 等 |
| WeaponCategory | CANNON / GUN / MELEE，影响 AI |
| BuildTime | 生产时间（秒） |
| BuildCost Amount | 造价（矿） |
| MaxHealth | 在 Body > ActiveBody |
| WeaponTemplate | 武器 ID，须在 Weapon 或本文件定义 |
| Model | 3D 模型资源名，可暂用原版 |

## 新建单位时 IDE 应执行

1. 复制蓝本 XML 到新文件（勿写入原蓝本文件）
2. 替换 `id` 及 CommandSet 引用
3. 在 Mod.xml 添加 Include
4. 提示用户完成 LogicCommand / 兵营或重工队列
