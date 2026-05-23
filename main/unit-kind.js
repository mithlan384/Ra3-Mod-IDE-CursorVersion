// main/unit-kind.js —— 从显示名/模板推断单位种类（无其它 main 模块依赖）

function inferUnitKind({ displayName, templateUnit, rawMessage }) {
  const text = `${displayName || ''} ${templateUnit || ''} ${rawMessage || ''}`;
  if (/飞机|飞行器|AIRCRAFT|AntiAir|Tengu|天狗|直升机|轰炸机/i.test(text)) return 'aircraft';
  if (/坦克|车辆|战车|Tank|Vehicle|MyTank|铁锤|守护者|海啸|天启/i.test(text)) return 'vehicle';
  return 'infantry';
}

module.exports = { inferUnitKind };
