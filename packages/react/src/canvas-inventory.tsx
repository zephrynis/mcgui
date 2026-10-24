'use client';

import { isValidElement, useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { assetUrl, measureText, spriteSlices, type AssetManifest, type SpriteRole } from '@mcgui/core';
import { InventoryGrid, type InventoryGridProps, type SlotData } from './inventory.js';
import { ItemIcon, type ItemIconProps } from './items.js';
import { useMinecraft } from './primitives.js';

type DrawItem = { icon?: NonNullable<AssetManifest['catalogue']>['items'][number]['icon']; count?: number; disabled?: boolean };
type ImageEntry = { image: HTMLImageElement; ready: boolean; failed: boolean; bytes: number };

/** Per-layer bounded cache. No browser objects are created during SSR. */
class Images {
  entries = new Map<string, ImageEntry>();
  used = 0;
  disposed = false;
  constructor(private baseUrl: string, private changed: () => void) {}
  get(file: string) {
    const existing = this.entries.get(file);
    if (existing) { this.entries.delete(file); this.entries.set(file, existing); return existing; }
    const image = new Image(), entry = { image, ready: false, failed: false, bytes: 0 };
    this.entries.set(file, entry); image.decoding = 'async'; image.src = assetUrl(this.baseUrl, file);
    void image.decode().then(() => {
      if (this.disposed) return;
      entry.ready = true; entry.bytes = image.naturalWidth * image.naturalHeight * 4; this.used += entry.bytes;
      this.changed();
    }, () => { if (!this.disposed) { entry.failed = true; this.changed(); } });
    return entry;
  }
  trim(protectedFiles: Set<string>) {
    for (const [file, entry] of this.entries) {
      if (this.entries.size <= 512 && this.used <= 16 * 1024 * 1024) break;
      if (protectedFiles.has(file) || (!entry.ready && !entry.failed)) continue;
      this.entries.delete(file); this.used -= entry.bytes;
    }
  }
  dispose() { this.disposed = true; this.entries.clear(); }
}

/** Experimental grid renderer. Unknown React item content remains ordinary DOM. */
export function CanvasInventoryGrid({ items, renderer, children, ...props }: Omit<InventoryGridProps, 'children' | 'drawing'> & {
  items: readonly (SlotData | null | undefined)[];
  renderer: 'dom' | 'canvas';
  children: (drawn: readonly boolean[]) => ReactNode;
}) {
  const { assets, baseUrl } = useMinecraft();
  const [state, setState] = useState<{ assets: AssetManifest; baseUrl: string; ready: boolean } | null>(null);
  const ready = renderer === 'canvas' && state?.assets === assets && state.baseUrl === baseUrl && state.ready;
  const lookup = useMemo(() => new Map(assets.catalogue?.items.map(item => [item.stackKey, item])), [assets.catalogue]);
  const drawings = useMemo(() => items.map((item): DrawItem | null => {
    const content = item?.content;
    if (content == null || content === false) return { count: item?.count, disabled: item?.disabled };
    if (!isValidElement<ItemIconProps>(content) || content.type !== ItemIcon) return null;
    const entry = lookup.get(content.props.stackKey), icon = entry?.icon;
    // Keep animated glint and damage decorations in HTML, including explicit
    // false/zero overrides. Other cells retain the cached canvas renderer.
    if ((content.props.glint ?? entry?.glint) || (content.props.damage ?? entry?.damage ?? 0) > 0) return null;
    return icon ? { icon, count: item?.count, disabled: item?.disabled } : null;
  }), [items, lookup]);
  const drawn = useMemo(() => drawings.map(item => !!ready && item !== null), [drawings, ready]);
  const report = useCallback((value: boolean) => setState(previous => previous?.assets === assets && previous.baseUrl === baseUrl && previous.ready === value
    ? previous : { assets, baseUrl, ready: value }), [assets, baseUrl]);
  return <InventoryGrid {...props} data-renderer={ready ? 'canvas' : 'dom'} drawing={renderer === 'canvas'
    ? <CanvasLayer items={drawings} columns={props.columns ?? 9} visible={!!ready} onReady={report} /> : undefined}>
    {children(drawn)}
  </InventoryGrid>;
}

function CanvasLayer({ items, columns, visible, onReady }: { items: readonly (DrawItem | null)[]; columns: number; visible: boolean; onReady: (value: boolean) => void }) {
  const { assets, baseUrl, scale } = useMinecraft();
  const ref = useRef<HTMLCanvasElement>(null);
  const paintRef = useRef<() => void>(() => {});
  const latest = useRef({ items, columns, scale, onReady });
  useLayoutEffect(() => { latest.current = { items, columns, scale, onReady }; paintRef.current(); }, [items, columns, scale, onReady]);
  useLayoutEffect(() => {
    const canvas = ref.current!, grid = canvas.parentElement!, context = canvas.getContext('2d');
    if (!context) { latest.current.onReady(false); return; }
    let frame = 0, disposed = false;
    const tinted = new Map<string, HTMLCanvasElement>();
    const schedule = () => { if (!disposed && !frame) frame = requestAnimationFrame(() => { frame = 0; paint(); }); };
    const images = new Images(baseUrl, schedule);
    const media = window.matchMedia('(forced-colors: active)');
    const slices = new Map<SpriteRole, ReturnType<typeof spriteSlices>>();
    function paint() {
      if (disposed) return;
      const { items, columns, scale, onReady } = latest.current;
      const used = new Set<string>();
      let complete = true, failed = false;
      const image = (file: string) => { used.add(file); const entry = images.get(file); complete &&= entry.ready; failed ||= entry.failed; return entry.ready ? entry.image : null; };
      // Load all resources needed for this frame before exposing the canvas.
      for (const role of ['slot.highlightBack', 'slot.highlightFront'] as const) {
        const sprite = assets.sprites[role]; if (!sprite) { onReady(false); return; } image(sprite.file);
      }
      for (const item of items) if (item) {
        if (item.icon) image((item.icon.atlas ?? item.icon).file);
        if (item.count && item.count > 1) for (const char of String(item.count)) {
          const glyph = assets.font.glyphs[char] ?? assets.font.glyphs['?']!; if (glyph.image) image(glyph.image.file);
        }
      }
      images.trim(used);
      if (media.matches || failed) { onReady(false); return; }
      // Keep the previous drawing until the next frame's images have decoded.
      // HTML artwork supplies the current frame during that interval.
      if (!complete) { onReady(false); canvas.dataset.ready = 'false'; return; }
      const width = columns * 18 + 6, height = Math.ceil(items.length / columns) * 18 + 6;
      const density = scale * Math.min(window.devicePixelRatio || 1, 4);
      const pixelWidth = Math.round(width * density), pixelHeight = Math.round(height * density);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) { canvas.width = pixelWidth; canvas.height = pixelHeight; }
      context!.setTransform(pixelWidth / width, 0, 0, pixelHeight / height, 0, 0);
      context!.imageSmoothingEnabled = false; context!.clearRect(0, 0, width, height);
      const sprite = (role: SpriteRole, x: number, y: number) => {
        const asset = assets.sprites[role]!;
        let parts = slices.get(role); if (!parts) { parts = spriteSlices(asset, 24, 24); slices.set(role, parts); }
        const source = image(asset.file)!;
        for (const part of parts) context!.drawImage(source, part.sx, part.sy, part.sw, part.sh, x + part.x, y + part.y, part.width, part.height);
      };
      const count = (text: string, x: number, y: number) => {
        let cursor = x - measureText(assets.font, text) - 1;
        const draw = (shadow: boolean) => {
          let at = cursor;
          for (const char of text) {
            const glyph = assets.font.glyphs[char] ?? assets.font.glyphs['?']!, g = glyph.image;
            if (g) {
              const source = image(g.file)!;
              let texture: CanvasImageSource = source;
              if (shadow) {
                let dark = tinted.get(g.file);
                if (!dark) {
                  dark = document.createElement('canvas'); dark.width = source.naturalWidth; dark.height = source.naturalHeight;
                  const ctx = dark.getContext('2d')!; ctx.drawImage(source, 0, 0); ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = '#3f3f3f'; ctx.fillRect(0, 0, dark.width, dark.height);
                  ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(source, 0, 0); tinted.set(g.file, dark);
                }
                texture = dark;
              }
              context!.drawImage(texture, g.x, g.y, g.width, g.height, at + Number(shadow), y + assets.font.baseline - g.ascent + Number(shadow), g.renderWidth, g.renderHeight);
            }
            at += glyph.advance;
          }
        };
        draw(true); draw(false);
      };
      const buttons = grid.querySelectorAll<HTMLButtonElement>('[data-mcgui-slot]');
      const highlighted: number[] = [];
      function drawCell(item: DrawItem, index: number, highlight: boolean) {
        const x = (index % columns) * 18 + 3, y = Math.floor(index / columns) * 18 + 3;
        if (highlight) sprite('slot.highlightBack', x - 3, y - 3);
        if (item.icon) {
          const icon = item.icon, source = image((icon.atlas ?? icon).file)!;
          const ratio = Math.min(16 / icon.pixelWidth, 16 / icon.pixelHeight), w = icon.pixelWidth * ratio, h = icon.pixelHeight * ratio;
          context!.globalAlpha = item.disabled ? .45 : 1;
          context!.drawImage(source, icon.atlas?.x ?? 0, icon.atlas?.y ?? 0, icon.pixelWidth, icon.pixelHeight, x + 1 + (16 - w) / 2, y + 1 + (16 - h) / 2, w, h); context!.globalAlpha = 1;
        }
        if (highlight) sprite('slot.highlightFront', x - 3, y - 3);
        if (item.count && item.count > 1) count(String(item.count), x + 19, y + 10);
      }
      items.forEach((item, index) => {
        if (!item) return;
        if (!item.disabled && buttons[index]?.matches(':hover, :focus-visible:not([data-mcgui-pointer-focus]), [data-selected]')) highlighted.push(index);
        else drawCell(item, index, false);
      });
      for (const index of highlighted) drawCell(items[index]!, index, true);
      images.trim(used); canvas.dataset.ready = 'true'; canvas.dataset.revision = String(Number(canvas.dataset.revision ?? 0) + 1); onReady(true);
    }
    paintRef.current = paint;
    const events = ['pointermove', 'pointerover', 'pointerout', 'pointerdown', 'pointerup', 'focusin', 'focusout', 'keydown', 'keyup'];
    for (const event of events) grid.addEventListener(event, schedule, true);
    window.addEventListener('resize', schedule); media.addEventListener('change', schedule); paint();
    return () => {
      disposed = true; cancelAnimationFrame(frame); images.dispose(); tinted.clear(); paintRef.current = () => {};
      for (const event of events) grid.removeEventListener(event, schedule, true);
      window.removeEventListener('resize', schedule); media.removeEventListener('change', schedule);
    };
  }, [assets, baseUrl]);
  return <canvas ref={ref} aria-hidden="true" className="mcgui-inventory-canvas" data-ready="false"
    style={{ position: 'absolute', left: -3 * scale, top: -3 * scale, width: (columns * 18 + 6) * scale,
      height: (Math.ceil(items.length / columns) * 18 + 6) * scale, visibility: visible ? 'visible' : 'hidden', pointerEvents: 'none', zIndex: 1, imageRendering: 'pixelated' }} />;
}
