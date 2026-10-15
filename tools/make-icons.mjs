// Draws the app icon (amber ring + beacon diamond on night black) as PNGs, no dependencies.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons');
const crcT = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = b => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };

function icon(size) {
  const px = Buffer.alloc(size * (size * 4 + 1));
  const c = size / 2, SS = 3;
  for (let y = 0; y < size; y++) {
    px[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const fx = (x + (sx + 0.5) / SS - c) / size, fy = (y + (sy + 0.5) / SS - c) / size;
        const d = Math.hypot(fx, fy);
        let col = [3, 6, 11];
        const glow = Math.max(0, 1 - Math.abs(d - 0.3) / 0.12);
        col = [col[0] + 60 * glow * glow, col[1] + 40 * glow * glow, col[2]];
        if (Math.abs(d - 0.3) < 0.035) col = [255, 176, 32];                 // ring
        if (Math.abs(fx) + Math.abs(fy) < 0.12) col = [255, 176, 32];         // diamond
        if (Math.abs(fx) < 0.008 && fy < -0.12 && fy > -0.27) col = [56, 232, 255]; // beam
        r += col[0]; g += col[1]; b += col[2];
      }
      const o = y * (size * 4 + 1) + 1 + x * 4, n = SS * SS;
      px[o] = r / n; px[o + 1] = g / n; px[o + 2] = b / n; px[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(px)), chunk('IEND', Buffer.alloc(0))]);
}
for (const s of [192, 512]) writeFileSync(join(out, `icon-${s}.png`), icon(s));
writeFileSync(join(out, 'icon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#03060b"/><circle cx="50" cy="50" r="30" fill="none" stroke="#ffb020" stroke-width="7"/><path d="M50 38 62 50 50 62 38 50Z" fill="#ffb020"/><rect x="49" y="23" width="2" height="15" fill="#38e8ff"/></svg>`);
console.log('icons written');
