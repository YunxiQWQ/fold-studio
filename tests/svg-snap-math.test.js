import {test} from 'node:test';
import assert from 'node:assert/strict';
import {solveSvgSnap} from '../src/svg-snap-math.js';
const box=(left,top,width,height)=>({left,top,right:left+width,bottom:top+height});
const ref=(id,bounds,kind='object')=>({id,bounds,kind});
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} != ${expected}`);

test('nearest edges and centers snap independently in CSS screen coordinates',()=>{
  const result=solveSvgSnap(box(40,40,10,10),[ref('a',box(53,54,30,30))],{spacing:false});near(result.dx,3);near(result.dy,4);assert.equal(result.guides.length,2);
  const center=solveSvgSnap(box(48,48,10,10),[ref('a',box(43,43,20,20))],{spacing:false});near(center.dx,0);near(center.dy,0);assert.ok(center.guides.every(guide=>guide.role==='center'));
});
test('a guide captures within six pixels and releases outside nine without oscillation',()=>{
  const refs=[ref('a',box(100,100,0,0))],first=solveSvgSnap(box(96,80,0,0),refs,{point:true});near(first.dx,4);
  const held=solveSvgSnap(box(108,80,0,0),refs,{point:true,previous:first.previous});near(held.dx,-8);
  const released=solveSvgSnap(box(111,80,0,0),refs,{point:true,previous:held.previous});near(released.dx,0);assert.equal(released.guides.length,0);
});
test('Shift and resize constraints keep their original movement line',()=>{
  const refs=[ref('a',box(100,100,0,0))];
  const horizontal=solveSvgSnap(box(97,97,0,0),refs,{point:true,constraint:{x:1,y:0}});near(horizontal.dx,3);near(horizontal.dy,0);
  const diagonal=solveSvgSnap(box(97,97,0,0),refs,{point:true,constraint:{x:1,y:1}});near(diagonal.dx,3);near(diagonal.dy,3);
  const steep=solveSvgSnap(box(97,70,0,0),refs,{point:true,constraint:{x:.01,y:1}});near(steep.dx,0);near(steep.dy,0);
});
test('equal gaps work between and beyond existing objects on both axes',()=>{
  const between=solveSvgSnap(box(26,10,10,10),[ref('a',box(0,10,10,10)),ref('b',box(50,10,10,10))]);near(between.dx,-1);assert.equal(between.guides.find(g=>g.axis==='x').spacing.placement,'between');
  const after=solveSvgSnap(box(41,10,10,10),[ref('a',box(0,10,10,10)),ref('b',box(20,10,10,10))]);near(after.dx,-1);assert.equal(after.guides.find(g=>g.axis==='x').spacing.placement,'after');
  const vertical=solveSvgSnap(box(10,26,10,10),[ref('a',box(10,0,10,10)),ref('b',box(10,50,10,10))]);near(vertical.dy,-1);assert.equal(vertical.guides.find(g=>g.axis==='y').spacing.placement,'between');
});
test('unrelated rows cannot create spacing guides; exact ties prefer actual artwork',()=>{
  const result=solveSvgSnap(box(26,100,10,10),[ref('a',box(0,0,10,10)),ref('b',box(50,0,10,10))]);assert.equal(result.guides.some(g=>g.spacing),false);
  const tied=solveSvgSnap(box(96,80,0,0),[ref('panel',box(100,100,0,0),'panel'),ref('object',box(100,100,0,0))],{point:true});assert.equal(tied.guides[0].ref.kind,'object');
});
test('large documents keep distant references out of the capture result',()=>{
  const refs=Array.from({length:6000},(_,i)=>ref('far-'+i,box(1000+i*30,1000+i*10,10,10)));refs.push(ref('near',box(100,200,0,0)));
  const result=solveSvgSnap(box(97,80,0,0),refs,{point:true});near(result.dx,3);near(result.dy,0);assert.equal(result.guides.length,1);assert.equal(result.guides[0].ref.id,'near');
});
test('a tall moving object cannot join references from separate rows into equal gaps',()=>{
  const result=solveSvgSnap(box(26,0,10,30),[ref('a',box(0,0,10,5)),ref('b',box(50,20,10,5))]);assert.equal(result.guides.some(guide=>guide.spacing),false);
});
