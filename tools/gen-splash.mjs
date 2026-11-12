// Rewrites the Android launch screens (every res/drawable*/splash.png) as the logo, orange on obsidian, in the same sizes as before.
// Run from the project root:  node tools/gen-splash.mjs
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { inflateSync, deflateSync } from 'node:zlib';

const res = 'android/app/src/main/res';
const BG = [0x09, 0x09, 0x0b];
const INK = [0xff, 0x55, 0x00];
const M = [[256, 740], [344, 300], [504, 560], [768, 300], [680, 740]];
const M_HALF = 118 / 2;
const RING = { cx: 512, cy: 520, r: 500, half: 22 };
const distToSeg = (px, py, [ax, ay], [bx, by]) => {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};
const ink = (x, y) => {
  if (Math.abs(Math.hypot(x - RING.cx, y - RING.cy) - RING.r) <= RING.half) return true;
  for (let i = 0; i < M.length - 1; i++) if (distToSeg(x, y, M[i], M[i + 1]) <= M_HALF) return true;
  return false;
};

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

const render = (W, H) => {
  const S = Math.min(W, H) * 0.34; // side of the logo box
  const ox = (W - S) / 2;
  const oy = (H - S) / 2;
  const SS = 3;
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      let cover = 0;
      if (px >= ox - S * 0.1 && px <= ox + S * 1.1 && py >= oy - S * 0.1 && py <= oy + S * 1.1) {
        for (let sy = 0; sy < SS; sy++) {
          for (let sx = 0; sx < SS; sx++) {
            if (ink(((px + (sx + 0.5) / SS - ox) / S) * 1024, ((py + (sy + 0.5) / SS - oy) / S) * 1024)) cover++;
          }
        }
        cover /= SS * SS;
      }
      const o = py * (W * 4 + 1) + 1 + px * 4;
      for (let k = 0; k < 3; k++) raw[o + k] = Math.round(BG[k] + (INK[k] - BG[k]) * cover);
      raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
};

for (const dir of readdirSync(res)) {
  if (!dir.startsWith('drawable')) continue;
  const file = `${res}/${dir}/splash.png`;
  let buf;
  try { buf = readFileSync(file); } catch { continue; }
  const W = buf.readUInt32BE(16);
  const H = buf.readUInt32BE(20);
  writeFileSync(file, render(W, H));
  console.log(`${file} ${W}x${H}`);
}
