import test from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { PNG } from 'pngjs';
import { fixture, put, png, pack } from './fixtures.js';
import { openSource, Resolver } from '../packages/assets/src/resources.js';
import { ImageStore } from '../packages/assets/src/images.js';
import { ItemModelBaker } from '../packages/assets/src/item-models.js';
import { resolveItemNodes, type ItemNode } from '../packages/assets/src/item-definitions.js';
import type { SpecialGeometry } from '../packages/assets/src/special-models.js';

async function withBaker(root:string,fn:(baker:ItemModelBaker,images:ImageStore)=>Promise<void>,geometry:SpecialGeometry={},packs:string[]=[],dyes:Record<string,number>={}) {
  const sources=await Promise.all([root,...packs].map((file,index)=>openSource(file,index?'pack':'vanilla')));
  try {const images=new ImageStore();await fn(new ItemModelBaker(new Resolver(sources.map(source=>({source,prefix:''}))),images,geometry,dyes),images);}
  finally {sources.forEach(source=>source.close());}
}
const pixel=(image:PNG,x=0,y=0)=>[...image.data.subarray((y*image.width+x)*4,(y*image.width+x)*4+4)];
const leaf=(model:string):ItemNode=>({type:'minecraft:model',model});

test('item definitions select components and block states, preserve nested transforms, and reject unknown properties',()=>{
  const notes=new Set<string>(),node:ItemNode={type:'minecraft:condition',property:'minecraft:has_component',component:'minecraft:dyed_color',on_true:leaf('dyed'),on_false:leaf('plain'),transformation:{translation:[1,0,0]}};
  assert.equal(resolveItemNodes(node,{},notes)[0].node.model,'plain');
  assert.equal(resolveItemNodes(node,{'minecraft:dyed_color':0},notes)[0].node.model,'dyed');
  assert.deepEqual(resolveItemNodes(node,{},notes)[0].transforms,[{translation:[1,0,0]}]);
  const honey:ItemNode={type:'minecraft:select',property:'minecraft:block_state',block_state_property:'honey_level',cases:[{when:'5',model:leaf('full')}],fallback:leaf('empty')};
  assert.equal(resolveItemNodes(honey,{'minecraft:block_state':{honey_level:'5'}},notes)[0].node.model,'full');
  assert.equal(resolveItemNodes(honey,{},notes)[0].node.model,'empty');
  assert.throws(()=>resolveItemNodes({...honey,property:'example:unknown'}, {},notes),/Unsupported item selector/);
  const dial:ItemNode={type:'minecraft:range_dispatch',property:'minecraft:compass',entries:[{threshold:0,model:leaf('zero')},{threshold:1,model:leaf('one')}]};
  assert.equal(resolveItemNodes(dial,{},notes)[0].node.model,'zero');assert.ok([...notes].some(note=>note.includes('Static dial')));
});

test('animated textures use their first declared frame, report the snapshot and respect replacement metadata boundaries',async()=>{
  const f=await fixture();
  try {
    const strip=new PNG({width:16,height:32});
    for(let y=0;y<32;y++) for(let x=0;x<16;x++) strip.data.set(y<16?[255,0,0,255]:[0,255,0,255],(y*16+x)*4);
    const texture='assets/minecraft/textures/item/animated.png';
    await put(f.vanilla,texture,PNG.sync.write(strip));await put(f.vanilla,texture+'.mcmeta',{animation:{frames:[{index:1,time:2},0]}});
    await put(f.vanilla,'assets/minecraft/models/item/animated.json',{parent:'minecraft:builtin/generated',textures:{layer0:'minecraft:item/animated'}});
    await put(f.vanilla,'assets/minecraft/items/animated.json',{model:leaf('minecraft:item/animated')});
    await withBaker(f.vanilla,async(baker,images)=>{
      const icon=await baker.bake('minecraft:animated');assert.equal(icon.pixelHeight,16);assert.equal(icon.pixelWidth,16);
      assert.deepEqual(pixel(PNG.sync.read(images.files.get(icon.file)!)),[0,255,0,255]);assert.match(icon.notes!.join(' '),/first declared frame/);
    });
    const overlay=await pack(f.root);await put(overlay,texture,png(32,32,[0,0,255,255]));
    await withBaker(f.vanilla,async(baker,images)=>{
      const icon=await baker.bake('minecraft:animated');assert.equal(icon.pixelWidth,32);assert.equal(icon.notes,undefined);
      assert.deepEqual(pixel(PNG.sync.read(images.files.get(icon.file)!)),[0,0,255,255]);
    },{},[overlay]);
    await put(f.vanilla,texture+'.mcmeta',{animation:{frames:[7]}});
    await withBaker(f.vanilla,async baker=>{await assert.rejects(baker.bake('minecraft:animated'),/out of bounds/);});
  } finally {await rm(f.root,{recursive:true,force:true});}
});

test('composite layers share depth and apply item transformations before GUI projection',async()=>{
  const f=await fixture();
  try {
    for(const [name,color] of [['red',[255,0,0,255]],['green',[0,255,0,255]]] as const) {
      await put(f.vanilla,`assets/minecraft/textures/item/${name}.png`,png(16,16,[...color]));
      await put(f.vanilla,`assets/minecraft/models/item/${name}.json`,{gui_light:'front',textures:{all:`minecraft:item/${name}`},elements:[{from:[0,0,0],to:[16,16,8],faces:{south:{texture:'all'}}}]});
    }
    await put(f.vanilla,'assets/minecraft/items/composite.json',{model:{type:'minecraft:composite',models:[{...leaf('minecraft:item/green'),transformation:{translation:[.5,0,1]}},leaf('minecraft:item/red')]}});
    await withBaker(f.vanilla,async(baker,images)=>{
      const icon=await baker.bake('minecraft:composite'),image=PNG.sync.read(images.files.get(icon.file)!);
      assert.deepEqual(pixel(image,8,32),[255,0,0,255]);assert.deepEqual(pixel(image,48,32),[0,255,0,255]);
    });
  } finally {await rm(f.root,{recursive:true,force:true});}
});

test('translated generated layers preserve transparent pixels and firework colors use component data',async()=>{
  const f=await fixture();
  try {
    await put(f.vanilla,'assets/minecraft/textures/item/white.png',png(16,16,[255,255,255,255]));
    await put(f.vanilla,'assets/minecraft/models/item/translated.json',{parent:'minecraft:builtin/generated',textures:{layer0:'minecraft:item/white'},display:{gui:{translation:[0,4,0]}}});
    await put(f.vanilla,'assets/minecraft/items/translated.json',{model:{...leaf('minecraft:item/translated'),tints:[{type:'minecraft:firework',default:0x808080}]}});
    await withBaker(f.vanilla,async(baker,images)=>{
      const icon=await baker.bake('minecraft:translated',{}, {'minecraft:firework_explosion':{colors:[0xff0000,0x0000ff]}}),image=PNG.sync.read(images.files.get(icon.file)!);
      assert.deepEqual(pixel(image,32,16),[127,0,127,255]);assert.equal(pixel(image,32,60)[3],0);
    });
  } finally {await rm(f.root,{recursive:true,force:true});}
});

test('client mesh UVs use resource-pack textures and missing geometry asks for re-extraction',async()=>{
  const f=await fixture();
  const geometry:SpecialGeometry={'chest#main':[{part:'/test',vertices:[[0,0,8,0,16],[16,0,8,16,16],[16,16,8,16,0],[0,16,8,0,0]]}]};
  try {
    await put(f.vanilla,'assets/minecraft/models/item/chest.json',{gui_light:'front'});
    await put(f.vanilla,'assets/minecraft/items/chest.json',{model:{type:'minecraft:special',base:'minecraft:item/chest',model:{type:'minecraft:chest',texture:'minecraft:normal'}}});
    await put(f.vanilla,'assets/minecraft/textures/entity/chest/normal.png',png(16,16,[40,80,120,255]));
    await withBaker(f.vanilla,async(baker,images)=>{
      const icon=await baker.bake('minecraft:chest');assert.deepEqual(pixel(PNG.sync.read(images.files.get(icon.file)!),32,32),[40,80,120,255]);
    },geometry);
    const overlay=await pack(f.root);await put(overlay,'assets/minecraft/textures/entity/chest/normal.png',png(32,32,[120,80,40,255]));
    await withBaker(f.vanilla,async(baker,images)=>{
      const icon=await baker.bake('minecraft:chest');assert.deepEqual(pixel(PNG.sync.read(images.files.get(icon.file)!),32,32),[120,80,40,255]);
    },geometry,[overlay]);
    await withBaker(f.vanilla,async baker=>{await assert.rejects(baker.bake('minecraft:chest'),/re-export the catalogue/);});
  } finally {await rm(f.root,{recursive:true,force:true});}
});
