import test from 'node:test';
import assert from 'node:assert/strict';
import {CloseProtection,projectSignature} from '../src/close-protection.js';

test('automatic backups do not acknowledge a file save; save and undo can clear a warning',()=>{
  const guard=new CloseProtection(),p={name:'原工程',layers:[]};guard.open('a',p);assert.equal(guard.shouldWarn('a',p),false);
  p.name='修改后';guard.touch('a');assert.equal(guard.shouldWarn('a',p),true);
  guard.saved('a',p);assert.equal(guard.shouldWarn('a',p),false);
  p.name='再修改';guard.touch('a');p.name='修改后';assert.equal(guard.shouldWarn('a',p),false);
});
test('switching projects retains protection for unsaved inactive projects and new documents',()=>{
  const guard=new CloseProtection(),a={name:'A'},b={name:'B'};guard.open('a',a);a.name='A编辑';guard.touch('a');guard.sync('a',a);
  guard.open('b',b);guard.saved('b',b);assert.equal(guard.shouldWarn('b',b),true);
  guard.saved('a',a);assert.equal(guard.shouldWarn('b',b),false);
  guard.open('c',b);guard.newDocument('c');assert.equal(guard.shouldWarn('c',b),true);guard.saved('c',b);assert.equal(guard.shouldWarn('c',b),false);
  assert.notEqual(projectSignature({text:'相同长A'}),projectSignature({text:'相同长B'}));
});
