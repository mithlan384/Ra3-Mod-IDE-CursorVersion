# 单位图标（Cameo）与肖像（资料整合）

> 来源：`资料/RA3DIY：代码进阶篇.pdf` 第 1 节。UI 总览见 [audio-video-ui-models.md](audio-video-ui-models.md)。

## XML 引用

```xml
<GameObject id="mytank" ...>
  SelectPortrait="Portrait_mytank"
  ButtonImage="Button_mytank_on"
```

| 属性 | 用途 |
|------|------|
| `SelectPortrait` | 选中单位时右下角肖像 |
| `ButtonImage` | 建造/训练栏按钮图 |

二者可不同，教程常设为同一套图。

## 贴图与打包

1. 制作 **128×128**（或 76×106）TGA，如 `Portrait_mytank.tga`  
2. 放到 `Art/Images/`（或 MOD 对应目录）  
3. 复制 SDK 的 `SampleUpdatedPackedImages.xml`，改名为如 `SampleUpdatedPackedImages2.xml`  
4. 将示例中的 `Portrait_AlliedHarbingerGunship` 全部替换为 `Portrait_mytank`（Texture + PackedTextureImage 两处）  
5. Mod.xml：

```xml
<Include type="all" source="ART:Images/SampleUpdatedPackedImages2.xml" />
```

6. 编译；无显示则检查 **id 字符串完全一致**（大小写、后缀）

## Button 与 Portrait 命名

- 肖像：`Portrait_单位名`  
- 按钮：常为 `Button_单位名_on`（需与 PackedImages 内 id 一致）

## Agent 提示

- 「换建造图标」→ ButtonImage + PackedTextureImage  
- 「换选中头像」→ SelectPortrait  
- 只改 XML 不换 TGA / 不 Include PackedImages → 无效  
