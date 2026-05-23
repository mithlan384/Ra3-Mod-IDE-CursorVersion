# 红警3 MOD 单位文件与命名规范

## 一单位一文件（强制）

- 每个可玩单位必须有**独立的 XML 文件**，不得在多个单位共用一个 XML 里追加 `<GameObject>`（除非官方原版就是这种打包方式，MOD 新建单位不推荐）。
- 文件名与单位 `id` 一致，例如单位 `MySuperTank` → `MySuperTank.xml`。

## 推荐目录结构（RA3 MOD SDK）

在 MOD 项目根目录下：

```
Mods/YourMod/
  data/
    Mod.xml
    Allied/Units/YourUnit.xml
    Soviet/Units/YourUnit.xml
    Japan/Units/YourUnit.xml
```

部分项目使用 `data/XML/Units/`，IDE 会**自动检测**当前项目已有布局并沿用。

## Mod.xml 注册

每个新 XML 必须在 `data/Mod.xml`（或 `Data/Mod.xml`）的 `<Includes>` 中增加：

```xml
<Include type="reference" source="DATA:Soviet/Units/YourUnit.xml" />
```

路径使用 `DATA:` 前缀，且相对于 `data` 目录。

## 单位 ID 命名

| 规则 | 说明 |
|------|------|
| 英文字母开头 | 仅 `A-Za-z0-9_`，无空格、无中文 |
| 全局唯一 | 整个 MOD 内 `id` 不可重复 |
| 与文件名一致 | `id="ZombieInfantry"` → `ZombieInfantry.xml` |
| 派生单位 | 建议 `SuperSovietConscript`、`MyZombie_2`，勿覆盖已有 ID |

## GameObject 结构要点

- 根节点常用 `<AssetDeclaration xmlns="uri:ea.com:eala:asset">`
- 步兵引入：`<Include type="instance" source="DATA:BaseObjects/BaseInfantry.xml" />`
- 单位节点：`<GameObject id="..." inheritFrom="BaseInfantry" Side="Soviet|Allied|Japan" ...>`
- 生命值：`<Body><ActiveBody MaxHealth="150"/></Body>`
- 武器：`<WeaponSetUpdate>` 内 `WeaponTemplate`
- 建造：`CommandSet` 需在 `LogicCommandSet.xml` 注册；兵营队列在 `LogicCommand.xml`

## 新建单位后还需（IDE 可提示，需手动或后续工具）

1. `LogicCommand.xml` — `UNIT_BUILD` 命令
2. `LogicCommandSet.xml` — 单位指令集 + 兵营 `CommandSet` 加入建造
3. 遭遇战 AI（可选）— `SkirmishAI` 权重
4. SDK 编译生成 `.skudef` 包

## 阵营文件夹

| Side 属性（XML 内） | 目录 |
|---------------------|------|
| Allies | data/Allied/Units/ |
| Soviet | data/Soviet/Units/ |
| Japan | data/Japan/Units/ |

## 蓝本复制来源（SDK）

| 类型 | SageXml 路径示例 |
|------|-----------------|
| 盟军坦克 | SageXml\Allied\Units\AlliedAntiVehicleVehicleTech1.xml |
| 苏联步兵 | SageXml\Soviet\Units\SovietAntiInfantryInfantry.xml |
| 帝国坦克 | SageXml\Japan\Units\JapanAntiVehicleVehicleTech1.xml |

复制到 MOD 后**取消只读**，重命名为 `{unitId}.xml`。
