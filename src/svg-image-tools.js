const ns='http://www.w3.org/2000/svg';
const make=(name,attrs)=>{const el=document.createElementNS(ns,name);for(const [key,value]of Object.entries(attrs))el.setAttribute(key,value);return el;};
const bounds=node=>Object.fromEntries(['x','y','width','height'].map(k=>[k,Number(node.getAttribute(k)??0)]));

export function appendImageTools(host,node,editor){
  if(node.localName!=='image')return;
  const buttons=document.createElement('div');buttons.className='editor-action-grid';
  const crop=document.createElement('button');crop.textContent='裁剪图片';crop.id='native-crop-image';
  const replace=document.createElement('button');replace.textContent='替换图片';replace.id='native-replace-image';
  buttons.append(crop,replace);host.prepend(buttons);
  crop.onclick=()=>openCrop(node,editor).catch(error=>editor.callbacks.notify(error.message));
  replace.onclick=()=>{
    const input=document.createElement('input');input.type='file';input.accept='image/png,image/jpeg,image/webp';
    input.onchange=async()=>{
      const file=input.files[0];if(!file)return;
      try{
        if(file.size>15*1024*1024)throw Error('图片请小于 15 MB');
        const bitmap=await createImageBitmap(file),scale=Math.min(1,1536/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
        if(!node.isConnected)throw Error('目标图片已改变');node.setAttribute('href',canvas.toDataURL('image/png'));node.removeAttributeNS('http://www.w3.org/1999/xlink','href');editor.store(editor.api.source());editor.api.refreshProperties();
      }catch(error){editor.callbacks.notify(error.message);}
    };input.click();
  };
}

async function openCrop(node,editor){
  const initial=bounds(node);if(initial.width<=0||initial.height<=0)throw Error('图片尺寸无效');
  let frame={...initial},existing;
  for(let p=node.parentElement;p&&p!==editor.api.wrapper;p=p.parentElement){
    const ref=p.getAttribute('clip-path')?.match(/^url\(#([^)]*)\)$/)?.[1];if(!ref)continue;
    const clip=[...editor.api.wrapper.querySelectorAll('[id]')].find(n=>n.id===ref);
    if(clip?.children.length===1&&clip.firstElementChild.localName==='rect'&&clip.getAttribute('clipPathUnits')!=='objectBoundingBox'){existing=clip;frame=bounds(clip.firstElementChild);}break;
  }
  let region={x:Math.max(0,(frame.x-initial.x)/initial.width),y:Math.max(0,(frame.y-initial.y)/initial.height),w:Math.min(1,frame.width/initial.width),h:Math.min(1,frame.height/initial.height)};
  const img=new Image();img.src=node.getAttribute('href')??node.getAttribute('xlink:href');await img.decode();
  const dialog=document.createElement('dialog');dialog.id='native-image-crop-dialog';dialog.className='crop-dialog';
  dialog.innerHTML='<h2>裁剪图片</h2><p>拖动取框，或输入百分比；应用后更新平面与三维，原图片数据保留。</p><canvas width="560" height="320" aria-label="拖动裁剪图片"></canvas><div class="editor-action-grid"><button data-crop-preset="full">完整图片</button><button data-crop-preset="square">1 : 1</button><button data-crop-preset="wide">16 : 9</button></div><div class="property-grid">'+['x','y','w','h'].map((key,i)=>`<label>${['左侧','顶部','宽度','高度'][i]} %<input type="number" min="${i<2?0:1}" max="100" data-crop-field="${key}" step=".1"></label>`).join('')+'</div><div class="dialog-actions"><button data-crop-cancel>取消</button><button data-crop-apply>应用裁剪</button></div>';
  document.body.append(dialog);const canvas=dialog.querySelector('canvas'),ctx=canvas.getContext('2d'),scale=Math.min(540/img.naturalWidth,300/img.naturalHeight),r={x:(560-img.naturalWidth*scale)/2,y:(320-img.naturalHeight*scale)/2,w:img.naturalWidth*scale,h:img.naturalHeight*scale};
  function paint(){ctx.clearRect(0,0,560,320);ctx.drawImage(img,r.x,r.y,r.w,r.h);ctx.fillStyle='#0009';ctx.fillRect(r.x,r.y,r.w,r.h);ctx.save();ctx.beginPath();ctx.rect(r.x+region.x*r.w,r.y+region.y*r.h,region.w*r.w,region.h*r.h);ctx.clip();ctx.drawImage(img,r.x,r.y,r.w,r.h);ctx.restore();ctx.strokeStyle='#72a45e';ctx.lineWidth=2;ctx.strokeRect(r.x+region.x*r.w,r.y+region.y*r.h,region.w*r.w,region.h*r.h);for(const field of dialog.querySelectorAll('[data-crop-field]'))if(field!==document.activeElement)field.value=+(region[field.dataset.cropField]*100).toFixed(1);}
  const clamp=()=>{region.x=Math.max(0,Math.min(.99,region.x));region.y=Math.max(0,Math.min(.99,region.y));region.w=Math.max(.01,Math.min(1-region.x,region.w));region.h=Math.max(.01,Math.min(1-region.y,region.h));};
  dialog.oninput=event=>{if(!event.target.dataset.cropField)return;region[event.target.dataset.cropField]=Number(event.target.value)/100;clamp();paint();};
  dialog.querySelectorAll('[data-crop-preset]').forEach(button=>button.onclick=()=>{let w=1,h=1;const type=button.dataset.cropPreset;if(type!=='full'){const ratio=img.naturalWidth/img.naturalHeight,aspect=type==='square'?1:16/9;if(ratio>aspect)w=aspect/ratio;else h=ratio/aspect;}region={x:(1-w)/2,y:(1-h)/2,w,h};paint();});
  let start;const point=event=>{const b=canvas.getBoundingClientRect();return {x:Math.max(0,Math.min(1,((event.clientX-b.left)*560/b.width-r.x)/r.w)),y:Math.max(0,Math.min(1,((event.clientY-b.top)*320/b.height-r.y)/r.h))};};
  canvas.onpointerdown=event=>{start=point(event);canvas.setPointerCapture(event.pointerId);};canvas.onpointermove=event=>{if(!start)return;const p=point(event);region={x:Math.min(start.x,p.x),y:Math.min(start.y,p.y),w:Math.abs(start.x-p.x),h:Math.abs(start.y-p.y)};clamp();paint();};canvas.onpointerup=canvas.onpointercancel=()=>{start=null;};
  const close=()=>{editor.pendingInput=false;dialog.close();dialog.remove();};dialog.querySelector('[data-crop-cancel]').onclick=close;dialog.oncancel=event=>{event.preventDefault();close();};
  dialog.querySelector('[data-crop-apply]').onclick=()=>{
    if(!node.isConnected){close();return;}
    if(!existing){
      const id='crop-'+crypto.randomUUID().replaceAll('-',''),clip=make('clipPath',{id,clipPathUnits:'userSpaceOnUse'});clip.append(make('rect',frame));
      let defs=[...editor.api.wrapper.children].find(n=>n.localName==='defs');if(!defs){defs=make('defs',{});editor.api.wrapper.prepend(defs);}defs.append(clip);
      const group=make('g',{'clip-path':`url(#${id})`});if(node.hasAttribute('transform')){group.setAttribute('transform',node.getAttribute('transform'));node.removeAttribute('transform');}node.before(group);group.append(node);
    }
    const width=frame.width/region.w,height=frame.height/region.h;
    for(const [key,value]of Object.entries({x:frame.x-region.x*width,y:frame.y-region.y*height,width,height}))node.setAttribute(key,String(value));
    editor.store(editor.api.source());editor.api.refreshTree();editor.api.refreshProperties();close();
  };
  dialog.showModal();paint();
}
