import { PNG } from 'pngjs';
import { scalingSchema, type Scaling } from '@mcgui/core';
import { z } from 'zod';
import { hash } from './resources.js';

export function decodePng(data: Buffer, name: string): PNG {
  if (data.length < 24 || !data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error(`Expected PNG: ${name}`);
  const width = data.readUInt32BE(16), height = data.readUInt32BE(20);
  if (!width || !height || width > 8192 || height > 8192 || width * height > 16 * 1024 * 1024) throw new Error(`Image dimensions exceed limits: ${name}`);
  try { return PNG.sync.read(data, { checkCRC: true }); }
  catch { throw new Error(`Invalid PNG: ${name}`); }
}

export class ImageStore {
  readonly files = new Map<string, Buffer>();
  private decoded = new Map<string, PNG>();
  add(data: Buffer, name: string): { file: string; png: PNG } {
    const file = `files/${hash(data)}.png`;
    let png = this.decoded.get(file);
    if (!png) { png = decodePng(data, name); this.decoded.set(file, png); this.files.set(file, data); }
    return { file, png };
  }
}

const metadataSchema = z.object({ gui: z.object({ scaling: z.unknown().optional() }).optional(), animation: z.unknown().optional() });
const scalingInput = z.discriminatedUnion('type', [
  z.object({ type: z.literal('stretch') }),
  z.object({ type: z.literal('tile'), width: z.number(), height: z.number() }),
  z.object({ type: z.literal('nine_slice'), width: z.number(), height: z.number(),
    border: z.union([z.number().int().nonnegative(), z.object({ left: z.number(), top: z.number(), right: z.number(), bottom: z.number() })]),
    stretch_inner: z.boolean().default(false),
  }),
]);
export function parseScaling(metadata: unknown, name: string): Scaling {
  const parsed = metadataSchema.parse(metadata);
  if (parsed.animation !== undefined) throw new Error(`Animated sprites are not supported in 0.1: ${name}`);
  const input = scalingInput.parse(parsed.gui?.scaling ?? { type: 'stretch' });
  if (input.type !== 'nine_slice') return scalingSchema.parse(input);
  const border = typeof input.border === 'number' ? { left: input.border, top: input.border, right: input.border, bottom: input.border } : input.border;
  return scalingSchema.parse({ ...input, border, stretchInner: input.stretch_inner });
}
