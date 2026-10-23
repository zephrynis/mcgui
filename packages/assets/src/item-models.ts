import { PNG } from 'pngjs';
import { z } from 'zod';
import { resourcePath, type CatalogueItem } from '@mcgui/core';
import { Resolver, json } from './resources.js';
import { decodePng, ImageStore } from './images.js';
import { blend, sample, renderQuads, rotate, transformPoint, vector, type Vec, type Quad } from './item-geometry.js';
import { resolveItemNodes, type ItemNode, type ItemLeaf } from './item-definitions.js';
import { specialFaces, type SpecialGeometry, type MeshFace } from './special-models.js';

const faceSchema = z.object({ texture:z.string(), uv:z.tuple([z.number(),z.number(),z.number(),z.number()]).optional(),
  rotation:z.union([z.literal(0),z.literal(90),z.literal(180),z.literal(270)]).default(0), tintindex:z.number().int().default(-1) });
const modelSchema = z.object({ parent:z.string().optional(),
  textures:z.record(z.string(),z.union([z.string(),z.object({sprite:z.string(),force_translucent:z.boolean().optional()}).transform(value=>value.sprite)])).default({}),
  gui_light:z.enum(['front','side']).optional(), display:z.object({gui:z.object({rotation:vector.optional(),translation:vector.optional(),scale:vector.optional()}).optional()}).optional(),
  elements:z.array(z.object({from:vector,to:vector,shade:z.boolean().default(true),
    rotation:z.object({origin:vector,axis:z.enum(['x','y','z']),angle:z.number().finite(),rescale:z.boolean().default(false)}).optional(),
    faces:z.record(z.enum(['north','south','east','west','up','down']),faceSchema.optional())})).max(4096).optional(),
});
type Model = z.infer<typeof modelSchema> & {generated?:boolean};
type Colors = {potion?:number;dyed?:number};
const animationSchema=z.object({width:z.number().int().positive().optional(),height:z.number().int().positive().optional(),
  frames:z.array(z.union([z.number().int().nonnegative(),z.object({index:z.number().int().nonnegative(),time:z.number().int().positive().optional()})])).min(1).optional()});

/** Offline static GUI baker. Models, meshes, textures and palette data stay local. */
export class ItemModelBaker {
  private models=new Map<string,Model>();
  private textures=new Map<string,{image:PNG;animated:boolean}>();
  private baked=new Map<string,NonNullable<CatalogueItem['icon']>>();
  constructor(private resolver:Resolver,private images:ImageStore,private geometry:SpecialGeometry={},private dyeColors:Record<string,number>={}) {}

  private async model(id:string,visiting:string[]=[]):Promise<Model> {
    if(visiting.includes(id)||visiting.length>32) throw new Error('Model parent cycle/depth: '+id);
    if(this.models.has(id)) return this.models.get(id)!;
    if(['builtin/generated','minecraft:builtin/generated'].includes(id)) return {textures:{},generated:true};
    const file=resourcePath(id,'models','.json'),raw=modelSchema.parse(json((await this.resolver.get(file)).data,file));
    const parent=raw.parent?await this.model(raw.parent,[...visiting,id]):{textures:{}};
    const result={...parent,...raw,textures:{...parent.textures,...raw.textures},elements:raw.elements??parent.elements,
      display:{gui:raw.display?.gui??parent.display?.gui},gui_light:raw.gui_light??parent.gui_light};
    this.models.set(id,result);return result;
  }
  private async texture(id:string,model:Model,notes:Set<string>):Promise<PNG> {
    // Minecraft also accepts bare texture-slot names (heavy_core uses "all").
    if(!id.startsWith('#')&&Object.hasOwn(model.textures,id)) id='#'+id;
    const seen=new Set<string>();
    while(id.startsWith('#')) {
      if(seen.has(id)||seen.size>32) throw new Error('Texture reference cycle: '+id);
      seen.add(id);const resolved=model.textures[id.slice(1)];
      if(!resolved) throw new Error('Missing texture reference: '+id);id=resolved;
    }
    const cached=this.textures.get(id);
    if(cached) {if(cached.animated) notes.add('Animated texture shown at its first declared frame');return cached.image;}
    const file=resourcePath(id,'textures','.png'),resource=await this.resolver.get(file);
    const metadata=await this.resolver.metadata(file,resource.layer) as {animation?:unknown};
    let image=decodePng(resource.data,file);
    if(metadata.animation!==undefined) {
      const animation=animationSchema.parse(metadata.animation);
      const width=animation.width??(animation.height?image.width:Math.min(image.width,image.height));
      const height=animation.height??(animation.width?image.height:Math.min(image.width,image.height));
      if(image.width%width||image.height%height) throw new Error('Animation frame dimensions do not divide the texture: '+id);
      const frameCount=image.width/width*(image.height/height);
      for(const frame of animation.frames??[0]) if((typeof frame==='number'?frame:frame.index)>=frameCount) throw new Error('Animation frame is out of bounds: '+id);
      const frame=animation.frames?.[0]??0,index=typeof frame==='number'?frame:frame.index;
      const x=index%(image.width/width)*width,y=Math.floor(index/(image.width/width))*height;
      const cropped=new PNG({width,height});
      PNG.bitblt(image,cropped,x,y,width,height,0,0);image=cropped;
      notes.add('Animated texture shown at its first declared frame');
    }
    this.textures.set(id,{image,animated:metadata.animation!==undefined});return image;
  }
  private async tints(node:ItemNode,model:Model,colors:Colors,components:Record<string,unknown>,notes:Set<string>):Promise<number[]> {
    return Promise.all((node.tints??[]).map(async tint=>{
      switch(tint.type) {
        case 'minecraft:constant':return tint.value??0xffffff;
        case 'minecraft:potion':return colors.potion??tint.default??0xffffff;
        case 'minecraft:dye':return colors.dyed??tint.default??0xffffff;
        case 'minecraft:firework': {
          const values=(components['minecraft:firework_explosion'] as {colors?:number[]}|undefined)?.colors??[];
          if(!values.length) return tint.default??0x8a8a8a;
          const channels=[16,8,0].map(shift=>Math.floor(values.reduce((sum,v)=>sum+((v>>>shift)&255),0)/values.length));
          return (channels[0]<<16)|(channels[1]<<8)|channels[2];
        }
        case 'minecraft:grass': {
          const temperature=z.number().min(0).max(1).parse(tint.temperature),downfall=z.number().min(0).max(1).parse(tint.downfall);
          const palette=await this.texture('minecraft:colormap/grass',model,notes);
          if(palette.width!==256||palette.height!==256) throw new Error('Grass colormap must be 256×256');
          const x=Math.floor((1-temperature)*255),y=Math.floor((1-downfall*temperature)*255),offset=(y*256+x)*4;
          return (palette.data[offset]<<16)|(palette.data[offset+1]<<8)|palette.data[offset+2];
        }
        default:throw new Error('Unsupported item tint: '+tint.type);
      }
    }));
  }
  private project(point:Vec,model:Model,leaf:ItemLeaf):Vec {
    // Child transformation first, then enclosing item definitions, then GUI display.
    for(const transform of [...leaf.transforms].reverse()) point=transformPoint(point,transform);
    const gui=model.display?.gui,scale=gui?.scale??[1,1,1],rotation=gui?.rotation??[0,0,0],translation=gui?.translation??[0,0,0];
    point=point.map((v,i)=>(v-8)*scale[i]) as Vec;
    for(const axis of [2,1,0]) point=rotate(point,axis,rotation[axis]);
    return point.map((v,i)=>v+translation[i]) as Vec;
  }
  private async mesh(leaf:ItemLeaf,model:Model,tints:number[],components:Record<string,unknown>,notes:Set<string>):Promise<Quad[]> {
    const faces:(MeshFace&{unshaded?:boolean})[]=[];
    if(leaf.node.type==='minecraft:special') {
      faces.push(...specialFaces(leaf.node.model as Record<string,unknown>,this.geometry,this.dyeColors,components,notes));
    } else if(model.generated&&!model.elements) {
      for(const layer of Object.keys(model.textures).filter(k=>/^layer[0-4]$/.test(k)).sort()) {
        const index=Number(layer.slice(5));
        faces.push({points:[[0,16,8+index*.001],[16,16,8+index*.001],[16,0,8+index*.001],[0,0,8+index*.001]],
          uv:[[0,0],[16,0],[16,16],[0,16]],texture:'#'+layer,tint:tints[index],unshaded:true,doubleSided:true});
      }
    } else {
      if(!model.elements?.length) throw new Error('Model has no cuboid elements');
      for(const element of model.elements) {
        const [x,y,z]=element.from,[X,Y,Z]=element.to;
        const points:Record<string,Vec[]>={
          north:[[X,Y,z],[x,Y,z],[x,y,z],[X,y,z]],south:[[x,Y,Z],[X,Y,Z],[X,y,Z],[x,y,Z]],
          west:[[x,Y,z],[x,Y,Z],[x,y,Z],[x,y,z]],east:[[X,Y,Z],[X,Y,z],[X,y,z],[X,y,Z]],
          up:[[x,Y,z],[X,Y,z],[X,Y,Z],[x,Y,Z]],down:[[x,y,Z],[X,y,Z],[X,y,z],[x,y,z]],
        };
        const defaults:Record<string,number[]>={down:[x,16-Z,X,16-z],up:[x,z,X,Z],north:[16-X,16-Y,16-x,16-y],south:[x,16-Y,X,16-y],west:[z,16-Y,Z,16-y],east:[16-Z,16-Y,16-z,16-y]};
        for(const [direction,face] of Object.entries(element.faces)) {
          if(!face) continue;
          const [u,v,U,V]=face.uv??defaults[direction],uv=[[u,v],[U,v],[U,V],[u,V]];
          faces.push({points:points[direction].map(point=>{
            if(!element.rotation) return point;
            const {origin,axis,angle,rescale}=element.rotation,axisIndex=['x','y','z'].indexOf(axis);
            let p=rotate(point.map((v,i)=>v-origin[i]) as Vec,axisIndex,angle);
            if(rescale) p=p.map((v,i)=>i===axisIndex?v:v/Math.cos(angle*Math.PI/180)) as Vec;
            return p.map((v,i)=>v+origin[i]) as Vec;
          }),uv:uv.map((_,i)=>uv[(i+face.rotation/90)%4]),texture:face.texture,tint:tints[face.tintindex],unshaded:!element.shade});
        }
      }
    }
    return Promise.all(faces.map(async face=>({points:face.points.map(point=>this.project(point,model,leaf)),uv:face.uv,
      texture:await this.texture(face.texture,model,notes),tint:face.tint??0xffffff,unshaded:face.unshaded||model.gui_light==='front',doubleSided:face.doubleSided})));
  }
  async bake(id:string,colors:Colors={},components:Record<string,unknown>={}):Promise<NonNullable<CatalogueItem['icon']>> {
    const key=JSON.stringify([id,colors,components]);if(this.baked.has(key)) return this.baked.get(key)!;
    const file=resourcePath(id,'items','.json'),definition=json((await this.resolver.get(file)).data,file) as {model:ItemNode};
    const notes=new Set<string>(),leaves=resolveItemNodes(definition.model,components,notes);
    const prepared=await Promise.all(leaves.map(async leaf=>{
      const id=leaf.node.type==='minecraft:special'?leaf.node.base:leaf.node.model;
      if(typeof id!=='string') throw new Error('Missing item model reference');
      const model=await this.model(id);return {leaf,model,tints:await this.tints(leaf.node,model,colors,components,notes)};
    }));
    let output:PNG,kind:'flat'|'model'='model';
    const single=prepared.length===1?prepared[0]:undefined;
    if(single&&single.leaf.node.type==='minecraft:model'&&single.model.generated&&!single.model.elements&&!single.leaf.transforms.length&&!single.model.display?.gui) {
      const {model,tints}=single,layers=Object.keys(model.textures).filter(k=>/^layer[0-4]$/.test(k)).sort();
      if(!layers.length) throw new Error('Generated model has no layers');
      const textures=await Promise.all(layers.map(layer=>this.texture('#'+layer,model,notes)));
      const size=Math.max(...textures.map(texture=>Math.max(texture.width,texture.height)));
      if(size>1024) throw new Error('Item texture exceeds 1024px baking limit');
      output=new PNG({width:size,height:size});kind='flat';
      for(let layer=0;layer<textures.length;layer++) for(let y=0;y<size;y++) for(let x=0;x<size;x++)
        blend(output.data,(y*size+x)*4,sample(textures[layer],(x+.5)/size*16,(y+.5)/size*16,tints[Number(layers[layer].slice(5))]));
    } else {
      const quads=(await Promise.all(prepared.map(({leaf,model,tints})=>this.mesh(leaf,model,tints,components,notes)))).flat();
      output=renderQuads(quads);
    }
    if(!output.data.some((value,index)=>index%4===3&&value>0)) throw new Error('Item model produced an empty icon');
    const {file:outputFile}=this.images.add(PNG.sync.write(output),id);
    const result={file:outputFile,pixelWidth:output.width,pixelHeight:output.height,kind,...(notes.size?{notes:[...notes].sort()}: {})};
    this.baked.set(key,result);return result;
  }
}
