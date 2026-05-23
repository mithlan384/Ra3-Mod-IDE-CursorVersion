// test-knowledge-flow.js —— 知识库全流程验证

const path = require('path');
// 模拟项目状态，避免依赖 Electron
const projectState = require('./main/project-state');
projectState.setCurrentFolder(process.cwd());

async function main() {
  const kb = require('./main/knowledge-base');

  // 初始化（会在当前目录创建 .knowledge 文件夹）
  await kb.initDatabase(process.cwd());
  console.log('✅ 数据库初始化完成');

  // 写入第一条知识
  const rec1 = await kb.addKnowledge({
    intent: '修改单位血量',
    plan: [
      { tool: 'setUnitProperty', args: { unitId: 'testUnit', propertyPath: 'Health.MaxHealth', newValue: 200 } }
    ],
    summary: '将 MaxHealth 改为 200',
    source_files: '',
    tags: ['health'],
  });
  console.log('📥 写入知识1 ID:', rec1.id);

  // 写入第二条知识
  const rec2 = await kb.addKnowledge({
    intent: '添加超级武器',
    plan: [
      { tool: 'addWeaponToUnit', args: { unitId: 'testUnit', weaponTemplate: 'SuperWeapon' } }
    ],
    summary: '给单位添加超级武器',
    source_files: '',
    tags: ['weapon'],
  });
  console.log('📥 写入知识2 ID:', rec2.id);

  // 语义搜索测试
  const results = await kb.searchSimilar('提高生命值上限', 2);
  console.log('🔍 搜索 "提高生命值上限" 结果数:', results.length);
  if (results.length > 0) {
    console.log('   第一条意图:', results[0].intent);
    console.log('   第一条摘要:', results[0].summary);
  } else {
    console.warn('⚠️ 没有找到相关结果，可能向量搜索未生效');
  }

  // 获取统计信息
  const stats = await kb.getStats();
  console.log('📊 知识库统计:', stats);
}

main().catch(err => console.error('❌ 测试失败:', err));