import test from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { JAVA_26_2, normalizeSliderValue, parseManifest, progressGeometry, resourcePath } from '../packages/core/src/index.js';
import { Checkbox, Slider, ProgressBar, FurnaceScreen, MinecraftProvider } from '../packages/react/src/index.js';
import { extractAssets, validateBundle } from '../packages/assets/src/index.js';
import { fixture, pack, png, put } from './fixtures.js';

test('slider steps handle decimals, negative ranges and a maximum between steps', () => {
  assert.equal(normalizeSliderValue(0.26, -1, 1, 0.1), 0.3);
  assert.equal(normalizeSliderValue(1, 0, 1, 0.3), 0.9);
  assert.equal(normalizeSliderValue(0.3, 0, 0.3, 0.1), 0.3);
  assert.equal(normalizeSliderValue(0.25, 0, 1, 0.1), 0.3);
  assert.equal(normalizeSliderValue(0.35, 0, 1, 0.1), 0.4);
  assert.throws(() => normalizeSliderValue(0, -Number.MAX_VALUE, Number.MAX_VALUE, 1), /Slider/);
});

test('progress reveals full-size sprites with bounded, monotonic integer crops', () => {
  for (const variant of ['experience', 'furnace-arrow', 'furnace-flame'] as const) {
    let previous = 0;
    for (let percent = 0; percent <= 100; percent++) {
      const geometry = progressGeometry(variant, percent / 100), extent = geometry.vertical ? geometry.height : geometry.width;
      assert.ok(Number.isInteger(geometry.filled));
      assert.ok(geometry.filled >= previous && geometry.filled <= extent); previous = geometry.filled;
      if (percent === 0) assert.equal(geometry.filled, 0);
      if (percent === 100) assert.equal(geometry.filled, extent);
    }
    for (const invalid of [-1, 1.01, NaN, Infinity]) assert.throws(() => progressGeometry(variant, invalid), /finite number/);
  }
  assert.equal(progressGeometry('furnace-arrow', 0.5).filled, 12);
  assert.equal(progressGeometry('furnace-flame', 0.5).filled, 8);
  assert.equal(progressGeometry('furnace-flame', 0.001).filled, 2);
  assert.equal(progressGeometry('experience', 0.5).filled, 91);
});

test('new assets resolve through ordered packs, retaining logical container size and scaling metadata', async t => {
  const f = await fixture(); t.after(() => rm(f.root, { recursive: true, force: true }));
  const p = await pack(f.root), later = await pack(f.root, 'later');
  for (const id of Object.values({ ...JAVA_26_2.controls, ...JAVA_26_2.progress })) {
    await put(p, resourcePath(id, 'textures/gui/sprites', '.png'), png(48, 48));
  }
  const sliderPath = resourcePath(JAVA_26_2.controls['slider.normal'], 'textures/gui/sprites', '.png');
  await put(later, sliderPath, png(400, 40));
  await put(later, sliderPath + '.mcmeta', { gui: { scaling: { type: 'nine_slice', width: 200, height: 20, border: 1 } } });
  const furnacePath = 'assets/minecraft/textures/gui/container/furnace.png';
  await put(p, furnacePath, png(512, 512));
  const assets = await extractAssets({ clientJar: f.vanilla, out: f.out, packs: [p, later], characters: 'AB?' });
  assert.equal(assets.sprites['checkbox.selected']!.source, 'pack-1');
  assert.equal(assets.sprites['slider.normal']!.source, 'pack-2');
  assert.equal(assets.sprites['slider.normal']!.scaling.type, 'nine_slice');
  assert.equal(assets.sprites['furnace.flame']!.pixelWidth, 48);
  assert.equal(assets.textures!['container.furnace']!.pixelWidth, 512);
  assert.equal(assets.textures!['container.furnace']!.logicalWidth, 256);
  assert.deepEqual(await validateBundle(f.out), assets);
  await put(p, furnacePath, png(256, 128));
  await assert.rejects(extractAssets({ clientJar: f.vanilla, out: f.out, packs: [p], characters: '?' }), /square integer multiple/);
});

test('controls and furnace SSR expose semantic state and reject invalid configurations', async t => {
  const f = await fixture(); t.after(() => rm(f.root, { recursive: true, force: true }));
  const assets = await extractAssets({ clientJar: f.vanilla, out: f.out, characters: 'AB?' });
  const render = (children: React.ReactNode) => renderToString(createElement(MinecraftProvider, { assets, baseUrl: '/subpath/mcui', children }));
  const checkbox = render(createElement(Checkbox, { children: 'A', checked: true, disabled: true, name: 'option' }));
  assert.match(checkbox, /type="checkbox"/); assert.match(checkbox, /checked=""/); assert.match(checkbox, /disabled=""/); assert.match(checkbox, /name="option"/);
  const slider = render(createElement(Slider, { label: 'A', value: 0.5, min: 0, max: 1, step: 0.1 }));
  assert.match(slider, /type="range"/); assert.match(slider, /value="0.5"/); assert.match(slider, /aria-label="A"/);
  assert.match(slider, /class="mcui-slider-handle" style="left:0;transform:translateX\(142px\)"/);
  const furnace = render(createElement(FurnaceScreen, { input: { label: 'A', count: 8 }, output: { label: 'B' }, selectedSlot: { section: 'output', index: 0 }, progress: 0.5, fuelRemaining: 0.75 }));
  assert.equal((furnace.match(/data-mcui-slot=""/g) ?? []).length, 39);
  assert.equal((furnace.match(/aria-pressed="true"/g) ?? []).length, 1);
  assert.equal((furnace.match(/role="progressbar"/g) ?? []).length, 2);
  assert.match(furnace, /aria-label="A, 8"/); assert.doesNotMatch(furnace, /mcui-slot-background|NaN|undefined/);
  for (const props of [{ value: NaN }, { value: 101 }, { value: 0, max: 0 }, { value: 50, step: 0 }, { value: 50, width: 8 }]) {
    assert.throws(() => render(createElement(Slider, { label: 'A', ...props })), /Slider/);
  }
  assert.throws(() => render(createElement(FurnaceScreen, { inventory: Array(37).fill(null) })), /Too many slots/);
  assert.throws(() => render(createElement(ProgressBar, { label: 'A', value: 2 })), /Progress value/);
  const legacy = parseManifest({ ...assets, textures: undefined, sprites: { 'button.normal': assets.sprites['button.normal'], 'button.highlighted': assets.sprites['button.highlighted'], 'button.disabled': assets.sprites['button.disabled'] } });
  for (const child of [createElement(Checkbox, { checked: false, children: 'A' }), createElement(Slider, { label: 'A', value: 50 }), createElement(FurnaceScreen)]) {
    assert.throws(() => renderToString(createElement(MinecraftProvider, { assets: legacy, baseUrl: '/', children: child })), /Re-run mcui-assets/);
  }
});
