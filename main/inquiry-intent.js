// main/inquiry-intent.js —— 区分询问性指令与操作性指令

const OPERATIONAL_VERBS =
  /(?:修改|改成|设为|设置|创建|新建|制作|添加|删除|移除|移动|迁移|修复|解决|执行|动手|自动|扫描|打开|列出|搭建|框架|规范化|整理|写入|覆盖|生成|注册|挂载|加入|替换)/;

const INQUIRY_PATTERNS =
  /(?:如何|怎么|怎样|为什么|为何|是什么|什么意思|能否|可以吗|会不会|有没有|要不要|需不需要|区别|原理|含义|解释|说明一下|告诉我|帮我看|分析一下|诊断|怎么回事)/;

const EXPLICIT_FIX =
  /(?:修复|解决|处理|执行|动手|自动).{0,24}(?:编译|报错|错误)|(?:按|根据).{0,12}方案.{0,12}(?:修复|执行)|^\/fixbuild\b/i;

/**
 * 用户是否明确要求对项目执行写操作
 */
function isOperationalCommand(message) {
  const m = String(message || '').trim();
  if (!m) return false;
  if (EXPLICIT_FIX.test(m)) return true;
  if (/^\/tool\s+/i.test(m)) return true;
  if (/强制搜索|联网搜索|^\/search/i.test(m)) return false;
  if (OPERATIONAL_VERBS.test(m)) return true;
  if (/(新建|创建).{0,8}(单位|步兵|坦克|建筑)/.test(m)) return true;
  return false;
}

/**
 * 是否为以问答/咨询为主的消息（无明确操作动词）
 */
function isInquiryCommand(message) {
  const m = String(message || '').trim();
  if (!m) return false;
  if (isOperationalCommand(m)) return false;
  return INQUIRY_PATTERNS.test(m);
}

/**
 * 粘贴编译日志但未要求自动修复 → 咨询而非 fix_build
 */
function isBuildLogInquiryOnly(message) {
  const m = String(message || '');
  const { looksLikeBuildErrorMessage } = require('./build-error-fixer');
  if (!looksLikeBuildErrorMessage(m)) return false;
  const { looksLikeFixBuildIntent } = require('./build-error-fixer');
  return !looksLikeFixBuildIntent(m);
}

/**
 * 根据用户消息与上下文生成可选后续操作
 * @returns {Array<{id:string, label:string, message:string, variant?:string}>}
 */
function suggestFollowUpActions(message, context = {}) {
  const m = String(message || '');
  const actions = [];
  const hasProject = !!context.hasProject;

  if (hasProject) {
    const { looksLikeBuildErrorMessage } = require('./build-error-fixer');
    if (looksLikeBuildErrorMessage(m) || /Warning|ErrorLog|编译/.test(m)) {
      actions.push({
        id: 'fix_build',
        label: '自动修复编译问题',
        message: '请根据上述分析自动修复编译问题（会修改项目文件）',
        variant: 'primary',
      });
      if (/SpecialPower|Unknown asset/i.test(m)) {
        actions.push({
          id: 'fix_special_power',
          label: '修复 SpecialPower Include',
          message:
            '请自动修复 SpecialPowerTemplate Unknown asset：补包装 Include、修正 SpecialPowerTemplates.xml xmlns',
          variant: 'primary',
        });
      }
    }
    if (/单位|SpecialPower|LogicCommand|Mod\.xml|Include/.test(m)) {
      actions.push({
        id: 'scan_project',
        label: '扫描全部项目结构',
        message: '请扫描全部 MOD 项目文件并总结结构与风险',
      });
    }
    if (/(新建|创建).{0,6}(单位|步兵|坦克)/.test(m)) {
      actions.push({
        id: 'create_unit',
        label: '创建该单位',
        message: m.replace(/如何|怎么|能否/g, '').trim() || '请按刚才讨论的方案创建单位',
        variant: 'primary',
      });
    }
  }

  if (actions.length === 0 && hasProject) {
    actions.push({
      id: 'tool_plan',
      label: '按建议修改项目',
      message: '请按你刚才的建议修改项目中的相关文件',
      variant: 'primary',
    });
  }

  return actions.slice(0, 4);
}

module.exports = {
  isOperationalCommand,
  isInquiryCommand,
  isBuildLogInquiryOnly,
  suggestFollowUpActions,
};
