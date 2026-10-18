import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rgbToCmyk, cmykToRgb, formatCmyk, proofColor } from '../src/color.js';
import { validateProject, newProject } from '../src/project.js';

describe('CMYK and RGB color conversions and soft proofing', () => {
  it('converts pure white and black correctly', () => {
    const whiteCmyk = rgbToCmyk('#ffffff');
    assert.deepEqual(whiteCmyk, { c: 0, m: 0, y: 0, k: 0 });
    assert.equal(cmykToRgb(0, 0, 0, 0), '#ffffff');
    assert.equal(proofColor('#ffffff', 'cmyk'), '#ffffff');

    const blackCmyk = rgbToCmyk('#000000');
    assert.deepEqual(blackCmyk, { c: 0, m: 0, y: 0, k: 100 });
    assert.equal(cmykToRgb(0, 0, 0, 100), '#000000');
    assert.equal(proofColor('#000000', 'cmyk'), '#000000');
  });

  it('handles shorthand 3-digit hex and uppercase hex codes', () => {
    assert.deepEqual(rgbToCmyk('#fff'), { c: 0, m: 0, y: 0, k: 0 });
    assert.deepEqual(rgbToCmyk('#000'), { c: 0, m: 0, y: 0, k: 100 });
    assert.deepEqual(rgbToCmyk('#FF0000'), { c: 0, m: 100, y: 100, k: 0 });
  });

  it('formats CMYK string for packaging inspection', () => {
    assert.equal(formatCmyk('#ffffff'), 'C:0 M:0 Y:0 K:0');
    assert.equal(formatCmyk('#000000'), 'C:0 M:0 Y:0 K:100');
    assert.equal(formatCmyk('#39563c'), 'C:34 M:0 Y:30 K:66');
  });

  it('simulates industrial offset printing soft proofing (gamut compression)', () => {
    // In RGB mode, proofColor returns original hex
    assert.equal(proofColor('#00ff00', 'rgb'), '#00ff00');
    assert.equal(proofColor('transparent', 'cmyk'), 'transparent');

    // In CMYK mode, neon green (#00ff00) converges into printable ink green
    const proofedGreen = proofColor('#00ff00', 'cmyk');
    assert.notEqual(proofedGreen, '#00ff00');
    assert.equal(proofedGreen, '#00ce00');

    // Neon blue (#0000ff) converges into ink blue
    const proofedBlue = proofColor('#0000ff', 'cmyk');
    assert.notEqual(proofedBlue, '#0000ff');
    assert.equal(proofedBlue, '#0000b8');
  });

  it('project validation enforces safe barcode format and layer bgColor', () => {
    const proj = newProject('carton');
    proj.layers.push({
      id: crypto.randomUUID(),
      type: 'barcode',
      name: '测试条码',
      panel: 'front',
      side: 'outside',
      x: 0.5,
      y: 0.5,
      w: 0.4,
      h: 0.2,
      rotation: 0,
      opacity: 1,
      visible: true,
      color: '#000000',
      code: '6901234567890',
      format: 'ean13',
      bgColor: '#ffffff',
    });
    // Valid barcode layer should pass
    assert.doesNotThrow(() => validateProject(proj));

    // Invalid format should be rejected
    const badFormatProj = structuredClone(proj);
    badFormatProj.layers.at(-1).format = 'invalid-code';
    assert.throws(() => validateProject(badFormatProj), /工程条码格式无效/);

    // Invalid bgColor should be rejected
    const badBgProj = structuredClone(proj);
    badBgProj.layers.at(-1).bgColor = 'not-a-color';
    assert.throws(() => validateProject(badBgProj), /工程条码背景色无效/);

    // Transparent bgColor is permitted
    const transProj = structuredClone(proj);
    transProj.layers.at(-1).bgColor = 'transparent';
    assert.doesNotThrow(() => validateProject(transProj));
  });
});
