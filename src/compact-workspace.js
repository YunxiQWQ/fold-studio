import './compact-workspace.css';

// Move the existing controls so their IDs, keyboard bindings and event listeners remain intact.
export function compactWorkspace(){
  const tools=document.querySelector('.design-toolbar'),surface=document.querySelector('.surface-toolbar'),tabs=surface.querySelector('.surface-tabs'),right=tools.querySelector('.toolbar-right');
  tools.setAttribute('aria-label','内外面与设计工具');tools.prepend(tabs);
  right.prepend(surface.querySelector('.clipboard-tools'));right.append(surface.querySelector('#shortcut-help'));
  const hint=surface.querySelector('#surface-hint');hint.classList.add('compact-screenreader');tools.append(hint);surface.remove();
  const pane=document.querySelector('.flat-pane'),heading=pane.querySelector('.pane-heading'),commands=pane.querySelector('.editor-commandbar'),footer=pane.querySelector('.canvas-bottom');
  const viewport=document.createElement('div');viewport.className='editor-viewport-controls';viewport.setAttribute('aria-label','画布显示设置');
  for(const action of ['snap','rulers','grid','zoom-100'])viewport.append(commands.querySelector(`[data-editor-action="${action}"]`));
  footer.insertBefore(viewport,footer.querySelector('.zoom-control'));heading.insertBefore(commands,heading.querySelector('.pane-heading-right'));
}
