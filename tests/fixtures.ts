import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { JAVA_26_2, resourcePath } from '../packages/core/src/index.js';

export const buttonPath = 'assets/minecraft/textures/gui/sprites/widget/button.png';
export function png(width: number, height: number, color = [80, 130, 190, 255]): Buffer {
  const image = new PNG({ width, height });
  for (let i = 0; i < width * height; i++) for (let c = 0; c < 4; c++) image.data[i * 4 + c] = color[c]!;
  return PNG.sync.write(image);
}
export async function put(root: string, name: string, value: unknown): Promise<void> {
  const target = path.join(root, name); await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, Buffer.isBuffer(value) ? value : JSON.stringify(value));
}
export async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'mcui-test-'));
  const vanilla = path.join(root, 'vanilla');
  await put(vanilla, 'version.json', { id: '26.2', pack_version: { resource_major: 88, resource_minor: 0 } });
  const metadata = { gui: { scaling: { type: 'nine_slice', width: 12, height: 8, border: 2 } } };
  for (const state of ['', '_highlighted', '_disabled']) {
    const file = buttonPath.replace('.png', `${state}.png`);
    await put(vanilla, file, png(12, 8)); await put(vanilla, file + '.mcmeta', metadata);
  }
  for (const name of ['container/slot', 'container/slot_highlight_back', 'container/slot_highlight_front', 'tooltip/background', 'tooltip/frame']) {
    await put(vanilla, `assets/minecraft/textures/gui/sprites/${name}.png`, png(24, 24));
  }
  await put(vanilla, 'assets/minecraft/textures/gui/container/generic_54.png', png(256, 256));
  await put(vanilla, 'assets/minecraft/textures/gui/container/furnace.png', png(256, 256));
  await put(vanilla, 'assets/minecraft/textures/misc/enchanted_glint_item.png', png(128,128,[80,30,150,255]));
  for (const [role, id] of Object.entries(JAVA_26_2.containers)) await put(vanilla, resourcePath(id, 'textures', '.png'), png(role === 'container.villager' ? 512 : 256, 256));
  for (const id of Object.values({ ...JAVA_26_2.controls, ...JAVA_26_2.progress, ...JAVA_26_2.creative, ...JAVA_26_2.villager })) {
    await put(vanilla, resourcePath(id, 'textures/gui/sprites', '.png'), png(24, 24));
  }
  await put(vanilla, 'assets/minecraft/font/default.json', { providers: [
    { type: 'space', advances: { ' ': 4 } },
    { type: 'reference', id: 'minecraft:letters' },
  ] });
  await put(vanilla, 'assets/minecraft/font/letters.json', { providers: [{ type: 'bitmap', file: 'minecraft:font/test.png', ascent: 7, chars: ['?AB'] }] });
  const font = new PNG({ width: 24, height: 8 });
  for (let c = 0; c < 3; c++) for (let x = 0; x < c + 3; x++) for (let y = 0; y < 7; y++) font.data.fill(255, (y * 24 + c * 8 + x) * 4, (y * 24 + c * 8 + x) * 4 + 4);
  await put(vanilla, 'assets/minecraft/textures/font/test.png', PNG.sync.write(font));
  return { root, vanilla, out: path.join(root, 'out'), metadata };
}
export async function pack(root: string, name = 'pack') {
  const directory = path.join(root, name);
  await put(directory, 'pack.mcmeta', { pack: { min_format: 88, max_format: 88, description: 'Original MCUI test fixture' } });
  return directory;
}

/** Tiny uncompressed ZIP writer for original test fixtures, including malicious path tests. */
export function zip(files: Record<string, Buffer>): Buffer {
  const local: Buffer[] = [], central: Buffer[] = []; let offset = 0;
  for (const [name, data] of Object.entries(files)) {
    const filename = Buffer.from(name); let crc = 0xffffffff;
    for (const byte of data) { crc ^= byte; for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
    crc = (crc ^ 0xffffffff) >>> 0;
    const header = Buffer.alloc(30); header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(data.length, 18); header.writeUInt32LE(data.length, 22); header.writeUInt16LE(filename.length, 26);
    local.push(header, filename, data);
    const entry = Buffer.alloc(46); entry.writeUInt32LE(0x02014b50); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6); entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(data.length, 20); entry.writeUInt32LE(data.length, 24); entry.writeUInt16LE(filename.length, 28); entry.writeUInt32LE(offset, 42);
    central.push(entry, filename); offset += header.length + filename.length + data.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(central.length / 2, 8); end.writeUInt16LE(central.length / 2, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}
