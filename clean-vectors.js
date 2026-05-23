// clean-vectors.js
const path = require('path');
const projectState = require('./main/project-state');
projectState.setCurrentFolder(process.cwd());

(async () => {
  const lancedb = require('@lancedb/lancedb');
  const db = await lancedb.connect(path.join(process.cwd(), '.knowledge'));
  const table = await db.openTable('vectors');
  const all = await table.search().toArray();
  const toDelete = all.filter(r => r.id && !r.id.startsWith('kb_')).map(r => r.id);
  for (const id of toDelete) {
    await table.delete(id);
    console.log('已删除:', id);
  }
  console.log('清理完成，剩余向量数:', await table.countRows());
})();