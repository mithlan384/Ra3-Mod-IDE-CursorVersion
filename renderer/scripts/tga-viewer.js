// tga-viewer.js - TGA 图片解析与 Canvas 预览

function parseTGA(buffer) {
  const data = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : new Uint8Array(buffer.buffer || buffer);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const idLength = view.getUint8(0);
  const imageType = view.getUint8(2);
  let offset = 18 + idLength;
  const width = view.getUint16(12, true);
  const height = view.getUint16(14, true);
  const bitCount = view.getUint8(16);
  const descriptor = view.getUint8(17);
  const topDown = (descriptor & 0x20) === 0;

  if (!width || !height) throw new Error('无效的 TGA 尺寸');

  if (imageType === 2 || imageType === 3) {
    const imageSize = width * height * (bitCount / 8);
    const pixelData = new Uint8Array(data.buffer, data.byteOffset + offset, imageSize);
    return { width, height, bitCount, data: pixelData, topDown };
  }

  if (imageType === 10) {
    const out = new Uint8Array(width * height * (bitCount / 8));
    let ptr = 0;
    let outOff = 0;
    const bpp = bitCount / 8;
    while (outOff < out.length && offset < data.length) {
      const header = data[offset++];
      const count = (header & 0x7f) + 1;
      if (header & 0x80) {
        const pixel = data.subarray(offset, offset + bpp);
        offset += bpp;
        for (let i = 0; i < count && outOff < out.length; i++) {
          out.set(pixel, outOff);
          outOff += bpp;
        }
      } else {
        const nbytes = count * bpp;
        out.set(data.subarray(offset, offset + nbytes), outOff);
        offset += nbytes;
        outOff += nbytes;
      }
    }
    return { width, height, bitCount, data: out, topDown };
  }

  throw new Error(`暂不支持的 TGA 类型: ${imageType}`);
}

function tgaToImageData(tga) {
  const { width, height, bitCount, data, topDown } = tga;
  const imageData = new ImageData(width, height);
  const pixelCount = width * height;
  for (let i = 0; i < pixelCount; i++) {
    const row = topDown ? Math.floor(i / width) : height - 1 - Math.floor(i / width);
    const col = i % width;
    const dstI = row * width + col;
    const srcOff = i * (bitCount / 8);
    const dstOff = dstI * 4;
    if (bitCount === 24) {
      imageData.data[dstOff] = data[srcOff + 2];
      imageData.data[dstOff + 1] = data[srcOff + 1];
      imageData.data[dstOff + 2] = data[srcOff];
      imageData.data[dstOff + 3] = 255;
    } else if (bitCount === 32) {
      imageData.data[dstOff] = data[srcOff + 2];
      imageData.data[dstOff + 1] = data[srcOff + 1];
      imageData.data[dstOff + 2] = data[srcOff];
      imageData.data[dstOff + 3] = data[srcOff + 3];
    } else {
      throw new Error(`不支持的位深: ${bitCount}`);
    }
  }
  return imageData;
}

async function renderTgaToCanvas(canvas, filePath) {
  const raw = await window.api.readBinaryFile(filePath);
  const tga = parseTGA(raw);
  canvas.width = tga.width;
  canvas.height = tga.height;
  const ctx = canvas.getContext('2d');
  ctx.putImageData(tgaToImageData(tga), 0, 0);
  return { width: tga.width, height: tga.height };
}

async function loadTgaPreview(filePath) {
  const container = document.getElementById('tga-preview');
  if (!container) return renderTgaToCanvas(document.createElement('canvas'), filePath);
  container.innerHTML = '<canvas id="tga-canvas" style="max-width:100%; max-height:200px;"></canvas>';
  const canvas = document.getElementById('tga-canvas');
  try {
    return await renderTgaToCanvas(canvas, filePath);
  } catch (err) {
    container.innerHTML = `<div style="color:#f44747;">无法加载 TGA: ${err.message}</div>`;
    throw err;
  }
}

window.TgaViewer = { parseTGA, tgaToImageData, renderTgaToCanvas, loadTgaPreview };
