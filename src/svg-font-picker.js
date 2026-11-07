import {FONT_FAMILIES} from './svg-typography.js';

// Font metadata stays in this page's memory. No files or permission are read
// until the user presses the browser-authorized button.
let localFamilies=[],hasReadFonts=false,reading=null;
const create=(tag,props={},text)=>{const node=document.createElement(tag);Object.assign(node,props);if(text!==undefined)node.textContent=text;return node;};
const collator=new Intl.Collator('zh-CN',{numeric:true,sensitivity:'base'});
const normalize=value=>value.normalize('NFKC').toLocaleLowerCase().trim();
const primary=value=>normalize(value.split(',')[0].replace(/^["']|["']$/g,''));
function entries(){return [...localFamilies.map(name=>({name,value:`"${name}"`,local:true})),...FONT_FAMILIES.map(([name,value])=>({name,value,local:false}))];}
async function readFonts(){
  if(reading)return reading;
  reading=(async()=>{
    const fonts=await window.queryLocalFonts(),names=new Map();
    for(const font of fonts){const name=font.family?.trim();if(name&&name.length<250&&!/["\\;{}<>\u0000-\u001f]/.test(name))names.set(normalize(name),name);}
    localFamilies=[...names.values()].sort(collator.compare);hasReadFonts=true;
  })();
  try{await reading;}finally{reading=null;document.querySelector('#font-picker-popup:popover-open')?.dispatchEvent(new Event('font-list-updated'));}
}

export function appendFontPicker(host,{value,onChange}){
  const field=create('div',{className:'svg-font-field'}),label=create('label',{htmlFor:'typography-family'},'字体'),control=create('div',{className:'svg-font-control'});
  const input=create('input',{id:'typography-family',value,placeholder:'混合字体或输入名称',autocomplete:'off',maxLength:500});input.dataset.typography='font-family';input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','none');input.setAttribute('aria-haspopup','listbox');input.setAttribute('aria-controls','font-picker-list');input.setAttribute('aria-expanded','false');
  const toggle=create('button',{id:'font-picker-toggle',type:'button',title:'选择字体'},'▾');toggle.setAttribute('aria-label','打开字体下拉框');toggle.setAttribute('aria-haspopup','listbox');toggle.setAttribute('aria-controls','font-picker-popup');toggle.setAttribute('aria-expanded','false');
  control.append(input,toggle);field.append(label,control);host.append(field);
  const popup=create('div',{id:'font-picker-popup',className:'svg-font-popup'});popup.popover='auto';popup.setAttribute('aria-label','字体选择');field.append(popup);
  const search=create('input',{id:'font-picker-search',type:'search',placeholder:'搜索本机字体或常用字体',autocomplete:'off'});search.dataset.editorPreference='true';search.setAttribute('aria-label','搜索字体');search.setAttribute('role','combobox');search.setAttribute('aria-controls','font-picker-list');search.setAttribute('aria-expanded','true');search.setAttribute('aria-autocomplete','list');popup.append(search);
  const access=create('div',{className:'svg-font-access'}),status=create('p',{id:'font-picker-status',className:'svg-field-note'});status.setAttribute('role','status');popup.append(access,status);
  const list=create('div',{id:'font-picker-list',className:'svg-font-list'});list.setAttribute('role','listbox');list.setAttribute('aria-label','可选字体');popup.append(list);
  let shown=[],active=-1,limit=100,error='';
  function close(focus=false){if(popup.matches(':popover-open'))popup.hidePopover();if(focus&&toggle.isConnected)toggle.focus({preventScroll:true});}
  function choose(index){const font=shown[index];if(!font)return;close();onChange(font.value,input);document.getElementById('font-picker-toggle')?.focus({preventScroll:true});}
  function renderRows(){
    const scroll=list.scrollTop;list.replaceChildren();let previous;
    for(let i=0;i<Math.min(limit,shown.length);i++){
      const font=shown[i];if(previous!==font.local){const heading=create('div',{className:'svg-font-group'},font.local?'本机已安装':'常用字体与后备列表');heading.setAttribute('role','presentation');list.append(heading);previous=font.local;}
      const option=create('button',{id:'font-picker-option-'+i,type:'button',className:'svg-font-option',tabIndex:-1},font.name);option.dataset.fontFamily=font.value;option.setAttribute('role','option');option.setAttribute('aria-selected',String(primary(value)===primary(font.value)));option.style.fontFamily=font.value;option.title=font.value;option.onclick=()=>choose(i);option.onpointermove=()=>highlight(i,false);list.append(option);
    }
    if(!shown.length)list.append(create('p',{className:'svg-font-empty'},'没有匹配的字体，换个关键词试试。'));
    list.scrollTop=scroll;highlight(active,false);
  }
  function highlight(index,scroll=true){
    active=index;
    if(active>=limit){limit=Math.min(shown.length,Math.ceil((active+1)/100)*100);renderRows();}
    for(const row of list.querySelectorAll('[role="option"]'))row.classList.toggle('is-active',row.id==='font-picker-option-'+active);
    const row=list.querySelector('#font-picker-option-'+active);
    for(const node of [search,input]){if(row)node.setAttribute('aria-activedescendant',row.id);else node.removeAttribute('aria-activedescendant');}
    if(row&&scroll)row.scrollIntoView({block:'nearest'});
  }
  function render(){
    const query=normalize(search.value);shown=entries().filter(font=>!query||normalize(font.name+' '+font.value).includes(query));limit=100;active=-1;list.scrollTop=0;renderRows();
    status.textContent=error||(query?`找到 ${shown.length} 项字体`:hasReadFonts?`已读取 ${localFamilies.length} 种本机字体`:'可先选择常用字体，或读取本机已安装字体。');
    access.replaceChildren();
    if(typeof window.queryLocalFonts==='function'){
      const button=create('button',{id:'read-local-fonts',type:'button',disabled:!!reading},reading?'正在读取…':hasReadFonts?'重新读取本机字体':'读取本机字体');access.append(button);
      button.onclick=async()=>{
        error='';button.disabled=true;button.textContent='正在读取…';
        try{await readFonts();}catch(e){error=e.name==='NotAllowedError'?'未获授权，可重试或手动输入字体名称。':'暂时无法读取本机字体，可重试或手动输入名称。';}
        if(popup.isConnected)render();
      };
    }else access.append(create('p',{className:'svg-field-note'},'当前浏览器不支持读取本机字体，仍可选择常用字体或手动输入名称。'));
  }
  function open(){
    if(popup.matches(':popover-open')){close(true);return;}
    search.value='';error='';render();
    const rect=control.getBoundingClientRect(),width=Math.min(Math.max(rect.width,280),innerWidth-16),below=innerHeight-rect.bottom-12,above=rect.top-12,up=below<280&&above>below;
    Object.assign(popup.style,{width:width+'px',left:Math.max(8,Math.min(rect.left,innerWidth-width-8))+'px',top:up?'auto':rect.bottom+4+'px',bottom:up?innerHeight-rect.top+4+'px':'auto',maxHeight:Math.max(100,up?above:below)+'px'});
    popup.showPopover();search.focus({preventScroll:true});
  }
  toggle.onclick=open;input.onchange=()=>onChange(input.value,input);input.onkeydown=event=>{if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();event.stopPropagation();open();}};
  popup.addEventListener('beforetoggle',event=>{const opened=event.newState==='open';toggle.setAttribute('aria-expanded',String(opened));input.setAttribute('aria-expanded',String(opened));if(!opened)for(const node of [search,input])node.removeAttribute('aria-activedescendant');});
  popup.addEventListener('keydown',event=>{
    if(event.ctrlKey||event.metaKey)return;
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);return;}
    if(['ArrowDown','ArrowUp','Home','End','PageDown','PageUp','Enter'].includes(event.key)){
      // Native button Enter must still activate the font-access button.
      if(event.target.closest('#read-local-fonts')&&event.key==='Enter')return;
      if(['Home','End'].includes(event.key)&&event.target===search&&!event.altKey)return;
      event.preventDefault();event.stopPropagation();
      if(event.key==='Enter'){choose(active);return;}
      const delta=['ArrowUp','PageUp'].includes(event.key)?-1:1,step=event.key.startsWith('Page')?8:1;
      highlight(!shown.length?-1:event.key==='Home'?0:event.key==='End'?shown.length-1:Math.max(0,Math.min(shown.length-1,active<0?delta>0?0:shown.length-1:active+delta*step)));
    }
  });
  list.onscroll=()=>{if(limit<shown.length&&list.scrollTop+list.clientHeight>=list.scrollHeight-40){limit+=100;renderRows();}};
  search.oninput=render;
  popup.addEventListener('font-list-updated',render);
  return input;
}
