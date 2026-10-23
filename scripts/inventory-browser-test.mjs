import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';

const url = process.env.MCUI_TEST_URL ?? 'http://127.0.0.1:5173/iframe.html?id=examples-inventory-workbench--interactive&viewMode=story';
const executablePath = process.env.MCUI_CHROME ?? (() => { try { return execFileSync('which', ['google-chrome'], { encoding: 'utf8' }).trim(); } catch { return undefined; } })();
const browser = await chromium.launch({ executablePath, headless: true });
const errors = [], evidence = path.join(tmpdir(), 'mcui-inventory');
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (['error', 'warning'].includes(message.type())) errors.push(message.text()); });
  await page.goto(url);
  await page.getByRole('heading', { name: 'Inventory workbench', exact: true }).waitFor(); assert.equal(page.url(), url);
  const lab = page.getByRole('region', { name: 'Inventory workbench' });
  await lab.waitFor(); await lab.scrollIntoViewIfNeeded();
  const chest = page.locator('.mcui-chest'), shard = page.getByRole('button', { name: 'Diamond, 32', exact: true });
  assert.equal(await chest.locator('[data-mcui-slot]').count(), 63);
  assert.equal(await chest.locator('.mcui-slot-background').count(), 0);
  await shard.hover();
  const tooltip = page.getByRole('tooltip'); await tooltip.waitFor();
  assert.match(await tooltip.innerText(), /Diamond/);
  assert.equal(await shard.getAttribute('aria-describedby'), await tooltip.getAttribute('id'));
  assert.equal(await tooltip.evaluate(element => element.parentElement.tagName), 'BODY');
  assert.ok(await tooltip.locator('feFlood[flood-color="#ffffff"]').count() > 0);
  await tooltip.hover();
  // Moving into the tooltip must not move it along with the pointer or dismiss it.
  const tipPosition = await tooltip.boundingBox();
  await page.mouse.move(tipPosition.x + tipPosition.width / 2 + 4, tipPosition.y + tipPosition.height / 2 + 4);
  assert.deepEqual(await tooltip.boundingBox(), tipPosition);
  await page.keyboard.press('Escape'); await tooltip.waitFor({ state: 'hidden' });
  await page.mouse.move(0, 0);
  await shard.focus(); await tooltip.waitFor();
  assert.match(await tooltip.innerText(), /Diamond/);
  await shard.press('ArrowRight');
  assert.equal(await page.getByRole('button', { name: 'Copper Ingot, 64', exact: true }).evaluate(element => element === document.activeElement), true);
  await page.keyboard.press('ArrowRight'); // skip the disabled third slot
  const fourth = page.getByRole('button', { name: 'Empty chest slot 4', exact: true });
  assert.equal(await fourth.evaluate(element => element === document.activeElement), true);
  await page.keyboard.press('Enter');
  assert.equal(await fourth.getAttribute('aria-pressed'), null);
  assert.match(await lab.locator('.slot-output').innerText(), /Nothing carried/);
  await fourth.press('ArrowDown');
  assert.equal(await page.getByRole('button', { name: 'Empty chest slot 13', exact: true }).evaluate(element => element === document.activeElement), true);
  await page.keyboard.press('Home');
  assert.equal(await page.getByRole('button', { name: 'Empty chest slot 10', exact: true }).evaluate(element => element === document.activeElement), true);
  await page.keyboard.press('Control+End');
  assert.equal(await page.getByRole('button', { name: 'Empty chest slot 27', exact: true }).evaluate(element => element === document.activeElement), true);
  assert.equal(await chest.getByRole('group', { name: 'Chest slots', exact: true }).locator('button[tabindex="0"]').count(), 1);
  const locked = page.getByRole('button', { name: 'Amethyst Shard', exact: true });
  assert.equal(await locked.isDisabled(), true);
  const lockedBox = await locked.boundingBox(), before = await lab.locator('.slot-output').innerText();
  await page.mouse.click(lockedBox.x + lockedBox.width / 2, lockedBox.y + lockedBox.height / 2);
  assert.equal(await lab.locator('.slot-output').innerText(), before);
  await chest.getByRole('group', { name: 'Hotbar slots' }).getByRole('button', { name: 'Emerald, 4' }).click();
  assert.match(await lab.locator('.slot-output').innerText(), /Carrying Emerald, 4/);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Reset items', exact: true }).click();

  for (const rows of [1, 2, 3, 4, 5, 6]) {
    await page.getByLabel('Chest rows').selectOption(String(rows));
    assert.equal(await chest.locator('[data-mcui-slot]').count(), rows * 9 + 36);
    const box = await chest.boundingBox(); assert.equal(box.width, 352); assert.equal(box.height, (114 + rows * 18) * 2);
  }
  for (const scale of [1, 2, 3, 4]) {
    await page.getByLabel('GUI scale').selectOption(String(scale));
    assert.equal((await chest.boundingBox()).width, 176 * scale);
    for (const trigger of [shard, page.getByRole('button', { name: 'Try a longer tooltip' })]) {
      await trigger.hover(); await tooltip.waitFor();
      const dimensions = await tooltip.locator('.mcui-tooltip-content').evaluate(element => ({
        width: element.clientWidth, height: element.clientHeight,
        scrollWidth: element.scrollWidth, scrollHeight: element.scrollHeight,
      }));
      assert.equal(dimensions.scrollWidth, dimensions.width, `Tooltip should not scroll horizontally at scale ${scale}`);
      assert.equal(dimensions.scrollHeight, dimensions.height, `Tooltip should not scroll vertically at scale ${scale}`);
      await page.keyboard.press('Escape'); await page.mouse.move(0, 0);
    }
    if (scale <= 2) {
      await shard.hover(); await tooltip.waitFor();
      await tooltip.screenshot({ path: `${evidence}-tooltip-scale-${scale}.png` });
      await page.keyboard.press('Escape'); await page.mouse.move(0, 0);
    }
  }
  await page.getByLabel('GUI scale').selectOption('2');
  await page.getByLabel('Chest rows').selectOption('3');
  await lab.scrollIntoViewIfNeeded(); await shard.hover(); await tooltip.waitFor();
  await page.screenshot({ path: `${evidence}-desktop.png` });
  await page.keyboard.press('Escape');

  await page.getByLabel('Asset bundle').selectOption('mcui-pack'); await chest.waitFor();
  const pack = await (await page.request.get(new URL('/mcui-pack/manifest.json', url).href)).json();
  assert.equal(await chest.locator('.mcui-chest-background image').first().getAttribute('href'), `/mcui-pack/${pack.textures['container.chest'].file}`);
  assert.equal(pack.textures['container.chest'].pixelWidth, 512);
  assert.equal((await chest.boundingBox()).width, 352);
  await lab.scrollIntoViewIfNeeded(); await shard.hover(); await tooltip.waitFor();
  assert.equal(await tooltip.locator('.mcui-sprite').first().locator('image').first().getAttribute('href'), `/mcui-pack/${pack.sprites['tooltip.background'].file}`);
  await page.screenshot({ path: `${evidence}-pack.png` }); await page.keyboard.press('Escape');
  await page.getByLabel('Asset bundle').selectOption('mcui'); await chest.waitFor();

  await page.setViewportSize({ width: 390, height: 844 });
  await chest.scrollIntoViewIfNeeded(); await shard.hover(); await tooltip.waitFor();
  function withinViewport() { return page.waitForFunction(() => {
    const rect = document.querySelector('[role="tooltip"]')?.getBoundingClientRect();
    return rect && rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight;
  }); }
  await withinViewport();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: `${evidence}-mobile.png` }); await page.keyboard.press('Escape');
  await page.getByLabel('GUI scale').selectOption('4');
  const longTooltip = page.getByRole('button', { name: 'Try a longer tooltip' });
  await longTooltip.scrollIntoViewIfNeeded(); await page.mouse.move(0, 0); await longTooltip.focus();
  await tooltip.waitFor(); await withinViewport();
  assert.ok(await tooltip.locator('.mcui-tooltip-content > div').count() > 4);
  await page.setViewportSize({ width: 320, height: 640 }); await withinViewport();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.setViewportSize({ width: 320, height: 240 });
  await longTooltip.focus(); await tooltip.waitFor(); await withinViewport();
  const scrollContent = tooltip.locator('.mcui-tooltip-content');
  assert.equal(await scrollContent.getAttribute('tabindex'), '0');
  assert.ok(await scrollContent.evaluate(element => element.scrollHeight > element.clientHeight));
  await scrollContent.focus(); await scrollContent.press('Control+End');
  await page.waitForFunction(() => document.querySelector('.mcui-tooltip-content')?.scrollTop > 0);
  await page.keyboard.press('Escape'); await tooltip.waitFor({ state: 'hidden' });
  assert.equal(await page.locator('vite-error-overlay').count(), 0); assert.deepEqual(errors, []);
  console.log('PASS: chest rows 1–6, scales 1–4, empty clicks without selection, counts, arrow/Home/End navigation, disabled slots, hotbar pickup, hover/focus/Escape tooltips, colors, portal placement, wrapping, viewport resize, 2× pack overrides, desktop/mobile layout, no browser errors.');
  console.log('PASS: fitting tooltips have no overflow at scales 1–4; viewport-constrained tooltips remain keyboard-scrollable.');
  console.log(`Screenshots: ${evidence}-{desktop,pack,mobile,tooltip-scale-1,tooltip-scale-2}.png`);
} finally { await browser.close(); }
