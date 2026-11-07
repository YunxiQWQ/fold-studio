import wasmUrl from 'lcms-wasm/dist/lcms.wasm?url&inline';
import profileUrl from './color-profiles/FOGRA39L_coated.icc?url&inline';
import {initializeColorManagement} from './color.js';
export const colorReady=Promise.all([wasmUrl,profileUrl].map(async url=>{
  if(url.startsWith('data:'))return Uint8Array.from(atob(url.slice(url.indexOf(',')+1)),c=>c.charCodeAt(0));
  const r=await fetch(url);if(!r.ok)throw Error('色彩引擎资源未能加载');return new Uint8Array(await r.arrayBuffer());
})).then(([wasm,icc])=>initializeColorManagement(wasm,icc));
