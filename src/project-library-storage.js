// A separate database keeps v0.10.0's `fold-studio/projects/draft` readable
// by older offline bundles. Its draft is copied on first use, never removed.
const DB_NAME = 'fold-studio-library';
const DB_VERSION = 1;
const MAX_REVISIONS = 12;
let connection;

function database() {
  if (!connection) connection = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('library', { keyPath: 'id' });
      db.createObjectStore('documents');
      db.createObjectStore('revisions', { keyPath: 'id' });
      db.createObjectStore('settings');
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('请关闭其他打开折间的标签页，再重新加载当前页面以升级本机工程库'));
  });
  return connection;
}

function legacyDraft() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('fold-studio');
    request.onupgradeneeded = () => request.result.createObjectStore('projects');
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('projects')) { db.close(); resolve(null); return; }
      const draft = db.transaction('projects').objectStore('projects').get('draft');
      draft.onsuccess = () => { db.close(); resolve(draft.result ?? null); };
      draft.onerror = () => { db.close(); reject(draft.error); };
    };
    request.onerror = () => reject(request.error);
  });
}

function result(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function completed(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('本机工程写入中断'));
  });
}

export async function listDocuments() {
  const db = await database();
  const documents = await result(db.transaction('library').objectStore('library').getAll());
  return documents.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getDocument(id) {
  const db = await database();
  return result(db.transaction('documents').objectStore('documents').get(id));
}

export async function getActiveDocument(initialProject) {
  const db = await database();
  const id = await result(db.transaction('settings').objectStore('settings').get('activeId'));
  if (id) {
    const project = await getDocument(id);
    if (project) return { id, project };
  }
  const entries = await listDocuments();
  if (entries.length) {
    const project = await getDocument(entries[0].id);
    if (project) {
      await setActiveDocument(entries[0].id);
      return { id: entries[0].id, project };
    }
  }
  const oldDraft = await legacyDraft();
  const project = oldDraft ?? initialProject;
  const newId = await createDocument(project, oldDraft ? 'legacy-draft' : crypto.randomUUID());
  return { id: newId, project };
}

export async function createDocument(project, id = crypto.randomUUID()) {
  const db = await database();
  const now = Date.now();
  const tx = db.transaction(['library', 'documents', 'settings'], 'readwrite');
  const done = completed(tx);
  tx.objectStore('library').put({ id, name: project.name, type: project.type, createdAt: now, updatedAt: now, revisions: [] });
  tx.objectStore('documents').put(project, id);
  tx.objectStore('settings').put(id, 'activeId');
  await done;
  return id;
}

export async function saveDocument(id, project) {
  const db = await database();
  const tx = db.transaction(['library', 'documents'], 'readwrite');
  const done = completed(tx);
  const library = tx.objectStore('library');
  const request = library.get(id);
  request.onsuccess = () => {
    if (!request.result) { tx.abort(); return; }
    library.put({ ...request.result, name: project.name, type: project.type, updatedAt: Date.now() });
    tx.objectStore('documents').put(project, id);
  };
  await done;
}

export async function setActiveDocument(id) {
  const db = await database();
  const tx = db.transaction(['library', 'settings'], 'readwrite');
  const done = completed(tx);
  const request = tx.objectStore('library').get(id);
  request.onsuccess = () => {
    if (request.result) tx.objectStore('settings').put(id, 'activeId');
    else tx.abort();
  };
  await done;
}

export async function listRevisions(id) {
  const db = await database();
  const meta = await result(db.transaction('library').objectStore('library').get(id));
  return [...(meta?.revisions ?? [])].reverse();
}

export async function getRevision(id) {
  const db = await database();
  return result(db.transaction('revisions').objectStore('revisions').get(id));
}

export async function saveRevision(projectId, project, label = '自动版本') {
  const db = await database();
  const tx = db.transaction(['library', 'revisions'], 'readwrite');
  const done = completed(tx);
  const library = tx.objectStore('library');
  const revisions = tx.objectStore('revisions');
  const request = library.get(projectId);
  const revision = { id: crypto.randomUUID(), projectId, createdAt: Date.now(), label, project };
  request.onsuccess = () => {
    const meta = request.result;
    if (!meta) { tx.abort(); return; }
    const index = [...(meta.revisions ?? []), { id: revision.id, createdAt: revision.createdAt, label }];
    for (const old of index.splice(0, Math.max(0, index.length - MAX_REVISIONS))) revisions.delete(old.id);
    revisions.put(revision);
    library.put({ ...meta, revisions: index });
  };
  await done;
  return revision;
}
