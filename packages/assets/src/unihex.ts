import { PNG } from 'pngjs';
import { z } from 'zod';
import { resourcePath, type Glyph } from '@mcgui/core';
import { openZipSource, type Resolver } from './resources.js';
import type { ImageStore } from './images.js';

const character = z.string().refine(value => [...value].length === 1, 'Expected one Unicode character');
const schema = z.object({
  hex_file: z.string(),
  size_overrides: z.array(z.object({ from: character, to: character,
    left: z.number().int().min(0).max(31), right: z.number().int().min(0).max(31),
  })).default([]),
});

/** Bake Minecraft's 16-pixel Unifont masks at their native half-size GUI metrics. */
export async function extractUnihex(provider: unknown, resolver: Resolver, images: ImageStore, pending: Set<string>, glyphs: Record<string, Glyph>): Promise<void> {
  const definition = schema.parse(provider);
  for (const override of definition.size_overrides) {
    if (override.from.codePointAt(0)! > override.to.codePointAt(0)! || override.left > override.right) throw new Error('Invalid unihex size override');
  }
  const name = resourcePath(definition.hex_file, '', '').replace('//', '/');
  const resource = await resolver.get(name);
  const archive = await openZipSource(resource.data, name);
  try {
    for (const entry of archive.names) {
      if (!entry.endsWith('.hex')) continue;
      const data = (await archive.read(entry))!.toString('utf8');
      for (const line of data.split('\n')) {
        const text = line.trim();
        if (!text) continue;
        const match = /^([0-9a-fA-F]{4,6}):([0-9a-fA-F]+)$/.exec(text);
        if (!match || ![32, 64, 96, 128].includes(match[2]!.length)) throw new Error(`Invalid unihex glyph in ${entry}`);
        const codepoint = parseInt(match[1]!, 16);
        if (codepoint > 0x10ffff || (codepoint >= 0xd800 && codepoint <= 0xdfff)) throw new Error(`Invalid unihex codepoint in ${entry}`);
        const char = String.fromCodePoint(codepoint);
        if (!pending.has(char)) continue;
        const width = match[2]!.length / 4, bytes = Buffer.from(match[2]!, 'hex');
        const bit = (x: number, y: number) => x >= 0 && x < width && (bytes[y * width / 8 + (x >> 3)]! & (0x80 >> (x & 7))) !== 0;
        let left = width, right = -1;
        for (let y = 0; y < 16; y++) for (let x = 0; x < width; x++) if (bit(x, y)) { left = Math.min(left, x); right = Math.max(right, x); }
        const override = definition.size_overrides.find(value => codepoint >= value.from.codePointAt(0)! && codepoint <= value.to.codePointAt(0)!);
        if (override) { left = override.left; right = override.right; }
        const inkWidth = Math.max(0, right - left + 1);
        if (!inkWidth) glyphs[char] = { advance: 1 };
        else {
          const png = new PNG({ width: inkWidth, height: 16 });
          for (let y = 0; y < 16; y++) for (let x = 0; x < inkWidth; x++) if (bit(x + left, y)) png.data.fill(255, (y * inkWidth + x) * 4, (y * inkWidth + x) * 4 + 4);
          const { file } = images.add(PNG.sync.write(png), `${entry}:${match[1]}`);
          glyphs[char] = { advance: inkWidth / 2 + 1, image: { file, pixelWidth: inkWidth, pixelHeight: 16,
            x: 0, y: 0, width: inkWidth, height: 16, renderWidth: inkWidth / 2, renderHeight: 8, ascent: 7 } };
        }
        pending.delete(char);
      }
    }
  } finally { archive.close(); }
}
