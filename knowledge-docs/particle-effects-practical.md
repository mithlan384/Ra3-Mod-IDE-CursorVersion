# 粒子特效实战（资料整合）

> 来源：`资料/粒子特效代码教程实例1.docx`、`实例3.docx`、`粒子特效复刻思路及简要引导(修订1）.docx`。  
> 理论链见 [ocl-fx-effects.md](ocl-fx-effects.md)；本文为 **改参、复刻、原创** 步骤。

## 调用链回顾

```
WeaponTemplate FireFX / Projectile Die → FXList → FXParticleSystem（SageXml/FXParticleSystems/）
```

- **FireFX**：开火瞬间  
- **Projectile** 的 `FXListBehavior` / `GroundHitFX`：弹体死亡或着地（如 V4 导弹爆炸）  
- 一个 FXList 可组合 **多个** 粒子系统（炮口焰 + 烟雾 + 针状火光等）

## 实例 1：放大 V4 爆炸

1. 在 GameObject 找 V4 武器 → `WeaponTemplate` → 抛射体 `ProjectileTemplate`  
2. 搜抛射体 id，找到 `FXListBehavior`（死亡）与 `GroundHitFX`（常共用同一 FXList）  
3. 搜 `FX_SOV_V4Explosion` → 打开 FXList，列出引用的粒子文件  
4. 复制粒子 XML 到 MOD `data/`，Mod.xml 引用  
5. 调参（约 **2 倍** 体积示例）：
   - 单粒子：`Size`、`SizeRate`  
   - 系统：`Velocity`、`Volume` 下各值  
   - **Shockwave** 的 Volume 可单独保留（贴地微调）  
6. 全粒子改完再编译测试；体积约为单参数 2 倍时，总体积可达约 **8 倍**

## 实例 3：原创简单爆炸

1. 构思：如「快速膨胀后停止的火焰」  
2. 用关系估算 `SizeRateDamping`、`SizeRate`、`Lifetime`、`Velocity`（教程用 Lifetime≈15–20，SystemLifetime≈2）  
3. 复制原版粒子 XML（如双刃火箭），改 id（如 `FX_Explosion_Example`）  
4. 调 `BurstCount≈5`，删初始 `Size` 试效果  
5. `VelocityDamping`、`Volume`（Radius、Offset.z 抬高避免贴地被挡）  
6. 在目标单位 `FXList`（如标枪兵）加入该粒子；Mod.xml 注册  
7. **星级特效**：复制粒子 + 从原版星级 FX 复制 `Color` 模块  

迭代：缩小 `SizeRate`、`Velocity`、`Volume` 直到满意。

## 复刻思路（日冕开火为例）

1. **分析**参考视频/ MOD：拆成几个粒子（炮口焰、针状火、烟雾）  
2. 注意 **时序**（炮口焰是否先于针状火、是否向前位移）→ `SortLevel`、`Cylinder/Offset`、`Ortho Position`  
3. 从守护者坦克炮 `WeaponTemplate` 的 `FireFX` → FXList → 五个粒子；对比后删除多余侧向烟等  
4. 另找 `FX_TankMissMed` 等通用「炮弹爆炸」粒子加入组  
5. **注释法**：在 FXList 中逐个注释粒子，编译测试，定位目标火焰  
6. 重组 FXList 后引用到 Mod.xml  

| 模块 | 作用 |
|------|------|
| `Cylinder Offset` | 粒子生成初始位置 |
| `SortLevel` | 层级覆盖（大值在上） |
| `Ortho Position` | xyz 全向位移（炮口焰前移） |

## 搜索技巧

- Notepad++ / IDE 全局搜 `FXList` id、`ProjectileTemplate` id  
- 粒子目录：`SageXml/FXParticleSystems/`  

## Agent 提示

- 「开火特效变大」→ FireFX → FXList → 调 Size/SizeRate/Volume/Velocity  
- 「复刻某 MOD 炮口」→ 拆粒子组 + SortLevel/Offset + 注释排查  
- 勿只改 FireFX 字符串而不复制粒子文件到 MOD  
