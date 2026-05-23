# OCL 与 FX 特效（进阶）

## 一、OCL（ObjectCreationList）

「凭空造物」逻辑：召唤、钻地、死亡跳出单位等。

**文件**：`GlobalData/ObjectCreationList.xml`

```xml
<!-- 概念结构 -->
<CreateObject>目标单位id</CreateObject>
<!-- Options: IGNORE_ALL_OBJECTS CREATE_AT_TARGET -->
<!-- Disposition: ON_GROUND_ALIGNED -->
<!-- Count, Offset x/y/z -->
```

单位 `<Die>` 或技能可引用 OCL id 触发创建。

| 属性 | 说明 |
|------|------|
| Options | 如 IGNORE_ALL_OBJECTS、CREATE_AT_TARGET |
| Disposition | 创建位置对齐方式 |
| Count | 数量 |
| Offset | 相对释放点 x/y/z 偏移 |
| CreateObject | 要创建的单位 id |

## 二、FX（视觉特效）

**调用链**：
```
WeaponTemplate FireFX
  → FXList.xml（特效组合）
    → FXParticleSystems/（粒子定义）
```

| 层级 | 说明 |
|------|------|
| FXList | 组合多个粒子/效果 |
| FXParticleSystems | ParticleTexture、Shader、SystemLifetime 等 |

**骨骼/贴图特效**：复杂效果绑模型骨骼或贴图（如超级要塞喷气）。

## 修改注意

- FireFX 的 id 必须在 FXList 中存在
- 全链条名称一致，否则无视觉效果
- 新 OCL/FX 文件需在 Mod.xml 注册

## 自然语言

- 「死亡时跳出小单位」→ Die 模块 + OCL CreateObject
- 「开火火花」→ 改 FireFX 或 FXList 中对应条目

## 延伸阅读（资料库整合）

- [ocl-dynamic-units-and-escorts.md](ocl-dynamic-units-and-escorts.md) — WeaponOCLNugget、死亡触发、护卫单位  
- [particle-effects-practical.md](particle-effects-practical.md) — 改粒子大小、复刻开火特效  
- [gameobject-enums-appendix.md](gameobject-enums-appendix.md) — OCL Disposition 枚举表  
