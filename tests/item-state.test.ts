import test from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { durabilityBar, measureText, plainText, wrapText, type TextRun } from '../packages/core/src/index.js';
import { MinecraftProvider, MinecraftText, ItemIcon, itemTooltip } from '../packages/react/src/index.js';
import { extractAssets } from '../packages/assets/src/index.js';
import { fixture, png, put } from './fixtures.js';

test('durability bars match Java geometry, color endpoints and rounding, and reject invalid state',()=>{
  assert.equal(durabilityBar(0,1561),null); assert.equal(durabilityBar(5,0),null);
  assert.deepEqual(durabilityBar(50,100),{width:7,color:'#ffff00'});
  assert.deepEqual(durabilityBar(75,100),{width:3,color:'#ff7f00'});
  assert.deepEqual(durabilityBar(100,100),{width:0,color:'#ff0000'});
  assert.deepEqual(durabilityBar(101,100),{width:0,color:'#ff0000'});
  assert.equal(durabilityBar(1,1561)!.width,13);
  for(const bad of [NaN,Infinity,-1,1.2]) {assert.throws(()=>durabilityBar(bad,100));assert.throws(()=>durabilityBar(1,bad));}
});

test('rich text measures bold advances and preserves formatting through wrapping; tooltip overrides do not duplicate native details',async t=>{
  const f=await fixture();t.after(()=>rm(f.root,{recursive:true,force:true}));
  const assets=await extractAssets({clientJar:f.vanilla,out:f.out,characters:'AB ?'});
  const text:TextRun[]=[{text:'AB AB',color:'aqua',bold:true,italic:true,underlined:true,strikethrough:true}];
  assert.equal(measureText(assets.font,text),measureText(assets.font,'AB AB')+5);
  const wrapped=wrapText(assets.font,text,measureText(assets.font,[{text:'AB',bold:true}]));
  assert.equal(wrapped.length,2);assert.ok(wrapped.every(line=>line.every(run=>run.bold && run.italic && run.underlined && run.strikethrough)));
  const html=renderToString(createElement(MinecraftProvider,{assets,baseUrl:'/mcui',children:createElement(MinecraftText,{children:text})}));
  assert.match(html,/matrix\(1 0 -0.25 1 1 0\)/);assert.match(html,/translate\(1 0\)/);assert.match(html,/<rect/);assert.match(html,/AB AB/);
  const item={tooltip:['Sword','Old enchantment'],styledTooltip:[[{text:'Sword',color:'#55ffff' as const}],[{text:'Old enchantment',color:'#aaaaaa' as const}]]};
  assert.equal(plainText(itemTooltip(item)),'Sword\nOld enchantment');
  const custom=itemTooltip(item,{name:'New sword',enchantments:['Mending'],lore:['Line one','Line two'],attributes:[[{text:'When in Main Hand:',color:'gray'}],[{text:'+6 Attack Damage',color:'blue'}]]});
  assert.equal(plainText(custom),'New sword\nMending\nLine one\nLine two\n\nWhen in Main Hand:\n+6 Attack Damage');
  assert.ok((custom as TextRun[]).find(run=>run.text==='Line one')?.italic);
  assert.equal(plainText(itemTooltip({tooltip:['Legacy']})),'Legacy');
});

test('extraction retains native styles and item state, follows glint pack overrides, and renders decorated items during SSR',async t=>{
  const f=await fixture();t.after(()=>rm(f.root,{recursive:true,force:true}));
  await put(f.vanilla,'assets/minecraft/items/tool.json',{model:{type:'minecraft:model',model:'minecraft:item/tool'}});
  await put(f.vanilla,'assets/minecraft/models/item/tool.json',{parent:'minecraft:builtin/generated',textures:{layer0:'minecraft:item/tool'}});
  await put(f.vanilla,'assets/minecraft/textures/item/tool.png',png(16,16));
  const data={id:'minecraft:tool',label:'Tool',maxStackSize:1,stack:{id:'minecraft:tool'},damage:50,maxDamage:100,glint:true,tooltip:['Tool','Mending'],styledTooltip:[[{text:'Tool',color:'#55ffff',italic:true}],[{text:'Mending',color:'#aaaaaa'}]]};
  await put(f.root,'catalogue.json',{version:'26.2',tabs:[{id:'minecraft:tools_and_utilities',label:'Tools',kind:'CATEGORY',items:[data]}]});
  const assets=await extractAssets({clientJar:f.vanilla,out:f.out,items:true,catalogueFile:`${f.root}/catalogue.json`,characters:'?'});
  const item=assets.catalogue!.items[0];assert.deepEqual(item.styledTooltip,data.styledTooltip);assert.equal(item.maxDamage,100);assert.equal(item.glint,true);
  const render=(props={})=>renderToString(createElement(MinecraftProvider,{assets,baseUrl:'/nested/mcui',scale:2,children:createElement(ItemIcon,{stackKey:item.stackKey,...props})}));
  const html=render();assert.match(html,/mcui-item-glint/);assert.match(html,/mcui-durability/);assert.match(html,/data-width="7"/);assert.match(html,/left:4px;top:26px;width:26px;height:4px/);
  assert.ok(html.includes(assets.textures!['item.glint']!.file));assert.doesNotMatch(render({damage:0,glint:false}),/mcui-durability|mcui-item-glint/);
  const pack=`${f.root}/pack`;await put(pack,'pack.mcmeta',{pack:{min_format:88,max_format:88}});
  await put(pack,'assets/minecraft/textures/misc/enchanted_glint_item.png',png(256,256,[20,200,100,255]));
  const overlay=await extractAssets({clientJar:f.vanilla,out:f.out,packs:[pack],items:true,catalogueFile:`${f.root}/catalogue.json`,characters:'?'});
  assert.notEqual(overlay.textures!['item.glint']!.file,assets.textures!['item.glint']!.file);assert.equal(overlay.textures!['item.glint']!.pixelWidth,256);
});
