import test from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { chestLayout, parseManifest, plainText, textColor, wrapText, placeTooltip } from '../packages/core/src/index.js';
import { ChestScreen, MinecraftProvider, MinecraftText, Slot, Tooltip } from '../packages/react/src/index.js';
import { extractAssets, validateBundle } from '../packages/assets/src/index.js';
import { fixture, pack, put, png } from './fixtures.js';

test('chest layouts keep slots within the correct texture regions for rows 1–6', () => {
  for (let rows = 1; rows <= 6; rows++) {
    const layout = chestLayout(rows);
    assert.equal(layout.width, 176); assert.equal(layout.height, 114 + rows * 18);
    assert.equal(layout.chest.y + rows * 18, layout.topHeight);
    assert.equal(layout.inventory.y - layout.topHeight, 13);
    assert.equal(layout.hotbar.y - layout.inventory.y, 58);
    assert.ok(layout.hotbar.y + 18 < layout.height);
  }
  assert.throws(() => chestLayout(0)); assert.throws(() => chestLayout(7)); assert.throws(() => chestLayout(2.5));
});

test('extraction resolves chest, slot and tooltip pack overrides with high-resolution geometry', async t => {
  const f = await fixture(); t.after(() => rm(f.root, { recursive: true, force: true }));
  const p = await pack(f.root);
  await put(p, 'assets/minecraft/textures/gui/container/generic_54.png', png(512, 512));
  await put(p, 'assets/minecraft/textures/gui/sprites/tooltip/background.png', png(200, 200));
  const m = await extractAssets({ clientJar: f.vanilla, out: f.out, packs: [p], characters: 'AB?' });
  assert.equal(m.textures!['container.chest']!.pixelWidth, 512);
  assert.equal(m.textures!['container.chest']!.logicalWidth, 256);
  assert.equal(m.textures!['container.chest']!.source, 'pack-1');
  assert.equal(m.sprites['tooltip.background']!.source, 'pack-1');
  assert.equal(m.sprites['slot.highlightBack']!.source, 'vanilla');
  assert.deepEqual(await validateBundle(f.out), m);
  await put(p, 'assets/minecraft/textures/gui/container/generic_54.png', png(256, 128));
  await assert.rejects(extractAssets({ clientJar: f.vanilla, out: f.out, packs: [p], characters: '?' }), /square integer multiple/);
});

test('legacy button-only manifests still parse; chest use asks for re-extraction', async t => {
  const f = await fixture(); t.after(() => rm(f.root, { recursive: true, force: true }));
  const m = await extractAssets({ clientJar: f.vanilla, out: f.out, characters: '?' });
  const legacy = parseManifest({ ...m, textures: undefined, sprites: { 'button.normal': m.sprites['button.normal'], 'button.highlighted': m.sprites['button.highlighted'], 'button.disabled': m.sprites['button.disabled'] } });
  assert.throws(() => renderToString(createElement(MinecraftProvider, { assets: legacy, baseUrl: '/', children: createElement(ChestScreen) })), /Re-run mcgui-assets/);
});

test('chests server-render correct counts, controlled selection and single slot backgrounds', async t => {
  const f = await fixture(); t.after(() => rm(f.root, { recursive: true, force: true }));
  const assets = await extractAssets({ clientJar: f.vanilla, out: f.out, characters: 'AB?' });
  const child = createElement(ChestScreen, { rows: 6, slots: [{ label: 'A', count: 32, tooltip: 'A' }], selectedSlot: { section: 'chest', index: 0 } });
  const html = renderToString(createElement(MinecraftProvider, { assets, baseUrl: '/test', children: child }));
  assert.equal((html.match(/data-mcgui-slot=""/g) ?? []).length, 90);
  assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 1);
  assert.match(html, /aria-label="A, 32"/); assert.doesNotMatch(html, /mcgui-slot-background/);
  assert.doesNotMatch(html, /role="tooltip"/); // no document access or portals during SSR
  assert.throws(() => renderToString(createElement(MinecraftProvider, { assets, baseUrl: '/', children: createElement(ChestScreen, { rows: 1, slots: Array(10).fill(null) }) })), /Too many slots/);
  assert.throws(() => renderToString(createElement(MinecraftProvider, { assets, baseUrl: '/', children: createElement(Slot, { label: 'A', count: 0 }) })), /Slot count/);
});

test('colored text preserves accessible text and wraps words, newlines and long strings', async t => {
  const f = await fixture(); t.after(() => rm(f.root, { recursive: true, force: true }));
  const assets = await extractAssets({ clientJar: f.vanilla, out: f.out, characters: ' AB?' });
  const content = [{ text: 'AB ', color: 'gold' as const }, { text: 'AB\n\nAAAA', color: 'aqua' as const }];
  const lines = wrapText(assets.font, content, 12);
  assert.deepEqual(lines.map(plainText), ['AB', 'AB', '', 'AA', 'AA']);
  assert.equal(lines[1]![0]!.color, 'aqua');
  assert.equal(textColor('gold'), '#ffaa00'); assert.equal(textColor('#abcdef'), '#abcdef');
  assert.throws(() => textColor('url(evil)' as never));
  const html = renderToString(createElement(MinecraftProvider, { assets, baseUrl: '/', children: createElement(MinecraftText, { children: content }) }));
  assert.match(html, /#ffaa00/); assert.match(html, /#55ffff/); assert.match(html, /AB AB/);
  assert.doesNotThrow(() => renderToString(createElement(MinecraftProvider, { assets, baseUrl: '/', children: createElement(Tooltip, { content: 'A', children: createElement('button', {}, 'A') }) })));
});

test('tooltips flip left and clamp to every viewport edge', () => {
  const size = { width: 180, height: 100 }, viewport = { width: 390, height: 844 };
  assert.deepEqual(placeTooltip({ x: 370, y: 840 }, size, viewport), { x: 178, y: 740 });
  assert.deepEqual(placeTooltip({ x: 0, y: 0 }, size, viewport), { x: 12, y: 4 });
  assert.deepEqual(placeTooltip({ x: -50, y: -50 }, size, viewport), { x: 4, y: 4 });
});
