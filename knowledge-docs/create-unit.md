# 如何创建新单位

> **完整五阶段流程**见 `mod-development-workflow.md`。  
> **GameObject 模板**见 `gameobject-template-mytank.md`。  
> **一单位一文件**见 `unit-file-conventions.md`。

## 五阶段摘要

1. 复制 SageXml 蓝本 → 改 GameObject id  
2. LogicCommand + LogicCommandSet（生产命令与 UI）  
3. Mod.xml Include 注册  
4. 武器 WeaponTemplate  
5. SkirmishAI（可选）

## 第一步：确定单位 ID 和模板
- 先用 `findUnitsByName` 搜索类似单位，了解现有单位结构
- 确定新单位的 ID（英文标识符，如 SuperConscript）
- 选择合适的模板单位（如 SovietConscript 做步兵模板）

## 第二步：创建单位
使用 `createUnit` 工具，参数：
- `unitId`: 新单位 ID（必填，英文标识符）
- `templateUnit`: 模板单位 ID（推荐，直接复制已有单位）
- `displayName`: 显示名称（可选，如"超级动员兵"）

## 第三步：调整属性
使用 `setUnitProperty` 修改关键属性：
- `Health.MaxHealth` → 最大血量
- `Cost` → 造价
- `ProductionTime` → 生产时间
- `WeaponSetUpdate.WeaponSlotTurret.Weapon.Template` → 武器模板

## 第四步：设置阵营
如果模板的阵营不对，用 `writeXml` 修改 `Side` 属性：
- `Side` → "Allied" / "Soviet" / "Imperial"

## 常见新单位模板对应
- 步兵 → templateUnit="SovietConscript" 或 "AlliedInfantry"
- 坦克 → templateUnit="ApocalypseTank" 或 "AlliedTank"
- 飞机 → templateUnit="AlliedAircraft" 或 "SovietAircraft"
- 建筑 → 用 `createBuilding` 工具

## 创建新阵营流程
1. 创建新阵营的生产建筑（兵营、车厂、空指部等）
2. 创建新阵营的单位（步兵、车辆、飞机）
3. 为每个建筑/单位设置 `Side="新阵营名"`
4. 创建各单位的 CommandSet（指令集）