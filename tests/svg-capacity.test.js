import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canonicalImageAttributes,assertSvgCapacity,MAX_SVG_VECTOR_CHARS,MAX_SVG_IMAGE_CHARS,MAX_IMAGE_DATA_CHARS} from '../src/svg-capacity.js';
import {validateSvgAsset,svgAssetMarkup} from '../src/svg-asset.js';
import {validSvgHref} from '../src/svg-format.js';

const image=length=>'data:image/png;base64,'+'A'.repeat(length-22)+'=';
const asset=nodes=>({viewBox:[0,0,100,100],nodes});
test('canonical images retain one effective href, including old xlink-only data and SVG2 precedence',()=>{
  for(const attrs of [{href:'a','xlink:href':'a'},{'xlink:href':'a'},{href:'a','xlink:href':'b'}])assert.deepEqual(canonicalImageAttributes('image',attrs),{href:'a'});
  assert.deepEqual(canonicalImageAttributes('use',{'xlink:href':'#a'}),{'xlink:href':'#a'});
  const data=image(128),a=asset([{tag:'image',attrs:{href:data,'xlink:href':data},children:[]}]);assert.equal(svgAssetMarkup(a).split(data).length-1,1);assert.ok(Object.hasOwn(a.nodes[0].attrs,'xlink:href'),'old project input remains untouched');
});
test('embedded raster bytes no longer consume the vector budget or count the href alias twice',()=>{
  const src=image(9_000_000),nodes=[{tag:'image',attrs:{href:src,'xlink:href':src},children:[]},{tag:'text',attrs:{x:'2'},children:['Editable']}];
  assert.equal(validateSvgAsset(asset(nodes)).nodes,nodes);assert.equal(validSvgHref('image',src),true);
  assert.throws(()=>validateSvgAsset(asset([{tag:'text',attrs:{},children:['X'.repeat(MAX_SVG_VECTOR_CHARS+1)]}])),/矢量与文字/);
  assert.throws(()=>validateSvgAsset(asset(Array.from({length:3},()=>({tag:'image',attrs:{href:src},children:[]})))),/内嵌图片/);
});
test('raster budgets remain bounded and executable, external and oversized href values stay rejected',()=>{
  assert.doesNotThrow(()=>assertSvgCapacity(MAX_SVG_VECTOR_CHARS,MAX_SVG_IMAGE_CHARS));
  assert.throws(()=>assertSvgCapacity(MAX_SVG_VECTOR_CHARS+1,0));assert.throws(()=>assertSvgCapacity(0,MAX_SVG_IMAGE_CHARS+1));
  for(const value of ['https://example.com/image.png','data:image/svg+xml;base64,AAAA','javascript:alert(1)',image(MAX_IMAGE_DATA_CHARS+1)])assert.equal(validSvgHref('image',value),false);
  assert.throws(()=>validateSvgAsset(asset([{tag:'image',attrs:{href:image(80),'xlink:href':'https://example.com/private'},children:[]}])));
});
