# RA3 标准 MOD 格式参考（起义时刻 Insurrection）

> **参考模组**：`RA3 MODSDK-X/Mods/Insurrection`（起义时刻）。本文档为 IDE 内置知识库条目，供 AI 学习**专业 MOD 的项目结构、Mod.xml 引用规范、单位 XML 写法**。  
> **重要**：用户各自 MOD 结构可能不同；写入文件前必须结合**当前项目扫描结果**中的「项目规范」，与打开的项目保持一致，不可强行套 Insurrection 目录名。

---

## 1. 顶层目录结构

| 目录 | 作用 |
|------|------|
| **data/** | Sage XML 入口与全部数据（`Mod.xml` 在 `data/` 下） |
| **Art/** | 模型 W3X、贴图（常 `Art/Units/单位显示名/`） |
| **Audio/** | 单位音效（常 `Audio/Units/单位显示名/`） |
| **Additional/** | 战役地图、脚本、字幕等（可选） |
| **mod.babproj** | BinaryAssetBuilder 工程，指向 `data\mod.xml` |

与「极简 MOD」（仅 `data/Mod.xml` + 一两个 XML）对比：Insurrection 约 400+ data XML，按阵营与单位类型分层。

---

## 2. Mod.xml 引用规范（三层）

### 2.1 根清单 `data/Mod.xml`

```xml
<AssetDeclaration xmlns="uri:ea.com:eala:asset">
  <Includes>
    <!-- 仅对原版根数据用 reference，不复制进 MOD -->
    <Include type="reference" source="DATA:Static.xml" />
    <Include type="reference" source="DATA:Global.xml" />
    <Include type="reference" source="DATA:Audio.xml" />

    <!-- MOD 自有聚合清单用 all，会递归合并子树 -->
    <Include type="all" source="Common.xml" />
    <Include type="all" source="Specific.xml" />
    <Include type="all" source="Allied.xml" />
    <Include type="all" source="Japan.xml" />
    <Include type="all" source="Soviet.xml" />
    <Include type="all" source="Other.xml" />
  </Includes>
</AssetDeclaration>
```

| type | 用途 | source 写法 |
|------|------|-------------|
| **reference** | 引用原版已编译数据 | `DATA:Static.xml`、`DATA:Global.xml`、`DATA:Audio.xml`（注意大小写与 SDK 一致） |
| **all** | 合并 MOD 内整个子清单/单位包 | 相对 Mod.xml 的路径，如 `Allied.xml`、`Common.xml` |
| **instance** | 在**单位资产文件**内继承蓝本 | 见下文，**不要**在 Mod.xml 里对单个单位用 reference |

**禁止**：在 Mod.xml 用 `type="reference"` 指向 MOD 自建的单位 XML（应走 `type="all"` 聚合链）。

### 2.2 阵营聚合（起义时刻二级结构）

**顶层** `data/Allied.xml`（仅指向阵营子聚合）：

```xml
<Includes>
  <Include type="all" source="Allied/Allied.xml" />
</Includes>
```

**子聚合** `data/Allied/Allied.xml`（列出本单位，路径相对 `data/Allied/`）：

```xml
<Includes>
  <Include type="all" source="Infantry/Cryo Legionnaire.xml" />
  <Include type="all" source="Vehicle/Future Tank X-1.xml" />
</Includes>
```

路径**相对于该聚合文件所在目录**（如 `data/Allied/Infantry/...`）。

> 数据目录名固定小写 **`data/`**，与 `mod.babproj` 中 `data\mod.xml` 一致；勿使用 `Data/`。

### 2.3 单位包装清单 `data/Allied/Infantry/Cryo Legionnaire.xml`

```xml
<Include type="all" source="Cryo Legionnaire/GameObject.xml" />
<Include type="all" source="Cryo Legionnaire/LogicCommand.xml" />
<Include type="all" source="Cryo Legionnaire/LogicCommandSet.xml" />
<Include type="all" source="Cryo Legionnaire/WeaponTemplate.xml" />
<!-- 另有 W3X、AudioEvent、FXList、Texture 等 -->
```

---

## 3. 单位 XML 结构（Insurrection 标准）

### 3.1 目录与命名

- **阵营 / 类型**：`data/{Allied|Soviet|Japan|Other}/{Infantry|Vehicle|Aircraft|Structures|Units}/`
- **显示名文件夹**（可含空格）：`Cryo Legionnaire/`
- **内部 Sage ID** 可与文件夹名不同，如文件夹 `Cryo Legionnaire` → `id="AlliedLegionnaireInfantry"`

### 3.2 GameObject.xml（必选模式）

```xml
<AssetDeclaration xmlns="uri:ea.com:eala:asset"
  xmlns:xai="uri:ea.com:eala:asset:instance">
  <Includes>
    <!-- 必须在 Includes 块内，不能作为 AssetDeclaration 直接子节点 -->
    <Include type="instance" source="DATA:SageXml/BaseObjects/BaseInfantry.xml" />
  </Includes>

  <GameObject
    id="AlliedLegionnaireInfantry"
    inheritFrom="BaseInfantry"
    Side="Allies"
    CommandSet="AlliedLegionnaireInfantryCommandSet"
    ...>
    <!-- 局部覆盖用 xai:joinAction="Replace" 等 -->
  </GameObject>
</AssetDeclaration>
```

**硬规则（BinaryAssetBuilder）**：

1. 所有 `<Include>` 必须放在 `<Includes>...</Includes>` 内，否则报 `Include has no id attribute`。
2. `inheritFrom` 通常用 `BaseInfantry` / `BaseVehicle` / `BaseAircraft`，基类通过 `DATA:SageXml/BaseObjects/...` 引入。
3. **不要**用极简模板里的 `<WeaponSlot WeaponTemplate="..."/>`；应用 `WeaponSlotHardpoint` + `<Weapon Template="..." Ordering="PRIMARY_WEAPON"/>`，或直接继承官方单位包。
4. 盟军 `Side` 写 **Allies**（不是 Allied）。

### 3.3 LogicCommand / LogicCommandSet（按单位分文件）

**LogicCommand.xml**（建造）：

```xml
<LogicCommand Type="UNIT_BUILD" id="Command_ConstructAlliedLegionnaireInfantry">
  <Object>AlliedLegionnaireInfantry</Object>
</LogicCommand>
```

**LogicCommandSet.xml**（单位指令栏）：

```xml
<LogicCommandSet id="AlliedLegionnaireInfantryCommandSet">
  <Cmd>Command_ActivateCryoLeapSpecialPower</Cmd>
  <Cmd>Command_AttackMove</Cmd>
  ...
</LogicCommandSet>
```

**兵营/工厂队列**：在 `data/Common/LogicCommandSet.xml` 中向 `SovietBarracksCommandSet` 等追加 `<Cmd>Command_ConstructXXX</Cmd>`，而不是只写单位自己的 CommandSet。

---

## 4. 其它常见项目形态（扫描时识别）

| 形态 | 特征 | AI 写入策略 |
|------|------|-------------|
| **Insurrection 型** | 阵营聚合 XML + 单位子文件夹 + 多文件拆分 | 新建单位时建 wrapper + 子目录 `GameObject.xml` 等 |
| **CommandData 型** | 单一 `data/CommandData.xml` 集中 LogicCommand | 追加到 CommandData，不新建 GlobalData |
| **极简扁平型** | `data/{Side}/Units/UnitId.xml` 单文件 | 单文件 + Mod.xml reference/all；可用「继承官方单位 instance」降低出错率 |

---

## 5. AI 写 XML 检查清单

1. **先读当前项目扫描**：Mod.xml 路径、Include 类型习惯、单位目录、命令放在哪。
2. **Mod.xml**：只 `reference` 原版三件套；MOD 内容用 `all` 链到自己的聚合/单位。
3. **新单位**：`id` PascalCase；`CommandSet="{id}CommandSet"`；`Command_Construct{id}` 与 CommandSet 一致。
4. **Includes 块**：任何 Include 都在 `<Includes>` 内。
5. **继承**：优先 `DATA:SageXml/BaseObjects/Base*.xml` + `inheritFrom="Base*"`；若项目已有克隆 vanilla 单位习惯则跟随项目。
6. **编译前**：确认 LogicCommand 已注册、兵营 CommandSet 已挂接（若需可造）。

---

## 6. 参考路径速查（Insurrection）

| 用途 | 路径 |
|------|------|
| 根清单 | `data/Mod.xml` |
| 公共命令补丁 | `data/Common/LogicCommandSet.xml` |
| 完整步兵示例 | `data/Allied/Infantry/Cryo Legionnaire/` |
| GameObject | `.../Cryo Legionnaire/GameObject.xml` |
| 苏联兵营队列补丁 | `data/Common/LogicCommandSet.xml` → `SovietBarracksCommandSet` |

---

## 7. 与 IDE 工具联动

| 用户操作 | 系统行为 |
|----------|----------|
| 说「扫描整个 MOD」 | 分析项目结构 + **编译健康检查**（🔴/🟡 警告）；可选标准/当前项目格式 |
| 修复编译报错 | 分析根因（非 .manifest 源码问题），自动改不合规单位 XML |
| 新建/修改单位 | `unit-xml-builder` 按 `projectConventions` 选路径与文件拆分方式 |
| 编译修复 | 优先修 Include/武器格式，不盲目重写 Mod.xml |

标准格式来源模组：`Mods/Insurrection`。各用户项目请**以扫描结果为准**。
