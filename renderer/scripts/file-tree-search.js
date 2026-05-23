// renderer/scripts/file-tree-search.js —— 文件树搜索（输入后才显示结果）

const MIN_QUERY_LEN = 2;
const MAX_RESULTS = 12;
const SEARCH_DEBOUNCE_MS = 200;

let searchDebounce = null;
let dropdownDismissTimer = null;
let searchDropdownOpen = false;
let lastSearchQuery = '';

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function resolveSearchPath(filePath) {
  const p = String(filePath || '').replace(/\\/g, '/');
  if (!p) return p;
  const root =
    typeof currentRootFolder !== 'undefined' && currentRootFolder
      ? currentRootFolder.replace(/\\/g, '/')
      : '';
  if (/^[A-Za-z]:\//.test(p) || p.startsWith('/')) {
    if (root && p.toLowerCase().startsWith(root.toLowerCase())) {
      return root + p.substring(root.length);
    }
    return p;
  }
  return root ? `${root}/${p}` : p;
}

async function refreshProjectFileIndex(force = false) {
  if (!window.api?.indexProjectFiles) return;
  await window.api.indexProjectFiles(force);
}

function hideDropdown() {
  const dd = document.getElementById('file-tree-search-dropdown');
  if (dd) {
    dd.classList.add('hidden');
    dd.innerHTML = '';
  }
  searchDropdownOpen = false;
}

function showDropdownMessage(text) {
  const dd = document.getElementById('file-tree-search-dropdown');
  if (!dd) return;
  dd.classList.remove('hidden');
  dd.innerHTML = `<div class="file-search-hint">${escapeHtml(text)}</div>`;
  searchDropdownOpen = true;
}

function showDropdown(items) {
  const dd = document.getElementById('file-tree-search-dropdown');
  if (!dd) return;
  if (!items.length) {
    showDropdownMessage('无匹配文件');
    return;
  }
  dd.classList.remove('hidden');
  dd.innerHTML = '';
  items.slice(0, MAX_RESULTS).forEach((item) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'file-search-item';
    btn.dataset.path = item.path;
    btn.title = item.path;
    btn.innerHTML = `<span class="file-search-name">${escapeHtml(item.name)}</span><span class="file-search-path">${escapeHtml(item.path)}</span>`;
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      openSearchResult(item.path);
    });
    dd.appendChild(btn);
  });
  searchDropdownOpen = true;
}

async function runSearch(query) {
  if (!window.api?.searchProjectFiles) return;
  const q = String(query || '').trim();
  lastSearchQuery = q;

  if (!q) {
    hideDropdown();
    return;
  }
  if (q.length < MIN_QUERY_LEN) {
    hideDropdown();
    return;
  }

  const res = await window.api.searchProjectFiles(q, MAX_RESULTS);
  if (lastSearchQuery !== q) return;
  if (res?.success) showDropdown(res.files || []);
  else hideDropdown();
}

async function openSearchResult(filePath) {
  const absPath = resolveSearchPath(filePath);
  const input = document.getElementById('file-tree-search');
  if (input) input.value = absPath.split(/[\\/]/).pop() || absPath;
  hideDropdown();
  if (typeof switchToFile === 'function') {
    await switchToFile(absPath);
  }
  if (typeof expandFilePath === 'function') {
    await expandFilePath(absPath);
  }
}

function scheduleHideDropdown() {
  clearTimeout(dropdownDismissTimer);
  dropdownDismissTimer = setTimeout(() => {
    const input = document.getElementById('file-tree-search');
    const dd = document.getElementById('file-tree-search-dropdown');
    if (!input || !dd) return;
    if (dd.matches(':hover')) return;
    if (document.activeElement === input) return;
    hideDropdown();
  }, 120);
}

let fileTreeSearchInited = false;

function initFileTreeSearch() {
  if (fileTreeSearchInited) return;
  fileTreeSearchInited = true;
  const input = document.getElementById('file-tree-search');
  const wrap = document.getElementById('file-tree-search-wrap');
  if (!input) return;

  input.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    const q = input.value.trim();
    if (!q) {
      hideDropdown();
      return;
    }
    if (q.length < MIN_QUERY_LEN) {
      hideDropdown();
      return;
    }
    searchDebounce = setTimeout(() => runSearch(q), SEARCH_DEBOUNCE_MS);
  });

  input.addEventListener('focus', () => {
    const q = input.value.trim();
    if (q.length >= MIN_QUERY_LEN) runSearch(q);
    else hideDropdown();
  });

  input.addEventListener('blur', () => {
    scheduleHideDropdown();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const dd = document.getElementById('file-tree-search-dropdown');
      const first = dd?.querySelector('.file-search-item');
      const pick = first?.dataset?.path || input.value.trim();
      if (pick) openSearchResult(pick);
      else hideDropdown();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      hideDropdown();
      input.blur();
    } else if (e.key === 'Tab') {
      hideDropdown();
    }
  });

  document.addEventListener(
    'pointerdown',
    (e) => {
      if (!searchDropdownOpen) return;
      if (wrap && wrap.contains(e.target)) return;
      if (e.target.closest?.('.panel-close-btn')) return;
      hideDropdown();
    },
    true
  );
}

window.refreshProjectFileIndex = refreshProjectFileIndex;
window.initFileTreeSearch = initFileTreeSearch;
window.hideFileTreeSearchDropdown = hideDropdown;

