import test from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { CREATIVE_LAYOUT, CREATIVE_TAB_SPRITES, creativeTabPosition, creativeScrollRows, filterCreativeItems, pickCreativeItem, copyCreativeToSlot, parseManifest, type ItemStack, type InventoryState } from '../packages/core/src/index.js';
import { CreativeInventoryScreen, MinecraftProvider } from '../packages/react/src/index.js';
import { extractAssets, validateBundle } from '../packages/assets/src/index.js';
import { fixture, pack, png, put } from './fixtures.js';

test('creative source is immutable; full-stack picking, matching increments, right-click depletion and cloning respect stack limits', () => {
  const item = Object.freeze({ stackKey: 'stone', count: 1 });
  const state: InventoryState<ItemStack> = { slots: Object.freeze([null, { stackKey: 'apple', count: 4 }]), carried: null };
  let next = pickCreativeItem(state, item);
  assert.equal(next.carried?.count, 1); assert.equal(next.slots, state.slots);
  next = pickCreativeItem(next, item); assert.equal(next.carried?.count, 2);
  next = pickCreativeItem(next, item, 'left', true); assert.equal(next.carried?.count, 64);
  assert.equal(pickCreativeItem(next, item), next);
  next = pickCreativeItem(next, item, 'right'); assert.equal(next.carried?.count, 63);
  assert.equal(pickCreativeItem(next, item, 'middle'), next);
  assert.equal(pickCreativeItem(next, { stackKey: 'other', count: 1 }).carried, null);
  assert.equal(pickCreativeItem(next, null).carried, null);
  assert.equal(pickCreativeItem(next, null, 'right').carried?.count, 62);
  assert.equal(pickCreativeItem(state, item, 'middle').carried?.count, 64);
  assert.equal(pickCreativeItem(state, { stackKey: 'sword', count: 1, maxStackSize: 1 }, 'left', true).carried?.count, 1);
  assert.equal(pickCreativeItem(pickCreativeItem(state, item), item, 'right').carried, null);
  assert.equal(item.count, 1); assert.equal(state.carried, null);
  assert.throws(() => pickCreativeItem(state, { stackKey: 'bad', count: 65 }));
});

test('creative number-key copy replaces only its target and preserves the carried item', () => {
  const carried = { stackKey: 'apple', count: 10 };
  const state: InventoryState<ItemStack> = { slots: [null, { stackKey: 'old', count: 4 }], carried };
  const next = copyCreativeToSlot(state, { stackKey: 'pearl', count: 1, maxStackSize: 16 }, 1);
  assert.deepEqual(next.slots, [null, { stackKey: 'pearl', count: 16, maxStackSize: 16 }]);
  assert.equal(next.carried, carried); assert.equal(state.slots[1]?.stackKey, 'old');
  assert.throws(() => copyCreativeToSlot(state, carried, 2));
  assert.equal(copyCreativeToSlot(state, null, 1), state);
});

test('creative search filters category, names, identifiers and resource tags without altering catalogue order', () => {
  const items = [{ label: 'Oak Planks', stackKey: 'minecraft:oak_planks', categories: ['building'], tags: ['minecraft:planks'] },
    { label: 'Diamond', stackKey: 'custom:gem', categories: ['ingredients'], tags: ['gems'] },
    { label: 'Spruce Planks', stackKey: 'minecraft:spruce_planks', categories: ['building'], tags: ['minecraft:planks'] }];
  assert.deepEqual(filterCreativeItems(items, 'building'), [items[0], items[2]]);
  assert.deepEqual(filterCreativeItems(items, undefined, '  DIAMOND '), [items[1]]);
  assert.deepEqual(filterCreativeItems(items, undefined, 'custom:'), [items[1]]);
  assert.deepEqual(filterCreativeItems(items, undefined, '#minecraft:planks'), [items[0], items[2]]);
  assert.deepEqual(filterCreativeItems(items, 'building', '#gems'), []);
  assert.equal(creativeScrollRows(0), 0); assert.equal(creativeScrollRows(45), 0); assert.equal(creativeScrollRows(46), 1); assert.equal(creativeScrollRows(81), 4);
});

test('creative geometry keeps the five-row catalogue and hotbar within the 26.2 sheet; aligned tabs meet its right edge', () => {
  assert.equal(CREATIVE_LAYOUT.catalogue.y + 5 * 18, 107);
  assert.ok(CREATIVE_LAYOUT.hotbar.y + 18 < CREATIVE_LAYOUT.height);
  assert.deepEqual(creativeTabPosition('top', 0), { x: 0, y: -28 });
  assert.deepEqual(creativeTabPosition('bottom', 6, true), { x: 169, y: 132 });
  assert.equal(Object.keys(CREATIVE_TAB_SPRITES).length, 28);
  assert.throws(() => creativeTabPosition('top', 7));
});

test('creative extraction follows pack precedence for sheets and tabs; old manifests remain readable', async t => {
  const f = await fixture(); t.after(() => rm(f.root, { recursive: true, force: true }));
  const p = await pack(f.root);
  await put(p, 'assets/minecraft/textures/gui/container/creative_inventory/tab_items.png', png(512, 512));
  await put(p, 'assets/minecraft/textures/gui/sprites/container/creative_inventory/tab_top_selected_1.png', png(52, 64));
  const assets = await extractAssets({ clientJar: f.vanilla, out: f.out, packs: [p], characters: '?' });
  assert.equal(assets.textures?.['creative.items']?.logicalWidth, 256);
  assert.equal(assets.textures?.['creative.items']?.pixelWidth, 512);
  assert.equal(assets.sprites['creative.tab.top.selected.1']?.source, 'pack-1');
  assert.equal(assets.sprites['creative.scroller']?.source, 'vanilla');
  assert.deepEqual(await validateBundle(f.out), assets);
  const legacy = parseManifest({ ...assets, textures: undefined });
  assert.throws(() => renderToString(createElement(MinecraftProvider, { assets: legacy, baseUrl: '/', children: createElement(CreativeInventoryScreen, { items: [] }) })), /Re-run mcgui-assets/);
});

test('creative SSR has accessible tabs, 45 catalogue cells and shared hotbar; inventory tab exposes equipment and delete slot', async t => {
  const f = await fixture(); t.after(() => rm(f.root, { recursive: true, force: true }));
  const assets = await extractAssets({ clientJar: f.vanilla, out: f.out, characters: '?' });
  const render = (defaultTab?: string, renderer: 'dom' | 'canvas' = 'dom') => renderToString(createElement(MinecraftProvider, { assets, baseUrl: '/test', children: createElement(CreativeInventoryScreen, { items: [], defaultTab, renderer }) }));
  const html = render();
  assert.equal((html.match(/role="tab"/g) ?? []).length, 13);
  assert.equal((html.match(/aria-selected="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-mcgui-slot=""/g) ?? []).length, 54);
  assert.match(render('search'), /aria-label="Search items"/);
  const inventory = render('inventory');
  assert.equal((inventory.match(/data-mcgui-slot=""/g) ?? []).length, 42);
  assert.match(inventory, /aria-label="Destroy item"/);
  assert.doesNotMatch(inventory, /aria-label="Creative item scroll"/);
  const canvas = render(undefined, 'canvas');
  assert.equal((canvas.match(/data-mcgui-slot=""/g) ?? []).length, 54);
  assert.match(canvas, /<canvas[^>]+aria-hidden="true"/);
  assert.match(canvas, /data-renderer="dom"/); // SSR retains real artwork until canvas is ready.
});
