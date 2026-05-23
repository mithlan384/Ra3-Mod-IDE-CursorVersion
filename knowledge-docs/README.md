# RA3 Mod IDE 知识库索引

本目录为 AI Agent 内置教程，启动 IDE 后自动编入检索。

## XSD 权威（最高优先级）

| 文档 | 说明 |
|------|------|
| [sdk-xsd-authority.md](sdk-xsd-authority.md) | **SDK `Schemas/xsd` 全部 XSD** 自动索引；XML 标签/属性/枚举与教程冲突时 **以 XSD 为准** |

## 标准 MOD 格式（AI 必读）

| 文档 | 说明 |
|------|------|
| [standard-mod-format-reference.md](standard-mod-format-reference.md) | **起义时刻 Insurrection** 项目结构、Mod.xml 引用 type=reference/all/instance、单位多文件拆分 |

## 入门与流程

| 文档 | 说明 |
|------|------|
| [mod-development-workflow.md](mod-development-workflow.md) | **五阶段总览**：GameObject → LogicCommand → Mod.xml → 武器 → AI |
| [gameobject-template-mytank.md](gameobject-template-mytank.md) | MyTank 完整 XML 示例 |
| [create-unit.md](create-unit.md) | 新建单位工具步骤 |
| [unit-file-conventions.md](unit-file-conventions.md) | 一单位一文件、目录命名 |

## 进阶：核心词典

| 文档 | 说明 |
|------|------|
| [gameobject-core-reference.md](gameobject-core-reference.md) | GameObject 全属性与自然语言映射 |
| [kindof-advanced.md](kindof-advanced.md) | KindOf 完整分类（交互/移动/AI/特殊） |
| [weapon-template-advanced.md](weapon-template-advanced.md) | WeaponTemplate 全字段与 Nuggets |
| [armor-locomotor-behaviors.md](armor-locomotor-behaviors.md) | 装甲、Locomotor、Behaviors 模块 |
| [logic-command-specialpower.md](logic-command-specialpower.md) | LogicCommand、命令集、SpecialPower |
| [globaldata-skirmish-ai.md](globaldata-skirmish-ai.md) | GlobalData 注册表与遭遇战 AI |
| [skirmish-ai-strategic-states.md](skirmish-ai-strategic-states.md) | **资料整合** AI 战略状态战术模块 |
| [ocl-fx-effects.md](ocl-fx-effects.md) | OCL 召唤与 FX 特效链 |
| [ocl-dynamic-units-and-escorts.md](ocl-dynamic-units-and-escorts.md) | **资料整合** OCL 动态单位、护卫 |
| [particle-effects-practical.md](particle-effects-practical.md) | **资料整合** 粒子改参、复刻、原创 |
| [gameobject-enums-appendix.md](gameobject-enums-appendix.md) | **资料整合** EditorSorting 等枚举表 |

## 进阶：系统扩展

| 文档 | 说明 |
|------|------|
| [ra3-spectator-and-multiplayer-slots.md](ra3-spectator-and-multiplayer-slots.md) | **观战与 6 人槽**：战败观战原版、地图 PlyrCreeps/Civilian、MOD 边界 |
| [upgrades-tech-tree.md](upgrades-tech-tree.md) | Upgrades、秘密协议、科技树 |
| [player-tech-secret-protocol-wiring.md](player-tech-secret-protocol-wiring.md) | **资料整合** 协议/支援技能完整接线 |
| [subfaction-player-template.md](subfaction-player-template.md) | 子阵营 PlayerTemplate |
| [audio-video-ui-models.md](audio-video-ui-models.md) | 音效、视频、UI、w3x 模型工作流 |
| [w3x-model-practical-guide.md](w3x-model-practical-guide.md) | **资料整合** OBBOX、SKL/SKN、炮塔、损毁 |
| [unit-cameo-and-portraits.md](unit-cameo-and-portraits.md) | **资料整合** 建造栏/肖像 TGA |
| [unit-experience-and-repair-drones.md](unit-experience-and-repair-drones.md) | **资料整合** 经验等级、维修机 |

## 红警3原版（百科）

| 文档 | 说明 |
|------|------|
| [vanilla-ra3-biligame-wiki.md](vanilla-ra3-biligame-wiki.md) | **SDK + 百科对齐**：原版 unitId/易错对照/全阵营表；**非 MOD 项目文件** |
| [vanilla-ra3-unit-id-master.md](vanilla-ra3-unit-id-master.md) | CSF `NAME:` 完整 unitId 对照（`ingest-biligame-wiki.js` 生成） |
| [biligame-wiki-index.md](biligame-wiki-index.md) | B站百科抓取索引；详情在 `biligame-wiki/` 子目录 |

## 阵营与蓝本

| 文档 | 说明 |
|------|------|
| [faction-unit-blueprints.md](faction-unit-blueprints.md) | 三大阵营标准 unitId |
| [unit-id-reference.md](unit-id-reference.md) | 中文名 ↔ SDK ID |

## 属性速查（基础）

| 文档 | 说明 |
|------|------|
| [unit-attributes.md](unit-attributes.md) | 血量、速度、造价修改路径 |
| [kindof-weapon-dictionary.md](kindof-weapon-dictionary.md) | KindOf / 武器简明词典 |
| [weapon-config.md](weapon-config.md) | WeaponSetUpdate 挂载 |
| [xml-tags.md](xml-tags.md) | XML 标签速查 |

## 建筑、编译

| 文档 | 说明 |
|------|------|
| [building-config.md](building-config.md) | 建筑 XML |
| [create-faction.md](create-faction.md) | 新阵营流程 |
| [sdk-build.md](sdk-build.md) | SDK 编译 |

## 资料库来源

`D:\Ra3ModEditTool\资料` 教程已去重整合，详见 [ziliao-integration-notes.md](ziliao-integration-notes.md)。

## Agent 检索提示

| 用户意图 | 优先文档 |
|----------|----------|
| 新建单位 / 写 XML | **standard-mod-format-reference**, mod-development-workflow；并先扫描当前项目 |
| 扫描整个 MOD | 生成**本项目**结构规范（与 Insurrection 标准对照） |
| 改属性/血量/速度 | unit-attributes, gameobject-core-reference |
| KindOf / 单位类型 | kindof-advanced |
| 武器伤害射程 | weapon-template-advanced |
| 生产/命令条 | logic-command-specialpower |
| AI 遭遇战 | globaldata-skirmish-ai, skirmish-ai-strategic-states |
| 技能 | logic-command-specialpower, player-tech-secret-protocol-wiring |
| 死亡召唤/特效 | ocl-fx-effects, ocl-dynamic-units-and-escorts |
| 粒子/开火特效 | particle-effects-practical |
| 换模型/炮塔 | w3x-model-practical-guide |
| 单位图标 | unit-cameo-and-portraits |
| 经验/维修机 | unit-experience-and-repair-drones |
| 科技升级 | upgrades-tech-tree |
| 子阵营 | subfaction-player-template |
| 换模型音效 | audio-video-ui-models |
| 列出项目单位 | 用工具 listAllUnits，勿仅查知识库 |
