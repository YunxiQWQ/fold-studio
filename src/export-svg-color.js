import {proofCanvas,captureProofTransform} from './color.js';

const paints=['fill','stroke','color','stop-color','flood-color','lighting-color'];
const ns='http://www.w3.org/2000/svg';
export async function proofSvgSource(source,{mode='rgb'}={}){
  if(mode==='rgb')return source;
  if(mode!=='cmyk')throw Error('SVG 色彩模式无效');
  const snapshot=captureProofTransform();
  try{
  const doc=new DOMParser().parseFromString(source,'image/svg+xml');if(doc.querySelector('parsererror'))throw Error('SVG 源码无效');
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d',{willReadFrequently:true}),cache=new Map();
  function paint(value){
    if(!value||!CSS.supports('color',value)||['inherit','currentcolor','transparent','initial','unset'].includes(value.toLowerCase()))return value;
    if(cache.has(value))return cache.get(value);ctx.clearRect(0,0,1,1);ctx.fillStyle=value;ctx.fillRect(0,0,1,1);const [r,g,b,a]=ctx.getImageData(0,0,1,1).data;
    if(!a)return value;const color='#'+[...snapshot.convert(Uint8Array.from([r,g,b]))].map(v=>v.toString(16).padStart(2,'0')).join(''),result=a===255?color:color+ a.toString(16).padStart(2,'0');cache.set(value,result);return result;
  }
  // Default black also needs the printing black point. Definition masks keep
  // their original luminance semantics; paths, text and gradients stay vectors.
  if(!doc.documentElement.hasAttribute('fill'))doc.documentElement.setAttribute('fill',paint('#000000'));
  for(const node of [doc.documentElement,...doc.querySelectorAll('*')]){
    if(node.closest('metadata,mask,clipPath,filter'))continue;
    for(const key of paints){if(node.hasAttribute(key))node.setAttribute(key,paint(node.getAttribute(key)));if(node.style?.getPropertyValue(key))node.style.setProperty(key,paint(node.style.getPropertyValue(key)),node.style.getPropertyPriority(key));}
  }
  const pictures=new Map();
  for(const node of doc.querySelectorAll('image')){
    if(node.closest('mask,clipPath,filter'))continue;
    const href=node.getAttribute('href')??node.getAttributeNS('http://www.w3.org/1999/xlink','href');if(!href?.startsWith('data:image/'))throw Error('SVG 图片需内嵌后导出');
    if(!pictures.has(href))pictures.set(href,(async()=>{const image=new Image();image.src=href;await image.decode();if(image.naturalWidth*image.naturalHeight>40000000)throw Error('SVG 中单张图片超过 4000 万像素');const c=document.createElement('canvas');c.width=image.naturalWidth;c.height=image.naturalHeight;c.getContext('2d').drawImage(image,0,0);proofCanvas(c,snapshot);return c.toDataURL('image/png');})());
    node.setAttribute('href',await pictures.get(href));node.removeAttributeNS('http://www.w3.org/1999/xlink','href');
  }
  doc.documentElement.setAttribute('data-fold-color-preview','cmyk');
  const description=doc.createElementNS(ns,'desc');description.textContent='CMYK gamut soft-proof in editable sRGB SVG. For true CMYK vector output use the PDF export.';doc.documentElement.prepend(description);
  return new XMLSerializer().serializeToString(doc.documentElement);
  }finally{snapshot.dispose();}
}
