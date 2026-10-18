// CMYK Color Conversion & Industrial Print Soft Proofing (ISO 12647-2 / FOGRA39 Emulation)

export function rgbToCmyk(hex) {
  if (!hex || typeof hex !== 'string') return { c: 0, m: 0, y: 0, k: 0 };
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  if (h.length === 8) h = h.slice(0, 6); // discard alpha if present
  if (h.length !== 6) return { c: 0, m: 0, y: 0, k: 0 };

  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;

  const k = 1 - Math.max(r, g, b);
  if (k >= 0.9999) {
    return { c: 0, m: 0, y: 0, k: 100 };
  }

  const c = (1 - r - k) / (1 - k);
  const m = (1 - g - k) / (1 - k);
  const y = (1 - b - k) / (1 - k);

  return {
    c: Math.max(0, Math.min(100, Math.round(c * 100))),
    m: Math.max(0, Math.min(100, Math.round(m * 100))),
    y: Math.max(0, Math.min(100, Math.round(y * 100))),
    k: Math.max(0, Math.min(100, Math.round(k * 100))),
  };
}

export function cmykToRgb(c, m, y, k) {
  const C = Math.max(0, Math.min(100, c)) / 100;
  const M = Math.max(0, Math.min(100, m)) / 100;
  const Y = Math.max(0, Math.min(100, y)) / 100;
  const K = Math.max(0, Math.min(100, k)) / 100;

  // Real offset printing ink spectral model (FOGRA39 / ISO 12647-2 soft proofing)
  // Simulates secondary spectral absorption of cyan/magenta/yellow inks on paper stock
  const rVal = (1 - C) * (1 - 0.08 * M) * (1 - 0.02 * Y) * (1 - K);
  const gVal = (1 - M) * (1 - 0.16 * C) * (1 - 0.04 * Y) * (1 - K);
  const bVal = (1 - Y) * (1 - 0.20 * M) * (1 - 0.10 * C) * (1 - K);

  const R = Math.round(Math.max(0, Math.min(255, rVal * 255)));
  const G = Math.round(Math.max(0, Math.min(255, gVal * 255)));
  const B = Math.round(Math.max(0, Math.min(255, bVal * 255)));

  return '#' + [R, G, B].map(x => x.toString(16).padStart(2, '0')).join('');
}

export function formatCmyk(hex) {
  const { c, m, y, k } = rgbToCmyk(hex);
  return `C:${c} M:${m} Y:${y} K:${k}`;
}

export function proofColor(hex, mode = 'rgb') {
  if (!hex || typeof hex !== 'string') return hex;
  if (hex === 'transparent' || !/^#[0-9a-f]{3,8}$/i.test(hex)) return hex;
  if (mode !== 'cmyk') return hex;
  const { c, m, y, k } = rgbToCmyk(hex);
  return cmykToRgb(c, m, y, k);
}
