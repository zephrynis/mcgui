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
const evidence = path.join(tmpdir(), 'mcui');
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (['error', 'warning'].includes(message.type())) errors.push(message.text()); });
  await page.goto(url);
  await page.getByRole('heading', { name: 'Inventory workbench', exact: true }).waitFor();
  assert.equal(page.url(), url);
  const button = page.getByRole('button', { name: 'Back to Game', exact: true });
  await button.waitFor();
  assert.equal(await page.locator('vite-error-overlay').count(), 0);
  await button.click();
  assert.match(await page.locator('.preview-footer output').innerText(), /activated 1 time/);
  await button.press('Enter');
  assert.match(await page.locator('.preview-footer output').innerText(), /activated 2 times/);
  await button.press('Space');
  assert.match(await page.locator('.preview-footer output').innerText(), /activated 3 times/);
  await page.mouse.move(0, 0); await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await button.evaluate(element => element.matches(':focus-visible')), true);
  assert.equal(await button.locator('.mcui-button-highlighted').evaluate(element => getComputedStyle(element).visibility), 'visible');
  await page.getByLabel('Disabled state').check();
  assert.equal(await button.isDisabled(), true);
  assert.equal(await button.locator('.mcui-button-disabled').evaluate(element => getComputedStyle(element).visibility), 'visible');
  await page.getByLabel('Disabled state').uncheck();
  for (const scale of [1, 2, 3, 4]) {
    await page.getByLabel('GUI scale').selectOption(String(scale));
    const bounds = await button.boundingBox();
    assert.equal(bounds.width, 150 * scale); assert.equal(bounds.height, 20 * scale);
  }
  await page.getByLabel('GUI scale').selectOption('2');
  await page.screenshot({ path: `${evidence}-desktop.png`, fullPage: true });

  // A full-size sprite at scale 1 must reproduce the locally extracted PNG byte-for-byte.
  await page.getByLabel('GUI scale').selectOption('1');
  await page.getByLabel('Logical width').press('End');
  await page.getByLabel('Button label').fill('');
  await page.mouse.move(0, 0);
  const sprite = page.locator('.button-sample .mcui-button-normal');
  // Pixel equality is defined at integer device coordinates, independent of the
  // surrounding page's responsive typography and flex centering.
  await page.locator('.button-sample').evaluate(element => element.style.cssText = 'position:fixed;left:0;top:0;z-index:100');
  // Hide the text only for this texture fidelity assertion, then restore it.
  await page.locator('.button-sample .mcui-button-label').evaluate(element => element.style.visibility = 'hidden');
  const captured = PNG.sync.read(await sprite.screenshot());
  const manifest = JSON.parse(await readFile('apps/storybook/public/mcui/manifest.json', 'utf8'));
  const original = PNG.sync.read(await readFile(path.join('apps/storybook/public/mcui', manifest.sprites['button.normal'].file)));
  assert.equal(captured.width, original.width); assert.equal(captured.height, original.height);
  assert.deepEqual(captured.data, original.data, 'Full-size sprite pixels differ from the extracted source');
  await page.locator('.button-sample .mcui-button-label').evaluate(element => element.style.visibility = '');
  await page.getByLabel('Button label').fill('Back to Game');
  const expected = PNG.sync.read(PNG.sync.write(original));
  const label = 'Back to Game';
  const textWidth = [...label].reduce((sum, char) => sum + manifest.font.glyphs[char].advance, 0);
  const fontImages = new Map();
  for (const dark of [true, false]) {
    let x = Math.floor((200 - textWidth) / 2);
    for (const char of label) {
      const glyph = manifest.font.glyphs[char], image = glyph.image;
      if (image) {
        if (!fontImages.has(image.file)) fontImages.set(image.file, PNG.sync.read(await readFile(path.join('apps/storybook/public/mcui', image.file))));
        const atlas = fontImages.get(image.file);
        for (let gy = 0; gy < image.height; gy++) for (let gx = 0; gx < image.width; gx++) {
          const src = ((image.y + gy) * atlas.width + image.x + gx) * 4;
          const alpha = atlas.data[src + 3] / 255;
          if (!alpha) continue;
          const dy = Math.floor((20 - manifest.font.lineHeight) / 2) + manifest.font.baseline - image.ascent + gy + (dark ? 1 : 0);
          const dst = (dy * expected.width + x + gx + (dark ? 1 : 0)) * 4;
          for (let channel = 0; channel < 3; channel++) expected.data[dst + channel] = Math.round(Math.floor(atlas.data[src + channel] * (dark ? 0.25 : 1)) * alpha + expected.data[dst + channel] * (1 - alpha));
        }
      }
      x += glyph.advance;
    }
  }
  const textCapture = PNG.sync.read(await page.getByRole('button', { name: label }).screenshot());
  assert.deepEqual(textCapture.data, expected.data, 'Button text pixels differ from extracted glyphs and metrics');
  await page.locator('.button-sample').evaluate(element => element.style.cssText = '');
  for (let i = 0; i < 50; i++) await page.getByLabel('Logical width').press('ArrowLeft');
  await page.getByLabel('GUI scale').selectOption('2');
  await page.getByLabel('Asset bundle').selectOption('mcui-pack');
  await page.getByRole('button', { name: 'Back to Game' }).waitFor();
  await page.getByText('400 × 40 source pixels').first().waitFor();
  assert.equal((await page.getByRole('button', { name: 'Back to Game' }).boundingBox()).width, 300);
  await page.getByRole('button', { name: 'Back to Game' }).click();
  assert.match(await page.locator('.preview-footer output').innerText(), /activated 4 times/);
  await page.screenshot({ path: `${evidence}-pack.png`, fullPage: true });
  await page.getByLabel('Asset bundle').selectOption('mcui');
  await page.getByRole('button', { name: 'Back to Game' }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${evidence}-mobile.png`, fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, 'Mobile document overflows horizontally');
  assert.deepEqual(errors, [], 'Browser reported warnings/errors');
  console.log('PASS: page identity, rendered content, no overlay/errors, click/Enter/Space, keyboard focus, disabled state, scales 1–4, source texture and glyph pixel equality, high-resolution pack, mobile layout.');
  console.log(`Screenshots: ${evidence}-{desktop,pack,mobile}.png`);
} finally { await browser.close(); }
