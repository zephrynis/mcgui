'use client';

import { type CSSProperties, type MouseEvent } from 'react';
import { JAVA_26_2, assetUrl, measureText } from '@mcgui/core';
import { MinecraftText, useMinecraft } from './primitives.js';
import { InventoryGrid, Slot, type SlotData } from './inventory.js';
import { ProgressBar } from './controls.js';
import type { InventorySlotBindings } from './inventory-interaction.js';

export type FurnaceSlotAddress = { section: 'input' | 'fuel' | 'output'; index: 0 } | { section: 'inventory'; index: number };
export interface FurnaceScreenProps {
  title?: string;
  inventoryTitle?: string;
  input?: SlotData | null;
  fuel?: SlotData | null;
  output?: SlotData | null;
  inventory?: readonly (SlotData | null)[];
  /** Normalized smelting progress and remaining fuel; the application owns the timer. */
  progress?: number;
  fuelRemaining?: number;
  selectedSlot?: FurnaceSlotAddress | null;
  onSlotClick?: (address: FurnaceSlotAddress, item: SlotData | null, event: MouseEvent<HTMLButtonElement>) => void;
  getSlotProps?: (address: FurnaceSlotAddress) => InventorySlotBindings;
  className?: string;
  style?: CSSProperties;
}
/** Furnace container surface. Recipe-book UI and smelting rules are application concerns. */
export function FurnaceScreen({ title = 'Furnace', inventoryTitle = 'Inventory', input = null, fuel = null, output = null,
  inventory = [], progress = 0, fuelRemaining = 0, selectedSlot, onSlotClick, getSlotProps, className = '', style }: FurnaceScreenProps) {
  const { assets, baseUrl, scale } = useMinecraft();
  const layout = JAVA_26_2.furnace, texture = assets.textures?.['container.furnace'];
  if (!texture) throw new Error('Missing furnace assets. Re-run mcgui-assets extract with the current CLI.');
  if (inventory.length > 36) throw new Error('Too many slots for the player inventory.');
  const position = ({ x, y }: { x: number; y: number }): CSSProperties => ({ position: 'absolute', left: x * scale, top: y * scale });
  function cell(address: FurnaceSlotAddress, item: SlotData | null) {
    const bindings = getSlotProps?.(address);
    return <Slot {...bindings} key={address.index} background={false}
      label={item ? `${item.label}${item.count && item.count > 1 ? `, ${item.count}` : ''}` : `Empty ${address.section} slot ${address.index + 1}`}
      count={item?.count} tooltip={item?.tooltip} disabled={item?.disabled}
      selected={selectedSlot === undefined ? undefined : selectedSlot?.section === address.section && selectedSlot.index === address.index}
      onClick={event => { bindings?.onClick?.(event); onSlotClick?.(address, item, event); }}>{item?.content}</Slot>;
  }
  return <section aria-label={title} className={`mcgui-furnace ${className}`} style={{ position: 'relative', width: layout.width * scale, height: layout.height * scale, ...style }}>
    <svg className="mcgui-sprite mcgui-furnace-background" aria-hidden="true" focusable="false" width={layout.width * scale} height={layout.height * scale}
      viewBox={`0 0 ${layout.width * texture.pixelWidth / texture.logicalWidth} ${layout.height * texture.pixelHeight / texture.logicalHeight}`}>
      <image href={assetUrl(baseUrl, texture.file)} width={texture.pixelWidth} height={texture.pixelHeight} />
    </svg>
    <MinecraftText shadow={false} className="mcgui-chest-title" style={position({ x: Math.floor((layout.width - measureText(assets.font, title)) / 2), y: layout.titleY })}>{title}</MinecraftText>
    <MinecraftText shadow={false} className="mcgui-chest-title" style={position(layout.inventoryTitle)}>{inventoryTitle}</MinecraftText>
    {(['input', 'fuel', 'output'] as const).map(section => <div key={section} style={position(layout[section])}>{cell({ section, index: 0 }, { input, fuel, output }[section])}</div>)}
    <ProgressBar label="Smelting progress" value={progress} variant="furnace-arrow" style={position(layout.arrow)} />
    <ProgressBar label="Fuel remaining" value={fuelRemaining} variant="furnace-flame" style={position(layout.flame)} />
    <InventoryGrid label={`${inventoryTitle} slots`} style={position(layout.inventory)}>{Array.from({ length: 27 }, (_, index) => cell({ section: 'inventory', index }, inventory[index] ?? null))}</InventoryGrid>
    <InventoryGrid label="Hotbar slots" style={position(layout.hotbar)}>{Array.from({ length: 9 }, (_, index) => cell({ section: 'inventory', index: index + 27 }, inventory[index + 27] ?? null))}</InventoryGrid>
  </section>;
}
