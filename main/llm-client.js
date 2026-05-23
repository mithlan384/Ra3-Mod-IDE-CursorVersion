// main/llm-client.js —— 统一 LLM 调用（多模型预设 + OpenAI 工具调用 + Anthropic）

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { app } = require('electron');

/** @typedef {'openai'|'anthropic'} LLMProvider */

/**
 * 模型预设：选择后自动填充 endpoint / model / provider
 * Composer 2.5 无独立公开 API，可通过 OpenRouter 等 OpenAI 兼容代理使用
 */
const MODEL_PRESETS = [
  {
    id: 'deepseek-chat',
    label: 'DeepSeek Chat（V3.2）',
    provider: 'openai',
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
    model: 'deepseek-chat',
    maxTokens: 8192,
  },
  {
    id: 'deepseek-reasoner',
    label: 'DeepSeek V3.2 Pro（Reasoner 思考）',
    provider: 'openai',
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
    model: 'deepseek-reasoner',
    maxTokens: 8192,
  },
  {
    id: 'gpt-4o',
    label: 'ChatGPT GPT-4o',
    provider: 'openai',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o',
    maxTokens: 8192,
  },
  {
    id: 'gpt-4.1',
    label: 'ChatGPT GPT-4.1',
    provider: 'openai',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4.1',
    maxTokens: 8192,
  },
  {
    id: 'o3-mini',
    label: 'ChatGPT o3-mini',
    provider: 'openai',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    model: 'o3-mini',
    maxTokens: 8192,
  },
  {
    id: 'claude-opus-4',
    label: 'Claude Opus 4',
    provider: 'anthropic',
    endpoint: 'https://api.anthropic.com/v1/messages',
    model: 'claude-opus-4-20250514',
    maxTokens: 8192,
  },
  {
    id: 'claude-opus-4-5',
    label: 'Claude Opus 4.5',
    provider: 'anthropic',
    endpoint: 'https://api.anthropic.com/v1/messages',
    model: 'claude-opus-4-5-20251101',
    maxTokens: 8192,
  },
  {
    id: 'claude-opus-4-7',
    label: 'Claude Opus 4.7（若不可用请换 4.5）',
    provider: 'anthropic',
    endpoint: 'https://api.anthropic.com/v1/messages',
    model: 'claude-opus-4-6-20260201',
    maxTokens: 8192,
  },
  {
    id: 'composer-2.5-openrouter',
    label: 'Cursor Composer 2.5（经 OpenRouter）',
    provider: 'openai',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'cursor/composer-2.5',
    maxTokens: 8192,
    footnote: 'Composer 无官方独立 API；需 OpenRouter API Key，模型 ID 以 OpenRouter 文档为准',
  },
  {
    id: 'custom',
    label: '自定义（手动填写下方地址与模型名）',
    provider: 'openai',
    endpoint: '',
    model: '',
    maxTokens: 8192,
  },
];

function getConfigPath() {
  return path.join(app.getPath('userData'), 'ra3-ai-config.json');
}

function getPresetById(id) {
  return MODEL_PRESETS.find((p) => p.id === id) || MODEL_PRESETS[0];
}

function loadAIConfig() {
  const defaults = {
    modelPreset: 'deepseek-chat',
    endpoint: MODEL_PRESETS[0].endpoint,
    apiKey: '',
    model: MODEL_PRESETS[0].model,
    provider: 'openai',
    apiUrl: MODEL_PRESETS[0].endpoint,
    maxTokens: 8192,
    agentMaxSteps: 24,
  };

  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) return { ...defaults };

  try {
    const raw = require('./secure-config').revealSecretsFromDisk(
      JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    );
    const presetId = raw.modelPreset || inferPresetFromLegacy(raw);
    const preset = getPresetById(presetId);

    const endpoint =
      raw.endpoint || raw.apiUrl || (preset.id === 'custom' ? '' : preset.endpoint) || defaults.endpoint;
    const model = raw.model || preset.model || defaults.model;
    const provider =
      raw.provider || preset.provider || (endpoint.includes('anthropic.com') ? 'anthropic' : 'openai');

    return {
      ...defaults,
      ...raw,
      modelPreset: presetId,
      endpoint,
      apiUrl: endpoint,
      model,
      provider,
      apiKey: raw.apiKey || '',
      maxTokens: raw.maxTokens || preset.maxTokens || 8192,
      agentMaxSteps:
        raw.agentMaxSteps != null && raw.agentMaxSteps !== ''
          ? parseInt(raw.agentMaxSteps, 10)
          : 24,
    };
  } catch {
    return { ...defaults };
  }
}

function inferPresetFromLegacy(raw) {
  const m = String(raw.model || '').toLowerCase();
  if (m.includes('reasoner')) return 'deepseek-reasoner';
  if (m.includes('gpt-4.1')) return 'gpt-4.1';
  if (m.includes('gpt-4o')) return 'gpt-4o';
  if (m.includes('o3')) return 'o3-mini';
  if (m.includes('claude-opus-4-6') || m.includes('opus-4.7') || m.includes('opus-4-6')) return 'claude-opus-4-7';
  if (m.includes('claude-opus-4-5') || m.includes('opus-4-5')) return 'claude-opus-4-5';
  if (m.includes('claude') && m.includes('opus')) return 'claude-opus-4';
  if (m.includes('composer')) return 'composer-2.5-openrouter';
  if (m.includes('gpt')) return 'gpt-4o';
  return 'deepseek-chat';
}

/** @type {import('http').ClientRequest | null} */
let activeLlmRequest = null;

function abortActiveLlmRequest() {
  if (activeLlmRequest) {
    try {
      activeLlmRequest.destroy();
    } catch (e) {}
    activeLlmRequest = null;
  }
}

function httpRequest(urlStr, options, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: options.method || 'POST',
        headers: options.headers || {},
        timeout: options.timeout || 180000,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          activeLlmRequest = null;
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 500)}`));
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('解析响应失败: ' + data.slice(0, 300)));
          }
        });
      }
    );
    activeLlmRequest = req;
    req.on('error', (err) => {
      activeLlmRequest = null;
      reject(err);
    });
    req.on('timeout', () => {
      activeLlmRequest = null;
      req.destroy();
      reject(new Error('请求超时'));
    });
    if (body) req.write(body);
    req.end();
  });
}

function openAiToolsToAnthropic(tools) {
  if (!tools?.length) return undefined;
  return tools.map((t) => ({
    name: t.function.name,
    description: t.function.description || '',
    input_schema: t.function.parameters || { type: 'object', properties: {} },
  }));
}

function anthropicMessagesToOpenAi(messages) {
  const systemParts = [];
  const out = [];
  for (const m of messages) {
    if (m.role === 'system') {
      systemParts.push(m.content);
      continue;
    }
    if (m.role === 'tool') {
      out.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: m.tool_call_id,
            content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
          },
        ],
      });
      continue;
    }
    if (m.role === 'assistant' && m.tool_calls?.length) {
      const blocks = [];
      if (m.content) blocks.push({ type: 'text', text: m.content });
      for (const tc of m.tool_calls) {
        let input = {};
        try {
          input = JSON.parse(tc.function.arguments || '{}');
        } catch (e) {}
        blocks.push({ type: 'tool_use', id: tc.id, name: tc.function.name, input });
      }
      out.push({ role: 'assistant', content: blocks });
      continue;
    }
    out.push({ role: m.role, content: m.content });
  }
  return { system: systemParts.join('\n\n'), messages: out };
}

async function callAnthropic(messages, options = {}) {
  const config = loadAIConfig();
  const preset = getPresetById(config.modelPreset);
  const endpoint = config.endpoint || preset.endpoint;
  const apiKey = config.apiKey;
  if (!apiKey) throw new Error('未配置 API Key');

  const { system, messages: anthropicMsgs } = anthropicMessagesToOpenAi(messages);
  const body = {
    model: config.model || preset.model,
    max_tokens: options.maxTokens ?? config.maxTokens ?? 8192,
    temperature: options.temperature != null ? options.temperature : 0.15,
    system: system || undefined,
    messages: anthropicMsgs,
  };
  if (options.tools?.length) {
    body.tools = openAiToolsToAnthropic(options.tools);
  }

  const json = await httpRequest(
    endpoint,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      timeout: options.timeout || 180000,
    },
    JSON.stringify(body)
  );

  const textBlocks = (json.content || []).filter((b) => b.type === 'text').map((b) => b.text);
  const toolBlocks = (json.content || []).filter((b) => b.type === 'tool_use');

  if (toolBlocks.length) {
    return {
      content: textBlocks.join('\n') || null,
      tool_calls: toolBlocks.map((tb) => ({
        id: tb.id,
        type: 'function',
        function: {
          name: tb.name,
          arguments: JSON.stringify(tb.input || {}),
        },
      })),
      finish_reason: 'tool_calls',
      raw: json,
    };
  }

  return {
    content: textBlocks.join('\n') || '',
    tool_calls: null,
    finish_reason: json.stop_reason || 'stop',
    raw: json,
  };
}

async function callOpenAICompatible(messages, options = {}) {
  const config = loadAIConfig();
  const preset = getPresetById(config.modelPreset);
  const endpoint = config.endpoint || config.apiUrl || preset.endpoint;
  const apiKey = config.apiKey;
  if (!apiKey) throw new Error('未配置 API Key');

  const body = {
    model: config.model || preset.model,
    messages,
    temperature: options.temperature != null ? options.temperature : 0.15,
    max_tokens: options.maxTokens ?? config.maxTokens ?? 8192,
  };
  if (options.tools?.length) {
    body.tools = options.tools;
    body.tool_choice = options.tool_choice || 'auto';
  }

  const json = await httpRequest(
    endpoint,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      timeout: options.timeout || 180000,
    },
    JSON.stringify(body)
  );

  if (json.error) {
    throw new Error(json.error.message || JSON.stringify(json.error));
  }
  if (!json.choices?.[0]) throw new Error('LLM 返回空响应');

  const choice = json.choices[0];
  const msg = choice.message || {};
  let content = msg.content ?? '';
  const reasoning_content =
    msg.reasoning_content || msg.reasoning || choice.reasoning_content || '';
  if (!String(content).trim() && !String(reasoning_content).trim()) {
    content = choice.text || '';
  }
  return {
    content: String(content || ''),
    reasoning_content: String(reasoning_content || ''),
    tool_calls: msg.tool_calls || null,
    finish_reason: choice.finish_reason || 'stop',
    raw: json,
  };
}

/**
 * 统一聊天补全（支持 tools）
 * @returns {Promise<{content:string|null, tool_calls:Array|null, finish_reason:string}>}
 */
async function chatCompletion(messages, options = {}) {
  const config = loadAIConfig();
  const provider = options.provider || config.provider || 'openai';
  if (provider === 'anthropic') {
    return callAnthropic(messages, options);
  }
  return callOpenAICompatible(messages, options);
}

/** 兼容旧 callLLM：纯文本 messages，返回 string */
async function callLLM(messages, options = {}) {
  const res = await chatCompletion(messages, {
    ...options,
    tools: undefined,
    maxTokens: options.maxTokens ?? (options.profile === 'summary' ? 1500 : undefined),
    temperature: options.temperature ?? (options.profile === 'summary' ? 0.3 : 0.15),
  });
  return res.content || '';
}

module.exports = {
  MODEL_PRESETS,
  getPresetById,
  loadAIConfig,
  getConfigPath,
  chatCompletion,
  callLLM,
  inferPresetFromLegacy,
  abortActiveLlmRequest,
};
