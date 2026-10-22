// scripts/make-icons.js — 生成 PWA 图标（蓝底 + 白色五线谱 + 音符），node scripts/make-icons.js
'use strict';
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

/* ---------- 极简 SVG path 解析 + 扫描线填充（只支持 glyphs.js 用到的 M/L/C/Q/Z） ---------- */
function parsePath(d) {
  const tokens = d.match(/[MLCQZz]|-?\d*\.?\d+/g) || [];
  const contours = [];
  let cur = null, cmd = null, i = 0, x = 0, y = 0, sx = 0, sy = 0;
  const num = () => parseFloat(tokens[i++]);
  const push = (px, py) => { if (cur) cur.push([px, py]); };
  while (i < tokens.length) {
    if (/[MLCQZz]/.test(tokens[i])) cmd = tokens[i++];
    if (cmd === 'M' || cmd === 'm') {
      x = num(); y = num(); sx = x; sy = y;
      cur = [[x, y]]; contours.push(cur);
      cmd = 'L';
    } else if (cmd === 'L' || cmd === 'l') {
      x = num(); y = num(); push(x, y);
    } else if (cmd === 'C' || cmd === 'c') {
      const x1 = num(), y1 = num(), x2 = num(), y2 = num(), x3 = num(), y3 = num();
      for (let t = 1; t <= 12; t++) {
        const u = t / 12, v = 1 - u;
        const px = v * v * v * x + 3 * v * v * u * x1 + 3 * v * u * u * x2 + u * u * u * x3;
        const py = v * v * v * y + 3 * v * v * u * y1 + 3 * v * u * u * y2 + u * u * u * y3;
        push(px, py);
      }
      x = x3; y = y3;
    } else if (cmd === 'Q' || cmd === 'q') {
      const x1 = num(), y1 = num(), x2 = num(), y2 = num();
      for (let t = 1; t <= 12; t++) {
        const u = t / 12, v = 1 - u;
        push(v * v * x + 2 * v * u * x1 + u * u * x2, v * v * y + 2 * v * u * y1 + u * u * y2);
      }
      x = x2; y = y2;
    } else if (cmd === 'Z' || cmd === 'z') {
      x = sx; y = sy;
      cmd = null;
    } else {
      i++; // 未知指令，跳过
    }
  }
  return contours;
}

/** 奇偶填充规则判断点是否在字形内 */
function insideGlyph(contours, px, py) {
  let inside = false;
  for (const c of contours) {
    for (let k = 0, n = c.length; k < n; k++) {
      const [x1, y1] = c[k], [x2, y2] = c[(k + 1) % n];
      if ((y1 > py) !== (y2 > py) && px < (x2 - x1) * (py - y1) / (y2 - y1) + x1) inside = !inside;
    }
  }
  return inside;
}

function makeIcon(size, outPath) {
  const png = new PNG({ width: size, height: size });
  // 背景：圆角矩形（糖果蓝渐变简化：从 #1e6fd9 到 #3f8ef0 竖向渐变）
  const radius = size * 0.22;
  const c1 = [0x1e, 0x6f, 0xd9], c2 = [0x3f, 0x8e, 0xf0];
  const inRounded = (x, y) => {
    const cx = x < radius ? radius : x > size - 1 - radius ? size - 1 - radius : x;
    const cy = y < radius ? radius : y > size - 1 - radius ? size - 1 - radius : y;
    const dx = x - cx, dy = y - cy;
    return dx * dx + dy * dy <= radius * radius;
  };
  for (let y = 0; y < size; y++) {
    const t = y / size;
    const r = Math.round(c1[0] + (c2[0] - c1[0]) * t);
    const g = Math.round(c1[1] + (c2[1] - c1[1]) * t);
    const b = Math.round(c1[2] + (c2[2] - c1[2]) * t);
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      if (!inRounded(x, y)) { png.data[i + 3] = 0; continue; }
      png.data[i] = r; png.data[i + 1] = g; png.data[i + 2] = b; png.data[i + 3] = 255;
    }
  }
  // 白色五线谱（5 条线，居中偏上）
  const lineGap = size * 0.05;
  const lineW = size * 0.66;
  const lineX0 = (size - lineW) / 2;
  const lineY0 = size * 0.24;
  const fillRect = (x0, y0, w, h) => {
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(size, Math.ceil(y0 + h)); y++) {
      for (let x = Math.max(0, Math.floor(x0)); x < Math.min(size, Math.ceil(x0 + w)); x++) {
        const i = (y * size + x) * 4;
        if (png.data[i + 3] === 0) continue;
        png.data[i] = 255; png.data[i + 1] = 255; png.data[i + 2] = 255;
      }
    }
  };
  for (let k = 0; k < 5; k++) {
    fillRect(lineX0, lineY0 + k * lineGap, lineW, Math.max(2, size * 0.012));
  }
  // 音符：实心椭圆符头 + 符干（白色），画在五线下方中央
  const noteCX = size * 0.34, noteCY = lineY0 + 4.4 * lineGap;
  const rx = size * 0.075, ry = size * 0.048;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - noteCX) / rx, dy = (y - noteCY) / ry;
      if (dx * dx + dy * dy <= 1) {
        const i = (y * size + x) * 4;
        if (png.data[i + 3] === 0) continue;
        png.data[i] = 255; png.data[i + 1] = 255; png.data[i + 2] = 255;
      }
    }
  }
  fillRect(noteCX + rx * 0.62, noteCY - ry - size * 0.22, Math.max(2, size * 0.02), size * 0.24);

  // 高音谱号：用 js/glyphs.js 的 Bravura 轮廓（与谱面同一个字形），
  // 按“1 em = 4 个线距”的比例光栅化到图标上。
  require('../js/glyphs.js'); // IIFE 把轮廓挂到 globalThis.MusicGlyphs
  const glyph = globalThis.MusicGlyphs.clefs.treble;
  const emPx = size * 0.052 * 4;          // 线距 ≈ 图标边长的 5.2%
  const clefScale = emPx;
  const clefCX = size * 0.66;             // 谱号中心 x
  const clefCY = lineY0 + 2 * lineGap;    // G 谱号中心在第二线
  const glyphLeft = clefCX - (glyph.w * clefScale) / 2;
  const contours = parsePath(glyph.path);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const gx = (x - glyphLeft) / clefScale;
      const gy = (y - clefCY) / clefScale;
      if (insideGlyph(contours, gx, gy)) {
        const i = (y * size + x) * 4;
        if (png.data[i + 3] === 0) continue;
        png.data[i] = 255; png.data[i + 1] = 255; png.data[i + 2] = 255;
      }
    }
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, PNG.sync.write(png));
  console.log('生成', outPath, size + 'x' + size);
}

makeIcon(512, path.join(__dirname, '..', 'icons', 'icon-512.png'));
makeIcon(192, path.join(__dirname, '..', 'icons', 'icon-192.png'));
