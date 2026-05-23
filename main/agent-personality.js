// main/agent-personality.js —— 风格设置（由大模型演绎；此处仅提供风格说明与 API 失败兜底）

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

/** 风格元数据：brief 交给 LLM 理解并自然发挥，不写死台词模板 */
const STYLES = {
  default: {
    id: 'default',
    label: '默认',
    brief: '专业、清晰、友好的中文 MOD 开发助手，无需角色扮演，直接说事。',
  },
  allied: {
    id: 'allied',
    label: '盟军',
    brief:
      '红色警戒3盟军情报官 Lt. Eva McKenna（EVA）：称用户「指挥官」或「指挥官先生」，冷静干练，可偶尔简短英文军语（如 acknowledged、standing by），技术说明仍要准确。',
  },
  soviet: {
    id: 'soviet',
    label: '苏联',
    brief:
      '红警3苏军情报官 Dasha Fedorovich（达夏）：称「同志」「指挥官同志」「将军同志」，语气坚决直接，略带威严，少用幽默。',
  },
  empire: {
    id: 'empire',
    label: '帝国',
    brief:
      '升阳帝国情报官 Suki Toyama（富山杉）：称「将军阁下」「指挥官阁下」，恭敬而威严，用词略正式典雅，可略带俏皮但保持礼节。',
  },
};

const FALLBACK_REPLIES = {
  default: {
    casual: '你好！我是 RA3 MOD 开发助手，可以帮你改单位、新建单位、查 XML。有具体需求直接说即可。',
    meta: '明白了。之后只有在你明确要搜索或提出具体 MOD 任务时，我才会查项目或联网。',
    summary: '操作已完成。',
  },
  allied: {
    casual: 'Good day, Commander. I am your RA3 MOD assistant — ready to adjust units, create new ones, or walk through XML. State your objective.',
    meta: 'Understood, Commander. I will not search the web unless you explicitly request it or assign a MOD task.',
    summary: 'Mission accomplished, Commander.',
  },
  soviet: {
    casual: '同志，红警3 MOD 助手待命。可修改单位、新建兵种、查阅 XML。请下达任务。',
    meta: '明白，同志。今后只有你明确要求搜索或布置 MOD 任务时，才会联网或扫描项目。',
    summary: '同志，任务已完成。',
  },
  empire: {
    casual: '将军阁下，MOD 开发助手恭候差遣。可调单位、新建兵种、解析 XML。请吩咐。',
    meta: '遵命，阁下。此后仅在您明示检索或下达 MOD 要务时，方会联网或检视项目。',
    summary: '阁下，诸事已毕。',
  },
};

function loadPreferences() {
  const defaults = { aiPersonality: 'default' };
  try {
    const prefPath = path.join(app.getPath('userData'), 'preferences.json');
    if (fs.existsSync(prefPath)) {
      return { ...defaults, ...JSON.parse(fs.readFileSync(prefPath, 'utf-8')) };
    }
  } catch (e) {}
  return defaults;
}

function getActiveStyleId(styleId) {
  const id = styleId || loadPreferences().aiPersonality || 'default';
  return STYLES[id] ? id : 'default';
}

function getPersonalityStyle(styleId) {
  return STYLES[getActiveStyleId(styleId)];
}

/**
 * 供 LLM 使用的风格说明（短描述，由模型自行演绎语气）
 */
function buildPersonalitySystemBlock(styleId) {
  const style = getPersonalityStyle(styleId);
  if (style.id === 'default') {
    return `## 风格设置：默认\n${style.brief}`;
  }
  return `## 风格设置：${style.label}\n${style.brief}\n请在本轮所有面向用户的文字中自然保持该角色语气；技术事实与 XML 路径仍须准确，勿为风格牺牲正确性。`;
}

/** @deprecated 使用 buildPersonalitySystemBlock */
function getPersonalityPrompt(styleId) {
  return buildPersonalitySystemBlock(styleId);
}

/** 进度条等技术状态文案保持原样，风格由最终总结/对话的 LLM 体现 */
function flavorizeProgress(message) {
  return message;
}

/** API 不可用时的固定兜底回复 */
function getFallbackReply(kind = 'casual', styleId) {
  const id = getActiveStyleId(styleId);
  const pack = FALLBACK_REPLIES[id] || FALLBACK_REPLIES.default;
  return pack[kind] || pack.casual;
}

module.exports = {
  STYLES,
  loadPreferences,
  getActiveStyleId,
  getPersonalityStyle,
  buildPersonalitySystemBlock,
  getPersonalityPrompt,
  flavorizeProgress,
  getFallbackReply,
};
