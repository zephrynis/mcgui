import { PNG } from 'pngjs';
import { z } from 'zod';

export type Vec = [number, number, number];
export const vector = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
const quaternion = z.tuple([z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite()]);
export const transformationSchema = z.object({ translation: vector.optional(), scale: vector.optional(), left_rotation: quaternion.optional(), right_rotation: quaternion.optional() });
export type Transformation = z.infer<typeof transformationSchema>;
export interface Quad { points: Vec[]; uv: number[][]; texture: PNG; tint: number; unshaded: boolean; doubleSided?: boolean }
export function rotate(p: Vec, axis: number, degrees: number): Vec {
  const a = (axis + 1) % 3, b = (axis + 2) % 3, radians = degrees * Math.PI / 180;
  const result: Vec = [...p]; result[a] = p[a] * Math.cos(radians) - p[b] * Math.sin(radians); result[b] = p[a] * Math.sin(radians) + p[b] * Math.cos(radians); return result;
}
function rotateQuaternion(p: Vec, q: [number,number,number,number]): Vec {
  const length = Math.hypot(...q); if (!length) throw new Error('Zero item transformation quaternion');
  const [x,y,z,w] = q.map(v=>v/length), [a,b,c]=p;
  const tx=2*(y*c-z*b), ty=2*(z*a-x*c), tz=2*(x*b-y*a);
  return [a+w*tx+y*tz-z*ty,b+w*ty+z*tx-x*tz,c+w*tz+x*ty-y*tx];
}
/** Item-definition translations are block units, unlike model GUI translations. */
export function transformPoint(point: Vec, transform: Transformation): Vec {
  let p = transform.right_rotation ? rotateQuaternion(point,transform.right_rotation) : point;
  if(transform.scale) p=p.map((v,i)=>v*transform.scale![i]) as Vec;
  if(transform.left_rotation) p=rotateQuaternion(p,transform.left_rotation);
  if(transform.translation) p=p.map((v,i)=>v+transform.translation![i]*16) as Vec;
  return p;
}
export function blend(target: Buffer, offset: number, color: number[]) {
  const a=color[3]/255, previous=target[offset+3]/255, combined=a+previous*(1-a);
  if(!combined) return;
  for(let c=0;c<3;c++) target[offset+c]=Math.round((color[c]*a+target[offset+c]*previous*(1-a))/combined);
  target[offset+3]=Math.round(combined*255);
}
export function sample(texture: PNG, u:number, v:number, tint=0xffffff, light=1) {
  const x=Math.max(0,Math.min(texture.width-1,Math.floor(u/16*texture.width))), y=Math.max(0,Math.min(texture.height-1,Math.floor(v/16*texture.height))), offset=(y*texture.width+x)*4;
  return [texture.data[offset]*((tint>>>16)&255)/255*light,texture.data[offset+1]*((tint>>>8)&255)/255*light,texture.data[offset+2]*(tint&255)/255*light,texture.data[offset+3]];
}
// Java 26.2 Lighting.ITEMS_3D, kept in Y-up model space.
const GUI_LIGHTS = ([[.2,1,-.7],[-.2,1,.7]] as Vec[]).map(direction=>{
  const length=Math.hypot(...direction); let light=direction.map(v=>v/length) as Vec;
  for(const [axis,angle] of [[0,135],[1,-22.5],[0,185.5],[1,62]]) light=rotate(light,axis,angle);
  return light;
});

/** All composite layers share depth and alpha ordering. Points are GUI model units. */
export function renderQuads(quads: readonly Quad[], size=64): PNG {
  if(quads.length>24576) throw new Error('Item geometry exceeds quad limit');
  const output=new PNG({width:size,height:size});
  const fragments:{z:number;color:number[]}[][]=Array.from({length:size*size},()=>[]);
  for(const quad of quads) {
    const vertices=quad.points.map(([x,y,z])=>[(8+x)*size/16,(8-y)*size/16,z] as Vec);
    const [a,b,c]=vertices;
    const cross=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
    if(Math.abs(cross)<1e-10 || (cross<0&&!quad.doubleSided)) continue;
    const nx=(b[1]-a[1])*(c[2]-a[2])-(b[2]-a[2])*(c[1]-a[1]), ny=(b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2]);
    const normal:Vec=[nx*size/16,-ny*size/16,cross], length=Math.hypot(...normal);
    const dot=(light:Vec)=>Math.max(0,normal.reduce((sum,n,i)=>sum+n/length*light[i],0));
    const light=quad.unshaded?1:Math.min(1,.4+.6*GUI_LIGHTS.reduce((sum,d)=>sum+dot(d),0));
    const minX=Math.max(0,Math.floor(Math.min(...vertices.map(p=>p[0])))),maxX=Math.min(size-1,Math.ceil(Math.max(...vertices.map(p=>p[0]))));
    const minY=Math.max(0,Math.floor(Math.min(...vertices.map(p=>p[1])))),maxY=Math.min(size-1,Math.ceil(Math.max(...vertices.map(p=>p[1]))));
    for(let py=minY;py<=maxY;py++) for(let px=minX;px<=maxX;px++) for(const indices of [[0,1,2],[0,2,3]]) {
      const [a,b,c]=indices.map(i=>vertices[i]);
      const denominator=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
      const w0=((b[1]-c[1])*(px+.5-c[0])+(c[0]-b[0])*(py+.5-c[1]))/denominator;
      const w1=((c[1]-a[1])*(px+.5-c[0])+(a[0]-c[0])*(py+.5-c[1]))/denominator,w2=1-w0-w1;
      if(![w0,w1,w2].every(w=>Number.isFinite(w)&&w>=-1e-8)) continue;
      const weights=[w0,w1,w2],coords=indices.map(i=>quad.uv[i]);
      const color=sample(quad.texture,weights.reduce((s,w,i)=>s+w*coords[i][0],0),weights.reduce((s,w,i)=>s+w*coords[i][1],0),quad.tint,light);
      if(color[3]) fragments[py*size+px].push({z:weights.reduce((s,w,i)=>s+w*vertices[indices[i]][2],0),color});
      break;
    }
  }
  for(let i=0;i<fragments.length;i++) for(const fragment of fragments[i].sort((a,b)=>a.z-b.z)) blend(output.data,i*4,fragment.color);
  return output;
}
