// main/mod-xml-guard.js —— Mod.xml 写入前校验与自动净化（防止 AI/工具写坏结构）

const fs = require('fs');
const path = require('path');
const { findModXml } = require('./mod-register');

const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf]/;
const UNIT_CATEGORY_RE = /(?:Infantry|Vehicle|Aircraft|Structures)\//i;
const DIRECT_UNIT_REF_RE =
  /<Include\b[^>]*\btype="reference"[^>]*\bsource="DATA:[^"]*(?:GameObject\.xml|\/(?:Infantry|Vehicle|Aircraft|Structures)\/[^"]+\.xml)"/i;
const BROKEN_INCLUDE_LINE_RE = /^\s*Include\s+type="/im;
const ALLOWED_REFERENCE_SOURCES =
  /^(?:DATA:)?(?:static|global|audio)\.xml$/i;

function isModXmlRel(rel) {
  return /(?:^|\/)mod\.xml$/i.test(String(rel || '').replace(/\\/g, '/'));
}

function isInsurrectionProject(projectRoot) {
  if (!projectRoot) return false;
  try {
    const { analyzeProjectConventions } = require('./project-conventions');
    const ctx = analyzeProjectConventions(projectRoot);
    return ctx.layoutProfile === 'sdk-insurrection';
  } catch {
    return false;
  }
}

function dataSourceToRel(source, dataRel = 'data') {
  const s = String(source || '')
    .replace(/^DATA:/i, '')
    .replace(/\\/g, '/');
  return `${dataRel}/${s}`.replace(/\/+/g, '/');
}

function includeTargetExists(projectRoot, source, dataRel = 'data') {
  const rel = dataSourceToRel(source, dataRel);
  const full = path.join(projectRoot, rel).replace(/\\/g, '/');
  if (fs.existsSync(full)) return true;
  const alt = path.join(projectRoot, rel.replace(/^data\//i, 'Data/'));
  return fs.existsSync(alt);
}

/**
 * 净化 Mod.xml：去掉根外孤儿、坏声明、中文路径、起义时刻违规 reference 等
 */
function sanitizeModXmlContent(content, options = {}) {
  const insurrection = !!options.insurrection;
  const projectRoot = options.projectRoot || null;
  const dataRel = options.dataRel || 'data';
  const log = [];
  let c = String(content || '');
  let changed = false;

  const fixDecl = c.replace(/^\s*<<\?xml/i, '<?xml');
  if (fixDecl !== c) {
    c = fixDecl;
    log.push('已修复损坏的 XML 声明（<<?xml）');
    changed = true;
  }

  const closeMatch = c.match(/<\/AssetDeclaration>/i);
  if (closeMatch) {
    const closeIdx = closeMatch.index;
    const end = closeIdx + closeMatch[0].length;
    const tail = c.slice(end);
    if (tail.trim().length > 0) {
      c = c.slice(0, end) + '\n';
      log.push('已删除 </AssetDeclaration> 之后的孤儿内容（禁止 append 到根外）');
      changed = true;
    }
  }

  if (BROKEN_INCLUDE_LINE_RE.test(c)) {
    const next = c.replace(/^\s*Include\s+type="[^"]*"[^>]*\/?>\s*$/gim, '');
    if (next !== c) {
      c = next;
      log.push('已删除缺少开头 < 的残缺 Include 行');
      changed = true;
    }
  }

  const stripInclude = (re, reason) => {
    const next = c.replace(re, () => {
      log.push(reason);
      changed = true;
      return '\n';
    });
    c = next;
  };

  stripInclude(
    /\s*<Include\b[^>]*\bsource="[^"]*[\u4e00-\u9fff\u3400-\u4dbf][^"]*"[^>]*\/?>\s*/gi,
    '已删除 source 含中文的 Include'
  );

  if (insurrection) {
    stripInclude(
      /\s*<Include\b[^>]*\btype="reference"[^>]*\bsource="DATA:[^"]*(?:GameObject\.xml|\/(?:Infantry|Vehicle|Aircraft|Structures)\/[^"]+)"[^>]*\/?>\s*/gi,
      '已删除 Mod.xml 中违规的 reference 单位 Include（应走 Soviet.xml → SovietInfantry.xml 聚合）'
    );
  }

  if (projectRoot) {
    const includeRe = /<Include\b([^>]*)\bsource="([^"]+)"([^>]*)\/?>/gi;
    let m;
    const toRemove = [];
    while ((m = includeRe.exec(c)) !== null) {
      const attrs = (m[1] || '') + (m[3] || '');
      const typeM = attrs.match(/\btype="([^"]+)"/i);
      const type = (typeM ? typeM[1] : 'reference').toLowerCase();
      const source = m[2];
      if (type !== 'reference') continue;
      if (ALLOWED_REFERENCE_SOURCES.test(source.replace(/^DATA:/i, ''))) continue;
      if (!includeTargetExists(projectRoot, source, dataRel)) {
        toRemove.push(m[0]);
      }
    }
    for (const block of toRemove) {
      if (c.includes(block)) {
        c = c.replace(block, '\n');
        log.push(`已删除指向不存在文件的 reference：${block.match(/source="([^"]+)"/i)?.[1] || '?'}`);
        changed = true;
      }
    }
  }

  if (!/<\?xml/i.test(c.trim())) {
    c = `<?xml version="1.0" encoding="utf-8"?>\n${c.trimStart()}`;
    log.push('已补全 XML 声明');
    changed = true;
  }

  return { content: c, log, changed };
}

/**
 * 校验 Mod.xml（净化后仍失败则拒绝写入）
 */
function validateModXmlContent(content, options = {}) {
  const insurrection = !!options.insurrection;
  const errors = [];
  const warnings = [];

  const c = String(content || '');
  if (c.trim().length < 20) errors.push('Mod.xml 内容过短或为空');
  if (/<<\?xml/i.test(c)) errors.push('XML 声明损坏（<<?xml）');
  if (!/<AssetDeclaration\b/i.test(c)) errors.push('缺少 AssetDeclaration 根节点');

  const closeMatch = c.match(/<\/AssetDeclaration>/i);
  if (closeMatch) {
    const tail = c.slice(closeMatch.index + closeMatch[0].length).trim();
    if (tail.length > 0 && /<(?:Include|LogicCommand|GameObject)\b/i.test(tail)) {
      errors.push('存在 </AssetDeclaration> 之后的节点');
    }
  } else if (c.trim().length > 20) {
    errors.push('缺少 </AssetDeclaration> 闭合标签');
  }

  if (BROKEN_INCLUDE_LINE_RE.test(c)) errors.push('存在残缺的 Include 行（缺少 <）');

  const includeRe = /<Include\b[^>]*\bsource="([^"]+)"/gi;
  let m;
  while ((m = includeRe.exec(c)) !== null) {
    if (CJK_RE.test(m[1])) errors.push(`Include source 含中文路径：${m[1]}`);
  }

  if (insurrection) {
    if (DIRECT_UNIT_REF_RE.test(c)) {
      errors.push(
        '标准 MOD 结构下 Mod.xml 禁止 reference 直接引用单位/GameObject；请用 type="all" 引用 Soviet.xml、Common.xml 等聚合'
      );
    }
    if (/<Include\b[^>]*\bsource="DATA:[^"]*\/Units\//i.test(c)) {
      warnings.push('检测到 data/.../Units/ 路径，标准 MOD 应使用 Infantry/Vehicle 分类目录');
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

/**
 * 所有 Mod.xml 写入必经此函数
 * @returns {{ allowed: boolean, content: string, errors: string[], warnings: string[], sanitizeLog: string[], sanitized: boolean }}
 */
function prepareModXmlWrite(rel, content, projectRoot, options = {}) {
  const insurrection =
    options.insurrection != null ? options.insurrection : isInsurrectionProject(projectRoot);

  const sanitized = sanitizeModXmlContent(content, {
    insurrection,
    projectRoot,
    dataRel: options.dataRel || 'data',
  });

  const validation = validateModXmlContent(sanitized.content, { insurrection, projectRoot });
  const errors = [...validation.errors];
  const result = {
    allowed: errors.length === 0,
    content: sanitized.content,
    errors,
    warnings: validation.warnings,
    sanitizeLog: sanitized.log,
    sanitized: sanitized.changed,
  };

  if (!result.allowed && options.strictReject !== false) {
    result.rejected = true;
    result.message =
      `Mod.xml 写入被拒绝：${errors.join('；')}。` +
      (insurrection
        ? ' 标准 MOD 项目请只 Include 原版三件套(reference) + Common.xml/Soviet.xml 等 type="all" 聚合。'
        : ' 所有 Include 必须在 <Includes> 内，且不得在 </AssetDeclaration> 之后追加。');
  }

  return result;
}

/** 读取磁盘 Mod.xml 并净化（创建单位等流程收尾用，不新增 Include） */
function sanitizeModXmlOnDisk(projectRoot, options = {}) {
  const mod = findModXml(projectRoot);
  if (!mod) return { changed: false, rel: null, log: ['未找到 Mod.xml'] };

  const raw = fs.readFileSync(mod.full, 'utf-8');
  const prep = prepareModXmlWrite(mod.rel, raw, projectRoot, {
    insurrection: options.insurrection,
    strictReject: false,
  });

  if (!prep.sanitized && prep.allowed) {
    return { changed: false, rel: mod.rel, log: ['Mod.xml 无需净化'] };
  }

  if (prep.sanitized) {
    fs.writeFileSync(mod.full, prep.content, 'utf-8');
  }

  return {
    changed: prep.sanitized,
    rel: mod.rel,
    log: prep.sanitizeLog,
    errors: prep.errors,
  };
}

module.exports = {
  isModXmlRel,
  isInsurrectionProject,
  sanitizeModXmlContent,
  validateModXmlContent,
  prepareModXmlWrite,
  sanitizeModXmlOnDisk,
};
