import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export function validateRelease(tag, packages) {
  assert.match(tag ?? '', /^v\d+\.\d+\.\d+$/, 'Release tags must use vMAJOR.MINOR.PATCH (stable releases only).');
  const version = tag.slice(1);
  for (const name of ['core', 'assets', 'react']) {
    const metadata = packages[name];
    assert.equal(metadata?.name, `@mcgui/${name}`);
    assert.equal(metadata.version, version, `@mcgui/${name} must match release tag ${tag}`);
    assert.equal(metadata.publishConfig?.access, 'public');
    assert.equal(metadata.repository?.url, 'git+https://github.com/zephrynis/mcgui.git');
    assert.equal(metadata.repository?.directory, `packages/${name}`);
    if (name !== 'core') {
      assert.equal(metadata.dependencies?.['@mcgui/core'], version, `@mcgui/${name} must depend on core ${version}`);
    }
  }
  return version;
}

export async function checkRelease(tag = process.env.GITHUB_REF_NAME) {
  const packages = Object.fromEntries(await Promise.all(['core', 'assets', 'react'].map(async name => [
    name, JSON.parse(await readFile(new URL(`../packages/${name}/package.json`, import.meta.url), 'utf8')),
  ])));
  const version = validateRelease(tag, packages);
  console.log(`Release ${tag}: all package versions, core dependencies, and repository links match.`);
  return version;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await checkRelease();
