import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';
import { fixture, pack, png, put } from './fixtures.js';
import { extractAssets, validateBundle } from '../packages/assets/src/index.js';
import { collectInventory, swapInventory, type ItemStack } from '../packages/core/src/index.js';
import { openSource, Resolver } from '../packages/assets/src/resources.js';
import { ImageStore } from '../packages/assets/src/images.js';
import { ItemModelBaker } from '../packages/assets/src/item-models.js';

test('GUI cube lighting matches Java 26.2: bright top, shaded sides, unchanged flat/unshaded models', async () => {
  const f = await fixture();
  try {
    await put(f.vanilla, 'assets/minecraft/textures/item/white.png', png(16, 16, [255, 255, 255, 255]));
    const cube = {
      textures: { all: 'minecraft:item/white' },
      display: { gui: { rotation: [30, 225, 0], scale: [.625, .625, .625] } },
      elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces: Object.fromEntries(['up', 'down', 'north', 'south', 'east', 'west'].map(face => [face, { texture: '#all' }])) }],
    };
    for (const variant of ['side', 'front', 'unshaded']) {
      await put(f.vanilla, `assets/minecraft/items/${variant}.json`, { model: { type: 'minecraft:model', model: `minecraft:item/${variant}` } });
      await put(f.vanilla, `assets/minecraft/models/item/${variant}.json`, { ...cube, gui_light: variant === 'front' ? 'front' : 'side',
        elements: [{ ...cube.elements[0], shade: variant !== 'unshaded' }] });
    }
    const source = await openSource(f.vanilla, 'vanilla');
    try {
      const images = new ImageStore(), baker = new ItemModelBaker(new Resolver([{ source, prefix: '' }]), images);
      for (const variant of ['side', 'front', 'unshaded']) {
        const icon = await baker.bake(`minecraft:${variant}`), image = PNG.sync.read(images.files.get(icon.file)!);
        // Independent reference: the client's JOML light/normal matrices and
        // light.glsl give top=1, east=.65053725, north=.4 for a white cube.
        for (const [x, y, expected] of [[32, 15, 255], [18, 39, 166], [46, 39, 102]]) {
          const pixel = [...image.data.subarray((y * 64 + x) * 4, (y * 64 + x) * 4 + 4)];
          const value = variant === 'side' ? expected : 255;
          assert.deepEqual(pixel, [value, value, value, 255], `${variant} at ${x},${y}`);
        }
      }
    } finally { source.close(); }
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test('model UV rotation and grass colormaps use source pixels',async()=>{
  const f=await fixture();
  try {
    const texture=new PNG({width:2,height:2});texture.data.set([255,0,0,255,0,255,0,255,0,0,255,255,255,255,255,255]);
    await put(f.vanilla,'assets/minecraft/textures/item/quad.png',PNG.sync.write(texture));
    await put(f.vanilla,'assets/minecraft/items/quad.json',{model:{type:'minecraft:model',model:'minecraft:item/quad'}});
    await put(f.vanilla,'assets/minecraft/models/item/quad.json',{gui_light:'front',textures:{all:'minecraft:item/quad'},elements:[{from:[0,0,0],to:[16,16,16],faces:{south:{texture:'#all',rotation:90}}}]});
    await put(f.vanilla,'assets/minecraft/textures/colormap/grass.png',png(256,256,[20,180,70,255]));
    await put(f.vanilla,'assets/minecraft/textures/item/white.png',png(16,16,[255,255,255,255]));
    await put(f.vanilla,'assets/minecraft/models/item/grass.json',{parent:'minecraft:builtin/generated',textures:{layer0:'minecraft:item/white'}});
    await put(f.vanilla,'assets/minecraft/items/grass.json',{model:{type:'minecraft:model',model:'minecraft:item/grass',tints:[{type:'minecraft:grass',temperature:.5,downfall:1}]}});
    const source=await openSource(f.vanilla,'vanilla');
    try {
      const images=new ImageStore(),baker=new ItemModelBaker(new Resolver([{source,prefix:''}]),images);
      const quad=await baker.bake('minecraft:quad'),image=PNG.sync.read(images.files.get(quad.file)!);
      assert.deepEqual([...image.data.subarray((8*64+8)*4,(8*64+8)*4+4)],[0,255,0,255]);
      assert.deepEqual([...image.data.subarray((56*64+56)*4,(56*64+56)*4+4)],[0,0,255,255]);
      const grass=await baker.bake('minecraft:grass');assert.deepEqual([...PNG.sync.read(images.files.get(grass.file)!).data.subarray(0,4)],[20,180,70,255]);
    } finally {source.close();}
  } finally {await rm(f.root,{recursive:true,force:true});}
});

test('catalogue preserves component identity, category order and stack limits; packs replace inherited model textures', async () => {
  const f=await fixture();
  try {
    const source=path.join(f.root,'catalogue.json'), overlay=await pack(f.root);
    const item=(id:string,components:Record<string,unknown>={})=>({id:`minecraft:${id}`,label:id,maxStackSize:16,stack:{id:`minecraft:${id}`,components},tags:['minecraft:sample'],tooltip:[id,'Details'],colors:{potion:0x80ff40}});
    await put(f.root,'catalogue.json',{version:'26.2',tabs:[{id:'minecraft:ingredients',label:'Ingredients',kind:'CATEGORY',items:[item('gem'),item('gem',{'minecraft:potion_contents':'red'}),item('block'),item('special')]},{id:'minecraft:search',label:'Search',kind:'SEARCH',items:[item('gem',{'minecraft:potion_contents':'red'})]}]});
    await put(f.vanilla,'assets/minecraft/items/gem.json',{model:{type:'minecraft:model',model:'minecraft:item/gem',tints:[{type:'minecraft:potion',default:0xffffff}]}});
    await put(f.vanilla,'assets/minecraft/models/item/gem.json',{parent:'minecraft:item/parent',textures:{layer0:'minecraft:item/gem'}});
    await put(f.vanilla,'assets/minecraft/models/item/parent.json',{parent:'minecraft:builtin/generated'});
    await put(f.vanilla,'assets/minecraft/textures/item/gem.png',png(16,16,[255,255,255,255]));
    await put(f.vanilla,'assets/minecraft/items/block.json',{model:{type:'minecraft:model',model:'minecraft:block/custom'}});
    await put(f.vanilla,'assets/minecraft/models/block/custom.json',{gui_light:'front',textures:{all:{sprite:'minecraft:item/gem',force_translucent:true}},elements:[{from:[0,0,0],to:[16,16,16],faces:{south:{texture:'#all'}}}]});
    await put(f.vanilla,'assets/minecraft/items/special.json',{model:{type:'minecraft:special',base:'minecraft:item/gem',model:{type:'example:unknown'}}});
    const options={clientJar:f.vanilla,out:f.out,items:true,catalogueFile:source,characters:'?'};
    const first=await extractAssets(options), entries=first.catalogue!.items;
    assert.equal(entries.length,4);assert.notEqual(entries[0].stackKey,entries[1].stackKey);assert.equal(entries[0].maxStackSize,16);
    assert.deepEqual(entries[0].tags,['minecraft:sample']);assert.deepEqual(first.catalogue!.categories[0].items,entries.map(i=>i.stackKey));
    assert.match(entries[3].iconWarning!,/Unsupported special renderer/);assert.equal(entries[2].icon!.kind,'model');
    const flat=PNG.sync.read(await readFile(path.join(f.out,entries[0].icon!.file)));
    assert.deepEqual([...flat.data.subarray(0,4)],[128,255,64,255]);
    const block=PNG.sync.read(await readFile(path.join(f.out,entries[2].icon!.file)));assert.deepEqual([...block.data.subarray((32*64+32)*4,(32*64+32)*4+4)],[255,255,255,255]);
    assert.deepEqual(await validateBundle(f.out),first);
    await put(overlay,'assets/minecraft/textures/item/gem.png',png(32,32,[100,50,200,255]));
    const second=await extractAssets({...options,packs:[overlay]});
    assert.notEqual(second.catalogue!.items[0].icon!.file,entries[0].icon!.file);assert.notEqual(second.catalogue!.items[2].icon!.file,entries[2].icon!.file);
    assert.equal(second.catalogue!.items[0].icon!.pixelWidth,32);assert.equal(second.catalogue!.items[1].stackKey,entries[1].stackKey);
    assert.deepEqual(await validateBundle(f.out),second);
    await put(overlay,'assets/minecraft/models/item/gem.json',{parent:'minecraft:item/gem'});
    const cycle=await extractAssets({...options,packs:[overlay]});assert.match(cycle.catalogue!.items[0].iconWarning!,/cycle/);
  } finally {await rm(f.root,{recursive:true,force:true});}
});

test('number/offhand swaps respect both destinations, preserve cursor and never split a stack',()=>{
  const a:ItemStack={stackKey:'gem',count:16,maxStackSize:16},b:ItemStack={stackKey:'tool',count:1,maxStackSize:1};
  const state={slots:[a,b,null],carried:a};
  const swapped=swapInventory(state,0,1);assert.deepEqual(swapped.slots,[b,a,null]);assert.equal(swapped.carried,a);assert.equal(state.slots[0],a);
  assert.equal(swapInventory(state,0,1,{canPlace:index=>index!==1}),state);
  assert.equal(swapInventory(state,0,2,{maxCount:()=>1}),state);
  assert.equal(swapInventory(state,0,1,{canTake:index=>index!==1}),state);
  assert.deepEqual(swapInventory(state,0,2).slots,[null,b,a]);
});

test('double-click collection takes partial stacks first, respects locks and component identity, and conserves overflow',()=>{
  const item=(count:number,stackKey='gem'):ItemStack=>({stackKey,count,maxStackSize:16});
  const state={slots:[item(16),item(3),item(4,'gem@variant'),item(2)],carried:item(10)};
  const result=collectInventory(state,[0,1,2,3,1]);assert.deepEqual(result.slots.map(i=>i?.count ?? 0),[15,0,4,0]);assert.equal(result.carried!.count,16);
  const locked=collectInventory(state,[0,1,2,3],{canTake:index=>index!==1});assert.deepEqual(locked.slots.map(i=>i?.count ?? 0),[12,3,4,0]);
  assert.equal(collectInventory({...state,carried:null},[0]).carried,null);assert.equal(state.slots[0].count,16);
});
