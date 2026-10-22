import './project-library.css';
import { escapeHtml as esc } from './icons.js';

const date = value => new Date(value).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

export function mountProjectLibrary(actions) {
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'button subtle project-library-trigger';
  trigger.textContent = '我的工程';
  document.querySelector('.workspace-nav').insertBefore(trigger, document.querySelector('#help'));

  const dialog = document.createElement('dialog');
  dialog.className = 'project-library-dialog';
  dialog.setAttribute('aria-labelledby', 'project-library-title');
  dialog.innerHTML = `<div class="project-library-head"><div><span class="dialog-kicker">LOCAL PROJECTS</span><h2 id="project-library-title">我的工程</h2></div><button type="button" class="dialog-close" data-library-action="close" aria-label="关闭">×</button></div>
    <p class="project-library-note">工程和历史版本只保存在当前浏览器。重要作品请点击顶部“保存工程”下载 .fold 备份。</p>
    <div class="project-library-toolbar"><button type="button" class="button primary" data-library-action="new">新建工程</button><button type="button" class="button subtle" data-library-action="snapshot">保存当前版本</button></div>
    <div id="project-library-list" class="project-library-list"></div>
    <section class="project-revisions"><h3 id="project-revisions-title">历史版本</h3><div id="project-revisions-list"></div></section>`;
  document.body.append(dialog);
  const list = dialog.querySelector('#project-library-list');
  const revisions = dialog.querySelector('#project-revisions-list');
  const revisionTitle = dialog.querySelector('#project-revisions-title');
  let selectedId = null;
  let busy = false;

  async function render() {
    const projects = await actions.listProjects();
    if (!selectedId || !projects.some(item => item.id === selectedId)) selectedId = actions.currentId() ?? projects[0]?.id;
    list.innerHTML = projects.length ? projects.map(item => `<div class="project-library-item ${item.id === actions.currentId() ? 'is-current' : ''}">
      <div class="project-library-info"><strong>${esc(item.name || '未命名工程')}</strong>${item.id === actions.currentId() ? '<span class="project-library-current">当前</span>' : ''}<small>修改于 ${date(item.updatedAt)}</small></div>
      <div class="project-library-row-actions"><button type="button" data-library-action="open" data-id="${item.id}" ${item.id === actions.currentId() ? 'disabled' : ''}>打开</button><button type="button" data-library-action="history" data-id="${item.id}">历史</button><button type="button" data-library-action="duplicate" data-id="${item.id}">复制</button></div>
    </div>`).join('') : '<p class="project-library-empty">还没有工程，点击“新建工程”开始。</p>';
    const selected = projects.find(item => item.id === selectedId);
    revisionTitle.textContent = `${selected?.name || '工程'} · 历史版本`;
    const items = selectedId ? await actions.listRevisions(selectedId) : [];
    revisions.innerHTML = items.length ? items.map(item => `<div class="project-revision-item"><div><strong>${esc(item.label)}</strong><small>${date(item.createdAt)}</small></div><button type="button" data-library-action="restore" data-id="${selectedId}" data-revision="${item.id}">恢复此版本</button></div>`).join('') : '<p class="project-library-empty">暂无历史版本。编辑时会定期保存，也可手动保存当前版本。</p>';
  }

  trigger.onclick = async () => {
    try { selectedId = actions.currentId(); await render(); dialog.showModal(); }
    catch (error) { actions.notify(`工程列表打开失败：${error.message}`); }
  };
  dialog.addEventListener('click', async event => {
    const button = event.target.closest('[data-library-action]');
    if (!button || busy) return;
    const { libraryAction: action, id, revision } = button.dataset;
    if (action === 'close') { dialog.close(); return; }
    busy = true;
    try {
      if (action === 'new') {
        await actions.create();
        selectedId = actions.currentId();
        dialog.close();
      } else if (action === 'open') {
        await actions.open(id);
        selectedId = id;
        dialog.close();
      } else if (action === 'history') {
        selectedId = id;
      } else if (action === 'duplicate') {
        await actions.duplicate(id);
        selectedId = actions.currentId();
      } else if (action === 'snapshot') {
        await actions.snapshot();
        selectedId = actions.currentId();
      } else if (action === 'restore') {
        await actions.restore(id, revision);
        selectedId = id;
        dialog.close();
      }
      if (dialog.open) await render();
    } catch (error) { actions.notify(`工程操作失败：${error.message}`); }
    finally { busy = false; }
  });
  return { refresh: () => dialog.open ? render() : Promise.resolve() };
}
