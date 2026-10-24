import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
for (const name of ['core', 'assets', 'react']) {
  const result = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json', '--cache', path.join(tmpdir(), 'mcgui-npm'), '--workspace', `@mcgui/${name}`], { encoding: 'utf8' }));
  const metadata = JSON.parse(await readFile(`packages/${name}/package.json`, 'utf8'));
  assert.equal(metadata.license, 'MIT');
  assert.equal(metadata.name, `@mcgui/${name}`);
  assert.equal(metadata.publishConfig?.access, 'public');
  if (name === 'assets') {
    assert.deepEqual(metadata.bin, { 'mcgui-assets': 'dist/cli.js' });
    assert.ok(result[0].files.some(file => file.path === 'dist/java/McguiCatalogue.java'), 'Missing Java catalogue helper');
  }
  assert.ok(result[0].files.some(file => file.path === 'LICENSE'), `Missing license: @mcgui/${name}`);
  assert.equal(await readFile(`packages/${name}/LICENSE`, 'utf8'), await readFile('LICENSE', 'utf8'));
  for (const file of result[0].files) {
    assert.ok(file.path === 'package.json' || file.path === 'README.md' || file.path === 'LICENSE' || file.path.startsWith('dist/'), `Unexpected package file: ${file.path}`);
    assert.ok(!/\.(png|jar|zip|ogg|ttf|woff2?)$/i.test(file.path), `Asset leaked into package: ${file.path}`);
  }
  console.log(`@mcgui/${name}: ${result[0].files.length} files; no game assets.`);
}
assert.ok((await readFile('packages/react/dist/index.js', 'utf8')).startsWith("'use client';"));
console.log('React client directive preserved.');
