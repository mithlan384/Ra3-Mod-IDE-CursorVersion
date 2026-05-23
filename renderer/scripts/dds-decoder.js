// renderer/scripts/dds-decoder.js —— DDS 贴图解码（DXT1/3/5 + 24/32 位）

function readU32(dv, off) {
  return dv.getUint32(off, true);
}

function decodeColor565(c) {
  const r = ((c >> 11) & 0x1f) * 255 / 31;
  const g = ((c >> 5) & 0x3f) * 255 / 63;
  const b = (c & 0x1f) * 255 / 31;
  return [r, g, b];
}

function writePixel(dst, dstOff, w, x, y, r, g, b, a) {
  const o = dstOff + (y * w + x) * 4;
  dst[o] = r;
  dst[o + 1] = g;
  dst[o + 2] = b;
  dst[o + 3] = a;
}

function decodeDXT1Block(src, dst, dstOff, bw) {
  const c0 = src[0] | (src[1] << 8);
  const c1 = src[2] | (src[3] << 8);
  const bits = src[4] | (src[5] << 8) | (src[6] << 16) | (src[7] << 24);
  const col0 = decodeColor565(c0);
  const col1 = decodeColor565(c1);
  const palette = [col0, col1, [0, 0, 0], [0, 0, 0]];
  if (c0 > c1) {
    palette[2] = [(2 * col0[0] + col1[0]) / 3, (2 * col0[1] + col1[1]) / 3, (2 * col0[2] + col1[2]) / 3];
    palette[3] = [(col0[0] + 2 * col1[0]) / 3, (col0[1] + 2 * col1[1]) / 3, (col0[2] + 2 * col1[2]) / 3];
  } else {
    palette[2] = [(col0[0] + col1[0]) / 2, (col0[1] + col1[1]) / 2, (col0[2] + col1[2]) / 2];
    palette[3] = [0, 0, 0];
  }
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const idx = (bits >> ((y * 4 + x) * 2)) & 3;
      const p = palette[idx];
      const a = idx === 3 && c0 <= c1 ? 0 : 255;
      writePixel(dst, dstOff, bw, x, y, p[0], p[1], p[2], a);
    }
  }
}

function decodeDXT3Block(src, dst, dstOff, bw) {
  const alpha = new Uint8Array(16);
  for (let i = 0; i < 8; i++) {
    alpha[i * 2] = (src[i] & 0x0f) * 17;
    alpha[i * 2 + 1] = ((src[i] >> 4) & 0x0f) * 17;
  }
  decodeDXT1Block(src.subarray(8), dst, dstOff, bw);
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const o = dstOff + (y * bw + x) * 4;
      dst[o + 3] = alpha[y * 4 + x];
    }
  }
}

function decodeDXT5Block(src, dst, dstOff, bw) {
  const a0 = src[0];
  const a1 = src[1];
  let abits = 0;
  for (let i = 0; i < 6; i++) abits |= src[2 + i] << (i * 8);
  const alpha = new Uint8Array(8);
  alpha[0] = a0;
  alpha[1] = a1;
  if (a0 > a1) {
    for (let i = 1; i < 7; i++) alpha[i + 1] = Math.round(((7 - i) * a0 + i * a1) / 7);
  } else {
    for (let i = 1; i < 5; i++) alpha[i + 1] = Math.round(((5 - i) * a0 + i * a1) / 5);
    alpha[6] = 0;
    alpha[7] = 255;
  }
  decodeDXT1Block(src.subarray(8), dst, dstOff, bw);
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const idx = (abits >> ((y * 4 + x) * 3)) & 7;
      const o = dstOff + (y * bw + x) * 4;
      dst[o + 3] = alpha[idx];
    }
  }
}

function decodeDXT(data, fourCC, width, height) {
  const blockBytes = fourCC === 'DXT1' ? 8 : 16;
  const blocksX = Math.max(1, Math.ceil(width / 4));
  const blocksY = Math.max(1, Math.ceil(height / 4));
  const rgba = new Uint8ClampedArray(width * height * 4);
  let ptr = 0;
  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      const block = data.subarray(ptr, ptr + blockBytes);
      ptr += blockBytes;
      const tmp = new Uint8ClampedArray(64);
      const fn =
        fourCC === 'DXT1' ? decodeDXT1Block : fourCC === 'DXT3' ? decodeDXT3Block : decodeDXT5Block;
      fn(block, tmp, 0, 4);
      for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
          const px = bx * 4 + x;
          const py = by * 4 + y;
          if (px >= width || py >= height) continue;
          const so = (y * 4 + x) * 4;
          const doff = (py * width + px) * 4;
          rgba.set(tmp.subarray(so, so + 4), doff);
        }
      }
    }
  }
  return rgba;
}

function decodeDDS(buffer) {
  const data = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : new Uint8Array(buffer);
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const magic = String.fromCharCode(data[0], data[1], data[2], data[3]);
  if (magic !== 'DDS ') throw new Error('不是有效的 DDS 文件');

  const height = readU32(dv, 12);
  const width = readU32(dv, 16);
  const pfFlags = readU32(dv, 80);
  const fourCC = String.fromCharCode(data[84], data[85], data[86], data[87]).replace(/\0/g, '').trim();
  const rgbBitCount = readU32(dv, 88);
  const offset = 128;

  if (pfFlags & 0x4) {
    const rgba = decodeDXT(data.subarray(offset), fourCC, width, height);
    return { width, height, data: rgba, format: fourCC };
  }

  if (rgbBitCount === 32) {
    const pixels = width * height;
    const rgba = new Uint8ClampedArray(pixels * 4);
    for (let i = 0; i < pixels; i++) {
      const o = offset + i * 4;
      rgba[i * 4] = data[o + 2];
      rgba[i * 4 + 1] = data[o + 1];
      rgba[i * 4 + 2] = data[o];
      rgba[i * 4 + 3] = data[o + 3];
    }
    return { width, height, data: rgba, format: 'BGRA32' };
  }

  if (rgbBitCount === 24) {
    const pixels = width * height;
    const rgba = new Uint8ClampedArray(pixels * 4);
    for (let i = 0; i < pixels; i++) {
      const o = offset + i * 3;
      rgba[i * 4] = data[o + 2];
      rgba[i * 4 + 1] = data[o + 1];
      rgba[i * 4 + 2] = data[o];
      rgba[i * 4 + 3] = 255;
    }
    return { width, height, data: rgba, format: 'BGR24' };
  }

  throw new Error(`暂不支持的 DDS 像素格式 (${fourCC || rgbBitCount + 'bit'})`);
}

window.DdsDecoder = { decodeDDS };
