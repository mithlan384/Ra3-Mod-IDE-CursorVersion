# W3X 模型实战要点（资料整合）

> 来源：`资料/教程补档/` 模型篇系列、`制作加入新的模型.docx`、yangqs 教程 W3X 初解。  
> 流程总览见 [audio-video-ui-models.md](audio-video-ui-models.md)。

## 3ds Max 插件

- SDK `3DSMax9_Plugin` 内容复制到 Max 安装目录  
- 材质用 `objects*.fx`（阵营对应），Diffuse / Normal / Specular 贴图  
- 导出类型：**W3D XML Asset**（.w3x）

## 可被鼠标选中：OBBOX

- 场景中需 **长方体外框**，命名如 `OBBOX01`  
- W3D Tool 中设置；无 OBBOX 则游戏中无法点选  
- `Scale` 缩小游戏模型时 **OBBOX 不随 Scale 缩小**

## 编队预览 FP 模型

`FORMATION_PREVIEW` 条件下使用的绿色预览模型：

```xml
<ModelConditionStateParseCondStateType="PARSE_NORMAL" ConditionsYes="FORMATION_PREVIEW">
  <ModelName="SUKodiak_FP" />
</ModelConditionState>
```

- 地面单位：复制主 SKN，删多余，材质 `objectsformationpreview.fx` + 漫反射/法线 → 场景变绿  
- 飞行器：加一根「杆」并贴图

## COL 损毁块

- 载具/建筑消亡时碎块；常 `Bone_D_01` 对应长方体 `COL_Bone_D_01`  
- XML `<BoneVolume>` 的 `Translation` / `Box HalfSize*` / `Mass` 与 COL 长方体参数对应（Mass ≈ 半尺寸乘积 × 2.5）  
- **导出 COL 时不要挂 SKL**；COL 辅助体可不进最终 W3X，仅用于算参数

## SKL / SKN / 动画

1. 在 SKN 上建好骨骼；除 COL 外动画都在此 SKN 上，**勿再增骨骼**  
2. 定稿后先导出 **SKL**  
3. 再导出 **SKN**（必须引用刚生成的 SKL；勾选碰撞检测，否则穿模）  
4. 动画 W3X 单独导出并引用 SKL  
5. 改重要骨骼后需 **重新生成 SKL**

## 炮塔旋转

```xml
<Turret TurretNameKey="Turret" TurretPitch="Turret_Pitch" TurretID="1" />
<TurretSettings
  TurretTurnRate="90"
  TurretPitchRate="180"
  AllowsPitch="true"
  MinimumPitch="-90d"
  MaxDeflectionAntiClockwise="90d"
  MaxDeflectionClockwise="90d"
  NaturalTurretAngle="45d"
  MinIdleScanAngle="0.0"
  MaxIdleScanAngle="50.0" />
```

Max 中：炮塔/炮管 Link 层级；炮管 pivot 靠近炮塔；`FX_WeaponA` 骨骼 Link 到炮管。

## 替换模型（海啸坦克示例）

1. Art 包打开 `JUAntiVehicleVehicleTech1.max`，新建 chassis / turret / barrel，Link 与材质  
2. 移动 `FX_WeaponA` 到炮管并 Link  
3. 调整 `OBBox01` 大小  
4. 导出 `ART:xxx.w3x`  
5. 单位 XML `<Includes>` 加 `ART:xxx.w3x`；`ModelName` 改为新名；`TurretNameKey` 与骨骼一致  
6. Mod.xml Include 单位文件；编译  

## 自制模型 FAQ（牧星）

- 步兵/机甲：**WWSkin** 蒙皮，其他蒙皮无效  
- 新增面需 **自动光滑组**，否则游戏内破面  
- 车灯、履带贴图：`objectsalliedtread.fx` 等  

## W3X 文本结构（写字板初解）

| 节点 | 含义 |
|------|------|
| `<W3DHierarchy/>` | 骨架，复杂时在 SKL |
| `<W3DMesh GeometryType="Skin">` | 蒙皮网格；含 Vertices、BoneInfluences、FXShader |
| `<W3DCollisionBox/>` | 碰撞 |
| `<W3DContainer>` | 子物体、边界 |
| `<W3DAnimation><Channels>` | 骨骼通道动画 |

`GeometryType="Normals"` 时无 `BoneInfluences`。

## Agent 提示

- 「不能选中单位」→ 检查 OBBOX  
- 「炮塔不转」→ TurretNameKey 与 Max 骨骼名、TurretSettings  
- 「损毁碎块乱飞」→ BoneVolume 与 COL 参数  
