import {icon} from './icons.js';

// Keep every format in one menu definition. Export controllers only attach
// their existing handlers, so adding a format cannot append an unstyled row.
const groups=[
  {id:'flat',title:'平面',rows:[
    {title:'设计图片',formats:[
      ['export-flat','PNG','image','平面设计 PNG，可选刀线和折线'],
      ['export-flat-jpg','JPG','image','平面设计 JPG，可选 RGB 或 CMYK'],
      ['export-cmyk','TIFF','image','CMYK 印刷 TIFF，嵌入 ICC 并按 DPI 输出'],
    ]},
    {title:'完整刀版',formats:[
      ['export-svg','SVG','grid','可编辑刀版 SVG，包含刀线、折线和工程数据'],
      ['export-pdf','PDF','file','矢量刀版 PDF，可选 RGB 或 CMYK'],
    ]},
    {title:'当前面图文',formats:[
      ['export-artwork-svg','SVG','layers','仅当前面的可编辑图文，不包含刀线'],
    ]},
  ]},
  {id:'3d',title:'三维',rows:[
    {title:'当前视角',formats:[
      ['export-png','PNG','image','当前三维视角 PNG 截图'],
      ['export-jpg','JPG','image','当前三维视角 JPG，可选 RGB 或 CMYK'],
    ]},
    {title:'三维模型',formats:[
      ['export-glb','GLB','box','三维模型 GLB，包含网格、材质和双面贴图'],
    ]},
  ]},
];

export function exportMenuMarkup(){
  return groups.map(group=>`<div class="export-menu-group" role="group" aria-labelledby="export-group-${group.id}"><span id="export-group-${group.id}" class="export-group-title">${group.title}</span>${group.rows.map(row=>`<div class="export-menu-row"><span class="export-row-title">${row.title}</span><div class="export-formats">${row.formats.map(([id,format,glyph,title])=>`<button id="${id}" class="export-format" role="menuitem" aria-label="导出${row.title} ${format}" title="${title}">${icon(glyph)}<span>${format}</span></button>`).join('')}</div></div>`).join('')}</div>`).join('');
}

export function mountExportMenu(){
  const menu=document.querySelector('#export-menu'),toggle=document.querySelector('#export-toggle');
  const sync=()=>toggle.setAttribute('aria-expanded',String(!menu.hidden));sync();
  new MutationObserver(sync).observe(menu,{attributes:true,attributeFilter:['hidden']});
  toggle.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&!menu.hidden){event.preventDefault();event.stopPropagation();menu.hidden=true;return;}
    if(!['ArrowDown','ArrowUp'].includes(event.key))return;
    event.preventDefault();event.stopPropagation();menu.hidden=false;const buttons=[...menu.querySelectorAll('[role="menuitem"]')];(event.key==='ArrowDown'?buttons[0]:buttons.at(-1))?.focus();
  });
  menu.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();menu.hidden=true;toggle.focus();return;}
    if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
    event.preventDefault();event.stopPropagation();const buttons=[...menu.querySelectorAll('[role="menuitem"]')],index=buttons.indexOf(document.activeElement);
    buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();
  });
}
