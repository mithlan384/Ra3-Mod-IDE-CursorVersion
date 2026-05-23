// main/sdk-tools.js —— 启动 RA3 MOD SDK 外部工具

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { shell, app } = require('electron');
const { getGlobalSdkPath } = require('./project-manager');

const TOOL_KEYS = [
  'w3xViewer',
  'csfEditor',
  'vp6Converter',
  'virtualDub',
  'ddsViewerInstaller',
  'vp6Codec',
];

const DEFAULT_RELATIVE = {
  w3xViewer: [
    'tools/W3XViewer.exe',
    'tools/W3XView.exe',
    'tools/w3xviewer.exe',
  ],
  csfEditor: ['tools/常用工具/CSF编辑器'],
  vp6Converter: ['tools/常用工具/RA3视频制作/VP6Converter005.exe'],
  virtualDub: ['tools/常用工具/RA3视频制作/VirtualDub-1.10.4/VirtualDub.exe'],
  ddsViewerInstaller: ['tools/常用工具/DDS插件/DDS_viewer.exe'],
  vp6Codec: ['tools/常用工具/RA3视频制作/vp6_vfw_codec.exe'],
};

function readPreferences() {
  const prefPath = path.join(app.getPath('userData'), 'preferences.json');
  if (!fs.existsSync(prefPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(prefPath, 'utf-8'));
  } catch {
    return {};
  }
}

function findExeInDir(dir, depth = 0) {
  if (!dir || !fs.existsSync(dir) || depth > 3) return null;
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isFile() && /\.exe$/i.test(ent.name)) return full;
  }
  for (const ent of entries) {
    if (ent.isDirectory()) {
      const found = findExeInDir(path.join(dir, ent.name), depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function resolveToolPath(toolKey, overridePath) {
  if (overridePath && fs.existsSync(overridePath)) {
    if (fs.statSync(overridePath).isDirectory()) {
      return findExeInDir(overridePath) || overridePath;
    }
    return overridePath;
  }

  const sdkRoot = getGlobalSdkPath();
  if (!sdkRoot) return null;

  const rels = DEFAULT_RELATIVE[toolKey] || [];
  for (const rel of rels) {
    const full = path.join(sdkRoot, rel.replace(/\//g, path.sep));
    if (!fs.existsSync(full)) continue;
    if (fs.statSync(full).isDirectory()) {
      const exe = findExeInDir(full);
      if (exe) return exe;
    } else {
      return full;
    }
  }
  return null;
}

function getToolPathsFromPrefs() {
  const prefs = readPreferences();
  return prefs.sdkTools || {};
}

function listToolStatus() {
  const overrides = getToolPathsFromPrefs();
  const out = {};
  for (const key of TOOL_KEYS) {
    const p = resolveToolPath(key, overrides[key]);
    out[key] = { configured: overrides[key] || '', resolved: p || '', exists: !!(p && fs.existsSync(p)) };
  }
  return out;
}

function launchExecutable(exePath, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(exePath, args, { detached: true, stdio: 'ignore', windowsHide: false });
    child.unref();
    child.on('error', reject);
    resolve();
  });
}

async function launchSdkTool(toolKey, filePath) {
  if (toolKey === 'openContainingFolder') {
    if (!filePath || !fs.existsSync(filePath)) {
      return { success: false, error: '文件不存在' };
    }
    shell.showItemInFolder(path.resolve(filePath));
    return { success: true };
  }

  if (!TOOL_KEYS.includes(toolKey)) {
    return { success: false, error: `未知工具: ${toolKey}` };
  }

  const overrides = getToolPathsFromPrefs();
  const exePath = resolveToolPath(toolKey, overrides[toolKey]);
  if (!exePath || !fs.existsSync(exePath)) {
    return {
      success: false,
      error: `未找到 ${toolKey}。请在「设置 → SDK 工具」中配置路径，或设置 RA3 MOD SDK 根目录。`,
    };
  }

  const args = [];
  if (filePath && fs.existsSync(filePath)) {
    args.push(path.resolve(filePath));
  }

  try {
    await launchExecutable(exePath, args);
    return { success: true, exePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function getDefaultSdkToolsPaths() {
  const sdkRoot = getGlobalSdkPath();
  if (!sdkRoot) return {};
  const out = {};
  for (const key of TOOL_KEYS) {
    const p = resolveToolPath(key, null);
    if (p) out[key] = p.replace(/\\/g, '/');
  }
  return out;
}

module.exports = {
  TOOL_KEYS,
  listToolStatus,
  launchSdkTool,
  resolveToolPath,
  getDefaultSdkToolsPaths,
};
