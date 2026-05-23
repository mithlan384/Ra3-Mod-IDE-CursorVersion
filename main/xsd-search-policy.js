// main/xsd-search-policy.js —— XSD 权威与性能平衡：按场景决定知识库检索强度

/** 用户是否在问 XML / XSD 结构 */
function isXmlSchemaQuery(text) {
  return /xsd|xml|标签|属性|模块|gameobject|behavior|body|weapon|specialpower|enum|schem|kindof|logiccommand|draws|locomotor/i.test(
    String(text || '')
  );
}

/** 是否在改/写项目 XML（应提高 XSD 权重） */
function isMutatingXmlIntent(text) {
  return /(创建|新建|修改|写入|生成|改|设置|调整).{0,18}(单位|xml|gameobject|mod\.xml|属性|血量|武器|behavior|模块)/i.test(
    String(text || '')
  );
}

/**
 * 知识库 searchSimilar 选项（不触发全量索引，仅控制命中类别与条数）
 * @param {'general'|'offline_answer'|'agent_plan'|'create_unit_kb'|'knowledge_panel'|'agent_context'|'build_error'} context
 */
function getKnowledgeSearchOptions(message, context = 'general') {
  const xml = isXmlSchemaQuery(message);
  const mutating = isMutatingXmlIntent(message);
  const heavyXsd = xml || mutating;

  switch (context) {
    case 'knowledge_panel':
      return { topN: 8, maxXsdHits: 8, excludeXsd: false, skipLlmRewrite: false };
    case 'create_unit_kb':
      return { topN: 3, maxXsdHits: 0, excludeXsd: true, skipLlmRewrite: true };
    case 'agent_plan':
      return {
        topN: heavyXsd ? 6 : 4,
        maxXsdHits: heavyXsd ? 5 : 0,
        excludeXsd: !heavyXsd,
        skipLlmRewrite: !heavyXsd,
      };
    case 'offline_answer':
      return {
        topN: heavyXsd ? 5 : 4,
        maxXsdHits: heavyXsd ? 5 : 0,
        excludeXsd: !heavyXsd,
        skipLlmRewrite: !heavyXsd,
      };
    case 'agent_context':
      return {
        topN: 3,
        maxXsdHits: xml ? 3 : 0,
        excludeXsd: !xml,
        skipLlmRewrite: true,
      };
    case 'build_error':
      return {
        topN: 5,
        maxXsdHits: 4,
        excludeXsd: false,
        skipLlmRewrite: true,
      };
    default:
      return {
        topN: 4,
        maxXsdHits: heavyXsd ? 4 : 0,
        excludeXsd: !heavyXsd,
        skipLlmRewrite: !heavyXsd,
      };
  }
}

module.exports = {
  isXmlSchemaQuery,
  isMutatingXmlIntent,
  getKnowledgeSearchOptions,
};
