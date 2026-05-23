// main/build-log-classify.js —— 编译输出按 Warning / Error / 普通日志分类

/** @typedef {'build'|'warning'|'error'} BuildLogChannel */

const WARNING_PATTERNS = [
  /\bWarning\s*:/i,
  /\b警告\s*[:：]/,
  /Unknown asset/i,
];

const ERROR_PATTERNS = [
  /\bCritical\s*:/i,
  /\bError\s*:/i,
  /\bFatal\s*:/i,
  /\b失败\b/,
  /\b错误\b/,
  /mod\.manifest.*(not found|missing|未生成)/i,
  /\b(exception|unable to|could not)\b/i,
];

/**
 * @param {string} line
 * @returns {BuildLogChannel}
 */
function classifyBuildLogLine(line) {
  const s = String(line || '').trim();
  if (!s) return 'build';

  if (WARNING_PATTERNS.some((re) => re.test(s))) return 'warning';
  if (ERROR_PATTERNS.some((re) => re.test(s))) return 'error';

  // 含 warning 字样但已被上面排除的，仍归 warning（兼容 IDE 旧路由）
  if (/\bwarning\b/i.test(s) || /警告/.test(s)) return 'warning';
  if (/\berror\b/i.test(s) || /错误|失败/.test(s)) return 'error';

  return 'build';
}

/**
 * @param {string} text
 * @returns {BuildLogChannel}
 */
function classifyBuildLogText(text) {
  const lines = String(text || '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return 'build';
  let hasError = false;
  let hasWarning = false;
  for (const line of lines) {
    const ch = classifyBuildLogLine(line);
    if (ch === 'error') hasError = true;
    if (ch === 'warning') hasWarning = true;
  }
  if (hasError) return 'error';
  if (hasWarning) return 'warning';
  return 'build';
}

module.exports = { classifyBuildLogLine, classifyBuildLogText };
