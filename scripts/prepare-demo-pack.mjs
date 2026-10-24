import { mkdir, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';
import { extractAssets, listInstallations } from '@mcgui/assets';

// Entirely original procedural artwork, used to verify resource-pack replacement.
const root = path.resolve('.local/demo-pack');
const directory = path.join(root, 'assets/minecraft/textures/gui/sprites/widget');
await mkdir(directory, { recursive: true });
await writeFile(path.join(root, 'pack.mcmeta'), JSON.stringify({ pack: { min_format: [88, 0], max_format: 88, description: 'MCGUI original moss test textures' } }, null, 2));
for (const state of ['', '_highlighted', '_disabled']) {
  const png = new PNG({ width: 400, height: 40 });
  for (let y = 0; y < 40; y++) for (let x = 0; x < 400; x++) {
    let color = state === '_disabled' ? [36, 52, 38] : [69, 104, 65];
    if (x < 2 || y < 2 || x >= 398 || y >= 38) color = state === '_highlighted' ? [214, 237, 174] : [20, 36, 23];
    else if (x < 6 || y < 6) color = [122, 156, 89];
    else if (x >= 394 || y >= 34) color = [36, 64, 42];
    else if ((x + y * 7) % 19 < 4) color = color.map(channel => channel + 7);
    const offset = (y * 400 + x) * 4;
    png.data.set([...color, 255], offset);
  }
  await writeFile(path.join(directory, `button${state}.png`), PNG.sync.write(png));
  await writeFile(path.join(directory, `button${state}.png.mcmeta`), JSON.stringify({ gui: { scaling: { type: 'nine_slice', width: 200, height: 20, border: 3 } } }));
}
// An original 2× chest sheet with the same logical regions as the Java layout.
const sheet = new PNG({ width: 512, height: 512 });
function rect(image, x, y, width, height, color, resolution = 2) {
  for (let py = y * resolution; py < (y + height) * resolution; py++) for (let px = x * resolution; px < (x + width) * resolution; px++) {
    image.data.set(color, (py * image.width + px) * 4);
  }
}
rect(sheet, 0, 0, 176, 222, [37, 57, 33, 255]);
rect(sheet, 1, 1, 174, 220, [215, 228, 189, 255]);
rect(sheet, 3, 3, 170, 216, [166, 189, 143, 255]);
function drawSlot(image, x, y) {
  rect(image, x, y, 18, 18, [214, 226, 189, 255]);
  rect(image, x, y, 17, 17, [62, 86, 53, 255]);
  rect(image, x + 1, y + 1, 16, 16, [116, 143, 94, 255]);
}
for (const [startY, rows] of [[17, 6], [139, 3], [197, 1]]) for (let row = 0; row < rows; row++) for (let col = 0; col < 9; col++) drawSlot(sheet, 7 + col * 18, startY + row * 18);
const containerDirectory = path.join(root, 'assets/minecraft/textures/gui/container');
await mkdir(containerDirectory, { recursive: true });
await writeFile(path.join(containerDirectory, 'generic_54.png'), PNG.sync.write(sheet));
const slotDirectory = path.join(root, 'assets/minecraft/textures/gui/sprites/container');
await mkdir(slotDirectory, { recursive: true });
const slot = new PNG({ width: 36, height: 36 }); drawSlot(slot, 0, 0);
await writeFile(path.join(slotDirectory, 'slot.png'), PNG.sync.write(slot));
const tooltipDirectory = path.join(root, 'assets/minecraft/textures/gui/sprites/tooltip');
await mkdir(tooltipDirectory, { recursive: true });
for (const name of ['background', 'frame']) {
  const image = new PNG({ width: 200, height: 200 });
  if (name === 'background') rect(image, 9, 9, 82, 82, [12, 25, 11, 245]);
  else {
    rect(image, 9, 9, 82, 1, [166, 214, 109, 255]); rect(image, 9, 90, 82, 1, [66, 101, 46, 255]);
    rect(image, 9, 10, 1, 80, [113, 157, 76, 255]); rect(image, 90, 10, 1, 80, [113, 157, 76, 255]);
  }
  await writeFile(path.join(tooltipDirectory, `${name}.png`), PNG.sync.write(image));
  await writeFile(path.join(tooltipDirectory, `${name}.png.mcmeta`), JSON.stringify({ gui: { scaling: { type: 'nine_slice', width: 100, height: 100, border: name === 'background' ? 9 : 10, stretch_inner: name === 'frame' } } }));
}
// Original settings controls at twice their logical resolution.
for (const name of ['checkbox', 'checkbox_highlighted', 'checkbox_selected', 'checkbox_selected_highlighted', 'slider', 'slider_highlighted', 'slider_handle', 'slider_handle_highlighted']) {
  const checkbox = name.startsWith('checkbox'), handle = name.includes('handle');
  const width = checkbox ? 17 : handle ? 8 : 200, height = checkbox ? 17 : 20;
  const image = new PNG({ width: width * 2, height: height * 2 });
  rect(image, 0, 0, width, height, name.includes('highlighted') ? [219, 239, 161, 255] : [28, 46, 25, 255]);
  rect(image, 1, 1, width - 2, height - 2, [121, 157, 83, 255]);
  rect(image, 2, 2, width - 4, height - 4, [52, 79, 44, 255]);
  if (name.includes('selected')) {
    rect(image, 4, 7, 3, 5, [223, 244, 155, 255]);
    rect(image, 7, 9, 3, 3, [223, 244, 155, 255]);
    rect(image, 10, 4, 3, 8, [223, 244, 155, 255]);
  }
  await writeFile(path.join(directory, `${name}.png`), PNG.sync.write(image));
  if (!checkbox) await writeFile(path.join(directory, `${name}.png.mcmeta`), JSON.stringify({ gui: { scaling: { type: 'nine_slice', width, height, border: handle ? 2 : 1 } } }));
}
const furnace = new PNG({ width: 512, height: 512 });
rect(furnace, 0, 0, 176, 166, [37, 57, 33, 255]);
rect(furnace, 1, 1, 174, 164, [215, 228, 189, 255]);
rect(furnace, 3, 3, 170, 160, [166, 189, 143, 255]);
for (const [x, y] of [[55, 16], [55, 52], [115, 34]]) drawSlot(furnace, x, y);
for (const [y, rows] of [[83, 3], [141, 1]]) for (let row = 0; row < rows; row++) for (let col = 0; col < 9; col++) drawSlot(furnace, 7 + col * 18, y + row * 18);
rect(furnace, 79, 38, 21, 8, [83, 107, 65, 255]);
rect(furnace, 56, 36, 14, 14, [83, 107, 65, 255]);
await writeFile(path.join(containerDirectory, 'furnace.png'), PNG.sync.write(furnace));
for (const [name, width, height] of [['hud/experience_bar_background', 182, 5], ['hud/experience_bar_progress', 182, 5], ['container/furnace/burn_progress', 24, 16], ['container/furnace/lit_progress', 14, 14]]) {
  const image = new PNG({ width: width * 2, height: height * 2 });
  if (name.includes('burn_progress')) {
    rect(image, 0, 4, 17, 8, [232, 211, 130, 255]);
    for (let x = 17; x < 24; x++) rect(image, x, x - 17 + 1, 1, 14 - (x - 17) * 2, [232, 211, 130, 255]);
  } else if (name.includes('lit_progress')) {
    for (let x = 0; x < 14; x++) rect(image, x, Math.abs(x - 6), 1, 14 - Math.abs(x - 6), [232, 162, 76, 255]);
  } else {
    rect(image, 0, 0, width, height, name.includes('background') ? [32, 52, 27, 255] : [187, 226, 118, 255]);
    rect(image, 1, 1, width - 2, height - 2, name.includes('background') ? [68, 91, 45, 255] : [117, 163, 72, 255]);
  }
  const target = path.join(root, 'assets/minecraft/textures/gui/sprites', `${name}.png`);
  await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, PNG.sync.write(image));
}
// Creative sheets retain their fixed 195×136 GUI region at 2× resolution.
const creativeDirectory = path.join(containerDirectory, 'creative_inventory');
await mkdir(creativeDirectory, { recursive: true });
for (const name of ['tab_items', 'tab_item_search', 'tab_inventory']) {
  const image = new PNG({ width: 512, height: 512 });
  rect(image, 0, 0, 195, 136, [37, 57, 33, 255]);
  rect(image, 1, 1, 193, 134, [215, 228, 189, 255]);
  rect(image, 3, 3, 189, 130, [166, 189, 143, 255]);
  const inventory = name === 'tab_inventory';
  for (let row = 0; row < (inventory ? 3 : 5); row++) for (let col = 0; col < 9; col++) drawSlot(image, 8 + col * 18, (inventory ? 53 : 17) + row * 18);
  for (let col = 0; col < 9; col++) drawSlot(image, 8 + col * 18, 111);
  if (inventory) {
    for (const [x, y] of [[53, 5], [53, 32], [107, 5], [107, 32], [34, 19], [172, 111]]) drawSlot(image, x, y);
    rect(image, 72, 5, 33, 45, [27, 39, 24, 255]);
    for (let i = 0; i < 10; i++) { rect(image, 176 + i, 115 + i, 1, 1, [125, 55, 43, 255]); rect(image, 185 - i, 115 + i, 1, 1, [125, 55, 43, 255]); }
  } else rect(image, 174, 17, 14, 112, [64, 83, 52, 255]);
  if (name === 'tab_item_search') rect(image, 80, 4, 90, 12, [51, 71, 42, 255]);
  await writeFile(path.join(creativeDirectory, `${name}.png`), PNG.sync.write(image));
}
const creativeSprites = path.join(slotDirectory, 'creative_inventory');
await mkdir(creativeSprites, { recursive: true });
for (const row of ['top', 'bottom']) for (const state of ['selected', 'unselected']) for (let column = 1; column <= 7; column++) {
  const image = new PNG({ width: 52, height: 64 });
  rect(image, 0, 0, 26, 32, [37, 57, 33, 255]);
  rect(image, 1, 1, 24, 30, [215, 228, 189, 255]);
  rect(image, 3, 3, 20, 26, state === 'selected' ? [166, 189, 143, 255] : [114, 143, 93, 255]);
  if (state === 'selected') rect(image, 3, row === 'top' ? 28 : 0, 20, 4, [166, 189, 143, 255]);
  await writeFile(path.join(creativeSprites, `tab_${row}_${state}_${column}.png`), PNG.sync.write(image));
}
for (const name of ['scroller', 'scroller_disabled']) {
  const image = new PNG({ width: 24, height: 30 });
  rect(image, 0, 0, 12, 15, [37, 57, 33, 255]);
  rect(image, 1, 1, 10, 13, name === 'scroller' ? [215, 228, 189, 255] : [92, 113, 75, 255]);
  rect(image, 2, 2, 8, 11, name === 'scroller' ? [166, 189, 143, 255] : [77, 96, 62, 255]);
  await writeFile(path.join(creativeSprites, `${name}.png`), PNG.sync.write(image));
}
const installed = (await listInstallations()).filter(item => item.version === '26.2');
const clientJar = process.env.MCGUI_CLIENT_JAR ?? (installed.length === 1 ? installed[0].clientJar : undefined);
if (!clientJar) throw new Error('Set MCGUI_CLIENT_JAR to your 26.2 client JAR.');
// Remove the obsolete generated gem override; items keep their real game textures.
await unlink(path.join(root, 'assets/minecraft/textures/item/diamond.png')).catch(error => {
  if (error.code !== 'ENOENT') throw error;
});
await extractAssets({ clientJar, packs: [root], out: 'apps/storybook/public/mcgui-pack',items:true,java:process.env.MCGUI_JAVA,catalogueFile:process.env.MCGUI_CATALOGUE_FILE });
console.log('Prepared original demo pack and local Storybook bundle.');
