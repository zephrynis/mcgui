import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const url = process.env.MCUI_TEST_URL ?? 'http://127.0.0.1:5173/iframe.html?id=examples-inventory-workbench--interactive&viewMode=story';
const executablePath = process.env.MCUI_CHROME ?? (() => { try { return execFileSync('which', ['google-chrome'], { encoding: 'utf8' }).trim(); } catch { return undefined; } })();
const browser = await chromium.launch({ executablePath, headless: true });
const evidence = path.join(tmpdir(), 'mcui'), errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (['error', 'warning'].includes(message.type())) errors.push(message.text()); });
  await page.goto(url); assert.equal(page.url(), url); await page.getByRole('heading', { name: 'Inventory workbench', exact: true }).waitFor();
  const settings = page.getByRole('region', { name: 'Settings workbench' }), furnace = page.getByRole('region', { name: 'Furnace workbench' });
  await settings.waitFor(); await settings.scrollIntoViewIfNeeded();
  const checkbox = settings.getByRole('checkbox', { name: 'Show Subtitles', exact: true });
  const music = settings.getByRole('slider', { name: 'Music', exact: true });
  await checkbox.check(); assert.equal(await checkbox.isChecked(), true);
  await checkbox.press('Space'); assert.equal(await checkbox.isChecked(), false);
  await checkbox.press('Tab'); assert.equal(await music.evaluate(el => el === document.activeElement), true);
  await music.press('ArrowRight'); assert.equal(await music.inputValue(), '51');
  await music.press('Home'); assert.equal(await music.inputValue(), '0');
  await music.press('End'); assert.equal(await music.inputValue(), '100');
  const brightness = settings.getByRole('slider', { name: 'Brightness', exact: true });
  await brightness.press('ArrowLeft'); assert.equal(await brightness.inputValue(), '70');
  await music.scrollIntoViewIfNeeded();
  const box = await music.boundingBox();
  await page.mouse.move(box.x + box.width - 8, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 }); await page.mouse.up();
  assert.equal(await music.inputValue(), '50');
  await page.mouse.click(box.x + 2, box.y + box.height / 2); assert.equal(await music.inputValue(), '0');
  await page.mouse.click(box.x + box.width - 2, box.y + box.height / 2); assert.equal(await music.inputValue(), '100');
  const locked = settings.getByRole('checkbox', { name: 'Locked setting', exact: true }), lockedVolume = settings.getByRole('slider', { name: 'Locked volume', exact: true });
  assert.equal(await locked.isDisabled(), true); assert.equal(await lockedVolume.isDisabled(), true);
  const lockedBox = await locked.boundingBox(); await page.mouse.click(lockedBox.x + 5, lockedBox.y + 5); assert.equal(await locked.isChecked(), true);
  const disabledBox = await lockedVolume.boundingBox(); await page.mouse.click(disabledBox.x + disabledBox.width - 3, disabledBox.y + 3); assert.equal(await lockedVolume.inputValue(), '25');
  await checkbox.check(); await settings.getByRole('button', { name: 'Apply Settings' }).click();
  assert.match(await page.locator('.settings-output').innerText(), /music 100%, brightness 70%, subtitles on/);
  await settings.getByRole('button', { name: 'Reset Settings' }).click(); assert.equal(await checkbox.isChecked(), false); assert.equal(await music.inputValue(), '50');
  await checkbox.hover(); await page.getByRole('tooltip').waitFor();
  assert.ok(await checkbox.getAttribute('aria-describedby')); await page.keyboard.press('Escape');
  await music.focus();
  assert.equal(await settings.locator('.mcui-slider').first().locator(':scope > .mcui-control-highlighted').evaluate(el => getComputedStyle(el).visibility), 'visible');
  await page.mouse.move(0, 0);
  await settings.screenshot({ path: `${evidence}-settings-desktop.png` });

  await furnace.scrollIntoViewIfNeeded();
  const screen = furnace.locator('.mcui-furnace');
  assert.equal(await screen.locator('[data-mcui-slot]').count(), 39);
  assert.equal(await screen.locator('.mcui-slot-background').count(), 0);
  const result = screen.getByRole('button', { name: 'Iron Ingot, 4', exact: true });
  await result.click(); assert.equal(await screen.locator('[data-mcui-cell="92"]').getAttribute('aria-pressed'), null);
  assert.match(await page.locator('.furnace-output').innerText(), /Carrying Iron Ingot, 4/);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Reset items', exact: true }).click();
  const inventory = screen.getByRole('group', { name: 'Inventory slots', exact: true });
  await inventory.getByRole('button', { name: 'Emerald, 16', exact: true }).focus(); await page.keyboard.press('ArrowRight');
  assert.equal(await inventory.getByRole('button', { name: 'Empty inventory slot 2', exact: true }).evaluate(el => el === document.activeElement), true);
  const smelting = furnace.getByRole('slider', { name: 'Smelting', exact: true }), fuel = furnace.getByRole('slider', { name: 'Fuel', exact: true });
  const arrow = screen.getByRole('progressbar', { name: 'Smelting progress', exact: true }), flame = screen.getByRole('progressbar', { name: 'Fuel remaining', exact: true });
  for (const scale of [1, 2, 3, 4]) {
    await page.getByLabel('GUI scale').selectOption(String(scale));
    assert.equal((await screen.boundingBox()).width, 176 * scale); assert.equal((await screen.boundingBox()).height, 166 * scale);
    assert.equal((await settings.locator('.mcui-checkbox-box').first().boundingBox()).width, 17 * scale);
    assert.equal((await music.boundingBox()).width, 150 * scale);
    assert.equal((await settings.locator('.mcui-slider-handle').first().boundingBox()).width, 8 * scale);
    await smelting.press('Home'); await fuel.press('Home');
    assert.equal((await arrow.locator('.mcui-progress-fill').boundingBox()).width, 0);
    assert.equal((await flame.locator('.mcui-progress-fill').boundingBox()).height, 0);
    await smelting.press('End'); await fuel.press('End');
    assert.equal((await arrow.locator('.mcui-progress-fill').boundingBox()).width, 24 * scale);
    assert.equal((await flame.locator('.mcui-progress-fill').boundingBox()).height, 14 * scale);
  }
  await page.getByLabel('GUI scale').selectOption('1');
  // Align the furnace to whole device pixels for source-image comparisons.
  await screen.evaluate(el => el.style.cssText = 'position:fixed;left:0;top:0;z-index:100;width:176px;height:166px');
  const manifest = JSON.parse(await readFile('apps/storybook/public/mcui/manifest.json', 'utf8'));
  for (const [slider, indicator, role, width, height, vertical] of [[smelting, arrow, 'furnace.arrow', 24, 16, false], [fuel, flame, 'furnace.flame', 14, 14, true]]) {
    await slider.fill('50'); await page.mouse.move(1000, 0);
    const captured = PNG.sync.read(await indicator.screenshot()), source = PNG.sync.read(await readFile(path.join('apps/storybook/public/mcui', manifest.sprites[role].file)));
    assert.equal(captured.width, width); assert.equal(captured.height, height);
    const filled = vertical ? 8 : 12;
    assert.equal(await indicator.getAttribute('aria-valuenow'), '0.5');
    assert.equal((await indicator.locator('.mcui-progress-fill').boundingBox())[vertical ? 'height' : 'width'], filled);
    let compared = 0;
    for (let y = vertical ? height - filled : 0; y < height; y++) for (let x = 0; x < (vertical ? width : filled); x++) {
      const index = (y * width + x) * 4;
      if (source.data[index + 3] === 255) { assert.deepEqual(captured.data.subarray(index, index + 4), source.data.subarray(index, index + 4), `${role} must crop, not stretch, the source sprite`); compared++; }
    }
    assert.ok(compared > 0);
  }
  await screen.evaluate(el => { el.style.position = 'relative'; el.style.left = ''; el.style.top = ''; el.style.zIndex = ''; });
  await page.getByLabel('GUI scale').selectOption('2'); await furnace.scrollIntoViewIfNeeded();
  await furnace.screenshot({ path: `${evidence}-furnace-desktop.png` });
  await page.getByLabel('Asset bundle').selectOption('mcui-pack'); await settings.waitFor();
  const pack = await (await page.request.get(new URL('/mcui-pack/manifest.json', url).href)).json();
  assert.equal(pack.textures['container.furnace'].pixelWidth, 512);
  assert.equal(await screen.locator('.mcui-furnace-background image').getAttribute('href'), `/mcui-pack/${pack.textures['container.furnace'].file}`);
  assert.equal(await settings.locator('.mcui-checkbox-box .mcui-control-normal image').first().getAttribute('href'), `/mcui-pack/${pack.sprites['checkbox.normal'].file}`);
  assert.equal(await settings.locator('.mcui-slider-handle .mcui-control-normal image').first().getAttribute('href'), `/mcui-pack/${pack.sprites['slider.handle'].file}`);
  await settings.screenshot({ path: `${evidence}-settings-pack.png` }); await furnace.screenshot({ path: `${evidence}-furnace-pack.png` });
  await page.getByLabel('Asset bundle').selectOption('mcui'); await settings.waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await settings.screenshot({ path: `${evidence}-settings-mobile.png` }); await furnace.screenshot({ path: `${evidence}-furnace-mobile.png` });
  for (const scale of [1, 2, 3, 4]) {
    await page.getByLabel('GUI scale').selectOption(String(scale));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Document overflow at mobile scale ${scale}`);
  }
  await page.getByLabel('GUI scale').selectOption('2');
  await page.emulateMedia({ forcedColors: 'active' });
  await music.focus(); await music.press('ArrowRight'); assert.equal(await music.inputValue(), '51');
  assert.equal(await music.evaluate(el => getComputedStyle(el).opacity), '1');
  assert.equal(await music.evaluate(el => getComputedStyle(el).appearance), 'auto');
  assert.equal(await settings.locator('.mcui-native-label').first().isVisible(), true);
  assert.equal(await settings.locator('.mcui-slider-handle').first().isVisible(), false);
  await page.mouse.move(0, 0); await page.keyboard.press('Escape');
  await settings.screenshot({ path: `${evidence}-settings-forced-colors.png` });
  assert.equal(await page.locator('vite-error-overlay').count(), 0); assert.deepEqual(errors, []);
  console.log('PASS: native checkbox and slider keyboard/pointer behavior, steps, endpoints, disabled controls, forms/reset, focus/tooltip, scales 1–4, furnace selection/navigation, source progress pixels, 2× packs, mobile overflow and no browser errors.');
  console.log(`Screenshots: ${evidence}-{settings,furnace}-{desktop,pack,mobile}.png`);
} finally { await browser.close(); }
