import test from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MinecraftProvider, Button } from '../packages/react/src/index.js';
import { extractAssets } from '../packages/assets/src/index.js';
import { fixture } from './fixtures.js';

test('server rendering produces accessible semantic buttons with no browser globals', async t => {
  const f = await fixture(); t.after(() => rm(f.root, { recursive: true, force: true }));
  const manifest = await extractAssets({ clientJar: f.vanilla, out: f.out, characters: 'AB?' });
  const element = createElement(MinecraftProvider, { assets: manifest, baseUrl: '/subpath/mcui', scale: 2, children: createElement(Button, { disabled: true, children: 'AB' }) });
  const html = renderToString(element);
  assert.match(html, /<button[^>]*disabled=""/); assert.match(html, /type="button"/);
  assert.match(html, /mcui-sr-only">AB</); assert.match(html, /\/subpath\/mcui\/files\//);
  assert.doesNotMatch(html, /NaN|undefined/);
});
