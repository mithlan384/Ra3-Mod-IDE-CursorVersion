// main/capability-boundary.js —— 检测 IDE/引擎无法完成的需求，返回原因与建议

const { getSageXmlRoot } = require('./vanilla-unit-loader');
const { getCurrentFolder } = require('./project-state');

/**
 * @typedef {object} CapabilityBoundaryResult
 * @property {boolean} blocked
 * @property {string} [category]
 * @property {string} [title]
 * @property {string} [reason]
 * @property {string[]} [suggestions]
 */

/** 是否与观战 / 遭遇战观看相关（需先科普，勿直接写 Observer MOD） */
function isSpectatorRelatedRequest(message) {
  const m = String(message || '');
  if (/观战机制|观战功能|观战模式|观察者模式|实时观战/i.test(m)) return true;
  if (
    /(观战|旁观|观察者|实时观看|实时看|看着别人|转播|OB\b|spectator|observer)/i.test(m) &&
    /(遭遇战|联机|多人|3v3|3\s*v\s*3|房间|skirmish|对战|比赛|战斗中)/i.test(m)
  ) {
    return true;
  }
  if (
    /(第\s*[七八]|[78])\s*位.{0,12}(观战|观察|玩家|槽位)/i.test(m) ||
    /(新建|创建|实现|做|加).{0,16}(观战|观察者|Observer)/i.test(m)
  ) {
    return true;
  }
  return false;
}

function buildSpectatorGuidanceResult() {
  return {
    blocked: true,
    category: 'spectator_not_mod',
    title: '观战需求：请先分清场景（多数不需要 MOD）',
    reason:
      '红色警戒 3 **遭遇战/联机一个房间最多 6 个玩家位**（真人 + AI 槽位合计），不是 8 人。\n\n' +
      '**① 你是 6 人之一，战败后继续看** — **原版已支持**，不需要 MOD。\n\n' +
      '**② 想实时看别人 3v3、自己不参战** — 房间仍只有 6 槽。常见做法是 **地图层面** 让红警3自带的 **PlyrCreeps**、**PlyrCivilian** 占 2 个战斗位，真人 4～5 人 + 1 人选 **观战位** 进房；靠 **地图 Player_Start / 遭遇战设置**，**不靠 MOD 写 Observer 单位**。\n\n' +
      '**③ 不要 Creeps/Civilian 占坑，又要额外真人实时看满员 3v3** — **MOD 数据层做不到** 稳定联机观战；可能需要 **回放/录像** 或 **改 exe 的外部插件**，超出本 IDE（仅 MOD XML/资源）。',
    suggestions: [
      '若属于 ①：直接在游戏里参战，战败后使用原版观战即可。',
      '若属于 ②：说明你要做的是「地图 + 系统 AI 占坑 + 观战位」，我可协助查地图 Player_Start，而不是新建 Observer 阵营 XML。',
      '若属于 ③：请考虑官方回放或社区观战工具；本 IDE 无法代做 exe 插件。',
      '知识库详见：knowledge-docs/ra3-spectator-and-multiplayer-slots.md',
    ],
  };
}

/** 能力边界场景的固定内心推理（保证深度思考区至少有完整 2～5 句，避免 LLM 只回「嗯，」） */
function buildBoundaryInnerThinking(userMessage, block) {
  const q = String(userMessage || '').trim().slice(0, 100);
  const cat = block?.category || 'boundary';
  if (cat === 'spectator_not_mod') {
    return (
      `嗯，用户在问「${q}」——这是观战/实时看遭遇战，不是新建单位。` +
      `我先对照三种情况：① 若他是六人之一，战败后继续看，原版就有，不用 MOD；` +
      `② 若他不下场、实时看别人 3v3，房间仍只有 6 槽，只能靠地图让 PlyrCreeps、PlyrCivilian 占两个战斗位，真人 4～5 人再加观战位，不靠 Observer XML；` +
      `③ 若不要这两个系统 AI 占坑又要第七个真人看满员 3v3，MOD 数据层做不到，只能提回放或外部插件。` +
      `下面用系统整理好的说明回复，不写假的 PlayerTemplate 教程。`
    );
  }
  if (cat === 'multiplayer_slots') {
    return (
      `嗯，用户想把遭遇战人数改到 8/9 人或加额外槽位。` +
      `红警 3 联机房间常规只有 6 个玩家位，改人数牵涉地图 Player_Start、遭遇战 UI 和引擎限制，单靠 MOD XML 不能稳定生效。` +
      `我会说明不能做什么，并建议地图/AI 位或子阵营等可行方向。`
    );
  }
  const title = block?.title || '该需求';
  return (
    `嗯，用户提到：「${q}」。这属于「${title}」，可能超出 IDE 能自动完成的 MOD 数据范围。` +
    `我先归纳引擎/工具边界，再给出 2～3 条可替代做法，避免假装已经改好项目文件。`
  );
}

function formatBoundaryMessage(result) {
  if (!result?.blocked) return '';
  const lines = [
    `## ${result.title || '无法按你的要求自动完成'}`,
    '',
    result.reason || '',
  ];
  if (result.suggestions?.length) {
    lines.push('', '**建议：**');
    for (const s of result.suggestions) lines.push(`- ${s}`);
  }
  return lines.join('\n');
}

/**
 * @param {string} message
 * @param {{ hasProject?: boolean }} [ctx]
 * @returns {CapabilityBoundaryResult}
 */
function detectUnsupportedRequest(message, ctx = {}) {
  const m = String(message || '');
  const hasProject = ctx.hasProject ?? !!getCurrentFolder();

  if (isSpectatorRelatedRequest(m)) {
    return buildSpectatorGuidanceResult();
  }

  if (
    /遭遇战.{0,16}(8|八|9|九|10|十)\s*人|联机.{0,12}(8|八|9|九)\s*人|(人数|玩家|槽位).{0,12}(8|八|9|九|10|十)/i.test(
      m
    ) ||
    (/遭遇战|联机|多人|skirmish/i.test(m) &&
      /(改成|改为|调到|设置).{0,8}(8|八|9|九|10|十)\s*人/i.test(m))
  ) {
    return {
      blocked: true,
      category: 'multiplayer_slots',
      title: '遭遇战人数超出引擎常规支持',
      reason:
        '红色警戒 3 遭遇战/联机 **一个房间最多 6 个玩家位**（不是 8 人）。MOD 的 XML 一般**不能单独把人数改成 8 人**就生效，还涉及地图 Player_Start、SkirmishSettings、界面与引擎硬编码。观战需求见 knowledge-docs/ra3-spectator-and-multiplayer-slots.md。',
      suggestions: [
        '若只想本地体验更多 AI，可查阅地图 `Player_Start` 与 `SkirmishAI`，在**单张地图**上尝试增加电脑位（不保证稳定）。',
        '修改 `MultiplayerSettings` 等全局表属于实验性改动，需自行编译并在游戏中验证，IDE 无法保证可玩。',
        '可改为 MOD 内增加新阵营子模板（PlayerTemplate）或新单位，这是 IDE 支持较好的方向。',
      ],
    };
  }

  if (
    /(新建|创建|增加|加入).{0,10}(第[四五六七八]|[4-9]|[十\d]+).{0,6}个?.{0,6}阵营/i.test(m) &&
    !/子阵营|PlayerTemplate|派系/i.test(m)
  ) {
    return {
      blocked: true,
      category: 'new_engine_faction',
      title: '无法新增「引擎级第五阵营」',
      reason:
        'RA3 引擎原生 Side **只有** Allies / Soviet / Japan / Neutral。`FactionType.xsd` 不允许自创 Side；强行改 XSD 易导致 UI 与战役严重异常。',
      suggestions: [
        '推荐做法：用 **PlayerTemplate 子阵营**（仍挂靠 Allies/Soviet/Japan）实现新派系，见 knowledge-docs/subfaction-player-template.md。',
        '独立国旗/生产栏 UI 需改 AptUI（.apt），并在 Mod.xml 注册 Additional 数据。',
        '可以说「新建一个叫 XX 的子阵营，挂靠苏联」，IDE 可协助规划 PlayerTemplate 与开局单位。',
      ],
    };
  }

  if (/(修改|破解|反编译|hook).{0,8}(游戏exe|主程序|ra3\.exe|引擎二进制)/i.test(m)) {
    return {
      blocked: true,
      category: 'exe_hack',
      title: '不支持修改游戏主程序',
      reason: 'RA3 IDE 仅面向 **MOD 数据**（XML/Art/CSF 等），不能也不应自动改游戏 exe 或注入代码。',
      suggestions: [
        '请通过官方 RA3 MOD SDK 编译 MOD，在游戏启动器中选择你的 MOD。',
        '玩法级需求请用 XML、GlobalData、PlayerTemplate 等在数据层实现。',
      ],
    };
  }

  if (/(帮我|请).{0,6}(下载|抓取|安装).{0,12}(模型|贴图|w3x|素材|资源包)/i.test(m)) {
    return {
      blocked: true,
      category: 'no_download',
      title: '无法代你下载外部素材',
      reason: 'IDE **没有**从互联网下载 W3X/贴图/音效到本地的能力；联网搜索仅用于查阅教程与资料摘要。',
      suggestions: [
        '请自行准备文件后，在对话中给出**完整路径**，或使用「开始素材向导」逐步选择文件。',
        '若只需沿用原版，请明确说「全部沿用原版素材」。',
      ],
    };
  }

  if (/(编译|运行|启动).{0,6}(游戏本体|原版exe)/i.test(m) && !/mod|模组|sdk/i.test(m)) {
    return {
      blocked: true,
      category: 'launch_game',
      title: '无法代替你启动原版游戏',
      reason: 'IDE 可调用 **RA3 MOD SDK** 编译当前 MOD（Ctrl+B），但不会启动 Steam 版游戏本体。',
      suggestions: [
        '编译成功后，在红色警戒 3 启动器的「MOD」页签中选择你的 MOD 进入游戏。',
        '在首选项中配置 SDK 路径后再编译。',
      ],
    };
  }

  if (!hasProject && /(改|修改|创建|新建|删除|扫描).{0,6}(项目|单位|xml|mod)/i.test(m)) {
    return {
      blocked: true,
      category: 'no_project',
      title: '需要先打开 MOD 项目',
      reason: '当前未打开 MOD 项目目录，无法读取或写入 `data/` 下的 XML。',
      suggestions: [
        '菜单 **文件 → 打开项目**，选择 `Mods\\你的MOD名` 目录。',
        '打开后再发送修改需求。',
      ],
    };
  }

  return { blocked: false };
}

/**
 * 单位找不到时的说明
 */
function formatUnitNotFoundBoundary(target, message) {
  const name = target?.displayName || target?.keyword || '该单位';
  const suggestions = [
    '请用更完整的名称，如「守护者坦克」「天启坦克」（原版天启 ID：SovietAntiVehicleVehicleTech3）。',
    '若单位只在原版中，请先在首选项配置 **RA3 MOD SDK** 路径，以便读取 SageXml。',
    '若需全新单位，请说「新建一个叫 XXX 的单位」。',
  ];
  if (!getSageXmlRoot()) {
    suggestions.unshift('在 **设置 → 首选项** 中配置 SDK 路径（含 SageXml 目录）。');
  }
  return formatBoundaryMessage({
    blocked: true,
    title: `未在项目中找到「${name}」`,
    reason:
      target?.reason === 'no_sdk'
        ? `项目内无匹配单位，且未配置 SDK，无法读取原版 SageXml 对照。`
        : `项目内无此单位的 GameObject 定义；也无法在 SageXml 中按当前关键词定位到原版文件。`,
    suggestions,
  });
}

module.exports = {
  detectUnsupportedRequest,
  formatBoundaryMessage,
  formatUnitNotFoundBoundary,
  isSpectatorRelatedRequest,
  buildSpectatorGuidanceResult,
  buildBoundaryInnerThinking,
};
