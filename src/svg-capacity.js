// Vector complexity and embedded photograph bytes are separate budgets.
// SVGCanvas may serialize both image href aliases; allow parsing that transport
// form, then retain one effective href in the canonical artwork.
export const MAX_SVG_VECTOR_CHARS=8_000_000;
export const MAX_SVG_IMAGE_CHARS=24*1024*1024;
export const MAX_SVG_SCENE_CHARS=32*1024*1024;
export const MAX_SVG_SOURCE_CHARS=64*1024*1024;
export const MAX_IMAGE_DATA_CHARS=16*1024*1024;
export const MAX_SVG_FILE_BYTES=32*1024*1024;
export const MAX_PROJECT_FILE_BYTES=128*1024*1024;

export function canonicalImageAttributes(tag,attrs){
  if(tag!=='image'||!Object.hasOwn(attrs,'xlink:href'))return attrs;
  const next={...attrs,href:attrs.href??attrs['xlink:href']};delete next['xlink:href'];return next;
}
export function canonicalizeImageElement(node){
  if(node.localName!=='image')return;
  const href=node.getAttribute('href')??node.getAttribute('xlink:href');
  if(href!==null)node.setAttribute('href',href);
  node.removeAttributeNS('http://www.w3.org/1999/xlink','href');node.removeAttribute('xlink:href');
}
export function assertSvgCapacity(vector,images){
  if(vector>MAX_SVG_VECTOR_CHARS)throw Error('SVG 矢量与文字数据超过 8 MB，请精简路径或分组');
  if(images>MAX_SVG_IMAGE_CHARS)throw Error('当前印刷面的内嵌图片数据超过 24 MB，请缩小图片或删除不用的图片');
  if(vector+images>MAX_SVG_SCENE_CHARS)throw Error('当前印刷面的 SVG 图文总数据超过 32 MB');
}
