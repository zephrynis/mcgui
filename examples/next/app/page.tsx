import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseManifest } from '@mcgui/core';
import { Controls } from '../shared/Controls';

export default async function Page() {
  const assets = parseManifest(JSON.parse(await readFile(path.join(process.cwd(), 'public/mcui/manifest.json'), 'utf8')));
  return <Controls assets={assets} />;
}
