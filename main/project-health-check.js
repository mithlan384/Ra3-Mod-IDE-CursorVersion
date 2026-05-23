// main/project-health-check.js —— 扫描项目时检测可能导致 BAE 编译失败的结构

const fs = require('fs');
const path = require('path');
const { findModXml } = require('./mod-register');
const { assessModXml } = require('./mod-xml-repair');
const { unitXmlNeedsRepair } = require('./unit-xml-repair');

function readTextSafe(filePath, max = 100000) {
  try {
    const buf = fs.readFileSync(filePath);
    return (buf.length > max ? buf.subarray(0, max) : buf).toString('utf-8');
  } catch {
    return '';
  }
}

function resolveDataDir(root) {
  if (fs.existsSync(path.join(root, 'data'))) return path.join(root, 'data');
  if (fs.existsSync(path.join(root, 'Data'))) return path.join(root, 'Data');
  return path.join(root, 'data');
}

const RISK_META = {
  BARE_INCLUDE: {
    severity: 'error',
    title: 'Include 未包在 <Includes> 内',
    detail: 'BinaryAssetBuilder 会报 Critical: Include has no id attribute，导致 mod.manifest 无法生成。',
    fix: '将 <Include> 移入 <Includes>…</Includes>，或改为继承 SDK 官方单位（Insurrection 标准）。',
  },
  BAD_WEAPON_SLOT: {
    severity: 'error',
    title: 'WeaponSlot 写法不符合 SDK',
    detail: '应使用 WeaponSlotHardpoint + <Weapon Template="…"/>，或继承官方单位 XML。',
    fix: '重写单位 XML，继承 SovietAntiInfantryInfantry 等模板。',
  },
  BARE_BASE_INHERIT: {
    severity: 'error',
    title: '极简 BaseInfantry/BaseVehicle 继承',
    detail: '直接 inheritFrom Base* 且缺少完整 Includes/资产，极易编译失败。',
    fix: '改用 DATA:SageXml/BaseObjects/… + 标准结构，或 instance 继承完整官方单位。',
  },
  MOD_REF_UNIT: {
    severity: 'warn',
    title: 'Mod.xml 用 reference 引用自建单位',
    detail: '标准 MOD 对自建内容应使用 type="all" 聚合，reference 仅用于原版 Static/Global/Audio。',
    fix: '将单位改为 faction 聚合 + type="all"，或改用标准 Mod.xml 结构。',
  },
  MISSING_COMMAND_SET: {
    severity: 'warn',
    title: '单位缺少 LogicCommandSet 定义',
    detail: 'GameObject 引用了 CommandSet，但项目内未找到对应 LogicCommandSet。',
    fix: '在 CommandData.xml 或单位目录添加 LogicCommandSet，并注册 LogicCommand。',
  },
  INVALID_COMMAND_CMD: {
    severity: 'warn',
    title: 'CommandSet 含可能无效的 Cmd',
    detail: '如 Command_MoveTo 等可能未在 MOD 内定义，编译时会出现 Unknown asset 警告。',
    fix: 'CommandSet 仅保留 Command_Construct{单位Id}，或从官方 LogicCommandSet 复制有效 Cmd。',
  },
  SPECIAL_POWER_NOT_INCLUDED: {
    severity: 'warn',
    title: 'SpecialPower 未注册进编译',
    detail: 'LogicCommand 引用了 SpecialPowerTemplate，但包装 XML 未 Include SpecialPowerTemplates.xml 或模板缺少对应 id。',
    fix: '在单位包装 XML 添加 Include；修正 SpecialPowerTemplates.xml 的 xmlns 为 uri:ea.com:eala:asset。',
  },
  LOGIC_COMMAND_IN_COMMANDSET: {
    severity: 'warn',
    title: 'LogicCommandSet.xml 混入了 LogicCommand',
    detail: 'LogicCommand 应写在 LogicCommand.xml，LogicCommandSet.xml 只应含 <LogicCommandSet>。',
    fix: '将 <LogicCommand> 移到同目录 LogicCommand.xml，CommandSet 文件仅保留 Cmd 列表。',
  },
  MOD_XML_BAD: {
    severity: 'error',
    title: 'Mod.xml 异常',
    detail: '缺失、为空或格式无效，无法通过编译入口。',
    fix: '生成/修复 data/Mod.xml 并正确 Include 子文件。',
  },
  LAYOUT_RISKY: {
    severity: 'info',
    title: '非 Insurrection 标准布局',
    detail: '当前为极简/CommandData 集中式布局，继续沿用可能沿用旧有错误写法。',
    fix: '新建单位建议选「标准 MOD 格式」；执意沿用本项目请先修复下列 error 项。',
  },
};

function pushRisk(risks, seen, code, file, extra = '') {
  const key = `${code}|${file}`;
  if (seen.has(key)) return;
  seen.add(key);
  const meta = RISK_META[code] || { severity: 'warn', title: code, detail: '', fix: '' };
  risks.push({
    code,
    severity: meta.severity,
    file: file || '',
    title: meta.title,
    message: meta.detail + (extra ? ` ${extra}` : ''),
    fix: meta.fix,
  });
}

function findLogicCommandSetsInProject(root) {
  const sets = new Set();
  const dataDir = resolveDataDir(root);
  if (!fs.existsSync(dataDir)) return sets;

  function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory() && !ent.name.startsWith('.')) walk(full);
      else if (/\.xml$/i.test(ent.name)) {
        const c = readTextSafe(full, 80000);
        let m;
        const re = /<LogicCommandSet\b[^>]*\bid="([^"]+)"/gi;
        while ((m = re.exec(c)) !== null) sets.add(m[1]);
      }
    }
  }
  walk(dataDir);
  return sets;
}

/**
 * @param {string} projectRoot
 * @param {object} [conventions] - analyzeProjectConventions 结果
 */
function analyzeCompileHealth(projectRoot, conventions = null) {
  const root = projectRoot.replace(/\\/g, '/');
  const risks = [];
  const seen = new Set();

  const modState = assessModXml(root);
  if (modState.status !== 'ok') {
    pushRisk(risks, seen, 'MOD_XML_BAD', modState.rel || 'data/Mod.xml', modState.hint || '');
  }

  const mod = findModXml(root);
  if (mod) {
    const modContent = readTextSafe(mod.full);
    const refUnit = modContent.match(
      /<Include[^>]*type="reference"[^>]*source="DATA:[^"]*(?:Units|Infantry|Vehicle)[^"]*\.xml"/gi
    );
    if (refUnit) {
      pushRisk(risks, seen, 'MOD_REF_UNIT', mod.rel);
    }
  }

  const dataDir = resolveDataDir(root);
  const commandSets = findLogicCommandSetsInProject(root);
  const invalidCmdPattern = /<Cmd>Command_(?:MoveTo|AttackMoveTo|Attack|Guard|Stop)\b/i;

  if (fs.existsSync(dataDir)) {
    function walk(dir) {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory() && !ent.name.startsWith('.')) walk(full);
        else if (/\.xml$/i.test(ent.name) && !/^mod\.xml$/i.test(ent.name)) {
          const content = readTextSafe(full);
          const relPath = path.relative(root, full).replace(/\\/g, '/');

          if (unitXmlNeedsRepair(content)) {
            if (
              /<AssetDeclaration[^>]*>[\s\S]*?<Include\b/i.test(content) &&
              !/<Includes>/i.test(content)
            ) {
              pushRisk(risks, seen, 'BARE_INCLUDE', relPath);
            }
            if (/<WeaponSlot\b/i.test(content)) {
              pushRisk(risks, seen, 'BAD_WEAPON_SLOT', relPath);
            }
            if (
              /inheritFrom="Base(?:Infantry|Vehicle|Aircraft)"/i.test(content) &&
              !/type="instance"\s+source="DATA:[^"]+\/Units\//i.test(content)
            ) {
              pushRisk(risks, seen, 'BARE_BASE_INHERIT', relPath);
            }
          }

          if (invalidCmdPattern.test(content) && /<LogicCommandSet\b/i.test(content)) {
            pushRisk(risks, seen, 'INVALID_COMMAND_CMD', relPath);
          }

          const goRe =
            /<GameObject\b[^>]*\bid="([^"]+)"[^>]*\bCommandSet="([^"]+)"/gi;
          let gm;
          while ((gm = goRe.exec(content)) !== null) {
            const csId = gm[2];
            if (csId && !commandSets.has(csId)) {
              pushRisk(
                risks,
                seen,
                'MISSING_COMMAND_SET',
                relPath,
                `单位 ${gm[1]} 引用 ${csId}`
              );
            }
          }
        }
      }
    }
    walk(dataDir);
  }

  try {
    const { scanSpecialPowerGaps, findPollutedCommandSetFiles } = require('./special-power-repair');
    for (const g of scanSpecialPowerGaps(root)) {
      pushRisk(
        risks,
        seen,
        'SPECIAL_POWER_NOT_INCLUDED',
        g.wrapperRel,
        `单位目录 ${g.unitFolder} 引用 ${g.powerId}`
      );
    }
    for (const p of findPollutedCommandSetFiles(root)) {
      pushRisk(risks, seen, 'LOGIC_COMMAND_IN_COMMANDSET', p.rel);
    }
  } catch (e) {
    console.warn('[project-health-check] special-power scan:', e.message);
  }

  const layout = conventions?.layoutProfile || 'unknown';
  if (layout !== 'sdk-insurrection' && risks.some((r) => r.severity === 'error')) {
    pushRisk(risks, seen, 'LAYOUT_RISKY', '', `当前布局：${layout}`);
  } else if (layout !== 'sdk-insurrection' && layout !== 'unknown') {
    pushRisk(risks, seen, 'LAYOUT_RISKY', '');
  }

  const errorCount = risks.filter((r) => r.severity === 'error').length;
  const warnCount = risks.filter((r) => r.severity === 'warn').length;

  return {
    risks,
    errorCount,
    warnCount,
    hasBlockingIssues: errorCount > 0,
    summary:
      errorCount > 0
        ? `发现 ${errorCount} 项可能导致编译失败的问题${warnCount ? `，另有 ${warnCount} 项警告` : ''}`
        : warnCount > 0
          ? `发现 ${warnCount} 项结构警告，建议修复后再编译`
          : '未发现已知的编译高风险结构',
  };
}

function formatHealthReportBlock(health) {
  if (!health?.risks?.length) {
    return `\n### 编译健康检查\n\n✅ ${health?.summary || '未发现高风险结构'}\n`;
  }

  let text = `\n### ⚠️ 编译健康检查\n\n**${health.summary}**\n\n`;
  const order = { error: 0, warn: 1, info: 2 };
  const sorted = [...health.risks].sort(
    (a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9)
  );

  for (const r of sorted.slice(0, 20)) {
    const icon = r.severity === 'error' ? '🔴' : r.severity === 'warn' ? '🟡' : '🔵';
    text += `${icon} **${r.title}**`;
    if (r.file) text += ` — \`${r.file}\``;
    text += `\n   - ${r.message}\n   - 建议：${r.fix}\n`;
  }
  if (health.risks.length > 20) {
    text += `\n*另有 ${health.risks.length - 20} 项未列出*\n`;
  }

  if (health.hasBlockingIssues) {
    text += `\n> **若坚持「当前项目格式」**：将沿用现有目录习惯，但**不会自动消除**上述错误；新建/修改文件仍可能编译失败。建议先修复 🔴 项，或改用 **标准 MOD 格式** 新建内容。\n`;
  }
  return text;
}

/** 从 ErrorLog 文本推断根因（供修复报告） */
function inferRootCauseFromErrorText(errorText) {
  const causes = [];
  const t = String(errorText || '');

  if (/has no id attribute/i.test(t)) {
    causes.push({
      rootCause: '单位 XML 中 <Include> 未放在 <Includes> 块内',
      fixAction: '重写单位 XML：所有 Include 必须在 <Includes> 内，或继承 SDK 官方单位文件',
    });
  }
  if (/unexpected WeaponSlot|Bad XML/i.test(t)) {
    causes.push({
      rootCause: 'WeaponSetUpdate 使用了简化的 <WeaponSlot>，不符合 RA3 schema',
      fixAction: '改为 WeaponSlotHardpoint + Weapon，或 instance 继承 SovietAntiInfantryInfantry 等',
    });
  }
  if (/XmlFormattingError/i.test(t) && /commanddata\.xml/i.test(t)) {
    causes.push({
      rootCause: 'CommandData.xml 格式错误：LogicCommand/LogicCommandSet 写在 </AssetDeclaration> 之外',
      fixAction: '将孤儿节点移入 AssetDeclaration 内，并保证文件只有一个根闭合标签',
    });
  }
  if (/未生成 mod\.manifest/i.test(t)) {
    causes.push({
      rootCause: 'BinaryAssetBuilder 未成功完成（多为上游 XML Critical 导致）',
      fixAction: '先修复 ErrorLog 中的 Critical/Error，manifest 会由编译器自动生成，无需手写 .manifest',
    });
  }
  if (/\.manifest, file not found/i.test(t) && !causes.length) {
    causes.push({
      rootCause: '预编译 manifest 缓存缺失（多为首次编译该文件或上次编译失败）',
      fixAction: '修复单位 XML 后重新编译；.manifest 是 builtmods 输出，不是源码文件',
    });
  }
  if (/缺少.*mod\.xml|missing.*mod\.xml/i.test(t)) {
    causes.push({
      rootCause: '缺少或无效的 data/Mod.xml',
      fixAction: '生成 AssetDeclaration 版 Mod.xml 并注册 data 下 XML',
    });
  }
  if (/Unknown asset\s+'SpecialPowerTemplate:/i.test(t)) {
    causes.push({
      rootCause:
        'LogicCommand 引用了 SpecialPowerTemplate，但该模板未通过单位包装 XML 的 Include 进入编译',
      fixAction:
        '在对应单位包装 XML 添加 <Include type="all" source="单位目录/SpecialPowerTemplates.xml" />，并确保模板 xmlns 为 uri:ea.com:eala:asset',
    });
  }

  return causes;
}

function formatRootCauseSection(causes) {
  if (!causes.length) return '';
  let s = `## 根因分析\n\n`;
  causes.forEach((c, i) => {
    s += `${i + 1}. **${c.rootCause}**\n   - 修复：${c.fixAction}\n`;
  });
  s += `\n> .manifest 文件在 \`builtmods\` 目录，由编译生成；标准 MOD 源码里通常不会出现。\n\n`;
  return s;
}

module.exports = {
  analyzeCompileHealth,
  formatHealthReportBlock,
  inferRootCauseFromErrorText,
  formatRootCauseSection,
  RISK_META,
};
