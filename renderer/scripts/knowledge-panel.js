// renderer/scripts/knowledge-panel.js

let allEntries = [];
let filteredEntries = [];
let activeCategory = 'all';
let installedSkills = [];
/** 列表一次最多渲染条数，避免 XSD 900+ 卡死面板 */
const MAX_RENDER_ENTRIES = 120;

const CATEGORY_LABELS = {
  all: '全部',
  xsd: '📐 XSD 权威',
  doc: '📘 预置教程',
  sdk: '📦 SDK 参考',
  learned: '💡 学习记录',
  skills: '🧩 Skill',
};

async function init() {
  if (typeof AppTheme !== 'undefined') {
    await AppTheme.initAppThemeFromPreferences();
    AppTheme.wirePreferencesListener();
  }
  const statsEl = document.getElementById('stats');
  const listEl = document.getElementById('knowledge-list');
  statsEl.textContent = '加载中...';
  listEl.innerHTML = '<div class="empty-state"><p>加载中...</p></div>';

  if (!window.api || !window.api.knowledge) {
    statsEl.textContent = 'API 未加载';
    listEl.innerHTML = '<div class="empty-state"><p>知识库 API 不可用，请从主窗口打开。</p></div>';
    return;
  }

  setupCategoryTabs();
  document.getElementById('search-input').addEventListener('input', (e) => filterEntries(e.target.value));
  document.getElementById('import-btn').addEventListener('click', importKnowledge);
  document.getElementById('export-btn').addEventListener('click', exportKnowledge);
  document.getElementById('clear-btn').addEventListener('click', clearAll);
  document.getElementById('rebuild-btn').addEventListener('click', rebuildIndex);

  const skillInstallBtn = document.getElementById('skill-install-btn');
  if (skillInstallBtn) {
    skillInstallBtn.addEventListener('click', pickAndInstallSkill);
  }

  try {
    await loadEntries();
    await loadStats();
    await loadSkills();
  } catch (err) {
    console.error('初始化失败:', err);
    statsEl.textContent = '加载失败';
    listEl.innerHTML = `<div class="empty-state"><p>加载失败: ${escapeHtml(err.message)}</p></div>`;
  }
}

function setupCategoryTabs() {
  const bar = document.getElementById('category-bar');
  if (!bar) return;
  bar.innerHTML = '';
  Object.entries(CATEGORY_LABELS).forEach(([key, label]) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className =
      'app-btn app-btn--pill kb-tab' + (key === activeCategory ? ' active' : '');
    btn.textContent = label;
    btn.dataset.category = key;
    btn.addEventListener('click', () => {
      activeCategory = key;
      bar.querySelectorAll('.kb-tab').forEach((t) => t.classList.remove('active'));
      btn.classList.add('active');
      updatePanelMode();
      if (activeCategory === 'skills') {
        loadSkills();
      } else {
        filterEntries(document.getElementById('search-input').value);
      }
    });
    bar.appendChild(btn);
  });
  updatePanelMode();
}

function updatePanelMode() {
  const isSkills = activeCategory === 'skills';
  const searchBar = document.getElementById('kb-search-bar');
  const skillToolbar = document.getElementById('skill-toolbar');
  const headerActions = document.querySelector('.kb-header-actions');
  if (searchBar) searchBar.classList.toggle('hidden', isSkills);
  if (skillToolbar) skillToolbar.classList.toggle('hidden', !isSkills);
  if (headerActions) headerActions.style.display = isSkills ? 'none' : '';
}

async function loadSkills() {
  if (!window.api?.skills?.list) {
    installedSkills = [];
    renderSkillList([]);
    return;
  }
  const res = await window.api.skills.list();
  installedSkills = res.success ? res.skills || [] : [];
  const enabled = installedSkills.filter((s) => s.enabled).length;
  document.getElementById('stats').textContent =
    `已安装 ${installedSkills.length} 个 · 已启用 ${enabled} 个`;
  renderSkillList(installedSkills);
}

function renderSkillList(skills) {
  const container = document.getElementById('knowledge-list');
  if (!skills || skills.length === 0) {
    container.innerHTML =
      '<div class="empty-state"><p>🧩 尚未安装 Skill</p><p>点击上方「安装 Skill」选择 zip 或解压后的文件夹；或在 AI 对话中发送 SkillHub 链接请求安装。</p></div>';
    return;
  }

  container.innerHTML = '';
  skills.forEach((sk) => {
    const div = document.createElement('div');
    div.className = 'kb-card kb-skill-card';
    const sourceLabel =
      sk.source === 'skillhub'
        ? 'SkillHub'
        : sk.source === 'local'
          ? '本地'
          : sk.source || '';
    const ver = sk.version ? `v${sk.version}` : '';
    const urlLine = sk.sourceUrl
      ? `<div class="skill-url"><a href="#" data-url="${escapeHtml(sk.sourceUrl)}">${escapeHtml(sk.sourceUrl)}</a></div>`
      : '';

    div.innerHTML = `
      <div class="meta">
        <span class="badge badge-skill">Skill</span>
        <span class="timestamp">${escapeHtml(sourceLabel)} ${escapeHtml(ver)} · ${formatTimestamp(sk.installedAt)}</span>
      </div>
      <div class="intent">${escapeHtml(sk.displayName || sk.id)}</div>
      <div class="summary skill-desc">${escapeHtml(sk.description || '（无描述）')}</div>
      <div class="skill-id">ID: <code>${escapeHtml(sk.id)}</code></div>
      ${urlLine}
      <div class="skill-actions">
        <label class="skill-toggle">
          <input type="checkbox" data-id="${escapeHtml(sk.id)}" ${sk.enabled ? 'checked' : ''} />
          启用（注入 AI 对话）
        </label>
        <button type="button" class="app-btn app-btn--danger skill-uninstall" data-id="${escapeHtml(sk.id)}">卸载</button>
      </div>
    `;

    const toggle = div.querySelector('input[type="checkbox"]');
    toggle.addEventListener('change', async () => {
      try {
        await window.api.skills.setEnabled(sk.id, toggle.checked);
        sk.enabled = toggle.checked;
        await loadSkills();
      } catch (e) {
        alert('更新失败: ' + e.message);
        toggle.checked = !toggle.checked;
      }
    });

    div.querySelector('.skill-uninstall').addEventListener('click', () => uninstallSkill(sk.id, sk.displayName || sk.id));

    const link = div.querySelector('.skill-url a');
    if (link) {
      link.addEventListener('click', (e) => {
        e.preventDefault();
      });
    }

    container.appendChild(div);
  });
}

async function pickAndInstallSkill() {
  const btn = document.getElementById('skill-install-btn');
  if (!window.api?.skills?.pickAndInstall) {
    alert('Skill API 不可用');
    return;
  }
  btn.disabled = true;
  btn.textContent = '安装中…';
  try {
    const res = await window.api.skills.pickAndInstall();
    if (res.canceled) return;
    if (!res.success) {
      alert('安装失败: ' + (res.error || '未知错误'));
      return;
    }
    activeCategory = 'skills';
    document.querySelectorAll('.kb-tab').forEach((t) => {
      t.classList.toggle('active', t.dataset.category === 'skills');
    });
    updatePanelMode();
    await loadSkills();
    alert(`已安装：${res.skill?.displayName || res.skill?.id}`);
  } catch (e) {
    alert('安装失败: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '📦 安装 Skill（zip 或文件夹）';
  }
}

async function uninstallSkill(id, label) {
  if (!confirm(`确定卸载 Skill「${label}」？`)) return;
  const res = await window.api.skills.uninstall(id);
  if (!res.success) {
    alert('卸载失败: ' + (res.error || '未知错误'));
    return;
  }
  await loadSkills();
}

async function loadEntries() {
  allEntries = await window.api.knowledge.getAll();
  if (activeCategory !== 'skills') {
    filterEntries(document.getElementById('search-input').value);
  }
}

async function loadStats() {
  if (activeCategory === 'skills') return;
  const stats = await window.api.knowledge.getStats();
  const sizeStr = stats.size ? formatSize(stats.size) : '0 B';
  const parts = [
    `共 ${stats.count || 0} 条`,
    stats.xsd != null ? `XSD ${stats.xsd}` : '',
    stats.doc != null ? `教程 ${stats.doc}` : '',
    stats.sdk != null ? `SDK ${stats.sdk}` : '',
    stats.learned != null ? `学习 ${stats.learned}` : '',
    stats.xsdRoot ? '已链接 SDK XSD' : '未链接 XSD',
    `约 ${sizeStr}`,
  ].filter(Boolean);
  document.getElementById('stats').textContent = parts.join(' · ');
}

/** 按当前 Tab / 搜索更新统计行（与列表一致） */
function updateCategoryStats(list) {
  if (activeCategory === 'skills') return;
  const statsEl = document.getElementById('stats');
  if (!statsEl) return;

  const query = (document.getElementById('search-input')?.value || '').trim();
  const catLabel = CATEGORY_LABELS[activeCategory] || activeCategory;
  const showing = list.length;
  const total = allEntries.length;

  if (activeCategory === 'all' && !query) {
    loadStats();
    return;
  }

  const parts = [`当前：${catLabel}`, `显示 ${showing} 条`];
  if (total !== showing) parts.push(`库内共 ${total} 条`);
  if (query) parts.push(`搜索「${query}」`);
  if (showing > MAX_RENDER_ENTRIES) {
    parts.push(`列表仅渲染前 ${MAX_RENDER_ENTRIES} 条`);
  }
  statsEl.textContent = parts.join(' · ');
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(2) + ' MB';
}

function filterEntries(query) {
  if (activeCategory === 'skills') return;

  let list = allEntries;
  if (activeCategory !== 'all') {
    list = list.filter((e) => e.category === activeCategory);
  }
  if (query) {
    const lowerQ = query.toLowerCase();
    list = list.filter((entry) => {
      const targetStr = [
        entry.intent,
        entry.summary,
        entry.content,
        entry.source_files,
        (entry.tags || []).join(' '),
      ]
        .join(' ')
        .toLowerCase();
      return targetStr.includes(lowerQ);
    });
  }
  filteredEntries = list;
  updateCategoryStats(list);
  renderList(list);
}

function renderList(entries) {
  const container = document.getElementById('knowledge-list');
  if (!entries || entries.length === 0) {
    container.innerHTML =
      '<div class="empty-state"><p>📭 暂无条目</p><p>切换分类或点击「重建索引」导入教程文档。</p></div>';
    return;
  }

  const total = entries.length;
  const toRender = entries.slice(0, MAX_RENDER_ENTRIES);

  container.innerHTML = '';
  if (total > MAX_RENDER_ENTRIES) {
    const hint = document.createElement('div');
    hint.className = 'kb-list-hint';
    hint.textContent = `共 ${total} 条，下方显示前 ${MAX_RENDER_ENTRIES} 条；请用搜索框缩小范围。`;
    container.appendChild(hint);
  }

  toRender.forEach((entry) => {
    const div = document.createElement('div');
    div.className = 'kb-card';
    const catLabel = CATEGORY_LABELS[entry.category] || entry.category || '';
    const source = entry.source_files ? ` · ${entry.source_files}` : '';
    const body = entry.content || entry.summary || '';
    const preview = (entry.summary || body).substring(0, 280);
    const hasMore = body.length > preview.length;

    div.innerHTML = `
      <div class="meta">
        <span class="badge">${escapeHtml(catLabel)}</span>
        <span class="timestamp">${formatTimestamp(entry.timestamp)}${escapeHtml(source)}</span>
      </div>
      <div class="intent">${escapeHtml(entry.intent || '无标题')}</div>
      <div class="summary">${escapeHtml(preview)}${hasMore ? '…' : ''}</div>
      ${hasMore ? `<details class="full-content"><summary>展开全文</summary><pre>${escapeHtml(body)}</pre></details>` : ''}
      ${entry.plan && entry.plan.length ? `<div class="plan">${escapeHtml(JSON.stringify(entry.plan, null, 2))}</div>` : ''}
      ${entry.tags && entry.tags.length ? `<div class="tags">🏷 ${escapeHtml(entry.tags.filter((t) => !t.startsWith('_')).join(', '))}</div>` : ''}
      <div class="actions">
        <button type="button" class="app-btn app-btn--secondary" data-id="${entry.id}">🗑 删除</button>
      </div>
    `;
    div.querySelector('button').addEventListener('click', () => deleteEntry(entry.id));
    container.appendChild(div);
  });
}

function formatTimestamp(ts) {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleString('zh-CN', { hour12: false });
  } catch {
    return ts;
  }
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function deleteEntry(id) {
  if (!confirm('确定要删除这条知识吗？')) return;
  await window.api.knowledge.delete(id);
  await loadEntries();
  await loadStats();
}

async function clearAll() {
  if (!confirm('确定要清空所有知识吗？预置教程可在「重建索引」后恢复。')) return;
  await window.api.knowledge.clear();
  await loadEntries();
  await loadStats();
}

async function rebuildIndex() {
  if (!confirm('将重新导入 knowledge-docs、SDK 参考与 Schemas/xsd 全部 XSD 规范（权威优先级最高），是否继续？')) return;
  const btn = document.getElementById('rebuild-btn');
  btn.disabled = true;
  btn.textContent = '重建中…';
  try {
    await window.api.knowledge.rebuild();
    await loadEntries();
    await loadStats();
    alert('知识库索引已重建');
  } catch (e) {
    alert('重建失败: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '🔄 重建索引';
  }
}

async function importKnowledge() {
  const path = prompt('请输入源知识库 JSON 文件路径：');
  if (!path) return;
  await window.api.knowledge.import(path);
  await loadEntries();
  await loadStats();
  alert('导入成功');
}

async function exportKnowledge() {
  const path = prompt('请输入导出目标 JSON 文件路径：');
  if (!path) return;
  await window.api.knowledge.export(path);
  alert('导出成功');
}

document.addEventListener('DOMContentLoaded', init);
