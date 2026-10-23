import { ItemIcon, type InventoryItem } from '@mcgui/react';

/** Real items resolved from the active, locally extracted Minecraft bundle. */
export function minecraftItem(id: string, label: string, count = 1, disabled = false): InventoryItem {
  const stackKey = `minecraft:${id}`;
  return { stackKey, label, count, maxStackSize: 64, disabled, content: <ItemIcon stackKey={stackKey} />, tooltip: [{ text: label, color: 'white' }] };
}

export const furnaceItems = [
  minecraftItem('raw_iron', 'Raw Iron', 8),
  minecraftItem('coal', 'Coal', 16),
  minecraftItem('iron_ingot', 'Iron Ingot', 4),
];
