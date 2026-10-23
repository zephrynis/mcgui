import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { tooltipRunSchema, type AssetManifest, type CatalogueItem } from '@mcgui/core';
import { hash, json, Resolver, safePath } from './resources.js';
import { ImageStore } from './images.js';
import { ItemModelBaker } from './item-models.js';
import { specialGeometrySchema } from './special-models.js';
import { buildItemAtlases } from './item-atlas.js';

export interface CatalogueOptions {
  /** Java 25+ executable; defaults to java on PATH. */
  java?: string;
  /** Exact launcher version JSON and installed Maven library directory. */
  versionMetadata?: string; libraries?: string;
  /** Reuse a previously exported catalogue; useful for reproducible offline builds. */
  catalogueFile?: string;
}
const entrySchema = z.object({ id: z.string(), label: z.string(), translationKey: z.string().optional(), maxStackSize: z.number().int().min(1).max(999),
  stack: z.object({ id: z.string(), components: z.record(z.string(),z.unknown()).default({}) }),
  tags: z.array(z.string()).default([]), tooltip: z.array(z.string()).default([]), colors: z.object({ potion: z.number().optional(), dyed: z.number().optional() }).default({}),
  styledTooltip:z.array(z.array(tooltipRunSchema)).optional(), damage:z.number().int().nonnegative().optional(), maxDamage:z.number().int().nonnegative().optional(), glint:z.boolean().optional(),
});
const exportSchema = z.object({ version: z.literal('26.2'), tabs: z.array(z.object({ id: z.string(), label: z.string(), kind: z.string(), items: z.array(entrySchema).max(10000) })).max(32), specialGeometry:specialGeometrySchema.default({}),dyeColors:z.record(z.string(),z.number().int()).default({}) });
const categoryIds: Record<string,string> = { building_blocks:'building', colored_blocks:'colored', natural_blocks:'natural', functional_blocks:'functional', redstone_blocks:'redstone', tools_and_utilities:'tools', combat:'combat', food_and_drinks:'food', ingredients:'ingredients', spawn_eggs:'spawn' };
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)]));
  return value;
}

/** Uses only dependencies named by the installed version metadata; never downloads. */
export async function exportCatalogue(clientJar: string, options: CatalogueOptions): Promise<Buffer> {
  if (options.catalogueFile) return readFile(options.catalogueFile);
  const jar = path.resolve(clientJar), prism = jar.includes(`${path.sep}libraries${path.sep}com${path.sep}mojang${path.sep}minecraft${path.sep}`);
  const root = prism ? jar.slice(0,jar.indexOf(`${path.sep}libraries${path.sep}`)) : path.resolve(path.dirname(jar),'../..');
  const metadataPath = options.versionMetadata ?? (prism ? path.join(root,'meta/net.minecraft/26.2.json') : path.join(path.dirname(jar),'26.2.json'));
  let metadata: { libraries: { name: string; downloads?: { artifact?: { path?: string } } }[] };
  try { metadata = JSON.parse(await readFile(metadataPath,'utf8')); }
  catch { throw new Error('Item extraction needs installed version metadata. Set --version-metadata and --libraries for a custom launcher.'); }
  const libraries = options.libraries ?? path.join(root,'libraries'), classpath = [jar];
  for (const library of metadata.libraries) {
    if (!library.downloads?.artifact) continue;
    const [group,name,version,classifier] = library.name.split(':');
    if (!group || !name || !version) throw new Error('Invalid Maven dependency in version metadata');
    const relative = library.downloads.artifact.path ?? `${group.replaceAll('.','/')}/${name}/${version}/${name}-${version}${classifier ? `-${classifier}` : ''}.jar`;
    safePath(relative); const file = path.resolve(libraries,relative);
    if ((await stat(file).catch(()=>undefined))?.isFile()) classpath.push(file);
  }
  const temporary = await mkdtemp(path.join(tmpdir(),'mcui-catalogue-'));
  try {
    const output = path.join(temporary,'catalogue.json');
    await promisify(execFile)(options.java ?? 'java',['--class-path',classpath.join(path.delimiter),fileURLToPath(new URL('./java/McuiCatalogue.java',import.meta.url)),output,jar],{cwd:temporary,timeout:120000,maxBuffer:4*1024*1024});
    return await readFile(output);
  } catch (error) {
    const failure = error as Error & { stdout?: string; stderr?: string };
    throw new Error(`Catalogue export requires Java 25+ and the installed Java 26.2 libraries. Use --java to select Java. ${failure.stdout?.slice(0,1500) ?? failure.message}\n${failure.stderr?.slice(0,1000) ?? ''}`);
  } finally { await rm(temporary,{recursive:true,force:true}); }
}

export async function extractCatalogue(data: Buffer, resolver: Resolver, images: ImageStore): Promise<{ catalogue: NonNullable<AssetManifest['catalogue']>; sha256: string }> {
  const input = exportSchema.parse(json(data,'catalogue export'));
  const baker = new ItemModelBaker(resolver,images,input.specialGeometry,input.dyeColors), items = new Map<string,CatalogueItem>(), categories: NonNullable<AssetManifest['catalogue']>['categories'] = [];
  const language: Record<string,string> = {};
  for (const resource of (await resolver.stack('assets/minecraft/lang/en_us.json')).reverse()) Object.assign(language,json(resource.data,'en_us.json'));
  // Categories first preserves their own game order; the search tab adds search-only variants.
  for (const tab of [...input.tabs.filter(tab=>tab.kind === 'CATEGORY'),...input.tabs.filter(tab=>tab.kind === 'SEARCH')]) {
    const category = categoryIds[tab.id.replace('minecraft:','')], keys: string[] = [];
    for (const entry of tab.items) {
      const components = canonical(entry.stack.components) as Record<string,unknown>;
      const stackKey = entry.id + (Object.keys(components).length ? `@${hash(JSON.stringify(components)).slice(0,24)}` : '');
      keys.push(stackKey);
      let item = items.get(stackKey);
      if (!item) {
        const label = !Object.keys(components).length && entry.translationKey && language[entry.translationKey] || entry.label;
        item = {id:entry.id,stackKey,label,maxStackSize:entry.maxStackSize,components,categories:[],tags:entry.tags,tooltip:entry.tooltip.length ? [label,...entry.tooltip.slice(1)] : [label]};
        if (entry.damage !== undefined) item.damage = entry.damage;
        if (entry.maxDamage !== undefined) item.maxDamage = entry.maxDamage;
        if (entry.glint !== undefined) item.glint = entry.glint;
        if (entry.styledTooltip) item.styledTooltip = entry.styledTooltip.map((line,index)=>index === 0 && label !== entry.label ? [{...line[0],text:label}] : line);
        try { item.icon = await baker.bake(entry.id,entry.colors,components); }
        catch (error) { item.iconWarning = error instanceof Error ? error.message : String(error); }
        items.set(stackKey,item);
      }
      if (category && !item.categories.includes(category)) item.categories.push(category);
    }
    if(category) categories.push({id:category,label:tab.label,items:keys});
  }
  const entries = [...items.values()];
  buildItemAtlases(entries, images);
  return {catalogue:{items:entries,categories},sha256:hash(data)};
}
