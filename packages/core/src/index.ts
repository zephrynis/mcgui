import { z } from 'zod';
import { CREATIVE_TAB_SPRITES, type CreativeTabSprite } from './creative.js';
export * from './inventory.js';
export * from './creative.js';
export * from './item-state.js';

const dimension = z.number().int().positive().max(8192);
const coordinate = z.number().finite().nonnegative();
const assetPath = z.string().regex(/^files\/[a-f0-9]{64}\.png$/);
const border = z.object({ left: coordinate, top: coordinate, right: coordinate, bottom: coordinate });
export const scalingSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('stretch') }),
  z.object({ type: z.literal('tile'), width: dimension, height: dimension }),
  z.object({ type: z.literal('nine_slice'), width: dimension, height: dimension, border, stretchInner: z.boolean() }),
]).superRefine((value, ctx) => {
  if (value.type === 'nine_slice' && (value.border.left + value.border.right >= value.width || value.border.top + value.border.bottom >= value.height)) {
    ctx.addIssue({ code: 'custom', message: 'Nine-slice borders must leave a positive center.' });
  }
});
export type Scaling = z.infer<typeof scalingSchema>;

export const spriteSchema = z.object({
  id: z.string(), file: assetPath, pixelWidth: dimension, pixelHeight: dimension,
  scaling: scalingSchema, source: z.string(),
});
export type SpriteAsset = z.infer<typeof spriteSchema>;
export const textureSchema = spriteSchema.omit({ scaling: true }).extend({ logicalWidth: dimension, logicalHeight: dimension });
export type TextureAsset = z.infer<typeof textureSchema>;

const glyphSchema = z.object({
  advance: z.number().finite(),
  image: z.object({ file: assetPath, pixelWidth: dimension, pixelHeight: dimension,
    x: coordinate, y: coordinate, width: coordinate, height: dimension,
    renderWidth: coordinate, renderHeight: dimension, ascent: z.number().finite(),
  }).optional(),
}).superRefine(({ image }, ctx) => {
  if (image && (image.x + image.width > image.pixelWidth || image.y + image.height > image.pixelHeight)) {
    ctx.addIssue({ code: 'custom', message: 'Glyph rectangle is outside its image.' });
  }
});
export type Glyph = z.infer<typeof glyphSchema>;

export const itemIconSchema = z.object({ file: assetPath, pixelWidth: dimension, pixelHeight: dimension, kind: z.enum(['flat', 'model']), notes:z.array(z.string()).optional(),
  atlas: z.object({ file: assetPath, pixelWidth: dimension, pixelHeight: dimension,
    x: z.number().int().nonnegative(), y: z.number().int().nonnegative(),
  }).optional(),
}).superRefine(({ atlas, pixelWidth, pixelHeight }, ctx) => {
  if (atlas && (atlas.x + pixelWidth > atlas.pixelWidth || atlas.y + pixelHeight > atlas.pixelHeight)) {
    ctx.addIssue({ code: 'custom', message: 'Item rectangle is outside its atlas.' });
  }
});
export const tooltipRunSchema = z.object({ text:z.string(), color:z.string().regex(/^#[a-fA-F0-9]{6}$/).transform(value=>value as `#${string}`).optional(),
  bold:z.boolean().optional(), italic:z.boolean().optional(), underlined:z.boolean().optional(), strikethrough:z.boolean().optional(),
});
export const catalogueItemSchema = z.object({
  id: z.string(), stackKey: z.string(), label: z.string(), maxStackSize: z.number().int().min(1).max(999),
  categories: z.array(z.string()), tags: z.array(z.string()), components: z.record(z.string(), z.unknown()),
  tooltip: z.array(z.string()), icon: itemIconSchema.optional(), iconWarning: z.string().optional(),
  styledTooltip:z.array(z.array(tooltipRunSchema)).optional(),
  damage:z.number().int().nonnegative().optional(), maxDamage:z.number().int().nonnegative().optional(), glint:z.boolean().optional(),
});
export type CatalogueItem = z.infer<typeof catalogueItemSchema>;

export const manifestSchema = z.object({
  schemaVersion: z.literal(1), generatorVersion: z.literal('0.1.0'),
  minecraft: z.object({ edition: z.literal('java'), version: z.literal('26.2'), resourcePackFormat: z.literal(88) }),
  sources: z.array(z.object({ name: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/) })),
  sprites: z.object({ 'button.normal': spriteSchema, 'button.highlighted': spriteSchema, 'button.disabled': spriteSchema,
    'slot.background': spriteSchema.optional(), 'slot.highlightBack': spriteSchema.optional(), 'slot.highlightFront': spriteSchema.optional(),
    'tooltip.background': spriteSchema.optional(), 'tooltip.frame': spriteSchema.optional(),
    'checkbox.normal': spriteSchema.optional(), 'checkbox.highlighted': spriteSchema.optional(),
    'checkbox.selected': spriteSchema.optional(), 'checkbox.selectedHighlighted': spriteSchema.optional(),
    'slider.normal': spriteSchema.optional(), 'slider.highlighted': spriteSchema.optional(),
    'slider.handle': spriteSchema.optional(), 'slider.handleHighlighted': spriteSchema.optional(),
    'progress.experienceBackground': spriteSchema.optional(), 'progress.experienceFill': spriteSchema.optional(),
    'furnace.flame': spriteSchema.optional(), 'furnace.arrow': spriteSchema.optional(),
    'creative.scroller': spriteSchema.optional(), 'creative.scrollerDisabled': spriteSchema.optional(),
    'villager.arrow': spriteSchema.optional(), 'villager.arrowOutOfStock': spriteSchema.optional(),
    'villager.outOfStock': spriteSchema.optional(),
    'villager.scroller': spriteSchema.optional(), 'villager.scrollerDisabled': spriteSchema.optional(),
    'villager.experienceBackground': spriteSchema.optional(), 'villager.experienceCurrent': spriteSchema.optional(),
    ...Object.fromEntries(Object.keys(CREATIVE_TAB_SPRITES).map(key => [key, spriteSchema.optional()])) as Record<CreativeTabSprite, z.ZodOptional<typeof spriteSchema>>,
  }),
  textures: z.object({ 'container.chest': textureSchema.optional(), 'container.furnace': textureSchema.optional(),
    'container.villager': textureSchema.optional(),
    'item.glint':textureSchema.optional(),
    'creative.items': textureSchema.optional(), 'creative.search': textureSchema.optional(), 'creative.inventory': textureSchema.optional(),
  }).optional(),
  font: z.object({ id: z.string(), lineHeight: dimension, baseline: coordinate, glyphs: z.record(z.string(), glyphSchema) }),
  catalogue: z.object({ items: z.array(catalogueItemSchema), categories: z.array(z.object({ id: z.string(), label: z.string(), items: z.array(z.string()) })) }).optional(),
  capabilities: z.array(z.string()), warnings: z.array(z.string()),
}).superRefine((manifest, ctx) => {
  if (!manifest.font.glyphs['?']) ctx.addIssue({ code: 'custom', message: 'Manifest requires a ? fallback glyph.' });
});
export type AssetManifest = z.infer<typeof manifestSchema>;
export type SpriteRole = keyof AssetManifest['sprites'];
export function parseManifest(value: unknown): AssetManifest { return manifestSchema.parse(value); }

export const JAVA_26_2 = {
  version: '26.2', resourcePackFormat: 88,
  buttons: {
    'button.normal': 'minecraft:widget/button',
    'button.highlighted': 'minecraft:widget/button_highlighted',
    'button.disabled': 'minecraft:widget/button_disabled',
  },
  inventory: {
    'slot.background': 'minecraft:container/slot',
    'slot.highlightBack': 'minecraft:container/slot_highlight_back',
    'slot.highlightFront': 'minecraft:container/slot_highlight_front',
    'tooltip.background': 'minecraft:tooltip/background',
    'tooltip.frame': 'minecraft:tooltip/frame',
  },
  controls: {
    'checkbox.normal': 'minecraft:widget/checkbox',
    'checkbox.highlighted': 'minecraft:widget/checkbox_highlighted',
    'checkbox.selected': 'minecraft:widget/checkbox_selected',
    'checkbox.selectedHighlighted': 'minecraft:widget/checkbox_selected_highlighted',
    'slider.normal': 'minecraft:widget/slider',
    'slider.highlighted': 'minecraft:widget/slider_highlighted',
    'slider.handle': 'minecraft:widget/slider_handle',
    'slider.handleHighlighted': 'minecraft:widget/slider_handle_highlighted',
  },
  progress: {
    'progress.experienceBackground': 'minecraft:hud/experience_bar_background',
    'progress.experienceFill': 'minecraft:hud/experience_bar_progress',
    'furnace.flame': 'minecraft:container/furnace/lit_progress',
    'furnace.arrow': 'minecraft:container/furnace/burn_progress',
  },
  containers: {
    'container.villager': 'minecraft:gui/container/villager',
    'container.chest': 'minecraft:gui/container/generic_54',
    'container.furnace': 'minecraft:gui/container/furnace',
    'creative.items': 'minecraft:gui/container/creative_inventory/tab_items',
    'creative.search': 'minecraft:gui/container/creative_inventory/tab_item_search',
    'creative.inventory': 'minecraft:gui/container/creative_inventory/tab_inventory',
  },
  creative: {
    ...CREATIVE_TAB_SPRITES,
    'creative.scroller': 'minecraft:container/creative_inventory/scroller',
    'creative.scrollerDisabled': 'minecraft:container/creative_inventory/scroller_disabled',
  },
  villager: {
    'villager.scroller': 'minecraft:container/villager/scroller',
    'villager.scrollerDisabled': 'minecraft:container/villager/scroller_disabled',
    'villager.arrow': 'minecraft:container/villager/trade_arrow',
    'villager.arrowOutOfStock': 'minecraft:container/villager/trade_arrow_out_of_stock',
    'villager.outOfStock': 'minecraft:container/villager/out_of_stock',
    'villager.experienceBackground': 'minecraft:container/villager/experience_bar_background',
    'villager.experienceCurrent': 'minecraft:container/villager/experience_bar_current',
  },
  checkbox: { size: 17, gap: 4 },
  slider: { height: 20, handleWidth: 8 },
  furnace: {
    width: 176, height: 166, titleY: 6, inventoryTitle: { x: 8, y: 72 },
    input: { x: 55, y: 16 }, fuel: { x: 55, y: 52 }, output: { x: 115, y: 34 },
    inventory: { x: 7, y: 83 }, hotbar: { x: 7, y: 141 },
    flame: { x: 56, y: 36 }, arrow: { x: 79, y: 34 },
  },
} as const;

export type ProgressVariant = 'experience' | 'furnace-arrow' | 'furnace-flame';
/** Match a native range input's step grid so its hit target and artwork agree. */
export function normalizeSliderValue(value: number, min: number, max: number, step: number): number {
  const steps = (max - min) / step;
  if (![min, max, value, step, steps].every(Number.isFinite) || max <= min || step <= 0 || value < min || value > max || steps > Number.MAX_SAFE_INTEGER) {
    throw new Error('Slider needs finite min < max, a positive representable step, and a value within its range.');
  }
  const lastStep = Math.floor(steps + Number.EPSILON * Math.max(1, steps) * 4);
  const offset = (value - min) / step;
  const index = Math.min(lastStep, Math.floor(offset + 0.5 + Number.EPSILON * Math.max(1, offset) * 4));
  return Math.min(max, Math.max(min, Number((min + index * step).toPrecision(15))));
}
/** Reveal full-size artwork on the logical pixel grid; never squeeze the fill. */
export function progressGeometry(variant: ProgressVariant, value: number) {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error('Progress value must be a finite number from 0 to 1.');
  switch (variant) {
    case 'experience': return { width: 182, height: 5, filled: Math.min(182, Math.floor(value * 183)), vertical: false,
      sprite: 'progress.experienceFill' as const, background: 'progress.experienceBackground' as SpriteRole | undefined };
    case 'furnace-arrow': return { width: 24, height: 16, filled: Math.ceil(value * 24), vertical: false,
      sprite: 'furnace.arrow' as const, background: undefined };
    case 'furnace-flame': return { width: 14, height: 14, filled: value === 0 ? 0 : Math.ceil(value * 13) + 1, vertical: true,
      sprite: 'furnace.flame' as const, background: undefined };
    default: throw new Error(`Unknown progress variant: ${variant}`);
  }
}

export function resourcePath(id: string, directory: string, extension: string): string {
  const qualified = id.includes(':') ? id : `minecraft:${id}`;
  if (!/^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(qualified)) throw new Error(`Invalid resource ID: ${id}`);
  const [namespace, name] = qualified.split(':') as [string, string];
  if (name.split('/').some(part => !part || part === '.' || part === '..')) throw new Error(`Unsafe resource ID: ${id}`);
  return `assets/${namespace}/${directory}/${name}${extension}`;
}

export function assetUrl(baseUrl: string, file: string): string {
  assetPath.parse(file);
  return `${baseUrl.replace(/\/$/, '')}/${file}`;
}

export type Slice = { sx: number; sy: number; sw: number; sh: number; x: number; y: number; width: number; height: number };

/** Geometry in logical GUI units; source rectangles are in texture pixels. */
export function spriteSlices(sprite: SpriteAsset, width: number, height: number): Slice[] {
  dimension.parse(width); dimension.parse(height);
  const { scaling, pixelWidth: pw, pixelHeight: ph } = sprite;
  if (scaling.type === 'stretch') return [{ sx: 0, sy: 0, sw: pw, sh: ph, x: 0, y: 0, width, height }];
  const result: Slice[] = [];
  const rx = pw / scaling.width, ry = ph / scaling.height;
  function region(sx: number, sy: number, sw: number, sh: number, x: number, y: number, w: number, h: number, tileX: boolean, tileY: boolean) {
    if (w <= 0 || h <= 0 || sw <= 0 || sh <= 0) return;
    const stepX = tileX ? sw : w, stepY = tileY ? sh : h;
    if (Math.ceil(w / stepX) * Math.ceil(h / stepY) + result.length > 10000) throw new Error('Sprite requires too many tiles.');
    for (let dy = 0; dy < h; dy += stepY) for (let dx = 0; dx < w; dx += stepX) {
      const dw = Math.min(stepX, w - dx), dh = Math.min(stepY, h - dy);
      result.push({ sx: sx * rx, sy: sy * ry, sw: (tileX ? dw : sw) * rx, sh: (tileY ? dh : sh) * ry,
        x: x + dx, y: y + dy, width: dw, height: dh });
    }
  }
  if (scaling.type === 'tile') {
    region(0, 0, scaling.width, scaling.height, 0, 0, width, height, true, true);
    return result;
  }
  // Minecraft bypasses slicing when the requested size equals the logical size.
  if (width === scaling.width && height === scaling.height) return [{ sx: 0, sy: 0, sw: pw, sh: ph, x: 0, y: 0, width, height }];
  const { left, top, right, bottom } = scaling.border;
  const dl = Math.min(left, Math.floor(width / 2)), dr = Math.min(right, Math.floor(width / 2));
  const dt = Math.min(top, Math.floor(height / 2)), db = Math.min(bottom, Math.floor(height / 2));
  const xs = [0, left, scaling.width - dr], ys = [0, top, scaling.height - db];
  const sws = [dl, scaling.width - left - right, dr], shs = [dt, scaling.height - top - bottom, db];
  const dxs = [0, dl, width - dr], dys = [0, dt, height - db];
  const dws = [dl, width - dl - dr, dr], dhs = [dt, height - dt - db, db];
  for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
    region(xs[col]!, ys[row]!, sws[col]!, shs[row]!, dxs[col]!, dys[row]!, dws[col]!, dhs[row]!, col === 1 && !(row === 1 && scaling.stretchInner), row === 1 && !(col === 1 && scaling.stretchInner));
  }
  return result;
}

export function measureText(font: AssetManifest['font'], text: TextContent): number {
  let width = 0, maximum = 0;
  for (const run of textRuns(text)) for (const char of run.text) {
    if (char === '\n') { maximum = Math.max(maximum,width); width = 0; }
    else width += (font.glyphs[char] ?? font.glyphs['?'])!.advance + Number(!!run.bold);
  }
  return Math.max(maximum,width);
}

/** Container coordinates are logical pixels. Inventory indexes follow visual order. */
export function chestLayout(rows: number) {
  if (!Number.isInteger(rows) || rows < 1 || rows > 6) throw new Error('Chest rows must be an integer from 1 to 6.');
  return { width: 176, height: 114 + rows * 18, topHeight: 17 + rows * 18,
    title: { x: 8, y: 6 }, inventoryTitle: { x: 8, y: 20 + rows * 18 },
    chest: { x: 7, y: 17 }, inventory: { x: 7, y: 30 + rows * 18 }, hotbar: { x: 7, y: 88 + rows * 18 },
  };
}

export const TEXT_COLORS = {
  black: '#000000', dark_blue: '#0000aa', dark_green: '#00aa00', dark_aqua: '#00aaaa',
  dark_red: '#aa0000', dark_purple: '#aa00aa', gold: '#ffaa00', gray: '#aaaaaa',
  dark_gray: '#555555', blue: '#5555ff', green: '#55ff55', aqua: '#55ffff',
  red: '#ff5555', light_purple: '#ff55ff', yellow: '#ffff55', white: '#ffffff',
} as const;
export type TextColor = keyof typeof TEXT_COLORS | `#${string}`;
export interface TextRun { text: string; color?: TextColor; bold?: boolean; italic?: boolean; underlined?: boolean; strikethrough?: boolean }
export type TextContent = string | readonly TextRun[];
export function textRuns(content: TextContent): readonly TextRun[] { return typeof content === 'string' ? [{ text: content }] : content; }
export function plainText(content: TextContent): string { return textRuns(content).map(run => run.text).join(''); }
export function textColor(color?: TextColor): string {
  if (color === undefined) return 'currentColor';
  if (Object.hasOwn(TEXT_COLORS, color)) return TEXT_COLORS[color as keyof typeof TEXT_COLORS];
  if (/^#[a-fA-F0-9]{6}$/.test(color)) return color;
  throw new Error(`Invalid text color: ${color}. Use a Minecraft color name or #RRGGBB.`);
}

/** Word wrapping preserves color runs, explicit newlines, and splits oversized words. */
export function wrapText(font: AssetManifest['font'], content: TextContent, maxWidth: number): TextRun[][] {
  if (!Number.isFinite(maxWidth) || maxWidth <= 0) throw new Error('Text width must be positive.');
  type Character = TextRun & { width: number };
  const chars: Character[] = textRuns(content).flatMap(run => {
    textColor(run.color);
    return [...run.text].map(char => ({ ...run, text: char, width: char === '\n' ? 0 : (font.glyphs[char] ?? font.glyphs['?'])!.advance + Number(!!run.bold) }));
  });
  const lines: Character[][] = [[]]; let width = 0;
  for (let i = 0; i < chars.length;) {
    const char = chars[i]!;
    if (char.text === '\n') { lines.push([]); width = 0; i++; continue; }
    let end = i + 1;
    if (char.text !== ' ') while (end < chars.length && chars[end]!.text !== ' ' && chars[end]!.text !== '\n') end++;
    const word = chars.slice(i, end), wordWidth = word.reduce((sum, item) => sum + item.width, 0);
    if (width > 0 && width + wordWidth > maxWidth) {
      while (lines.at(-1)!.at(-1)?.text === ' ') lines.at(-1)!.pop();
      lines.push([]); width = 0;
      if (char.text === ' ') { i = end; continue; }
    }
    for (const item of word) {
      if (width > 0 && width + item.width > maxWidth) { lines.push([]); width = 0; }
      lines.at(-1)!.push(item); width += item.width;
    }
    i = end;
  }
  return lines.map(line => {
    const runs: TextRun[] = [];
    for (const char of line) {
      const last = runs.at(-1);
      if (last && last.color === char.color && last.bold === char.bold && last.italic === char.italic && last.underlined === char.underlined && last.strikethrough === char.strikethrough) last.text += char.text;
      else { const {width:_,...run} = char; runs.push(run); }
    }
    return runs.length ? runs : [{ text: '' }];
  });
}

export function placeTooltip(anchor: { x: number; y: number }, size: { width: number; height: number }, viewport: { width: number; height: number }, gap = 12, margin = 4) {
  let x = anchor.x + gap, y = anchor.y - gap;
  if (x + size.width > viewport.width - margin) x = anchor.x - gap - size.width;
  return { x: Math.floor(Math.max(margin, Math.min(x, viewport.width - size.width - margin))),
    y: Math.floor(Math.max(margin, Math.min(y, viewport.height - size.height - margin))) };
}
