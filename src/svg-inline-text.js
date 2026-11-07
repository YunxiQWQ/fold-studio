import {readSvgText,writeSvgText,textLines} from './svg-typography.js';

const ns='http://www.w3.org/2000/svg';
const svg=(name,attrs={})=>{const node=document.createElementNS(ns,name);for(const [key,value]of Object.entries(attrs))node.setAttribute(key,value);return node;};
const segmenter=typeof Intl.Segmenter==='function'?new Intl.Segmenter(undefined,{granularity:'word'}):null;

// SVG remains the visible text renderer. The tiny, transparent textarea only
// supplies native editing, clipboard, undo and IME; no second font layout.
export function installSvgInlineText(canvas,container,{input,root,context,changed,editing,selectionChanged:notifySelection,validate,command}){
  const overlay=svg('svg',{'class':'native-text-overlay','aria-hidden':'true'}),boundary=svg('path',{'class':'native-text-boundary'}),selection=svg('g',{'class':'native-text-selection'}),composition=svg('g',{'class':'native-text-composition'}),caret=svg('path',{'class':'native-text-caret'});
  overlay.append(boundary,selection,composition,caret);container.append(overlay);overlay.style.display='none';
  input.spellcheck=false;input.wrap='off';input.maxLength=5000;input.tabIndex=-1;input.setAttribute('autocomplete','off');
  let session=null,drag=null,frame=0,ending=false,formatPointer=false;
  const typographyControl=node=>!!node?.closest?.('[data-property-section="typography"]');
  const resetGesture=()=>{canvas.setStarted(false);canvas.setStartTransform(null);canvas.setJustSelected(null);canvas.dragStartTransforms=null;canvas.hasDragStartTransform=false;canvas.getRubberBox()?.setAttribute('display','none');};
  function leaves(node){
    const starts=new Set(textLines(node).slice(1)),result=[];let offset=0;
    const visit=current=>{
      if(current.nodeType===3){for(let i=0;i<current.length;){const value=String.fromCodePoint(current.data.codePointAt(i));result.push({start:offset,end:offset+value.length,text:current,offset:i,value});offset+=value.length;i+=value.length;}return;}
      if(['title','desc'].includes(current.localName))return;
      if(starts.has(current)){result.push({start:offset,end:offset+1,line:current,value:'\n'});offset++;}
      for(const child of current.childNodes)visit(child);
    };visit(node);return result;
  }
  function measure(){
    const node=session.node,matrix=node.getScreenCTM();if(!matrix)return [];
    const tokens=leaves(node),total=tokens.filter(t=>!t.line).reduce((n,t)=>n+t.value.length,0),count=node.getNumberOfChars(),direct=total===count,range=document.createRange(),inverse=matrix.inverse(),styles=new Map(),separate=new Map();let index=0;
    return tokens.map(token=>{
      if(token.line)return token;
      const initial=index;index+=token.value.length;const parent=token.text.parentElement;
      if(!separate.has(parent))separate.set(parent,!!parent.closest('textPath,[rotate]')||[node,parent].some(n=>['x','y','dx','dy'].some(key=>(n.getAttribute(key)?.trim().split(/[\s,]+/).length??0)>1)));
      // Native SVG character geometry is expensive for long text. Read it only
      // for the caret and selected range endpoints, never for every keystroke.
      let geometry,measured=false;
      const get=()=>{
        if(measured)return geometry;measured=true;let char=initial;
        if(!direct){
          range.setStart(token.text,token.offset);range.setEnd(token.text,token.offset+token.value.length);const box=range.getBoundingClientRect();
          if(!box.width&&!box.height||/\s/.test(token.value)&&(!box.width||!box.height))return;
          const p=new DOMPoint(box.x+box.width/2,box.y+box.height/2).matrixTransform(inverse);char=node.getCharNumAtPosition(p);
        }
        if(char<0||char>=count)return;
        if(!styles.has(parent)){const style=getComputedStyle(parent);styles.set(parent,{size:parseFloat(style.fontSize)||6,vertical:style.writingMode.startsWith('vertical')});}
        const {size,vertical}=styles.get(parent),a=node.getStartPositionOfChar(char),b=node.getEndPositionOfChar(Math.min(count-1,char+token.value.length-1)),angle=node.getRotationOfChar(char)*Math.PI/180,n=vertical?{x:1,y:0}:{x:-Math.sin(angle),y:Math.cos(angle)},extent=vertical?node.getExtentOfChar(char):null,ascent=vertical?Math.max(0,a.x-extent.x):size*.9,descent=vertical?Math.max(size*.15,extent.x+extent.width-a.x):size*.25;
        const edge=p=>[{x:p.x-n.x*ascent,y:p.y-n.y*ascent},{x:p.x+n.x*descent,y:p.y+n.y*descent}].map(p=>new DOMPoint(p.x,p.y).matrixTransform(matrix));
        return geometry={a:edge(a),b:edge(b)};
      };
      return Object.defineProperties({...token,charIndex:direct?initial:null,separate:separate.get(parent)},{a:{get:()=>get()?.a},b:{get:()=>get()?.b}});
    });
  }
  function runs(tokens,predicate=()=>true){
    const result=[];let last;
    for(const token of tokens){if(token.line||!predicate(token)){last=null;continue;}if(!token.separate&&last?.at(-1).text===token.text)last.push(token);else{last=[token];result.push(last);}}
    return result;
  }
  function emptyEdge(position){
    const node=session.node,lines=textLines(node),value=input.value.slice(0,position),row=value.split('\n').length-1,line=lines[row]??lines.at(-1)??node,style=getComputedStyle(line),size=parseFloat(style.fontSize)||6,vertical=style.writingMode.startsWith('vertical'),matrix=node.getScreenCTM();if(!matrix)return null;
    const x=parseFloat(line.getAttribute('x')??node.getAttribute('x'))||0,y=parseFloat(line.getAttribute('y')??node.getAttribute('y'))||0;
    const points=vertical?[{x:x-size*.5,y},{x:x+size*.5,y}]:[{x,y:y-size*.9},{x,y:y+size*.25}];
    return points.map(p=>new DOMPoint(p.x,p.y).matrixTransform(matrix));
  }
  function edgeAt(position,tokens){
    const next=tokens.find(t=>t.start>=position),previous=tokens.findLast(t=>t.end<=position);
    // A virtual newline belongs after the preceding glyph, not at its row's
    // origin. Empty rows still use their explicit SVG insertion coordinates.
    if(next?.line)return previous?.b??emptyEdge(position);
    if(position===input.value.length&&input.value.endsWith('\n')||previous?.line&&(!next||next.start>position))return emptyEdge(position);
    if(next?.a)return next.a;
    if(previous?.b)return previous.b;
    return emptyEdge(position);
  }
  function draw(){
    frame=0;if(!session)return;
    if(!session.node.isConnected||!root()?.contains(session.node)){end(false);return;}
    const bounds=container.getBoundingClientRect(),tokens=session.tokens=measure(),start=input.selectionStart,selectionEnd=input.selectionEnd;
    session.selection=`${start}:${selectionEnd}:${input.selectionDirection}`;
    overlay.setAttribute('viewBox',`0 0 ${container.clientWidth} ${container.clientHeight}`);selection.replaceChildren();composition.replaceChildren();
    const local=p=>`${p.x-bounds.left},${p.y-bounds.top}`;
    for(const run of runs(tokens,t=>t.end>start&&t.start<selectionEnd)){const a=run[0].a,b=run.at(-1).b;if(a&&b)selection.append(svg('polygon',{points:[a[0],b[0],b[1],a[1]].map(local).join(' ')}));}
    if(session.composing)for(const run of runs(tokens,t=>t.end>session.compositionStart&&t.start<session.compositionStart+session.compositionLength)){const a=run[0].a,b=run.at(-1).b;if(a&&b)composition.append(svg('path',{d:`M${local(a[1])}L${local(b[1])}`}));}
    const edge=edgeAt(input.selectionDirection==='backward'?start:selectionEnd,tokens);
    const matrix=session.node.getScreenCTM(),box=session.node.getBBox();
    if(matrix){
      const inverse=matrix.inverse(),points=edge?.map(p=>p.matrixTransform(inverse))??[],padX=3/Math.max(.001,Math.hypot(matrix.a,matrix.b)),padY=3/Math.max(.001,Math.hypot(matrix.c,matrix.d));
      if(!session.node.getNumberOfChars()&&points.length){box.x=points[0].x;box.y=points[0].y;box.width=box.height=0;}
      const x=Math.min(box.x,...points.map(p=>p.x))-padX,y=Math.min(box.y,...points.map(p=>p.y))-padY,right=Math.max(box.x+box.width,...points.map(p=>p.x))+padX,bottom=Math.max(box.y+box.height,...points.map(p=>p.y))+padY;
      boundary.setAttribute('d',[[x,y],[right,y],[right,bottom],[x,bottom]].map(([x,y],i)=>`${i?'L':'M'}${local(new DOMPoint(x,y).matrixTransform(matrix))}`).join(' ')+'Z');
    }
    caret.style.display=start===selectionEnd||session.composing?'':'none';
    if(edge){caret.setAttribute('d',`M${local(edge[0])}L${local(edge[1])}`);input.style.left=Math.max(0,Math.min(innerWidth-2,edge[1].x))+'px';input.style.top=Math.max(0,Math.min(innerHeight-2,edge[0].y))+'px';input.style.height=Math.max(2,Math.hypot(edge[1].x-edge[0].x,edge[1].y-edge[0].y))+'px';}
    caret.classList.toggle('composing',!!session.composing);
    const rangeKey=start===selectionEnd?'':`${start}:${selectionEnd}`;
    if(session.rangeKey!==rangeKey){session.rangeKey=rangeKey;notifySelection?.();}
  }
  function characterRange(){
    if(!session||!session.node.isConnected||input.selectionStart===input.selectionEnd)return null;
    const start=input.selectionStart,end=input.selectionEnd,tokens=leaves(session.node).filter(t=>!t.line&&t.end>start&&t.start<end);
    return {node:session.node,start,end,direction:input.selectionDirection,text:input.value.slice(start,end),nodes:[...new Set(tokens.map(t=>t.text.parentElement))]};
  }
  function formatSelection(apply){
    const range=characterRange();if(!range)return false;
    if(session.composing)throw Error('请先完成输入法输入，再修改所选文字样式');
    const node=session.node,before=node.cloneNode(true),runs=new Map();
    for(const token of leaves(node))if(!token.line&&token.end>range.start&&token.start<range.end){
      const a=token.offset+Math.max(0,range.start-token.start),b=token.offset+Math.min(token.value.length,range.end-token.start),run=runs.get(token.text);
      if(run)run.end=b;else runs.set(token.text,{start:a,end:b});
    }
    try{
      for(const [text,run]of runs){
        if(!run.start&&run.end===text.length&&text.parentElement.localName==='tspan'&&text.parentElement.childNodes.length===1){apply(text.parentElement);continue;}
        let part=text;if(run.end<part.length)part.splitText(run.end);if(run.start)part=part.splitText(run.start);
        const span=svg('tspan',{id:canvas.getNextId()});part.replaceWith(span);span.append(part);apply(span);
      }
      validate?.();
    }catch(error){node.replaceChildren(...before.childNodes);draw();throw error;}
    changed();draw();return true;
  }
  function refresh(){if(session&&!frame)frame=requestAnimationFrame(draw);}
  function positionAt(x,y){
    if(frame){cancelAnimationFrame(frame);draw();}
    const tokens=session.tokens??measure(),matrix=session.node.getScreenCTM(),p=new DOMPoint(x,y).matrixTransform(matrix.inverse()),char=session.node.getCharNumAtPosition(p),hit=char<0?null:tokens.find(t=>t.charIndex!==null&&t.charIndex<=char&&t.charIndex+t.value.length>char),candidates=[];let closest=0,distance=Infinity;
    if(hit)candidates.push(hit);
    else for(const run of runs(tokens)){
      if(run.length<12||run[0].separate){candidates.push(...run);continue;}
      const first=run[0].a,last=run.at(-1).b;if(!first||!last)continue;
      const a={x:(first[0].x+first[1].x)/2,y:(first[0].y+first[1].y)/2},b={x:(last[0].x+last[1].x)/2,y:(last[0].y+last[1].y)/2},vx=b.x-a.x,vy=b.y-a.y,target=(x-a.x)*vx+(y-a.y)*vy;let lo=0,hi=run.length-1;
      while(lo<hi){const mid=(lo+hi)>>1,edge=run[mid].a;if(!edge)break;const projected=((edge[0].x+edge[1].x)/2-a.x)*vx+((edge[0].y+edge[1].y)/2-a.y)*vy;if(projected<target)lo=mid+1;else hi=mid;}
      candidates.push(run[0],run.at(-1),...run.slice(Math.max(0,lo-2),Math.min(run.length,lo+3)));
    }
    for(const token of candidates){
      for(const [edge,offset]of [[token.a,token.start],[token.b,token.end]]){
        if(!edge)continue;const a=edge[0],b=edge[1],vx=b.x-a.x,vy=b.y-a.y,t=Math.max(0,Math.min(1,((x-a.x)*vx+(y-a.y)*vy)/(vx*vx+vy*vy||1))),d=Math.hypot(x-a.x-t*vx,y-a.y-t*vy);
        if(d<distance){closest=offset;distance=d;}
      }
    }
    // Empty lines still have a valid insertion location.
    for(let i=0;i<=input.value.length;i++)if(i===0||input.value[i-1]==='\n'){
      if(tokens.some(t=>t.start===i&&t.a))continue;const edge=emptyEdge(i);if(!edge)continue;const d=Math.hypot(x-(edge[0].x+edge[1].x)/2,y-(edge[0].y+edge[1].y)/2);if(d<distance){distance=d;closest=i;}
    }
    return closest;
  }
  function select(start,end=start){input.setSelectionRange(Math.min(start,end),Math.max(start,end),end<start?'backward':'forward');draw();}
  function wordAt(position){
    if(segmenter){for(const word of segmenter.segment(input.value))if(position>=word.index&&position<word.index+word.segment.length)return [word.index,word.index+word.segment.length];}
    let a=position,b=position;while(a>0&&!/\s/.test(input.value[a-1]))a--;while(b<input.value.length&&!/\s/.test(input.value[b]))b++;return [a,b];
  }
  function begin(node,event){
    node=node?.closest?.('text')??node;
    if(!node||node.localName!=='text'||!root()?.contains(node)||node.closest('[data-locked="true"]'))return;
    if(session?.node!==node){
      end(false);formatPointer=false;resetGesture();canvas.setContext(context(node.parentElement));canvas.selectOnly([node],true);
      session={node,composing:false};input.value=readSvgText(node);input.dir=getComputedStyle(node).direction;input.classList.add('is-inline');node.setAttribute('data-fold-inline-editing','true');node.style.removeProperty('cursor');canvas.setMode('textedit');canvas.selectorManager.requestSelector(node)?.showGrips(false);overlay.style.display='';container.classList.add('native-text-editing');editing?.(true);
      input.focus({preventScroll:true});input.setSelectionRange(input.value.length,input.value.length);draw();
    }
    if(event&&typeof event==='object')select(...wordAt(positionAt(event.clientX,event.clientY)));else refresh();
  }
  function releaseDrag(){const prior=drag;drag=null;if(prior&&container.hasPointerCapture(prior.pointer))container.releasePointerCapture(prior.pointer);}
  function end(keepSelection=true){
    if(ending)return;const current=session;if(!current)return;
    ending=true;session=null;formatPointer=false;releaseDrag();if(frame)cancelAnimationFrame(frame);frame=0;overlay.style.display='none';selection.replaceChildren();composition.replaceChildren();caret.removeAttribute('d');input.classList.remove('is-inline');input.removeAttribute('style');container.classList.remove('native-text-editing');
    const node=current.node;node.removeAttribute('data-fold-inline-editing');node.style.removeProperty('cursor');if(!node.getAttribute('style'))node.removeAttribute('style');resetGesture();canvas.setMode('select');
    try{
      if(node.isConnected&&root()?.contains(node)){
        canvas.setContext(context(node.parentElement));
        if(!readSvgText(node).length){canvas.selectOnly([node]);canvas.deleteSelectedElements();changed();}
        else if(keepSelection){canvas.selectOnly([node],true);canvas.selectorManager.requestSelector(node)?.showGrips(true);}
      }else if(root()){canvas.clearSelection(true);canvas.setContext(root());}
      editing?.(false);if(document.activeElement===input)input.blur();
    }finally{ending=false;}
  }
  input.addEventListener('input',()=>{if(!session)return;writeSvgText(session.node,input.value);changed();draw();});
  const selectionChanged=()=>{if(session&&session.selection!==`${input.selectionStart}:${input.selectionEnd}:${input.selectionDirection}`)refresh();};
  input.addEventListener('select',selectionChanged);input.addEventListener('selectionchange',selectionChanged);
  // Keyup reads the selection after the default navigation action. Paint it
  // immediately so a busy 3D frame cannot delay or hide the insertion caret.
  input.addEventListener('keydown',refresh,true);
  input.addEventListener('keyup',()=>{if(session){if(frame)cancelAnimationFrame(frame);draw();}},true);
  document.addEventListener('selectionchange',()=>{if(document.activeElement===input)selectionChanged();});
  input.addEventListener('compositionstart',()=>{if(session){session.composing=true;session.compositionStart=input.selectionStart;session.compositionLength=0;refresh();}});
  input.addEventListener('compositionupdate',event=>{if(session){session.compositionLength=event.data.length;refresh();}});
  input.addEventListener('compositionend',()=>{if(session){session.composing=false;refresh();}});
  input.addEventListener('keydown',event=>{
    if(!session||event.isComposing||session.composing||event.keyCode===229)return;
    if((event.ctrlKey||event.metaKey)&&['b','i','u'].includes(event.key.toLowerCase())){event.preventDefault();event.stopPropagation();command?.({b:'bold',i:'italic',u:'underline'}[event.key.toLowerCase()]);return;}
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();end();container.tabIndex=-1;container.focus({preventScroll:true});}
  });
  input.addEventListener('blur',event=>{const retain=typographyControl(event.relatedTarget)||formatPointer;formatPointer=false;if(!retain)end();});
  document.addEventListener('pointerdown',event=>{
    if(!session)return;formatPointer=typographyControl(event.target);
    if(!formatPointer&&event.target!==input&&!container.contains(event.target))end();
  },true);
  document.addEventListener('focusin',event=>{if(session&&event.target!==input&&!typographyControl(event.target)&&!container.contains(event.target)&&!(event.target===document.body&&formatPointer))end();});
  document.addEventListener('keydown',event=>{
    if(!session||event.isComposing||session.composing||event.key!=='Escape'||!typographyControl(event.target)||document.querySelector('#font-picker-popup:popover-open'))return;
    event.preventDefault();event.stopImmediatePropagation();end();container.tabIndex=-1;container.focus({preventScroll:true});
  },true);
  container.addEventListener('pointerdown',event=>{
    if(!session)return;
    const text=event.target.closest?.('text');
    if(event.button!==0||text!==session.node){end();return;}
    event.preventDefault();event.stopImmediatePropagation();const position=positionAt(event.clientX,event.clientY),anchor=event.shiftKey?(input.selectionDirection==='backward'?input.selectionEnd:input.selectionStart):position;
    input.focus({preventScroll:true});select(anchor,position);drag={pointer:event.pointerId,anchor};container.setPointerCapture(event.pointerId);
  },true);
  container.addEventListener('mousedown',event=>{if(session&&event.target.closest?.('text')===session.node){event.preventDefault();event.stopImmediatePropagation();}},true);
  container.addEventListener('pointermove',event=>{if(!drag||!session)return;event.preventDefault();event.stopImmediatePropagation();select(drag.anchor,positionAt(event.clientX,event.clientY));},true);
  for(const type of ['pointerup','pointercancel','lostpointercapture'])container.addEventListener(type,event=>{if(drag&&drag.pointer===event.pointerId){event.stopImmediatePropagation();releaseDrag();}},true);
  container.addEventListener('dblclick',event=>{
    const node=event.target.closest?.('text');if(!node||!root()?.contains(node))return;event.preventDefault();event.stopImmediatePropagation();begin(node,event);
  },true);
  window.addEventListener('blur',()=>{if((typographyControl(document.activeElement)||formatPointer)&&characterRange()){releaseDrag();resetGesture();return;}end();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)end();});
  canvas.textActions.setInputElem(input);canvas.textActions.select=begin;canvas.textActions.start=begin;canvas.textActions.toSelectMode=end;
  for(const name of ['init','setCursor','mouseDown','mouseMove','mouseUp'])canvas.textActions[name]=()=>{};
  return {begin,end,refresh,formatSelection,get range(){return characterRange();},get active(){return !!session;}};
}
