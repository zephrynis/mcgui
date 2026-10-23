import { PNG } from 'pngjs';
import type { CatalogueItem } from '@mcgui/core';
import { ImageStore } from './images.js';

type Icon = NonNullable<CatalogueItem['icon']>;

/** Small, deterministic pages preserve catalogue order within each resolution.
 * Source PNGs stay available for older consumers and oversized pack textures.
 */
export function buildItemAtlases(items: readonly CatalogueItem[], images: ImageStore) {
  const size = 512;
  const placements = new Map<string, NonNullable<Icon['atlas']>>();
  const groups = new Map<number, Icon[]>(), seen = new Set<string>();
  for (const { icon } of items) {
    if (!icon || seen.has(icon.file)) continue;
    seen.add(icon.file);
    const extent = Math.max(icon.pixelWidth, icon.pixelHeight);
    // Whole logical-pixel gutters prevent fractional source offsets when the
    // browser downsamples baked models. Unusual/large pack icons keep their PNG.
    if (extent % 16 || extent + extent / 8 > size) continue;
    const group = groups.get(extent) ?? []; group.push(icon); groups.set(extent, group);
  }
  for (const [extent, icons] of groups) {
    const padding = extent / 16;
    let page: { icon: Icon; x: number; y: number }[] = [];
    let x = 0, y = 0, rowHeight = 0, width = 0;
    function flush() {
      if (!page.length) return;
      const png = new PNG({ width, height: y + rowHeight });
      for (const entry of page) {
        const source = images.add(images.files.get(entry.icon.file)!, entry.icon.file).png;
        PNG.bitblt(source, png, 0, 0, source.width, source.height, entry.x, entry.y);
      }
      const { file } = images.add(PNG.sync.write(png), 'item atlas');
      for (const entry of page) placements.set(entry.icon.file, { file, pixelWidth: png.width, pixelHeight: png.height, x: entry.x, y: entry.y });
      page = []; x = 0; y = 0; rowHeight = 0; width = 0;
    }
    for (const icon of icons) {
      const w = Math.ceil(icon.pixelWidth / padding) * padding + padding * 2, h = Math.ceil(icon.pixelHeight / padding) * padding + padding * 2;
      if (x + w > size) { x = 0; y += rowHeight; rowHeight = 0; }
      if (y + Math.max(rowHeight, h) > size) flush();
      page.push({ icon, x: x + padding, y: y + padding });
      x += w; rowHeight = Math.max(rowHeight, h); width = Math.max(width, x);
    }
    flush();
  }
  for (const { icon } of items) if (icon) icon.atlas = placements.get(icon.file);
}
