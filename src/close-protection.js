// Explicit file saves and automatic browser backups have separate lifecycles.
export function projectSignature(project){
  const text=JSON.stringify(project);let a=2166136261,b=2246822519;
  for(let i=0;i<text.length;i++){const code=text.charCodeAt(i);a=Math.imul(a^code,16777619);b=Math.imul(b^code,3266489917);}
  return `${text.length}:${a>>>0}:${b>>>0}`;
}
export class CloseProtection {
  constructor(){this.baselines=new Map();this.dirty=new Set();}
  key(id){return id??'unsaved-session';}
  open(id,project){const key=this.key(id);if(!this.baselines.has(key))this.baselines.set(key,projectSignature(project));this.sync(id,project);}
  touch(id){this.dirty.add(this.key(id));}
  newDocument(id){const key=this.key(id);this.baselines.set(key,null);this.dirty.add(key);}
  saved(id,project){const key=this.key(id);this.baselines.set(key,projectSignature(project));this.dirty.delete(key);}
  sync(id,project){const key=this.key(id);if(this.baselines.get(key)!==projectSignature(project))this.dirty.add(key);else this.dirty.delete(key);}
  shouldWarn(id,project){this.sync(id,project);return this.dirty.size>0;}
}
