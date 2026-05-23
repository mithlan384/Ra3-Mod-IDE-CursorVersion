// main/secure-config.js —— API Key 等敏感字段的本地加密存储（Electron safeStorage）

const { safeStorage } = require('electron');

const ENC_PREFIX = 'enc:';

function isEncryptionAvailable() {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

function encryptSecret(plain) {
  const s = String(plain || '');
  if (!s) return '';
  if (s.startsWith(ENC_PREFIX)) return s;
  if (!isEncryptionAvailable()) return s;
  try {
    return ENC_PREFIX + safeStorage.encryptString(s).toString('base64');
  } catch {
    return s;
  }
}

function decryptSecret(stored) {
  const s = String(stored || '');
  if (!s) return '';
  if (!s.startsWith(ENC_PREFIX)) return s;
  if (!isEncryptionAvailable()) return s;
  try {
    const buf = Buffer.from(s.slice(ENC_PREFIX.length), 'base64');
    return safeStorage.decryptString(buf);
  } catch {
    return s;
  }
}

/** 写入磁盘前加密 apiKey 等字段 */
function stripSecretsForDisk(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = { ...obj };
  if (out.apiKey) out.apiKey = encryptSecret(out.apiKey);
  if (out.searchApi && typeof out.searchApi === 'object') {
    const sa = { ...out.searchApi };
    if (sa.apiKey) sa.apiKey = encryptSecret(sa.apiKey);
    out.searchApi = sa;
  }
  return out;
}

/** 从磁盘读取后解密 */
function revealSecretsFromDisk(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  const out = { ...raw };
  if (out.apiKey) out.apiKey = decryptSecret(out.apiKey);
  if (out.searchApi && typeof out.searchApi === 'object') {
    const sa = { ...out.searchApi };
    if (sa.apiKey) sa.apiKey = decryptSecret(sa.apiKey);
    out.searchApi = sa;
  }
  return out;
}

module.exports = {
  encryptSecret,
  decryptSecret,
  stripSecretsForDisk,
  revealSecretsFromDisk,
  isEncryptionAvailable,
};
