import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const base = process.env.MCUI_STORYBOOK_URL ?? 'http://127.0.0.1:5173/';
const executablePath = process.env.MCUI_CHROME ?? (() => { try { return execFileSync('which', ['google-chrome'], { encoding: 'utf8' }).trim(); } catch { return undefined; } })();
const browser = await chromium.launch({ executablePath, headless: true });
const storyUrl = (id, globals = '') => new URL(`iframe.html?id=${id}&viewMode=story&globals=${globals}`, base).href;
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()}: ${response.url()}`); });
  const index = await (await page.request.get(new URL('index.json', base).href)).json();
  const stories = Object.values(index.entries).filter(entry => entry.type === 'story');
  assert.ok(stories.length >= 35);
  for (const { id } of stories) {
    await page.goto(storyUrl(id));
    await page.locator(id === 'examples-inventory-workbench--interactive' ? '.mcui-chest' : '.story-viewport').waitFor();
    assert.equal(await page.locator('.sb-errordisplay:visible, vite-error-overlay').count(), 0, id);
  }
  // Every prefilled example resolves to the real extracted item, not SVG placeholders.
  const vanilla = await (await page.request.get(new URL('mcui/manifest.json', base).href)).json();
  const originalIcons = new Map(vanilla.catalogue.items.map(item => [item.stackKey, item.icon.file]));
  for (const bundle of ['mcui', 'mcui-pack']) {
    const manifest = await (await page.request.get(new URL(`${bundle}/manifest.json`, base).href)).json();
    for (const item of manifest.catalogue.items) assert.equal(item.icon.file, originalIcons.get(item.stackKey), `${bundle}: ${item.stackKey} keeps its real item artwork`);
    await page.goto(storyUrl('examples-inventory-workbench--interactive', `bundle:${bundle}`));
    await page.locator('.mcui-creative').waitFor();
    for (const [screen, index, id] of [
      ['chest', 0, 'diamond'], ['chest', 1, 'copper_ingot'], ['chest', 2, 'amethyst_shard'],
      ['chest', 54, 'emerald'], ['chest', 81, 'emerald'],
      ['furnace', 90, 'raw_iron'], ['furnace', 91, 'coal'], ['furnace', 92, 'iron_ingot'],
    ]) {
      const item = manifest.catalogue.items.find(item => item.stackKey === `minecraft:${id}`);
      assert.ok(item, id);
      const icon = page.locator(`.mcui-${screen} [data-mcui-cell="${index}"] .mcui-slot-content img`);
      await icon.waitFor();
      assert.equal(await icon.getAttribute('src'), `/${bundle}/${(item.icon.atlas ?? item.icon).file}`);
      await icon.evaluate(image => image.decode());
    }
  }
  // Merchant offer selection stays separate from actual inventory contents.
  await page.goto(storyUrl('screens-villagerscreen--default'));
  const offers = page.getByRole('group', { name: 'Trade offers', exact: true }).getByRole('button');
  assert.equal(await offers.count(), 4);
  assert.equal(await page.locator('.mcui-villager [data-mcui-slot]').count(), 39);
  await offers.nth(1).click();
  assert.equal(await offers.nth(1).getAttribute('aria-pressed'), 'true');
  await offers.nth(1).press('ArrowDown');
  assert.equal(await offers.nth(2).evaluate(button => button === document.activeElement), true);
  await offers.nth(2).press('Enter');
  assert.equal(await offers.nth(2).getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('.mcui-villager [data-mcui-slot] .mcui-slot-content img').count(), 2, 'selecting offers never grants items');
  await page.goto(storyUrl('screens-villagerscreen--scrolling'));
  const scrollingOffers = page.locator('.mcui-trade-offer');
  await scrollingOffers.first().focus();
  await scrollingOffers.first().press('End');
  assert.equal(await scrollingOffers.last().evaluate(button => button === document.activeElement), true);
  assert.ok(await page.locator('.mcui-trade-list').evaluate(list => list.scrollTop > 0));
  const tradeScroll = page.getByRole('scrollbar', { name: 'Trade offer scroll' });
  await tradeScroll.press('Home');
  assert.equal(await tradeScroll.getAttribute('aria-valuenow'), '0');
  await tradeScroll.press('End');
  assert.equal(await tradeScroll.getAttribute('aria-valuenow'), '5');
  assert.equal(await page.locator('.mcui-trade-list').evaluate(list => getComputedStyle(list).overflowY), 'hidden');
  await page.goto(storyUrl('screens-villagerscreen--empty'));
  assert.equal(await page.locator('.mcui-trade-offer').count(), 0);
  assert.equal(await page.getByText('No trades', { exact: true }).count(), 0);
  assert.equal(await page.getByRole('scrollbar', { name: 'Trade offer scroll' }).getAttribute('aria-disabled'), 'true');

  // Actual Storybook Controls and global toolbar, not a parallel custom panel.
  await page.goto(new URL('?path=/story/primitives-button--default', base).href);
  const canvas = page.frameLocator('#storybook-preview-iframe');
  await canvas.getByRole('button', { name: 'Back to Game', exact: true }).waitFor();
  await page.locator('#control-children').fill('Resume');
  const button = canvas.getByRole('button', { name: 'Resume', exact: true });
  await button.waitFor();
  await page.locator('#control-disabled').press('Space');
  await page.waitForFunction(() => document.querySelector('#storybook-preview-iframe').contentDocument.querySelector('.mcui-button')?.disabled);
  await page.locator('#control-disabled').press('Space');
  await page.getByRole('button', { name: 'GUI scale 2×', exact: true }).click();
  await page.getByRole('option', { name: '4×', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#storybook-preview-iframe').contentDocument.querySelector('.mcui-button')?.getBoundingClientRect().width === 600);
  await page.getByRole('button', { name: 'Locally extracted asset bundle Vanilla (local)', exact: true }).click();
  await page.getByRole('option', { name: 'Test pack (local)', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#storybook-preview-iframe').contentDocument.querySelector('.mcui-button-normal image')?.getAttribute('href')?.startsWith('/mcui-pack/'));
  assert.match(await canvas.locator('.mcui-button-normal image').first().getAttribute('href'), /^\/mcui-pack\//);

  // Controlled widgets remain interactive and synchronize their args.
  await page.goto(new URL('?path=/story/controls-checkbox--default', base).href);
  const checkbox = canvas.getByRole('checkbox', { name: 'Show Subtitles', exact: true });
  await checkbox.click();
  await page.waitForFunction(() => document.querySelector('#control-checked')?.checked === true);
  assert.equal(await page.locator('#control-checked').isChecked(), true);
  await page.goto(new URL('?path=/story/controls-slider--default', base).href);
  const slider = canvas.getByRole('slider', { name: 'Music', exact: true });
  await slider.press('ArrowRight');
  await page.waitForFunction(() => document.querySelector('#storybook-preview-iframe').contentDocument.querySelector('input[type=range]')?.value === '51');
  assert.equal(await slider.inputValue(), '51');
  await page.waitForFunction(() => document.querySelector('#control-value')?.value === '51');
  const sliderBox = await slider.boundingBox();
  await page.mouse.move(sliderBox.x + sliderBox.width / 2, sliderBox.y + sliderBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(sliderBox.x + sliderBox.width - 2, sliderBox.y + sliderBox.height / 2, { steps: 20 });
  assert.equal(await slider.inputValue(), '100');
  assert.equal(await page.locator('#control-value').inputValue(), '51', 'Manager updates are deferred until release');
  await page.mouse.up();
  await page.waitForFunction(() => document.querySelector('#control-value')?.value === '100');
  await page.locator('#control-value').fill('25');
  await page.locator('#control-value').press('Tab');
  await page.waitForFunction(() => document.querySelector('#storybook-preview-iframe').contentDocument.querySelector('input[type=range]')?.value === '25');

  // Docs uses the same provider, including its embedded example canvases.
  await page.goto(new URL('?path=/docs/primitives-button--docs', base).href);
  await canvas.getByRole('heading', { name: 'Button', exact: true }).waitFor();
  await canvas.getByRole('button', { name: 'Back to Game', exact: true }).first().waitFor();

  await page.setViewportSize({ width: 390, height: 844 });
  for (const id of ['primitives-button--default', 'screens-chestscreen--six-rows', 'screens-creativeinventoryscreen--interactive']) {
    await page.goto(storyUrl(id, 'scale:4;bundle:mcui-pack'));
    await page.locator('.story-viewport').waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, id);
  }
  assert.deepEqual(errors, []);

  // Missing bundles have actionable guidance, not a crashed provider.
  await page.route('**/mcui/manifest.json', route => route.fulfill({ status: 200, contentType: 'text/html', body: 'No local bundle' }));
  await page.goto(storyUrl('primitives-button--default'));
  assert.match(await page.getByRole('alert').innerText(), /apps\/storybook\/public\/mcui/);
  console.log(`PASS: ${stories.length} stories render, real extracted items in both bundles, Controls edit props, global scale/pack toolbar, controlled widgets, Docs, mobile and missing-asset guidance.`);
} finally { await browser.close(); }
