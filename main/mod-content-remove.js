// main/mod-content-remove.js —— 删除 MOD 内单位/文件（含聚合 Include 清理）

const fs = require('fs');
const path = require('path');
const { getCurrentFolder } = require('./project-state');
const { deleteProjectFile } = require('./insurrection-migrate');
const { writeProjectFile } = require('./agent-sense-tools');
const agentTools = require('./agent-tools');

const DELETE_VERBS =
  /(?:删除|删掉|删去|删了|移除|去掉|清除|清理|干掉|卸载|drop|remove|delete)/i;

const CREATE_VERBS = /(?:新建|创建|制作|添加|加个|造一个)/i;

function normalizeRel(rel) {
  return String(rel || '').replace(/\\/g, '/').replace(/^\/+/, '');
}

function looksLikeDeleteModIntent(message) {
  const m = String(message || '').trim();
  if (!m || m.length < 3) return false;
  if (CREATE_VERBS.test(m) && !DELETE_VERBS.test(m)) return false;
  if (/不要删|别删|勿删|不想删|禁止删/.test(m)) return false;
  return (
    DELETE_VERBS.test(m) &&
    (/(?:代码|文件|单位|xml|mod|配置|残留|相关内容|相关|守护者|坦克|双管|步兵|建筑)/i.test(m) ||
      /守护者|双管|Guardian|DualBarrel/i.test(m))
  );
}

function extractSearchTerms(message) {
  const m = String(message || '');
  const terms = new Set();

  const phrases = [
    /双管守护者/gi,
    /守护者坦克/gi,
    /守护者/gi,
    /双管/gi,
    /DualBarrelGuardian/gi,
    /DualBarrel/gi,
    /GuardianTank/gi,
    /Guardian/gi,
  ];
  for (const re of phrases) {
    const hit = m.match(re);
    if (hit) hit.forEach((t) => terms.add(t));
  }

  const quoted = m.match(/[「""]([^」""]+)[」""]/);
  if (quoted?.[1]) terms.add(quoted[1].trim());

  const afterVerb = m.match(
    /(?:删掉|删除|移除|清除|去掉|清理)\s*(?:与|关于)?\s*([^\s，,。；;]+(?:守护者|坦克|单位|代码|文件)?)/i
  );
  if (afterVerb?.[1]) {
    const chunk = afterVerb[1].replace(/相关(的)?(代码|文件|内容)?$/g, '').trim();
    if (chunk.length >= 2 && chunk.length <= 48) terms.add(chunk);
  }

  if (!terms.size && /守护者/.test(m)) terms.add('守护者');
  if (!terms.size && /双管/.test(m)) terms.add('双管');

  return [...terms].filter((t) => t && t.length >= 2);
}

function walkXmlFiles(root, out = []) {
  const skip = new Set(['.git', 'node_modules', 'builtmods', 'Compiled', '.ra3-ide']);
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      if (skip.has(ent.name)) continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) stack.push(full);
      else if (ent.name.toLowerCase().endsWith('.xml')) {
        out.push(full);
      }
    }
  }
  return out;
}

function fileMatchesTerms(rel, terms) {
  const lower = rel.toLowerCase();
  return terms.some((t) => {
    const tl = t.toLowerCase();
    return lower.includes(tl) || tl.includes('guardian') && lower.includes('dual');
  });
}

function contentMatchesTerms(content, terms) {
  const lower = content.toLowerCase();
  return terms.some((t) => lower.includes(t.toLowerCase()));
}

function collectUnitHits(root, terms) {
  const filesToDelete = new Set();
  const unitIds = new Set();

  for (const term of terms) {
    try {
      const res = agentTools.findUnitsByName({ keyword: term });
      if (!res?.success || !res.data) continue;
      for (const hit of res.data) {
        if (hit.file) filesToDelete.add(normalizeRel(hit.file));
        (hit.unitIds || []).forEach((id) => unitIds.add(id));
      }
    } catch (e) {
      console.warn('[mod-content-remove] findUnits:', e.message);
    }
  }

  const xmlFiles = walkXmlFiles(root);
  for (const full of xmlFiles) {
    const rel = normalizeRel(path.relative(root, full));
    if (fileMatchesTerms(rel, terms)) {
      filesToDelete.add(rel);
    }
    try {
      const text = fs.readFileSync(full, 'utf-8');
      if (contentMatchesTerms(text, terms)) {
        if (/<(?:GameObject|Unit)\b/i.test(text) || /id="[^"]+"/i.test(text)) {
          filesToDelete.add(rel);
        }
      }
    } catch (e) {}
  }

  for (const id of unitIds) {
    for (const full of xmlFiles) {
      const rel = normalizeRel(path.relative(root, full));
      try {
        const text = fs.readFileSync(full, 'utf-8');
        if (text.includes(`id="${id}"`)) filesToDelete.add(rel);
      } catch (e) {}
    }
  }

  return { filesToDelete: [...filesToDelete], unitIds: [...unitIds] };
}

function findAggregatorPatches(root, filesToDelete) {
  const patches = new Map();
  const xmlFiles = walkXmlFiles(root);
  const targets = filesToDelete.map((r) => normalizeRel(r));

  for (const full of xmlFiles) {
    const rel = normalizeRel(path.relative(root, full));
    if (targets.includes(rel)) continue;
    let content;
    try {
      content = fs.readFileSync(full, 'utf-8');
    } catch {
      continue;
    }
    if (!/<Include\b/i.test(content)) continue;

    let next = content;
    let removed = 0;
    for (const del of targets) {
      const base = path.basename(del);
      const folder = path.dirname(del).replace(/\\/g, '/');
      const patterns = [del, base, folder, base.replace(/\.xml$/i, '')];
      for (const p of patterns) {
        if (!p || p.length < 3) continue;
        const esc = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`\\s*<Include\\b[^>]*\\bsource="[^"]*${esc}[^"]*"[^>]*/>\\s*`, 'gi');
        const before = next;
        next = next.replace(re, '\n');
        if (next !== before) removed++;
      }
    }
    if (removed > 0 && next !== content) {
      patches.set(rel, { rel, content: next, removed });
    }
  }
  return [...patches.values()];
}

/**
 * @param {string} [projectRoot]
 * @param {string} [message]
 */
function planModContentRemoval(projectRoot, message) {
  const root = projectRoot || getCurrentFolder();
  if (!root) return { success: false, error: '请先打开 MOD 项目' };

  const terms = extractSearchTerms(message);
  if (!terms.length) {
    return { success: false, error: '未能从消息中解析要删除的对象，请说明单位名或文件名关键词。' };
  }

  const { filesToDelete, unitIds } = collectUnitHits(root, terms);
  const patches = findAggregatorPatches(root, filesToDelete);

  return {
    success: true,
    terms,
    filesToDelete,
    unitIds,
    patches,
    empty: filesToDelete.length === 0 && patches.length === 0,
  };
}

function formatDeletePlanPreview(plan) {
  if (!plan?.success) return plan?.error || '';
  const lines = [
    '#### 删除方案（确认后执行）',
    '',
    `- **搜索关键词**：${plan.terms.join('、')}`,
  ];
  if (plan.unitIds?.length) {
    lines.push(`- **匹配单位 ID**：${plan.unitIds.join(', ')}`);
  }
  if (plan.filesToDelete?.length) {
    lines.push('', `**将删除文件**（${plan.filesToDelete.length} 个）：`);
    for (const f of plan.filesToDelete.slice(0, 40)) lines.push(`- \`${f}\``);
    if (plan.filesToDelete.length > 40) {
      lines.push(`- … 另有 ${plan.filesToDelete.length - 40} 个`);
    }
  } else {
    lines.push('', '（未扫描到可删除的独立单位 XML 文件）');
  }
  if (plan.patches?.length) {
    lines.push('', `**将修改聚合/引用文件**（移除 Include，${plan.patches.length} 个）：`);
    for (const p of plan.patches.slice(0, 30)) {
      lines.push(`- \`${p.rel}\`（约 ${p.removed} 处引用）`);
    }
  }
  lines.push('', '> 不会删除 data/Mod.xml；删除后可在文件树刷新查看。');
  return lines.join('\n');
}

async function executeModContentRemoval(projectRoot, message, options = {}) {
  const onProgress = options.onProgress || (() => {});
  const plan = planModContentRemoval(projectRoot, message);
  if (!plan.success) return { success: false, error: plan.error };
  if (plan.empty) {
    return {
      success: false,
      error: `未找到与「${plan.terms.join('、')}」匹配的项目文件。可尝试说明具体单位 ID 或文件路径。`,
      data: { terms: plan.terms },
    };
  }

  const changedFiles = [];
  const errors = [];

  onProgress(`🗑 将删除 ${plan.filesToDelete.length} 个文件，并清理 ${plan.patches.length} 个聚合引用…`);

  for (const rel of plan.filesToDelete) {
    try {
      const res = deleteProjectFile(projectRoot, rel);
      if (res.success) {
        changedFiles.push(rel);
        onProgress(`   ✓ 已删除 \`${rel}\``);
      } else {
        errors.push({ rel, error: res.error });
      }
    } catch (e) {
      errors.push({ rel, error: e.message });
    }
  }

  for (const patch of plan.patches) {
    try {
      const res = await writeProjectFile({ file: patch.rel, content: patch.content }, { onProgress });
      if (res.success) {
        changedFiles.push(patch.rel);
        onProgress(`   ✓ 已清理 \`${patch.rel}\` 中的 Include`);
      } else {
        errors.push({ rel: patch.rel, error: res.error });
      }
    } catch (e) {
      errors.push({ rel: patch.rel, error: e.message });
    }
  }

  let report = `## 删除完成\n\n`;
  report += `- **关键词**：${plan.terms.join('、')}\n`;
  if (changedFiles.length) {
    report += `- **已处理 ${changedFiles.length} 个文件**：\n${changedFiles.map((f) => `  - \`${f}\``).join('\n')}\n`;
  }
  if (errors.length) {
    report += `- ⚠️ **部分失败**：${errors.map((e) => e.rel).join(', ')}\n`;
  }
  if (!changedFiles.length) {
    report += `- 未成功修改任何文件。\n`;
  }

  return {
    success: changedFiles.length > 0,
    report,
    changedFiles,
    errors,
    data: { terms: plan.terms, deleted: plan.filesToDelete, patches: plan.patches.map((p) => p.rel) },
  };
}

module.exports = {
  looksLikeDeleteModIntent,
  extractSearchTerms,
  planModContentRemoval,
  formatDeletePlanPreview,
  executeModContentRemoval,
};
