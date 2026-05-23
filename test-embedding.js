// test-embedding.js —— 离线测试 Embedding（强制本地）

const path = require('path');
const { pipeline, env } = require('@xenova/transformers');

// 1. 模型本地根目录（绝对路径）
const LOCAL_MODELS_DIR = path.join(__dirname, 'models');

// 2. 关键设置：强制使用本地文件，禁止联网
env.localModelPath = LOCAL_MODELS_DIR;
env.allowRemoteModels = false;      // 禁止远程下载
env.allowLocalModels = true;        // 允许使用本地模型

// 3. 要加载的模型名（必须与 models/ 下的文件夹名完全匹配）
const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';

async function main() {
    console.log('📂 本地模型目录:', LOCAL_MODELS_DIR);
    console.log('🔒 已禁用远程下载，强制使用本地模型');
    console.log('⏳ 正在加载模型...');

    try {
        const extractor = await pipeline('feature-extraction', MODEL_NAME);
        console.log('✅ 模型加载成功');

        const text = '修改天启坦克的血量和速度';
        console.log(`📝 正在向量化: "${text}"`);

        const result = await extractor(text, {
            pooling: 'mean',
            normalize: true,
        });

        const embedding = Float32Array.from(result.data);
        console.log(`📊 向量长度: ${embedding.length}`);
        console.log(`🔢 前10个值: [${Array.from(embedding.slice(0, 10)).map(v => v.toFixed(4)).join(', ')}]`);

        const allZero = embedding.every(v => v === 0);
        if (allZero) {
            console.warn('⚠️ 向量全为零！检查模型文件是否损坏。');
        } else {
            console.log('✅ 非零向量，测试通过！');
        }
    } catch (err) {
        console.error('❌ 加载失败:', err.message);
        console.error('可能原因：');
        console.error('  1. 模型文件路径不正确，期望结构：');
        console.error(`     ${LOCAL_MODELS_DIR}/all-MiniLM-L6-v2/`);
        console.error('     ├── config.json');
        console.error('     ├── tokenizer.json');
        console.error('     ├── tokenizer_config.json');
        console.error('     └── onnx/model.onnx');
        console.error('  2. 模型文件下载不完整（请重新下载）');
        console.error('  3. @xenova/transformers 版本不兼容（建议 v2.17.2）');
    }
}

main();