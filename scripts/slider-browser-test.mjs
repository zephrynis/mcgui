import assert from 'node:assert/strict';
import path from 'node:path';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';

// Exercise the real story and control without loading unrelated screen exports.
const root = process.cwd();
const modules = {
  '/slider-test.html': '<html><body><div id="root"></div><script type="module" src="/slider-test.tsx"></script></body></html>',
  '/slider-args.tsx': `import { createContext, useContext } from 'react';
    export const ArgsContext = createContext(null);
    export const useArgs = () => useContext(ArgsContext);`,
  '/slider-test.tsx': `import React, { useState } from 'react';
    import { createRoot } from 'react-dom/client';
    import { MinecraftProvider } from '/packages/react/src/primitives.tsx';
    import { ArgsContext } from '/slider-args.tsx';
    import meta from '/apps/storybook/src/slider.stories.tsx';
    import '/packages/react/src/styles.css';
    const assets = await (await fetch('/mcgui/manifest.json')).json();
    function App() {
      const [args, setArgs] = useState(meta.args);
      const [scale, setScale] = useState(2);
      window.setSliderArgs = patch => setArgs(args => ({ ...args, ...patch }));
      window.setSliderScale = setScale;
      window.sliderArgs = args;
      const updateArgs = patch => { window.argUpdates++; window.setSliderArgs(patch); };
      return <MinecraftProvider assets={assets} baseUrl="/mcgui" scale={scale}>
        <ArgsContext.Provider value={[args, updateArgs]}><meta.render {...args} /></ArgsContext.Provider>
      </MinecraftProvider>;
    }
    window.argUpdates = 0;
    createRoot(document.getElementById('root')).render(<App />);`,
};
const server = await createServer({
  configFile: false, root, publicDir: path.join(root, 'apps/storybook/public'),
  cacheDir: path.join(root, 'node_modules/.vite-slider-test'),
  server: { host: '127.0.0.1', port: 5189 },
  resolve: { alias: {
    '@mcgui/react': path.join(root, 'packages/react/src/controls.tsx'),
    '@mcgui/core': path.join(root, 'packages/core/src/index.ts'),
    'storybook/preview-api': '/slider-args.tsx',
  } },
  plugins: [{ name: 'slider-test',
    resolveId(id) { if (id in modules) return id; },
    load(id) { return modules[id]; },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url !== '/slider-test.html') return next();
        res.setHeader('Content-Type', 'text/html');
        res.end(await server.transformIndexHtml(req.url, modules[req.url]));
      });
    },
  }, react()],
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, executablePath: process.env.MCGUI_CHROME });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/slider-test.html`);
  const slider = page.getByRole('slider', { name: 'Music', exact: true });
  await slider.waitFor();
  const box = await slider.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 8, box.y + box.height / 2, { steps: 30 });
  assert.equal(await slider.inputValue(), '100');
  assert.equal(await slider.getAttribute('aria-valuetext'), 'Music: 100');
  assert.equal(await page.evaluate(() => window.argUpdates), 0, 'No manager updates while dragging');
  const handle = await page.locator('.mcgui-slider-handle').boundingBox();
  assert.equal(handle.x - box.x, 284, 'Handle tracks the local value before args are committed');
  await page.mouse.up();
  await page.waitForFunction(() => window.sliderArgs.value === 100);
  // Native range pointer capture must still commit when released off the track.
  await page.mouse.move(box.x + box.width - 8, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height + 100);
  await page.mouse.up();
  await page.waitForFunction(() => window.sliderArgs.value === 50);
  await slider.press('Home');
  assert.equal(await slider.inputValue(), '0');
  await page.waitForFunction(() => window.sliderArgs.value === 0);
  await slider.press('ArrowRight');
  assert.equal(await slider.inputValue(), '1');
  await page.evaluate(() => window.setSliderArgs({ value: 75, step: 5 }));
  await page.waitForFunction(() => document.querySelector('input').value === '75');
  await slider.press('ArrowLeft');
  assert.equal(await slider.inputValue(), '70');
  for (const scale of [1, 2, 3, 4]) {
    await page.evaluate(scale => window.setSliderScale(scale), scale);
    await page.waitForFunction(scale => document.querySelector('input').getBoundingClientRect().width === 150 * scale, scale);
    const inputBox = await slider.boundingBox();
    const handleBox = await page.locator('.mcgui-slider-handle').boundingBox();
    assert.equal(handleBox.width, 8 * scale);
    assert.equal(handleBox.x - inputBox.x, Math.floor(0.7 * 142) * scale);
  }
  await page.evaluate(() => window.setSliderArgs({ disabled: true }));
  await page.waitForFunction(() => document.querySelector('input').disabled);
  await slider.click({ force: true });
  assert.equal(await slider.inputValue(), '70');
  await page.emulateMedia({ forcedColors: 'active' });
  assert.equal(await page.locator('.mcgui-slider-handle').isVisible(), false);
  assert.deepEqual(errors, []);
  console.log('PASS: immediate drag feedback without manager updates, commit, keyboard, external controls, steps, scales, disabled and forced colors.');
} finally {
  await browser?.close();
  await server.close();
}
