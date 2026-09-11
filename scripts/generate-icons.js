#!/usr/bin/env node
/**
 * Dev-only utility: procedurally generates the app's PNG icons with zero
 * dependencies (uses only Node's built-in zlib for PNG compression).
 * Not required at runtime — run again only if you want to regenerate icons.
 *
 * Usage: node scripts/generate-icons.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT_DIR = path.join(__dirname, '..', 'icons');

// wxlter. brand: flat ink background, brand-faro glyph — no gradient, no
// rounded corners (the OS applies its own mask on maskable/adaptive icons).
const COLOR_INK = [17, 17, 17]; // #111111
const COLOR_FARO = [255, 219, 0]; // #FFDB00

// Draws one L-shaped viewfinder bracket in the given corner of a
// `box`x`box` glyph area, with stroke `t` and arm length `a`.
// corner: 'tl' | 'tr' | 'bl' | 'br'
function drawBracket(set, box, t, a, corner) {
  const flipX = corner === 'tr' || corner === 'br';
  const flipY = corner === 'bl' || corner === 'br';
  const px = (x) => (flipX ? box - x : x);
  const py = (y) => (flipY ? box - y : y);
  const rect = (x0, y0, w, h) => {
    const x1 = flipX ? px(x0) - w : x0;
    const y1 = flipY ? py(y0) - h : y0;
    set(x1, y1, w, h);
  };
  rect(0, 0, a, t); // horizontal arm
  rect(0, 0, t, a); // vertical arm
}

function makeIcon(size, { padded = false } = {}) {
  const buf = Buffer.alloc(size * size * 4);

  // Background: flat ink, full bleed (square — no rounding; the OS applies
  // its own mask for maskable/adaptive icons, and a hard-edged square is
  // the brand's own favicon treatment anyway).
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      buf[i] = COLOR_INK[0];
      buf[i + 1] = COLOR_INK[1];
      buf[i + 2] = COLOR_INK[2];
      buf[i + 3] = 255;
    }
  }

  // Foreground glyph: a viewfinder scan-frame (four corner brackets) around
  // a center dot, in brand-faro, inset with generous margin (maskable-icon
  // safe zone for the padded variant).
  const inset = padded ? size * 0.32 : size * 0.20;
  const glyphSize = size - inset * 2;
  const set = (px, py, w, h) => {
    const x0 = Math.round(inset + px);
    const y0 = Math.round(inset + py);
    const x1 = Math.round(inset + px + w);
    const y1 = Math.round(inset + py + h);
    for (let y = Math.max(0, y0); y < Math.min(size, y1); y++) {
      for (let x = Math.max(0, x0); x < Math.min(size, x1); x++) {
        const i = (y * size + x) * 4;
        buf[i] = COLOR_FARO[0];
        buf[i + 1] = COLOR_FARO[1];
        buf[i + 2] = COLOR_FARO[2];
        buf[i + 3] = 255;
      }
    }
  };
  const thickness = glyphSize * 0.115;
  const arm = glyphSize * 0.4;
  drawBracket(set, glyphSize, thickness, arm, 'tl');
  drawBracket(set, glyphSize, thickness, arm, 'tr');
  drawBracket(set, glyphSize, thickness, arm, 'bl');
  drawBracket(set, glyphSize, thickness, arm, 'br');
  // Center dot, suggesting the encoded payload.
  const dot = glyphSize * 0.2;
  set(glyphSize / 2 - dot / 2, glyphSize / 2 - dot / 2, dot, dot);

  return buf;
}

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      t[n] = c >>> 0;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePNG(rgba, size) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0; // filter: none
    rgba.copy(raw, rowStart + 1, y * size * 4, (y + 1) * size * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function writeIcon(size, filename, opts) {
  const rgba = makeIcon(size, opts);
  const png = encodePNG(rgba, size);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, filename), png);
  console.log(`wrote icons/${filename} (${size}x${size}, ${png.length} bytes)`);
}

writeIcon(192, 'icon-192.png');
writeIcon(512, 'icon-512.png');
writeIcon(512, 'icon-512-maskable.png', { padded: true });
writeIcon(180, 'apple-touch-icon.png');
writeIcon(32, 'favicon-32.png');
writeIcon(16, 'favicon-16.png');
