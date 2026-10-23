import { z } from 'zod';
import { transformationSchema, type Transformation } from './item-geometry.js';

export interface ItemNode {
  type:string; model?:string|Record<string,unknown>; base?:string; property?:string; component?:string; block_state_property?:string;
  transformation?:Transformation; models?:ItemNode[]; on_true?:ItemNode; on_false?:ItemNode; fallback?:ItemNode;
  cases?:{when:string|string[];model:ItemNode}[]; entries?:{threshold:number;model:ItemNode}[]; scale?:number;
  tints?:{type:string;value?:number;default?:number;temperature?:number;downfall?:number}[];
}
export interface ItemLeaf { node:ItemNode; transforms:Transformation[] }
/** Resolve a reproducible, resting inventory state. Unknown properties fail explicitly. */
export function resolveItemNodes(node:ItemNode, components:Record<string,unknown>, notes:Set<string>, transforms:Transformation[]=[], depth=0):ItemLeaf[] {
  if(depth>32) throw new Error('Item definition exceeds nesting limit');
  if(!node || typeof node!=='object') throw new Error('Missing item model branch');
  const chain=node.transformation?[...transforms,transformationSchema.parse(node.transformation)]:transforms;
  const next=(child:ItemNode|undefined)=>resolveItemNodes(child!,components,notes,chain,depth+1);
  if(node.type==='minecraft:model'||node.type==='minecraft:special') return [{node,transforms:chain}];
  if(node.type==='minecraft:composite') {
    if(!node.models?.length||node.models.length>64) throw new Error('Composite needs 1–64 models');
    return node.models.flatMap(child=>next(child));
  }
  if(node.type==='minecraft:condition') {
    if(node.property==='minecraft:has_component') return next(Object.hasOwn(components,node.component??'')?node.on_true:node.on_false);
    if(['minecraft:using_item','minecraft:broken','minecraft:fishing_rod/cast','minecraft:bundle/has_selected_item','minecraft:selected','minecraft:carried'].includes(node.property??'')) return next(node.on_false);
  }
  if(node.type==='minecraft:select') {
    let value:unknown;
    switch(node.property) {
      case 'minecraft:display_context':value='gui';break;
      case 'minecraft:trim_material':value=(components['minecraft:trim'] as {material?:string}|undefined)?.material;break;
      case 'minecraft:block_state':value=(components['minecraft:block_state'] as Record<string,string>|undefined)?.[node.block_state_property??''];break;
      case 'minecraft:charge_type':value=undefined;break;
      case 'minecraft:context_dimension':value='minecraft:overworld';notes.add('Static Overworld preview');break;
      case 'minecraft:local_time':notes.add('Default non-seasonal preview');value=undefined;break;
      default:throw new Error(`Unsupported item selector: ${node.property}`);
    }
    return next(node.cases?.find(entry=>(Array.isArray(entry.when)?entry.when:[entry.when]).includes(value as string))?.model??node.fallback);
  }
  if(node.type==='minecraft:range_dispatch') {
    if(!['minecraft:time','minecraft:compass','minecraft:use_cycle','minecraft:use_duration','minecraft:crossbow/pull','minecraft:damage'].includes(node.property??'')) throw new Error(`Unsupported item range: ${node.property}`);
    if(node.property==='minecraft:time'||node.property==='minecraft:compass') notes.add('Static dial preview; no live world state');
    const entries=z.array(z.object({threshold:z.number().finite(),model:z.custom<ItemNode>()})).max(1024).parse(node.entries??[]);
    const selected=entries.filter(entry=>entry.threshold<=0).sort((a,b)=>b.threshold-a.threshold)[0]?.model??node.fallback;
    return next(selected);
  }
  throw new Error(`Item model ${node.type} needs a specialized/stateful renderer`);
}
