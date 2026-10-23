import { validateInventory, type InventoryState, type ItemStack } from './inventory.js';

export type CreativeTabSprite = `creative.tab.${'top' | 'bottom'}.${'selected' | 'unselected'}.${1 | 2 | 3 | 4 | 5 | 6 | 7}`;
export const CREATIVE_TAB_SPRITES = Object.fromEntries(['top', 'bottom'].flatMap(row => ['selected', 'unselected'].flatMap(state =>
  Array.from({ length: 7 }, (_, index) => [`creative.tab.${row}.${state}.${index + 1}`, `minecraft:container/creative_inventory/tab_${row}_${state}_${index + 1}`])))) as Record<CreativeTabSprite, string>;

/** Coordinates measured from the Java 26.2 client; slots include their 1px border. */
export const CREATIVE_LAYOUT = {
  width: 195, height: 136, top: 28, bottom: 28,
  catalogue: { x: 8, y: 17 }, hotbar: { x: 8, y: 111 }, inventory: { x: 8, y: 53 },
  search: { x: 82, y: 6, width: 80, height: 9 },
  scroll: { x: 175, y: 18, width: 12, height: 110, thumbHeight: 15, travel: 95 },
  armor: [{ x: 53, y: 5 }, { x: 53, y: 32 }, { x: 107, y: 5 }, { x: 107, y: 32 }],
  offhand: { x: 34, y: 19 }, trash: { x: 172, y: 111 },
} as const;

export function creativeTabPosition(row: 'top' | 'bottom', column: number, alignedRight = false) {
  if (!['top', 'bottom'].includes(row) || !Number.isInteger(column) || column < 0 || column > 6) throw new Error('Creative tabs need a top/bottom row and column from 0 to 6.');
  return { x: alignedRight ? 195 - 27 * (7 - column) + 1 : 27 * column, y: row === 'top' ? -28 : 132 };
}

export interface CreativeSearchItem { label: string; stackKey: string; categories: readonly string[]; tags?: readonly string[]; searchText?: string }
/** Plain text matches names/IDs; # queries match caller-provided resource tags. */
export function filterCreativeItems<T extends CreativeSearchItem>(items: readonly T[], category?: string, query = ''): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return category ? items.filter(item => item.categories.includes(category)) : [...items];
  return items.filter(item => (!category || item.categories.includes(category)) && (needle.startsWith('#')
    ? (item.tags ?? []).some(tag => tag.toLowerCase().includes(needle.slice(1)))
    : `${item.label}\n${item.stackKey}\n${item.searchText ?? ''}`.toLowerCase().includes(needle)));
}
export function creativeScrollRows(length: number) { return Math.max(0, Math.ceil(length / 9) - 5); }

/** Creative catalogue cells are an infinite source, never mutable inventory slots. */
export function pickCreativeItem<T extends ItemStack>(state: InventoryState<T>, item: T | null, button: 'left' | 'right' | 'middle' = 'left', shift = false): InventoryState<T> {
  validateInventory(state);
  if (item) validateInventory({ slots: [item], carried: null });
  const held = state.carried;
  if (button === 'middle') return !held && item ? { ...state, carried: { ...item, count: item.maxStackSize ?? 64 } } : state;
  if (held && item && held.stackKey === item.stackKey && (held.maxStackSize ?? 64) === (item.maxStackSize ?? 64)) {
    const amount = button === 'right' ? held.count - 1 : shift ? held.maxStackSize ?? 64 : Math.min(held.count + 1, held.maxStackSize ?? 64);
    return amount === held.count ? state : { ...state, carried: amount > 0 ? { ...held, count: amount } : null };
  }
  if (!held && item) return { ...state, carried: { ...item, count: shift ? item.maxStackSize ?? 64 : item.count } };
  if (!held) return state;
  return { ...state, carried: button === 'right' && held.count > 1 ? { ...held, count: held.count - 1 } : null };
}

/** Number keys copy a full catalogue stack directly into a hotbar cell. */
export function copyCreativeToSlot<T extends ItemStack>(state: InventoryState<T>, item: T | null, index: number): InventoryState<T> {
  validateInventory(state);
  if (!Number.isInteger(index) || index < 0 || index >= state.slots.length) throw new Error('Creative hotbar index is out of range.');
  if (!item) return state;
  validateInventory({ slots: [item], carried: null });
  const slots = [...state.slots]; slots[index] = { ...item, count: item.maxStackSize ?? 64 };
  return { slots, carried: state.carried };
}
