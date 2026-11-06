// Tablet widths turn the structure/layer column and the inspector into drawers
// so the canvas keeps the full width. Wider and narrower layouts are pure CSS.
const DRAWER_QUERY='(min-width:860px) and (max-width:1179.98px)';

export function initWorkspaceShell(){
  const workspace=document.querySelector('#workspace-main'),scrim=document.querySelector('#drawer-scrim');
  if(!workspace||!scrim)return;
  const drawers={
    left:{panel:document.querySelector('#left-sidebar'),toggle:document.querySelector('#toggle-left-panel'),close:document.querySelector('#close-left-panel'),className:'show-left'},
    right:{panel:document.querySelector('#right-sidebar'),toggle:document.querySelector('#toggle-inspector'),close:document.querySelector('#close-inspector'),className:'show-right'},
  };
  const media=matchMedia(DRAWER_QUERY);
  let returnFocus=null;
  function sync(open=null){
    const drawerMode=media.matches;
    for(const [side,drawer] of Object.entries(drawers)){
      const active=drawerMode&&side===open;
      workspace.classList.toggle(drawer.className,active);
      drawer.toggle?.setAttribute('aria-expanded',String(active));
      // Closed drawers stay out of the tab order while they are off-screen.
      if(drawer.panel)drawer.panel.inert=drawerMode&&!active;
    }
    scrim.hidden=!(drawerMode&&open);
  }
  function open(side){
    returnFocus=document.activeElement;sync(side);
    drawers[side].panel?.querySelector('button,input,select,textarea,[tabindex]')?.focus({preventScroll:true});
  }
  function close(){
    const wasOpen=Object.values(drawers).some(d=>workspace.classList.contains(d.className));
    sync(null);
    if(wasOpen&&returnFocus?.isConnected)returnFocus.focus({preventScroll:true});
    returnFocus=null;
  }
  for(const [side,drawer] of Object.entries(drawers)){
    drawer.toggle?.addEventListener('click',()=>workspace.classList.contains(drawer.className)?close():open(side));
    drawer.close?.addEventListener('click',close);
  }
  scrim.addEventListener('click',close);
  document.addEventListener('keydown',event=>{
    if(event.key!=='Escape'||document.querySelector('dialog[open]'))return;
    if(Object.values(drawers).some(d=>workspace.classList.contains(d.className))){event.stopImmediatePropagation();close();}
  },true);
  media.addEventListener('change',()=>sync(null));
  sync(null);
}
