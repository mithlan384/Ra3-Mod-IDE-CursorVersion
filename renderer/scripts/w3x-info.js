// renderer/scripts/w3x-info.js —— W3X/W3D 二进制摘要

function readAscii(data, off, len) {
  let s = '';
  for (let i = 0; i < len && off + i < data.length; i++) {
    const c = data[off + i];
    if (c === 0) break;
    if (c >= 32 && c < 127) s += String.fromCharCode(c);
    else return s;
  }
  return s;
}

function scanStrings(data, minLen = 4) {
  const found = new Set();
  let cur = '';
  for (let i = 0; i < data.length; i++) {
    const c = data[i];
    if (c >= 32 && c < 127) cur += String.fromCharCode(c);
    else {
      if (cur.length >= minLen) found.add(cur);
      cur = '';
    }
  }
  if (cur.length >= minLen) found.add(cur);
  return [...found].slice(0, 40);
}

function parseW3xInfo(buffer) {
  const data = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : new Uint8Array(buffer);
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const lines = [];
  lines.push(`文件大小: ${data.length} 字节`);

  const head4 = readAscii(data, 0, 4);
  const head2 = readAscii(data, 0, 2);
  if (head4) lines.push(`头部标识: ${head4}`);
  else if (head2) lines.push(`头部标识: ${head2}`);

  if (data.length >= 8) {
    const v = dv.getUint32(4, true);
    lines.push(`版本/字段 @4: ${v} (0x${v.toString(16)})`);
  }

  const chunks = [];
  let off = 0;
  for (let i = 0; i < 32 && off + 8 <= data.length; i++) {
    const id =
      String.fromCharCode(data[off], data[off + 1], data[off + 2], data[off + 3]) || '????';
    const size = dv.getUint32(off + 4, true);
    if (!/^[A-Z0-9_]{4}$/.test(id) || size <= 0 || size > data.length) break;
    chunks.push({ id, size, offset: off });
    off += 8 + size;
    if (off > data.length) break;
  }
  if (chunks.length) {
    lines.push(`检测到 ${chunks.length} 个疑似 Chunk:`);
    chunks.slice(0, 12).forEach((c) => {
      lines.push(`  · ${c.id}  size=${c.size}  @${c.offset}`);
    });
  }

  const strings = scanStrings(data).filter((s) => /[A-Za-z]{3,}/.test(s));
  if (strings.length) {
    lines.push('内嵌字符串（节选）:');
    strings.slice(0, 15).forEach((s) => lines.push(`  · ${s}`));
  }

  return { lines, chunks, strings };
}

window.W3xInfo = { parseW3xInfo };
