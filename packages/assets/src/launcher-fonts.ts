import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { ResourceSource, safePath } from './resources.js';

const indexSchema = z.object({ objects: z.record(z.string(), z.object({ hash: z.string().regex(/^[a-f0-9]{40}$/), size: z.number().int().nonnegative().max(16 * 1024 * 1024) })) });

/** Only font resources are exposed; no downloads or launcher account files are read. */
export async function launcherFonts(clientJar: string, versionMetadata?: string): Promise<ResourceSource | undefined> {
  const jar = path.resolve(clientJar), marker = `${path.sep}libraries${path.sep}com${path.sep}mojang${path.sep}minecraft${path.sep}`;
  const prism = jar.includes(marker);
  const root = prism ? jar.slice(0, jar.indexOf(marker)) : path.resolve(path.dirname(jar), '../..');
  const metadataPath = versionMetadata ?? (prism ? path.join(root, 'meta/net.minecraft/26.2.json') : path.join(path.dirname(jar), '26.2.json'));
  let raw: string;
  try { raw = await readFile(metadataPath, 'utf8'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT' && !versionMetadata) return undefined; throw error; }
  const metadata = z.object({ assetIndex: z.object({ id: z.string().regex(/^[a-zA-Z0-9_.-]+$/) }).optional() }).parse(JSON.parse(raw));
  if (!metadata.assetIndex) return undefined;
  const assets = path.join(root, 'assets');
  const index = indexSchema.parse(JSON.parse(await readFile(path.join(assets, 'indexes', `${metadata.assetIndex.id}.json`), 'utf8')));
  const entries = new Map(Object.entries(index.objects).filter(([name]) => /^[a-z0-9_.-]+\/font\//.test(name)).map(([name, value]) => [`assets/${safePath(name)}`, value]));
  return new ResourceSource('vanilla-fonts', new Set(entries.keys()), async name => {
    const entry = entries.get(name)!;
    const file = path.join(assets, 'objects', entry.hash.slice(0, 2), entry.hash);
    const data = await readFile(file);
    if (data.length !== entry.size || createHash('sha1').update(data).digest('hex') !== entry.hash) throw new Error(`Launcher font object integrity mismatch: ${name}`);
    return data;
  });
}
