/**
 * 清理 B站红警3百科抓取文本：去掉站务/导航/页脚，保留单位与机制正文并格式化。
 */

const fs = require('fs');
const path = require('path');

/** 中文名 → SageXml unitId（与 vanilla-ra3-biligame-wiki.md 一致） */
const UNIT_ID_BY_CN = {
  战熊: 'SovietScoutInfantry',
  警犬: 'AlliedScoutInfantry',
  爆裂机械人: 'JapanScoutInfantry',
  爆裂机器人: 'JapanScoutInfantry',
  维和步兵: 'AlliedAntiInfantryInfantry',
  标枪兵: 'AlliedAntiVehicleInfantry',
  守护者坦克: 'AlliedAntiVehicleVehicleTech1',
  多功能步兵战车: 'AlliedAntiAirVehicleTech1',
  多功能步兵战斗车: 'AlliedAntiAirVehicleTech1',
  铁锤坦克: 'SovietAntiVehicleVehicleTech1',
  天启坦克: 'SovietAntiVehicleVehicleTech3',
  海啸坦克: 'JapanAntiVehicleVehicleTech1',
  帝国武士: 'JapanAntiInfantryInfantry',
  谭雅: 'AlliedCommandoTech1',
  娜塔莎: 'SovietCommandoTech1',
  恐怖机器人: 'SovietScoutVehicle',
  恐怖机械人: 'SovietScoutVehicle',
};

const SECTION_H2 = new Set([
  '单位数据',
  '基础数据',
  '武器数据',
  '护甲数据',
  '介绍视频',
  '背景故事',
  '历史资料',
  '战场笔记',
  '使用技巧',
  '指挥官笔记',
  '单位台词',
  '其他阵营同类型单位',
  '武器参数',
  '武器类型',
  '目录',
  '主建筑护甲',
  '围墙建筑护甲',
  '基础防御建筑护甲',
  '先进防御建筑护甲',
  '起义时刻特殊单位',
  '战役单位',
]);

const CONTENT_ANCHORS = [
  '单位数据',
  '武器参数',
  '武器类型',
  '主建筑护甲',
  '起义时刻特殊单位',
  '经验值问题',
  '维修站',
  '应变状态',
  'CD-key',
  'RA3DIY',
];

const LIST_H3 = new Set(['步兵', '载具', '飞行器', '舰船', '起义时刻单位', '建筑']);

const NOISE_LINE =
  /^(Created with Sketch|页面数|我的消息|关于本站|游戏游玩|游戏单位图鉴|游戏资讯|游戏知识|地图&MOD|相关网站|导航$|WIKI功能|阅读$|查看源代码|查看历史|浏览属性|页面贡献者|刷$|历$|编$|跳到导航|跳到搜索|\+关注|MediaWiki:|Welcome Back|按右上角|本WIKI由|本站单位与协议|欢迎加入|如发现相关|全站通知|来自红警3WIKI|更新日期|最新编辑|阅读：|编 刷 历|游戏中心|帐号安全|找回密码|家长监控|用户协议|抵制不良|芜湖享游|皖网文|沪公网安备|此页面最后编辑|此页面已被访问|配置菜单|配置css|配置js|配置整站|所有模板|随机页面|模板使用|编辑帮助|最近更改|文件列表|-->|\* 游戏游玩|\* 游戏单位|\* 地图&MOD|\* 相关网站|\* 导航)/;

const NOISE_CONTAINS =
  /红警3WIKI_BWIKI|哔哩哔哩|陵点捌伍|851351730|Bwiki群|Sketch\.png|icons\/|\.png\)|刷•阅•编•历|Red Alert 3 Wiki|游戏图鉴|建筑图鉴|协议图鉴|主建筑|防御建筑|起义时刻建筑/;

function isNoiseLine(line) {
  const t = line.trim();
  if (!t) return false;
  if (NOISE_LINE.test(t)) return true;
  if (NOISE_CONTAINS.test(t)) return true;
  if (/^[\s\t]+$/.test(line)) return false;
  if (/^[\*\-]\s*(游戏游玩|建筑|部队|协议)/.test(t)) return true;
  return false;
}

function findContentStart(lines, title) {
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim().replace(/^#+\s*/, '');
    if (CONTENT_ANCHORS.some((a) => t === a || t.startsWith(a))) return i;
    if (t === '单位数据') return i;
  }
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() !== '目录') continue;
    for (let j = i + 1; j < Math.min(i + 80, lines.length); j++) {
      const t = lines[j].trim();
      if (t === '单位数据' || LIST_H3.has(t) || SECTION_H2.has(t) || t === '武器参数') return j;
    }
  }
  const crumbChild = new RegExp(`首页\\s*>\\s*[^\\n]+>\\s*${escapeReg(title)}\\s*$`);
  const crumbSelf = new RegExp(`首页\\s*>\\s*${escapeReg(title)}\\s*$`);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!crumbChild.test(line) && !crumbSelf.test(line)) continue;
    for (let j = i + 1; j < Math.min(i + 80, lines.length); j++) {
      const t = lines[j].trim();
      if (t === '单位数据' || t === '目录' || LIST_H3.has(t) || SECTION_H2.has(t) || t === '武器参数') {
        return j;
      }
      if (t.length >= 24 && !isNoiseLine(t) && !/^[\d\.]+\s/.test(t)) return j;
    }
  }
  return -1;
}

function findContentEnd(text) {
  const patterns = [
    /\n刷•阅•编•历/,
    /\n取自[「"']https:\/\/wiki/,
    /\n## 本页链接/,
    /\n游戏中心\s*\|/,
    /\n如果你在寻找盟军建筑/,
    /\n其他阵营的建筑与单位导航链接/,
  ];
  let end = text.length;
  for (const re of patterns) {
    const m = text.match(re);
    if (m && m.index < end) end = m.index;
  }
  return end;
}

function escapeReg(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 将「键 | 值 |」碎片整理为 markdown 表格 */
const DAMAGE_TYPE_HEADERS = new Set([
  '肉搏', '狙击', '枪弹', '机炮', '破片', '火箭', '穿甲', '光谱', '电击',
  '高爆', '榴弹', '鱼雷', '冲击', '毒素', '魔法', '辐射',
]);

function flushPipeBuffer(buffer, out) {
  const cells = [];
  for (const line of buffer) {
    line.split('|').forEach((p) => {
      const c = p.trim();
      if (c) cells.push(c);
    });
  }
  if (cells.length < 2) return;

  const headerHits = cells.filter((c) => DAMAGE_TYPE_HEADERS.has(c)).length;
  if (headerHits >= 4) {
    out.push(`| ${cells.join(' | ')} |`);
    out.push(`| ${cells.map(() => '---').join(' | ')} |`);
    out.push('');
    return;
  }

  const allPct = cells.every((c) => /^\d+(\.\d+)?%$/.test(c));
  if (allPct && cells.length >= 4) {
    const cols = cells.length;
    if (out.length >= 2 && out[out.length - 1] === '' && out[out.length - 2].startsWith('| ---')) {
      out.pop();
      out.pop();
      const headerLine = out.pop();
      const headers = headerLine.split('|').map((s) => s.trim()).filter(Boolean);
      if (headers.length === cols) {
        out.push(headerLine);
        out.push(`| ${cells.map(() => '---').join(' | ')} |`);
        out.push(`| ${cells.join(' | ')} |`);
        out.push('');
        return;
      }
      out.push(headerLine);
      out.push(`| ${cells.map(() => '---').join(' | ')} |`);
    }
    out.push(`| ${cells.join(' | ')} |`);
    out.push('');
    return;
  }

  const pairs = [];
  for (let i = 0; i + 1 < cells.length; i += 2) pairs.push([cells[i], cells[i + 1]]);
  if (!pairs.length) return;
  out.push('| 属性 | 数值 |', '| --- | --- |');
  for (const [k, v] of pairs) out.push(`| ${k} | ${v} |`);
  out.push('');
}

function formatBody(raw, title) {
  const lines = raw.split('\n');
  const out = [];
  let pipeBuf = [];
  let inListSection = false;

  const flushPipe = () => {
    if (pipeBuf.length) {
      flushPipeBuffer(pipeBuf, out);
      pipeBuf = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line) {
      flushPipe();
      continue;
    }
    if (isNoiseLine(line)) continue;
    if (/^MediaWiki:/.test(line)) continue;
    if (/^Welcome Back/.test(line)) continue;
    if (/^Ciallo/.test(line)) continue;
    if (/^\d+\s+(单位数据|介绍视频|背景故事|步兵|载具|武器参数)/.test(line)) continue;

    if (SECTION_H2.has(line)) {
      flushPipe();
      inListSection = line === '目录';
      out.push('', `## ${line}`, '');
      continue;
    }

    if (LIST_H3.has(line)) {
      flushPipe();
      inListSection = true;
      out.push('', `### ${line}`, '');
      continue;
    }

    if (line.includes('|') && !line.startsWith('|')) {
      pipeBuf.push(line);
      continue;
    }

    flushPipe();

    if (inListSection && line.length <= 20 && !line.includes('|') && !SECTION_H2.has(line)) {
      if (!line.startsWith('- ')) out.push(`- ${line}`);
      continue;
    }

    if (/^技能[：:]/.test(line) || /^定位[：:]/.test(line) || /^设计用途/.test(line)) {
      out.push(line);
      continue;
    }

    if (/^造成下列伤害的单位有/.test(line)) {
      out.push('', `## ${line}`, '');
      continue;
    }

    // 护甲矩阵页：伤害类型是表头，不能拆成 ### 小节
    if (/^(肉搏|狙击|枪弹|机炮|破片|火箭|穿甲|光谱|电击|高爆|榴弹|鱼雷|冲击|魔法|毒素|辐射)$/.test(line)) {
      continue;
    }

    if (/护甲$|Armor/i.test(line) && line.length < 40) {
      flushPipe();
      out.push('', `## ${line.replace(/^#+\s*/, '')}`, '');
      continue;
    }

    if (line.length > 2) out.push(line);
  }
  flushPipe();
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function extractArticleBody(fullText, title) {
  const lines = fullText.split('\n');
  const start = findContentStart(lines, title);
  if (start < 0) return '';
  let slice = lines.slice(start).join('\n');
  const end = findContentEnd(slice);
  slice = slice.slice(0, end);
  return formatBody(slice, title);
}

function parseHeader(existing) {
  const lines = existing.split('\n');
  const titleMatch = lines[0].match(/^#\s+(.+)/);
  const title = titleMatch ? titleMatch[1].trim() : '';
  const meta = [];
  for (let i = 1; i < Math.min(8, lines.length); i++) {
    if (lines[i].startsWith('>')) meta.push(lines[i]);
    else if (lines[i].trim() === '') break;
    else break;
  }
  return { title, meta };
}

/**
 * @param {string} fileContent - 整文件内容
 * @param {{ title?: string, sourceUrl?: string }} [opts]
 */
function cleanBiligameWikiMarkdown(fileContent, opts = {}) {
  const { title: optTitle, sourceUrl } = opts;
  const { title: hTitle, meta } = parseHeader(fileContent);
  const title = optTitle || hTitle || '未知';
  const body = extractArticleBody(fileContent, title);
  if (!body) return null;

  const unitId = UNIT_ID_BY_CN[title];
  const header = [
    `# ${title}`,
    '',
    ...(meta.length ? meta : [`> 来源：[红警3 B站百科](${sourceUrl || 'https://wiki.biligame.com/redalert3/' + encodeURIComponent(title)})`]),
    ...(unitId ? [`> **unitId**：\`${unitId}\`（SageXml 原版，见 vanilla-ra3-biligame-wiki.md）`] : []),
    `> 整理时间：${new Date().toISOString().slice(0, 10)}`,
    '',
  ];

  return `${header.join('\n')}${body}\n`;
}

function isAlreadyCleaned(content) {
  return /> 整理时间：/.test(content) && !/Created with Sketch/.test(content);
}

function cleanFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const baseTitle = path.basename(filePath, '.md');
  const { title: hTitle } = parseHeader(raw);
  const title = baseTitle || hTitle;
  if (isAlreadyCleaned(raw)) {
    return { ok: true, title, chars: raw.length, skipped: true };
  }
  const cleaned = cleanBiligameWikiMarkdown(raw, { title });
  if (!cleaned) return { ok: false, title, reason: 'no_content' };
  fs.writeFileSync(filePath, cleaned, 'utf8');
  return { ok: true, title, chars: cleaned.length };
}

function cleanAllInDir(dir) {
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
  return files.map((f) => cleanFile(path.join(dir, f)));
}

module.exports = {
  cleanBiligameWikiMarkdown,
  cleanFile,
  cleanAllInDir,
  UNIT_ID_BY_CN,
};
