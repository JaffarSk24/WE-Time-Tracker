import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { inflateSync } from 'zlib';
import { Buffer } from 'buffer';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { encodeRgbaPng, crc32 } = require('../scripts/png-rgba.cjs');

function chunks(png) {
  const list = [];
  for (let i = 8; i < png.length;) {
    const length = png.readUInt32BE(i);
    const type = png.toString('ascii', i + 4, i + 8);
    const data = png.subarray(i + 8, i + 8 + length);
    list.push({ type, data, crcOk: crc32(png.subarray(i + 4, i + 8 + length)) === png.readUInt32BE(i + 8 + length) });
    i += 12 + length;
  }
  return list;
}

describe('RGBA PNG writer', () => {
  it('writes a valid 8-bit RGBA PNG with the given pixels', () => {
    const pixels = Buffer.from([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 76, 83, 109, 255]);
    const png = encodeRgbaPng(2, 2, pixels);
    expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const list = chunks(png);
    expect(list.map(c => c.type)).toEqual(['IHDR', 'sRGB', 'IDAT', 'IEND']);
    expect(list.every(c => c.crcOk)).toBe(true);
    const header = list[0].data;
    expect([header.readUInt32BE(0), header.readUInt32BE(4), header[8], header[9]]).toEqual([2, 2, 8, 6]);
    const raw = inflateSync(list[2].data);
    expect(raw).toEqual(Buffer.concat([Buffer.from([0]), pixels.subarray(0, 8), Buffer.from([0]), pixels.subarray(8)]));
  });

  it('refuses pixel data of the wrong size', () => {
    expect(() => encodeRgbaPng(2, 2, Buffer.alloc(15))).toThrow();
  });
});

describe('phone app icons', () => {
  const manifest = JSON.parse(readFileSync(new URL('../public-web/manifest.webmanifest', import.meta.url), 'utf8'));
  const page = readFileSync(new URL('../web.html', import.meta.url), 'utf8');

  it('are opaque 8-bit RGBA PNGs of the declared size, as in WE Budget', () => {
    const touch = page.match(/rel="apple-touch-icon" sizes="180x180" href="\.\/([^"]+)"/)[1];
    const icons = [{ src: touch, sizes: '180x180' }, ...manifest.icons];
    for (const { src, sizes } of icons) {
      const png = readFileSync(new URL('../public-web/' + src, import.meta.url));
      const list = chunks(png);
      expect(list.every(c => c.crcOk)).toBe(true);
      const header = list[0].data;
      expect(`${header.readUInt32BE(0)}x${header.readUInt32BE(4)}`).toBe(sizes);
      expect([header[8], header[9]]).toEqual([8, 6]);
    }
  });

  it('use one apple-touch-icon link and a manifest without purpose or id', () => {
    expect(page).not.toMatch(/apple-touch-icon-precomposed/);
    expect(page.match(/rel="apple-touch-icon"/g)).toHaveLength(1);
    expect(manifest.id).toBeUndefined();
    expect(manifest.icons.some(icon => 'purpose' in icon)).toBe(false);
  });
});
