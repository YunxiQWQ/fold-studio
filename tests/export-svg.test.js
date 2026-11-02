import test from 'node:test';
import assert from 'node:assert/strict';
import {SvgDrawingContext} from '../src/export-svg.js';
import {drawBarcode} from '../src/barcode.js';
import {drawQRCode} from '../src/qrcode.js';

test('SVG recording preserves path geometry, transforms, fill/stroke and saved drawing state',()=>{
  const ctx=new SvgDrawingContext();ctx.fillStyle='#123456';ctx.translate(10,20);
  ctx.save();ctx.scale(-1,2);ctx.globalAlpha=.4;ctx.beginPath();ctx.moveTo(0,0);ctx.bezierCurveTo(1,2,3,4,5,6);ctx.closePath();ctx.fill();ctx.restore();
  ctx.strokeStyle='#654321';ctx.lineWidth=.25;ctx.beginPath();ctx.moveTo(1,2);ctx.lineTo(3,4);ctx.stroke();
  const svg=ctx.toSVG();
  assert.match(svg,/M 0 0 C 1 2 3 4 5 6 Z/);assert.match(svg,/matrix\(-1 0 0 2 10 20\)/);
  assert.match(svg,/fill="#123456"[^>]+opacity="0.4"/);assert.match(svg,/matrix\(1 0 0 1 10 20\)/);
  assert.match(svg,/stroke="#654321" stroke-width="0.25"/);
});

test('full SVG circles retain both halves and erase operations retain vector masks',()=>{
  const defs=[],ctx=new SvgDrawingContext(defs);ctx.beginPath();ctx.arc(0,0,10,0,2*Math.PI);ctx.fill();
  assert.equal((ctx.toSVG().match(/A 10 10/g)??[]).length,2);
  ctx.globalCompositeOperation='destination-out';ctx.beginPath();ctx.moveTo(-2,0);ctx.lineTo(2,0);ctx.stroke();
  assert.match(ctx.toSVG(),/mask="url\(#drawing-erase-0\)"/);assert.match(defs.join(''),/<path[^>]+stroke="black"/);
});

test('barcode bars and QR modules are geometry without an image fallback',()=>{
  const ctx=new SvgDrawingContext();drawBarcode(ctx,{format:'ean13',code:'4006381333931',showText:false},40,25,'#000000');
  drawQRCode(ctx,{text:'editable QR 中文',errorCorrectionLevel:'H'},35,35,'#000000');
  assert.ok((ctx.toSVG().match(/<path /g)??[]).length>20);
  assert.doesNotMatch(ctx.toSVG(),/<image|data:image/);
  assert.throws(()=>ctx.fill({}),/原始矢量/);
});
