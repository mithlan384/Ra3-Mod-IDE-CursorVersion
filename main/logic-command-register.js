// main/logic-command-register.js —— 为新单位生成并注册 LogicCommand

const fs = require('fs');
const path = require('path');
const { getCurrentFolder } = require('./project-state');

function isLogicCommandRegistryFile(rel) {
  const r = String(rel || '').replace(/\\/g, '/');
  if (/logiccommandset/i.test(r)) return false;
  if (/\/common\/logiccommandset\//i.test(r)) return false;
  if (/commonlogiccommandset\.xml$/i.test(r)) return false;
  return /commanddata\.xml$/i.test(r) || /(?:^|\/)logiccommand\.xml$/i.test(r);
}

function findLogicCommandFile(root) {
  const candidates = [
    'data/CommandData.xml',
    'Data/CommandData.xml',
    'data/LogicCommand.xml',
    'Data/LogicCommand.xml',
    'data/GlobalData/LogicCommand.xml',
    'Data/GlobalData/LogicCommand.xml',
  ];
  for (const rel of candidates) {
    if (!isLogicCommandRegistryFile(rel)) continue;
    const full = path.join(root, rel).replace(/\\/g, '/');
    if (fs.existsSync(full)) return rel.replace(/\\/g, '/');
  }
  const hits = [];
  function walk(dir, depth) {
    if (depth > 5) return;
    let items;
    try {
      items = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const item of items) {
      if (item.isDirectory() && !item.name.startsWith('.')) {
        walk(path.join(dir, item.name), depth + 1);
      } else if (item.name.endsWith('.xml')) {
        const rel = path.relative(root, path.join(dir, item.name)).replace(/\\/g, '/');
        if (isLogicCommandRegistryFile(rel)) hits.push(rel);
      }
    }
  }
  walk(root, 0);
  hits.sort((a, b) => {
    const score = (p) =>
      (/commanddata\.xml$/i.test(p) ? 0 : 1) + (/globaldata/i.test(p) ? 0 : 2);
    return score(a) - score(b);
  });
  return hits[0] || 'data/CommandData.xml';
}

function buildLogicCommandSnippet(unitId, options = {}) {
  const cmdId = `Command_Construct${unitId}`;
  const upgrade = options.requiredUpgrade
    ? `\n      <RequiredUpgrade>${options.requiredUpgrade}</RequiredUpgrade>`
    : '';
  return `
    <!-- ${unitId} — AI 自动注册 -->
    <LogicCommand Type="UNIT_BUILD" id="${cmdId}">
      <Object>${unitId}</Object>${upgrade}
    </LogicCommand>
`;
}

function buildCommandSetSnippet(unitId) {
  const cmdId = `Command_Construct${unitId}`;
  return `
    <!-- ${unitId} 命令集（需手动挂到兵营/重工 LogicCommandSet） -->
    <LogicCommandSet id="${unitId}CommandSet">
      <Cmd>${cmdId}</Cmd>
    </LogicCommandSet>
`;
}

function prepareLogicCommandRegistration(unitId, root) {
  const projectRoot = root || getCurrentFolder();
  const rel = findLogicCommandFile(projectRoot);
  if (!isLogicCommandRegistryFile(rel)) {
    return {
      relativePath: rel,
      fullPath: path.join(projectRoot, rel).replace(/\\/g, '/'),
      snippet: buildLogicCommandSnippet(unitId),
      cmdId: `Command_Construct${unitId}`,
      exists: false,
      isNew: false,
      skipped: true,
      skipReason: `目标不是 LogicCommand 注册文件（${rel}），请使用单位目录内 LogicCommand.xml 或 data/CommandData.xml`,
    };
  }
  const full = path.join(projectRoot, rel).replace(/\\/g, '/');
  const cmdId = `Command_Construct${unitId}`;
  const snippet = buildLogicCommandSnippet(unitId);
  const exists = fs.existsSync(full) && fs.readFileSync(full, 'utf-8').includes(cmdId);
  const isNew = !fs.existsSync(full);
  let newFileContent = null;
  if (isNew) {
    newFileContent = `<?xml version="1.0" encoding="utf-8"?>
<AssetDeclaration xmlns="uri:ea.com:eala:asset">
  <Tags></Tags>
  <Includes></Includes>
${snippet}${buildCommandSetSnippet(unitId)}
</AssetDeclaration>
`;
  }
  return {
    relativePath: rel,
    fullPath: full,
    snippet,
    cmdId,
    exists,
    isNew,
    newFileContent,
  };
}

module.exports = {
  findLogicCommandFile,
  isLogicCommandRegistryFile,
  buildLogicCommandSnippet,
  buildCommandSetSnippet,
  prepareLogicCommandRegistration,
};
