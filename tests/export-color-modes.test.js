import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {encodeCmykJpeg} from '../src/export-jpeg.js';
import {newProject,validateProject,History} from '../src/project.js';
const profile=readFileSync(new URL('../src/color-profiles/FOGRA39L_coated.icc',import.meta.url));
function segments(bytes){const result=[];assert.deepEqual([...bytes.slice(0,2)],[255,216]);let p=2;while(p<bytes.length){assert.equal(bytes[p++],255);const marker=bytes[p++];if(marker===217)break;const n=(bytes[p]<<8)|bytes[p+1];result.push({marker,data:bytes.slice(p+2,p+n)});p+=n;if(marker===218)break;}return result;}
test('CMYK JPG has four full-resolution components, Adobe transform 0 and unchanged chunked ICC',async()=>{
  const pixels=new Uint8Array(17*13*4);for(let i=0;i<17*13;i++)pixels.set([165,0,246,0],i*4);
  const bytes=await encodeCmykJpeg(pixels,17,13,profile,{dpi:300,quality:98}),parts=segments(bytes),sof=parts.find(p=>p.marker===192).data;
  assert.deepEqual([...sof.slice(0,6)],[8,0,13,0,17,4]);assert.deepEqual([sof[7],sof[10],sof[13],sof[16]],[17,17,17,17]);
  const adobe=parts.find(p=>p.marker===238).data;assert.equal(new TextDecoder().decode(adobe.slice(0,5)),'Adobe');assert.equal(adobe[11],0);assert.ok(!parts.some(p=>p.marker===224),'CMYK must not claim JFIF RGB');
  const chunks=parts.filter(p=>p.marker===226);assert.equal(chunks.length,2);assert.deepEqual(chunks.map(p=>p.data[12]),[1,2]);assert.ok(chunks.every(p=>p.data[13]===2));assert.deepEqual(Buffer.concat(chunks.map(p=>p.data.slice(14))),profile);
  assert.deepEqual([...bytes.slice(-2)],[255,217]);assert.ok(parts.some(p=>p.marker===225));
});
test('larger ICC profiles are segmented without truncation and invalid encoding inputs fail',async()=>{
  const large=new Uint8Array(1024*1024);large.set(profile);new DataView(large.buffer).setUint32(0,large.length);
  const parts=segments(await encodeCmykJpeg(new Uint8Array(4),1,1,large)),icc=parts.filter(p=>p.marker===226);
  assert.equal(icc.length,17);assert.deepEqual(Buffer.concat(icc.map(p=>p.data.slice(14))),Buffer.from(large));
  await assert.rejects(()=>encodeCmykJpeg(new Uint8Array(4),2,1,profile));await assert.rejects(()=>encodeCmykJpeg(new Uint8Array(4),1,1,profile,{quality:200}));
});
test('document RGB/CMYK preference saves, validates and undoes without changing artwork',()=>{
  const project=newProject(),original=JSON.stringify(project.layers),history=new History(project);project.documentColorMode='cmyk';history.push(project);
  assert.equal(validateProject(JSON.parse(JSON.stringify(project))).documentColorMode,'cmyk');assert.equal(JSON.stringify(project.layers),original);assert.notEqual(history.undo().documentColorMode,'cmyk');
  assert.throws(()=>validateProject({...project,documentColorMode:'adobe-rgb'}));delete project.documentColorMode;assert.doesNotThrow(()=>validateProject(project));
});
