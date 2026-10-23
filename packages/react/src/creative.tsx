'use client';

import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { assetUrl, CREATIVE_LAYOUT as layout, creativeScrollRows, creativeTabPosition, filterCreativeItems, measureText, type CreativeTabSprite } from '@mcgui/core';
import { MinecraftText, Sprite, useMinecraft } from './primitives.js';
import { InventoryGrid, Slot, type SlotData } from './inventory.js';
import { Tooltip, refreshTooltipAt } from './tooltip.js';
import { ItemIcon, usePreloadItemIcons } from './items.js';
import { CanvasInventoryGrid } from './canvas-inventory.js';
import type { CreativeSlotBindings, InventoryItem, InventorySlotBindings } from './inventory-interaction.js';

export interface CreativeItem extends InventoryItem { categories: readonly string[]; tags?: readonly string[]; searchText?: string }
export interface CreativeTab {
  id: string; label: string; icon?: ReactNode;
  /** Catalogue icon from the active asset bundle; an explicit icon takes precedence. */
  iconStackKey?: string;
  row: 'top' | 'bottom'; column: number; alignedRight?: boolean;
  kind?: 'category' | 'search' | 'inventory' | 'saved';
}
export const DEFAULT_CREATIVE_TABS: readonly CreativeTab[] = [
  // Verified against CreativeModeTab.getIconItem() in the Java 26.2 client.
  { id: 'building', label: 'Building Blocks', iconStackKey: 'minecraft:bricks', row: 'top', column: 0 },
  { id: 'colored', label: 'Colored Blocks', iconStackKey: 'minecraft:cyan_wool', row: 'top', column: 1 },
  { id: 'natural', label: 'Natural Blocks', iconStackKey: 'minecraft:grass_block', row: 'top', column: 2 },
  { id: 'functional', label: 'Functional Blocks', iconStackKey: 'minecraft:oak_sign', row: 'top', column: 3 },
  { id: 'redstone', label: 'Redstone Blocks', iconStackKey: 'minecraft:redstone', row: 'top', column: 4 },
  { id: 'saved', label: 'Saved Hotbars', iconStackKey: 'minecraft:bookshelf', row: 'top', column: 5, alignedRight: true, kind: 'saved' },
  { id: 'search', label: 'Search Items', iconStackKey: 'minecraft:compass', row: 'top', column: 6, alignedRight: true, kind: 'search' },
  { id: 'tools', label: 'Tools & Utilities', iconStackKey: 'minecraft:diamond_pickaxe', row: 'bottom', column: 0 },
  { id: 'combat', label: 'Combat', iconStackKey: 'minecraft:netherite_sword', row: 'bottom', column: 1 },
  { id: 'food', label: 'Food & Drinks', iconStackKey: 'minecraft:golden_apple', row: 'bottom', column: 2 },
  { id: 'ingredients', label: 'Ingredients', iconStackKey: 'minecraft:iron_ingot', row: 'bottom', column: 3 },
  { id: 'spawn', label: 'Spawn Eggs', iconStackKey: 'minecraft:creeper_spawn_egg', row: 'bottom', column: 4 },
  { id: 'inventory', label: 'Survival Inventory', iconStackKey: 'minecraft:chest', row: 'bottom', column: 6, alignedRight: true, kind: 'inventory' },
];
export type CreativeSlotAddress = { section: 'inventory' | 'armor' | 'offhand'; index: number; view: 'catalogue' | 'inventory' };
export interface CreativeInventoryScreenProps<T extends CreativeItem = CreativeItem> {
  items: readonly T[];
  tabs?: readonly CreativeTab[];
  selectedTab?: string; defaultTab?: string; onTabChange?: (id: string) => void;
  /** Prepare first-page icons during idle time (default true). Disable to load only on demand. */
  preloadIcons?: boolean;
  /** Experimental canvas slot artwork; DOM remains the default and handles all input. */
  renderer?: 'dom' | 'canvas';
  /** Player main inventory (0–26), then hotbar (27–35). */
  inventory?: readonly (SlotData | null)[];
  armor?: readonly (SlotData | null)[]; offhand?: SlotData | null;
  /** App-owned character preview; the GUI library does not render player models. */
  playerPreview?: ReactNode;
  getSlotProps?: (address: CreativeSlotAddress) => InventorySlotBindings;
  getCreativeSlotProps?: (item: T | null) => CreativeSlotBindings;
  onDiscard?: (clearInventory: boolean) => void;
  /** Nine app-owned snapshots, each containing nine hotbar slots. */
  savedHotbars?: readonly (readonly (T | null)[])[];
  onSaveHotbar?: (index: number) => void; onLoadHotbar?: (index: number) => void;
  className?: string; style?: CSSProperties;
}
const EMPTY: readonly never[] = [];

/** Java creative item browser; catalogue and player state remain app-owned. */
export function CreativeInventoryScreen<T extends CreativeItem>({ items, tabs = DEFAULT_CREATIVE_TABS, selectedTab, defaultTab, preloadIcons = true, renderer = 'dom',
  onTabChange, inventory = EMPTY, armor = EMPTY, offhand, playerPreview, getSlotProps, getCreativeSlotProps, onDiscard,
  savedHotbars = EMPTY, onSaveHotbar, onLoadHotbar, className = '', style }: CreativeInventoryScreenProps<T>) {
  const { assets, scale, baseUrl } = useMinecraft();
  const id = useId(), root = useRef<HTMLElement>(null), search = useRef<HTMLInputElement>(null);
  const catalogueRoot = useRef<HTMLDivElement>(null);
  const [internalTab, setInternalTab] = useState(defaultTab ?? tabs[0]?.id);
  const [query, setQuery] = useState('');
  const [scroll, setScroll] = useState({ key: '', row: 0 });
  const [announcement, setAnnouncement] = useState('');
  const hotbarKey = useRef<string | null>(null);
  const tab = tabs.find(tab => tab.id === (selectedTab ?? internalTab)) ?? tabs[0];
  const positions = tabs.map(tab => `${tab.row}:${tab.column}`);
  if (!tab || tabs.length > 14 || new Set(tabs.map(tab => tab.id)).size !== tabs.length || new Set(positions).size !== tabs.length || tabs.some(tab => !tab.id || !tab.label)) throw new Error('Creative inventory needs 1–14 uniquely identified tabs in distinct positions.');
  tabs.forEach(tab => creativeTabPosition(tab.row, tab.column, tab.alignedRight));
  if (inventory.length > 36 || armor.length > 4 || savedHotbars.length > 9 || savedHotbars.some(row => row.length > 9)) throw new Error('Creative inventory supports 36 player slots, 4 armor slots and 9 saved hotbars of 9 slots.');
  const kind = tab.kind ?? 'category';
  const texture = assets.textures?.[kind === 'inventory' ? 'creative.inventory' : kind === 'search' ? 'creative.search' : 'creative.items'];
  if (!texture) throw new Error('Missing creative inventory assets. Re-run mcui-assets extract with the current CLI.');
  // Build category order once per catalogue, rather than filter/sort on every switch.
  const categories = useMemo(() => {
    const result = new Map<string, T[]>();
    for (const item of items) for (const category of new Set(item.categories)) {
      const entries = result.get(category);
      if (entries) entries.push(item); else result.set(category, [item]);
    }
    for (const category of assets.catalogue?.categories ?? []) {
      const indices = new Map(category.items.map((key, index) => [key, index]));
      result.get(category.id)?.sort((a, b) => (indices.get(a.stackKey) ?? Infinity) - (indices.get(b.stackKey) ?? Infinity));
    }
    return result;
  }, [items, assets.catalogue]);
  const previewKeys = useMemo(() => [...new Set(tabs.flatMap(entry => {
    const firstPage = (entry.kind === 'search' ? items : categories.get(entry.id) ?? EMPTY).slice(0, 45);
    return [...firstPage.map(item => item.stackKey), ...(entry.iconStackKey ? [entry.iconStackKey] : [])];
  }))], [tabs, items, categories]);
  const filtered = useMemo(() => kind === 'category' ? categories.get(tab.id) ?? EMPTY
    : kind === 'search' && query.trim() ? filterCreativeItems(items, undefined, query) : items,
  [items, kind, tab.id, query, categories]);
  const catalogue = useMemo(() => kind === 'saved' ? Array.from({ length: 81 }, (_, index) => savedHotbars[Math.floor(index / 9)]?.[index % 9] ?? null) : filtered, [kind, savedHotbars, filtered]);
  const maxRow = creativeScrollRows(catalogue.length), scrollKey = `${tab.id}\n${query}`;
  const row = scroll.key === scrollKey ? Math.min(scroll.row, maxRow) : 0;
  const visibleItems = useMemo(() => Array.from({ length: 45 }, (_, index) => catalogue[row * 9 + index] ?? null), [catalogue, row]);
  const nearbyKeys = useMemo(() => [
    ...catalogue.slice(row * 9, (row + 15) * 9).flatMap(item => item ? [item.stackKey] : []),
    ...catalogue.slice(Math.max(0, row - 5) * 9, row * 9).flatMap(item => item ? [item.stackKey] : []),
    ...previewKeys,
  ], [catalogue, row, previewKeys]);
  usePreloadItemIcons(nearbyKeys, preloadIcons);
  const restoreCellFocus = useRef<number | null>(null);
  const wheelPoint = useRef<{ x: number; y: number } | null>(null);
  const rememberCellFocus = useCallback(() => {
    const cells = catalogueRoot.current?.querySelectorAll<HTMLButtonElement>('[data-mcui-slot]');
    const index = cells ? [...cells].indexOf(document.activeElement as HTMLButtonElement) : -1;
    restoreCellFocus.current = index >= 0 ? index : null;
  }, []);
  useLayoutEffect(() => {
    const index = restoreCellFocus.current;
    restoreCellFocus.current = null;
    if (index !== null && catalogueRoot.current?.contains(document.activeElement)) catalogueRoot.current.querySelectorAll<HTMLButtonElement>('[data-mcui-slot]')[index]?.focus({ preventScroll: true });
    const point = wheelPoint.current;
    wheelPoint.current = null;
    if (point && catalogueRoot.current) refreshTooltipAt(catalogueRoot.current, point.x, point.y);
  }, [row, scrollKey]);
  useEffect(() => {
    const element = catalogueRoot.current;
    if (!element) return;
    function wheel(event: WheelEvent) {
      if (!maxRow || !event.deltaY) return;
      event.preventDefault();
      rememberCellFocus();
      wheelPoint.current = { x: event.clientX, y: event.clientY };
      setScroll(previous => {
        const row = Math.max(0, Math.min(maxRow, (previous.key === scrollKey ? previous.row : 0) + Math.sign(event.deltaY)));
        return previous.key === scrollKey && previous.row === row ? previous : { key: scrollKey, row };
      });
    }
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [scrollKey, maxRow, kind, rememberCellFocus]);
  function scrollTo(next: number) {
    wheelPoint.current = null;
    rememberCellFocus();
    setScroll(previous => {
      const row = Math.max(0, Math.min(maxRow, next));
      return previous.key === scrollKey && previous.row === row ? previous : { key: scrollKey, row };
    });
  }
  const choose = useCallback((next: CreativeTab) => {
    restoreCellFocus.current = null; wheelPoint.current = null;
    setInternalTab(next.id); setQuery(''); setScroll({ key: `${next.id}\n`, row: 0 }); onTabChange?.(next.id);
    if (next.kind === 'search') requestAnimationFrame(() => search.current?.focus());
  }, [onTabChange]);
  const navigate = useCallback((index: number) => {
    choose(tabs[index]!); root.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[index]?.focus();
  }, [choose, tabs]);
  const tabButtons = useMemo(() => tabs.map((entry, index) => <CreativeTabButton key={entry.id} entry={entry} index={index} total={tabs.length}
    selected={entry.id === tab.id} screenId={id} onChoose={choose} onNavigate={navigate} />), [tabs, tab.id, id, choose, navigate]);
  const title = useMemo(() => kind !== 'inventory' ? <MinecraftText shadow={false} className="mcui-creative-title"
    style={{ position: 'absolute', left: 8 * scale, top: (6 + layout.top) * scale, maxWidth: (kind === 'search' ? 71 : 180) * scale }}>{tab.label}</MinecraftText> : null,
  [kind, scale, tab.label]);
  const searchInput = useMemo(() => kind === 'search' ? <CreativeSearch inputRef={search} value={query} onChange={setQuery}
    style={{ position: 'absolute', left: 82 * scale, top: (6 + layout.top) * scale }} /> : null, [kind, query, scale]);
  const position = (x: number, y: number): CSSProperties => ({ position: 'absolute', left: x * scale, top: (y + layout.top) * scale });
  function playerCell(section: CreativeSlotAddress['section'], index: number, item: SlotData | null | undefined) {
    return <Slot key={`${section}-${index}`} {...getSlotProps?.({ section, index, view: kind === 'inventory' ? 'inventory' : 'catalogue' })} background={false}
      label={item ? `${item.label}${item.count && item.count > 1 ? `, ${item.count}` : ''}` : `Empty creative ${section} slot ${index + 1}`}
      count={item?.count} tooltip={item?.tooltip} disabled={item?.disabled}>{item?.content}</Slot>;
  }
  const playerView = kind === 'inventory' ? 'inventory' : 'catalogue';
  const hotbar = useMemo(() => <CanvasInventoryGrid renderer={renderer} items={inventory.slice(27, 36)} label="Creative hotbar" style={{ position: 'absolute', left: layout.hotbar.x * scale, top: (layout.hotbar.y + layout.top) * scale }}>
    {drawn => Array.from({ length: 9 }, (_, index) => {
      const slot = index + 27, item = inventory[slot];
      return <Slot key={slot} {...getSlotProps?.({ section: 'inventory', index: slot, view: playerView })} background={false} renderVisuals={!drawn[index]}
        label={item ? `${item.label}${item.count && item.count > 1 ? `, ${item.count}` : ''}` : `Empty creative inventory slot ${slot + 1}`}
        count={item?.count} tooltip={item?.tooltip} disabled={item?.disabled}>{item?.content}</Slot>;
    })}
  </CanvasInventoryGrid>, [inventory, getSlotProps, playerView, scale, renderer]);
  return <section ref={root} aria-label="Creative inventory" className={`mcui-creative ${className}`} data-tab={tab.id}
    style={{ position: 'relative', width: layout.width * scale, height: (layout.height + layout.top + layout.bottom) * scale, ...style }}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) hotbarKey.current = null; }}
    onKeyUp={event => { if (event.key.toLowerCase() === hotbarKey.current) hotbarKey.current = null; }}
    onKeyDownCapture={event => {
      if ((event.target as HTMLElement).matches('input') || event.ctrlKey || event.altKey || event.metaKey) return;
      const key = event.key.toLowerCase();
      if (['c', 'x'].includes(key)) hotbarKey.current = key;
      else if (/^[1-9]$/.test(key) && hotbarKey.current) {
        const index = Number(key) - 1;
        const action = hotbarKey.current === 'c' ? onSaveHotbar : onLoadHotbar;
        if (action) { event.preventDefault(); event.stopPropagation(); action(index); setAnnouncement(`${hotbarKey.current === 'c' ? 'Saved' : 'Loaded'} hotbar ${index + 1}.`); }
      } else if (key === 'escape') hotbarKey.current = null;
      else if (key === '/' && tabs.some(tab => tab.kind === 'search')) { event.preventDefault(); choose(tabs.find(tab => tab.kind === 'search')!); }
    }}>
    <div role="tablist" aria-label="Creative categories" className="mcui-creative-tabs">
      {tabButtons}
    </div>
    <svg className="mcui-sprite mcui-creative-background" aria-hidden="true" focusable="false" width={195 * scale} height={136 * scale}
      viewBox={`0 0 ${195 * texture.pixelWidth / 256} ${136 * texture.pixelHeight / 256}`} style={position(0, 0)}>
      <image href={assetUrl(baseUrl, texture.file)} width={texture.pixelWidth} height={texture.pixelHeight} />
    </svg>
    <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${tabs.indexOf(tab)}`}>
      {title}{searchInput}
      {kind === 'inventory' ? <>
        <InventoryGrid label="Creative player inventory" style={position(layout.inventory.x, layout.inventory.y)}>{Array.from({ length: 27 }, (_, index) => playerCell('inventory', index, inventory[index]))}</InventoryGrid>
        {layout.armor.map((point, index) => <div key={index} style={position(point.x, point.y)}>{playerCell('armor', index, armor[index])}</div>)}
        <div style={position(layout.offhand.x, layout.offhand.y)}>{playerCell('offhand', 0, offhand)}</div>
        <div className="mcui-creative-player" style={{ ...position(73, 6), width: 32 * scale, height: 43 * scale }}>{playerPreview}</div>
        <div style={position(layout.trash.x, layout.trash.y)}><Slot label="Destroy item" tooltip="Destroy Item\nShift-click to clear inventory" background={false} disabled={!onDiscard}
          onClick={event => onDiscard?.(event.shiftKey)} onContextMenu={event => { event.preventDefault(); onDiscard?.(event.shiftKey); }} /></div>
      </> : <>
        <div ref={catalogueRoot} id={`${id}-catalogue`} className="mcui-creative-catalogue" style={position(layout.catalogue.x, layout.catalogue.y)}
          onKeyDownCapture={event => {
            if (event.key === 'PageDown' || event.key === 'PageUp') { event.preventDefault(); scrollTo(row + (event.key === 'PageDown' ? 5 : -5)); }
          }}>
          <CanvasInventoryGrid renderer={renderer} items={visibleItems} startIndex={row * 9} label={kind === 'saved' ? 'Saved hotbar items' : 'Creative items'}>{drawn => visibleItems.map((item, index) => {
            // Rotate a fixed pool: retain the 36 overlapping cells and recycle
            // the outgoing nine, including their SVG surfaces, for the new row.
            return <MemoCatalogueCell key={(row * 9 + index) % 45} index={row * 9 + index} item={item} getSlotProps={getCreativeSlotProps} renderVisuals={!drawn[index]} />;
          })}</CanvasInventoryGrid>
        </div>
        <CreativeScrollbar controls={`${id}-catalogue`} row={row} maxRow={maxRow} onChange={scrollTo} style={position(layout.scroll.x, layout.scroll.y)} />
        <span role="status" className="mcui-sr-only">{kind === 'saved' ? 'C plus 1–9 saves a hotbar. X plus 1–9 loads it.' : `${filtered.length} items${filtered.length === 0 ? '. No matching items.' : ''}`}</span>
      </>}
      {hotbar}
    </div>
    <span className="mcui-sr-only" role="status">{announcement}</span>
  </section>;
}

function CatalogueCell<T extends CreativeItem>({ item, index, getSlotProps, renderVisuals }: {
  item: T | null; index: number; getSlotProps?: (item: T | null) => CreativeSlotBindings; renderVisuals: boolean;
}) {
  return <Slot {...getSlotProps?.(item)} background={false} renderVisuals={renderVisuals} label={item?.label ?? `Empty creative item slot ${index + 1}`}
    tooltip={item?.tooltip ?? item?.label} disabled={item?.disabled}>{item?.content}</Slot>;
}
const MemoCatalogueCell = memo(CatalogueCell) as typeof CatalogueCell;

const CreativeTabButton = memo(function CreativeTabButton({ entry, index, total, selected, screenId, onChoose, onNavigate }: {
  entry: CreativeTab; index: number; total: number; selected: boolean; screenId: string;
  onChoose: (tab: CreativeTab) => void; onNavigate: (index: number) => void;
}) {
  const { scale } = useMinecraft();
  const point = creativeTabPosition(entry.row, entry.column, entry.alignedRight);
  return <div style={{ position: 'absolute', left: point.x * scale, top: (point.y + layout.top) * scale, zIndex: selected ? 3 : 0 }}>
    <Tooltip content={entry.label}><button type="button" role="tab" id={`${screenId}-tab-${index}`}
      aria-label={entry.label} aria-selected={selected} aria-controls={`${screenId}-panel`} tabIndex={selected ? 0 : -1}
      className="mcui-creative-tab" style={{ position: 'relative', width: 26 * scale, height: 32 * scale }}
      onPointerDown={event => { if (event.button === 0 && event.pointerType !== 'touch') onChoose(entry); }}
      onClick={event => { if (event.detail === 0 || (event.nativeEvent as PointerEvent).pointerType === 'touch') onChoose(entry); }}
      onKeyDown={event => {
        const next = { ArrowRight: (index + 1) % total, ArrowLeft: (index + total - 1) % total, Home: 0, End: total - 1 }[event.key];
        if (next !== undefined) { event.preventDefault(); onNavigate(next); }
      }}>
      <Sprite name={`creative.tab.${entry.row}.${selected ? 'selected' : 'unselected'}.${entry.column + 1}` as CreativeTabSprite} width={26} height={32} />
      <span className="mcui-creative-tab-icon" aria-hidden="true" style={{ left: 5 * scale, top: (entry.row === 'top' ? 9 : 7) * scale, width: 16 * scale, height: 16 * scale }}>
        {entry.icon ?? (entry.iconStackKey ? <ItemIcon stackKey={entry.iconStackKey} fallback={<MinecraftText shadow={false}>{entry.label.slice(0, 2)}</MinecraftText>} /> : <MinecraftText shadow={false}>{entry.label.slice(0, 2)}</MinecraftText>)}
      </span>
    </button></Tooltip>
  </div>;
});

function CreativeScrollbar({ controls, row, maxRow, onChange, style }: { controls: string; row: number; maxRow: number; onChange: (row: number) => void; style: CSSProperties }) {
  const { scale } = useMinecraft();
  const drag = useRef<number | null>(null);
  function at(element: HTMLElement, y: number) {
    const offset = (y - element.getBoundingClientRect().top) / scale - layout.scroll.thumbHeight / 2;
    onChange(Math.round(Math.max(0, Math.min(1, offset / layout.scroll.travel)) * maxRow));
  }
  return <div role="scrollbar" aria-label="Creative item scroll" aria-controls={controls} aria-orientation="vertical" aria-valuemin={0} aria-valuemax={maxRow} aria-valuenow={row}
    aria-disabled={!maxRow} tabIndex={maxRow ? 0 : -1} className="mcui-creative-scroll" style={{ ...style, width: 12 * scale, height: 110 * scale }}
    onPointerDown={event => { if (!maxRow || event.button !== 0) return; event.preventDefault(); event.currentTarget.focus(); drag.current = event.pointerId; event.currentTarget.setPointerCapture(event.pointerId); at(event.currentTarget, event.clientY); }}
    onPointerMove={event => { if (drag.current === event.pointerId) at(event.currentTarget, event.clientY); }}
    onPointerUp={event => { if (drag.current === event.pointerId) { drag.current = null; event.currentTarget.releasePointerCapture(event.pointerId); } }}
    onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}
    onKeyDown={event => {
      const next = { ArrowDown: row + 1, ArrowUp: row - 1, PageDown: row + 5, PageUp: row - 5, Home: 0, End: maxRow }[event.key];
      if (next !== undefined && maxRow) { event.preventDefault(); onChange(next); }
    }}>
    <Sprite name={maxRow ? 'creative.scroller' : 'creative.scrollerDisabled'} width={12} height={15}
      style={{ position: 'absolute', top: Math.floor((maxRow ? row / maxRow : 0) * 95) * scale }} />
  </div>;
}

/** Native editing/clipboard/IME semantics with measured bitmap text and selection. */
function CreativeSearch({ value, onChange, inputRef, style }: { value: string; onChange: (value: string) => void; inputRef: React.RefObject<HTMLInputElement | null>; style: CSSProperties }) {
  const { scale, assets } = useMinecraft();
  const [selection, setSelection] = useState({ start: 0, end: 0 }), [focused, setFocused] = useState(false);
  const drag = useRef<number | null>(null);
  const start = measureText(assets.font, value.slice(0, selection.start)), end = measureText(assets.font, value.slice(0, selection.end));
  const offset = Math.max(0, end - 78);
  function sync(input: HTMLInputElement) { setSelection({ start: input.selectionStart ?? 0, end: input.selectionEnd ?? 0 }); }
  function caretAt(input: HTMLInputElement, x: number) {
    const position = (x - input.getBoundingClientRect().left) / scale + offset;
    for (let index = 0; index < value.length; index++) {
      if (position < (measureText(assets.font, value.slice(0, index)) + measureText(assets.font, value.slice(0, index + 1))) / 2) return index;
    }
    return value.length;
  }
  return <span className="mcui-creative-search" style={{ ...style, width: 80 * scale, height: 9 * scale }}>
    <input ref={inputRef} aria-label="Search items" value={value} maxLength={50} autoComplete="off" spellCheck={false}
      onChange={event => { onChange(event.currentTarget.value); sync(event.currentTarget); }} onSelect={event => sync(event.currentTarget)}
      onFocus={() => setFocused(true)} onBlur={() => { setFocused(false); drag.current = null; }}
      onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); onChange(''); } }}
      onPointerDown={event => {
        if (event.pointerType === 'touch' || event.button !== 0) return;
        event.preventDefault(); const input = event.currentTarget; input.focus();
        const index = caretAt(input, event.clientX); drag.current = index;
        input.setSelectionRange(index, index); sync(input); input.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event => {
        if (drag.current === null || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
        const index = caretAt(event.currentTarget, event.clientX);
        event.currentTarget.setSelectionRange(Math.min(drag.current, index), Math.max(drag.current, index)); sync(event.currentTarget);
      }}
      onPointerUp={event => { drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
      onPointerCancel={() => { drag.current = null; }} />
    <span className="mcui-creative-search-drawing" aria-hidden="true">
      {focused && start !== end ? <span className="mcui-creative-search-selection" style={{ left: (start - offset) * scale, width: (end - start) * scale }} /> : null}
      <MinecraftText shadow={false} style={{ transform: `translateX(${-offset * scale}px)` }}>{value}</MinecraftText>
      {focused && start === end ? <span className="mcui-creative-search-caret" style={{ left: (end - offset) * scale, width: scale }} /> : null}
    </span>
  </span>;
}
