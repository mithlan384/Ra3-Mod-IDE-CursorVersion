// main/skill-install-intent.js —— 从用户消息识别 Skill 安装意图

const { parseSkillhubSlug } = require('./skill-registry');

const INSTALL_VERBS = /安装|装上|添加|下载|引入|install/i;
const SKILL_WORD = /skill|技能包|技能/i;
const UNINSTALL_VERBS = /卸载|移除|删除|uninstall/i;

function extractUrls(text) {
  return [...String(text || '').matchAll(/https?:\/\/[^\s<>"']+/gi)].map((m) => m[0].replace(/[.,;:!?)]+$/, ''));
}

/**
 * @returns {{ action: 'install'|'uninstall', slug?: string, sourceUrl?: string, rawUrl?: string } | null}
 */
function parseSkillInstallRequest(message) {
  const msg = String(message || '').trim();
  if (!msg) return null;

  const urls = extractUrls(msg);
  for (const url of urls) {
    const parsed = parseSkillhubSlug(url);
    if (!parsed) continue;
    if (INSTALL_VERBS.test(msg)) {
      return { action: 'install', slug: parsed.slug, sourceUrl: parsed.sourceUrl, rawUrl: url };
    }
    if (SKILL_WORD.test(msg) && /帮我|请|给我|想要|要|这个|那个/.test(msg)) {
      return { action: 'install', slug: parsed.slug, sourceUrl: parsed.sourceUrl, rawUrl: url };
    }
  }

  if (INSTALL_VERBS.test(msg) && SKILL_WORD.test(msg)) {
    const slugMatch = msg.match(/skillhub\.cn\/skills\/([a-zA-Z0-9_-]+)/i);
    if (slugMatch) {
      return {
        action: 'install',
        slug: slugMatch[1],
        sourceUrl: `https://skillhub.cn/skills/${slugMatch[1]}`,
      };
    }
    const nameMatch = msg.match(/(?:安装|install)\s+([a-zA-Z0-9_-]+)/i);
    if (nameMatch) {
      return {
        action: 'install',
        slug: nameMatch[1],
        sourceUrl: `https://skillhub.cn/skills/${nameMatch[1]}`,
      };
    }
  }

  if (UNINSTALL_VERBS.test(msg) && SKILL_WORD.test(msg)) {
    const slugMatch = msg.match(/skillhub\.cn\/skills\/([a-zA-Z0-9_-]+)/i);
    if (slugMatch) return { action: 'uninstall', slug: slugMatch[1] };
    const idMatch = msg.match(/(?:卸载|移除|删除|uninstall)\s+([a-zA-Z0-9_-]+)/i);
    if (idMatch) return { action: 'uninstall', slug: idMatch[1] };
  }

  return null;
}

module.exports = { parseSkillInstallRequest };
