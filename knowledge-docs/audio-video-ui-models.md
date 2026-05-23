# 音频、视频、UI 与模型（进阶）

## 一、音效（Audio）

- 游戏内音效为 `.asset` 加密格式，可用 binview.exe 或 C&C Asset Extractor 提取
- 单位 XML 引用：`FireSound`、`UnitIntro` 等填音效 ID
- 自定义 MP3：使用 `AudioFileMP3Passthrough`，但动态音乐调色板可能失效

## 二、视频（Video）

| 类型 | 格式 | 用途 |
|------|------|------|
| 过场 | .bik（RAD Video Tools 从 AVI 转换） | 导入 movmd03.mix，地图脚本触发 |
| 加载/动态 UI | .vp6 | AptUI 中 VideoObject 钩子 |

## 三、用户界面（UI）

从官方 UI 资源获取 `.apt`、`.const`、`.art`：

- **图片**：修改 `fe_shared_mainMenuLib` 等目录下 `.art`，注意版本后缀（如 .12）
- **布局**：aptxmleditor 编辑 `.apt` 调整按钮与面板
- **动态背景**：.const 中添加 VideoObject 链接 .vp6

**注意**：先备份；修改后在 Mod.xml 注册 Additional/Data 路径。

## 四、模型与动画（.w3x）

| 文件 | 说明 |
|------|------|
| .w3x | 网格、蒙皮、材质、骨骼、动画 |
| .skn / .skl | 蒙皮与骨骼（复杂动画常单独 .skl） |

**工作流**：
1. C&C Asset Extractor 从 .big 提取 .w3x
2. w3x 导入脚本 → 3ds Max 编辑
3. w3x 导出插件导出
4. 步兵/机甲注意 WWSkin 蒙皮与 IK
5. 放入 `Mod\Assets`，编译勾选「合并中立资产」

单位 XML 引用：`<SkinnedDraw Model="模型资源名" />`

## Agent 提示

- 「换模型」→ 改 Draws 下 Model，需 Assets 中有对应 w3x
- 「改开火音效」→ WeaponTemplate FireSound 或单位相关 Sound 属性

## 延伸阅读

- [w3x-model-practical-guide.md](w3x-model-practical-guide.md) — OBBOX、SKL/SKN、COL、炮塔、FP 预览  
- [unit-cameo-and-portraits.md](unit-cameo-and-portraits.md) — 建造栏/选中肖像 TGA 与 PackedImages  
