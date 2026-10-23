import test from 'node:test';
import assert from 'node:assert/strict';
import { clickInventory, quickMoveInventory, distributeInventory, validateInventory, type InventoryState, type ItemStack } from '../packages/core/src/index.js';

const stack = (count: number, stackKey = 'gem', maxStackSize = 64): ItemStack => ({ stackKey, count, maxStackSize });

test('empty clicks do nothing; left/right clicks pick up, split, place, merge and swap', () => {
  let state: InventoryState<ItemStack> = { slots: [null, stack(9), stack(63), stack(2, 'other')], carried: null };
  assert.equal(clickInventory(state, 0), state);
  state = clickInventory(state, 1, 'right'); assert.equal(state.carried!.count, 5); assert.equal(state.slots[1]!.count, 4);
  state = clickInventory(state, 0, 'right'); assert.equal(state.carried!.count, 4); assert.equal(state.slots[0]!.count, 1);
  state = clickInventory(state, 2); assert.equal(state.slots[2]!.count, 64); assert.equal(state.carried!.count, 3);
  assert.equal(clickInventory(state, 2), state); // full matching stack
  state = clickInventory(state, 3, 'right'); assert.equal(state.carried!.stackKey, 'other'); assert.equal(state.slots[3]!.count, 3);
  state = clickInventory(state, 1); assert.equal(state.carried!.count, 4); assert.equal(state.slots[1]!.stackKey, 'other');
  state = clickInventory(state, 0); assert.equal(state.carried, null); assert.equal(state.slots[0]!.count, 5);
  state = clickInventory(state, 0); assert.equal(state.slots[0], null); assert.equal(state.carried!.count, 5);
});

test('shift transfers fill matching stacks first, respect ordering and retain overflow', () => {
  const before: InventoryState<ItemStack> = { slots: [stack(30), null, stack(60), stack(16, 'other', 16)], carried: stack(2, 'cursor') };
  const result = quickMoveInventory(before, 0, [1, 2, 3, 1], { maxCount: index => index === 1 ? 10 : 64 });
  assert.equal(result.slots[0]!.count, 16); assert.equal(result.slots[1]!.count, 10); assert.equal(result.slots[2]!.count, 64);
  assert.equal(result.carried, before.carried); assert.equal(before.slots[0]!.count, 30); assert.equal(before.slots[1], null);
  assert.equal(quickMoveInventory(result, 0, [1, 2, 3], { maxCount: index => index === 1 ? 10 : 64 }), result);
});

test('output and locked slots reject placement, but output can add to a matching carried stack', () => {
  const rules = { canTake: (index: number) => index !== 0, canPlace: (index: number) => index === 2 };
  let state: InventoryState<ItemStack> = { slots: [stack(5), stack(9), null], carried: null };
  assert.equal(clickInventory(state, 0, 'left', rules), state);
  assert.equal(quickMoveInventory(state, 0, [2], rules), state);
  state = { ...state, carried: stack(60) };
  state = clickInventory(state, 1, 'right', rules); assert.equal(state.carried!.count, 64); assert.equal(state.slots[1]!.count, 5);
  assert.equal(clickInventory(state, 1, 'left', rules), state);
  const wrong = { ...state, carried: stack(1, 'wrong') };
  assert.equal(clickInventory(wrong, 1, 'left', rules), wrong);
  const emptyOutput = { ...state, slots: [state.slots[0]!, null, null] };
  assert.equal(clickInventory(emptyOutput, 1, 'left', rules), emptyOutput);
});

test('drag shares evenly or places one, caps full slots, deduplicates targets and preserves remainders', () => {
  const state: InventoryState<ItemStack> = { slots: [null, null, stack(63), stack(3, 'other'), null], carried: stack(11) };
  const left = distributeInventory(state, [0, 1, 2, 3, 0, 4], 'left', { canPlace: index => index !== 4 });
  assert.deepEqual(left.slots.map(item => item?.count ?? 0), [3, 3, 64, 3, 0]); assert.equal(left.carried!.count, 4);
  const right = distributeInventory(state, [0, 1, 2], 'right');
  assert.deepEqual(right.slots.map(item => item?.count ?? 0), [1, 1, 64, 3, 0]); assert.equal(right.carried!.count, 8);
  assert.equal(distributeInventory(state, [3], 'left'), state);
  assert.equal(distributeInventory(state, [0], 'left').slots[0]!.count, 11);
  const small = distributeInventory({ ...state, carried: stack(2) }, [0, 1, 4], 'right');
  assert.equal(small.carried, null); assert.equal(small.slots[4], null);
});

test('stack identity includes caller-supplied component keys and respects nonstackable items', () => {
  const state: InventoryState<ItemStack> = { slots: [stack(1, 'sword:damage=4', 1), null], carried: stack(1, 'sword:damage=2', 1) };
  const swapped = clickInventory(state, 0); assert.equal(swapped.carried!.stackKey, 'sword:damage=4'); assert.equal(swapped.slots[0]!.stackKey, 'sword:damage=2');
  const sameKeyDifferentLimit = clickInventory({ slots: [stack(2)], carried: stack(4, 'gem', 16) }, 0);
  assert.equal(sameKeyDifferentLimit.carried!.count, 2); assert.equal(sameKeyDifferentLimit.slots[0]!.maxStackSize, 16);
  for (const invalid of [stack(0), stack(65), stack(1, ''), stack(1, 'x', 0), stack(1, 'x', 1000)]) {
    assert.throws(() => validateInventory({ slots: [invalid], carried: null }), /Inventory stacks/);
  }
  assert.throws(() => clickInventory(state, -1), /out of range/);
  assert.throws(() => quickMoveInventory(state, 0, [99]), /out of range/);
});

test('mixed interaction sequences never create or lose items and do not mutate prior states', () => {
  let seed = 417;
  function random(max: number) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % max; }
  let state: InventoryState<ItemStack> = { slots: Array.from({ length: 20 }, (_, index) => index < 5 ? stack(index + 10, index % 2 ? 'copper' : 'gem') : null), carried: null };
  function totals(value: InventoryState<ItemStack>) {
    const counts: Record<string, number> = {};
    for (const item of [...value.slots, value.carried]) if (item) counts[item.stackKey] = (counts[item.stackKey] ?? 0) + item.count;
    return Object.fromEntries(Object.entries(counts).sort());
  }
  const expected = totals(state);
  for (let i = 0; i < 1000; i++) {
    const before = JSON.stringify(state), previous = state, index = random(20), button = random(2) ? 'left' : 'right';
    const action = random(3), targets = Array.from({ length: 5 }, () => random(20));
    state = action === 0 ? clickInventory(state, index, button) : action === 1 ? quickMoveInventory(state, index, targets) : distributeInventory(state, targets, button);
    assert.equal(JSON.stringify(previous), before); assert.deepEqual(totals(state), expected); validateInventory(state);
  }
});
