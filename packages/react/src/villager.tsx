'use client';

import { useEffect, useId, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { assetUrl, measureText } from '@mcgui/core';
import { MinecraftText, Sprite, useMinecraft } from './primitives.js';
import { InventoryGrid, Slot, type SlotData } from './inventory.js';
import type { InventorySlotBindings } from './inventory-interaction.js';

export interface VillagerTrade {
  /** Costs and result are previews, not movable inventory slots. */
  input: SlotData;
  secondaryInput?: SlotData | null;
  output: SlotData;
  outOfStock?: boolean;
}
export type VillagerSlotAddress = { section: 'input' | 'secondaryInput' | 'output'; index: 0 } | { section: 'inventory'; index: number };
export interface VillagerScreenProps {
  title?: string;
  inventoryTitle?: string;
  trades?: readonly VillagerTrade[];
  /** Controlled offer index, or omit for internal selection. Empty lists use null. */
  selectedTrade?: number | null;
  defaultSelectedTrade?: number;
  onTradeSelect?: (index: number, trade: VillagerTrade) => void;
  /** Actual trading slots; selecting an offer does not insert items or grant its result. */
  input?: SlotData | null;
  secondaryInput?: SlotData | null;
  output?: SlotData | null;
  /** Visual order: main inventory 0–26, hotbar 27–35. */
  inventory?: readonly (SlotData | null)[];
  /** Normalized villager level progress. Omit to hide the bar (e.g. wandering traders). */
  experience?: number;
  onSlotClick?: (address: VillagerSlotAddress, item: SlotData | null, event: MouseEvent<HTMLButtonElement>) => void;
  getSlotProps?: (address: VillagerSlotAddress) => InventorySlotBindings;
  className?: string;
  style?: CSSProperties;
}

/** Inline merchant surface. The app owns payment, output, stock, and restocking rules. */
export function VillagerScreen({ title = 'Villager', inventoryTitle = 'Inventory', trades = [], selectedTrade,
  defaultSelectedTrade = 0, onTradeSelect, input = null, secondaryInput = null, output = null, inventory = [],
  experience, onSlotClick, getSlotProps, className = '', style }: VillagerScreenProps) {
  const { assets, baseUrl, scale } = useMinecraft();
  const [selection, setSelection] = useState(defaultSelectedTrade);
  const list = useRef<HTMLDivElement>(null);
  const listId = useId();
  const drag = useRef<number | null>(null);
  const [scrollRow, setScrollRow] = useState(0);
  const maxRow = Math.max(0, trades.length - 7), row = Math.min(scrollRow, maxRow);
  function scrollToRow(next: number) {
    const clamped = Math.max(0, Math.min(maxRow, next));
    if (list.current) list.current.scrollTop = clamped * 20 * scale;
    setScrollRow(clamped);
  }
  useEffect(() => {
    const element = list.current!;
    function wheel(event: WheelEvent) {
      if (!maxRow || !event.deltaY) return;
      event.preventDefault();
      element.scrollTop = Math.max(0, Math.min(maxRow, Math.round(element.scrollTop / (20 * scale)) + Math.sign(event.deltaY))) * 20 * scale;
    }
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [maxRow, scale]);
  function scrollAt(element: HTMLElement, y: number) {
    scrollToRow(Math.round(Math.max(0, Math.min(1, ((y - element.getBoundingClientRect().top) / scale - 13.5) / 113)) * maxRow));
  }
  const texture = assets.textures?.['container.villager'];
  if (!texture) throw new Error('Missing villager assets. Re-run mcgui-assets extract with the current CLI.');
  if (inventory.length > 36) throw new Error('Too many slots for the player inventory.');
  if (!Number.isInteger(defaultSelectedTrade) || defaultSelectedTrade < 0) throw new Error('Default selected trade must be a nonnegative integer.');
  if (selectedTrade !== undefined && selectedTrade !== null && (!Number.isInteger(selectedTrade) || selectedTrade < 0 || selectedTrade >= trades.length)) {
    throw new Error('Selected trade must be a valid offer index or null.');
  }
  if (experience !== undefined && (!Number.isFinite(experience) || experience < 0 || experience > 1)) throw new Error('Villager experience must be a finite number from 0 to 1.');
  const active = selectedTrade === undefined ? (trades.length ? Math.min(selection, trades.length - 1) : null) : selectedTrade;
  const position = (x: number, y: number): CSSProperties => ({ position: 'absolute', left: x * scale, top: y * scale });
  function cell(address: VillagerSlotAddress, item: SlotData | null) {
    const bindings = getSlotProps?.(address);
    return <Slot {...bindings} key={address.index} background={false}
      label={item ? itemLabel(item) : `Empty ${address.section} slot ${address.index + 1}`}
      count={item?.count} tooltip={item?.tooltip} disabled={item?.disabled}
      onClick={event => { bindings?.onClick?.(event); onSlotClick?.(address, item, event); }}>{item?.content}</Slot>;
  }
  function preview(item: SlotData, x: number) {
    if (item.count !== undefined && (!Number.isInteger(item.count) || item.count < 1 || item.count > 999)) throw new Error('Trade count must be an integer from 1 to 999, or omitted.');
    return <span className="mcgui-trade-item" style={{ ...position(x, 2), width: 16 * scale, height: 16 * scale }} aria-hidden="true">
      {item.content}
      {item.count !== undefined && item.count > 1 ? <MinecraftText style={{ ...position(0, 9), right: -scale, left: 'auto' }}>{String(item.count)}</MinecraftText> : null}
    </span>;
  }
  return <section aria-label={title} className={`mcgui-villager ${className}`} style={{ position: 'relative', width: 276 * scale, height: 166 * scale, ...style }}>
    <svg className="mcgui-sprite mcgui-villager-background" aria-hidden="true" focusable="false" width={276 * scale} height={166 * scale}
      viewBox={`0 0 ${276 * texture.pixelWidth / texture.logicalWidth} ${166 * texture.pixelHeight / texture.logicalHeight}`}>
      <image href={assetUrl(baseUrl, texture.file)} width={texture.pixelWidth} height={texture.pixelHeight} />
    </svg>
    <MinecraftText shadow={false} className="mcgui-chest-title" style={position(Math.max(107, Math.floor(107 + (162 - measureText(assets.font, title)) / 2)), 6)}>{title}</MinecraftText>
    <MinecraftText shadow={false} className="mcgui-chest-title" style={position(28, 6)}>Trades</MinecraftText>
    <MinecraftText shadow={false} className="mcgui-chest-title" style={position(107, 72)}>{inventoryTitle}</MinecraftText>
    <div ref={list} id={listId} role="group" aria-label="Trade offers" className="mcgui-trade-list"
      onScroll={event => setScrollRow(Math.round(event.currentTarget.scrollTop / (20 * scale)))}
      style={{ ...position(5, 18), width: 88 * scale, height: 140 * scale }}>
      {trades.map((trade, index) => <button type="button" key={index}
        className="mcgui-trade-offer" aria-pressed={active === index}
        aria-label={`${itemLabel(trade.input)}${trade.secondaryInput ? ` + ${itemLabel(trade.secondaryInput)}` : ''} for ${itemLabel(trade.output)}${trade.outOfStock ? ', out of stock' : ''}`}
        style={{ width: 88 * scale, height: 20 * scale }}
        onClick={() => { setSelection(index); onTradeSelect?.(index, trade); }}
        onKeyDown={event => {
          let next: number;
          if (event.key === 'ArrowDown') next = Math.min(trades.length - 1, index + 1);
          else if (event.key === 'ArrowUp') next = Math.max(0, index - 1);
          else if (event.key === 'Home') next = 0;
          else if (event.key === 'End') next = trades.length - 1;
          else return;
          event.preventDefault();
          const button = event.currentTarget.parentElement!.children[next] as HTMLButtonElement;
          button.focus(); button.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }}>
        <Sprite name={active === index ? 'button.highlighted' : 'button.normal'} width={88} height={20} className="mcgui-trade-surface" />
        {preview(trade.input, 4)}{trade.secondaryInput ? preview(trade.secondaryInput, 29) : null}
        <Sprite name={trade.outOfStock ? 'villager.arrowOutOfStock' : 'villager.arrow'} width={10} height={9} style={position(57, 5)} />
        {preview(trade.output, 68)}
      </button>)}
    </div>
    <div role="scrollbar" aria-label="Trade offer scroll" aria-controls={listId} aria-orientation="vertical"
      aria-valuemin={0} aria-valuemax={maxRow} aria-valuenow={row} aria-disabled={!maxRow}
      tabIndex={maxRow ? 0 : -1} className="mcgui-trade-scroll"
      style={{ ...position(94, 18), width: 6 * scale, height: 140 * scale }}
      onPointerDown={event => {
        if (!maxRow || event.button !== 0) return;
        event.preventDefault(); event.currentTarget.focus(); drag.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId); scrollAt(event.currentTarget, event.clientY);
      }}
      onPointerMove={event => { if (drag.current === event.pointerId) scrollAt(event.currentTarget, event.clientY); }}
      onPointerUp={event => {
        drag.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}
      onKeyDown={event => {
        const next = { ArrowDown: row + 1, ArrowUp: row - 1, PageDown: row + 7, PageUp: row - 7, Home: 0, End: maxRow }[event.key];
        if (next !== undefined && maxRow) { event.preventDefault(); scrollToRow(next); }
      }}>
      <Sprite name={maxRow ? 'villager.scroller' : 'villager.scrollerDisabled'} width={6} height={27}
        style={{ ...position(0, Math.floor((maxRow ? row / maxRow : 0) * 113)), pointerEvents: 'none' }} />
    </div>
    {experience !== undefined ? <div role="progressbar" aria-label="Villager experience" aria-valuemin={0} aria-valuemax={1} aria-valuenow={experience}
      style={{ ...position(136, 16), width: 102 * scale, height: 5 * scale }}>
      <Sprite name="villager.experienceBackground" width={102} height={5} style={position(0, 0)} />
      <span style={{ ...position(0, 0), width: Math.floor(experience * 102) * scale, height: 5 * scale, overflow: 'hidden' }}><Sprite name="villager.experienceCurrent" width={102} height={5} /></span>
    </div> : null}
    <div style={position(135, 36)}>{cell({ section: 'input', index: 0 }, input)}</div>
    <div style={position(161, 36)}>{cell({ section: 'secondaryInput', index: 0 }, secondaryInput)}</div>
    <div style={position(219, 36)}>{cell({ section: 'output', index: 0 }, output)}</div>
    {active !== null && trades[active]?.outOfStock ? <Sprite name="villager.outOfStock" width={28} height={21} style={{ ...position(183, 35), pointerEvents: 'none' }} /> : null}
    <InventoryGrid label={`${inventoryTitle} slots`} style={position(106, 83)}>{Array.from({ length: 27 }, (_, index) => cell({ section: 'inventory', index }, inventory[index] ?? null))}</InventoryGrid>
    <InventoryGrid label="Hotbar slots" style={position(106, 141)}>{Array.from({ length: 9 }, (_, index) => cell({ section: 'inventory', index: index + 27 }, inventory[index + 27] ?? null))}</InventoryGrid>
  </section>;
}

function itemLabel(item: SlotData) { return `${item.label}${item.count && item.count > 1 ? `, ${item.count}` : ''}`; }
