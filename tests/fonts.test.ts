import test from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { PNG } from 'pngjs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { launcherFonts } from '../packages/assets/src/launcher-fonts.js';
import { extractFont } from '../packages/assets/src/fonts.js';
import { ImageStore } from '../packages/assets/src/images.js';
import { openSource, Resolver } from '../packages/assets/src/resources.js';
import { fixture, put, zip } from './fixtures.js';

test('launcher font objects override JAR placeholders and verify integrity', async t => {
  const f = await fixture(); t.after(() => rm(f.root, { recursive: true, force: true }));
  const jar = path.join(f.root, 'libraries/com/mojang/minecraft/26.2/minecraft-26.2-client.jar');
  await put(f.root, 'meta/net.minecraft/26.2.json', { assetIndex: { id: '32' } });
  const data = Buffer.from(JSON.stringify({ providers: [{ type: 'space', advances: { '?': 8 } }] }));
  const hash = createHash('sha1').update(data).digest('hex');
  await put(f.root, 'assets/indexes/32.json', { objects: {
    'minecraft/font/default.json': { hash, size: data.length },
    'minecraft/sounds/ignored.ogg': { hash, size: data.length },
  } });
  const object = `assets/objects/${hash.slice(0, 2)}/${hash}`;
  await put(f.root, object, data);
  const fonts = (await launcherFonts(jar))!;
  assert.deepEqual([...fonts.names], ['assets/minecraft/font/default.json']);
  const vanilla = await openSource(f.vanilla, 'vanilla'); t.after(() => vanilla.close());
  const font = await extractFont(new Resolver([{ source: vanilla, prefix: '' }, { source: fonts, prefix: '' }]), new ImageStore(), '?');
  assert.equal(font.glyphs['?']!.advance, 8);
  await put(f.root, object, Buffer.alloc(data.length));
  const corrupted = (await launcherFonts(jar))!;
  await assert.rejects(corrupted.read('assets/minecraft/font/default.json'), /integrity mismatch/);
});

test('Unifont fills missing symbols without replacing Minecraft bitmap glyphs', async t => {
  const f = await fixture(); t.after(() => rm(f.root, { recursive: true, force: true }));
  await put(f.vanilla, 'assets/minecraft/font/default.json', { providers: [
    { type: 'reference', id: 'minecraft:letters' },
    { type: 'reference', id: 'minecraft:unifont' },
  ] });
  await put(f.vanilla, 'assets/minecraft/font/unifont.json', { providers: [
    { type: 'unihex', hex_file: 'minecraft:font/unifont.zip', size_overrides: [
      { from: '★', to: '★', left: 0, right: 15 },
    ] },
  ] });
  await put(f.vanilla, 'assets/minecraft/font/unifont.zip', zip({ 'glyphs.hex': Buffer.from([
    `0041:${'FF'.repeat(16)}`, // Bitmap A must win.
    `2192:${'18'.repeat(16)}`, // 8-bit rows, cropped to two pixels.
    `2605:${'0180'.repeat(16)}`, // Override retains the full 16-pixel cell.
    `1F680:${'000180'.repeat(16)}`, // Supplementary codepoint, 24-bit rows.
    `1F681:${'00000001'.repeat(16)}`, // 32-bit rows.
  ].join('\r\n')) }));
  const source = await openSource(f.vanilla, 'vanilla'); t.after(() => source.close());
  const images = new ImageStore(), resolver = new Resolver([{ source, prefix: '' }]);
  const font = await extractFont(resolver, images, 'A→★🚀🚁');
  assert.equal(font.glyphs.A!.advance, 5);
  assert.equal(font.glyphs['→']!.advance, 2);
  assert.equal(font.glyphs['★']!.advance, 9);
  assert.equal(font.glyphs['🚀']!.advance, 2);
  assert.equal(font.glyphs['🚁']!.advance, 1.5);
  const image = font.glyphs['→']!.image!;
  assert.equal(image.renderHeight, 8); assert.equal(image.ascent, 7);
  assert.equal(image.pixelWidth, 2); assert.equal(image.renderWidth, 1);
  const decoded = PNG.sync.read(images.files.get(image.file)!);
  assert.equal(decoded.data.every(value => value === 255), true);
  const again = new ImageStore();
  assert.deepEqual(await extractFont(resolver, again, 'A→★🚀🚁'), font);
});

test('unihex archives reject malformed masks and unsafe paths', async t => {
  const f = await fixture(); t.after(() => rm(f.root, { recursive: true, force: true }));
  await put(f.vanilla, 'assets/minecraft/font/default.json', { providers: [
    { type: 'unihex', hex_file: 'minecraft:font/unifont.zip' },
  ] });
  for (const [entry, data, error] of [
    ['glyphs.hex', '003F:ABC', /Invalid unihex/],
    ['../glyphs.hex', `003F:${'FF'.repeat(16)}`, /invalid relative path|Unsafe/],
  ] as const) {
    await put(f.vanilla, 'assets/minecraft/font/unifont.zip', zip({ [entry]: Buffer.from(data) }));
    const source = await openSource(f.vanilla, 'vanilla');
    try { await assert.rejects(extractFont(new Resolver([{ source, prefix: '' }]), new ImageStore(), '?'), error); }
    finally { source.close(); }
  }
});
