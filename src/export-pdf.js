import PDFDocument from 'pdfkit';
import SVGtoPDF from 'svg-to-pdfkit';
import {create as readFont} from 'fontkit';
import fallbackUrl from './fonts/FoldPrintSans-Regular.woff2?url&inline';
import {exportJpeg} from './export-jpeg.js';
import {canvasCmykPixels} from './export-cmyk.js';

let fallback;
async function fallbackBytes(){if(!fallback)fallback=fallbackUrl.startsWith('data:')?Uint8Array.from(atob(fallbackUrl.slice(fallbackUrl.indexOf(',')+1)),c=>c.charCodeAt(0)):new Uint8Array(await(await fetch(fallbackUrl)).arrayBuffer());return fallback;}
export function validatePdfFont(bytes){const font=readFont(bytes);if(!font.hasGlyphForCodePoint)throw Error('请选择单个 TTF、OTF 或 WOFF 字体文件');return font;}

export async function exportVectorPdf(source,{widthMm,heightMm,mode='cmyk',transform,fontBytes,onProgress=()=>{}}={}){
  if(!['rgb','cmyk'].includes(mode)||!Number.isFinite(widthMm)||!Number.isFinite(heightMm)||widthMm<=0||heightMm<=0||(mode==='cmyk'&&!transform))throw Error('PDF 尺寸或色彩设置无效');
  const svg=new DOMParser().parseFromString(source,'image/svg+xml');if(svg.querySelector('parsererror'))throw Error('PDF 的 SVG 源码无效');
  const nodes=[svg.documentElement,...svg.querySelectorAll('*')];
  for(const node of nodes){
    if(node.closest('metadata'))continue;
    if(node.localName==='foreignObject'||node.hasAttribute('filter')&&node.getAttribute('filter')!=='none'||node.style?.filter&&node.style.filter!=='none')throw Error('PDF 暂不支持 SVG 滤镜或外部对象，请使用可编辑 SVG 保留这些效果');
    if(node.hasAttribute('mask')&&node.getAttribute('mask')!=='none'||node.style?.mask&&node.style.mask!=='none')throw Error('PDF 暂不支持 SVG 遮罩，请先展开遮罩或使用可编辑 SVG');
    if(/vertical|tb-/.test(node.getAttribute('writing-mode')??node.style?.writingMode??''))throw Error('PDF 暂不支持竖排文字，请先转为路径或使用 SVG');
    if(node.getAttribute('vector-effect')==='non-scaling-stroke')throw Error('PDF 暂不支持非缩放描边，请展开描边或使用 SVG');
    if(node.style?.mixBlendMode&&node.style.mixBlendMode!=='normal')throw Error('PDF 暂不支持 SVG 混合模式，请展开效果或使用 SVG');
  }
  const bytes=fontBytes??await fallbackBytes(),font=validatePdfFont(bytes),text=[...svg.querySelectorAll('text')].map(n=>n.textContent).join('');
  const missing=[...new Set([...text].filter(c=>!/[\s\u200b-\u200f\u202a-\u202e\ufe00-\ufe0f]/u.test(c)&&!font.hasGlyphForCodePoint(c.codePointAt(0))))];
  if(missing.length)throw Error(`PDF 字体缺少字符“${missing.slice(0,12).join('')}”，请导入包含这些字符的字体`);
  const pictures=new Map(),alphaByBytes=new Map(),cmykImages=new Map();
  for(const node of svg.querySelectorAll('image')){
    const src=node.getAttribute('href')??node.getAttributeNS('http://www.w3.org/1999/xlink','href');if(!src?.startsWith('data:image/'))throw Error('PDF 图片必须先内嵌');
    if(pictures.has(src))continue;
    const image=new Image();image.src=src;await image.decode();const w=image.naturalWidth,h=image.naturalHeight;if(w*h>40000000)throw Error('PDF 中单张图片超过 4000 万像素');
    const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
    const pixels=ctx.getImageData(0,0,w,h).data,alpha=new Uint8Array(w*h);let transparent=false;
    for(let i=0;i<alpha.length;i++){alpha[i]=pixels[i*4+3];if(alpha[i]!==255)transparent=true;pixels[i*4+3]=255;}
    // Color and alpha remain independent; don't flatten photographs onto white
    // before applying the PDF soft mask over other vector objects.
    ctx.putImageData(new ImageData(pixels,w,h),0,0);
    // Inverted CMYK JPEGs rely on /Decode [1 0 ...]. Illustrator's PDF
    // importer can ignore that inversion and turn otherwise valid images
    // black. Embed positive CMYK samples losslessly instead; the PDF stream
    // compressor supplies FlateDecode and no inversion is required.
    const imageBytes=mode==='cmyk'?await canvasCmykPixels(canvas,transform):new Uint8Array(await(await exportJpeg(canvas,{mode,quality:98})).arrayBuffer());pictures.set(src,imageBytes);
    if(mode==='cmyk')cmykImages.set(imageBytes,{width:w,height:h,label:'FoldCMYK'+cmykImages.size,pixels:imageBytes});
    if(transparent)alphaByBytes.set(imageBytes,{alpha,w,h});onProgress(.2);
  }
  const doc=new PDFDocument({font:bytes,size:[widthMm*72/25.4,heightMm*72/25.4],margin:0,pdfVersion:'1.7',compress:true,info:{Title:'Fold Studio vector dieline',Creator:'Fold Studio',Subject:mode==='cmyk'?`ICC CMYK - ${transform.name}`:'sRGB vector dieline'}}),chunks=[],warnings=[];
  const finished=new Promise((resolve,reject)=>{doc.on('data',chunk=>chunks.push(chunk));doc.on('end',()=>resolve(new Blob(chunks,{type:'application/pdf'})));doc.on('error',reject);});
  doc.registerFont('FoldPrint',bytes);
  let profileRef,softMask;const pendingForms=[];
  const originalRef=doc.ref.bind(doc);
  if(mode==='cmyk'){
    profileRef=originalRef({N:4,Alternate:'DeviceCMYK'});profileRef.end(transform.profile);
    const intent=originalRef({Type:'OutputIntent',S:'GTS_PDFX',OutputConditionIdentifier:new String(transform.name),Info:new String(transform.name),DestOutputProfile:profileRef});intent.end();doc._root.data.OutputIntents=[intent];
    doc.page.colorSpaces.DefaultCMYK=['ICCBased',profileRef];doc.page.dictionary.data.Group={S:'Transparency',CS:['ICCBased',profileRef]};
  }
  doc.ref=data=>{
    if(data?.Subtype==='Image'&&data.ColorSpace!=='DeviceGray'){
      if(mode==='cmyk'&&data.ColorSpace==='DeviceCMYK')data.ColorSpace=['ICCBased',profileRef];
      if(softMask)data.SMask=softMask;
    }
    if(mode==='cmyk'&&data?.Group?.CS==='DeviceRGB'){
      data.Group.CS=['ICCBased',profileRef];
      if(data.Resources?.data)data.Resources.data.ColorSpace={DefaultCMYK:['ICCBased',profileRef]};
    }
    // SVG clipping uses luminosity masks. Their black backdrop is RGB zero,
    // not CMYK zero (paper white); keep mask computation separate from ink.
    if(mode==='cmyk'&&data?.SMask?.G?.data?.Group)data.SMask.G.data.Group.CS='DeviceRGB';
    const ref=originalRef(data);
    if(mode==='cmyk'&&data?.Subtype==='Form'&&data.Group){const end=ref.end.bind(ref);ref.end=chunk=>{pendingForms.push(()=>end(chunk));};}
    return ref;
  };
  const openImage=doc.openImage.bind(doc);
  doc.openImage=src=>{
    const image=cmykImages.get(src)??openImage(src),alpha=alphaByBytes.get(src);
    if(cmykImages.has(src)&&!image.embed)image.embed=function(document){
      if(this.obj)return;
      this.obj=document.ref({Type:'XObject',Subtype:'Image',Width:this.width,Height:this.height,BitsPerComponent:8,ColorSpace:['ICCBased',profileRef]});
      this.obj.end(this.pixels);this.pixels=null;
    };
    if(alpha&&!image.foldMaskWrapped){image.foldMaskWrapped=true;const embed=image.embed;image.embed=function(document){const previous=softMask;try{if(!this.obj){softMask=originalRef({Type:'XObject',Subtype:'Image',Width:alpha.w,Height:alpha.h,BitsPerComponent:8,ColorSpace:'DeviceGray'});softMask.end(alpha.alpha);}embed.call(this,document);}finally{softMask=previous;}};}
    return image;
  };
  const colors=new Map();
  SVGtoPDF(doc,svg.documentElement,0,0,{width:widthMm*72/25.4,height:heightMm*72/25.4,assumePt:false,
    imageCallback:src=>pictures.get(src)??(()=>{throw Error('PDF 图片未预载');})(),
    fontCallback:(family,bold,italic,options)=>{options.fauxBold=bold;options.fauxItalic=italic;return 'FoldPrint';},
    colorCallback:color=>{if(!color||mode==='rgb')return color;const key=color[0].join(',');if(!colors.has(key)){const ink=transform.convert(Uint8Array.from(color[0]));colors.set(key,[...ink].map(v=>v/255*100));}return [colors.get(key),color[1]];},
    warningCallback:message=>warnings.push(String(message)),
  });
  for(const end of pendingForms)end();doc.end();const blob=await finished;
  if(warnings.length)throw Error('PDF 未导出，存在不支持的 SVG 内容：'+warnings.slice(0,3).join('；'));
  onProgress(1);return blob;
}
