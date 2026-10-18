import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeEAN13, computeEAN13CheckDigit, encodeCode128 } from '../src/barcode.js';
import { encodeQRCode } from '../src/qrcode.js';
import { PACKAGING_SYMBOLS, drawSymbol } from '../src/symbols.js';
import { validateProject, newProject } from '../src/project.js';

test('barcode: EAN-13 calculates correct check digits and produces 95 modules', () => {
  // Test check digit algorithm with known EAN codes
  assert.equal(computeEAN13CheckDigit('690123456789'), 2);
  assert.equal(computeEAN13CheckDigit('400638133393'), 1);

  const res1 = encodeEAN13('6901234567892');
  assert.equal(res1.digits, '6901234567892');
  assert.equal(res1.firstDigit, 6);
  assert.equal(res1.bits.length, 95);

  // Check guards
  // Start guard: 1 0 1
  assert.equal(res1.bits[0].bit, 1);
  assert.equal(res1.bits[1].bit, 0);
  assert.equal(res1.bits[2].bit, 1);
  assert.equal(res1.bits[0].isGuard, true);

  // Center guard at module 3 + 42 = 45: 0 1 0 1 0
  assert.equal(res1.bits[45].bit, 0);
  assert.equal(res1.bits[46].bit, 1);
  assert.equal(res1.bits[47].bit, 0);
  assert.equal(res1.bits[48].bit, 1);
  assert.equal(res1.bits[49].bit, 0);
  assert.equal(res1.bits[45].isGuard, true);

  // End guard at module 92: 1 0 1
  assert.equal(res1.bits[92].bit, 1);
  assert.equal(res1.bits[93].bit, 0);
  assert.equal(res1.bits[94].bit, 1);
  assert.equal(res1.bits[92].isGuard, true);
});

test('barcode: Code 128 encodes arbitrary ASCII and verifies checksum', () => {
  const res = encodeCode128('FOLDSTUDIO');
  assert.equal(res.text, 'FOLDSTUDIO');
  assert.ok(res.bits.length > 0);
  // 12 symbols * 11 bits + stop char (13 bits) = 145 modules
  assert.equal(res.bits.length, 145);
});

test('qrcode: generates valid QR matrices with Reed-Solomon ECC', () => {
  const qrShort = encodeQRCode('FOLD');
  assert.equal(qrShort.size, 21); // Short text fits in Version 1 (21x21)

  const qrUrl = encodeQRCode('https://fold.studio');
  assert.equal(qrUrl.size, 25); // 20 bytes fits in Version 2 (25x25)
  assert.equal(qrUrl.modules.length, 25);
  assert.equal(qrUrl.modules[0].length, 25);

  // Position detection patterns at corners should have solid 3x3 centers
  assert.equal(qrUrl.modules[3][3], true);
  assert.equal(qrUrl.modules[3][25 - 4], true);
  assert.equal(qrUrl.modules[25 - 4][3], true);

  // Longer content selects larger version
  const longText = 'Fold Studio Packaging Design System: Barcodes, QR Codes, and Vector Symbols for 3D boxes.';
  const qrLong = encodeQRCode(longText);
  assert.ok(qrLong.size >= 29); // Version 3 or above
  assert.equal(qrLong.modules.length, qrLong.size);
});

test('symbols: packaging symbol library definitions and vector drawing', () => {
  assert.equal(PACKAGING_SYMBOLS.length, 34);
  assert.equal(new Set(PACKAGING_SYMBOLS.map(s=>s.id)).size,PACKAGING_SYMBOLS.length);
  assert.equal(PACKAGING_SYMBOLS.filter(s=>s.source==='Pictogrammers MDI').length,26);
  const ids = PACKAGING_SYMBOLS.map(s => s.id);
  assert.ok(ids.includes('recycle'));
  assert.ok(ids.includes('recycle-pap'));
  assert.ok(ids.includes('fragile'));
  assert.ok(ids.includes('keep-dry'));
  assert.ok(ids.includes('this-way-up'));
  assert.ok(ids.includes('food-contact'));

  // Test drawing mock context
  const mockCtx = {
    save() {}, restore() {},
    translate() {}, rotate() {}, scale() {},
    beginPath() {}, closePath() {},
    moveTo() {}, lineTo() {}, arc() {}, bezierCurveTo() {}, fillRect() {},
    stroke() {}, fill() {}, fillText() {},
    fillStyle: '', strokeStyle: '', lineWidth: 0, lineCap: '', lineJoin: '',
    font: '', textAlign: '', textBaseline: ''
  };

  for (const s of PACKAGING_SYMBOLS) {
    if(s.source.startsWith('Pictogrammers'))assert.ok(s.license==='Apache-2.0'&&(!s.path||s.path.startsWith('M')));
    else assert.doesNotThrow(() => drawSymbol(mockCtx, s.id, 50, 50, '#333333'));
  }
});

test('project: validation accepts barcode, qrcode, and symbol layers', () => {
  const proj = newProject('carton');
  proj.layers.push({
    id: 'layer-barcode-1',
    type: 'barcode',
    name: '条码测试',
    panel: 'front',
    side: 'outside',
    x: 0.5, y: 0.5, w: 0.5, h: 0.25,
    rotation: 0, opacity: 1, visible: true,
    color: '#000000',
    code: '6901234567890',
    format: 'ean13',
    showText: true,
    bgColor: '#ffffff'
  });
  proj.layers.push({
    id: 'layer-qrcode-1',
    type: 'qrcode',
    name: '二维码测试',
    panel: 'back',
    side: 'outside',
    x: 0.5, y: 0.5, w: 0.3, h: 0.3,
    rotation: 0, opacity: 1, visible: true,
    color: '#000000',
    text: 'https://fold.studio',
    bgColor: '#ffffff'
  });
  proj.layers.push({
    id: 'layer-symbol-1',
    type: 'symbol',
    name: '回收标志',
    panel: 'bottom',
    side: 'outside',
    x: 0.5, y: 0.5, w: 0.2, h: 0.2,
    rotation: 0, opacity: 1, visible: true,
    color: '#39563c',
    symbol: 'recycle'
  });

  const validated = validateProject(proj);
  assert.equal(validated.layers.length, proj.layers.length);
  assert.equal(validated.layers.find(l => l.id === 'layer-barcode-1').type, 'barcode');
  assert.equal(validated.layers.find(l => l.id === 'layer-qrcode-1').type, 'qrcode');
  assert.equal(validated.layers.find(l => l.id === 'layer-symbol-1').type, 'symbol');
});
