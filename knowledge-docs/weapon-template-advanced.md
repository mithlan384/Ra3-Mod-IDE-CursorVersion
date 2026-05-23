# WeaponTemplate 武器系统详解（进阶）

武器由 `<WeaponTemplate>` 定义，可写在单位 XML 内或 `GlobalData/Weapon.xml`。

## 完整模板

```xml
<WeaponTemplate
    id="ExampleWeapon"
    AttackRange="200.0"
    WeaponSpeed="2.0"
    RadiusDamageAffects="ALLIES ENEMIES NEUTRALS"
    FireSound="Example_WeaponFire"
    FireFX="FX_ExampleWeaponHit"
    AcceptableAimDelta="10"
    ClipSize="1"
    AutoReloadsClip="AUTO"
    Flags="ATTACK_NEEDS_LINE_OF_SIGHT"
    CanFireWhileMoving="TRUE"
    RequiredAntiMask="ANTI_WATER ANTI_GROUND ANTI_STRUCTURE">
    <FiringDuration MinDelay="1000" MaxDelay="1200" />
    <ClipReloadTime Min="1000" Max="1200" />
    <Nuggets>
        <DamageNugget
            Damage="50"
            DamageType="CANNON"
            DeathType="NORMAL"
            Radius="15.0" />
    </Nuggets>
</WeaponTemplate>
```

## 核心属性

| 属性 | 说明 |
|------|------|
| AttackRange | 攻击范围 |
| WeaponSpeed | 弹丸飞行速度 |
| FireSound / FireFX | 音效与特效（FX 引用 FXList） |
| AcceptableAimDelta | 炮塔最大瞄准偏差 |
| ClipSize / AutoReloadsClip | 弹药；AUTO=无限制，RETURN_TO_BASE=回基地装填 |
| Flags | 如 ATTACK_NEEDS_LINE_OF_SIGHT |
| CanFireWhileMoving | 能否移动射击 |
| RequiredAntiMask | 可攻击目标类型过滤器 |

## DamageNugget

| 字段 | 说明 |
|------|------|
| Damage | 基础伤害 |
| DamageType | CANNON / MELEE / EXPLOSIVE / FLAME 等，与 Armor 配合算最终伤害 |
| DeathType | NORMAL / EXPLODE / BURNED 等死亡动画 |
| Radius | 溅射半径 |

## RequiredAntiMask 常用值

ANTI_GROUND、ANTI_WATER、ANTI_AIRBORNE_VEHICLE、ANTI_STRUCTURE 等，空格组合。

## 挂载到单位

```xml
<WeaponSetUpdate id="ModuleTag_WeaponSetUpdate">
    <WeaponSlot ID="0" WeaponTemplate="ExampleWeapon" />
    <WeaponSlot ID="1" WeaponTemplate="副武器ID" />
</WeaponSetUpdate>
```

新武器必须在 Mod.xml 注册所在文件，且 id 全局唯一。
