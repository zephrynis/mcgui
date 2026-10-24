import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Release tooling is executable JavaScript without declarations.
import { validateRelease } from '../scripts/check-release.mjs';

function packages() {
  return Object.fromEntries(['core', 'assets', 'react'].map(name => [name, {
    name: `@mcgui/${name}`, version: '0.1.1', publishConfig: { access: 'public' },
    repository: { url: 'git+https://github.com/zephrynis/mcgui.git', directory: `packages/${name}` },
    dependencies: name === 'core' ? {} : { '@mcgui/core': '0.1.1' },
  }]));
}

test('release tags require matching stable package versions and core dependencies', () => {
  assert.equal(validateRelease('v0.1.1', packages()), '0.1.1');
  for (const tag of [undefined, 'main', '0.1.1', 'v0.1.1-beta.1']) {
    assert.throws(() => validateRelease(tag, packages()), /Release tags/);
  }
  const mismatched = packages();
  mismatched.react!.version = '0.1.0';
  assert.throws(() => validateRelease('v0.1.1', mismatched), /must match release tag/);
  const dependencies = packages();
  dependencies.assets!.dependencies['@mcgui/core'] = '0.1.0';
  assert.throws(() => validateRelease('v0.1.1', dependencies), /must depend on core/);
  const repository = packages();
  repository.core!.repository.directory = 'packages/react';
  assert.throws(() => validateRelease('v0.1.1', repository));
});
