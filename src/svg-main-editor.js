import SvgCanvas from '@svgedit/svgcanvas';
import {initializeSvgFrame} from './svg-editor-frame.js';
import {parseSvgDocument,svgDocumentSource} from './import-svg.js';
import {validateSvgAsset,svgAssetMarkup} from './svg-asset.js';
import {exportSVG,SvgDrawingContext} from './export-svg.js';
import {drawLayer} from './artwork.js';
import {svgSceneLayers} from './svg-scene.js';
import {svgAttributes,cssOnlyProperties,normalizeSvgValue} from './svg-format.js';
import {sideOf,validateProject} from './project.js';
import {cutSegments,creasePaths,panelAt} from './geometry.js';
import {printRegions,regionPath} from './artwork-space.js';
import {selectSvgArtwork} from './svg-document.js';
import {download} from './storage.js';
import './svg-main-editor.css';
import {appendImageTools} from './svg-image-tools.js';
import {barcodeStatus} from './barcode.js';
import {qrStatus} from './qrcode.js';
import {proofColor} from './color.js';
import {arrangeSvgInspector} from './svg-inspector.js';
import {alignSvgSelection} from './svg-alignment.js';
import {typographyTargets,toggleTypography,readSvgText,replaceSvgText} from './svg-typography.js';

const ns='http://www.w3.org/2000/svg';
const path=regions=>regionPath(regions).map(p=>p.join(' ')).join(' ');
function element(name,attrs={},content){const el=document.createElementNS(ns,name);for(const [key,value]of Object.entries(attrs))el.setAttribute(key,value);if(content!==undefined)el.textContent=content;return el;}
function xmlRoot(w,h,x=0,y=0){return element('svg',{xmlns:ns,width:w,height:h,viewBox:`${x} ${y} ${w} ${h}`});}
const serialize=node=>new XMLSerializer().serializeToString(node);

export function svgSceneAsset(source){
  const parsed=parseSvgDocument(source),root=parsed.nodes[0];
  const viewBox=root.attrs.viewBox?.split(/[\s,]+/).map(Number)??parsed.viewBox;
  const attrs=Object.fromEntries(Object.entries(root.attrs).filter(([key])=>!['width','height','viewBox','preserveAspectRatio','x','y','id'].includes(key)));
  const nodes=Object.keys(attrs).length||root.css? [{tag:'g',attrs,children:root.children,...(root.css?{css:root.css}:{})}]:root.children;
  return validateSvgAsset({viewBox,nodes});
}

// Only generated transport groups are collapsed. Imported SVG groups remain.
function flattenGenerated(node,name){
  while(node.localName==='g'){
    const children=[...node.children].filter(n=>!['title','desc'].includes(n.localName));
    if(children.length!==1||node.hasAttribute('clip-path')||node.hasAttribute('mask')||node.hasAttribute('filter'))break;
    const child=children[0];if(!['g','text','path','rect','circle','ellipse','line','image'].includes(child.localName))break;
    const transform=[node.getAttribute('transform'),child.getAttribute('transform')].filter(Boolean).join(' ');
    if(transform)child.setAttribute('transform',transform);
    const opacity=Number(node.getAttribute('opacity')??1)*Number(child.getAttribute('opacity')??1);
    if(opacity!==1)child.setAttribute('opacity',opacity);
    node=child;
  }
  node.setAttribute('data-name',name);return node;
}

export class SvgMainEditor {
  constructor(host,images,callbacks){
    Object.assign(this,{host,images,callbacks,native:true,view:{scale:1,x:0,y:0},guides:true,snap:true,rulers:true,side:'outside',sequence:0,guard:false});
    this.canvas=host;host.classList.add('native-main-canvas');host.dataset.testid='editor-canvas';
    host.innerHTML='<div id="canvas-container"></div>';
    document.querySelector('#layer-list').innerHTML='<div id="layers" class="native-main-tree"></div>';
    document.querySelector('#inspector').innerHTML='<div id="properties" class="native-main-properties"></div>';
    const message=document.createElement('div');message.id='message';message.className='native-main-message';host.after(message);
    this.proofStyle=document.createElement('style');document.head.append(this.proofStyle);
    const text=document.createElement('textarea');text.id='text';text.className='native-text-input';text.setAttribute('aria-label','SVG 画布文字输入');document.body.append(text);
    const source=document.createElement('dialog');source.id='source-dialog';source.className='native-source-dialog';
    source.innerHTML='<h3>当前印刷面 SVG 源码</h3><textarea id="source-text" spellcheck="false"></textarea><div class="dialog-actions"><button id="source-cancel">取消</button><button id="source-apply">验证并应用源码</button></div>';document.body.append(source);
    this.api=initializeSvgFrame(SvgCanvas,{
      textSize:6,
      handleAction:action=>{
        if(action.startsWith('align-')){alignSvgSelection(this,action.slice(6));return true;}
        if(['bold','italic','underline'].includes(action)){if(typographyTargets(this).length){toggleTypography(this,action);this.api.refreshProperties(true);}return true;}
        return false;
      },
      openWorkspace:true,
      systemClipboard:true,copied:()=>this.copyToSystem(),
      panActive:()=>this.space||this.tool==='pan',
      validate:source=>svgSceneAsset(source),
      sourceStyles:action=>{
        const disabled=this.proofStyle.disabled;this.proofStyle.disabled=true;
        try{return action();}finally{this.proofStyle.disabled=disabled;}
      },
      mode:mode=>{
        this.canvas.style.cursor=mode==='pan'?'grab':'';
        document.querySelector('#tool-select').classList.toggle('active',mode==='select');
        document.querySelector('#tool-pan').classList.toggle('active',mode==='pan');
        document.querySelector('#add-shape').classList.toggle('active',['path','fhpath','rect','ellipse','line','text'].includes(mode));
        this.updateToolbar?.();
      },
      textEditing:active=>{
        if(active){this.textEditing=true;this.textDirty=false;}
        else{this.api.flush();this.textEditing=false;if(this.textDirty){this.textDirty=false;this.callbacks.commit();}}
      },
      message:data=>this.message(data),changed:source=>this.store(source),
      command:command=>callbacks.command?.(command),zoom:scale=>{this.view.scale=scale;callbacks.zoom(scale);},
      layout:()=>this.structure(),selected:()=>{document.querySelector('#copy-layer').disabled=!this.hasSelection;document.querySelector('#cut-layer').disabled=!this.hasSelection;this.updateToolbar?.();},
      treeCount:(objects,selected)=>{document.querySelector('#layer-count').textContent=`${this.side==='inside'?'内面':'外面'} · ${selected?'已选 '+selected+' / ':''}${objects} 项`;},
      properties:(host,node)=>{this.properties(host,node);arrangeSvgInspector(host,node,this);},
    });
    document.addEventListener('input',event=>{if(!event.target.matches('[data-editor-preference]')&&event.target.closest('#properties,#source-dialog,#native-image-crop-dialog'))this.pendingInput=true;});
    document.querySelector('#source-cancel').addEventListener('click',()=>{this.pendingInput=false;});
    source.addEventListener('cancel',()=>{this.pendingInput=false;});
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(host);
    host.addEventListener('wheel',event=>{event.preventDefault();const box=host.getBoundingClientRect();this.api.zoom(Math.exp(-event.deltaY*.001),event.clientX-box.left,event.clientY-box.top);},{passive:false});
    host.addEventListener('mousedown',event=>{if(!this.api.selected&&this.dieline){const m=this.api.wrapper?.getScreenCTM();if(m){const p=new DOMPoint(event.clientX,event.clientY).matrixTransform(m.inverse());const x=this.side==='inside'?this.dieline.minX+this.dieline.maxX-p.x:p.x;const panel=panelAt(this.dieline,x,p.y);if(panel)callbacks.select(null,panel.id,[]);}}});
  }
  get hasSelection(){return this.api?.canvas.getSelectedElements().some(Boolean)??false;}
  get isEditing(){return ['textedit','pathedit'].includes(this.api?.canvas.getMode());}
  get tool(){return this.api?.canvas.getMode()==='pan'?'pan':'select';}
  set tool(value){this.api?.canvas.setMode(value==='pan'?'pan':'select');}
  async legacySource(project,dieline,side){
    const legacy=project.layers.filter(l=>sideOf(l)===side),copy={...project,svgArtwork:undefined,layers:legacy.map(l=>({...l,visible:true}))};
    const doc=new DOMParser().parseFromString(await exportSVG(copy,dieline,this.images,{side}),'image/svg+xml');
    const root=xmlRoot(dieline.width,dieline.height,dieline.minX,dieline.minY),defs=doc.querySelector('defs');if(defs)root.append(defs);
    for(const layer of legacy){
      const outer=[...doc.querySelectorAll('[data-layer-id]')].find(n=>n.getAttribute('data-layer-id')===layer.id);if(!outer)continue;
      let node=flattenGenerated(outer,layer.name);node.id=layer.id;
      if(side==='inside')node.setAttribute('transform',`translate(${dieline.minX+dieline.maxX} 0) scale(-1 1) ${node.getAttribute('transform')??''}`);
      if(!layer.visible)node.setAttribute('display','none');
      if(layer.locked)node.setAttribute('data-locked','true');
      if(layer.group)node.setAttribute('data-fold-group',encodeURIComponent(layer.group));
      root.append(node);
    }
    return serialize(root);
  }
  update(project,dieline,selected,panelId,side='outside'){
    if(!this.guard)this.api?.flush();const preserveView=this.dieline?.type===dieline.type&&this.dieline.width===dieline.width&&this.dieline.height===dieline.height;
    const previous=this.project;Object.assign(this,{project,dieline,panelId,side});
    const key=JSON.stringify([side,project.svgArtwork?.[side],project.layers.filter(l=>sideOf(l)===side),dieline.type,project.dimensions]);
    if(key===this.key&&previous===project){this.structure();return this.pending;}
    this.key=key;const sequence=++this.sequence;hostReady(this.host,false);
    this.pending=(async()=>{
      const legacy=project.layers.filter(l=>sideOf(l)===side);
      let source=project.svgArtwork?.[side]?svgDocumentSource(project.svgArtwork[side]):await this.legacySource(project,dieline,side);
      if(project.svgArtwork?.[side]&&legacy.length){
        const doc=new DOMParser().parseFromString(source,'image/svg+xml'),addition=new DOMParser().parseFromString(await this.legacySource(project,dieline,side),'image/svg+xml');
        // Fresh generated definitions are namespaced per layer by exportSVG.
        const prefix='added-'+crypto.randomUUID().replaceAll('-','')+'-';
        const isolated=new DOMParser().parseFromString(svgDocumentSource(parseSvgDocument(serialize(addition.documentElement)),{prefix}),'image/svg+xml');
        for(const layer of legacy){const node=[...isolated.querySelectorAll('[id]')].find(n=>n.id===prefix+layer.id);if(node)node.id=layer.id;}
        for(const node of [...isolated.documentElement.children])doc.documentElement.append(node);
        source=serialize(doc.documentElement);
      }
      if(sequence!==this.sequence)return;
      const root=new DOMParser().parseFromString(source,'image/svg+xml').documentElement;
      root.setAttribute('width',dieline.width);root.setAttribute('height',dieline.height);root.setAttribute('viewBox',`${dieline.minX} ${dieline.minY} ${dieline.width} ${dieline.height}`);
      // A top-level nested SVG is a viewport. Put older imports in a movable
      // graphic group, as with new imports, while keeping the original viewport.
      for(const viewport of [...root.children].filter(node=>node.localName==='svg')){
        const group=root.ownerDocument.createElementNS(ns,'g');
        const name=viewport.getAttribute('data-name');if(name){group.setAttribute('data-name',name);viewport.removeAttribute('data-name');}
        viewport.before(group);group.append(viewport);
      }
      const normalized=svgDocumentSource(parseSvgDocument(serialize(root)));
      this.guard=true;this.api.receive({type:'load',source:normalized,dimensions:[dieline.width,dieline.height],preserveView});this.guard=false;
      this.loadedSide=side;this.loadedProject=project;this.loadedLegacyIds=new Set(legacy.map(layer=>layer.id));
      if(project.svgArtwork?.[side]&&legacy.length)this.store(this.api.source(),true);
      const object=selected&&this.api.wrapper?.querySelector(`#${CSS.escape(selected)}`);
      if(object)this.api.select(object);
      this.structure();hostReady(this.host,true);
    })().catch(error=>{this.callbacks.notify(error.message);hostReady(this.host,true);});return this.pending;
  }
  async message(data){
    try{
      if(data.type==='changed'){if(!this.guard)this.pendingInput=true;return;}
      if(['ready','loaded'].includes(data.type))return;
      if(data.type==='error'){this.callbacks.notify(data.message);return;}
      if(data.type==='source-request'){this.api.receive({type:'source-approved',source:svgDocumentSource(parseSvgDocument(data.source)),dimensions:[this.dieline.width,this.dieline.height]});this.store(this.api.source());}
      if(data.type==='download'){
        const asset=parseSvgDocument(data.source),doc=new DOMParser().parseFromString(svgDocumentSource(asset),'image/svg+xml');doc.documentElement.setAttribute('width',this.dieline.width+'mm');doc.documentElement.setAttribute('height',this.dieline.height+'mm');download(new Blob([serialize(doc.documentElement)],{type:'image/svg+xml'}),`${this.project.name}-${this.side}.svg`);
      }
      if(data.type==='attribute-request'){
        if((!svgAttributes.has(data.attribute)&&!cssOnlyProperties.has(data.attribute))||['id','style'].includes(data.attribute))throw Error('请通过 SVG 源码编辑此属性');
        const value=data.value?normalizeSvgValue(data.tag,data.attribute,data.value):null;if(data.value&&value===null)throw Error('SVG 属性无效或包含外部引用');
        const doc=new DOMParser().parseFromString(data.source,'image/svg+xml'),node=[...doc.querySelectorAll('[id]')].find(n=>n.id===data.targetId);if(!node)return;
        let style;
        if(node.style.getPropertyValue(data.attribute)||(cssOnlyProperties.has(data.attribute)&&data.attribute!=='transform')){if(value===null)node.style.removeProperty(data.attribute);else node.style.setProperty(data.attribute,value);style=node.getAttribute('style')??'';}
        else if(value===null)node.removeAttribute(data.attribute);else node.setAttribute(data.attribute,value);
        parseSvgDocument(serialize(doc.documentElement));this.api.receive({type:'attribute-approved',targetId:data.targetId,attribute:data.attribute,value,...(style===undefined?{}:{style})});
      }
    }catch(error){this.api.receive({type:'error',message:error.message});this.callbacks.notify(error.message);}
  }
  store(source,normalize=false){
    if(this.guard||!this.project||this.loadedSide!==this.side||this.loadedProject!==this.project)return;
    try{
      const svg=svgSceneAsset(source),project=this.project;
      const migrated=layer=>sideOf(layer)===this.side&&this.loadedLegacyIds.has(layer.id);
      const generators={...project.svgGenerators};for(const l of project.layers)if(migrated(l)&&['barcode','qrcode'].includes(l.type))generators[l.id]=structuredClone(l);
      const artwork={...project.svgArtwork,[this.side]:svg},ids=new Set();
      const collect=node=>{if(typeof node==='string')return;if(node.attrs.id)ids.add(node.attrs.id);node.children.forEach(collect);};for(const asset of Object.values(artwork))asset.nodes.forEach(collect);
      const next={...project,version:3,svgArtwork:artwork,svgGenerators:Object.fromEntries(Object.entries(generators).filter(([id])=>ids.has(id))),layers:project.layers.filter(l=>!migrated(l))};
      validateProject(next);
      this.pendingInput=false;
      if(JSON.stringify(next)===JSON.stringify(project))return;
      Object.assign(project,next);this.key=JSON.stringify([this.side,svg,[],this.dieline.type,project.dimensions]);
      this.images.preload(svgSceneLayers(project,this.dieline)).then(()=>{this.images.retain([...svgSceneLayers(this.project,this.dieline),...this.project.layers]);this.callbacks.change();}).catch(error=>this.callbacks.notify(error.message));
      if(normalize)this.callbacks.normalize?.();else if(this.textEditing){this.textDirty=true;this.callbacks.draft?.();}else this.callbacks.commit();
    }catch(error){this.callbacks.notify(`SVG 修改未保存：${error.message}`);}
  }
  structure(){
    if(!this.api?.wrapper||!this.project||!this.dieline)return;
    const canvas=this.api.canvas,root=canvas.getSvgRoot(),holder=this.api.wrapper,d=this.dieline;
    // Paper, lines and artwork share the engine's SVG viewport. A second,
    // screen-derived transform can lag behind native viewport updates and
    // moves the dieline independently until the next pan/zoom event.
    const transform=(holder.getAttribute('transform')??'')+(this.side==='inside'?` translate(${d.minX+d.maxX} 0) scale(-1 1)`:'');
    const paper=root.querySelector('#fold-paper-guide')??element('g',{id:'fold-paper-guide','pointer-events':'none'});
    const lines=root.querySelector('#fold-line-guide')??element('g',{id:'fold-line-guide','pointer-events':'none'});
    if(paper.getAttribute('transform')!==transform)paper.setAttribute('transform',transform);
    if(lines.getAttribute('transform')!==transform)lines.setAttribute('transform',transform);
    const colors=this.side==='inside'?this.project.insidePanelColors:this.project.panelColors,fill=this.side==='inside'?this.project.insidePaper:this.project.paper;
    const key=JSON.stringify([this.side,this.colorMode,this.guides,colors,fill]);
    if(this.guideDieline!==d||this.guideKey!==key||!paper.children.length){
      paper.replaceChildren();lines.replaceChildren();
      for(const p of d.panels)paper.append(element('path',{d:path(printRegions(d,{panel:p.id,clipToPanel:true})),fill:proofColor(p.kind==='glue'?'#deddd0':colors?.[p.id]??fill,this.colorMode)}));
      lines.append(element('path',{d:cutSegments(d).map(([a,b])=>`M${a.join(' ')}L${b.join(' ')}`).join(' '),fill:'none',stroke:'#c05656','stroke-width':.35,'vector-effect':'non-scaling-stroke'}));
      if(this.guides)for(const p of creasePaths(d))lines.append(element('path',{d:p.d,fill:'none',stroke:'#688d61','stroke-width':.5,'stroke-dasharray':'3 2','vector-effect':'non-scaling-stroke'}));
      this.guideDieline=d;this.guideKey=key;
    }
    // SVGCanvas can add its own layer around the source wrapper. Use the
    // actual parent so both guides also inherit that layer's coordinates.
    const parent=holder.parentNode;
    if(paper.parentNode!==parent||paper.nextSibling!==holder)parent.insertBefore(paper,holder);
    if(lines.parentNode!==parent||lines!==parent.lastChild)parent.append(lines);
    this.refreshProof(holder);
    const screen=holder.getScreenCTM(),r=this.host.getBoundingClientRect();if(screen){this.view={scale:screen.a,x:screen.e-r.left,y:screen.f-r.top};}
  }
  properties(host,node){
    if(!this.project)return;
    const kinds={g:'组合',svg:'SVG 画布',text:'文字',tspan:'文字分段',textPath:'路径文字',path:'路径',rect:'矩形',circle:'圆形',ellipse:'椭圆',image:'图片',use:'引用'};
    document.querySelector('#selected-type').textContent=node?(kinds[node.localName]??'SVG 对象'):'包装面板';
    if(node?.closest('[data-locked="true"]'))return;
    if(node)appendImageTools(host,node,this);
    const generator=node&&(this.project.svgGenerators?.[node.id]??this.project.layers.find(l=>l.id===node.id&&['barcode','qrcode'].includes(l.type)));
    if(node?.localName==='text'){
      let input=host.querySelector('#node-text');
      if(!input){const label=document.createElement('label');label.textContent='文字内容';input=document.createElement('textarea');input.id='node-text';label.append(input);host.prepend(label);}
      input.value=readSvgText(node);
      input.onchange=()=>{try{replaceSvgText(this,node,input.value);}catch(error){this.callbacks.notify(error.message);}};
    }
    if(generator){
      const barcode=generator.type==='barcode',section=document.createElement('section');
      const field=(label,control)=>{const wrapper=document.createElement('label');wrapper.textContent=label;wrapper.append(control);section.append(wrapper);return control;};
      const options=(name,id,values,current)=>{const select=document.createElement('select');select.id=id;for(const [value,title]of values)select.append(new Option(title,value,value===current,value===current));return field(name,select);};
      const input=field(barcode?'条码内容':'二维码内容',document.createElement('textarea'));input.id='native-code';input.value=barcode?generator.code:generator.text;input.maxLength=barcode?120:2000;
      const format=barcode?options('条码制式','native-barcode-format',[['ean13','EAN-13'],['code128','Code 128']],generator.format??'ean13'):options('二维码纠错等级','native-qrcode-level',['L','M','Q','H'].map(v=>[v,v]),generator.errorCorrectionLevel??'M');
      const note=document.createElement('p');note.id='native-code-status';note.setAttribute('aria-live','polite');section.append(note);host.prepend(section);
      const candidate=()=>({...generator,...(barcode?{code:input.value,format:format.value}:{text:input.value,errorCorrectionLevel:format.value})});
      const check=()=>{const next=candidate(),status=barcode?barcodeStatus(next):qrStatus(next.text,next.errorCorrectionLevel);input.setAttribute('aria-invalid',String(!!status.error));note.textContent=status.error??(barcode?'编码有效':`版本 ${status.version} · ${status.size} × ${status.size}`);return status;};
      input.oninput=check;input.onchange=format.onchange=()=>{if(!check().error)this.regenerate(node,candidate());};check();
    }
    if(node)return;
    const panel=this.dieline?.panels.find(p=>p.id===this.panelId);if(!panel)return;
    const heading=document.createElement('p');heading.textContent=`${panel.label} · ${panel.w.toFixed(1)} × ${panel.h.toFixed(1)} mm`;host.append(heading);
    const label=document.createElement('label');label.textContent='面板背景';const input=document.createElement('input');input.type='color';input.id='panel-color';input.value=(this.side==='inside'?this.project.insidePanelColors?.[panel.id]:this.project.panelColors?.[panel.id])??(this.side==='inside'?this.project.insidePaper:this.project.paper);label.append(input);host.append(label);
  }
  regenerate(node,generator){
    try{
      const d=this.dieline,panel=d.panels.find(p=>p.id===generator.panel),defs=[],ctx=new SvgDrawingContext(defs,'generator-'+node.id);
      drawLayer(ctx,generator,panel,this.images);const doc=new DOMParser().parseFromString(`<svg xmlns="${ns}">${ctx.toSVG()}</svg>`,'image/svg+xml');
      const fresh=flattenGenerated(doc.documentElement.firstElementChild,generator.name);
      if(!fresh||node.localName!=='g')throw Error('无法更新这个图形组');
      node.replaceChildren(...[...fresh.childNodes].map(n=>document.importNode(n,true)));
      this.project.svgGenerators={...this.project.svgGenerators,[node.id]:generator};
      this.store(this.api.source());this.api.refreshProperties();
    }catch(error){this.callbacks.notify(error.message);}
  }
  async importSVG(source,name,preservePosition=false){
    const project=this.project,side=this.side;await this.pending;if(project!==this.project||side!==this.side)throw Error('工程或印刷面已改变，请重新导入');const asset=parseSvgDocument(source),root=new DOMParser().parseFromString(svgDocumentSource(asset),'image/svg+xml').documentElement;
    const panel=this.dieline.panels.find(p=>p.id===this.panelId),[, ,w,h]=asset.viewBox,fit=Math.min(panel.w*.8/w,panel.h*.8/h);
    const x=this.side==='inside'?this.dieline.minX+this.dieline.maxX-panel.x-panel.w/2:panel.x+panel.w/2;
    const viewBox=root.getAttribute('viewBox')?.split(/[\s,]+/).map(Number)??asset.viewBox;
    if(!root.hasAttribute('viewBox'))root.setAttribute('viewBox',viewBox.join(' '));
    root.setAttribute('x',preservePosition?viewBox[0]:x-w*fit/2);root.setAttribute('y',preservePosition?viewBox[1]:panel.y+panel.h/2-h*fit/2);root.setAttribute('width',preservePosition?w:w*fit);root.setAttribute('height',preservePosition?h:h*fit);if(!preservePosition)root.setAttribute('data-name',name);
    // Rename incoming IDs/references only to avoid collisions with current art.
    const prefix='import-'+crypto.randomUUID().replaceAll('-','')+'-';
    const safe=svgAssetMarkup(parseSvgDocument(serialize(root)),{prefix});
    const container=xmlRoot(this.dieline.width,this.dieline.height);
    const placement=element('g',{'data-name':name});placement.innerHTML=safe;
    placement.firstElementChild.removeAttribute('data-name');container.append(placement);
    const combined=new DOMParser().parseFromString(this.api.source(),'image/svg+xml');
    combined.documentElement.append(combined.importNode(placement,true));
    svgSceneAsset(serialize(combined.documentElement));
    this.api.append(serialize(container));this.up();
  }
  copyToSystem(){
    try{
      const selected=new Set(this.api.canvas.getSelectedElements().filter(Boolean).map(n=>n.id)),asset=parseSvgDocument(this.api.source()),root=asset.nodes[0],included=new Set();
      const visit=n=>{if(typeof n==='string')return;if(selected.has(n.attrs.id))included.add(n);for(const c of n.children)visit(c);};visit(root);
      const partial={...asset,nodes:[selectSvgArtwork(root,included)]};validateSvgAsset(partial);
      navigator.clipboard?.writeText('FOLD-SVG\n'+svgDocumentSource(partial)).catch(()=>{});
    }catch{/* The core's internal clipboard remains available for linked objects. */}
  }
  run(action){this.api.run(action);}
  renderLayers(){this.api?.refreshTree();}
  renderInspector(){this.api?.refreshProperties();}
  setTheme(value){this.host.dataset.theme=value;}
  refreshProof(holder){
    const rules=new Set();
    if(this.colorMode==='cmyk')for(const node of holder.querySelectorAll('[fill],[stroke],[color]')){
      if(node.closest('defs,mask,clipPath,filter'))continue;
      for(const key of ['fill','stroke','color']){
        const value=node.getAttribute(key);
        if(/^#(?:[a-f0-9]{3}|[a-f0-9]{6})$/i.test(value??''))rules.add(`#svgcontent [${key}="${value}"]:not(defs *,mask *,clipPath *,filter *){${key}:${proofColor(value,'cmyk')}}`);
      }
    }
    const css=[...rules].join('\n');if(this.proofStyle.textContent!==css)this.proofStyle.textContent=css;
  }
  setColorMode(mode){this.colorMode=mode;this.structure();}
  resize(){this.api?.layout();}
  fit(){this.api?.layout(true);}
  zoom(factor){this.api.zoom(factor);}
  invalidate(){this.structure();}
  up(){if(!this.guard){this.api?.endRename();this.api?.endText();this.api?.flush();}}
  flushInput(){if(document.activeElement?.closest('#properties'))document.activeElement.blur();this.up();}
  get dirty(){return !!this.pendingInput||!!this.api?.layerDirty;}
}
function hostReady(host,value){host.dataset.svgReady=String(value);host.inert=!value;}
