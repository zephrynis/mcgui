import { resourcePath, type AssetManifest, type Glyph } from '@mcgui/core';
import { z } from 'zod';
import { Resolver, json } from './resources.js';
import { ImageStore } from './images.js';
import { extractUnihex } from './unihex.js';

const providerSchema = z.object({ type: z.string(), filter: z.record(z.string(), z.boolean()).optional() }).passthrough();
const fontSchema = z.object({ providers: z.array(providerSchema).max(4096) });
const bitmapSchema = z.object({ file: z.string(), ascent: z.number().int(), height: z.number().int().positive().max(256).default(8), chars: z.array(z.string()).min(1).max(8192) });
export const DEFAULT_CHARACTERS = Array.from({ length: 95 }, (_, i) => String.fromCodePoint(i + 32)).join('');

export async function extractFont(resolver: Resolver, images: ImageStore, characters: string): Promise<AssetManifest['font']> {
  const pending = new Set([...characters, '?']);
  if (pending.size > 4096) throw new Error('At most 4096 characters can be extracted at once.');
  if ([...pending].some(char => /[\u0000-\u001f\u007f]/.test(char))) throw new Error('Requested characters must not contain control characters.');
  const glyphs: Record<string, Glyph> = Object.create(null);
  const visiting = new Set<string>();
  async function visit(id: string) {
    if (!pending.size) return;
    if (visiting.has(id) || visiting.size > 32) throw new Error(`Cyclic or overly deep font reference: ${id}`);
    visiting.add(id);
    const name = resourcePath(id, 'font', '.json');
    const stack = await resolver.stack(name);
    if (!stack.length) throw new Error(`Missing font definition: ${name}`);
    for (const resource of stack) {
      for (const provider of fontSchema.parse(json(resource.data, name)).providers) {
        if (!pending.size) break;
        if (provider.filter) {
          if (Object.keys(provider.filter).some(key => key !== 'uniform' && key !== 'jp')) throw new Error(`Unsupported font filter in ${id}`);
          if (Object.values(provider.filter).some(value => value)) continue; // default font options: uniform=false, jp=false
        }
        const type = provider.type.replace(/^minecraft:/, '');
        if (type === 'reference') { await visit(z.string().parse(provider.id)); continue; }
        if (type === 'unihex') { await extractUnihex(provider, resolver, images, pending, glyphs); continue; }
        if (type === 'space') {
          const advances = z.record(z.string(), z.number().finite()).parse(provider.advances);
          for (const char of [...pending]) if (Object.hasOwn(advances, char)) { glyphs[char] = { advance: advances[char]! }; pending.delete(char); }
          continue;
        }
        if (type !== 'bitmap') throw new Error(`Font provider '${type}' is required for ${[...pending].slice(0, 12).join('')}; 0.1 supports bitmap, unihex, space and reference providers. Request a supported character set.`);
        const bitmap = bitmapSchema.parse(provider);
        const rows = bitmap.chars.map(row => [...row]);
        const columns = rows[0]!.length;
        if (!columns || rows.some(row => row.length !== columns)) throw new Error(`Unequal bitmap font rows: ${id}`);
        if (bitmap.ascent > bitmap.height) throw new Error(`Font ascent exceeds height: ${id}`);
        if (!rows.some(row => row.some(char => pending.has(char)))) continue;
        const imageName = resourcePath(bitmap.file, 'textures', '');
        const imageResource = await resolver.get(imageName);
        const { png, file } = images.add(imageResource.data, imageName);
        if (png.width % columns || png.height % rows.length) throw new Error(`Font image does not divide into its character grid: ${imageName}`);
        const cellWidth = png.width / columns, cellHeight = png.height / rows.length, ratio = bitmap.height / cellHeight;
        for (let row = 0; row < rows.length; row++) for (let col = 0; col < columns; col++) {
          const char = rows[row]![col]!;
          if (char === '\0' || !pending.has(char)) continue;
          let inkWidth = 0;
          for (let x = cellWidth - 1; x >= 0 && !inkWidth; x--) for (let y = 0; y < cellHeight; y++) {
            if (png.data[((row * cellHeight + y) * png.width + col * cellWidth + x) * 4 + 3]! > 0) { inkWidth = x + 1; break; }
          }
          glyphs[char] = { advance: Math.floor(inkWidth * ratio + 0.5) + 1,
            ...(inkWidth ? { image: { file, pixelWidth: png.width, pixelHeight: png.height, x: col * cellWidth, y: row * cellHeight,
              width: inkWidth, height: cellHeight, renderWidth: inkWidth * ratio, renderHeight: bitmap.height, ascent: bitmap.ascent } } : {}),
          };
          pending.delete(char);
        }
      }
    }
    visiting.delete(id);
  }
  await visit('minecraft:default');
  if (pending.size) throw new Error(`Font has no glyphs for: ${[...pending].join('')}`);
  return { id: 'minecraft:default', lineHeight: 9, baseline: 7, glyphs: Object.fromEntries(Object.entries(glyphs).sort(([a], [b]) => a.codePointAt(0)! - b.codePointAt(0)!)) };
}
