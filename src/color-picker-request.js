// Native SVG fields keep their existing change handler/undo behavior. The
// shared palette previews only the field; confirmation dispatches one change.
export function requestColorPicker(input,button,title){
  input.dispatchEvent(new CustomEvent('fold-color-picker',{bubbles:true,detail:{button,title}}));
}
export function colorFieldButton(input,{title='选择颜色',className='svg-paint-chip',read=()=>input.value||input.placeholder}={}){
  const button=document.createElement('button');button.type='button';button.className=className;
  button.title=`打开${title}调色盘`;
  button.setAttribute('aria-label',`打开${title}调色盘`);button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-controls','color-studio');button.setAttribute('aria-expanded','false');
  const sync=()=>{const value=read(),solid=CSS.supports('color',value)&&value!=='none';button.style.backgroundColor=solid?value:'';button.textContent=value==='none'?'∅':solid?'':'◈';};
  button.onpointerdown=event=>event.preventDefault();button.onclick=event=>{event.preventDefault();event.stopPropagation();requestColorPicker(input,button,title);};
  input.addEventListener('input',sync);input.addEventListener('change',sync);sync();return button;
}
