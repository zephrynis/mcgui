import test from 'node:test';
import assert from 'node:assert/strict';
import { resourcePath, spriteSlices, scalingSchema, type SpriteAsset } from '../packages/core/src/index.js';

const sprite: SpriteAsset = { id: 'fixture', file: `files/${'a'.repeat(64)}.png`, pixelWidth: 24, pixelHeight: 16, source: 'fixture',
  scaling: { type: 'nine_slice', width: 12, height: 8, border: { left: 2, right: 2, top: 2, bottom: 2 }, stretchInner: false } };
test('nine-slice preserves high-resolution corners and clips partial tiles', () => {
  const slices = spriteSlices(sprite, 17, 11);
  assert.deepEqual(slices[0], { sx: 0, sy: 0, sw: 4, sh: 4, x: 0, y: 0, width: 2, height: 2 });
  assert.ok(slices.some(slice => slice.x === 10 && slice.y === 2 && slice.width === 5 && slice.sw === 10));
  assert.equal(slices.reduce((area, slice) => area + slice.width * slice.height, 0), 17 * 11);
  for (let y = 0; y < 11; y++) for (let x = 0; x < 17; x++) assert.equal(slices.filter(s => x >= s.x && y >= s.y && x < s.x + s.width && y < s.y + s.height).length, 1);
});
test('exact dimensions preserve the complete original sprite', () => {
  assert.deepEqual(spriteSlices(sprite, 12, 8), [{ sx: 0, sy: 0, sw: 24, sh: 16, x: 0, y: 0, width: 12, height: 8 }]);
});
test('tiny destinations clip corner source regions without stretching them', () => {
  const slices = spriteSlices(sprite, 2, 2);
  assert.equal(slices.length, 4); assert.equal(slices[0]!.sw, 2); assert.equal(slices[0]!.width, 1);
});
test('tile mode clips the final tile and stretch mode has a single region', () => {
  const tiled = spriteSlices({ ...sprite, scaling: { type: 'tile', width: 12, height: 8 } }, 15, 9);
  assert.equal(tiled.length, 4); assert.equal(tiled[3]!.width, 3); assert.equal(tiled[3]!.height, 1);
  assert.equal(spriteSlices({ ...sprite, scaling: { type: 'stretch' } }, 100, 20).length, 1);
});
test('rejects invalid IDs, dimensions, borders and excessive tile counts', () => {
  assert.equal(resourcePath('widget/button', 'textures/gui/sprites', '.png'), 'assets/minecraft/textures/gui/sprites/widget/button.png');
  assert.throws(() => resourcePath('minecraft:../escape', 'textures', '.png'));
  assert.throws(() => spriteSlices(sprite, 0, 20));
  assert.throws(() => scalingSchema.parse({ ...sprite.scaling, border: { left: 8, right: 8, top: 0, bottom: 0 } }));
  assert.throws(() => spriteSlices({ ...sprite, scaling: { type: 'tile', width: 1, height: 1 } }, 8192, 8192), /too many tiles/);
});
