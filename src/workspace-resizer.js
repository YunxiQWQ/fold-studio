/**
 * Interactive Resizer System for Fold Studio Workspace
 * Supports drag-to-resize on:
 * 1. Left Sidebar width
 * 2. 2D / 3D Canvas split ratio
 * 3. Right Sidebar (Inspector) width
 * 4. Layer section height in Left Sidebar
 */

function setupColResizer(handle, onDrag, onEnd) {
  if (!handle) return;
  handle.addEventListener('pointerdown', e => {
    e.preventDefault();
    const startX = e.clientX;
    handle.classList.add('active');
    document.body.classList.add('resizing-col');

    const targetEl = handle.id === 'sidebar-resizer'
      ? document.querySelector('.left-sidebar')
      : handle.id === 'inspector-resizer'
      ? document.querySelector('.right-sidebar')
      : document.querySelector('.flat-pane');
    const startSize = targetEl ? targetEl.offsetWidth : 240;

    let lastVal = startSize;
    const onMove = ev => {
      const deltaX = ev.clientX - startX;
      lastVal = onDrag(deltaX, startSize);
    };

    const onUp = () => {
      handle.classList.remove('active');
      document.body.classList.remove('resizing-col');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (onEnd) onEnd(lastVal);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });
}

function setupRowResizer(handle, onDrag, onEnd) {
  if (!handle) return;
  handle.addEventListener('pointerdown', e => {
    e.preventDefault();
    const startY = e.clientY;
    handle.classList.add('active');
    document.body.classList.add('resizing-row');

    const targetEl = document.querySelector('#layer-section');
    const startHeight = targetEl ? targetEl.offsetHeight : 220;

    let lastVal = startHeight;
    const onMove = ev => {
      const deltaY = ev.clientY - startY;
      lastVal = onDrag(deltaY, startHeight);
    };

    const onUp = () => {
      handle.classList.remove('active');
      document.body.classList.remove('resizing-row');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (onEnd) onEnd(lastVal);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });
}

export function initWorkspaceResizers() {
  const workspace = document.querySelector('#workspace-main') || document.querySelector('.workspace');
  if (!workspace) return;

  // Restore saved dimensions
  try {
    const savedLeftW = localStorage.getItem('fold-layout-left-w');
    if (savedLeftW) workspace.style.setProperty('--left-sidebar-w', `${savedLeftW}px`);

    const savedRightW = localStorage.getItem('fold-layout-right-w');
    if (savedRightW) workspace.style.setProperty('--right-sidebar-w', `${savedRightW}px`);

    const canvasSplit = document.querySelector('#canvas-split') || document.querySelector('.canvas-split');
    const savedSplit = localStorage.getItem('fold-layout-split-ratio');
    if (savedSplit && canvasSplit) {
      canvasSplit.style.setProperty('--canvas-2d-w', `${savedSplit}fr`);
      canvasSplit.style.setProperty('--canvas-3d-w', `${(2 - parseFloat(savedSplit)).toFixed(3)}fr`);
    }

    const layerSection = document.querySelector('#layer-section');
    const savedLayerH = localStorage.getItem('fold-layout-layer-h');
    if (savedLayerH && layerSection) {
      layerSection.style.height = `${savedLayerH}px`;
      layerSection.style.flex = 'none';
    }
  } catch {}

  // 1. Left Sidebar resizer
  const sidebarResizer = document.querySelector('#sidebar-resizer');
  setupColResizer(sidebarResizer, (deltaX, startW) => {
    const newW = Math.max(180, Math.min(480, startW + deltaX));
    workspace.style.setProperty('--left-sidebar-w', `${newW}px`);
    return newW;
  }, finalW => {
    try { localStorage.setItem('fold-layout-left-w', finalW); } catch {}
    window.dispatchEvent(new Event('resize'));
  });

  // 2. Right Sidebar (Inspector) resizer
  const inspectorResizer = document.querySelector('#inspector-resizer');
  setupColResizer(inspectorResizer, (deltaX, startW) => {
    const newW = Math.max(180, Math.min(450, startW - deltaX));
    workspace.style.setProperty('--right-sidebar-w', `${newW}px`);
    return newW;
  }, finalW => {
    try { localStorage.setItem('fold-layout-right-w', finalW); } catch {}
    window.dispatchEvent(new Event('resize'));
  });

  // 3. Canvas 2D/3D split resizer
  const splitResizer = document.querySelector('#canvas-split-resizer');
  const canvasSplit = document.querySelector('#canvas-split') || document.querySelector('.canvas-split');
  if (splitResizer && canvasSplit) {
    setupColResizer(splitResizer, (deltaX, startW) => {
      const totalW = canvasSplit.offsetWidth;
      const new2dW = Math.max(240, Math.min(totalW - 240, startW + deltaX));
      const ratio = (new2dW / totalW * 2).toFixed(3);
      const rightRatio = (2 - ratio).toFixed(3);
      canvasSplit.style.setProperty('--canvas-2d-w', `${ratio}fr`);
      canvasSplit.style.setProperty('--canvas-3d-w', `${rightRatio}fr`);
      return ratio;
    }, ratio => {
      try { localStorage.setItem('fold-layout-split-ratio', ratio); } catch {}
      window.dispatchEvent(new Event('resize'));
    });
  }

  // 4. Layer section height resizer
  const layerResizer = document.querySelector('#layer-resizer');
  const layerSection = document.querySelector('#layer-section');
  if (layerResizer && layerSection) {
    setupRowResizer(layerResizer, (deltaY, startH) => {
      const sidebar = document.querySelector('.left-sidebar');
      const maxH = sidebar ? sidebar.offsetHeight - 180 : 500;
      const newH = Math.max(140, Math.min(maxH, startH - deltaY));
      layerSection.style.height = `${newH}px`;
      layerSection.style.flex = 'none';
      return newH;
    }, finalH => {
      try { localStorage.setItem('fold-layout-layer-h', finalH); } catch {}
    });
  }

  // 5. Accordion collapsible headers in left sidebar
  document.querySelectorAll('.collapsible-section .section-heading').forEach(head => {
    head.setAttribute('role', 'button');
    head.setAttribute('tabindex', '0');
    const toggle = () => {
      const sec = head.closest('.collapsible-section');
      if (sec) sec.classList.toggle('collapsed');
    };
    head.addEventListener('click', e => {
      if (e.target.closest('input, select, button.text-button')) return;
      toggle();
    });
    head.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    });
  });
}
