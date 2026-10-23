import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const url = process.env.MCUI_TEST_URL ?? 'http://127.0.0.1:5173/iframe.html?id=examples-inventory-workbench--interactive&viewMode=story';
const cpuSlowdown = Number(process.env.MCUI_BENCH_CPU ?? 4), runs = Number(process.env.MCUI_BENCH_RUNS ?? 2);
const iconMode = process.env.MCUI_BENCH_ICONS ?? 'atlas';
assert.ok(['atlas', 'files', 'compare'].includes(iconMode));
const variants = (iconMode === 'compare' ? ['files', 'atlas'] : [iconMode]).flatMap(icons => ['dom', 'canvas'].map(renderer => ({ icons, renderer })));
assert.ok(Number.isFinite(cpuSlowdown) && cpuSlowdown >= 1 && Number.isInteger(runs) && runs >= 1 && runs <= 10);
const browser = await chromium.launch({ executablePath: process.env.MCUI_CHROME ?? execFileSync('which', ['google-chrome'], { encoding: 'utf8' }).trim(), headless: true });
const results = [];
try {
  for (let run = 0; run < runs; run++) for (const { icons, renderer } of run % 2 ? [...variants].reverse() : variants) {
    // Fresh isolated HTTP/image caches for each mode; alternate order between runs.
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
    const page = await context.newPage(), errors = [];
    await page.addInitScript(() => performance.setResourceTimingBufferSize(10000));
    page.on('pageerror', error => errors.push(error.message));
    // Route both variants identically; only optional atlas metadata changes.
    await page.route('**/manifest.json', async route => {
      const response = await route.fetch(), manifest = await response.json();
      if (icons === 'files') for (const item of manifest.catalogue?.items ?? []) if (item.icon) delete item.icon.atlas;
      await route.fulfill({ response, json: manifest });
    });
    const cdp = await context.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuSlowdown });
    await page.goto(url);
    await page.getByLabel('Inventory renderer', { exact: true }).selectOption(renderer);
    await page.locator('.mcui-creative').getByRole('tab', { name: 'Search Items', exact: true }).click();
    await page.mouse.move(0, 0); await page.keyboard.press('Escape'); await page.evaluate(() => document.activeElement?.blur());
    const result = await page.evaluate(async renderer => {
      const screen = document.querySelector('.mcui-creative'), grid = screen.querySelector('.mcui-creative-catalogue');
      const bar = screen.querySelector('[role=scrollbar]'), samples = [];
      async function ready() {
        const deadline = performance.now() + 10000;
        while (true) {
          const complete = renderer === 'canvas'
            ? grid.querySelector('[data-renderer]').dataset.renderer === 'canvas' && grid.querySelector('canvas').dataset.ready === 'true'
            : [...grid.querySelectorAll('img')].every(image => image.complete && image.naturalWidth > 0);
          if (complete) return;
          if (performance.now() > deadline) throw new Error(`${renderer}: artwork never became ready`);
          await new Promise(requestAnimationFrame);
        }
      }
      await ready();
      const nodes = grid.querySelectorAll('*').length;
      for (const direction of [...Array(20).fill(1), ...Array(20).fill(-1)]) {
        const start = performance.now();
        const committed = new Promise((resolve, reject) => {
          const observer = new MutationObserver(() => { clearTimeout(timer); observer.disconnect(); resolve(performance.now() - start); });
          const timer = setTimeout(() => { observer.disconnect(); reject(new Error('Scroll did not commit')); }, 5000);
          observer.observe(bar, { attributes: true, attributeFilter: ['aria-valuenow'] });
        });
        grid.dispatchEvent(new WheelEvent('wheel', { deltaY: direction * 100, bubbles: true, cancelable: true }));
        const commitMs = await committed;
        await ready(); const artworkReadyMs = performance.now() - start;
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        samples.push({ phase: direction > 0 ? 'first visit' : 'return', row: Number(bar.getAttribute('aria-valuenow')), commitMs, artworkReadyMs, readyAndTwoFramesMs: performance.now() - start });
      }
      return { nodes, samples };
    }, renderer);
    const images = await page.evaluate(() => performance.getEntriesByType('resource').filter(entry => entry.name.includes('/files/')).map(entry => ({url:entry.name,bytes:entry.encodedBodySize})));
    assert.deepEqual(errors, []); results.push({ run, renderer, icons, imageRequests: images.length, imageBytes: images.reduce((sum,image)=>sum+image.bytes,0), ...result }); await context.close();
  }
  const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1];
  const summary = variants.flatMap(({renderer,icons}) => ['first visit', 'return'].map(phase => {
    const matching = results.filter(run => run.renderer === renderer && run.icons === icons);
    const samples = matching.flatMap(run => run.samples).filter(sample => sample.phase === phase);
    const round = value => Math.round(value * 10) / 10;
    return { renderer, icons, phase, samples: samples.length, nodes: matching[0].nodes,
      imageRequests: Math.round(matching.reduce((sum,run)=>sum+run.imageRequests,0)/matching.length),
      commitMedianMs: round(percentile(samples.map(sample => sample.commitMs), .5)), commitP95Ms: round(percentile(samples.map(sample => sample.commitMs), .95)),
      readyMedianMs: round(percentile(samples.map(sample => sample.artworkReadyMs), .5)), twoFramesMedianMs: round(percentile(samples.map(sample => sample.readyAndTwoFramesMs), .5)) };
  }));
  const output = process.env.MCUI_BENCH_OUT ?? '/tmp/mcui-renderer-benchmark.json';
  await writeFile(output, JSON.stringify({ url, browser: browser.version(), cpuSlowdown, runs, methodology: 'Synthetic one-row wheel events, 20 down then 20 back. DOM commit and artwork readiness measured separately. Two subsequent animation frames approximate a presentation opportunity; this is not a compositor/GPU frame-time or FPS measurement. Pointer is outside the grid; tooltips are closed. Fresh context per run, same preloading policy.', summary, results }, null, 2));
  console.table(summary); console.log(`Raw results: ${output}`);
} finally { await browser.close(); }
