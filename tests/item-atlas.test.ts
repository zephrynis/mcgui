import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { itemIconSchema, type CatalogueItem } from '../packages/core/src/index.js';
import { buildItemAtlases } from '../packages/assets/src/item-atlas.js';
import { ImageStore } from '../packages/assets/src/images.js';
import { extractAssets, validateBundle } from '../packages/assets/src/index.js';
import { ItemIcon, MinecraftProvider } from '../packages/react/src/index.js';
import { fixture, png } from './fixtures.js';

function catalogueItem(file: string, pixelWidth: number, pixelHeight: number, id = file): CatalogueItem {
  return { id, stackKey:id, label:id, maxStackSize:64, categories:[], tags:[], components:{}, tooltip:[id],
    icon:{file,pixelWidth,pixelHeight,kind:'flat'} };
}

test('atlases preserve every RGBA pixel, deduplicate, bound pages and keep oversized textures separate', () => {
  const images = new ImageStore();
  const items = Array.from({length:150}, (_, i) => {
    const width = [16,32,64,96][i%4], height = [64,16,32][i%3];
    const image = new PNG({width,height});
    for (let p=0; p<image.data.length; p+=4) image.data.set([i,(p/4)%256,(p/4/width)%256,p%12 ? 255 : 64],p);
    return catalogueItem(images.add(PNG.sync.write(image),'fixture').file,width,height);
  });
  items.push(structuredClone(items[0]));
  const large = images.add(png(512,16,[20,40,60,255]),'large');
  items.push(catalogueItem(large.file,512,16));
  buildItemAtlases(items,images);
  const pages = new Map<string,PNG>();
  for (const item of items.slice(0,-1)) {
    const icon = item.icon!, atlas = icon.atlas!;
    assert.ok(atlas); assert.ok(atlas.pixelWidth <= 512 && atlas.pixelHeight <= 512);
    itemIconSchema.parse(icon);
    if (!pages.has(atlas.file)) pages.set(atlas.file, PNG.sync.read(images.files.get(atlas.file)!));
    const sheet = pages.get(atlas.file)!, original = PNG.sync.read(images.files.get(icon.file)!);
    const crop = new PNG({width:icon.pixelWidth,height:icon.pixelHeight});
    PNG.bitblt(sheet,crop,atlas.x,atlas.y,icon.pixelWidth,icon.pixelHeight,0,0);
    assert.deepEqual(crop.data,original.data);
    assert.equal(sheet.data[((atlas.y-1)*sheet.width+atlas.x)*4+3],0,'transparent gutter');
  }
  assert.ok(pages.size > 1); assert.deepEqual(items[0].icon!.atlas,items[150].icon!.atlas);
  assert.equal(items.at(-1)!.icon!.atlas,undefined);
  const first = JSON.stringify(items); buildItemAtlases(items,images); assert.equal(JSON.stringify(items),first);
});

test('atlas metadata validates paths, integer coordinates and bounds; bundle validation checks sheet files', async t => {
  const f = await fixture(); t.after(()=>rm(f.root,{recursive:true,force:true}));
  const manifest = await extractAssets({clientJar:f.vanilla,out:f.out,characters:'?'});
  const images = new ImageStore(), source = images.add(png(16,32,[255,100,0,255]),'item');
  const item = catalogueItem(source.file,16,32);
  buildItemAtlases([item],images);
  manifest.catalogue = {items:[item],categories:[]};
  for (const [file,data] of images.files) await writeFile(path.join(f.out,file),data);
  const manifestFile = path.join(f.out,'manifest.json');
  await writeFile(manifestFile,JSON.stringify(manifest));
  assert.deepEqual(await validateBundle(f.out),manifest);
  const icon = item.icon!, atlas = icon.atlas!;
  for (const changes of [{x:-1},{x:.5},{x:atlas.pixelWidth},{y:atlas.pixelHeight},{file:'../outside.png'}]) {
    assert.equal(itemIconSchema.safeParse({...icon,atlas:{...atlas,...changes}}).success,false);
  }
  assert.ok(itemIconSchema.safeParse({...icon,atlas:undefined}).success,'old bundles remain valid');
  await writeFile(manifestFile,JSON.stringify({...manifest,catalogue:{...manifest.catalogue,items:[{...item,icon:{...icon,atlas:{...atlas,pixelWidth:atlas.pixelWidth+1}}}]}}));
  await assert.rejects(validateBundle(f.out),/dimensions/);
  await writeFile(manifestFile,JSON.stringify(manifest));
  const sheet = path.join(f.out,atlas.file), bytes = await readFile(sheet);
  await writeFile(sheet,Buffer.concat([bytes,Buffer.from('modified')]));
  await assert.rejects(validateBundle(f.out),/hash mismatch/);
  await rm(sheet); await assert.rejects(validateBundle(f.out),/ENOENT/);
});

test('ItemIcon renders atlas crops during SSR, fits rectangular icons and supports legacy bundles', async t => {
  const f = await fixture(); t.after(()=>rm(f.root,{recursive:true,force:true}));
  const manifest = await extractAssets({clientJar:f.vanilla,out:f.out,characters:'?'});
  const images = new ImageStore(), source = images.add(png(16,32,[255,0,0,255]),'item');
  const item = catalogueItem(source.file,16,32,'test:rectangle'); buildItemAtlases([item],images);
  manifest.catalogue = {items:[item],categories:[]};
  const render = () => renderToString(createElement(MinecraftProvider,{assets:manifest,baseUrl:'/nested/mcgui',scale:2,
    children:createElement(ItemIcon,{stackKey:item.stackKey})}));
  const html = render();
  assert.match(html,/mcgui-item-atlas/); assert.ok(html.includes(`/nested/mcgui/${item.icon!.atlas!.file}`));
  assert.match(html,/clip-path:inset\(0% 25%\)/); assert.doesNotMatch(html,/NaN|undefined/);
  const fractional = renderToString(createElement(MinecraftProvider,{assets:manifest,baseUrl:'/nested/mcgui',scale:3,
    children:createElement(ItemIcon,{stackKey:item.stackKey})}));
  assert.doesNotMatch(fractional,/mcgui-item-atlas/,'fractional resampling retains original pixels');
  delete item.icon!.atlas;
  assert.doesNotMatch(render(),/mcgui-item-atlas/); assert.ok(render().includes(`/nested/mcgui/${item.icon!.file}`));
});
