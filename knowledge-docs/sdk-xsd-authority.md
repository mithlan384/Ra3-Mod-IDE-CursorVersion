# RA3 MOD SDK XSD 规范（最高优先级）

IDE 从 **`Schemas/xsd` 全量分片索引**（约 800+ 文件 → 数千条知识 + 符号表），运行时通过工具 **按需读 XSD 原文**，不遍历 MOD 项目。

## 权威等级

1. **SDK XSD 原文**（`readSdkXsd` / `grepSdkXsd`）— 最终依据  
2. **XSD 符号表 + 分片索引**（`lookupXsdSymbol`、知识库 category=xsd）— 快速定位  
3. SDK 中文 txt、`knowledge-docs` 教程  
4. 猜测  

与教程冲突时 **必须以 XSD 为准**。

## Agent 工具（轻量，不扫 9.8GB MOD）

| 工具 | 作用 |
|------|------|
| `lookupXsdSymbol` | 查 `SpecialPower`、`INFANTRY` 等在哪个 `.xsd` |
| `grepSdkXsd` | 仅在 `Schemas/xsd` 内搜关键词 |
| `readSdkXsd` | 读指定 XSD 全文或行范围 |

写 GameObject / Weapon / SpecialPower 等 XML 前，应至少 grep 或 read 一次对应 XSD。

## 索引说明

- **每个 XSD** 按 element/attribute/enum **分片**入库，大文件（如 `AssetTypeGameObject.xsd`）不会只保留前 40 条  
- **符号表** 存于 `.knowledge/xsd-symbol-index.json`  
- 重建索引：知识库面板 → 🔄（schema v7+ 会自动全量重建）  
- 索引在后台执行，**每 25 个文件让出事件循环**，避免卡死 UI  

## 性能与权威平衡（IDE 策略）

- XSD 总量约数 MB，与 MOD 体积无关  
- **全量分片索引**：仅在应用启动后后台执行一次，对话检索**不**重复触发  
- **知识库检索**：按场景加权（`xsd-search-policy.js`）  
  - 知识库面板 / 编译报错 / 改 XML 类问题：允许多条 XSD 命中（约 4～8 条）  
  - 纯闲聊：不塞 XSD chunk；符号表仍可命中  
  - 创建单位流程：教程为主；**写 XML 前**自动 `prefetchXsdForUnitCreate`（符号表 + 限量 grep/read，仅 SDK）  
- Agent **写 XML 前**应调用 `lookupXsdSymbol` / `grepSdkXsd` / `readSdkXsd`，不以教程代替 XSD  
