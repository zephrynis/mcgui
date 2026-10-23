import test from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { JAVA_26_2, parseManifest, resourcePath } from '../packages/core/src/index.js';
import { MinecraftProvider, VillagerScreen, type VillagerScreenProps } from '../packages/react/src/index.js';
import { extractAssets, validateBundle } from '../packages/assets/src/index.js';
import { fixture, pack, png, put } from './fixtures.js';

test('villager extraction supports rectangular sheets, pack overrides and legacy manifests', async t => {
  const f = await fixture(); t.after(() => rm(f.root, { recursive: true, force: true }));
  const p = await pack(f.root);
  const sheet = resourcePath(JAVA_26_2.containers['container.villager'], 'textures', '.png');
  await put(p, sheet, png(1024, 512));
  await put(p, resourcePath(JAVA_26_2.villager['villager.arrow'], 'textures/gui/sprites', '.png'), png(20, 18));
  const assets = await extractAssets({ clientJar: f.vanilla, packs: [p], out: f.out, characters: '?' });
  assert.equal(assets.textures!['container.villager']!.logicalWidth, 512);
  assert.equal(assets.textures!['container.villager']!.logicalHeight, 256);
  assert.equal(assets.textures!['container.villager']!.pixelWidth, 1024);
  assert.equal(assets.sprites['villager.arrow']!.source, 'pack-1');
  assert.deepEqual(await validateBundle(f.out), assets);
  const legacy = parseManifest({ ...assets, textures: undefined });
  assert.throws(() => renderToString(createElement(MinecraftProvider, { assets: legacy, baseUrl: '/', children: createElement(VillagerScreen) })), /Re-run mcui-assets/);
  await put(p, sheet, png(512, 512));
  await assert.rejects(extractAssets({ clientJar: f.vanilla, packs: [p], out: f.out, characters: '?' }), /512×256/);
});

test('villager SSR separates selectable offer previews from inventory slots and validates state', async t => {
  const f = await fixture(); t.after(() => rm(f.root, { recursive: true, force: true }));
  const assets = await extractAssets({ clientJar: f.vanilla, out: f.out, characters: '?AB' });
  const trades = [{ input: { label: 'A', count: 20 }, secondaryInput: { label: 'B' }, output: { label: 'B', count: 6 }, outOfStock: true }];
  const render = (props: VillagerScreenProps = {}) => renderToString(createElement(MinecraftProvider, { assets, baseUrl: '/assets', scale: 2,
    children: createElement(VillagerScreen, { trades, ...props }) }));
  const html = render({ experience: 0.5 });
  assert.equal((html.match(/data-mcui-slot=""/g) ?? []).length, 39);
  assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 1);
  assert.match(html, /A, 20 \+ B for B, 6, out of stock/);
  assert.match(html, /aria-label="Villager experience"/);
  assert.match(html, /width:552px;height:332px/);
  assert.doesNotMatch(html, /mcui-slot-background|NaN|undefined/);
  assert.doesNotMatch(render({ selectedTrade: null }), /aria-pressed="true"/);
  assert.doesNotMatch(render({ trades: [] }), /No trades/);
  assert.match(render({ trades: [] }), /aria-label="Trade offer scroll"[^>]*aria-disabled="true"/);
  assert.match(render({ trades: Array(12).fill(trades[0]) }), /aria-valuemax="5" aria-valuenow="0" aria-disabled="false"/);
  assert.doesNotMatch(render({ trades: [] }), /aria-pressed="true"/);
  for (const props of [{ inventory: Array(37).fill(null) }, { selectedTrade: 1 }, { selectedTrade: -1 }, { selectedTrade: NaN },
    { defaultSelectedTrade: -1 }, { experience: Infinity }, { experience: 1.1 }, { experience: -0.1 },
    { trades: [{ input: { label: 'A', count: 0 }, output: { label: 'B' } }] }]) {
    assert.throws(() => render(props));
  }
});
