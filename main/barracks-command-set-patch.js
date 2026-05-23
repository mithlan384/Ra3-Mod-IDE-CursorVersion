// main/barracks-command-set-patch.js —— 向兵营 LogicCommandSet 追加建造命令

const fs = require('fs');
const path = require('path');
const { BARRACKS_COMMAND_SET } = require('./create-unit-spec');

const PATCH_FILE_CANDIDATES = [
  'data/Common/LogicCommandSet.xml',
  'Data/Common/LogicCommandSet.xml',
  'data/GlobalData/LogicCommandSet.xml',
  'Data/GlobalData/LogicCommandSet.xml',
];

const DEFAULT_PATCH_REL = 'data/Common/LogicCommandSet.xml';

function findBarracksPatchFile(root) {
  for (const rel of PATCH_FILE_CANDIDATES) {
    const full = path.join(root, rel).replace(/\\/g, '/');
    if (!fs.existsSync(full)) continue;
    try {
      const c = fs.readFileSync(full, 'utf-8');
      if (/<LogicCommandSet\b/i.test(c)) return rel.replace(/\\/g, '/');
    } catch (e) {}
  }
  return DEFAULT_PATCH_REL;
}

function ensureXaiNamespace(content) {
  let c = String(content || '');
  if (/xmlns:xai=/i.test(c)) return c;
  if (/<LogicCommandSet[^>]*\bxai:joinAction/i.test(c) || /\bxai:joinAction/i.test(c)) {
    c = c.replace(
      /<AssetDeclaration\b([^>]*)>/i,
      (m, attrs) =>
        /xmlns:xai=/i.test(attrs)
          ? m
          : `<AssetDeclaration${attrs} xmlns:xai="uri:ea.com:eala:asset:instance">`
    );
  }
  return c;
}

function ensurePatchFileContent(rel) {
  return `<?xml version="1.0" encoding="utf-8"?>
<AssetDeclaration xmlns="uri:ea.com:eala:asset" xmlns:xai="uri:ea.com:eala:asset:instance">
  <Includes>
    <!-- 兵营/工厂建造队列补丁（追加 Cmd 到原版 CommandSet） -->
  </Includes>
</AssetDeclaration>
`;
}

function appendCmdToCommandSet(content, commandSetId, cmdId) {
  const cmdLine = `    <Cmd>${cmdId}</Cmd>`;
  if (content.includes(cmdLine) || content.includes(`<Cmd>${cmdId}</Cmd>`)) {
    return { content, changed: false, already: true };
  }

  const blockRe = new RegExp(
    `<LogicCommandSet\\b[^>]*\\bid="${commandSetId}"[^>]*>([\\s\\S]*?)</LogicCommandSet>`,
    'i'
  );
  const m = content.match(blockRe);
  if (m) {
    const insertAt = m.index + m[0].lastIndexOf('</LogicCommandSet>');
    const patched =
      content.slice(0, insertAt) + `\n${cmdLine}` + content.slice(insertAt);
    return { content: patched, changed: true, already: false };
  }

  const appendBlock = `
  <LogicCommandSet id="${commandSetId}" xai:joinAction="Append">
${cmdLine}
  </LogicCommandSet>
`;
  const patched = content.replace(/<\/AssetDeclaration>\s*$/i, `${appendBlock}\n</AssetDeclaration>\n`);
  return { content: patched, changed: true, already: false, created: true };
}

/**
 * 将 Command_Construct{unitId} 挂到阵营兵营 CommandSet
 */
function patchBarracksCommandSet(projectRoot, { unitId, side = 'Soviet' }) {
  const root = String(projectRoot || '').replace(/\\/g, '/');
  if (!root || !unitId) return { changed: false, log: [] };

  const commandSetId = BARRACKS_COMMAND_SET[side] || BARRACKS_COMMAND_SET.Soviet;
  const cmdId = `Command_Construct${unitId}`;
  const rel = findBarracksPatchFile(root);
  const full = path.join(root, rel).replace(/\\/g, '/');
  const log = [];

  let content = fs.existsSync(full)
    ? fs.readFileSync(full, 'utf-8')
    : ensurePatchFileContent(rel);

  const result = appendCmdToCommandSet(ensureXaiNamespace(content), commandSetId, cmdId);
  if (result.already) {
    log.push(`${commandSetId} 已包含 ${cmdId}`);
    return { changed: false, log, rel, cmdId, commandSetId };
  }

  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, result.content, 'utf-8');
  log.push(
    result.created
      ? `已在 ${rel} 追加 ${commandSetId}（Append）并加入 ${cmdId}`
      : `已在 ${rel} 的 ${commandSetId} 内加入 ${cmdId}`
  );

  const incLog = ensurePatchFileInModIncludes(root, rel);
  log.push(...incLog);

  return { changed: true, log, rel, cmdId, commandSetId };
}

function ensurePatchFileInModIncludes(root, patchRel) {
  const log = [];
  const includeSource = patchRel.replace(/^data\//i, '');
  const tag = `<Include type="all" source="${includeSource}" />`;
  const aggCandidates = [
    'data/Common/Common.xml',
    'Data/Common/Common.xml',
    'data/Common.xml',
    'Data/Common.xml',
  ];
  for (const aggRel of aggCandidates) {
    const aggFull = path.join(root, aggRel).replace(/\\/g, '/');
    if (!fs.existsSync(aggFull)) continue;
    let content = fs.readFileSync(aggFull, 'utf-8');
    if (content.includes(includeSource) || content.includes(patchRel)) {
      log.push(`${aggRel} 已引用 ${includeSource}`);
      return log;
    }
    if (/<Includes>/i.test(content)) {
      content = content.replace(/<Includes>/i, `<Includes>\n    ${tag}`);
    } else {
      content = content.replace(
        /<AssetDeclaration[^>]*>/i,
        (m) => `${m}\n  <Includes>\n    ${tag}\n  </Includes>`
      );
    }
    fs.writeFileSync(aggFull, content, 'utf-8');
    log.push(`已在 ${aggRel} 加入对 ${includeSource} 的引用`);
    return log;
  }
  log.push(`请手动在 Common 聚合 XML 中加入：${tag}`);
  return log;
}

module.exports = {
  findBarracksPatchFile,
  patchBarracksCommandSet,
};
