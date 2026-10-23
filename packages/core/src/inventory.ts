/** A key must identify all stacking-relevant item data, not just a display name. */
export interface ItemStack { stackKey: string; count: number; maxStackSize?: number }
export interface InventoryState<T extends ItemStack> { slots: readonly (T | null)[]; carried: T | null }
export interface InventoryRules<T extends ItemStack> {
  canTake?: (index: number, stack: T) => boolean;
  canPlace?: (index: number, stack: T) => boolean;
  maxCount?: (index: number, stack: T) => number;
}
export type InventoryButton = 'left' | 'right';

function limit(stack: ItemStack) { return stack.maxStackSize ?? 64; }
function count<T extends ItemStack>(stack: T, amount: number): T | null { return amount > 0 ? { ...stack, count: amount } : null; }
function compatible(a: ItemStack, b: ItemStack) { return a.stackKey === b.stackKey && limit(a) === limit(b); }
export function validateInventory<T extends ItemStack>(state: InventoryState<T>): InventoryState<T> {
  for (const stack of [...state.slots, state.carried]) if (stack && (!stack.stackKey || !Number.isInteger(stack.count) || stack.count < 1 ||
    !Number.isInteger(limit(stack)) || limit(stack) < 1 || limit(stack) > 999 || stack.count > limit(stack))) {
    throw new Error('Inventory stacks need a nonempty stackKey and an integer count within maxStackSize (default 64, maximum 999).');
  }
  return state;
}
function validIndex<T extends ItemStack>(state: InventoryState<T>, index: number) {
  if (!Number.isInteger(index) || index < 0 || index >= state.slots.length) throw new Error(`Inventory slot index out of range: ${index}`);
}
function capacity<T extends ItemStack>(index: number, stack: T, rules: InventoryRules<T>) {
  const maximum = rules.maxCount?.(index, stack) ?? limit(stack);
  if (!Number.isInteger(maximum) || maximum < 0 || maximum > 999) throw new Error('Slot capacity must be an integer from 0 to 999.');
  return Math.min(limit(stack), maximum);
}

/** Immutable survival-inventory pickup/place behavior; empty clicks are no-ops. */
export function clickInventory<T extends ItemStack>(state: InventoryState<T>, index: number, button: InventoryButton = 'left', rules: InventoryRules<T> = {}): InventoryState<T> {
  validateInventory(state); validIndex(state, index);
  const item = state.slots[index]!, held = state.carried;
  if (!item && !held) return state;
  if (item && rules.canTake?.(index, item) === false) return state;
  const slots = [...state.slots];
  if (!held) {
    const taken = button === 'right' ? Math.ceil(item!.count / 2) : item!.count;
    slots[index] = count(item!, item!.count - taken);
    return { slots, carried: count(item!, taken) };
  }
  if (rules.canPlace?.(index, held) === false) {
    // Output slots can still contribute matching items to a held stack.
    if (!item || !compatible(item, held)) return state;
    const taken = Math.min(item.count, limit(held) - held.count);
    if (!taken) return state;
    slots[index] = count(item, item.count - taken);
    return { slots, carried: count(held, held.count + taken) };
  }
  const maximum = capacity(index, held, rules);
  if (!item || compatible(item, held)) {
    const placed = Math.min(button === 'right' ? 1 : held.count, maximum - (item?.count ?? 0));
    if (placed <= 0) return state;
    slots[index] = count(item ?? held, (item?.count ?? 0) + placed);
    return { slots, carried: count(held, held.count - placed) };
  }
  if (held.count > maximum) return state;
  slots[index] = held;
  return { slots, carried: item };
}

/** Fill compatible stacks before empty slots, in caller-supplied target order. */
export function quickMoveInventory<T extends ItemStack>(state: InventoryState<T>, index: number, targets: readonly number[], rules: InventoryRules<T> = {}): InventoryState<T> {
  validateInventory(state); validIndex(state, index);
  const item = state.slots[index];
  if (!item || rules.canTake?.(index, item) === false) return state;
  const destinations = [...new Set(targets)].filter(target => target !== index);
  destinations.forEach(target => validIndex(state, target));
  const slots = [...state.slots]; let remaining = item.count;
  for (const merge of [true, false]) for (const target of destinations) {
    const existing = slots[target];
    if (!remaining || Boolean(existing) !== merge || (existing && !compatible(existing, item)) || rules.canPlace?.(target, item) === false) continue;
    const placed = Math.min(remaining, capacity(target, item, rules) - (existing?.count ?? 0));
    if (placed <= 0) continue;
    slots[target] = count(existing ?? item, (existing?.count ?? 0) + placed); remaining -= placed;
  }
  if (remaining === item.count) return state;
  slots[index] = count(item, remaining);
  return { slots, carried: state.carried };
}

export function canDistributeTo<T extends ItemStack>(state: InventoryState<T>, index: number, rules: InventoryRules<T> = {}) {
  validIndex(state, index);
  const held = state.carried, item = state.slots[index];
  return Boolean(held && rules.canPlace?.(index, held) !== false && (!item || compatible(item, held)) && (item?.count ?? 0) < capacity(index, held, rules));
}

/** Swap with a hotbar/offhand cell, preserving the cursor and honoring both cells. */
export function swapInventory<T extends ItemStack>(state: InventoryState<T>, source: number, target: number, rules: InventoryRules<T> = {}): InventoryState<T> {
  validateInventory(state); validIndex(state, source); validIndex(state, target);
  if (source === target) return state;
  const a = state.slots[source]!, b = state.slots[target]!;
  if (!a && !b) return state;
  if ((a && (rules.canTake?.(source, a) === false || rules.canPlace?.(target, a) === false || a.count > capacity(target, a, rules))) ||
      (b && (rules.canTake?.(target, b) === false || rules.canPlace?.(source, b) === false || b.count > capacity(source, b, rules)))) return state;
  const slots = [...state.slots]; slots[source] = b; slots[target] = a;
  return { slots, carried: state.carried };
}

/** Collect matching partial stacks before full stacks; never exceed the cursor limit. */
export function collectInventory<T extends ItemStack>(state: InventoryState<T>, targets: readonly number[], rules: InventoryRules<T> = {}): InventoryState<T> {
  validateInventory(state);
  const held = state.carried;
  if (!held || held.count >= limit(held)) return state;
  const indices = [...new Set(targets)]; indices.forEach(index => validIndex(state, index));
  const slots = [...state.slots]; let amount = held.count;
  for (const full of [false, true]) for (const index of indices) {
    const item = slots[index];
    if (!item || !compatible(item, held) || (item.count === limit(item)) !== full || rules.canTake?.(index, item) === false) continue;
    const taken = Math.min(item.count, limit(held) - amount);
    if (!taken) continue;
    slots[index] = count(item, item.count - taken); amount += taken;
  }
  return amount === held.count ? state : { slots, carried: { ...held, count: amount } };
}

/** Left drag shares evenly; right drag adds one per eligible slot. Keep remainders. */
export function distributeInventory<T extends ItemStack>(state: InventoryState<T>, targets: readonly number[], button: InventoryButton, rules: InventoryRules<T> = {}): InventoryState<T> {
  validateInventory(state);
  if (!state.carried) return state;
  const held = state.carried;
  const destinations = [...new Set(targets)].filter(index => canDistributeTo(state, index, rules)).slice(0, held.count);
  if (!destinations.length) return state;
  if (destinations.length === 1) return clickInventory(state, destinations[0]!, button, rules);
  const each = button === 'right' ? 1 : Math.floor(held.count / destinations.length);
  const slots = [...state.slots]; let remaining = held.count;
  for (const index of destinations) {
    const item = slots[index];
    const placed = Math.min(each, capacity(index, held, rules) - (item?.count ?? 0));
    slots[index] = count(item ?? held, (item?.count ?? 0) + placed); remaining -= placed;
  }
  return { slots, carried: count(held, remaining) };
}
