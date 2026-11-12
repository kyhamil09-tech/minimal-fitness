// Writes store/icon-512.png (the Google Play listing icon) from the same shapes as src/lib/appLogo.ts, with no image library:
// each pixel is sampled 4 x 4 times and checked against the background band and the M line. Run from the project root:
//   node tools/gen-store-icon.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const SIZE = 512;
const BG = [0x10, 0x11, 0x12];
const INK = [0xff, 0x55, 0x00];
const BAND_ALPHA = 0.16;
const BOX = 1024;
const M = [[256, 740], [344, 300], [504, 560], [768, 300], [680, 740]];
const M_HALF = 118 / 2;
const BAND = [[690, 0], [1010, 0], [350, 1024], [30, 1024]];

const inPoly = (x, y, poly) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

const distToSeg = (px, py, [ax, ay], [bx, by]) => {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};

const onM = (x, y) => {
  for (let i = 0; i < M.length - 1; i++) if (distToSeg(x, y, M[i], M[i + 1]) <= M_HALF) return true;
  return false;
};

const SS = 4;
const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
for (let py = 0; py < SIZE; py++) {
  raw[py * (SIZE * 4 + 1)] = 0;
  for (let px = 0; px < SIZE; px++) {
    let r = 0;
    let g = 0;
    let b = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const x = ((px + (sx + 0.5) / SS) / SIZE) * BOX;
        const y = ((py + (sy + 0.5) / SS) / SIZE) * BOX;
        let c = BG;
        if (inPoly(x, y, BAND)) c = BG.map((v, k) => v + (INK[k] - v) * BAND_ALPHA);
        if (onM(x, y)) c = INK;
        r += c[0];
        g += c[1];
        b += c[2];
      }
    }
    const n = SS * SS;
    const o = py * (SIZE * 4 + 1) + 1 + px * 4;
    raw[o] = Math.round(r / n);
    raw[o + 1] = Math.round(g / n);
    raw[o + 2] = Math.round(b / n);
    raw[o + 3] = 255;
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, sum]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8;
ihdr[9] = 6;
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
mkdirSync('store', { recursive: true });
writeFileSync('store/icon-512.png', png);
console.log(`wrote store/icon-512.png (${png.length} bytes)`);
