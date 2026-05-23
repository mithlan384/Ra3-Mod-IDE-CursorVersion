// main/agent-context.js —— Agent 上下文包

const { getCurrentFolder } = require('./project-state');
const { searchSimilar } = require('./knowledge-base');

function trimText(text, max = 4000) {
  const s = String(text || '');
  return s.length > max ? s.slice(0, max) + '\n…（已截断）' : s;
}

function extractBuildLogFromMessage(message) {
  const m = String(message || '');
  if (!/BuildLog|ErrorLog|BinaryAssetBuilder|mod\.manifest|编译|BAE/i.test(m)) return '';
  if (m.length < 80) return '';
  return m;
}

async function fetchKnowledgeContext(userMessage) {
  const queries = [userMessage];
  if (/(创建|新建|单位|gameobject)/i.test(userMessage)) {
    queries.push('标准MOD格式 Mod.xml Include 单位创建 mod-development-workflow');
  }
  if (/(守护者|维和|天启|铁锤|海啸|帝国武士|标枪|动员兵|原版|红警3|单位ID|AlliedAnti|SovietAnti|Japan)/i.test(
    userMessage
  )) {
    queries.push('vanilla-ra3-biligame-wiki unit-id-reference 原版单位');
  }
  if (/(双管|换模型|新模型|炮塔|外观|素材|W3X|动画)/i.test(userMessage)) {
    queries.push('w3x-model-practical-guide unit-asset 素材向导 全新单位美术');
  }
  if (/(编译|报错|BuildLog|ErrorLog|修复)/i.test(userMessage)) {
    queries.push('编译错误 Include WeaponSlot Mod.xml 修复');
  }

  const seen = new Set();
  const chunks = [];
  for (const q of queries) {
    try {
      const { searchSimilarForContext } = require('./knowledge-base');
      const hits = await searchSimilarForContext(q, 'agent_context', q);
      for (const h of hits) {
        const key = h.intent || h.id || JSON.stringify(h).slice(0, 40);
        if (seen.has(key)) continue;
        seen.add(key);
        const body = [h.intent, h.summary, h.content].filter(Boolean).join('\n');
        if (body) chunks.push(trimText(body, 1200));
      }
    } catch (e) {
      console.warn('[agent-context] KB:', e.message);
    }
  }
  return chunks.length ? chunks.join('\n\n---\n\n') : '';
}

async function buildContextBundle(options = {}) {
  const {
    userMessage = '',
    projectContext = '',
    history = [],
    editorHint = null,
  } = options;

  const root = getCurrentFolder();
  const buildLog = extractBuildLogFromMessage(userMessage);
  const knowledge = await fetchKnowledgeContext(userMessage);

  let historyBlock = '';
  if (Array.isArray(history) && history.length) {
    historyBlock = history
      .slice(-8)
      .map((m) => `${m.role === 'assistant' ? '助手' : '用户'}: ${trimText(m.content, 1200)}`)
      .join('\n');
  }

  const parts = [];
  if (root) parts.push(`当前项目目录: ${root}`);
  if (projectContext) parts.push(`## 项目扫描上下文\n${trimText(projectContext, 6000)}`);
  if (knowledge) parts.push(`## 知识库参考\n${knowledge}`);
  if (buildLog) parts.push(`## 用户附带的编译日志\n${trimText(buildLog, 8000)}`);
  if (editorHint) parts.push(`## 编辑器\n${editorHint}`);
  if (historyBlock) parts.push(`## 近期对话\n${historyBlock}`);

  return {
    systemAppendix: parts.join('\n\n'),
    projectRoot: root,
    hasBuildLog: !!buildLog,
  };
}

module.exports = { buildContextBundle, trimText, extractBuildLogFromMessage };
