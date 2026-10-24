'use client';

import { Children, createContext, useContext, useEffect, useImperativeHandle, useMemo, useRef, useState, type ComponentPropsWithRef, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { assetUrl, chestLayout, type TextContent } from '@mcgui/core';
import { MinecraftText, Sprite, useMinecraft } from './primitives.js';
import { Tooltip } from './tooltip.js';
import type { InventorySlotBindings } from './inventory-interaction.js';

const GridContext = createContext<((index: number) => void) | null>(null);
const CellContext = createContext<{ index: number; active: boolean } | null>(null);

export interface SlotProps extends Omit<ComponentPropsWithRef<'button'>, 'children'> {
  label: string; children?: ReactNode; count?: number; selected?: boolean;
  /** Chest backgrounds already contain slot artwork; disable the standalone surface there. */
  background?: boolean; tooltip?: TextContent; tooltipDisabled?: boolean;
  /** Keep the semantic control while an external renderer supplies its artwork. */
  renderVisuals?: boolean;
}
export function Slot({ label, children, count, selected, background = true, renderVisuals = true, tooltip, tooltipDisabled, className = '', style, disabled,
  onFocus, onPointerDownCapture, onKeyDownCapture, onBlurCapture, tabIndex, type = 'button', ...props }: SlotProps) {
  const { scale } = useMinecraft();
  const activate = useContext(GridContext), cell = useContext(CellContext), index = cell?.index;
  if (count !== undefined && (!Number.isInteger(count) || count < 1 || count > 999)) throw new Error('Slot count must be an integer from 1 to 999, or omitted.');
  // Item changes should not rebuild the two SVG highlight surfaces in every cell.
  const surfaces = useMemo(() => ({
    background: background ? <Sprite name="slot.background" width={18} height={18} className="mcgui-slot-background" /> : null,
    back: <Sprite name="slot.highlightBack" width={24} height={24} className="mcgui-slot-highlight mcgui-slot-back" style={{ left: -3 * scale, top: -3 * scale }} />,
    front: <Sprite name="slot.highlightFront" width={24} height={24} className="mcgui-slot-highlight mcgui-slot-front" style={{ left: -3 * scale, top: -3 * scale }} />,
  }), [background, scale]);
  const artwork = useMemo(() => renderVisuals ? <>
    {surfaces.background}{surfaces.back}
    <span className="mcgui-slot-content" aria-hidden="true" style={{ left: scale, top: scale, width: 16 * scale, height: 16 * scale }}>{children}</span>
    {surfaces.front}
    {count !== undefined && count > 1 ? <span className="mcgui-slot-count" aria-hidden="true" style={{ top: 10 * scale, right: -scale }}><MinecraftText>{String(count)}</MinecraftText></span> : null}
  </> : null, [renderVisuals, surfaces, scale, children, count]);
  const button = <button {...props} type={type} disabled={disabled} aria-label={label} aria-pressed={selected}
    data-mcgui-slot="" data-mcgui-index={index ?? undefined} data-selected={selected || undefined}
    onPointerDownCapture={event => { event.currentTarget.dataset.mcguiPointerFocus = ''; onPointerDownCapture?.(event); }}
    onKeyDownCapture={event => { delete event.currentTarget.dataset.mcguiPointerFocus; onKeyDownCapture?.(event); }}
    onBlurCapture={event => { delete event.currentTarget.dataset.mcguiPointerFocus; onBlurCapture?.(event); }}
    tabIndex={tabIndex ?? (cell ? (cell.active ? 0 : -1) : undefined)}
    onFocus={event => { if (activate && index !== undefined) activate(index); onFocus?.(event); }}
    className={`mcgui-slot ${className}`} style={{ width: 18 * scale, height: 18 * scale, ...style }}>
    {renderVisuals ? artwork : null}
  </button>;
  // Keep the DOM structure stable when pickup changes an occupied slot to empty,
  // preserving focus and an in-progress pointer gesture.
  return <Tooltip content={tooltip ?? ''} disabled={disabled || tooltipDisabled || tooltip === undefined}>{button}</Tooltip>;
}

export interface InventoryGridProps extends Omit<ComponentPropsWithRef<'div'>, 'children'> {
  columns?: number; label?: string; children: ReactNode;
  /** Absolute index of the first cell when rendering a window into a larger inventory. */
  startIndex?: number;
  /** Noninteractive drawing layer, excluded from cell indexing and navigation. */
  drawing?: ReactNode;
}
function InventoryCell({ index, active, children }: { index: number; active: boolean; children: ReactNode }) {
  const value = useMemo(() => ({ index, active }), [index, active]);
  return <CellContext.Provider value={value}>{children}</CellContext.Provider>;
}
export function InventoryGrid({ columns = 9, label = 'Inventory', children, startIndex = 0, drawing, className = '', style, onKeyDown, ref, ...props }: InventoryGridProps) {
  const { scale } = useMinecraft();
  const [active, setActive] = useState(startIndex);
  const root = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => root.current!, []);
  const cells = Children.toArray(children);
  if (!Number.isInteger(columns) || columns < 1 || columns > 54) throw new Error('Inventory columns must be an integer from 1 to 54.');
  if (!Number.isSafeInteger(startIndex) || startIndex < 0 || !Number.isSafeInteger(startIndex + cells.length)) throw new Error('Inventory startIndex must be a nonnegative safe integer.');
  // Scrolling past the tab stop can select the first visible cell immediately,
  // without an effect-triggered second render of the entire grid.
  const activeIndex = active >= startIndex && active < startIndex + cells.length ? active : startIndex;
  useEffect(() => {
    const slots = [...root.current!.querySelectorAll<HTMLButtonElement>('[data-mcgui-slot]')].filter(slot => !slot.disabled);
    if (slots.length && !slots.some(slot => Number(slot.dataset.mcguiIndex) === activeIndex)) setActive(Number(slots[0]!.dataset.mcguiIndex));
  }, [children, activeIndex]);
  return <GridContext.Provider value={setActive}><div {...props} ref={root} role="group" aria-label={label} data-mcgui-grid=""
    className={`mcgui-inventory-grid ${className}`} style={{ position: 'relative', display: 'grid', gridTemplateColumns: `repeat(${columns}, ${18 * scale}px)`, width: columns * 18 * scale, ...style }}
    onKeyDown={event => {
      onKeyDown?.(event); if (event.defaultPrevented) return;
      const slot = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-mcgui-slot]');
      if (!slot || slot.closest('[data-mcgui-grid]') !== event.currentTarget) return;
      const slots = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-mcgui-slot]')];
      const current = slots.indexOf(slot);
      let next = current, step = 0;
      if (event.key === 'ArrowRight') step = 1;
      else if (event.key === 'ArrowLeft') step = -1;
      else if (event.key === 'ArrowDown') step = columns;
      else if (event.key === 'ArrowUp') step = -columns;
      else if (event.key === 'Home') { next = event.ctrlKey ? 0 : Math.floor(current / columns) * columns; step = 1; }
      else if (event.key === 'End') { next = event.ctrlKey ? slots.length - 1 : Math.min(slots.length - 1, Math.floor(current / columns) * columns + columns - 1); step = -1; }
      else return;
      event.preventDefault();
      if (next === current && event.key.startsWith('Arrow')) next += step;
      while (next >= 0 && next < slots.length && slots[next]!.disabled) next += step;
      slots[next]?.focus();
    }}>
    {drawing}
    {cells.map((child, index) => <InventoryCell key={(child as { key?: string }).key ?? index} index={startIndex + index} active={activeIndex === startIndex + index}>{child}</InventoryCell>)}
  </div></GridContext.Provider>;
}

export interface SlotData { label: string; content?: ReactNode; count?: number; tooltip?: TextContent; disabled?: boolean }
export interface SlotAddress { section: 'chest' | 'inventory'; index: number }
export interface ChestScreenProps {
  rows?: number; title?: string; inventoryTitle?: string;
  slots?: readonly (SlotData | null)[];
  /** Slots 0–26 are the main inventory, 27–35 the hotbar. */
  inventory?: readonly (SlotData | null)[];
  selectedSlot?: SlotAddress | null;
  onSlotClick?: (address: SlotAddress, item: SlotData | null, event: MouseEvent<HTMLButtonElement>) => void;
  getSlotProps?: (address: SlotAddress) => InventorySlotBindings;
  className?: string; style?: CSSProperties;
}
export function ChestScreen({ rows = 3, title = rows > 3 ? 'Large Chest' : 'Chest', inventoryTitle = 'Inventory', slots = [], inventory = [],
  selectedSlot, onSlotClick, getSlotProps, className = '', style }: ChestScreenProps) {
  const { assets, scale, baseUrl } = useMinecraft();
  const layout = chestLayout(rows), texture = assets.textures?.['container.chest'];
  if (!texture) throw new Error('Missing chest assets. Re-run mcgui-assets extract with the current CLI.');
  if (slots.length > rows * 9 || inventory.length > 36) throw new Error('Too many slots for the selected chest or player inventory.');
  const sx = texture.pixelWidth / texture.logicalWidth, sy = texture.pixelHeight / texture.logicalHeight;
  function crop(sourceY: number, y: number, height: number) {
    return <svg x={0} y={y} width={176} height={height} viewBox={`0 ${sourceY * sy} ${176 * sx} ${height * sy}`} overflow="hidden" preserveAspectRatio="none">
      <image href={assetUrl(baseUrl, texture!.file)} width={texture!.pixelWidth} height={texture!.pixelHeight} />
    </svg>;
  }
  function cell(section: SlotAddress['section'], index: number) {
    const item = (section === 'chest' ? slots : inventory)[index] ?? null;
    const address = { section, index };
    const bindings = getSlotProps?.(address);
    return <Slot {...bindings} key={index} background={false} label={item ? `${item.label}${item.count && item.count > 1 ? `, ${item.count}` : ''}` : `Empty ${section} slot ${index + 1}`}
      count={item?.count} tooltip={item?.tooltip} disabled={item?.disabled}
      selected={selectedSlot === undefined ? undefined : selectedSlot?.section === section && selectedSlot.index === index}
      onClick={event => { bindings?.onClick?.(event); onSlotClick?.(address, item, event); }}>{item?.content}</Slot>;
  }
  const position = ({ x, y }: { x: number; y: number }): CSSProperties => ({ position: 'absolute', left: x * scale, top: y * scale });
  return <section aria-label={title} className={`mcgui-chest ${className}`} data-rows={rows} style={{ position: 'relative', width: layout.width * scale, height: layout.height * scale, ...style }}>
    <svg className="mcgui-sprite mcgui-chest-background" aria-hidden="true" focusable="false" width={layout.width * scale} height={layout.height * scale} viewBox={`0 0 ${layout.width} ${layout.height}`}>
      {crop(0, 0, layout.topHeight)}{crop(126, layout.topHeight, 96)}
    </svg>
    <MinecraftText shadow={false} className="mcgui-chest-title" style={position(layout.title)}>{title}</MinecraftText>
    <MinecraftText shadow={false} className="mcgui-chest-title" style={position(layout.inventoryTitle)}>{inventoryTitle}</MinecraftText>
    <InventoryGrid label={`${title} slots`} style={position(layout.chest)}>{Array.from({ length: rows * 9 }, (_, index) => cell('chest', index))}</InventoryGrid>
    <InventoryGrid label={`${inventoryTitle} slots`} style={position(layout.inventory)}>{Array.from({ length: 27 }, (_, index) => cell('inventory', index))}</InventoryGrid>
    <InventoryGrid label="Hotbar slots" style={position(layout.hotbar)}>{Array.from({ length: 9 }, (_, index) => cell('inventory', index + 27))}</InventoryGrid>
  </section>;
}
