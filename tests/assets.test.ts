import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rm, writeFile, symlink } from 'node:fs/promises';
import path from 'node:path';
import { extractAssets, validateBundle, listInstallations } from '../packages/assets/src/index.js';
import { openSource } from '../packages/assets/src/resources.js';
import { fixture, pack, png, put, buttonPath, zip } from './fixtures.js';

test('extracts measured glyphs and writes reproducible, self-contained bundles', async t => {
  const f = await fixture(); t.after(() => rm(f.root, { recursive: true, force: true }));
  const options = { clientJar: f.vanilla, out: f.out, characters: ' AB?' };
  const manifest = await extractAssets(options);
  assert.equal(manifest.font.glyphs.A!.advance, 5);
  assert.equal(manifest.font.glyphs.B!.advance, 6);
  assert.equal(manifest.font.glyphs[' ']!.advance, 4);
  const first = await readFile(path.join(f.out, 'manifest.json'), 'utf8');
  assert.equal(first.includes(f.root), false);
  await extractAssets(options);
  assert.equal(await readFile(path.join(f.out, 'manifest.json'), 'utf8'), first);
  assert.deepEqual(await validateBundle(f.out), manifest);
});

test('later ZIP packs override images and preserve logical high-resolution sizing', async t => {
  const f = await fixture(); t.after(() => rm(f.root, { recursive: true, force: true }));
  const a = await pack(f.root, 'a'); await put(a, buttonPath, png(12, 8, [255, 0, 0, 255]));
  const b = path.join(f.root, 'b.zip'); await writeFile(b, zip({ 'pack.mcmeta': Buffer.from(JSON.stringify({ pack: { min_format: [88, 0], max_format: [88], description: 'fixture' } })), [buttonPath]: png(24, 16), [buttonPath + '.mcmeta']: Buffer.from(JSON.stringify(f.metadata)) }));
  const m = await extractAssets({ clientJar: f.vanilla, out: f.out, packs: [a, b], characters: 'A?' });
  assert.equal(m.sprites['button.normal'].source, 'pack-2');
  assert.equal(m.sprites['button.normal'].pixelWidth, 24);
  assert.equal(m.sprites['button.normal'].scaling.type, 'nine_slice');
  assert.equal(m.sprites['button.disabled'].source, 'vanilla');
});

test('image replacements do not inherit lower pack metadata; metadata-only overrides work', async t => {
  const f = await fixture(); t.after(() => rm(f.root, { recursive: true, force: true }));
  const a = await pack(f.root, 'a'); await put(a, buttonPath, png(12, 8));
  const options = { clientJar: f.vanilla, out: f.out, packs: [a], characters: '?' };
  assert.equal((await extractAssets(options)).sprites['button.normal'].scaling.type, 'stretch');
  const b = await pack(f.root, 'b'); await put(b, buttonPath + '.mcmeta', f.metadata);
  assert.equal((await extractAssets({ ...options, packs: [a, b] })).sprites['button.normal'].scaling.type, 'nine_slice');
});

test('compatible overlays override base resources and retain same-pack metadata', async t => {
  const f = await fixture(); t.after(() => rm(f.root, { recursive: true, force: true }));
  const p = await pack(f.root);
  await put(p, 'pack.mcmeta', { pack: { min_format: 88, max_format: 88 }, overlays: { entries: [
    { directory: 'active', min_format: 88, max_format: 88 }, { directory: 'future', min_format: [88, 1], max_format: 89 },
  ] } });
  await put(p, buttonPath + '.mcmeta', f.metadata);
  await put(p, 'active/' + buttonPath, png(24, 16));
  await put(p, 'future/' + buttonPath, png(48, 32));
  const m = await extractAssets({ clientJar: f.vanilla, out: f.out, packs: [p], characters: '?' });
  assert.equal(m.sprites['button.normal'].pixelWidth, 24);
  assert.equal(m.sprites['button.normal'].scaling.type, 'nine_slice');
});

test('font providers stack across packs, with custom advances taking priority', async t => {
  const f = await fixture(); t.after(() => rm(f.root, { recursive: true, force: true }));
  const p = await pack(f.root);
  await put(p, 'assets/minecraft/font/default.json', { providers: [{ type: 'space', advances: { A: 17 } }] });
  const m = await extractAssets({ clientJar: f.vanilla, out: f.out, packs: [p], characters: 'AB?' });
  assert.equal(m.font.glyphs.A!.advance, 17); assert.equal(m.font.glyphs.B!.advance, 6);
});

test('rejects cyclic fonts and unsupported required providers', async t => {
  const f = await fixture(); t.after(() => rm(f.root, { recursive: true, force: true }));
  await put(f.vanilla, 'assets/minecraft/font/letters.json', { providers: [{ type: 'reference', id: 'minecraft:default' }] });
  const options = { clientJar: f.vanilla, out: f.out, characters: '?' };
  await assert.rejects(extractAssets(options), /Cyclic/);
  await put(f.vanilla, 'assets/minecraft/font/letters.json', { providers: [{ type: 'ttf' }] });
  await assert.rejects(extractAssets(options), /ttf/);
});

test('rejects incompatible versions, filtering, atlas changes and animated buttons', async t => {
  const f = await fixture(); t.after(() => rm(f.root, { recursive: true, force: true }));
  const options = { clientJar: f.vanilla, out: f.out, characters: '?' };
  await assert.rejects(extractAssets({ ...options, version: '1.21.8' }), /Only Java 26.2/);
  const p = await pack(f.root);
  await put(p, 'pack.mcmeta', { pack: { min_format: 89, max_format: 89 } });
  await assert.rejects(extractAssets({ ...options, packs: [p] }), /does not support/);
  await put(p, 'pack.mcmeta', { pack: { min_format: 88, max_format: 88 }, filter: {} });
  await assert.rejects(extractAssets({ ...options, packs: [p] }), /filtering/);
  await pack(f.root); await put(p, 'assets/minecraft/atlases/gui.json', { sources: [] });
  await assert.rejects(extractAssets({ ...options, packs: [p] }), /atlas/);
  await put(f.vanilla, buttonPath + '.mcmeta', { animation: {} });
  await assert.rejects(extractAssets(options), /Animated/);
});

test('rejects ZIP traversal, directory symlinks, corrupt images and oversized headers', async t => {
  const f = await fixture(); t.after(() => rm(f.root, { recursive: true, force: true }));
  const bad = path.join(f.root, 'bad.zip'); await writeFile(bad, zip({ '../outside': Buffer.from('no') }));
  await assert.rejects(openSource(bad, 'bad'), /invalid relative path|Unsafe/);
  const p = await pack(f.root); await symlink(f.vanilla, path.join(p, 'linked'));
  await assert.rejects(openSource(p, 'pack'), /Symbolic links/);
  await put(f.vanilla, buttonPath, Buffer.from('not PNG'));
  const options = { clientJar: f.vanilla, out: f.out, characters: '?' };
  await assert.rejects(extractAssets(options), /Expected PNG/);
  const enormous = png(1, 1); enormous.writeUInt32BE(9000, 16); await put(f.vanilla, buttonPath, enormous);
  await assert.rejects(extractAssets(options), /dimensions exceed/);
});

test('preserves unmanaged output and detects asset tampering', async t => {
  const f = await fixture(); t.after(() => rm(f.root, { recursive: true, force: true }));
  const options = { clientJar: f.vanilla, out: f.out, characters: '?' };
  await put(f.out, 'keep.json', { valuable: true });
  await assert.rejects(extractAssets(options), /unmanaged/);
  assert.match(await readFile(path.join(f.out, 'keep.json'), 'utf8'), /valuable/);
  await rm(f.out, { recursive: true });
  const m = await extractAssets(options);
  await writeFile(path.join(f.out, m.sprites['button.normal'].file), png(1, 1));
  await assert.rejects(validateBundle(f.out), /hash mismatch/);
});

test('discovers Prism and official launcher JAR layouts without reading accounts', async t => {
  const f = await fixture(); t.after(() => rm(f.root, { recursive: true, force: true }));
  await put(f.root, 'libraries/com/mojang/minecraft/26.2/minecraft-26.2-client.jar', Buffer.from('fixture'));
  await put(f.root, 'versions/1.21.8/1.21.8.jar', Buffer.from('fixture'));
  const found = await listInstallations(f.root);
  assert.equal(found.length, 2); assert.equal(found.filter(x => x.supported).length, 1);
});
