import { mkdir, readFile, readdir, lstat, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { JAVA_26_2, parseManifest, resourcePath, type AssetManifest, type SpriteRole, type SpriteAsset } from '@mcgui/core';
import { openSource, Resolver, json, hash, safePath, type ResourceSource, type Layer } from './resources.js';
import { ImageStore, parseScaling } from './images.js';
import { DEFAULT_CHARACTERS, extractFont } from './fonts.js';
import { launcherFonts } from './launcher-fonts.js';
import { exportCatalogue, extractCatalogue, type CatalogueOptions } from './catalogue.js';
export { exportCatalogue, type CatalogueOptions } from './catalogue.js';

export { DEFAULT_CHARACTERS } from './fonts.js';
export interface ExtractOptions extends CatalogueOptions { clientJar: string; version?: string; packs?: string[]; out: string; characters?: string; items?: boolean }
const versionSchema = z.object({ id: z.literal('26.2'), pack_version: z.object({ resource_major: z.literal(88), resource_minor: z.literal(0) }) });
const formatSchema = z.union([z.number().int().nonnegative(), z.array(z.number().int().nonnegative()).min(1).max(2)]);
const rangeSchema = z.object({ min_format: formatSchema, max_format: formatSchema });
const packSchema = z.object({
  pack: rangeSchema, filter: z.unknown().optional(),
  overlays: z.object({ entries: z.array(rangeSchema.extend({ directory: z.string().regex(/^[a-zA-Z0-9_.-]+$/) })).max(100) }).optional(),
});
function includesVersion(range: z.infer<typeof rangeSchema>): boolean {
  const min = typeof range.min_format === 'number' ? [range.min_format, 0] : [range.min_format[0]!, range.min_format[1] ?? 0];
  const max = typeof range.max_format === 'number' ? [range.max_format, 2147483647] : [range.max_format[0]!, range.max_format[1] ?? 2147483647];
  if (min[0]! > max[0]! || (min[0] === max[0] && min[1]! > max[1]!)) throw new Error('Resource-pack format range is inverted.');
  return (min[0]! < 88 || (min[0] === 88 && min[1] === 0)) && max[0]! >= 88;
}

export async function extractAssets(options: ExtractOptions): Promise<AssetManifest> {
  if (options.version && options.version !== JAVA_26_2.version) throw new Error('Only Java 26.2 is supported by this release.');
  const sources: ResourceSource[] = [];
  try {
    const vanilla = await openSource(options.clientJar, 'vanilla'); sources.push(vanilla);
    const version = await vanilla.read('version.json');
    if (!version) throw new Error('Expected a Minecraft client JAR with version.json.');
    versionSchema.parse(json(version, 'version.json'));
    const layers: Layer[] = [{ source: vanilla, prefix: '' }];
    const fonts = await launcherFonts(options.clientJar, options.versionMetadata);
    if (fonts) { sources.push(fonts); layers.push({ source: fonts, prefix: '' }); }
    for (let i = 0; i < (options.packs ?? []).length; i++) {
      const pack = await openSource(options.packs![i]!, `pack-${i + 1}`); sources.push(pack);
      const raw = await pack.read('pack.mcmeta');
      if (!raw) throw new Error(`${pack.name}: pack.mcmeta must be at the root of the ZIP or directory.`);
      const metadata = packSchema.parse(json(raw, `${pack.name}/pack.mcmeta`));
      if (!includesVersion(metadata.pack)) throw new Error(`${pack.name} does not support resource-pack format 88.0 (Java 26.2).`);
      if (metadata.filter !== undefined) throw new Error(`${pack.name}: resource filtering is not supported in 0.1.`);
      layers.push({ source: pack, prefix: '' });
      for (const overlay of metadata.overlays?.entries ?? []) {
        safePath(overlay.directory);
        if (includesVersion(overlay)) layers.push({ source: pack, prefix: `${overlay.directory}/` });
      }
    }
    const resolver = new Resolver(layers);
    const atlasName = 'assets/minecraft/atlases/gui.json';
    const atlases = await resolver.stack(atlasName);
    if (atlases.some(atlas => atlas.source !== 'vanilla')) throw new Error('Custom GUI atlas definitions are not supported in 0.1. Use standard textures/gui/sprites replacements.');
    const images = new ImageStore();
    const sprites: Partial<Record<SpriteRole, SpriteAsset>> = {};
    for (const [role, id] of Object.entries({ ...JAVA_26_2.buttons, ...JAVA_26_2.inventory, ...JAVA_26_2.controls, ...JAVA_26_2.progress, ...JAVA_26_2.creative, ...JAVA_26_2.villager })) {
      const name = resourcePath(id, 'textures/gui/sprites', '.png');
      const resource = await resolver.get(name);
      const { file, png } = images.add(resource.data, name);
      sprites[role as SpriteRole] = { id, file, pixelWidth: png.width, pixelHeight: png.height,
        scaling: parseScaling(await resolver.metadata(name, resource.layer), name), source: resource.source };
    }
    const textures: NonNullable<AssetManifest['textures']> = {};
    for (const [role, id] of Object.entries(JAVA_26_2.containers)) {
      const name = resourcePath(id, 'textures', '.png');
      const resource = await resolver.get(name);
      // Container artwork uses fixed UV regions, not GUI sprite scaling metadata.
      parseScaling(await resolver.metadata(name, resource.layer), name);
      const { file, png } = images.add(resource.data, name);
      const logicalWidth = role === 'container.villager' ? 512 : 256;
      if (png.width % logicalWidth || png.height !== png.width * 256 / logicalWidth) throw new Error(`${role} texture must be ${role === 'container.villager' ? 'an integer multiple of the 512×256 logical sheet' : 'a square integer multiple of the 256×256 logical sheet'}.`);
      textures[role as keyof typeof textures] = { id, file, pixelWidth: png.width, pixelHeight: png.height,
        logicalWidth, logicalHeight: 256, source: resource.source };
    }
    const font = await extractFont(resolver, images, options.characters ?? DEFAULT_CHARACTERS);
    const itemAssets = options.items ? await extractCatalogue(await exportCatalogue(options.clientJar,options),resolver,images) : undefined;
    if (options.items) {
      const name = 'assets/minecraft/textures/misc/enchanted_glint_item.png';
      const resource = await resolver.get(name), {file,png} = images.add(resource.data,name);
      parseScaling(await resolver.metadata(name,resource.layer),name);
      textures['item.glint'] = {id:'minecraft:misc/enchanted_glint_item',file,pixelWidth:png.width,pixelHeight:png.height,logicalWidth:128,logicalHeight:128,source:resource.source};
    }
    const missingIcons = itemAssets?.catalogue.items.filter(item=>!item.icon).length ?? 0;
    const manifest = parseManifest({
      schemaVersion: 1, generatorVersion: '0.1.0', minecraft: { edition: 'java', version: '26.2', resourcePackFormat: 88 },
      sources: [...sources.map(source => ({ name: source.name, sha256: source.fingerprint() })),...(itemAssets ? [{name:'catalogue',sha256:itemAssets.sha256}] : [])], sprites, font,
      textures, ...(itemAssets ? {catalogue:itemAssets.catalogue} : {}),
      capabilities: ['button', 'checkbox', 'slider', 'progress', 'furnace', 'villager-trading', 'creative-inventory', 'slot', 'inventory-grid', 'chest', 'tooltip', 'static-text', 'bitmap-font', 'nine-slice', 'pack-overlays', ...(itemAssets ? ['item-icons','special-item-models','static-item-previews'] : [])],
      warnings: ['Only the requested glyphs and supported GUI resources are included. Unsupported text characters render as ?.', ...(itemAssets ? [`${itemAssets.catalogue.items.length - missingIcons}/${itemAssets.catalogue.items.length} static inventory icons baked. ${missingIcons} unsupported; see item iconWarning fields. Animation and world-state previews are described in icon.notes. Pixel parity with the running game remains unverified.`] : [])],
    });
    await writeBundle(options.out, manifest, images);
    return manifest;
  } finally { for (const source of sources) source.close(); }
}

async function writeBundle(out: string, manifest: AssetManifest, images: ImageStore): Promise<void> {
  const target = path.resolve(out), parent = path.dirname(target);
  await mkdir(parent, { recursive: true });
  let exists = false;
  try {
    const stat = await lstat(target); exists = true;
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Output must be a directory, not a file or symlink.');
    const names = await readdir(target);
    if (names.length) {
      const marker = await readFile(path.join(target, '.mcgui-generated'), 'utf8').catch(() => '');
      if (marker !== 'mcgui-assets-v1\n') throw new Error('Output directory contains unmanaged files; choose an empty directory.');
      if (names.some(name => !['.mcgui-generated', 'manifest.json', 'diagnostics.json', 'files'].includes(name))) throw new Error('Output contains unmanaged files; refusing to replace it.');
      for (const name of names) if ((await lstat(path.join(target, name))).isSymbolicLink()) throw new Error('Output contains a symbolic link.');
      for (const entry of await readdir(path.join(target, 'files'), { withFileTypes: true })) {
        if (!entry.isFile() || !/^[a-f0-9]{64}\.png$/.test(entry.name)) throw new Error('Output contains unmanaged asset files.');
      }
    }
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const temporary = await mkdtemp(path.join(parent, '.mcgui-build-'));
  let backup: string | undefined;
  try {
    await mkdir(path.join(temporary, 'files'));
    for (const [file, data] of images.files) await writeFile(path.join(temporary, file), data);
    await writeFile(path.join(temporary, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    await writeFile(path.join(temporary, 'diagnostics.json'), JSON.stringify({ warnings: manifest.warnings, sources: manifest.sources, items: manifest.catalogue?.items.filter(item=>item.iconWarning).map(item=>({stackKey:item.stackKey,reason:item.iconWarning})), previews:manifest.catalogue?.items.filter(item=>item.icon?.notes?.length).map(item=>({stackKey:item.stackKey,notes:item.icon!.notes})) }, null, 2) + '\n');
    await writeFile(path.join(temporary, '.mcgui-generated'), 'mcgui-assets-v1\n');
    if (exists) { backup = `${temporary}-previous`; await rename(target, backup); }
    try { await rename(temporary, target); }
    catch (error) { if (backup) { await rename(backup, target); backup = undefined; } throw error; }
    if (backup) await rm(backup, { recursive: true });
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

export async function validateBundle(directory: string): Promise<AssetManifest> {
  const manifest = parseManifest(JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8')));
  const resources = [...Object.values(manifest.sprites), ...Object.values(manifest.textures ?? {}),...(manifest.catalogue?.items.flatMap(item=>item.icon ? [item.icon, ...(item.icon.atlas ? [item.icon.atlas] : [])] : []) ?? [])].filter(value => value !== undefined);
  const files = new Set(resources.map(sprite => sprite.file));
  for (const glyph of Object.values(manifest.font.glyphs)) if (glyph.image) files.add(glyph.image.file);
  const images = new ImageStore();
  for (const file of files) {
    const data = await readFile(path.join(directory, file));
    if (hash(data) !== path.basename(file, '.png')) throw new Error(`Asset hash mismatch: ${file}`);
    images.add(data, file);
  }
  for (const entry of [...resources, ...Object.values(manifest.font.glyphs).flatMap(glyph => glyph.image ? [glyph.image] : [])]) {
    const png = images.add(images.files.get(entry.file)!, entry.file).png;
    if (png.width !== entry.pixelWidth || png.height !== entry.pixelHeight) throw new Error(`Asset dimensions do not match manifest: ${entry.file}`);
  }
  if (!manifest.font.glyphs['?']) throw new Error('Manifest needs a ? fallback glyph.');
  return manifest;
}

export interface Installation { version: string; clientJar: string; root: string; supported: boolean }
export async function listInstallations(root?: string): Promise<Installation[]> {
  const home = homedir();
  const roots = root ? [root] : [path.join(home, '.minecraft'), path.join(home, '.local/share/PrismLauncher'),
    path.join(home, '.var/app/org.prismlauncher.PrismLauncher/data/PrismLauncher'), path.join(home, 'Library/Application Support/minecraft'),
    path.join(home, 'Library/Application Support/PrismLauncher'), ...(process.env.APPDATA ? [path.join(process.env.APPDATA, '.minecraft'), path.join(process.env.APPDATA, 'PrismLauncher')] : [])];
  const found: Installation[] = [];
  for (const base of roots) for (const kind of ['versions', 'libraries/com/mojang/minecraft']) {
    const directory = path.join(base, kind);
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const jar = path.join(directory, entry.name, kind === 'versions' ? `${entry.name}.jar` : `minecraft-${entry.name}-client.jar`);
      if ((await lstat(jar).catch(() => undefined))?.isFile()) found.push({ version: entry.name, clientJar: jar, root: base, supported: entry.name === '26.2' });
    }
  }
  return found.sort((a, b) => a.clientJar.localeCompare(b.clientJar));
}
