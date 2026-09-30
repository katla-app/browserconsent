// Renders the official Katla mark (assets/logo/logo.svg and logo-dark.svg) into PNG icons, without
// any dependencies. The mark is a circle (r=16 at 16,16) with a bite (r=8.615 at 30.769,1.231) on a
// 32-unit grid; the script refuses to run if the official SVG no longer has that shape.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const LOGO_DIR = new URL('../assets/logo/', import.meta.url);
const OUT = new URL('../src/icons/', import.meta.url);
const SIZES = [16, 32, 48, 96, 128];
// Chrome Web Store guidelines: the 128px icon is a 96px mark with 16px transparent padding per side.
// Toolbar sizes stay edge to edge so the mark is as legible as possible.
const PADDING = { 128: 16 };
const SAMPLES = 8;
const MARK_PATH = 'M30.769 9.846A16 16 0 1 1 22.154 1.231A8.615 8.615 0 0 0 30.769 9.846Z';

// Reads the fill colour from an official logo file after checking its geometry is the one rendered here.
function officialFill(file) {
  const svg = readFileSync(new URL(file, LOGO_DIR), 'utf8');
  if (!svg.includes('viewBox="0 0 32 32"') || !svg.includes(`d="${MARK_PATH}"`)) {
    throw new Error(`${file} no longer matches the mark this script renders. Update make-icons.mjs.`);
  }
  const hex = svg.match(/fill="#([0-9a-f]{6})"/i)?.[1];
  if (!hex) throw new Error(`No fill colour found in ${file}`);
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

const inMark = (x, y) => Math.hypot(x - 16, y - 16) <= 16 && Math.hypot(x - 30.769, y - 1.231) >= 8.615;

function render(size, [r, g, b]) {
  const pixels = Buffer.alloc(size * size * 4);
  const padding = PADDING[size] ?? 0;
  const scale = 32 / (size - 2 * padding);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let covered = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const x = (px - padding + (sx + 0.5) / SAMPLES) * scale;
          const y = (py - padding + (sy + 0.5) / SAMPLES) * scale;
          if (inMark(x, y)) covered++;
        }
      }
      if (!covered) continue;
      const i = (py * size + px) * 4;
      pixels[i] = r;
      pixels[i + 1] = g;
      pixels[i + 2] = b;
      pixels[i + 3] = Math.round((covered / SAMPLES ** 2) * 255);
    }
  }
  return pixels;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function png(size, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const variants = [
  { prefix: 'icon', fill: officialFill('logo.svg') },
  // White mark for dark browser themes (Firefox `theme_icons`).
  { prefix: 'icon-light', fill: officialFill('logo-dark.svg') },
];

mkdirSync(OUT, { recursive: true });
const written = [];
for (const { prefix, fill } of variants) {
  for (const size of SIZES) {
    writeFileSync(new URL(`${prefix}-${size}.png`, OUT), png(size, render(size, fill)));
    written.push(`${prefix}-${size}.png`);
  }
}
console.log(`Wrote ${written.join(', ')}`);
