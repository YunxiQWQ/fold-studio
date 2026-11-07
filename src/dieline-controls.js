import {RETAIL_STYLES,retailSettings} from './retail-cartons.js';
import {wrappedLidSettings} from './wrapped-lidbox.js';

const row=(key,label,value,min,max,step='any')=>`<div class="extra-dim-row"><div class="extra-dim-label"><span>${label}</span><strong id="val-${key}">${Number(value.toFixed(1))} mm</strong></div><div class="extra-dim-control"><input type="range" class="extra-dim-slider" data-extra-dim="${key}" min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${label}"/><input type="number" class="extra-dim-num" data-extra-dim="${key}" min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${label}数值"/></div></div>`;
export function renderAddedDielineControls(container,project,dieline){
  let content,signature=project.type;
  if(project.type==='retail-carton'){
    const b=retailSettings(project.dimensions);signature+='-'+b.style;
    content=`<div class="extra-dim-heading"><span>彩盒刀版</span><span class="extra-dim-sub">八种结构</span></div><label class="select-label">刀版结构<select id="retail-style" data-reference-option="retailStyle">${Object.entries(RETAIL_STYLES).map(([id,label])=>`<option value="${id}" ${id===b.style?'selected':''}>${label}</option>`).join('')}</select></label><p class="field-note">长 × 宽 × 高为盒身尺寸${b.hanging?`，吊挂片另增加 ${b.HH.toFixed(1)} mm 高度`:''}。飞机式为管状插扣盒；翻盖飞机盒在结构库中另列。</p>${row('tuckLength','圆插舌高度',b.T,2,Math.max(2,Math.min(b.D*.7,b.H*.6,40)))}${row('glueWidth','侧粘口宽度',b.G,2,Math.max(2,Math.min(45,b.L*.35,b.D*.6)))}${b.hanging?row('hangHeight','吊挂片高度',b.HH,Math.min(8,b.H*.4),Math.max(8,Math.min(150,b.H*.8)))+row('hangHoleWidth','挂孔宽度',b.HW,Math.min(6,b.L*.3),b.L*.72)+row('hangHoleHeight','挂孔高度',b.holeH,Math.min(2,b.HH*.15),b.HH*.35):''}`;
  }else if(project.type==='wrapped-lidbox'){
    const b=wrappedLidSettings(project.dimensions);
    content=`<div class="extra-dim-heading"><span>天地盖硬盒包边</span></div><p class="field-note">尺寸为底盒；上盖长宽各增加两倍套合间隙。两张十字包纸可分别设计，包边不超过对应壁高的 90%。展开 ${dieline.width.toFixed(1)} × ${dieline.height.toFixed(1)} mm。</p>${row('lidHeight','上盖高度',b.lidH,5,b.H)}${row('turnIn','内包边宽度',b.U,2,Math.max(2,b.H*.9))}${row('lidClearance','每侧套合间隙',b.C,.5,5,.5)}`;
  }else return false;
  container.hidden=false;
  if(container.firstElementChild?.dataset.dielineControls!==signature)container.innerHTML=`<div data-dieline-controls="${signature}">${content}</div>`;
  else{
    const template=document.createElement('template');template.innerHTML=content;
    for(const input of container.querySelectorAll('[data-extra-dim]')){
      const next=template.content.querySelector(`input[type="${input.type}"][data-extra-dim="${input.dataset.extraDim}"]`);
      for(const key of ['min','max','step'])input[key]=next[key];if(input!==document.activeElement)input.value=next.value;
    }
    for(const label of container.querySelectorAll('[id^="val-"]'))label.textContent=template.content.querySelector('#'+label.id).textContent;
    for(const select of container.querySelectorAll('[data-reference-option]'))select.value=template.content.querySelector('#'+select.id).value;
    container.querySelector('.field-note').textContent=template.content.querySelector('.field-note').textContent;
  }
  return true;
}
