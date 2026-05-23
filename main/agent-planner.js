// main/agent-planner.js (阶段5增强版 - 集成联网搜索)

const { searchSimilar, setLLMCallFn, formatKnowledgeContextForAgent } = require('./knowledge-base');
const { getCurrentFolder } = require('./project-state');

// ========== 1. 工具定义 ==========
function getToolDefinitions() {
  return [
    {
      name: 'setUnitProperty',
      description: '设置单位的某个属性值。单位ID大小写不敏感（mytank和Mytank是同一个单位）。',
      parameters: {
        unitId: '单位 ID（大小写不敏感）',
        propertyPath: '属性路径，如 Body.ActiveBody.MaxHealth（血量）或 ObjectResourceInfo.BuildCost.Amount（造价）',
        newValue: '新的值',
      },
      examples: [
        {
          intent: '把mytank的血量改为200',
          parameters: { unitId: 'mytank', propertyPath: 'Body.ActiveBody.MaxHealth', newValue: '200' },
        },
        {
          intent: '把mytank的造价改为500',
          parameters: { unitId: 'mytank', propertyPath: 'ObjectResourceInfo.BuildCost.Amount', newValue: '500' },
        },
      ],
    },
    {
      name: 'addWeaponToUnit',
      description: '给单位添加一个武器',
      parameters: {
        unitId: '单位 ID',
        weaponTemplate: '武器模板名称',
        slot: '武器槽位，默认 PRIMARY_WEAPON',
      },
      examples: [
        {
          intent: '给天启坦克添加超级武器',
          parameters: { unitId: 'ApocalypseTank', weaponTemplate: 'SuperWeapon', slot: 'PRIMARY_WEAPON' },
        },
      ],
    },
    {
      name: 'getUnitFullXml',
      description: '获取单位的完整 XML 内容',
      parameters: { unitId: '单位 ID' },
    },
    {
      name: 'getUnitInheritance',
      description: '获取单位的继承链',
      parameters: { unitId: '单位 ID' },
    },
    {
      name: 'getWeaponsOfUnit',
      description: '获取单位拥有的所有武器',
      parameters: { unitId: '单位 ID' },
    },
    {
      name: 'findUnitsByName',
      description: '按名称搜索单位（大小写不敏感）',
      parameters: { keyword: '名称关键字' },
    },
    {
      name: 'listAllUnits',
      description: '列出项目中所有单位 ID',
      parameters: {},
    },
    {
      name: 'listAllUnitsDetailed',
      description: '列出项目中所有单位（含文件路径与显示名）',
      parameters: {},
    },
    {
      name: 'readXml',
      description: '读取指定 XML 文件中的某个路径的值',
      parameters: { file: '文件相对路径', path: 'XML 路径，如 Body.ActiveBody.MaxHealth' },
    },
    {
      name: 'writeXml',
      description: '直接写入 XML 文件中的某个路径的值',
      parameters: { file: '文件相对路径', path: 'XML 路径', value: '新值' },
    },
    {
      name: 'getXmlStructure',
      description: '获取 XML 文件的结构树（最多 2 层）',
      parameters: { file: '文件相对路径', depth: '深度，默认 2' },
    },
    {
      name: 'searchFiles',
      description: '在项目中搜索文件和内容（大小写不敏感）',
      parameters: { pattern: '搜索关键词' },
    },
    {
      name: 'findReferences',
      description: '在项目中搜索关键词的全局引用（大小写不敏感）',
      parameters: { keyword: '关键词' },
    },
    {
      name: 'listProjectStructure',
      description: '查看项目目录结构（浅层树，不含全量解析）',
      parameters: { subDir: '子目录（可选）' },
    },
    {
      name: 'scanProject',
      description:
        '仅当用户明确说「扫描全部/整个/所有…代码或项目」时：全量遍历 MOD 并写入会话记忆。分析单个 .xml 禁止用此工具，改用 readProjectFile。',
      parameters: {},
    },
    {
      name: 'lookupXsdSymbol',
      description:
        '在 SDK XSD 符号表查标签/模块/枚举名对应哪个 .xsd 文件（最快，不扫 MOD）。XML 结构问题优先用此工具或 grepSdkXsd。',
      parameters: { symbol: '名称，如 SpecialPower、INFANTRY、WeaponTemplate' },
    },
    {
      name: 'grepSdkXsd',
      description:
        '仅在 SDK Schemas/xsd 目录搜索（不扫 MOD 项目，轻量）。查标签名、属性名、模块名时用。',
      parameters: { pattern: '搜索关键词', maxMatches: '最多返回条数，默认 48' },
    },
    {
      name: 'readSdkXsd',
      description:
        '读取 SDK 下指定 XSD 文件全文或行范围（权威原文）。写 XML 前核对必填属性时用。',
      parameters: {
        file: '相对路径，如 Modules/SpecialPower.xsd',
        startLine: '起始行（可选）',
        endLine: '结束行（可选）',
      },
    },
    {
      name: 'backupFile',
      description: '手动备份文件',
      parameters: { file: '文件相对路径' },
    },
    {
      name: 'restoreFile',
      description: '从备份恢复文件',
      parameters: { file: '文件相对路径' },
    },
    {
      name: 'openFileInEditor',
      description: '在 IDE 编辑器中打开文件',
      parameters: { filePath: '文件相对路径', line: '行号（可选）', column: '列号（可选）' },
    },
    {
      name: 'webSearch',
      description: '在互联网上搜索信息。当知识库中没有用户需要的资料时，必须使用此工具联网搜索。',
      parameters: {
        query: '搜索关键词（英文或中文）',
        maxResults: '返回结果数量，默认3，最大5',
      },
      examples: [
        {
          intent: '查找如何修改单位移动速度',
          parameters: { query: 'Red Alert 3 mod change unit speed XML' },
        },
      ],
    },
    {
      name: 'createUnit',
      description: '创建一个新单位。可以基于模板单位复制，也可以用内置模板。',
      parameters: {
        unitId: '新单位的 ID（英文标识符，如 SuperConscript）',
        templateUnit: '可选：要复制的模板单位 ID',
        displayName: '可选：显示名称',
        description: '可选：单位描述',
      },
      examples: [
        {
          intent: '创建超级动员兵',
          parameters: { unitId: 'SuperConscript', templateUnit: 'SovietConscript', displayName: '超级动员兵' },
        },
      ],
    },
    {
      name: 'fixBuildErrors',
      description:
        '诊断并自动修复 MOD 编译错误。会扫描项目、写入/重建 data/Mod.xml、结合知识库与联网资料。用户粘贴 BuildLog/ErrorLog 或要求「修复编译报错」时必须用此工具，禁止只给文字教程不操作文件。',
      parameters: {
        errorLog: '用户粘贴的完整编译报错（BuildLog/ErrorLog/退出码信息）',
        allowWebSearch: '可选，是否联网查解决方案，默认 true',
      },
      examples: [
        {
          intent: '修复缺少 mod.xml 的编译错误',
          parameters: {
            errorLog: '错误：缺少 data/mod.xml',
            allowWebSearch: true,
          },
        },
      ],
    },
    {
      name: 'createBuilding',
      description: '创建一个新建筑',
      parameters: {
        buildingId: '新建筑的 ID',
        template: '可选：模板建筑 ID',
        displayName: '可选：显示名称',
      },
      examples: [
        {
          intent: '创建超级兵营',
          parameters: { buildingId: 'SuperBarracks', displayName: '超级兵营' },
        },
      ],
    },
    {
      name: 'deleteProjectFile',
      description: '删除项目内文件（迁移清理重复 XML 时使用，勿删 data/Mod.xml）',
      parameters: { file: '相对路径' },
    },
    {
      name: 'moveProjectFile',
      description: '移动/重命名项目内文件',
      parameters: { from: '源相对路径', to: '目标相对路径' },
    },
    {
      name: 'rebuildModXmlInsurrection',
      description:
        '按标准 MOD 结构重建 data/Mod.xml 与阵营聚合（Allied.xml 等），Mod.xml 仅用 reference 引用原版三件套 + type=all 聚合。不转换单位分包。',
      parameters: { dryRun: '可选 true 仅预览' },
    },
    {
      name: 'planInsurrectionMigration',
      description: '生成标准 MOD 结构迁移计划（旧路径→新路径、待删重复文件），不修改磁盘',
      parameters: {},
    },
    {
      name: 'assessInsurrectionCompliance',
      description:
        '严格验收项目是否符合标准 MOD 结构（检查 Mod.xml reference/all、layoutProfile、重复路径）。未通过时禁止声称已整理完成。',
      parameters: {},
    },
    {
      name: 'migrateToInsurrectionStandard',
      description:
        '一键迁移：扫描→单位转分包→重建 Mod.xml/阵营聚合→清理 CommandData→删除重复文件→验收。用户要求「按标准 MOD 格式整理项目」时优先用此工具，不要手写零散 write。',
      parameters: { dryRun: '可选 true 仅预览计划' },
    },
    {
      name: 'refineInsurrectionLayout',
      description:
        '已分包项目：将 Data/ 改为 data/、建立二级阵营聚合（Allied.xml→Allied/Allied.xml）、同步 mod.babproj，不重新转换单位。',
      parameters: {},
    },
  ];
}

// ========== 2. System Prompt 构造 ==========
function buildSystemPrompt(
  toolDefs,
  knowledgeContext,
  allowSearch,
  projectContext = '',
  personalityPrompt = '',
  skillsContext = ''
) {
  const toolList = JSON.stringify(toolDefs, null, 2);
  let prompt = `你是 RA3 MOD 开发助手，既可以和用户自然对话，也可以操作项目里的 XML 文件。

${personalityPrompt ? personalityPrompt + '\n\n' : ''}

## 可用工具
${toolList}

## 输出格式（必须严格遵守，二选一）

### 格式A: 文本回复
仅用于纯聊天、打招呼、回答概念性问题：
{"response": "你的回复内容"}

### 格式B: 工具调用
用于所有涉及文件操作/信息查询的请求，工具按顺序执行：
[{"tool": "工具名", "args": {"参数名": "参数值"}}]

## ⛔ 格式选择硬规则（必须遵守）
- **闲聊/打招呼/测试对话**（如「你好」「能正常说话吗」）→ 必须用格式A简短回复，**禁止** scanProject、webSearch 及任何工具
- 仅当用户明确说「扫描全部/所有/整个…代码/项目/文件」等含全量范围词时 → 才用 scanProject；分析单个 .xml 用 readProjectFile，勿全项目扫描
- 用户的请求涉及以下动词 → 必须用格式B：修改、改、设置、增加、减少、创建、删除、添加、查看、打开、列出、查询、把、让
- **编译失败/粘贴 BuildLog/ErrorLog/修复编译报错** → 必须用 fixBuildErrors，**禁止**仅用格式A告诉用户「自己去建 mod.xml」
- 用户明确说「搜索/上网查/联网查」某话题 → 可用 webSearch；**不要因为用户抱怨「别乱搜」就去搜索**
- 即使你不确定单位ID，也要先调用 findUnitsByName 搜索项目内文件，而不是直接回复"我不知道"
- **绝对禁止**用格式A编造操作结果（如"操作已成功完成"）。如果你没有实际调用工具修改文件，就不能说"已完成"
- MOD 技术问题优先用知识库与项目内工具；仅当用户明确要求联网或项目内确实找不到时再 webSearch

## 规则
- 参数里的 file 都相对项目根目录
- 返回严格 JSON，不要加 markdown 标记、不要解释
- 单位ID大小写不敏感：mytank、MyTank、MYTANK 都指向同一个单位
- 用户问「项目里有哪些单位」「列出所有单位」→ 必须调用 listAllUnits 或 listAllUnitsDetailed，针对**当前打开的项目目录**，禁止联网搜索
- 用户要求「扫描全部/整个项目/所有文件」等全量扫描 → 才调用 scanProject（或用户已扫描时直接利用下方项目上下文）
- 新建/修改 XML：**默认标准 MOD 格式**（未扫描或未确认前一律标准格式）
- 用户**扫描并确认当前项目格式**后：才按扫描到的目录/引用写入；与首选项、对话按钮联动
- 用户**扫描项目**后：若发现 🔴 编译健康风险，须警告；确认「当前项目格式」前不得按本项目结构写文件
- **修复编译报错**：先分析根因（常见：Include 不在 Includes 内、WeaponSlot 写法错误；.manifest 是 builtmods 输出非源码）；用 fixBuildErrors 实际改文件，禁止只给教程
- **项目结构整理**：用 migrateToInsurrectionStandard；验收用 assessInsurrectionCompliance。未通过验收前禁止说「已完成结构整理」
- 新建单位：五阶段流程见 mod-development-workflow；Include 必须在 <Includes> 内；禁止极简 WeaponSlot 写法（用 WeaponSlotHardpoint 或继承官方单位包）
- **全新单位美术**：W3X/DDS 放 Art/Units/{显示名}/，Data 下单位目录写 W3X.xml（ART:Units/...）、Texture.xml、GameObject Draw；开火动画 ConditionsYes="FIRING_A" + *_ATK*，死亡 DYING DEATH_1 + *_DIE*，勿混淆；项目外素材由向导复制进 Mod；模板单位参考 SageXml（DATA:Soviet/Units/... instance Include）
- **回退代码**：用户说「回退/撤销/还原刚才的修改」时由 IDE 自动还原上一轮 AI 写操作（新建文件删除、已改文件恢复、已删文件恢复）；勿声称已回退 unless 系统已执行回退
- **单位 ID 命名**：必须为英文 PascalCase 意译+类型后缀（如「殉道者」→ MartyrInfantry，「超级动员兵」→ SuperConscriptInfantry）；禁止 CustomUnit+随机哈希
- 每个单位单独一个 XML 文件，禁止往已有单位文件里追加；盟军 Side 属性写 Allies
- 血量路径：<Body><ActiveBody MaxHealth="xxx"/></Body>
- 坦克蓝本 AlliedAntiVehicleVehicleTech1，苏联步兵 SovietAntiInfantryInfantry，帝国武士 JapanAntiInfantryInfantry，战熊 SovietScoutInfantry，多功能IFV AlliedAntiAirVehicleTech1
- **红警3原版单位**（非当前 MOD 文件）：查 knowledge-docs/vanilla-ra3-biligame-wiki.md；守护者=AlliedAntiVehicleVehicleTech1（单炮），勿与项目内乱命名文件混淆
- **换模型/双管/新外观**：先文字说明素材需求并等用户确认；禁止单管模型+双 WeaponSlot 冒充完成；用 createUnit 素材向导收集 W3X/动画/贴图
- 进阶：KindOf→kindof-advanced；武器→weapon-template-advanced；装甲/运动/Behaviors→armor-locomotor-behaviors
- 命令/技能→logic-command-specialpower；AI→globaldata-skirmish-ai；OCL/特效→ocl-fx-effects；升级→upgrades-tech-tree
- **XML 标签/属性/枚举/模块结构**：以 SDK \`Schemas/xsd\` 为准；与教程冲突时**以 XSD 为准**。写/改 XML 前**必须** lookupXsdSymbol → grepSdkXsd / readSdkXsd，禁止仅凭教程猜标签

${knowledgeContext ? `## 知识库参考\n${knowledgeContext}` : ''}

${skillsContext || ''}

${projectContext ? `## 当前会话项目上下文（含 XML 写入模式）\n${projectContext}\n` : '## 项目上下文：尚未扫描。写 XML 时**默认标准 MOD 格式**。用户可说「扫描当前项目」后选择格式。\n'}

${allowSearch ? '## 联网搜索：可用（默认不主动使用）。仅当用户明确要求「搜索/上网查」或你已调用 findUnitsByName 仍无法解决时，才用 webSearch。' : '## 联网搜索：已关闭。只能使用项目内搜索工具。'}
当前项目：${getCurrentFolder()}`;
  return prompt;
}

// ========== 3. 调用 LLM（统一走 llm-client，支持多模型与更大 token） ==========
const { callLLM: callLLMUnified } = require('./llm-client');

async function callLLM(messages, options = {}) {
  const profile = options.profile || (options.maxTokens <= 2000 ? 'summary' : 'agent');
  const maxTokens =
    options.maxTokens != null
      ? options.maxTokens
      : profile === 'summary'
        ? 1500
        : undefined;
  return callLLMUnified(messages, {
    ...options,
    profile,
    maxTokens,
    temperature: options.temperature != null ? options.temperature : profile === 'summary' ? 0.3 : 0.15,
  });
}

// ========== 4. 清洗 LLM 返回 ==========
function parsePlan(raw) {
  let cleaned = raw.replace(/```json/g, '').replace(/```/g, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === 'object' && parsed.response) {
      return { response: parsed.response };
    }
    return [];
  } catch {
    cleaned = cleaned.replace(/，/g, ',').replace(/：/g, ':').replace(/"/g, '"').replace(/"/g, '"');
    try {
      return JSON.parse(cleaned);
    } catch {
      return [];
    }
  }
}

// ========== 5. 提炼搜索结果（阶段5新增） ==========
async function digestSearchResults(userMessage, searchResults) {
  let context = '以下是从搜索到的资料：\n';
  searchResults.forEach((r, i) => {
    context += `\n[${i+1}] 标题：${r.title}\n`;
    // LLM 直接回答时用完整内容，否则用 snippet
    if (r.fullAnswer) {
      context += `完整回答：\n${r.fullAnswer}\n`;
    } else {
      context += `摘要：${r.snippet}\n来源：${r.url}\n`;
    }
  });
  context += `\n请根据以上资料，针对用户需求"${userMessage}"，生成一份简洁的操作方案。如果搜索结果不足以形成方案，请直接用自然语言回答用户的问题。`;

  const messages = [
    { role: 'system', content: '你是 RA3 MOD 专家，能从搜索资料中提取可执行的操作步骤。' },
    { role: 'user', content: context },
  ];

  try {
    const raw = await callLLM(messages);
    return raw.trim();
  } catch (err) {
    console.error('提炼搜索结果失败:', err.message);
    return '基于搜索结果无法自动生成方案。';
  }
}

// ========== 6. 规划主入口（集成搜索决策） ==========
// ========== 初始化：注入 LLM 调用函数到知识库 ==========
function initKnowledgeLLM() {
  setLLMCallFn(async (messages) => {
    return await callLLM(messages);
  });
}

// 首次调用 plan 时自动初始化
let knowledgeLLMInitialized = false;

// 操作型关键词：如果用户消息包含这些词，必须用格式B
const ACTION_KEYWORDS = ['修改', '改', '设置', '增加', '减少', '加', '减', '创建', '新建', '删除', '添加', '查', '搜索', '查找', '打开', '列出', '查看', '把', '让', '换成', '调', '调高', '调低', '提高', '降低', '帮忙', '帮', '搜', '找', '写', '加个', '造'];

function isActionRequest(message) {
  return ACTION_KEYWORDS.some(kw => message.includes(kw));
}

// "找不到"类关键词：LLM 返回格式A且包含这些词时，触发自动联网重试
const NOT_FOUND_KEYWORDS = ['找不到', '没有找到', '未找到', '没有结果', '无法找到', '不存在', '没搜到', '没有这个'];

function isNotFoundResponse(text) {
  return NOT_FOUND_KEYWORDS.some(kw => text.includes(kw));
}

async function plan(userMessage, options = {}) {
  const { forceSearch = false, allowSearch = true, history = [], projectContext = '', aiPersonality } = options;
  const { buildPersonalitySystemBlock, loadPreferences } = require('./agent-personality');
  const personalityPrompt = buildPersonalitySystemBlock(aiPersonality || loadPreferences().aiPersonality);

  // 懒初始化 LLM 注入
  if (!knowledgeLLMInitialized) {
    try { initKnowledgeLLM(); knowledgeLLMInitialized = true; } catch (e) {}
  }

  const toolDefs = getToolDefinitions();

  let knowledgeContext = '';
  const { isMutatingXmlIntent } = require('./xsd-search-policy');
  const needsXmlGuidance =
    isMutatingXmlIntent(userMessage) ||
    /扫描|项目结构|引用规范/i.test(userMessage);
  try {
    const kbQuery = needsXmlGuidance
      ? `标准MOD格式 Insurrection Mod.xml Include 引用规范 ${userMessage}`
      : userMessage;
    const { searchSimilarForContext } = require('./knowledge-base');
    const similarCases = await searchSimilarForContext(kbQuery, 'agent_plan', userMessage);
    console.log('[知识库命中] 数量:', similarCases.length);
    if (similarCases.length > 0) {
      console.log('[知识库命中] 第一条意图:', similarCases[0].intent);
      knowledgeContext = formatKnowledgeContextForAgent(similarCases, {
        maxChars: 720,
        query: kbQuery,
      });
      const hasPlan = similarCases.some((c) => c.plan && c.plan.length);
      if (hasPlan) {
        knowledgeContext +=
          '\n\n〖历史成功计划〗\n' +
          similarCases
            .filter((c) => c.plan && c.plan.length)
            .map((c, i) => `计划${i + 1}（${c.intent}）：${JSON.stringify(c.plan)}`)
            .join('\n');
      }
    }
  } catch (err) {
    console.error('[知识库] 检索异常:', err.message);
  }

  let skillsContext = '';
  try {
    const { buildSkillsPromptBlock } = require('./skill-registry');
    skillsContext = buildSkillsPromptBlock();
  } catch (err) {
    console.warn('[Skills] 注入失败:', err.message);
  }

  const systemPrompt = buildSystemPrompt(
    toolDefs,
    knowledgeContext,
    allowSearch,
    projectContext,
    personalityPrompt,
    skillsContext
  );
  const messages = [{ role: 'system', content: systemPrompt }];

  const trimCtx = (text, max = 1800) => {
    const s = String(text || '');
    return s.length > max ? s.slice(0, max) + '\n…（已截断）' : s;
  };

  if (Array.isArray(history)) {
    for (const m of history) {
      if (!m || !m.content) continue;
      if (m.role === 'assistant') {
        messages.push({ role: 'assistant', content: trimCtx(m.content) });
      } else if (m.role === 'user') {
        messages.push({ role: 'user', content: trimCtx(m.content) });
      }
    }
  }

  messages.push({ role: 'user', content: userMessage });

  if (forceSearch) {
    return [{ tool: 'webSearch', args: { query: userMessage, maxResults: 3 } }];
  }

  try {
    const raw = await callLLM(messages);
    return parsePlan(raw);
  } catch (err) {
    console.error('Planner 调用失败:', err.message);
    return [];
  }
}

// ========== 7. 执行后总结 ==========
async function summarizeExecution(log, userMessage, options = {}) {
  if (!log || log.length === 0) {
    return '操作已完成。';
  }
  const { buildPersonalitySystemBlock, loadPreferences, getFallbackReply } = require('./agent-personality');
  const styleId = options.aiPersonality || loadPreferences().aiPersonality;
  const personalityBlock = buildPersonalitySystemBlock(styleId);
  const summaryPrompt = `以下是一个 RA3 MOD 操作的执行日志，请用一句简洁的中文向用户总结操作结果和注意事项（不要技术细节，不要列表）。\n用户需求：${userMessage}\n执行日志：${JSON.stringify(log)}`;
  const systemContent = `你是 RA3 Mod IDE 助手。\n${personalityBlock}\n请按当前风格设置自然总结，技术事实须准确。`;
  try {
    const raw = await callLLM([{ role: 'system', content: systemContent }, { role: 'user', content: summaryPrompt }]);
    return raw.trim();
  } catch {
    return getFallbackReply('summary', styleId);
  }
}

// ========== 8. 处理搜索与提炼 ==========
async function handleWebSearchAndReplan(currentPlan, userMessage, tools) {
  const searchStep = currentPlan.find((s) => s.tool === 'webSearch');
  if (!searchStep) return { plan: currentPlan, searchAnswer: null };

  const searchResult = await tools.webSearch({
    ...searchStep.args,
    preferWeb: true,
  });

  if (!searchResult.success) {
    console.error('[搜索] 失败:', searchResult.error);
    return {
      plan: currentPlan.filter((s) => s.tool !== 'webSearch'),
      searchAnswer: `❌ 联网搜索失败: ${searchResult.error}`,
    };
  }

  const { results, displayText, usedRealWeb } = searchResult.data;
  console.log('[搜索] 完成, 真实网页:', usedRealWeb, '条数:', results.length);

  const digested = await digestSearchResults(userMessage, results);
  console.log('[搜索提炼] 方案长度:', digested.length);

  const newPlan = await plan(
    `用户原始需求：${userMessage}\n\n根据联网搜索到的资料，得到以下修改方案：\n${digested}\n\n请根据此方案生成具体的工具调用步骤（格式B JSON 数组），直接修改文件。`,
    { forceSearch: false, allowSearch: false }
  );

  if (Array.isArray(newPlan) && newPlan.length > 0 && !newPlan.response) {
    return { plan: newPlan, searchAnswer: null };
  }

  const { synthesizeAnswer } = require('./intelligent-search');
  let searchAnswer = digested;
  try {
    if (results && results.length > 0) {
      searchAnswer = await synthesizeAnswer(userMessage, results, []);
    }
  } catch (e) {
    searchAnswer = digested || displayText || '无法生成总结';
  }
  return {
    plan: currentPlan.filter((s) => s.tool !== 'webSearch'),
    searchAnswer,
  };
}

/** 直接执行联网搜索（不依赖 LLM 是否生成 webSearch 步骤） */
async function runDirectWebSearch(userMessage, tools) {
  const searchResult = await tools.webSearch({
    query: userMessage,
    maxResults: 5,
    preferWeb: true,
    forceWeb: true,
  });
  if (!searchResult.success) {
    return { success: false, error: searchResult.error };
  }
  const { results, displayText, usedRealWeb, actualQuery, searchEngine, isLowQuality } = searchResult.data;
  const toDigest = (results && results.length > 0) ? results : [];
  const digested = toDigest.length > 0
    ? await digestSearchResults(
        `${userMessage}\n（联网检索词：${actualQuery || userMessage}；引擎：${searchEngine || 'unknown'}）`,
        toDigest
      )
    : displayText;
  return {
    success: true,
    usedRealWeb,
    displayText,
    digested,
    results: toDigest,
    actualQuery,
    searchEngine,
    isLowQuality,
  };
}

/** 深度思考：生成内心独白（无 reasoning_content 时的兜底） */
async function generateInnerThinking(userMessage, contextHint = '') {
  const { isSubstantialThinking, generateFullInnerThinking } = require('./agent-deep-thinking');
  const thinkMessages = [
    {
      role: 'system',
      content: `你是 RA3 Mod IDE 助手的内心推理过程。必须输出 **3～5 句**完整中文「自言自语」（不得只有「嗯，」两个字）：
- 第一句以「嗯，」开头
- 说明你如何理解用户这句话、打算查什么/调什么工具/是否涉及引擎限制
- 不要输出最终给用户的完整答复，不要 Markdown 大标题，不要列表
${contextHint ? `\n背景：${contextHint}` : ''}`,
    },
    { role: 'user', content: userMessage },
  ];
  try {
    const raw = await callLLM(thinkMessages, { maxTokens: 400, temperature: 0.35 });
    const t = String(raw || '').trim();
    if (isSubstantialThinking(t)) return t;
  } catch (e) {
    /* fallback below */
  }
  const snippet = String(userMessage || '').trim().slice(0, 60);
  return (
    `嗯，用户说的是「${snippet}${userMessage && userMessage.length > 60 ? '…' : ''}」。` +
    (contextHint
      ? `${contextHint.slice(0, 120)} `
      : '我先理解意图与项目上下文，再决定查知识库、调工具或说明引擎边界。')
  );
}

// ========== 9. 闲聊 / 元对话（不联网、不调工具） ==========
async function respondCasually(userMessage, options = {}) {
  const { history = [], intent = 'casual' } = options;
  const { buildPersonalitySystemBlock, loadPreferences, getFallbackReply } = require('./agent-personality');
  const styleId = options.aiPersonality || loadPreferences().aiPersonality;
  const personalityPrompt = buildPersonalitySystemBlock(styleId);

  const trimCtx = (text, max = 1200) => {
    const s = String(text || '');
    return s.length > max ? s.slice(0, max) + '\n…' : s;
  };

  const behaviorHint =
    intent === 'meta_no_search'
      ? `用户在对助手行为提意见（例如不要乱联网）。请：
1. 明确承认：已改为默认不联网；只有用户说「搜索/上网查」或提出具体 MOD 开发任务时才查项目/联网
2. 不要执行 scanProject，不要附「参考来源」或「已联网」字样
3. 2～4 句，语气自然`
      : `用户在闲聊或打招呼。请：
1. 自然简短回复（1～3 句），可一句带过你能帮做 RA3 MOD（改单位属性、新建单位、查 XML）
2. 禁止提「正在搜索」「联网检索」；禁止 scanProject
3. 不要 Markdown 大标题，不要附参考链接`;

  const messages = [
    {
      role: 'system',
      content: `你是 RA3 Mod IDE 内置开发助手。\n${personalityPrompt}\n\n${behaviorHint}\n当前项目：${getCurrentFolder() || '（未打开）'}`,
    },
  ];

  if (Array.isArray(history)) {
    for (const m of history.slice(-8)) {
      if (!m?.content) continue;
      if (m.role === 'assistant' || m.role === 'user') {
        messages.push({ role: m.role, content: trimCtx(m.content, 800) });
      }
    }
  }
  messages.push({ role: 'user', content: userMessage });

  const thinkHint =
    intent === 'meta_no_search'
      ? '用户对助手行为提意见，不要联网或扫描项目。'
      : '用户在闲聊或打招呼，回复要简短自然。';

  if (options.deepThinking) {
    let content = '';
    const emitThinking = (t) => {
      const s = String(t || '').trim();
      if (s && typeof options.onThinking === 'function') options.onThinking(s);
    };

    if (typeof options.onThinking === 'function') {
      const { generateFullInnerThinking } = require('./agent-deep-thinking');
      const thinking = await generateFullInnerThinking(userMessage, thinkHint);
      emitThinking(thinking);
      try {
        content = (await callLLM(messages, { maxTokens: 400, temperature: 0.6 })).trim();
      } catch (err) {
        content = getFallbackReply(intent === 'meta_no_search' ? 'meta' : 'casual', styleId);
      }
      return { content, thinkingAlreadySent: true };
    }

    let thinking = '';
    try {
      const { chatCompletion } = require('./llm-client');
      const res = await chatCompletion(messages, { maxTokens: 400, temperature: 0.6 });
      thinking = String(res.reasoning_content || '').trim();
      content = String(res.content || '').trim();
    } catch (err) {
      content = getFallbackReply(intent === 'meta_no_search' ? 'meta' : 'casual', styleId);
    }
    if (!thinking || !require('./agent-deep-thinking').isSubstantialThinking(thinking)) {
      const { generateFullInnerThinking } = require('./agent-deep-thinking');
      thinking = await generateFullInnerThinking(userMessage, thinkHint);
    }
    if (!content) {
      try {
        content = (await callLLM(messages, { maxTokens: 400, temperature: 0.6 })).trim();
      } catch (err) {
        content = getFallbackReply(intent === 'meta_no_search' ? 'meta' : 'casual', styleId);
      }
    }
    return { thinking, content };
  }

  try {
    const raw = await callLLM(messages, { maxTokens: 400, temperature: 0.6 });
    return raw.trim();
  } catch (err) {
    return getFallbackReply(intent === 'meta_no_search' ? 'meta' : 'casual', styleId);
  }
}

/** 离线回答 MOD 知识问题（知识库 + LLM，不联网） */
async function respondOfflineKnowledge(userMessage, options = {}) {
  const { history = [] } = options;
  const { buildPersonalitySystemBlock, loadPreferences, getFallbackReply } = require('./agent-personality');
  const styleId = options.aiPersonality || loadPreferences().aiPersonality;
  const personalityPrompt = buildPersonalitySystemBlock(styleId);

  let knowledgeContext = '';
  try {
    const { searchSimilarForContext } = require('./knowledge-base');
    const hits = await searchSimilarForContext(userMessage, 'offline_answer', userMessage);
    if (hits.length > 0) {
      knowledgeContext = formatKnowledgeContextForAgent(hits, { maxChars: 500, query: userMessage });
    }
  } catch (e) {}

  let skillsContext = '';
  try {
    const { buildSkillsPromptBlock } = require('./skill-registry');
    skillsContext = buildSkillsPromptBlock();
  } catch (e) {}

  const messages = [
    {
      role: 'system',
      content: `你是 RA3 MOD 开发专家。\n${personalityPrompt}\n\n用中文直接回答问题，给出可操作的 XML 路径或步骤。
MOD XML 结构与属性以 SDK Schemas/xsd 为最高权威；知识库中带【SDK XSD 权威】的条目优先于教程。
不要编造已完成的文件操作。不要附「已联网」或网页参考来源（本次为离线回答）。
${knowledgeContext ? `## 知识库\n${knowledgeContext}` : ''}${skillsContext}`,
    },
  ];
  if (Array.isArray(history)) {
    for (const m of history.slice(-6)) {
      if (m?.role && m?.content) messages.push({ role: m.role, content: String(m.content).slice(0, 800) });
    }
  }
  messages.push({ role: 'user', content: userMessage });

  if (options.deepThinking) {
    let content = '';
    const emitThinking = (t) => {
      const s = String(t || '').trim();
      if (s && typeof options.onThinking === 'function') options.onThinking(s);
    };
    const thinkHint = '用户在询问 RA3 MOD 开发知识，需结合知识库离线作答。';

    if (typeof options.onThinking === 'function') {
      const { generateFullInnerThinking } = require('./agent-deep-thinking');
      const thinking = await generateFullInnerThinking(userMessage, thinkHint);
      emitThinking(thinking);
      try {
        content = (await callLLM(messages, { maxTokens: 1200, temperature: 0.35 })).trim();
      } catch (err) {
        content =
          getFallbackReply('casual', styleId) + '（API 暂不可用，请检查首选项中的 AI 配置。）';
      }
      return { content, thinkingAlreadySent: true };
    }

    let thinking = '';
    try {
      const { chatCompletion } = require('./llm-client');
      const res = await chatCompletion(messages, { maxTokens: 1200, temperature: 0.35 });
      thinking = String(res.reasoning_content || '').trim();
      content = String(res.content || '').trim();
    } catch (err) {
      content =
        getFallbackReply('casual', styleId) + '（API 暂不可用，请检查首选项中的 AI 配置。）';
    }
    if (!thinking || !require('./agent-deep-thinking').isSubstantialThinking(thinking)) {
      const { generateFullInnerThinking } = require('./agent-deep-thinking');
      thinking = await generateFullInnerThinking(userMessage, thinkHint);
    }
    if (!content) {
      try {
        content = (await callLLM(messages, { maxTokens: 1200, temperature: 0.35 })).trim();
      } catch (err) {
        content =
          getFallbackReply('casual', styleId) + '（API 暂不可用，请检查首选项中的 AI 配置。）';
      }
    }
    return { thinking, content };
  }

  try {
    return (await callLLM(messages, { maxTokens: 1200, temperature: 0.35 })).trim();
  } catch (err) {
    return getFallbackReply('casual', styleId) + '（API 暂不可用，请检查首选项中的 AI 配置。）';
  }
}

// ========== 导出 ==========
module.exports = {
  plan,
  getToolDefinitions,
  summarizeExecution,
  digestSearchResults,
  handleWebSearchAndReplan,
  runDirectWebSearch,
  callLLM,
  generateInnerThinking,
  respondCasually,
  respondOfflineKnowledge,
};
