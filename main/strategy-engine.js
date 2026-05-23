// main/strategy-engine.js

const strategies = [];

/**
 * 注册策略（未来可从知识库加载）
 */
function registerStrategy(strategy) {
  strategies.push(strategy);
}

/**
 * 简单匹配（关键词 + 示例）
 */
function findBestStrategy(userInput) {
  userInput = userInput.toLowerCase();

  for (const s of strategies) {
    for (const example of s.examples) {
      if (userInput.includes(example.toLowerCase())) {
        return s;
      }
    }

    if (userInput.includes(s.intent_keyword)) {
      return s;
    }
  }

  return null;
}

/**
 * 从用户输入提取参数
 */
function extractParams(userInput, strategy) {
  const params = {};

  // 示例：提取文件路径
  if (strategy.pattern === 'open_file') {
    const match = userInput.match(/([a-zA-Z0-9_\/\\.-]+\.xml)/i);
    if (match) {
      params.filePath = match[1];
    }
  }

  return params;
}

/**
 * 根据模板生成执行计划
 */
function buildPlan(strategy, params) {
  return strategy.plan_template.map(step => {
    const args = {};

    for (const key in step.args) {
      const val = step.args[key];

      if (typeof val === 'string' && val.startsWith('{{')) {
        const paramName = val.replace('{{', '').replace('}}', '');
        args[key] = params[paramName];
      } else {
        args[key] = val;
      }
    }

    return {
      tool: step.tool,
      args
    };
  });
}

/**
 * 主入口
 */
function tryMatchStrategy(userInput) {
  const strategy = findBestStrategy(userInput);
  if (!strategy) return null;

  const params = extractParams(userInput, strategy);
  const plan = buildPlan(strategy, params);

  return {
    matched: true,
    strategy: strategy.pattern,
    plan
  };
}

module.exports = {
  registerStrategy,
  tryMatchStrategy
};