// 生成菜单栏模板图标（单色黑 + alpha，macOS 自动适配明暗）：assets/trayTemplate.png(16) 与 @2x(32)。
// 纯 Node 实现（zlib + CRC32），无第三方依赖。用法：npm run gen-icon
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
export function encodePng(size, alphaAt) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = raw[o + 1] = raw[o + 2] = 0;
      raw[o + 3] = alphaAt(x, y);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// 16 单位网格上的一本打开的书：外框 + 中缝 + 每页两条“文字线”
function bookAt(u, v) {
  const inBox = u >= 1 && u <= 14 && v >= 3 && v <= 12;
  if (!inBox) return false;
  const border = u === 1 || u === 14 || v === 3 || v === 12;
  const spine = u === 7 || u === 8;
  const lines = (v === 6 || v === 9) && ((u >= 3 && u <= 5) || (u >= 10 && u <= 12));
  return border || spine || lines;
}

export function renderIcon(scale) {
  const size = 16 * scale;
  return encodePng(size, (x, y) => (bookAt(Math.floor(x / scale), Math.floor(y / scale)) ? 255 : 0));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'trayTemplate.png'), renderIcon(1));
  writeFileSync(join(out, 'trayTemplate@2x.png'), renderIcon(2));
  console.log(`wrote ${join(out, 'trayTemplate.png')} and @2x`);
}
