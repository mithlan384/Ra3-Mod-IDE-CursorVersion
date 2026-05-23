// test-debug-search.js —— 增强诊断
const path = require('path');
const fs = require('fs');
const { pipeline, env } = require('@xenova/transformers');

env.localModelPath = path.join(__dirname, 'models');
env.allowRemoteModels = false;
env.allowLocalModels = true;

const projectState = require('./main/project-state');
projectState.setCurrentFolder(process.cwd());

async function main() {
  const kb = require('./main/knowledge-base');
  await kb.initDatabase(process.cwd());

  // 清空并写入一条数据
  await kb.clearAll();
  const rec = await kb.addKnowledge({
    intent: '修改单位血量',
    plan: [],
    summary: '将 MaxHealth 改为 200',
    source_files: '',
    tags: ['health'],
  });
  console.log('📥 写入知识 ID:', rec.id);

  // 直接连接 LanceDB，查看表原始内容
  const lancedb = require('@lancedb/lancedb');
  const db = await lancedb.connect(path.join(process.cwd(), '.knowledge'));
  const table = await db.openTable('vectors');
  console.log('📊 向量表行数:', await table.countRows());

  // 尝试获取所有行（不同版本 API）
  let allRows = [];
  try {
    // 方法1：toArray
    if (typeof table.toArray === 'function') {
      allRows = await table.toArray();
      console.log('✅ 使用 table.toArray() 获取到', allRows.length, '行');
    }
  } catch (e1) {
    try {
      // 方法2：query().toArray()
      if (typeof table.query === 'function') {
        allRows = await table.query().toArray();
        console.log('✅ 使用 table.query().toArray() 获取到', allRows.length, '行');
      }
    } catch (e2) {
      try {
        // 方法3：search().execute() 返回迭代器需转换
        const raw = await table.search().execute();
        if (raw && typeof raw.toArray === 'function') {
          allRows = await raw.toArray();
        } else if (Array.isArray(raw)) {
          allRows = raw;
        } else if (raw && raw.rows) {
          allRows = raw.rows;
        }
        console.log('✅ 使用 search+转换 获取到', allRows.length, '行');
      } catch (e3) {
        console.error('❌ 所有获取行方法均失败:', e3.message);
      }
    }
  }

  if (allRows.length > 0) {
    console.log('🔎 表中所有行的 id:');
    allRows.forEach(r => console.log('  -', r.id, '向量长度:', r.vector?.length));
  } else {
    console.log('⚠️ 未能读取到任何行，表可能为空或 API 不兼容');
  }

  // 生成查询向量并尝试搜索
  const embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  const res = await embedder('提高生命值上限', { pooling: 'mean', normalize: true });
  const qv = Float32Array.from(res.data);
  console.log('🔍 查询向量已生成，维度:', qv.length);

  const searchResults = await table.search(qv).limit(3).execute();
  console.log('🔎 search().limit().execute() 返回:');
  console.log('  类型:', typeof searchResults);
  console.log('  是否数组:', Array.isArray(searchResults));
  console.log('  自身的属性:', Object.keys(searchResults));
  console.log('  JSON 前500字符:', JSON.stringify(searchResults).substring(0, 500));

  // 尝试更直接的方法：limit(3).toArray()
  try {
    const directResults = await table.search(qv).limit(3).toArray();
    console.log('✅ limit(3).toArray() 直接返回数组, 长度:', directResults.length);
    if (directResults.length > 0) {
      console.log('  第一个 id:', directResults[0].id);
    }
  } catch (e) {
    console.log('❌ limit(3).toArray() 失败:', e.message);
  }
}

main().catch(console.error);