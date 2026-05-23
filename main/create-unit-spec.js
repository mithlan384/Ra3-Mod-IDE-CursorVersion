// main/create-unit-spec.js —— 从自然语言解析新建单位数值与建造前提

const BUILD_PREREQ_BY_SIDE = {
  Soviet: { requiredObject: 'SovietPowerPlantAdvanced', label: '苏军超级反应堆（高科）' },
  Allied: { requiredObject: 'AlliedTechStructure', label: '盟军高科' },
  Japan: { requiredObject: 'JapanTechStructure', label: '帝国高科' },
};

const BARRACKS_COMMAND_SET = {
  Soviet: 'SovietBarracksCommandSet',
  Allied: 'AlliedBarracksCommandSet',
  Japan: 'JapanBarracksCommandSet',
};

function firstInt(text, patterns) {
  for (const re of patterns) {
    const m = String(text || '').match(re);
    if (m && m[1]) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return null;
}

function inferTechLevel(text) {
  if (/T3|三级|高科|高级科技|Tech\s*3|tech3/i.test(text)) return 3;
  if (/T2|二级|中级科技|Tech\s*2|tech2/i.test(text)) return 2;
  return null;
}

function inferSideFromText(text) {
  if (/帝国|日本|Japan|Imperial/.test(text)) return 'Japan';
  if (/盟军|Allied|Allies|维和/.test(text)) return 'Allied';
  if (/苏军|苏联|Soviet|动员|磁暴|铁锤|天启/.test(text)) return 'Soviet';
  return null;
}

/**
 * @param {string} rawMessage
 * @param {{ side?: string, displayName?: string, kind?: string }} [hints]
 */
function parseCreateUnitSpec(rawMessage, hints = {}) {
  const text = `${hints.displayName || ''} ${rawMessage || ''}`;
  const side =
    hints.side && BARRACKS_COMMAND_SET[hints.side]
      ? hints.side
      : inferSideFromText(text) || 'Soviet';

  const techLevel = inferTechLevel(text);
  const wantsTechBuilding =
    techLevel >= 3 ||
    /高科|超级反应堆|核反应堆|先进电厂|PowerPlantAdvanced|TechStructure/i.test(text);

  let buildPrereq = null;
  if (wantsTechBuilding) {
    buildPrereq = BUILD_PREREQ_BY_SIDE[side] || BUILD_PREREQ_BY_SIDE.Soviet;
  }

  return {
    buildCost: firstInt(text, [
      /(?:造价|费用|价格|成本)\s*[:：]?\s*(\d+)/i,
      /(\d+)\s*(?:矿|ore|造价|费用)/i,
    ]),
    maxHealth: firstInt(text, [
      /(?:血量|生命|HP|生命值)\s*[:：]?\s*(\d+)/i,
      /(\d+)\s*(?:血|HP|生命)/i,
    ]),
    speed: firstInt(text, [
      /(?:移速|速度|行走速度|移动速度)\s*[:：]?\s*(\d+)/i,
      /(\d+)\s*(?:速|移速)/i,
    ]),
    techLevel,
    side,
    buildPrereq,
    barracksCommandSetId: BARRACKS_COMMAND_SET[side] || BARRACKS_COMMAND_SET.Soviet,
  };
}

function buildGameDependencyXml(requiredObject) {
  if (!requiredObject) return '';
  return `
    <GameDependency id="ModuleTag_GameDependency">
      <RequiredObject>${requiredObject}</RequiredObject>
    </GameDependency>`;
}

function buildLocomotorSetXml(speed, kind = 'infantry') {
  if (speed == null) return '';
  const loc =
    kind === 'vehicle'
      ? 'TankLocomotor'
      : kind === 'aircraft'
        ? 'JetLocomotor'
        : 'TestReactiveLocomotorHUMAN';
  return `
    <LocomotorSet Locomotor="${loc}" Condition="NORMAL" Speed="${speed}" />`;
}

function applySpecToGameObjectXml(xml, spec, kind = 'infantry') {
  let out = String(xml || '');
  if (!out.includes('<GameObject')) return out;

  if (spec.buildCost != null) {
    if (/<BuildCost[^>]*Amount="/i.test(out)) {
      out = out.replace(/(<BuildCost[^>]*Amount=")(\d+)(")/i, `$1${spec.buildCost}$3`);
    } else if (/<ObjectResourceInfo>/i.test(out)) {
      out = out.replace(
        /(<ObjectResourceInfo>)/i,
        `$1\n      <BuildCost Account="=$ACCOUNT_ORE" Amount="${spec.buildCost}"/>`
      );
    }
  }

  if (spec.maxHealth != null) {
    if (/MaxHealth="/i.test(out)) {
      out = out.replace(/(MaxHealth=")(\d+)(")/i, `$1${spec.maxHealth}$3`);
    } else if (/<Body>/i.test(out)) {
      out = out.replace(
        /(<Body>)/i,
        `$1\n      <ActiveBody id="ModuleTag_Body" MaxHealth="${spec.maxHealth}"/>`
      );
    }
  }

  if (spec.speed != null) {
    if (/<LocomotorSet/i.test(out)) {
      out = out.replace(/(<LocomotorSet[^>]*\bSpeed=")(\d+)(")/i, `$1${spec.speed}$3`);
    } else {
      const block = buildLocomotorSetXml(spec.speed, kind);
      out = out.replace(/(<GameObject[^>]*>)/i, `$1${block}`);
    }
  }

  if (spec.buildPrereq?.requiredObject && !/<GameDependency/i.test(out)) {
    const dep = buildGameDependencyXml(spec.buildPrereq.requiredObject);
    out = out.replace(/(<GameObject[^>]*>)/i, `$1${dep}`);
  }

  return out;
}

module.exports = {
  parseCreateUnitSpec,
  buildGameDependencyXml,
  buildLocomotorSetXml,
  applySpecToGameObjectXml,
  BARRACKS_COMMAND_SET,
  BUILD_PREREQ_BY_SIDE,
};
