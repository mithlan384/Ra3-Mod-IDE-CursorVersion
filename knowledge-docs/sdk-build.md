# RA3 MOD SDK 编译指南

## EALAModStudio 命令行参数

**基本格式（工作目录为 SDK 根目录，/mod 为 Mods 下的模组名，非任意磁盘路径）：**
```
EALAModStudio.exe /build
  /mod:模组名
  /version:版本号
  /skudef:skudef名称
```

IDE **不会**打开 EALAModStudio 图形界面；会在后台按编译对话框勾选项调用 `tools/binaryassetbuilder.exe` 等工具链，输出分栏显示在底部 **BuildLog** / **ErrorLog** 标签页。编译前会将「其他路径」的项目同步到 `SDK/Mods/<模组名>`。

## 编译选项

| 参数 | 说明 |
|------|------|
| /clean | 清理旧编译文件 |
| /clearcache | 清除缓存 |
| /aptui | 生成 APT UI |
| /globaldata | 编译全局数据 |
| /assetdata | 编译资源数据 |
| /mergeassets | 合并资源 |
| /fixneutral | 修复中立建筑 |
| /copyextra | 复制额外文件 |
| /big | 打包为 BIG 文件 |
| /skudef | 生成 skudef 文件 |
| /fullscreenini | 全屏 INI |
| /windowini | 窗口 INI |

## 编译输出

- 输出目录：项目目录下的 compiled/
- 生成的 .big 文件可直接放入游戏目录
- 编译日志通过 stdout/stderr 输出

## 常见编译错误

- 文件路径错误：检查 XML 文件路径是否正确
- 标签未闭合：检查 XML 格式
- 单位 ID 重复：确保每个单位 ID 唯一
- 模板引用不存在：检查 Weapon/Template 引用是否有效
