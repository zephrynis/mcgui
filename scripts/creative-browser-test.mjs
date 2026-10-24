import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { PNG } from 'pngjs';
import { chromium } from 'playwright';

const url = process.env.MCGUI_TEST_URL ?? 'http://127.0.0.1:5173/iframe.html?id=examples-inventory-workbench--interactive&viewMode=story';
const executablePath = process.env.MCGUI_CHROME ?? execFileSync('which', ['google-chrome'], { encoding: 'utf8' }).trim();
const browser = await chromium.launch({ executablePath, headless: true });
const evidence = path.join(tmpdir(), 'mcgui-creative');
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 }), errors = [];
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (['error', 'warning'].includes(message.type())) errors.push(message.text()); });
  page.on('response', response => { if (response.url().includes('/files/') && response.headers()['content-type'] !== 'image/png') errors.push(`Missing texture: ${response.url()}`); });
  await page.goto(url); assert.equal(page.url(), url); await page.getByRole('heading', { name: 'Inventory workbench', exact: true }).waitFor();
  const screen = page.locator('.mcgui-creative'), cursor = page.locator('.mcgui-carried-stack');
  const tab = name => screen.getByRole('tab', { name, exact: true });
  const catalogue = screen.getByRole('group', { name: 'Creative items', exact: true });
  const cell = name => catalogue.getByRole('button', { name, exact: true });
  const hotbar = screen.getByRole('group', { name: 'Creative hotbar', exact: true });
  const hot = index => hotbar.getByRole('button').nth(index);
  const scrollbar = screen.getByRole('scrollbar');
  const search = screen.getByRole('textbox', { name: 'Search items', exact: true });
  const carrying = async count => count ? assert.equal(await cursor.getAttribute('data-count'), String(count)) : assert.equal(await cursor.count(), 0);
  await screen.scrollIntoViewIfNeeded();
  assert.equal(await screen.getByRole('tab').count(), 13); assert.equal(await catalogue.getByRole('button').count(), 45);
  assert.equal(await tab('Building Blocks').getAttribute('aria-selected'), 'true');
  assert.equal(await scrollbar.getAttribute('aria-disabled'), 'false');
  const first = await catalogue.getByRole('button').first().getAttribute('aria-label');
  assert.equal(first,'Oak Log');
  assert.equal(await cell('Oak Planks').locator('img').count(),1);
  // Mouse tab activation must commit on press, before the user releases it.
  const coloredTab = await tab('Colored Blocks').boundingBox();
  await page.mouse.move(coloredTab.x + coloredTab.width / 2, coloredTab.y + coloredTab.height / 2);
  await page.mouse.down();
  assert.equal(await tab('Colored Blocks').getAttribute('aria-selected'), 'true');
  assert.equal(await cell('White Wool').count(), 1);
  await page.mouse.up();
  await tab('Building Blocks').click();
  await catalogue.hover(); const pageY = await page.evaluate(() => scrollY); await page.mouse.wheel(0, 90);
  await page.waitForFunction(() => document.querySelector('.mcgui-creative [role="scrollbar"]').getAttribute('aria-valuenow') === '1');
  assert.equal(await page.evaluate(() => scrollY), pageY);
  assert.notEqual(await catalogue.getByRole('button').first().getAttribute('aria-label'), first);
  await scrollbar.press('End'); assert.equal(await scrollbar.getAttribute('aria-valuenow'), await scrollbar.getAttribute('aria-valuemax'));
  await scrollbar.press('Home'); assert.equal(await catalogue.getByRole('button').first().getAttribute('aria-label'), first);
  const track = await scrollbar.boundingBox();
  await page.mouse.move(track.x + track.width / 2, track.y + 5); await page.mouse.down();
  await page.mouse.move(track.x + track.width / 2, track.y + track.height - 1); await page.mouse.up();
  assert.equal(await scrollbar.getAttribute('aria-valuenow'), await scrollbar.getAttribute('aria-valuemax'));
  await scrollbar.press('Home');
  await cell('Oak Planks').press('PageDown'); assert.equal(await scrollbar.getAttribute('aria-valuenow'), '5');
  await scrollbar.press('Home');

  await cell('Oak Planks').click(); await carrying(1);
  await cell('Oak Planks').click(); await carrying(2);
  await cell('Oak Planks').click({ button: 'right' }); await carrying(1);
  await cell('Oak Planks').click({ modifiers: ['Shift'] }); await carrying(64);
  await hot(3).click(); await carrying(0); assert.equal(await hot(3).getAttribute('aria-label'), 'Oak Planks, 64');
  assert.equal(await page.locator('.mcgui-chest [data-mcgui-cell="84"]').getAttribute('aria-label'), 'Oak Planks, 64');
  assert.equal(await cell('Oak Planks').count(), 1); // catalogue never consumes stock
  await hot(4).press('Space'); await hot(4).click(); await page.mouse.move(0, 0);
  assert.equal(await hot(4).locator('.mcgui-slot-highlight').first().evaluate(el => getComputedStyle(el).visibility), 'hidden');

  await tab('Search Items').click(); assert.equal(await search.evaluate(el => el === document.activeElement), true);
  // One-row scrolling rotates the existing pool and changes only nine items.
  await catalogue.getByRole('button').first().hover();
  await page.getByRole('tooltip').waitFor();
  await catalogue.evaluate(element => {
    window.creativeCellsBefore = [...element.querySelectorAll('button')];
    window.creativeIconsBefore = window.creativeCellsBefore.map(cell => cell.querySelector('img').src);
  });
  await page.mouse.wheel(0, 100);
  await page.waitForFunction(() => document.querySelector('.mcgui-creative [role="scrollbar"]').getAttribute('aria-valuenow') === '1');
  assert.equal(await catalogue.evaluate(element => [...element.querySelectorAll('button')].every((cell, index) => cell === window.creativeCellsBefore[(index + 9) % 45])), true);
  assert.equal(await catalogue.evaluate(element => [...element.querySelectorAll('button')].slice(0, 36).every((cell, index) => cell.querySelector('img').src === window.creativeIconsBefore[index + 9])), true);
  const firstScrolledLabel = await catalogue.getByRole('button').first().getAttribute('aria-label');
  assert.ok((await page.getByRole('tooltip').textContent()).startsWith(firstScrolledLabel));
  await catalogue.getByRole('button').first().press('PageDown');
  assert.equal(await scrollbar.getAttribute('aria-valuenow'), '6');
  assert.equal(await catalogue.getByRole('button').first().evaluate(element => element === document.activeElement), true);
  await catalogue.getByRole('button').first().press('ArrowRight');
  const scrolledItem = catalogue.getByRole('button').nth(1);
  assert.equal(await scrolledItem.evaluate(element => element === document.activeElement), true);
  const scrolledLabel = await scrolledItem.getAttribute('aria-label');
  await scrolledItem.press('3');
  assert.ok((await hot(2).getAttribute('aria-label')).startsWith(scrolledLabel));
  await scrollbar.press('Home');
  await search.fill('DIAMOND'); assert.equal(await cell('Diamond').count(), 1); assert.equal(await cell('Diamond Sword').count(), 1);
  assert.equal(await scrollbar.getAttribute('aria-disabled'), 'true');
  await search.fill('#minecraft:planks'); assert.equal(await catalogue.getByRole('button', { name: /Planks$/ }).count(), 12);
  assert.match(await catalogue.getByRole('button').first().getAttribute('aria-label'), /Planks/);
  await search.fill('does not exist'); assert.match(await screen.getByRole('status').first().textContent(), /No matching items/);
  await search.fill('Frost Walker');assert.ok(await catalogue.getByRole('button',{name:'Enchanted Book',exact:true}).count()>0);
  await search.press('Escape'); assert.equal(await search.inputValue(), '');
  await search.fill('diamond'); await search.press('Control+A'); await page.keyboard.insertText('oak');
  assert.equal(await search.inputValue(), 'oak'); assert.equal(await cell('Oak Planks').count(), 1);
  await search.fill('diamond'); await page.mouse.move(0, 0); await screen.screenshot({ path: `${evidence}-search.png` });
  await cell('Diamond').click({ button: 'middle' }); await carrying(64);
  await hot(4).click({ button: 'right' }); await carrying(63); assert.equal(await hot(4).getAttribute('aria-label'), 'Diamond');
  await tab('Survival Inventory').click(); assert.equal(await scrollbar.count(), 0);
  assert.equal(await screen.getByRole('group', { name: 'Creative player inventory', exact: true }).getByRole('button').count(), 27);
  await screen.getByRole('button', { name: 'Destroy item', exact: true }).click(); await carrying(0);
  assert.equal(await hot(3).getAttribute('aria-label'), 'Oak Planks, 64'); // ordinary delete keeps inventory
  await hot(3).click(); await carrying(64); await screen.getByRole('button', { name: 'Destroy item', exact: true }).click(); await carrying(0);
  await page.mouse.move(0, 0); await screen.screenshot({ path: `${evidence}-inventory.png` });
  await screen.getByRole('button', { name: 'Destroy item', exact: true }).click({ modifiers: ['Shift'] });
  assert.ok((await hotbar.getByRole('button').evaluateAll(es => es.map(e => e.getAttribute('aria-label')))).every(label => label.startsWith('Empty')));
  assert.equal(await page.locator('.mcgui-furnace [data-mcgui-cell="90"]').getAttribute('aria-label'), 'Raw Iron, 8');

  await tab('Search Items').click(); await search.fill('diamond');
  await cell('Diamond').press('1'); await carrying(0); assert.equal(await hot(0).getAttribute('aria-label'), 'Diamond, 64');
  await page.keyboard.down('c'); await page.keyboard.press('1'); await page.keyboard.up('c');
  await tab('Building Blocks').click();
  await cell('Oak Planks').press('1'); assert.equal(await hot(0).getAttribute('aria-label'), 'Oak Planks, 64');
  await page.keyboard.down('x'); await page.keyboard.press('1'); await page.keyboard.up('x');
  assert.equal(await hot(0).getAttribute('aria-label'), 'Diamond, 64');
  await tab('Saved Hotbars').click(); assert.equal(await screen.getByRole('group', { name: 'Saved hotbar items', exact: true }).getByRole('button').first().getAttribute('aria-label'), 'Diamond');
  await tab('Tools & Utilities').click(); await cell('Diamond Pickaxe').click({ modifiers: ['Shift'] }); await carrying(1); await hot(1).click(); await carrying(0);
  await hot(1).click({ modifiers: ['Shift'] }); assert.match(await hot(1).getAttribute('aria-label'), /^Empty/); await carrying(0);
  await tab('Combat').click(); await cell('Diamond Helmet').click(); await carrying(1);
  await tab('Survival Inventory').click();
  await screen.getByRole('button', { name: 'Empty creative armor slot 2', exact: true }).click(); await carrying(1);
  await screen.getByRole('button', { name: 'Empty creative armor slot 1', exact: true }).click(); await carrying(0);
  assert.equal(await screen.getByRole('button', { name: 'Diamond Helmet', exact: true }).count(), 1);
  await tab('Tools & Utilities').press('ArrowRight'); assert.equal(await tab('Combat').getAttribute('aria-selected'), 'true');
  await tab('Combat').press('Home'); assert.equal(await tab('Building Blocks').getAttribute('aria-selected'), 'true');

  // Compare real tab pixels (outside the app-supplied icon) against extracted PNGs.
  for (const bundle of ['mcgui', 'mcgui-pack']) {
    await page.getByLabel('Asset bundle').selectOption(bundle); await screen.waitFor();
    const manifest = JSON.parse(await readFile(`apps/storybook/public/${bundle}/manifest.json`, 'utf8'));
    // Reference: getIconItem() from the locally installed Java 26.2 client.
    const tabIcons = {
      'Building Blocks': 'bricks', 'Colored Blocks': 'cyan_wool', 'Natural Blocks': 'grass_block',
      'Functional Blocks': 'oak_sign', 'Redstone Blocks': 'redstone', 'Saved Hotbars': 'bookshelf',
      'Search Items': 'compass', 'Tools & Utilities': 'diamond_pickaxe', 'Combat': 'netherite_sword',
      'Food & Drinks': 'golden_apple', 'Ingredients': 'iron_ingot', 'Spawn Eggs': 'creeper_spawn_egg',
      'Survival Inventory': 'chest',
    };
    for (const [label, item] of Object.entries(tabIcons)) {
      const icon = tab(label).locator('img');
      const expected = manifest.catalogue.items.find(entry => entry.stackKey === `minecraft:${item}`);
      assert.equal(await icon.getAttribute('src'), `/${bundle}/${(expected.icon.atlas ?? expected.icon).file}`, `${bundle}: ${label} uses the game's tab icon`);
      if (expected.icon.atlas) assert.equal(await icon.evaluate(image=>image.style.left), `${((Math.max(expected.icon.pixelWidth,expected.icon.pixelHeight)-expected.icon.pixelWidth)/2-expected.icon.atlas.x)/Math.max(expected.icon.pixelWidth,expected.icon.pixelHeight)*100}%`);
      await icon.evaluate(async image => { await image.decode(); });
    }
    assert.equal(manifest.catalogue.items.length, 1895);
    assert.ok(manifest.catalogue.items.every(item => item.icon && !item.iconWarning), `${bundle}: every catalogue item has an icon`);
    for (const file of new Set(manifest.catalogue.items.map(item => item.icon.file))) {
      const icon = PNG.sync.read(await readFile(path.join('apps/storybook/public', bundle, file)));
      assert.ok(icon.data.some((value, index) => index % 4 === 3 && value > 0), `${bundle}/${file}: icon is visible`);
    }
    assert.equal(await hot(0).getAttribute('aria-label'), 'Diamond, 64');
    const diamondIcon = manifest.catalogue.items.find(item=>item.stackKey==='minecraft:diamond').icon;
    assert.equal(await hot(0).locator('img').getAttribute('src'),`/${bundle}/${(diamondIcon.atlas ?? diamondIcon).file}`);
    await tab('Search Items').click();
    for (const name of ['Chest', 'Shulker Box', 'White Bed', 'Ominous Banner', 'Shield', 'Compass', 'Clock', 'Heavy Core', 'Sea Lantern']) {
      await search.fill(name);
      const icon = cell(name).locator('img');
      assert.equal(await icon.count(), 1, `${bundle}: ${name} renders an image`);
      await icon.evaluate(async image => { await image.decode(); });
      assert.ok(await icon.evaluate(image => image.naturalWidth > 0), `${bundle}: ${name} loads`);
    }
    for (const scale of [1, 2, 3, 4]) {
      await page.getByLabel('GUI scale').selectOption(String(scale)); await screen.scrollIntoViewIfNeeded();
      await tab('Building Blocks').click(); await page.mouse.move(0, 0);
      // As in the other pixel tests, compare at integer device coordinates.
      const originalStyle = await screen.getAttribute('style');
      await screen.evaluate(element => { Object.assign(element.style, { position: 'fixed', left: '0', top: '0', zIndex: '100', margin: '0' }); });
      await page.mouse.move(1200, 0); await page.keyboard.press('Escape');
      await tab('Building Blocks').evaluate(element => element.blur());
      const bounds = await screen.boundingBox(); assert.equal(bounds.width, 195 * scale); assert.equal(bounds.height, 192 * scale);
      const role = manifest.sprites['creative.tab.top.selected.1'];
      const source = PNG.sync.read(await readFile(path.join('apps/storybook/public', bundle, role.file)));
      const captured = PNG.sync.read(await tab('Building Blocks').screenshot());
      for (let y = 1; y < 31; y++) for (const x of [1, 2, 23, 24]) {
        const actual = ((y * scale) * captured.width + x * scale) * 4;
        const expected = (Math.floor(y * source.height / 32) * source.width + Math.floor(x * source.width / 26)) * 4;
        if (source.data[expected + 3] === 255) assert.deepEqual([...captured.data.subarray(actual, actual + 4)], [...source.data.subarray(expected, expected + 4)], `${bundle} tab pixels at scale ${scale}, ${x},${y}`);
      }
      await screen.evaluate((element, style) => element.setAttribute('style', style), originalStyle);
    }
    await page.getByLabel('GUI scale').selectOption('2'); await screen.scrollIntoViewIfNeeded(); await page.mouse.move(0, 0);
    await screen.screenshot({ path: `${evidence}-${bundle === 'mcgui' ? 'desktop' : 'pack'}.png` });
  }
  await tab('Saved Hotbars').click(); assert.equal(await screen.getByRole('group', { name: 'Saved hotbar items', exact: true }).getByRole('button').first().getAttribute('aria-label'), 'Diamond');
  await tab('Building Blocks').click(); await page.setViewportSize({ width: 390, height: 844 }); await screen.scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: `${evidence}-mobile.png` });
  assert.equal(await page.locator('vite-error-overlay').count(), 0); assert.deepEqual(errors, []);
  const touch = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const touchPage = await touch.newPage(); await touchPage.goto(url);
  const touchScreen = touchPage.locator('.mcgui-creative');
  await touchScreen.getByRole('tab', { name: 'Colored Blocks', exact: true }).tap();
  assert.equal(await touchScreen.getByRole('tab', { name: 'Colored Blocks', exact: true }).getAttribute('aria-selected'), 'true');
  await touchScreen.getByRole('tab', { name: 'Building Blocks', exact: true }).tap();
  await touchScreen.getByRole('button', { name: 'Oak Planks', exact: true }).tap();
  await touchScreen.getByRole('group', { name: 'Creative hotbar', exact: true }).getByRole('button').nth(2).tap();
  assert.equal(await touchScreen.getByRole('group', { name: 'Creative hotbar', exact: true }).getByRole('button').nth(2).getAttribute('aria-label'), 'Oak Planks');
  await touch.close();
  console.log('PASS: all 1,895 icons visible in both bundles, restored special/animated item images, creative tabs, search/tag filtering and native editing, scrolling by wheel/drag/keyboard, unlimited catalogue pickup, split/place, shared hotbar, delete, saved hotbars, number keys, scales 1–4, source tab pixels, 2× pack overrides, desktop/mobile/touch, no overlays or missing assets/errors.');
  console.log(`Screenshots: ${evidence}-{desktop,search,inventory,pack,mobile}.png`);
} finally { await browser.close(); }
