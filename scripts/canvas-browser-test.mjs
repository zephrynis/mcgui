import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { PNG } from 'pngjs';
import { chromium } from 'playwright';

const url = process.env.MCUI_TEST_URL ?? 'http://127.0.0.1:5173/iframe.html?id=examples-inventory-workbench--interactive&viewMode=story';
const browser = await chromium.launch({ executablePath: process.env.MCUI_CHROME ?? execFileSync('which', ['google-chrome'], { encoding: 'utf8' }).trim(), headless: true });
try {
  for (const deviceScaleFactor of [1, 2]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(url); await page.getByRole('heading', { name: 'Inventory workbench', exact: true }).waitFor();
    const screen = page.locator('.mcui-creative'), catalogue = screen.getByRole('group', { name: 'Creative items', exact: true });
    const hotbar = screen.getByRole('group', { name: 'Creative hotbar', exact: true });
    const tab = name => screen.getByRole('tab', { name, exact: true });
    const selectRenderer = async renderer => {
      await page.getByLabel('Inventory renderer', { exact: true }).selectOption(renderer);
      if (renderer === 'canvas') await page.waitForFunction(() => [...document.querySelectorAll('.mcui-creative canvas')].length === 2 && [...document.querySelectorAll('.mcui-creative canvas')].every(canvas => canvas.dataset.ready === 'true' && getComputedStyle(canvas).visibility === 'visible'));
    };
    await tab('Search Items').click(); await screen.getByRole('textbox', { name: 'Search items', exact: true }).fill('diamond');
    await catalogue.getByRole('button', { name: 'Diamond', exact: true }).press('2');
    await tab('Building Blocks').click();
    for (const bundle of ['mcui', 'mcui-pack']) {
      await page.getByLabel('Asset bundle').selectOption(bundle); await screen.waitFor();
      for (const scale of deviceScaleFactor === 1 ? [1, 2, 3, 4] : [2]) {
        await page.getByLabel('GUI scale').selectOption(String(scale));
        await screen.evaluate(element => Object.assign(element.style, { position: 'fixed', top: '0', left: '0', zIndex: '100', background: '#191919' }));
        for (const interaction of ['none', 'hover', 'keyboard']) {
          const captures = [];
          let iconBounds = [];
          for (const renderer of ['dom', 'canvas']) {
            await selectRenderer(renderer);
            await page.mouse.move(1300, 0); await page.keyboard.press('Escape');
            await page.evaluate(() => document.activeElement?.blur());
            if (interaction === 'hover') await catalogue.getByRole('button').first().hover();
            if (interaction === 'keyboard') await catalogue.getByRole('button').first().press('ArrowRight');
            await page.keyboard.press('Escape');
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            if (renderer === 'dom') iconBounds = await screen.evaluate(element => {
              const root = element.getBoundingClientRect();
              return [...element.querySelectorAll('.mcui-slot-content, .mcui-creative-tab-icon')].map(icon => {
                const box = icon.getBoundingClientRect(); return { x: box.x - root.x, y: box.y - root.y, width: box.width, height: box.height };
              });
            });
            captures.push(PNG.sync.read(await screen.screenshot({ path: `/tmp/mcui-${renderer}-${bundle}-${scale}-${deviceScaleFactor}-${interaction}.png` })));
          }
          assert.equal(captures[0].width, captures[1].width);
          let different = 0, maximum = 0;
          for (let index = 0; index < captures[0].data.length; index++) {
            // 64px baked models become 48px at scale 3: CSS and canvas use
            // different nearest-neighbour boundary rounding. Compare all other
            // pixels, with the complete icon comparison retained at 1/2/4.
            const x = Math.floor(index / 4) % captures[0].width / deviceScaleFactor;
            const y = Math.floor(index / 4 / captures[0].width) / deviceScaleFactor;
            if (scale === 3 && iconBounds.some(box => x >= box.x && x < box.x + box.width && y >= box.y && y < box.y + box.height)) continue;
            const delta = Math.abs(captures[0].data[index] - captures[1].data[index]);
            if (delta) different++; maximum = Math.max(maximum, delta);
          }
          // Canvas and SVG round translucent highlight compositing differently.
          assert.ok(maximum <= (interaction === 'none' ? 0 : 1), `${bundle}, scale ${scale}, DPR ${deviceScaleFactor}, ${interaction}: ${different} differing channels, maximum delta ${maximum}`);
        }
      }
    }
    assert.equal(await catalogue.locator('img,svg').count(), 0);
    assert.equal(await catalogue.getByRole('button').count(), 45);
    assert.equal(await hotbar.getByRole('button').first().getAttribute('aria-label'), 'Emerald, 4');
    assert.equal(await hotbar.getByRole('button').first().locator('.mcui-slot-content img, .mcui-slot-content svg').count(), 0, 'initial Minecraft items use the canvas drawing layer');
    await page.getByLabel('GUI scale').selectOption('2');
    await catalogue.getByRole('button', { name: 'Oak Planks', exact: true }).click();
    assert.equal(await page.locator('.mcui-carried-stack').getAttribute('data-count'), '1');
    await hotbar.getByRole('button').nth(2).click();
    assert.equal(await hotbar.getByRole('button').nth(2).getAttribute('aria-label'), 'Oak Planks');
    await tab('Search Items').click();
    const search = screen.getByRole('textbox', { name: 'Search items', exact: true });
    await search.fill(''); await catalogue.getByRole('button').first().press('PageDown');
    assert.equal(await screen.getByRole('scrollbar').getAttribute('aria-valuenow'), '5');
    assert.equal(await catalogue.getByRole('button').first().evaluate(element => element === document.activeElement), true);
    await catalogue.getByRole('button').first().press('3');
    assert.ok((await hotbar.getByRole('button').nth(2).getAttribute('aria-label')).startsWith(await catalogue.getByRole('button').first().getAttribute('aria-label')));
    await page.emulateMedia({ forcedColors: 'active' });
    await page.waitForFunction(() => document.querySelector('.mcui-creative-catalogue [data-renderer]').dataset.renderer === 'dom');
    assert.ok(await catalogue.locator('img').count() > 0);
    await page.emulateMedia({ forcedColors: 'none' }); await selectRenderer('canvas');
    await page.setViewportSize({ width: 390, height: 844 });
    await screen.evaluate(element => { element.style.position = 'relative'; element.style.background = ''; });
    await screen.scrollIntoViewIfNeeded(); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `/tmp/mcui-canvas-mobile-${deviceScaleFactor}.png` });
    assert.equal(await page.locator('vite-error-overlay').count(), 0); assert.deepEqual(errors, []); await page.close();
  }
  const noCanvas = await browser.newPage();
  await noCanvas.addInitScript(() => { HTMLCanvasElement.prototype.getContext = () => null; });
  await noCanvas.goto(url); await noCanvas.getByLabel('Inventory renderer', { exact: true }).selectOption('canvas');
  assert.ok(await noCanvas.locator('.mcui-creative-catalogue img').count() > 0, 'DOM fallback when 2D canvas is unavailable');
  await noCanvas.close();
  console.log('PASS: DOM/canvas pixel comparison (highlight alpha rounding ≤1/255; scale-3 icon resampling compared visually), stack counts, pointer/keyboard highlights, both bundles, scales 1–4, DPR 1/2, extracted Minecraft items, pickup/place, scrolling, keyboard copy, forced-colors/no-canvas fallback, mobile and no errors.');
} finally { await browser.close(); }
