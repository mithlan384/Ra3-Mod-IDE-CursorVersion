# RA3 武器配置指南

## 单位内挂载武器（GameObject）

```xml
<Behaviors>
  <WeaponSetUpdate id="ModuleTag_WeaponSetUpdate">
    <WeaponSlot ID="0" WeaponTemplate="MyTankGun" />
  </WeaponSetUpdate>
</Behaviors>
```

载具炮塔需加 `<FiringAttribute>`（见 gameobject-template-mytank.md）。

## WeaponTemplate（单位文件内或 GlobalData/Weapon.xml）

```xml
<WeaponTemplate
    id="MyTankGun"
    AttackRange="200.0"
    WeaponSpeed="2.0"
    FireSound="Allied_GuardianTank_Fire"
    FireFX="FX_GuardianTank">
    <FiringDuration MinDelay="1000" MaxDelay="1200" />
    <Nuggets>
        <DamageNugget Damage="60" DamageType="CANNON" DeathType="NORMAL" />
    </Nuggets>
</WeaponTemplate>
```

## 常用调整

| 需求 | 修改位置 |
|------|----------|
| 伤害 | DamageNugget `Damage` |
| 射程 | WeaponTemplate `AttackRange` |
| 射速 | FiringDuration MinDelay/MaxDelay（越小越快） |
| 溅射 | DamageNugget `Radius` |
| 攻击目标类型 | RequiredAntiMask（ANTI_GROUND 等） |

详见 [kindof-weapon-dictionary.md](kindof-weapon-dictionary.md)。
