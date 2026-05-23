// main/agent-tool-schemas.js —— OpenAI function calling 工具 schema

const { getToolDefinitions } = require('./agent-planner');

function toJsonSchema(params) {
  const properties = {};
  const required = [];
  if (!params || typeof params !== 'object') {
    return { type: 'object', properties: {}, additionalProperties: true };
  }
  for (const [key, desc] of Object.entries(params)) {
    properties[key] = { type: 'string', description: String(desc) };
    required.push(key);
  }
  return {
    type: 'object',
    properties,
    required: required.length ? required : undefined,
    additionalProperties: true,
  };
}

function buildOpenAIToolsFromDefinitions() {
  const defs = getToolDefinitions();
  const tools = defs.map((d) => ({
    type: 'function',
    function: {
      name: d.name,
      description: d.description || d.name,
      parameters: toJsonSchema(d.parameters),
    },
  }));

  const extra = [
    {
      type: 'function',
      function: {
        name: 'readProjectFile',
        description:
          '读取项目内文本文件全文或指定行范围。修改 XML 前必须先读取确认结构。路径相对项目根目录。',
        parameters: {
          type: 'object',
          properties: {
            file: { type: 'string', description: '相对路径，如 data/Units/MyUnit.xml' },
            startLine: { type: 'number', description: '起始行（可选，从 1 开始）' },
            endLine: { type: 'number', description: '结束行（可选）' },
          },
          required: ['file'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'writeProjectFile',
        description:
          '写入或覆盖项目内文本文件（通常用于 XML）。会触发编辑器流式显示。大段 XML 优先用 createUnit/fixBuildErrors。**禁止**用此工具修改 Mod.xml 添加单位 Include（标准 MOD 结构下会被拒绝）；新建单位必须用 createUnit。',
        parameters: {
          type: 'object',
          properties: {
            file: { type: 'string', description: '相对路径' },
            content: { type: 'string', description: '完整文件内容' },
          },
          required: ['file', 'content'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'grepProject',
        description: '在项目中按关键词搜索文件内容，返回匹配行。用于定位单位 ID、Include、错误相关片段。',
        parameters: {
          type: 'object',
          properties: {
            pattern: { type: 'string', description: '搜索关键词（大小写不敏感）' },
          },
          required: ['pattern'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'refineInsurrectionLayout',
        description:
          '修正 data/ 小写与二级阵营聚合（Allied.xml→Allied/Allied.xml），同步 mod.babproj；单位已分包时用。',
        parameters: { type: 'object', properties: {} },
      },
    },
    {
      type: 'function',
      function: {
        name: 'migrateToInsurrectionStandard',
        description:
          '一键将当前 MOD 整理为标准 MOD 结构（Mod.xml all 聚合、单位分包、删重复路径）并严格验收。',
        parameters: {
          type: 'object',
          properties: {
            dryRun: { type: 'boolean', description: 'true 时仅生成计划不写入' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'assessInsurrectionCompliance',
        description: '验收是否符合 sdk-insurrection；未通过则不可声称已完成标准化。',
        parameters: { type: 'object', properties: {} },
      },
    },
    {
      type: 'function',
      function: {
        name: 'rebuildModXmlInsurrection',
        description: '仅重建 Mod.xml 与 Allied/Soviet/Japan.xml 聚合，不转换单位文件。',
        parameters: {
          type: 'object',
          properties: {
            dryRun: { type: 'boolean' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'deleteProjectFile',
        description: '删除项目内相对路径文件（勿删 data/Mod.xml）。',
        parameters: {
          type: 'object',
          properties: { file: { type: 'string' } },
          required: ['file'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'moveProjectFile',
        description: '移动或重命名项目内文件。',
        parameters: {
          type: 'object',
          properties: {
            from: { type: 'string' },
            to: { type: 'string' },
          },
          required: ['from', 'to'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'lookupXsdSymbol',
        description:
          'SDK XSD 符号表：由 element/模块/枚举名查对应 .xsd 路径（不扫 MOD，极快）。XML 写法争议时以此为准。',
        parameters: {
          type: 'object',
          properties: {
            symbol: { type: 'string', description: '如 SpecialPower、LifetimeUpdate、INFANTRY' },
          },
          required: ['symbol'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'grepSdkXsd',
        description:
          '仅在 RA3 MOD SDK 的 Schemas/xsd 内搜索关键词（不遍历 MOD 项目）。核对标签/属性是否存在时用。',
        parameters: {
          type: 'object',
          properties: {
            pattern: { type: 'string' },
            maxMatches: { type: 'number' },
          },
          required: ['pattern'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'readSdkXsd',
        description:
          '读取 SDK Schemas/xsd 下指定 XSD 原文（最高权威）。大文件可指定 startLine/endLine。',
        parameters: {
          type: 'object',
          properties: {
            file: { type: 'string', description: '如 AssetTypeGameObject.xsd 或 Modules/SpecialPower.xsd' },
            startLine: { type: 'number' },
            endLine: { type: 'number' },
          },
          required: ['file'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'diagnoseBuild',
        description:
          '根据编译报错文本做确定性诊断（Mod.xml、Include、WeaponSlot 等），不修改文件。修复请用 fixBuildErrors。',
        parameters: {
          type: 'object',
          properties: {
            errorLog: { type: 'string', description: '完整 BuildLog / ErrorLog 文本' },
          },
          required: ['errorLog'],
        },
      },
    },
  ];

  const names = new Set(tools.map((t) => t.function.name));
  for (const e of extra) {
    if (!names.has(e.function.name)) tools.push(e);
  }
  return tools;
}

module.exports = { buildOpenAIToolsFromDefinitions, toJsonSchema };
