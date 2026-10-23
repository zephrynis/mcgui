import { createHash } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import yauzl, { type Entry, type ZipFile } from 'yauzl';

const MAX_FILE = 16 * 1024 * 1024;
const MAX_TOTAL = 128 * 1024 * 1024;
export function safePath(name: string): string {
  if (!name || name.includes('\\') || name.includes('\0') || name.startsWith('/') || /^[A-Za-z]:/.test(name) || name.split('/').some(p => p === '..' || p === '.')) {
    throw new Error(`Unsafe archive path: ${name}`);
  }
  return name;
}
export function hash(data: Uint8Array | string): string { return createHash('sha256').update(data).digest('hex'); }

export class ResourceSource {
  readonly used = new Map<string, string>();
  readonly cache = new Map<string, Buffer>();
  private total = 0;
  constructor(readonly name: string, readonly names: Set<string>, private reader: (name: string) => Promise<Buffer>, private closer: () => void = () => {}) {}
  async read(name: string): Promise<Buffer | undefined> {
    safePath(name);
    if (!this.names.has(name)) return undefined;
    if (this.cache.has(name)) return this.cache.get(name)!;
    const data = await this.reader(name);
    this.total += data.length;
    if (data.length > MAX_FILE || this.total > MAX_TOTAL) throw new Error(`Resource limit exceeded in ${this.name}: ${name}`);
    this.used.set(name, hash(data)); this.cache.set(name, data);
    return data;
  }
  fingerprint(): string { return hash(JSON.stringify([...this.used].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))); }
  close(): void { this.closer(); }
}

export async function openSource(filename: string, name: string): Promise<ResourceSource> {
  const stat = await lstat(filename);
  if (stat.isSymbolicLink()) throw new Error(`Symbolic links are not supported: ${filename}`);
  if (stat.isDirectory()) {
    const names = new Set<string>();
    async function walk(prefix: string, depth: number) {
      if (depth > 32) throw new Error('Resource directory is too deeply nested.');
      for (const entry of await readdir(path.join(filename, prefix), { withFileTypes: true })) {
        const relative = safePath(`${prefix}${entry.name}`);
        if (entry.isSymbolicLink()) throw new Error(`Symbolic links are not supported: ${relative}`);
        if (entry.isDirectory()) await walk(`${relative}/`, depth + 1);
        else if (entry.isFile()) names.add(relative);
        if (names.size > 200000) throw new Error('Too many resource files.');
      }
    }
    await walk('', 0);
    return new ResourceSource(name, names, async relative => {
      const target = path.join(filename, relative);
      if ((await lstat(target)).size > MAX_FILE) throw new Error(`Resource exceeds 16 MiB: ${relative}`);
      return readFile(target);
    });
  }
  const zip = await new Promise<ZipFile>((resolve, reject) => yauzl.open(filename, { lazyEntries: true, autoClose: false, strictFileNames: true }, (error, result) => error ? reject(error) : resolve(result!)));
  return zipSource(zip, name);
}

export async function openZipSource(data: Buffer, name: string): Promise<ResourceSource> {
  const zip = await new Promise<ZipFile>((resolve, reject) => yauzl.fromBuffer(data, { lazyEntries: true, autoClose: false, strictFileNames: true }, (error, result) => error ? reject(error) : resolve(result!)));
  return zipSource(zip, name);
}

async function zipSource(zip: ZipFile, name: string): Promise<ResourceSource> {
  const entries = new Map<string, Entry>();
  try {
    await new Promise<void>((resolve, reject) => {
      zip.on('error', reject);
      zip.on('end', resolve);
      zip.on('entry', (entry: Entry) => {
        try {
          safePath(entry.fileName);
          if (((entry.externalFileAttributes >>> 16) & 0o170000) === 0o120000) throw new Error(`ZIP symlink is not supported: ${entry.fileName}`);
          if (entries.has(entry.fileName)) throw new Error(`Duplicate ZIP entry: ${entry.fileName}`);
          entries.set(entry.fileName, entry);
          if (entries.size > 200000) throw new Error('Too many ZIP entries.');
          zip.readEntry();
        } catch (error) { reject(error); }
      });
      zip.readEntry();
    });
  } catch (error) { zip.close(); throw error; }
  return new ResourceSource(name, new Set(entries.keys()), async relative => {
    const entry = entries.get(relative)!;
    if (entry.uncompressedSize > MAX_FILE) throw new Error(`Resource exceeds 16 MiB: ${relative}`);
    return new Promise<Buffer>((resolve, reject) => zip.openReadStream(entry, (error, stream) => {
      if (error || !stream) { reject(error ?? new Error('Unable to read ZIP entry.')); return; }
      const chunks: Buffer[] = []; let length = 0;
      stream.on('data', (chunk: Buffer) => {
        length += chunk.length;
        if (length > MAX_FILE) stream.destroy(new Error(`Resource exceeds 16 MiB: ${relative}`));
        else chunks.push(chunk);
      });
      stream.on('error', reject); stream.on('end', () => resolve(Buffer.concat(chunks)));
    }));
  }, () => zip.close());
}

export type Layer = { source: ResourceSource; prefix: string };
export class Resolver {
  constructor(readonly layers: Layer[]) {}
  async stack(name: string): Promise<{ data: Buffer; source: string; layer: number }[]> {
    const results = [];
    const seen = new Set<ResourceSource>();
    for (let i = this.layers.length - 1; i >= 0; i--) {
      const layer = this.layers[i]!;
      if (seen.has(layer.source)) continue;
      const data = await layer.source.read(layer.prefix + name);
      if (data) { results.push({ data, source: layer.source.name, layer: i }); seen.add(layer.source); }
    }
    return results;
  }
  async get(name: string) {
    for (let i = this.layers.length - 1; i >= 0; i--) {
      const layer = this.layers[i]!;
      const data = await layer.source.read(layer.prefix + name);
      if (data) return { data, source: layer.source.name, layer: i };
    }
    throw new Error(`Missing required resource: ${name}`);
  }
  async metadata(name: string, imageLayer: number): Promise<unknown> {
    // Higher-priority metadata can override a lower image. A replacement image
    // does not inherit metadata from lower-priority packs.
    const imageSource = this.layers[imageLayer]!.source;
    const minimumLayer = this.layers.findIndex(layer => layer.source === imageSource);
    for (let i = this.layers.length - 1; i >= minimumLayer; i--) {
      const layer = this.layers[i]!;
      const data = await layer.source.read(layer.prefix + name + '.mcmeta');
      if (data) return json(data, `${name}.mcmeta`);
    }
    return {};
  }
}
export function json(data: Buffer, name: string): unknown {
  try { return JSON.parse(data.toString('utf8')); }
  catch { throw new Error(`Invalid JSON: ${name}`); }
}
