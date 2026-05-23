// main/command-data-repair.js —— 修复 CommandData.xml 结构（禁止在 </AssetDeclaration> 后 append）

const fs = require('fs');
const path = require('path');
const {
  findLogicCommandFile,
  isLogicCommandRegistryFile,
  buildLogicCommandSnippet,
  buildCommandSetSnippet,
} = require('./logic-command-register');

const ORPHAN_BLOCK_RE =
  /<!--[\s\S]*?-->|<Include\s[\s\S]*?\/?>|<LogicCommand[\s\S]*?<\/LogicCommand>|<LogicCommandSet[\s\S]*?<\/LogicCommandSet>/gi;

/**
 * 将 </AssetDeclaration> 之后的孤儿节点移回根内，保证仅有一个闭合标签
 */
function repairCommandDataStructure(content) {
  const raw = String(content || '');
  if (!/<AssetDeclaration\b/i.test(raw)) {
    return { content: raw, changed: false, orphansMoved: 0 };
  }

  const firstCloseIdx = raw.search(/<\/AssetDeclaration>/i);
  if (firstCloseIdx < 0) {
    return {
      content: raw.trimEnd() + '\n</AssetDeclaration>\n',
      changed: true,
      orphansMoved: 0,
    };
  }

  const head = raw.slice(0, firstCloseIdx);
  const tail = raw.slice(firstCloseIdx + '</AssetDeclaration>'.length);
  const orphanBlocks = tail.match(ORPHAN_BLOCK_RE) || [];

  if (!orphanBlocks.length && !/<\/AssetDeclaration>/i.test(tail)) {
    return { content: raw, changed: false, orphansMoved: 0 };
  }

  let inner = head.trimEnd();
  if (orphanBlocks.length) {
    inner += '\n' + orphanBlocks.join('\n') + '\n';
  }
  const fixed = `${inner}\n</AssetDeclaration>\n`;
  return {
    content: fixed,
    changed: true,
    orphansMoved: orphanBlocks.length,
  };
}

function insertBeforeRootClose(content, fragment) {
  const trimmed = String(fragment || '').trim();
  if (!trimmed) return content;
  const repaired = repairCommandDataStructure(content);
  let c = repaired.content;
  if (c.includes(trimmed)) return c;
  if (!/<\/AssetDeclaration>/i.test(c)) {
    return c.trimEnd() + '\n' + trimmed + '\n</AssetDeclaration>\n';
  }
  return c.replace(/<\/AssetDeclaration>\s*$/i, `${trimmed}\n</AssetDeclaration>\n`);
}

function extractUnitIdsFromCommandDataContent(content) {
  const ids = new Set();
  const re = /<Object>([^<]+)<\/Object>/gi;
  let m;
  while ((m = re.exec(String(content || '')))) {
    const id = m[1].trim();
    if (id && /^[A-Za-z][\w]*$/.test(id)) ids.add(id);
  }
  const cmdRe = /Command_Construct([A-Za-z][\w]*)/g;
  while ((m = cmdRe.exec(String(content || '')))) {
    if (m[1]) ids.add(m[1]);
  }
  return [...ids];
}

function extractCommandDataPathFromError(errorText) {
  const m = String(errorText || '').match(/commanddata\.xml/i);
  if (!m) return null;
  const lineM = String(errorText).match(/commanddata\.xml\s*\(line\s*(\d+)/i);
  return { file: 'data/CommandData.xml', line: lineM ? Number(lineM[1]) : null };
}

function isCommandDataXmlError(errorText) {
  const t = String(errorText || '');
  return /XmlFormattingError/i.test(t) && /commanddata\.xml/i.test(t);
}

/**
 * 修复 CommandData.xml（结构规范化 + 可选注册单位）
 */
function repairCommandDataXml(projectRoot, options = {}) {
  const log = [];
  const fixes = [];
  const root = String(projectRoot || '').replace(/\\/g, '/');
  const onProgress = options.onProgress || (() => {});
  const rel = findLogicCommandFile(root);
  if (!isLogicCommandRegistryFile(rel)) {
    return {
      fixes,
      log: [`跳过非注册目标文件：${rel}（LogicCommandSet 聚合文件不应写入 LogicCommand）`],
      changed: false,
      rel,
      skipped: true,
    };
  }
  const full = path.join(root, rel);

  let content = fs.existsSync(full)
    ? fs.readFileSync(full, 'utf-8')
    : `<?xml version="1.0" encoding="utf-8"?>
<AssetDeclaration xmlns="uri:ea.com:eala:asset">
  <Tags></Tags>
  <Includes></Includes>
</AssetDeclaration>
`;

  const structural = repairCommandDataStructure(content);
  if (structural.changed) {
    content = structural.content;
    log.push(
      structural.orphansMoved > 0
        ? `已将 ${structural.orphansMoved} 段孤儿节点移入 <AssetDeclaration> 内（修复 XmlFormattingError）`
        : '已规范化 CommandData.xml 根节点闭合'
    );
  }

  const unitIds = [
    ...new Set([...(options.unitIds || []), ...extractUnitIdsFromCommandDataContent(content)]),
  ];
  for (const unitId of unitIds) {
    const cmdId = `Command_Construct${unitId}`;
    const setId = `${unitId}CommandSet`;
    if (!content.includes(cmdId)) {
      content = insertBeforeRootClose(content, buildLogicCommandSnippet(unitId));
      log.push(`已注册 LogicCommand：${cmdId}`);
    }
    if (!content.includes(setId)) {
      content = insertBeforeRootClose(
        content,
        buildCommandSetSnippet(unitId).trim()
      );
      log.push(`已添加 LogicCommandSet：${setId}`);
    }
  }

  const final = repairCommandDataStructure(content);
  content = final.content;

  const changed = structural.changed || unitIds.length > 0 || final.changed;
  if (!changed) {
    return { fixes, log, changed: false, rel, content };
  }

  if (options.deferWrite) {
    return {
      fixes: [{ action: 'repairCommandDataXml', rel }],
      log,
      changed: true,
      rel,
      content,
      pendingWrites: [{ relativePath: rel, content }],
    };
  }

  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf-8');
  fixes.push({ action: 'repairCommandDataXml', rel });
  onProgress?.(`📝 已修复并保存 ${rel}`);
  return { fixes, log, changed: true, rel, content };
}

/**
 * 为多个单位注册 LogicCommand（先修结构再插入）
 */
function registerUnitsInCommandData(projectRoot, unitIds, onProgress, options = {}) {
  const log = [];
  const fixes = [];
  const ids = [...new Set((unitIds || []).filter(Boolean))];
  if (!ids.length) return { fixes, log, changed: false };

  const result = repairCommandDataXml(projectRoot, {
    unitIds: ids,
    onProgress,
    deferWrite: options.deferWrite,
  });
  return {
    fixes: result.fixes,
    log: [...log, ...result.log],
    changed: result.changed,
    rel: result.rel,
    content: result.content,
    pendingWrites: result.pendingWrites || [],
  };
}

module.exports = {
  repairCommandDataStructure,
  insertBeforeRootClose,
  isCommandDataXmlError,
  extractCommandDataPathFromError,
  repairCommandDataXml,
  registerUnitsInCommandData,
};
