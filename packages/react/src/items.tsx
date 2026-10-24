'use client';
import { useEffect, useLayoutEffect, useMemo, useRef, type CSSProperties, type ReactNode } from 'react';
import { assetUrl, durabilityBar, type AssetManifest, type CatalogueItem, type TextContent, type TextRun } from '@mcgui/core';
import { useMinecraft } from './primitives.js';
import type { CreativeItem } from './creative.js';

export interface ItemIconProps { stackKey: string; fallback?: ReactNode; damage?: number; maxDamage?: number; glint?: boolean }
const catalogues = new WeakMap<NonNullable<AssetManifest['catalogue']>,Map<string,CatalogueItem>>();
function iconSource(icon: NonNullable<CatalogueItem['icon']>, scale: number) {
  const extent = Math.max(icon.pixelWidth, icon.pixelHeight), target = 16 * scale;
  // Fractional resampling of a complete sheet can choose different source
  // pixels than a standalone PNG. Preserve existing artwork at those scales.
  return icon.atlas && (Number.isInteger(extent / target) || Number.isInteger(target / extent)) ? icon.atlas : icon;
}
function GlintMotion({scale}: {scale:number}) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(()=>{
    // New slots join the same phase instead of restarting the shimmer on pickup.
    const time = typeof document.timeline.currentTime === 'number' ? document.timeline.currentTime : performance.now();
    const layer = ref.current!.firstElementChild as HTMLElement;
    if (!layer.animate) return;
    // Both UV axes share one compositor animation. Duplicate offsets wrap a
    // whole repeating tile without a visible jump or a second animated layer.
    const duration = 82500, tile = 32*scale;
    const stops = [...new Set([0,27500,55000,...Array.from({length:11},(_,index)=>(index+1)*7500)])].sort((a,b)=>a-b);
    const frames: Keyframe[] = [];
    for (const t of stops) {
      const x = (t%27500)/27500, y = (t%7500)/7500;
      if (t) frames.push({offset:t/duration,transform:`translate(${(t%27500 ? x : 1)*tile}px, ${-(t%7500 ? y : 1)*tile}px)`});
      if (t<duration) frames.push({offset:t/duration,transform:`translate(${x*tile}px, ${-y*tile}px)`});
    }
    const animation = layer.animate(frames,{duration,iterations:Infinity});
    animation.currentTime = time%duration;
    const reduced = matchMedia('(prefers-reduced-motion: reduce), (forced-colors: active)');
    const update = () => { if (reduced.matches) animation.pause(); else animation.play(); };
    update(); reduced.addEventListener('change',update);
    return ()=>{reduced.removeEventListener('change',update);animation.cancel();};
  },[scale]);
  return <span ref={ref} className="mcgui-glint-angle"><span className="mcgui-glint-y" /></span>;
}
/** Resolves against the current provider, including after a resource-pack switch. */
export function ItemIcon({ stackKey, fallback, damage, maxDamage, glint }: ItemIconProps) {
  const { assets, baseUrl, scale } = useMinecraft();
  const catalogue = assets.catalogue;
  if (catalogue && !catalogues.has(catalogue)) catalogues.set(catalogue,new Map(catalogue.items.map(item=>[item.stackKey,item])));
  const item = catalogue && catalogues.get(catalogue)?.get(stackKey), icon = item?.icon;
  const bar = durabilityBar(damage ?? item?.damage ?? 0,maxDamage ?? item?.maxDamage ?? 0);
  const foil = (glint ?? item?.glint ?? false) && !!assets.textures?.['item.glint'];
  if (!icon) return <>{fallback ?? <svg aria-hidden="true" viewBox="0 0 16 16" width={16*scale} height={16*scale} shapeRendering="crispEdges"><path fill="#1d1722" d="M2 2h12v12H2z"/><path fill="#d050ce" d="M2 2h6v6H2zm6 6h6v6H8z"/></svg>}</>;
  let artwork: ReactNode;
  if (icon.atlas && iconSource(icon, scale) === icon.atlas) {
    const atlas = icon.atlas, extent = Math.max(icon.pixelWidth, icon.pixelHeight);
    artwork = <span aria-hidden="true" className="mcgui-item-atlas" style={{display:'block',position:'relative',overflow:'hidden',width:16*scale,height:16*scale,maxWidth:'100%',maxHeight:'100%',
      clipPath: icon.pixelWidth === icon.pixelHeight ? undefined : `inset(${(extent-icon.pixelHeight)/extent*50}% ${(extent-icon.pixelWidth)/extent*50}%)`}}>
      <img alt="" draggable={false} src={assetUrl(baseUrl,atlas.file)} width={atlas.pixelWidth} height={atlas.pixelHeight}
        style={{position:'absolute',maxWidth:'none',imageRendering:'pixelated',width:`${atlas.pixelWidth/extent*100}%`,height:`${atlas.pixelHeight/extent*100}%`,
          left:`${((extent-icon.pixelWidth)/2-atlas.x)/extent*100}%`,top:`${((extent-icon.pixelHeight)/2-atlas.y)/extent*100}%`}} />
    </span>;
  } else artwork = <img aria-hidden="true" alt="" draggable={false} src={assetUrl(baseUrl,icon.file)} width={16*scale} height={16*scale} style={{imageRendering:'pixelated',width:'100%',height:'100%',objectFit:'contain'}} />;
  if (!bar && !foil) return artwork;
  const source = iconSource(icon,scale), extent = Math.max(icon.pixelWidth,icon.pixelHeight), ratio = 16*scale/extent;
  const sx = 'x' in source ? source.x : 0, sy = 'y' in source ? source.y : 0;
  return <span className="mcgui-item-state" aria-hidden="true" style={{position:'relative',display:'block',width:16*scale,height:16*scale,isolation:'isolate'}}>
    {artwork}
    {foil ? <span className="mcgui-item-glint" style={{position:'absolute',inset:0,pointerEvents:'none',overflow:'hidden',mixBlendMode:'plus-lighter',imageRendering:'pixelated',
      maskImage:`url("${assetUrl(baseUrl,source.file)}")`,maskMode:'alpha',maskRepeat:'no-repeat',
      maskSize:`${source.pixelWidth*ratio}px ${source.pixelHeight*ratio}px`,maskPosition:`${((extent-icon.pixelWidth)/2-sx)*ratio}px ${((extent-icon.pixelHeight)/2-sy)*ratio}px`,
      clipPath:`inset(${(extent-icon.pixelHeight)/extent*50}% ${(extent-icon.pixelWidth)/extent*50}%)`,
      '--mcgui-glint-texture':`url("${assetUrl(baseUrl,assets.textures!['item.glint']!.file)}")`, '--mcgui-glint-tile':`${32*scale}px`,
    } as CSSProperties}><GlintMotion scale={scale}/></span> : null}
    {bar ? <span className="mcgui-durability" data-width={bar.width} style={{position:'absolute',left:2*scale,top:13*scale,width:13*scale,height:2*scale,background:'#000'}}>
      <span style={{display:'block',width:bar.width*scale,height:scale,background:bar.color}} />
    </span> : null}
  </span>;
}

export interface ItemTooltipOptions {
  /** Overrides the title, e.g. a custom name. */
  name?: TextContent;
  enchantments?: readonly TextContent[];
  lore?: readonly TextContent[];
  /** Complete attribute section including its heading, if replacing extracted lines. */
  attributes?: readonly TextContent[];
}
/** Builds styled tooltip text without interpreting untrusted HTML or click events. */
export function itemTooltip(item: Pick<CatalogueItem,'tooltip'|'styledTooltip'>, options: ItemTooltipOptions = {}): TextContent {
  const lines: readonly TextContent[] = item.styledTooltip ?? item.tooltip;
  const runs = (line: TextContent, defaults: Omit<TextRun,'text'> = {}): TextRun[] => typeof line === 'string' ? [{...defaults,text:line}] : line.map(run=>({...defaults,...run}));
  const originalTitle = runs(lines[0] ?? '');
  const title = options.name === undefined ? originalTitle : runs(options.name,{color:originalTitle[0]?.color,italic:true});
  // Native extraction already orders enchantments/lore/attributes. Explicit
  // overrides build a complete custom detail section to avoid stale duplicates.
  const custom = options.enchantments !== undefined || options.lore !== undefined || options.attributes !== undefined;
  const rest: TextRun[][] = custom ? [
    ...(options.enchantments ?? []).map(line=>runs(line,{color:'gray'})),
    ...(options.lore ?? []).map(line=>runs(line,{color:'dark_purple',italic:true})),
    ...(options.attributes?.length ? [[{text:''}],...options.attributes.map(line=>runs(line))] : []),
  ] : lines.slice(1).map(line=>runs(line));
  return [title,...rest].flatMap((line,index)=>index ? [{text:'\n'},...line] : line);
}

/** Memoized app-ready items, retaining component-specific stack identity. */
export function useItemCatalogue(): readonly CreativeItem[] {
  const { assets } = useMinecraft();
  return useMemo(() => assets.catalogue?.items.map(item => ({...item,count:1,content:<ItemIcon stackKey={item.stackKey}/>,
    tooltip: itemTooltip(item), searchText:item.tooltip.join('\n') })) ?? [],[assets.catalogue]);
}

/** Warm only likely-visible icons while idle, with bounded concurrency and memory. */
export function usePreloadItemIcons(stackKeys: readonly string[], enabled: boolean) {
  const { assets, baseUrl, scale } = useMinecraft();
  const preloader = useRef<{ update: (keys: readonly string[]) => void } | null>(null);
  useEffect(() => {
    if (!enabled || !assets.catalogue) return;
    const lookup = new Map(assets.catalogue.items.map(item => [item.stackKey, item.icon]));
    const retained = new Map<string, { image: HTMLImageElement; bytes: number }>(), loading = new Set<string>();
    const budget = 8 * 1024 * 1024;
    let queue: { file: string; bytes: number }[] = [], used = 0;
    let cancelled = false, scheduled: number | undefined;
    const idle = typeof window.requestIdleCallback === 'function';
    function schedule() {
      if (cancelled || scheduled !== undefined || !queue.length || loading.size >= 4) return;
      scheduled = idle ? window.requestIdleCallback(pump) : window.setTimeout(pump, 50);
    }
    function pump() {
      scheduled = undefined;
      if (cancelled) return;
      while (loading.size < 4 && queue.length) {
        const { file, bytes } = queue.shift()!;
        if (retained.has(file)) continue;
        // Keep decoded images across scroll updates; evict the least recently
        // requested entries instead of restarting four new loads each row.
        for (const [oldFile, entry] of retained) {
          if (used + bytes <= budget && retained.size < 512) break;
          if (!loading.has(oldFile)) { retained.delete(oldFile); used -= entry.bytes; }
        }
        if (used + bytes > budget || retained.size >= 512) continue;
        const image = new Image(); retained.set(file, { image, bytes }); used += bytes; loading.add(file);
        image.decoding = 'async'; image.fetchPriority = 'low'; image.src = assetUrl(baseUrl, file);
        void image.decode().catch(() => {}).finally(() => { loading.delete(file); schedule(); });
      }
    }
    preloader.current = { update(keys) {
      const wanted = new Map<string, number>();
      for (const key of keys) {
        const icon = lookup.get(key);
        if (!icon) continue;
        const source = iconSource(icon, scale);
        if (wanted.has(source.file)) continue;
        const bytes = source.pixelWidth * source.pixelHeight * 4;
        if (bytes <= budget && wanted.size < 512) wanted.set(source.file, bytes);
      }
      for (const file of [...wanted.keys()].reverse()) {
        const entry = retained.get(file);
        if (entry) { retained.delete(file); retained.set(file, entry); }
      }
      queue = [...wanted].filter(([file]) => !retained.has(file)).map(([file, bytes]) => ({ file, bytes }));
      schedule();
    } };
    return () => {
      cancelled = true;
      if (scheduled !== undefined) { if (idle) window.cancelIdleCallback(scheduled); else window.clearTimeout(scheduled); }
      preloader.current = null; retained.clear(); queue = [];
    };
  }, [assets.catalogue, baseUrl, scale, enabled]);
  useEffect(() => { preloader.current?.update(stackKeys); }, [assets.catalogue, baseUrl, scale, stackKeys, enabled]);
}
