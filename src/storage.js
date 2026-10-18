const DB_NAME='fold-studio';
let connection;
function database(){
  if(!connection)connection=new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,1);
    request.onupgradeneeded=()=>request.result.createObjectStore('projects');
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });return connection;
}
export async function loadDraft(){
  const db=await database();
  return new Promise((resolve,reject)=>{const r=db.transaction('projects').objectStore('projects').get('draft');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
}
export async function saveDraft(project){
  const db=await database();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('projects','readwrite');tx.objectStore('projects').put(project,'draft');
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error??new Error('本地保存中断'));
  });
}
export function download(blob,name){
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
}
