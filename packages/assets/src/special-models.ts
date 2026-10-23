import { z } from 'zod';
import type { Vec } from './item-geometry.js';

const vertex=z.tuple([z.number().finite(),z.number().finite(),z.number().finite(),z.number().finite(),z.number().finite()]);
export const specialGeometrySchema=z.record(z.string(),z.array(z.object({part:z.string(),vertices:z.array(vertex).length(4)})).max(4096));
export type SpecialGeometry=z.infer<typeof specialGeometrySchema>;
export interface MeshFace { points:Vec[]; uv:number[][]; texture:string; tint?:number; doubleSided?:boolean }
const qualified=(id:string,prefix:string)=>{const [namespace,name]=id.includes(':')?id.split(':'):['minecraft',id];return `${namespace}:${prefix}${name}`;};

/** Bind client-exported mesh layers to resource-pack-resolved materials. */
export function specialFaces(spec:Record<string,unknown>, geometry:SpecialGeometry, dyeColors:Record<string,number>, components:Record<string,unknown>, notes:Set<string>):MeshFace[] {
  const batches:{layer:string;texture:string;tint?:number}[]=[];
  switch(spec.type) {
    case 'minecraft:chest':
      if(spec.openness && spec.openness!==0) throw new Error('Open chest preview is not supported');
      batches.push({layer:'chest#main',texture:qualified(String(spec.texture),'entity/chest/')});break;
    case 'minecraft:shulker_box':
      if(spec.openness && spec.openness!==0) throw new Error('Open shulker preview is not supported');
      batches.push({layer:'shulker_box#main',texture:qualified(String(spec.texture??'shulker'),'entity/shulker/')});break;
    case 'minecraft:banner':
      if(dyeColors[String(spec.color)]===undefined) throw new Error('Missing exported banner dye color');
      batches.push({layer:'standing_banner#main',texture:'minecraft:entity/banner/banner_base'},
        {layer:'standing_banner#flag',texture:'minecraft:entity/banner/base',tint:dyeColors[String(spec.color)]});
      for(const pattern of z.array(z.object({pattern:z.string(),color:z.string()})).max(16).parse(components['minecraft:banner_patterns']??[])) {
        const tint=dyeColors[pattern.color];if(tint===undefined) throw new Error('Unknown banner pattern dye');
        batches.push({layer:'standing_banner#flag',texture:qualified(pattern.pattern,'entity/banner/'),tint});
      }
      break;
    case 'minecraft:shield':
      if(components['minecraft:banner_patterns']||components['minecraft:base_color']) throw new Error('Patterned shields need a layered pattern renderer');
      batches.push({layer:'shield#main',texture:'minecraft:entity/shield/shield_base_nopattern'});break;
    case 'minecraft:conduit':batches.push({layer:'conduit#shell',texture:'minecraft:entity/conduit/base'});break;
    case 'minecraft:decorated_pot':
      if(components['minecraft:pot_decorations']) throw new Error('Decorated pot sherd variants are not supported');
      batches.push({layer:'decorated_pot_base#main',texture:'minecraft:entity/decorated_pot/decorated_pot_base'},
        {layer:'decorated_pot_sides#main',texture:'minecraft:entity/decorated_pot/decorated_pot_side'});break;
    case 'minecraft:player_head':
      if(components['minecraft:profile']) throw new Error('Custom player skins must be supplied locally');
      notes.add('Default local player skin; no skin downloads');
      batches.push({layer:'player_head#main',texture:'minecraft:entity/player/wide/steve'});break;
    case 'minecraft:head': {
      const kinds:Record<string,[string,string]>={skeleton:['skeleton_skull','skeleton/skeleton'],wither_skeleton:['wither_skeleton_skull','skeleton/wither_skeleton'],zombie:['zombie_head','zombie/zombie'],creeper:['creeper_head','creeper/creeper'],piglin:['piglin_head','piglin/piglin'],dragon:['dragon_skull','enderdragon/dragon']};
      const kind=kinds[String(spec.kind)];if(!kind) throw new Error(`Unsupported skull kind: ${spec.kind}`);
      batches.push({layer:`${kind[0]}#main`,texture:spec.texture?qualified(String(spec.texture),'entity/'):qualified(kind[1],'entity/')});break;
    }
    case 'minecraft:copper_golem_statue': {
      const pose=String(spec.pose??'standing');if(!['standing','sitting','running','star'].includes(pose)) throw new Error(`Unsupported golem pose: ${pose}`);
      const texture=String(spec.texture);if(!/^[a-z0-9_.-]+:textures\/.+\.png$/.test(texture)) throw new Error('Invalid copper golem texture');
      batches.push({layer:`copper_golem${pose==='standing'?'':`_${pose}`}#main`,texture:texture.replace(':textures/',':').slice(0,-4)});break;
    }
    default:throw new Error(`Unsupported special renderer: ${spec.type}`);
  }
  return batches.flatMap(batch=>{
    const mesh=geometry[batch.layer];if(!mesh) throw new Error(`Missing client geometry for ${batch.layer}; re-export the catalogue with the current CLI`);
    return mesh.map(face=>{
      // Entity meshes use outward winding; the GUI rasterizer uses inward winding.
      const vertices=[...face.vertices].reverse();
      return {points:vertices.map(v=>v.slice(0,3) as Vec),uv:vertices.map(v=>v.slice(3,5)),texture:batch.texture,tint:batch.tint,doubleSided:true};
    });
  });
}
