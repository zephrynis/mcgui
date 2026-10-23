import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { fixture } from '../tests/fixtures.ts';

const repository = fileURLToPath(new URL('../', import.meta.url));
const root = await mkdtemp(path.join(tmpdir(), 'mcui-consumers-'));
const env = { ...process.env, NEXT_TELEMETRY_DISABLED: '1', npm_config_cache: path.join(tmpdir(), 'mcui-npm') };
const fixtureAssets = await fixture();
const suppliedBundle = process.env.MCUI_CONSUMER_BUNDLE;
const servers = [];
function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
    child.on('error', reject); child.on('exit', code => code === 0 ? resolve(output) : reject(new Error(`${command} ${args.join(' ')} failed (${code})\n${output}`)));
  });
}
async function serve(directory, command, args, url) {
  const child = spawn(command, args, { cwd: directory, env, stdio: ['ignore', 'pipe', 'pipe'] });
  servers.push(child); let logs = ''; child.stdout.on('data', data => { logs += data; }); child.stderr.on('data', data => { logs += data; });
  for (let attempt = 0; attempt < 120; attempt++) {
    if (child.exitCode !== null) throw new Error(`Consumer server exited: ${logs}`);
    try { if ((await fetch(url)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Consumer server did not start: ${logs}`);
}
console.log(`Consumer fixtures: ${root}`);
let browser;
try {
  const archives = {};
  for (const name of ['core', 'assets', 'react']) {
    const result = JSON.parse(await run('npm', ['pack', '--workspace', `@mcgui/${name}`, '--json', '--pack-destination', root], repository));
    archives[`@mcgui/${name}`] = `file:${path.join(root, result[0].filename)}`;
  }
  for (const framework of ['vite', 'next']) {
    const directory = path.join(root, framework);
    await cp(path.join(repository, 'examples', framework), directory, { recursive: true });
    await cp(path.join(repository, 'examples/shared'), path.join(directory, 'shared'), { recursive: true });
    const dependencies = { ...archives };
    for (const name of ['react', 'react-dom', 'typescript', '@types/react', '@types/react-dom', '@types/node', ...(framework === 'vite' ? ['vite', '@vitejs/plugin-react'] : [])]) {
      dependencies[name] = JSON.parse(await readFile(path.join(repository, 'node_modules', name, 'package.json'), 'utf8')).version;
    }
    if (framework === 'next') dependencies.next = '16.3.4';
    await writeFile(path.join(directory, 'package.json'), JSON.stringify({ name: `mcui-${framework}-consumer`, private: true, type: 'module', dependencies }, null, 2));
    await writeFile(path.join(directory, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', lib: ['dom', 'dom.iterable', 'esnext'], strict: true, skipLibCheck: true, esModuleInterop: true,
      module: 'esnext', moduleResolution: 'bundler', jsx: 'react-jsx', noEmit: true, resolveJsonModule: true }, include: ['**/*.ts', '**/*.tsx', '.next/types/**/*.ts'] }, null, 2));
    console.log(`${framework}: installing tarballs and framework dependencies…`);
    await run('npm', ['install', '--no-audit', '--no-fund'], directory);
    await mkdir(path.join(directory, 'public'), { recursive: true });
    await writeFile(path.join(directory, 'public/favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="#91b86e" d="M2 2h12v12H2z"/></svg>');
    if (suppliedBundle) await cp(path.resolve(suppliedBundle), path.join(directory, 'public/mcui'), { recursive: true });
    else await run('node', ['node_modules/@mcgui/assets/dist/cli.js', 'extract', '--version', '26.2', '--client-jar', fixtureAssets.vanilla, '--characters', ' AB?', '--out', 'public/mcui'], directory);
    await run('node', ['node_modules/@mcgui/assets/dist/cli.js', 'validate', 'public/mcui'], directory);
    await run('node', ['node_modules/typescript/bin/tsc', '--noEmit'], directory);
    console.log(`${framework}: building production consumer…`);
    await run('node', framework === 'next' ? ['node_modules/next/dist/bin/next', 'build', '--webpack'] : ['node_modules/vite/bin/vite.js', 'build'], directory);
    const port = framework === 'next' ? 5192 : 5191, url = `http://127.0.0.1:${port}/`;
    await serve(directory, 'node', framework === 'next' ? ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)] : ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], url);
    const executablePath = process.env.MCUI_CHROME ?? (() => { try { return execFileSync('which', ['google-chrome'], { encoding: 'utf8' }).trim(); } catch { return undefined; } })();
    browser ??= await chromium.launch({ executablePath, headless: true });
    const page = await browser.newPage({ viewport: { width: 1000, height: 1000 } }), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (['error', 'warning'].includes(message.type())) errors.push(message.text()); });
    page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    const response = await page.goto(url);
    assert.equal(await page.title(), `MCUI ${framework === 'next' ? 'Next.js' : 'Vite'} consumer`);
    if (framework === 'next') {
      const html = await response.text(); assert.match(html, /type="checkbox"/); assert.match(html, /role="progressbar"/); assert.match(html, /aria-label="Creative inventory"/);
    }
    await page.locator('main[data-hydrated="true"]').waitFor();
    const extracted = page.getByLabel('Extracted item example');
    if (suppliedBundle) {
      assert.ok(Number(await extracted.getAttribute('data-extracted-count'))>0);
      assert.equal(await extracted.locator('img').evaluate(image=>image.complete&&image.naturalWidth>0),true);
    } else assert.equal(await extracted.innerText(),'No item bundle');
    const checkbox = page.getByRole('checkbox', { name: 'Subtitles', exact: true }), slider = page.getByRole('slider', { name: 'Volume', exact: true });
    await checkbox.check(); await slider.focus(); await slider.press('ArrowRight'); assert.equal(await slider.inputValue(), '51');
    await page.getByRole('button', { name: 'Save', exact: true }).click(); assert.equal(await page.locator('output').innerText(), 'on:51');
    await page.getByRole('button', { name: 'Focus checkbox', exact: true }).click(); assert.equal(await checkbox.evaluate(el => el === document.activeElement), true);
    await checkbox.press('Space'); assert.equal(await checkbox.isChecked(), false);
    await page.getByRole('button', { name: 'Focus slider', exact: true }).click(); assert.equal(await slider.evaluate(el => el === document.activeElement), true);
    await slider.press('End'); assert.equal(await slider.inputValue(), '100');
    await page.getByRole('button', { name: 'Reset', exact: true }).click(); assert.equal(await slider.inputValue(), '50');
    const fine = page.getByRole('slider', { name: 'Fine adjustment', exact: true });
    assert.equal(await fine.inputValue(), '0.3'); await fine.press('ArrowRight'); assert.equal(await fine.inputValue(), '0.4');
    assert.equal(await page.locator('.mcui-slider').first().evaluate(el => el.getBoundingClientRect().width), 300);
    await page.getByRole('button', { name: 'Change scale', exact: true }).click(); assert.equal(await page.locator('.mcui-slider').first().evaluate(el => el.getBoundingClientRect().width), 150);
    await checkbox.hover(); await page.getByRole('tooltip').waitFor(); await page.keyboard.press('Escape');
    const movable = page.getByRole('group', { name: 'Movable items', exact: true });
    await movable.getByRole('button', { name: 'Sample gem, 9', exact: true }).click({ button: 'right' });
    assert.equal(await page.locator('.mcui-carried-stack').getAttribute('data-count'), '5');
    await movable.getByRole('button', { name: 'Empty movable slot 2', exact: true }).click();
    assert.equal(await movable.getByRole('button', { name: 'Sample gem, 5', exact: true }).count(), 1);
    assert.equal(await page.locator('.mcui-carried-stack').count(), 0);
    const creative = page.locator('.mcui-creative');
    await creative.getByRole('tab', { name: 'Search Items', exact: true }).click();
    await creative.getByRole('textbox', { name: 'Search items', exact: true }).fill('#sample:blocks');
    await creative.getByRole('button', { name: 'Sample block', exact: true }).click({ modifiers: ['Shift'] });
    assert.equal(await page.locator('.mcui-carried-stack').getAttribute('data-count'), '64');
    await creative.getByRole('group', { name: 'Creative hotbar', exact: true }).getByRole('button').first().click();
    assert.equal(await creative.getByRole('group', { name: 'Creative hotbar', exact: true }).getByRole('button').first().getAttribute('aria-label'), 'Sample block, 64');
    assert.equal(await page.locator('.mcui-carried-stack').count(), 0);
    await creative.getByRole('tab', { name: 'Survival Inventory', exact: true }).click();
    await creative.getByRole('button', { name: 'Destroy item', exact: true }).click({ modifiers: ['Shift'] });
    assert.match(await creative.getByRole('group', { name: 'Creative hotbar', exact: true }).getByRole('button').first().getAttribute('aria-label'), /^Empty/);
    await movable.getByRole('button', { name: 'Sample gem, 4', exact: true }).press('Space');
    await movable.getByRole('button', { name: 'Empty movable slot 3', exact: true }).press('Space');
    assert.equal(await movable.getByRole('button', { name: 'Sample gem, 4', exact: true }).count(), 1);
    assert.equal(await page.locator('.mcui-carried-stack').count(), 0);
    await page.screenshot({ path: path.join(tmpdir(), `mcui-consumer-${framework}.png`) });
    assert.equal(await page.locator('vite-error-overlay, nextjs-portal').count(), 0); assert.deepEqual(errors, []);
    await page.close(); console.log(`PASS ${framework}: tarball install, CLI validation, TypeScript, production build, SSR/hydration where applicable, stylesheet, forms, refs, keyboard, scaling and tooltip portal.`);
  }
} finally {
  await browser?.close();
  for (const child of servers) child.kill('SIGTERM');
}
