import {instantiate,cmsFLAGS_BLACKPOINTCOMPENSATION,cmsFLAGS_SOFTPROOFING,cmsInfoDescription} from 'lcms-wasm';
import {printSettings,validateIcc,decodeIcc} from './color-settings.js';
let cms,srgb,builtin,active,key,revision=0;
const cache=new Map();
export function colorStatus(){return {ready:!!active,revision,name:active?.name??'ICC 尚未加载',settings:active?.settings};}
export async function initializeColorManagement(wasm,profile){
  if(cms)return;const engine=await instantiate({wasmBinary:wasm});cms=engine;srgb=cms.cmsCreate_sRGBProfile();builtin=validateIcc(profile);configureColorManagement();
}
function release(state){if(!state)return;for(const t of state.transforms??[])if(t)cms.cmsDeleteTransform(t);if(state.handle)cms.cmsCloseProfile(state.handle);}
export function configureColorManagement(value){
  const settings=printSettings(value),nextKey=JSON.stringify(settings);
  if(!cms)throw Error('ICC 色彩引擎尚未就绪');if(key===nextKey)return colorStatus();
  const bytes=settings.profile==='custom'?decodeIcc(settings.icc):builtin,state={handle:cms.cmsOpenProfileFromMem(bytes,bytes.length),transforms:[],settings,bytes};
  try{
    if(!state.handle)throw Error('ICC 配置无法读取');
    const rgb=cms.cmsFormatterForColorspaceOfProfile(srgb,1,false),cmyk=cms.cmsFormatterForColorspaceOfProfile(state.handle,1,false),flags=settings.blackPointCompensation?cmsFLAGS_BLACKPOINTCOMPENSATION:0;
    state.toCmyk=cms.cmsCreateTransform(srgb,rgb,state.handle,cmyk,settings.intent,flags);state.transforms.push(state.toCmyk);
    state.toRgb=cms.cmsCreateTransform(state.handle,cmyk,srgb,rgb,1,flags);state.transforms.push(state.toRgb);
    state.proof=cms.cmsCreateProofingTransform(srgb,rgb,srgb,rgb,state.handle,1,settings.intent,flags|cmsFLAGS_SOFTPROOFING);state.transforms.push(state.proof);
    if(state.transforms.some(t=>!t))throw Error('ICC 配置缺少可用的正向或反向转换表');
    state.name=cms.cmsGetProfileInfoASCII(state.handle,cmsInfoDescription,'en','US')||settings.name||'CMYK ICC';
  }catch(error){release(state);throw error;}
  release(active);active=state;key=nextKey;revision++;cache.clear();return colorStatus();
}
const required=()=>{if(!active)throw Error('ICC 色彩引擎尚未就绪');return active;};
function hexRgb(value){
  if(typeof value!=='string'||!/^#(?:[\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i.test(value))return null;
  let h=value.slice(1);if(h.length===3)h=[...h].map(c=>c+c).join('');return Uint8Array.from([0,2,4],i=>parseInt(h.slice(i,i+2),16));
}
const hex=bytes=>'#'+[...bytes].map(v=>v.toString(16).padStart(2,'0')).join('');
export function rgbToCmyk(value){const rgb=hexRgb(value);if(!rgb||!active)return null;const result=cms.cmsDoTransform(active.toCmyk,rgb,1);return Object.fromEntries(['c','m','y','k'].map((c,i)=>[c,Math.round(result[i]/255*1000)/10]));}
export function cmykToRgb(c,m,y,k){const s=required(),ink=[c,m,y,k];if(!ink.every(v=>Number.isFinite(v)&&v>=0&&v<=100))throw Error('CMYK 通道应为 0–100');return hex(cms.cmsDoTransform(s.toRgb,Uint8Array.from(ink,v=>Math.round(v*255/100)),1));}
export function formatCmyk(value){const c=rgbToCmyk(value);return c?`C:${c.c} M:${c.m} Y:${c.y} K:${c.k}`:'ICC 未就绪';}
export function proofColor(value,mode='rgb'){
  const rgb=hexRgb(value);if(mode!=='cmyk'||!rgb||!active)return value;
  if(!cache.has(value)){if(cache.size>4096)cache.clear();cache.set(value,hex(cms.cmsDoTransform(active.proof,rgb,1))+(value.length===9?value.slice(7):''));}return cache.get(value);
}
// Proof the final composite once: photos, CSS paints and gradients share ICC.
export function proofImageData(image,snapshot){
  const s=snapshot?null:required(),data=image.data,count=data.length/4,chunk=32768;
  for(let start=0;start<count;start+=chunk){const n=Math.min(chunk,count-start),input=new Uint8Array(n*3);for(let i=0;i<n;i++)input.set(data.subarray((start+i)*4,(start+i)*4+3),i*3);const output=snapshot?snapshot.convert(input):cms.cmsDoTransform(s.proof,input,n);for(let i=0;i<n;i++)data.set(output.subarray(i*3,i*3+3),(start+i)*4);}
  return image;
}
export function proofCanvas(canvas,snapshot){const ctx=canvas.getContext('2d'),image=ctx.getImageData(0,0,canvas.width,canvas.height);ctx.putImageData(proofImageData(image,snapshot),0,0);return canvas;}
export function captureProofTransform(){
  const s=required(),handle=cms.cmsOpenProfileFromMem(s.bytes,s.bytes.length);if(!handle)throw Error('无法读取打样 ICC');
  const fmt=cms.cmsFormatterForColorspaceOfProfile(srgb,1,false),flags=cmsFLAGS_SOFTPROOFING|(s.settings.blackPointCompensation?cmsFLAGS_BLACKPOINTCOMPENSATION:0),transform=cms.cmsCreateProofingTransform(srgb,fmt,srgb,fmt,handle,1,s.settings.intent,flags);
  if(!transform){cms.cmsCloseProfile(handle);throw Error('无法创建打样转换');}
  return {convert:input=>cms.cmsDoTransform(transform,input,input.length/3),dispose:()=>{cms.cmsDeleteTransform(transform);cms.cmsCloseProfile(handle);}};
}
export function capturePrintTransform(){
  const state=required(),handle=cms.cmsOpenProfileFromMem(state.bytes,state.bytes.length);
  if(!handle)throw Error('无法读取导出 ICC 配置');
  const rgb=cms.cmsFormatterForColorspaceOfProfile(srgb,1,false),ink=cms.cmsFormatterForColorspaceOfProfile(handle,1,false);
  const transform=cms.cmsCreateTransform(srgb,rgb,handle,ink,state.settings.intent,state.settings.blackPointCompensation?cmsFLAGS_BLACKPOINTCOMPENSATION:0);
  if(!transform){cms.cmsCloseProfile(handle);throw Error('无法建立 CMYK 转换');}
  return {name:state.name,profile:state.bytes.slice(),settings:{...state.settings},convert:input=>cms.cmsDoTransform(transform,input,input.length/3),dispose:()=>{cms.cmsDeleteTransform(transform);cms.cmsCloseProfile(handle);}};
}
