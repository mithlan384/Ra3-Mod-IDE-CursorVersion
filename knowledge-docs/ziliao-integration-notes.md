# 资料文件夹整合说明

> 源目录：`D:\Ra3ModEditTool\资料`（共 29 个 doc/docx/pdf，2026-05 整合）

## 已写入知识库（新文档）

| 新文档 | 主要来源 |
|--------|----------|
| [skirmish-ai-strategic-states.md](skirmish-ai-strategic-states.md) | AI教程之添加新技能.doc |
| [player-tech-secret-protocol-wiring.md](player-tech-secret-protocol-wiring.md) | 机密协议.doc、代码进阶篇.pdf |
| [particle-effects-practical.md](particle-effects-practical.md) | 粒子特效实例1/3、复刻引导 docx |
| [w3x-model-practical-guide.md](w3x-model-practical-guide.md) | 教程补档/模型篇、加入新模型 docx |
| [ocl-dynamic-units-and-escorts.md](ocl-dynamic-units-and-escorts.md) | OCL和守护单位.pdf |
| [unit-cameo-and-portraits.md](unit-cameo-and-portraits.md) | 代码进阶篇.pdf §1 |
| [unit-experience-and-repair-drones.md](unit-experience-and-repair-drones.md) | 代码进阶篇.pdf §7–8 |
| [gameobject-enums-appendix.md](gameobject-enums-appendix.md) | 红警3源代码详解.docx、XML源码详解.pdf（枚举部分） |

## 刻意未重复收录（已有文档覆盖）

| 资料 | 已有知识库 |
|------|------------|
| mod基础教程、入门教程初级 | mod-development-workflow、create-unit、gameobject-template-mytank |
| 红警3源代码详解（KindOf/装甲/武器/运动全文） | kindof-advanced、armor-locomotor、weapon-template-advanced、gameobject-core-reference |
| XML源码详解.pdf 主体 | 同上 + xml-tags |
| 源代码详解.doc 简述 | gameobject-core-reference |

## 未能文本提取（多为图片版 .doc）

以下文件仅提取到标题/作者，**未生成独立文档**；若需收录请提供 docx/pdf 或手动 OCR：

- AI基础教程.doc、AI教程_遭遇战加入新单位.doc  
- DIY高人代码篇：粒子解析、散矿采集、建造列表翻页  
- 模型篇：所属色、建筑损毁、车灯、机桨（部分）  
- 红3MOD仿CC3白色透明编队、主界面图片修改  
- 粒子效果代码解析.doc  

## 重建索引

新增 md 后请在 IDE **知识库面板 → 重建索引**，或重启 IDE 自动索引 `knowledge-docs/*.md`。

提取脚本（开发用）：`scripts/ingest-ziliao-tutorials.js`、`scripts/extract-ziliao-pdfs.js`，缓存 `.cache/ziliao-extract/`。
