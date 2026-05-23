// csf-editor.js - CSF 字符串（SAGE/RA3 与简易 CSF 格式）

// FourCC 按文件字节序小端读取（与 DataView.getUint32(_, true) 一致）
const FSC_MAGIC = 0x43534620; // " FSC"
const LBL_MAGIC = 0x4c424c20; // " LBL"
const RTS_MAGIC = 0x53545220; // " RTS"
const WRTS_MAGIC = 0x53545257; // "WRTS"

class CsfFile {
  constructor() {
    this.format = 'sage';
    this.version = 3;
    this.numLabels = 0;
    this.numStrings = 0;
    this.languageId = 0;
    this.labels = {};
    this._order = [];
  }

  static readFourCC(view, offset) {
    return view.getUint32(offset, true);
  }

  static decodeSageValue(bytes) {
    const inverted = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) inverted[i] = (~bytes[i]) & 0xff;
    try {
      return new TextDecoder('utf-16le').decode(inverted);
    } catch {
      return '';
    }
  }

  static encodeSageValue(str) {
    const s = String(str || '');
    const out = new Uint8Array(s.length * 2);
    let o = 0;
    for (let i = 0; i < s.length; i++) {
      const code = s.charCodeAt(i);
      out[o++] = (~(code & 0xff)) & 0xff;
      out[o++] = (~((code >> 8) & 0xff)) & 0xff;
    }
    return out;
  }

  static parseSage(data, view) {
    const csf = new CsfFile();
    csf.format = 'sage';
    csf.version = view.getInt32(4, true);
    csf.numLabels = view.getUint32(8, true);
    csf.numStrings = view.getUint32(12, true);
    csf.languageId = view.getInt32(20, true);

    let offset = 24;
    const len = data.length;

    while (offset + 12 <= len) {
      const blockId = CsfFile.readFourCC(view, offset);
      if (blockId !== LBL_MAGIC) break;

      offset += 4;
      const pairCount = view.getUint32(offset, true);
      offset += 4;
      const labelLen = view.getUint32(offset, true);
      offset += 4;

      if (labelLen <= 0 || offset + labelLen > len) break;
      const labelBytes = data.slice(offset, offset + labelLen);
      const labelName = new TextDecoder('latin1').decode(labelBytes);
      offset += labelLen;

      let value = '';
      let extra = '';

      for (let p = 0; p < pairCount && offset + 8 <= len; p++) {
        const valId = CsfFile.readFourCC(view, offset);
        offset += 4;
        const charLen = view.getUint32(offset, true);
        offset += 4;
        const byteLen = charLen * 2;
        if (byteLen < 0 || offset + byteLen > len) break;

        const valBytes = data.slice(offset, offset + byteLen);
        offset += byteLen;
        const decoded = CsfFile.decodeSageValue(valBytes);

        if (valId === RTS_MAGIC) {
          value = decoded;
        } else if (valId === WRTS_MAGIC) {
          value = decoded;
          if (offset + 4 <= len) {
            const exLen = view.getUint32(offset, true);
            offset += 4;
            if (exLen > 0 && offset + exLen <= len) {
              extra = new TextDecoder('latin1').decode(data.slice(offset, offset + exLen));
              offset += exLen;
            }
          }
        }
      }

      if (labelName && !(labelName in csf.labels)) {
        csf._order.push(labelName);
      }
      csf.labels[labelName] = value;
      if (extra) csf.labels[`${labelName}__extra`] = extra;
    }

    return csf;
  }

  static parseLegacy(data, view) {
    const csf = new CsfFile();
    csf.format = 'legacy';
    csf.version = view.getUint32(4, true);
    csf.numLabels = view.getUint32(8, true);
    csf.numStrings = view.getUint32(12, true);
    csf.extra = view.getUint32(20, true);

    let offset = 24;
    for (let i = 0; i < csf.numLabels; i++) {
      if (offset + 4 > data.length) break;
      const labelLen = view.getUint32(offset, true);
      offset += 4;
      if (labelLen > data.length - offset) break;
      const labelName = new TextDecoder('latin1').decode(data.slice(offset, offset + labelLen));
      offset += labelLen;

      if (offset + 4 > data.length) break;
      const numValues = view.getUint32(offset, true);
      offset += 4;

      const values = [];
      for (let j = 0; j < numValues; j++) {
        if (offset + 4 > data.length) break;
        const valLen = view.getUint32(offset, true);
        offset += 4;
        if (valLen > data.length - offset) break;
        values.push(new TextDecoder('latin1').decode(data.slice(offset, offset + valLen)));
        offset += valLen;
      }
      if (values.length > 0) {
        csf.labels[labelName] = values[0];
        csf._order.push(labelName);
      }
    }
    return csf;
  }

  static toUint8Array(buffer) {
    if (!buffer) return null;
    if (buffer instanceof Uint8Array) return buffer;
    if (buffer instanceof ArrayBuffer) return new Uint8Array(buffer);
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(buffer)) {
      return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    }
    if (buffer.type === 'Buffer' && Array.isArray(buffer.data)) {
      return new Uint8Array(buffer.data);
    }
    if (buffer.buffer instanceof ArrayBuffer) {
      return new Uint8Array(
        buffer.buffer,
        buffer.byteOffset || 0,
        buffer.byteLength || buffer.length
      );
    }
    return null;
  }

  static parse(buffer) {
    const data = CsfFile.toUint8Array(buffer);
    if (!data) throw new Error('无法识别的数据格式');

    if (data.length < 24) throw new Error('文件太小，不是有效的 CSF 文件');

    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const magic = CsfFile.readFourCC(view, 0);

    if (magic === FSC_MAGIC) {
      return CsfFile.parseSage(data, view);
    }

    const legacy = String.fromCharCode(data[0], data[1], data[2], data[3]);
    if (legacy.startsWith('CSF')) {
      return CsfFile.parseLegacy(data, view);
    }

    throw new Error('无效的 CSF 文件签名');
  }

  static serializeSage(csf) {
    const keys = csf._order.length ? csf._order.filter((k) => !k.endsWith('__extra')) : Object.keys(csf.labels).filter((k) => !k.endsWith('__extra'));
    const chunks = [];

    const header = new ArrayBuffer(24);
    const hv = new DataView(header);
    hv.setUint32(0, FSC_MAGIC, true);
    hv.setInt32(4, csf.version || 3, true);
    hv.setUint32(8, keys.length, true);
    hv.setUint32(12, keys.length, true);
    hv.setUint32(16, 0, true);
    hv.setInt32(20, csf.languageId || 0, true);
    chunks.push(new Uint8Array(header));

    for (const key of keys) {
      const value = csf.labels[key] || '';
      const labelBytes = new TextEncoder().encode(key);
      const valBytes = CsfFile.encodeSageValue(value);

      const lblHead = new ArrayBuffer(12);
      const lv = new DataView(lblHead);
      lv.setUint32(0, LBL_MAGIC, true);
      lv.setUint32(4, 1, true);
      lv.setUint32(8, labelBytes.length, true);
      chunks.push(new Uint8Array(lblHead));
      chunks.push(labelBytes);

      const rtsHead = new ArrayBuffer(8);
      const rv = new DataView(rtsHead);
      rv.setUint32(0, RTS_MAGIC, true);
      rv.setUint32(4, value.length, true);
      chunks.push(new Uint8Array(rtsHead));
      chunks.push(valBytes);
    }

    const total = chunks.reduce((n, c) => n + c.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const c of chunks) {
      out.set(c, o);
      o += c.length;
    }
    return out.buffer;
  }

  static serializeLegacy(csf) {
    const keys = Object.keys(csf.labels).filter((k) => !k.endsWith('__extra'));
    let size = 24;
    for (const key of keys) {
      const kb = new TextEncoder().encode(key);
      const vb = new TextEncoder().encode(csf.labels[key] || '');
      size += 4 + kb.length + 4 + 4 + vb.length;
    }

    const buffer = new ArrayBuffer(size);
    const view = new DataView(buffer);
    let offset = 0;
    view.setUint8(offset++, 0x43);
    view.setUint8(offset++, 0x53);
    view.setUint8(offset++, 0x46);
    view.setUint8(offset++, 0x00);
    view.setUint32(offset, csf.version || 3, true);
    offset += 4;
    view.setUint32(offset, keys.length, true);
    offset += 4;
    view.setUint32(offset, keys.length, true);
    offset += 4;
    offset += 4;
    view.setUint32(offset, csf.extra || 0, true);
    offset += 4;

    const u8 = new Uint8Array(buffer);
    for (const key of keys) {
      const kb = new TextEncoder().encode(key);
      const vb = new TextEncoder().encode(csf.labels[key] || '');
      view.setUint32(offset, kb.length, true);
      offset += 4;
      u8.set(kb, offset);
      offset += kb.length;
      view.setUint32(offset, 1, true);
      offset += 4;
      view.setUint32(offset, vb.length, true);
      offset += 4;
      u8.set(vb, offset);
      offset += vb.length;
    }
    return buffer;
  }

  static serialize(csf) {
    if (csf.format === 'sage') return CsfFile.serializeSage(csf);
    return CsfFile.serializeLegacy(csf);
  }
}

let currentCsf = null;
let currentCsfPath = null;
let currentCsfCategory = 'ALL';
let csfCurrentPage = 1;
let csfCategories = [];
let csfEditorRefs = {
  tableWrap: null,
  search: null,
  categoryList: null,
  statusBar: null,
  paginationBar: null,
};

const CSF_PAGE_SIZE = 400;
const CSF_CATEGORY_ALL = 'ALL';

function getCsfPageCount(totalItems) {
  return Math.max(1, Math.ceil(totalItems / CSF_PAGE_SIZE));
}

function clampCsfPage(page, totalItems) {
  return Math.min(Math.max(1, page), getCsfPageCount(totalItems));
}

function goToCsfPage(page) {
  csfCurrentPage = page;
  renderCsfTableBody();
  csfEditorRefs.tableWrap?.scrollTo?.(0, 0);
}

function getCsfKeyCategory(key) {
  const idx = key.indexOf(':');
  if (idx > 0) return key.substring(0, idx).toUpperCase();
  return '(其他)';
}

function buildCsfCategories(csf) {
  const keys = (csf._order.length ? csf._order : Object.keys(csf.labels)).filter(
    (k) => !k.endsWith('__extra')
  );
  const counts = new Map();
  counts.set(CSF_CATEGORY_ALL, keys.length);
  for (const key of keys) {
    const cat = getCsfKeyCategory(key);
    counts.set(cat, (counts.get(cat) || 0) + 1);
  }
  const list = [{ id: CSF_CATEGORY_ALL, label: '全部', count: keys.length }];
  [...counts.keys()]
    .filter((id) => id !== CSF_CATEGORY_ALL)
    .sort((a, b) => a.localeCompare(b, 'en'))
    .forEach((id) => list.push({ id, label: id, count: counts.get(id) }));
  return list;
}

function getKeysForCategory(csf, categoryId) {
  const keys = (csf._order.length ? csf._order : Object.keys(csf.labels)).filter(
    (k) => !k.endsWith('__extra')
  );
  if (categoryId === CSF_CATEGORY_ALL) return keys;
  return keys.filter((k) => getCsfKeyCategory(k) === categoryId);
}

function displayKeyForCategory(key, categoryId) {
  if (categoryId !== CSF_CATEGORY_ALL) {
    const prefix = categoryId + ':';
    if (key.toUpperCase().startsWith(prefix)) return key.substring(prefix.length);
  }
  return key;
}

function renderCsfCategoryList() {
  const listEl = csfEditorRefs.categoryList;
  if (!listEl || !currentCsf) return;
  listEl.innerHTML = '';
  csfCategories.forEach((cat) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'csf-category-tab' + (cat.id === currentCsfCategory ? ' active' : '');
    btn.dataset.category = cat.id;
    btn.title = `${cat.label}（${cat.count} 条）`;
    btn.innerHTML = `<span class="csf-category-tab-label">${escapeHtml(cat.label)}</span><span class="csf-category-tab-count">${cat.count}</span>`;
    btn.addEventListener('click', () => {
      if (currentCsfCategory === cat.id) return;
      currentCsfCategory = cat.id;
      csfCurrentPage = 1;
      renderCsfCategoryList();
      renderCsfTableBody();
      btn.scrollIntoView({ block: 'nearest' });
    });
    listEl.appendChild(btn);
  });
}

function renderCsfTableBody() {
  const container = csfEditorRefs.tableWrap;
  const filter = csfEditorRefs.search?.value || '';
  if (!container || !currentCsf) return;

  const q = filter.toLowerCase().trim();
  const scopeKeys = getKeysForCategory(currentCsf, currentCsfCategory);
  let list = scopeKeys;
  if (q) {
    list = scopeKeys.filter((k) => {
      const v = currentCsf.labels[k] || '';
      return k.toLowerCase().includes(q) || v.toLowerCase().includes(q);
    });
  }

  const totalFiltered = list.length;
  csfCurrentPage = clampCsfPage(csfCurrentPage, totalFiltered);
  const pageCount = getCsfPageCount(totalFiltered);
  const start = (csfCurrentPage - 1) * CSF_PAGE_SIZE;
  const shown = list.slice(start, start + CSF_PAGE_SIZE);
  const table = document.createElement('table');
  table.className = 'csf-table';
  table.innerHTML = '<tr><th>Key</th><th>Value</th><th></th></tr>';

  if (!shown.length) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="3" class="csf-empty-cell">无匹配条目</td>';
    table.appendChild(row);
  } else {
    shown.forEach((key) => {
      const row = document.createElement('tr');
      const displayKey = displayKeyForCategory(key, currentCsfCategory);
      row.innerHTML = `<td class="csf-key" title="${escapeHtml(key)}">${escapeHtml(displayKey)}</td><td contenteditable="true">${escapeHtml(currentCsf.labels[key])}</td><td><button type="button" class="csf-del-btn" title="删除此条">删</button></td>`;
      row.querySelector('td:nth-child(2)').addEventListener('input', function () {
        currentCsf.labels[key] = this.textContent;
        window.currentCsfDirty = true;
        if (currentCsfPath) {
          dirtyFiles.set(currentCsfPath, true);
          if (typeof updateFileTreeDirtyMarkerForFile === 'function') {
            updateFileTreeDirtyMarkerForFile(currentCsfPath);
          } else {
            updateFileTreeDirtyMarkers();
          }
        }
      });
      row.querySelector('.csf-del-btn').addEventListener('click', () => {
        if (confirm(`删除条目 ${key}？`)) {
          delete currentCsf.labels[key];
          currentCsf._order = currentCsf._order.filter((k) => k !== key);
          window.currentCsfDirty = true;
          if (currentCsfPath) dirtyFiles.set(currentCsfPath, true);
          csfCategories = buildCsfCategories(currentCsf);
          renderCsfCategoryList();
          renderCsfTableBody();
          if (typeof updateFileTreeDirtyMarkerForFile === 'function') {
            updateFileTreeDirtyMarkerForFile(currentCsfPath);
          } else {
            updateFileTreeDirtyMarkers();
          }
        }
      });
      table.appendChild(row);
    });
  }

  const inner = document.createElement('div');
  inner.className = 'media-csf-table-inner';
  inner.appendChild(table);
  container.innerHTML = '';
  container.appendChild(inner);

  const catMeta = csfCategories.find((c) => c.id === currentCsfCategory);
  const catLabel = catMeta ? catMeta.label : currentCsfCategory;
  const totalAll = csfCategories[0]?.count || scopeKeys.length;
  let statusText = `分类：${catLabel} · 当前 ${scopeKeys.length} 条`;
  if (q) statusText += ` · 匹配 ${totalFiltered} 条`;
  if (totalFiltered > CSF_PAGE_SIZE) {
    statusText += ` · 第 ${csfCurrentPage}/${pageCount} 页 · 本页 ${shown.length} 条`;
  } else {
    statusText += ` · 显示 ${shown.length} 条`;
  }
  statusText += ` · 全文件 ${totalAll} 条`;

  if (csfEditorRefs.statusBar) csfEditorRefs.statusBar.textContent = statusText;
  renderCsfPaginationBar(totalFiltered);
}

function renderCsfPaginationBar(totalItems) {
  const bar = csfEditorRefs.paginationBar;
  if (!bar) return;

  const pageCount = getCsfPageCount(totalItems);
  csfCurrentPage = clampCsfPage(csfCurrentPage, totalItems);

  if (totalItems <= CSF_PAGE_SIZE) {
    bar.hidden = true;
    bar.innerHTML = '';
    return;
  }
  bar.hidden = false;
  bar.innerHTML = '';

  const info = document.createElement('span');
  info.className = 'csf-pagination-info';
  info.textContent = `共 ${totalItems} 条 · 每页 ${CSF_PAGE_SIZE}`;

  const controls = document.createElement('div');
  controls.className = 'csf-pagination-controls';

  const mkBtn = (label, title, disabled, onClick) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'csf-page-btn';
    b.textContent = label;
    b.title = title;
    b.disabled = disabled;
    if (!disabled) b.addEventListener('click', onClick);
    return b;
  };

  controls.appendChild(mkBtn('«', '第一页', csfCurrentPage <= 1, () => goToCsfPage(1)));
  controls.appendChild(
    mkBtn('‹', '上一页', csfCurrentPage <= 1, () => goToCsfPage(csfCurrentPage - 1))
  );

  const jumpWrap = document.createElement('label');
  jumpWrap.className = 'csf-pagination-jump';
  jumpWrap.title = '跳转到指定页';
  const jumpInput = document.createElement('input');
  jumpInput.type = 'number';
  jumpInput.className = 'csf-pagination-jump-input';
  jumpInput.min = '1';
  jumpInput.max = String(pageCount);
  jumpInput.value = String(csfCurrentPage);
  jumpInput.setAttribute('aria-label', '页码');
  jumpWrap.appendChild(document.createTextNode('第 '));
  jumpWrap.appendChild(jumpInput);
  jumpWrap.appendChild(document.createTextNode(` / ${pageCount} 页`));
  jumpInput.addEventListener('change', () => {
    const n = parseInt(jumpInput.value, 10);
    if (Number.isFinite(n)) goToCsfPage(clampCsfPage(n, totalItems));
  });
  jumpInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') jumpInput.blur();
  });
  controls.appendChild(jumpWrap);

  controls.appendChild(
    mkBtn('›', '下一页', csfCurrentPage >= pageCount, () => goToCsfPage(csfCurrentPage + 1))
  );
  controls.appendChild(
    mkBtn('»', '最后一页', csfCurrentPage >= pageCount, () => goToCsfPage(pageCount))
  );

  bar.appendChild(info);
  bar.appendChild(controls);
}

async function loadCsfEditor(filePath, rootEl) {
  const container = rootEl || document.getElementById('csf-editor') || document.getElementById('media-csf-root');
  if (!container) return;
  try {
    let openPath = filePath;
    if (window.api?.resolveProjectFile) {
      const resolved = await window.api.resolveProjectFile(filePath);
      if (resolved?.success && resolved.path) openPath = resolved.path;
    }
    const raw = await window.api.readBinaryFile(openPath);
    if (!raw) {
      const projectPath = window.api?.getProjectPath ? await window.api.getProjectPath() : '';
      throw new Error(
        `无法读取文件（可能不在当前项目内）。\n当前项目：${projectPath || '未打开'}\n请求路径：${filePath}`
      );
    }
    currentCsfPath = openPath;
    currentCsf = CsfFile.parse(raw);
    currentCsfCategory = CSF_CATEGORY_ALL;
    csfCurrentPage = 1;
    csfCategories = buildCsfCategories(currentCsf);

    container.innerHTML = '';
    const layout = document.createElement('div');
    layout.className = 'csf-editor-layout';

    const categoryPanel = document.createElement('aside');
    categoryPanel.className = 'csf-category-panel';
    categoryPanel.innerHTML = '<div class="csf-category-panel-title">分类</div>';
    const categoryList = document.createElement('div');
    categoryList.className = 'csf-category-list';
    categoryList.setAttribute('role', 'tablist');
    categoryPanel.appendChild(categoryList);

    const main = document.createElement('div');
    main.className = 'csf-editor-main';

    const search = document.createElement('input');
    search.type = 'search';
    search.className = 'standalone-field media-csf-search';
    search.placeholder = '在当前分类内搜索 Key / Value…';

    const statusBar = document.createElement('div');
    statusBar.className = 'csf-status-bar';

    const tableWrap = document.createElement('div');
    tableWrap.className = 'media-csf-table-wrap';

    const footer = document.createElement('div');
    footer.className = 'csf-footer';

    const paginationBar = document.createElement('div');
    paginationBar.className = 'csf-pagination-bar';
    paginationBar.hidden = true;

    const footerActions = document.createElement('div');
    footerActions.className = 'csf-footer-actions';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'csf-action-btn csf-action-btn--primary';
    saveBtn.textContent = '保存';
    saveBtn.onclick = saveCsfFile;
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'csf-action-btn';
    addBtn.textContent = '新增';
    addBtn.onclick = () => {
      const prefix =
        currentCsfCategory !== CSF_CATEGORY_ALL ? currentCsfCategory + ':' : '';
      const hint = prefix ? `请输入 Key（将自动加前缀 ${prefix}）:` : '请输入完整 Key（含分类前缀，如 TOOLTIP:XXX）:';
      let key = prompt(hint);
      if (!key) return;
      key = key.trim();
      if (prefix && !key.includes(':')) key = prefix + key;
      if (currentCsf.labels[key]) {
        showToast('该 Key 已存在');
        return;
      }
      currentCsf.labels[key] = '';
      currentCsf._order.push(key);
      window.currentCsfDirty = true;
      if (currentCsfPath) dirtyFiles.set(currentCsfPath, true);
      csfCategories = buildCsfCategories(currentCsf);
      renderCsfCategoryList();
      renderCsfTableBody();
      updateFileTreeDirtyMarkers();
    };
    footerActions.appendChild(saveBtn);
    footerActions.appendChild(addBtn);
    footer.appendChild(paginationBar);
    footer.appendChild(footerActions);

    main.appendChild(search);
    main.appendChild(statusBar);
    main.appendChild(tableWrap);
    main.appendChild(footer);

    layout.appendChild(categoryPanel);
    layout.appendChild(main);
    container.appendChild(layout);

    csfEditorRefs = { tableWrap, search, categoryList, statusBar, paginationBar };
    let csfSearchDebounce = null;
    search.addEventListener('input', () => {
      clearTimeout(csfSearchDebounce);
      csfSearchDebounce = setTimeout(() => {
        csfCurrentPage = 1;
        renderCsfTableBody();
      }, 180);
    });
    renderCsfCategoryList();
    renderCsfTableBody();
  } catch (err) {
    console.error('CSF 加载失败:', err);
    container.innerHTML = `<div class="media-error">无法加载 CSF: ${escapeHtml(err.message)}</div>`;
    throw err;
  }
}

async function saveCsfFile() {
  if (!currentCsf || !currentCsfPath) return;
  try {
    const buffer = CsfFile.serialize(currentCsf);
    const ok = await window.api.writeBinaryFile(currentCsfPath, buffer);
    if (!ok) {
      showToast('保存 CSF 文件失败');
      return;
    }
    window.currentCsfDirty = false;
    if (typeof dirtyFiles !== 'undefined') {
      dirtyFiles.set(currentCsfPath, false);
      if (typeof updateFileTreeDirtyMarkers === 'function') updateFileTreeDirtyMarkers();
    }
    showToast('CSF 文件保存成功');
  } catch (err) {
    showToast('保存 CSF 文件失败: ' + err.message);
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

window.CsfFile = CsfFile;
window.loadCsfEditor = loadCsfEditor;
window.saveCsfFile = saveCsfFile;
