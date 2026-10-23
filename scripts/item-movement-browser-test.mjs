import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';

const url = process.env.MCUI_TEST_URL ?? 'http://127.0.0.1:5173/iframe.html?id=examples-inventory-workbench--interactive&viewMode=story';
const executablePath = process.env.MCUI_CHROME ?? (() => { try { return execFileSync('which', ['google-chrome'], { encoding: 'utf8' }).trim(); } catch { return undefined; } })();
const browser = await chromium.launch({ executablePath, headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 }), errors = [];
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (['error', 'warning'].includes(message.type())) errors.push(message.text()); });
  await page.goto(url); assert.equal(page.url(), url); await page.getByRole('heading', { name: 'Inventory workbench', exact: true }).waitFor();
  const chest = page.locator('.mcui-chest'), furnace = page.locator('.mcui-furnace'), cursor = page.locator('.mcui-carried-stack');
  const slot = index => chest.locator(`[data-mcui-cell="${index}"]`), furnaceSlot = index => furnace.locator(`[data-mcui-cell="${index}"]`);
  const label = index => slot(index).getAttribute('aria-label');
  const reset = async () => { await page.getByRole('button', { name: 'Reset items', exact: true }).click(); await chest.scrollIntoViewIfNeeded(); };
  const carrying = async expected => expected === 0 ? assert.equal(await cursor.count(), 0) : assert.equal(await cursor.getAttribute('data-count'), String(expected));
  // Read the first rendered frame after the action, without polling until the
  // UI catches up. Slot and cursor numbers must reflect the same transaction.
  async function clickAndCheckFrame(index, button, eventType, expected) {
    await page.evaluate(({ index, eventType }) => {
      window.inventoryFrame = new Promise(resolve => {
        document.addEventListener(eventType, () => requestAnimationFrame(() => {
          const cell = document.querySelector(`.mcui-chest [data-mcui-cell="${index}"]`);
          const held = document.querySelector('.mcui-carried-stack');
          resolve({ label: cell.getAttribute('aria-label'), slotCount: cell.querySelector('.mcui-slot-count .mcui-sr-only')?.textContent ?? null,
            carried: held?.getAttribute('data-count') ?? null, carriedCount: held?.querySelector('.mcui-carried-count .mcui-sr-only')?.textContent ?? null });
        }), { once: true, capture: true });
      });
    }, { index, eventType });
    await slot(index).click({ button });
    assert.deepEqual(await page.evaluate(() => window.inventoryFrame), expected);
  }
  await chest.waitFor(); await reset();
  // Number keys work with keyboard focus and with mouse hover, without selecting.
  await page.mouse.move(0,0);await slot(0).press('2');
  assert.match(await label(0),/^Empty/);assert.equal(await label(82),'Diamond, 32');await carrying(0);
  await slot(0).hover();await page.keyboard.press('2');assert.equal(await label(0),'Diamond, 32');
  await slot(0).press('f');assert.match(await label(0),/^Empty/);
  await slot(3).hover();await page.keyboard.press('f');assert.equal(await label(3),'Diamond, 32');await carrying(0);
  await reset();await slot(54).dblclick();await carrying(20);
  assert.match(await label(54),/^Empty/);assert.match(await label(81),/^Empty/);
  await slot(4).click();assert.equal(await label(4),'Emerald, 20');await carrying(0);
  await reset();await slot(54).click({modifiers:['Shift']});
  await page.locator('.mcui-creative [data-mcui-cell="81"]').dblclick();await carrying(4);
  assert.equal(await label(3),'Emerald, 16'); // creative collection stays in the player inventory
  await reset();
  await slot(4).click(); await page.mouse.move(0, 0);
  assert.equal(await slot(4).getAttribute('aria-pressed'), null); assert.equal(await slot(4).getAttribute('data-selected'), null);
  assert.equal(await slot(4).locator('.mcui-slot-highlight').first().evaluate(el => getComputedStyle(el).visibility), 'hidden'); await carrying(0);
  // A same-slot mouse click can retain :focus-visible after keyboard use.
  // Test both mouse buttons, plus focus transferred from a text input.
  const highlight = index => slot(index).locator('.mcui-slot-highlight').first().evaluate(el => getComputedStyle(el).visibility);
  for (const button of ['left', 'right']) {
    await slot(4).press('Space'); assert.equal(await highlight(4), 'visible');
    await slot(4).click({ button }); await page.mouse.move(0, 0); assert.equal(await highlight(4), 'hidden');
    await slot(4).press('ArrowRight'); assert.equal(await highlight(5), 'visible');
    await slot(4).click({ button }); await page.mouse.move(0, 0); assert.equal(await highlight(4), 'hidden');
    await page.getByLabel('Button label').fill('Back to Game');
    await slot(4).click({ button }); await page.mouse.move(0, 0); assert.equal(await highlight(4), 'hidden');
  }
  await slot(0).hover(); await page.getByRole('tooltip').waitFor();
  await clickAndCheckFrame(0, 'left', 'pointerdown', { label: 'Empty chest slot 1', slotCount: null, carried: '32', carriedCount: '32' });
  assert.equal(await label(0), 'Empty chest slot 1'); await carrying(32);
  assert.equal(await page.getByRole('tooltip').count(), 0);
  assert.equal(await cursor.evaluate(el => el.parentElement.tagName), 'BODY');
  assert.equal(await cursor.evaluate(el => getComputedStyle(el).pointerEvents), 'none');
  await page.mouse.move(500, 500);
  assert.equal(Math.round((await cursor.boundingBox()).x), 484);
  await clickAndCheckFrame(3, 'left', 'pointerup', { label: 'Diamond, 32', slotCount: '32', carried: null, carriedCount: null });
  await carrying(0);
  await clickAndCheckFrame(3, 'right', 'pointerdown', { label: 'Diamond, 16', slotCount: '16', carried: '16', carriedCount: '16' });
  await carrying(16);
  await clickAndCheckFrame(4, 'right', 'pointerup', { label: 'Diamond', slotCount: null, carried: '15', carriedCount: '15' });
  await carrying(15);
  await slot(3).click(); assert.equal(await label(3), 'Diamond, 31'); await carrying(0);
  await slot(4).click(); await slot(3).click(); assert.equal(await label(3), 'Diamond, 32'); await carrying(0);
  await slot(3).click(); await slot(1).click(); assert.equal(await label(1), 'Diamond, 32'); await carrying(64);
  await slot(5).click(); assert.equal(await label(5), 'Copper Ingot, 64'); await carrying(0);

  await reset();
  await slot(54).click({ modifiers: ['Shift'] }); assert.equal(await label(54), 'Empty inventory slot 1'); assert.equal(await label(3), 'Emerald, 16'); await carrying(0);
  await slot(3).click({ modifiers: ['Shift'] }); assert.equal(await label(81), 'Emerald, 20'); assert.equal(await label(3), 'Empty chest slot 4');
  await slot(0).click({ modifiers: ['Shift'] }); assert.equal(await label(89), 'Diamond, 32');
  const locked = await slot(2).boundingBox(); await page.mouse.click(locked.x + 5, locked.y + 5); assert.equal(await label(2), 'Amethyst Shard'); await carrying(0);

  await reset(); await slot(0).click();
  async function drag(indices, button = 'left', cancel = false) {
    const first = await slot(indices[0]).boundingBox();
    await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2); await page.mouse.down({ button });
    for (const index of indices.slice(1)) { const box = await slot(index).boundingBox(); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 }); }
    if (cancel) await page.keyboard.press('Escape');
    await page.mouse.up({ button });
  }
  await drag([3, 4, 5]);
  for (const index of [3, 4, 5]) assert.equal(await label(index), 'Diamond, 10'); await carrying(2);
  await slot(6).click(); await carrying(0); assert.equal(await label(6), 'Diamond, 2');
  await reset(); await slot(0).click(); await drag([3, 4, 5], 'right');
  for (const index of [3, 4, 5]) assert.equal(await label(index), 'Diamond'); await carrying(29);
  await page.screenshot({ path: path.join(tmpdir(), 'mcui-inventory-moving.png') });
  await reset(); await slot(0).click(); await drag([3, 4, 5], 'left', true);
  for (const index of [3, 4, 5]) assert.match(await label(index), /^Empty/); await carrying(32);
  // Releasing outside a slot keeps the carried item rather than dropping it into a nonexistent world.
  const start = await slot(3).boundingBox(); await page.mouse.move(start.x + 10, start.y + 10); await page.mouse.down(); await page.mouse.move(10, 10); await page.mouse.up(); await carrying(32);
  await slot(3).click(); await carrying(0);
  await slot(3).focus(); await slot(3).press('Enter'); assert.equal(await slot(3).evaluate(el => el === document.activeElement), true); await carrying(32);
  await slot(3).press('ArrowRight'); await page.keyboard.press('Space'); assert.equal(await label(4), 'Diamond, 32'); await carrying(0);
  await slot(4).press('Shift+F10'); assert.equal(await label(4), 'Diamond, 16'); await carrying(16);
  await slot(4).press('Space'); await carrying(0);

  await reset(); await furnace.scrollIntoViewIfNeeded();
  await furnaceSlot(92).click(); await carrying(4); assert.match(await furnaceSlot(92).getAttribute('aria-label'), /^Empty output/);
  await furnaceSlot(92).click(); await carrying(4); // cannot place into output
  await furnaceSlot(90).click(); await carrying(4); // iron ingots are not accepted as raw iron
  await furnaceSlot(55).click(); await carrying(0);
  assert.equal(await furnaceSlot(55).getAttribute('aria-label'), 'Iron Ingot, 4'); assert.equal(await label(55), 'Iron Ingot, 4');
  await furnaceSlot(90).click({ modifiers: ['Shift'] }); assert.equal(await furnaceSlot(89).getAttribute('aria-label'), 'Raw Iron, 8');
  await furnaceSlot(89).click({ modifiers: ['Shift'] }); assert.equal(await furnaceSlot(90).getAttribute('aria-label'), 'Raw Iron, 8');
  await furnaceSlot(91).click({ button: 'right' }); await furnaceSlot(56).click(); assert.equal(await furnaceSlot(56).getAttribute('aria-label'), 'Coal, 8');
  await furnaceSlot(56).click({ modifiers: ['Shift'] }); assert.equal(await furnaceSlot(91).getAttribute('aria-label'), 'Coal, 16');

  await reset(); await slot(0).click();
  await page.getByLabel('Chest rows').selectOption('1'); await carrying(32); await slot(8).click();
  await page.getByLabel('Chest rows').selectOption('6'); assert.equal(await label(8), 'Diamond, 32');
  await slot(8).click(); await page.getByLabel('Asset bundle').selectOption('mcui-pack'); await chest.waitFor(); await carrying(32); await slot(9).click(); await carrying(0);
  for (const scale of [1, 2, 3, 4]) {
    await page.getByLabel('GUI scale').selectOption(String(scale)); await slot(9).click();
    const bounds = await cursor.boundingBox(); assert.equal(bounds.width, 16 * scale); assert.equal(bounds.height, 16 * scale);
    await slot(9).click();
  }
  await page.getByLabel('GUI scale').selectOption('2'); await page.getByLabel('Chest rows').selectOption('3');
  await page.setViewportSize({ width: 390, height: 844 }); await chest.scrollIntoViewIfNeeded(); await slot(9).click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: path.join(tmpdir(), 'mcui-inventory-moving-mobile.png') });
  assert.equal(await page.locator('vite-error-overlay').count(), 0); assert.deepEqual(errors, []);
  const touch = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const touchPage = await touch.newPage(); await touchPage.goto(url);
  const touchSlot = index => touchPage.locator(`.mcui-chest [data-mcui-cell="${index}"]`);
  await touchSlot(0).tap(); await touchSlot(3).tap();
  assert.equal(await touchSlot(3).getAttribute('aria-label'), 'Diamond, 32'); await touch.close();
  console.log('PASS: empty clicks without selection, pickup/place/split/merge/swap, shift transfers, drag distribution/cancel, pointer-following stack, keyboard and touch, furnace restrictions, shared inventory, row/pack/scale changes, mobile and no browser errors.');
} finally { await browser.close(); }
