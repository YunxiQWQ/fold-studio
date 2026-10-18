// Vector Canvas 2D Packaging Symbols & Badges Library
import {OPEN_SYMBOLS,drawOpenSymbol} from './packaging-icons.js';

const LEGACY_SYMBOLS = [
  { id: 'recycle', name: '通用可循环标志 (♺)' },
  { id: 'recycle-pap', name: '纸类可回收 (PAP 20)' },
  { id: 'recycle-pet', name: '塑料回收 (PET 01)' },
  { id: 'recycle-pp', name: '聚丙烯材质 (PP 05)' },
  { id: 'green-dot', name: '双箭头环保标志' },
  { id: 'fragile', name: '易碎品 · 小心轻放' },
  { id: 'keep-dry', name: '怕湿 · 保持干燥' },
  { id: 'this-way-up', name: '向上 · 勿倒置' },
  { id: 'food-contact', name: '食品接触图示' },
  { id: 'tidy-man', name: '分类入篓 · 爱护环境' },
  { id: 'fsc', name: '树形图案（旧版）' },
  { id: 'sun-protect', name: '避免阳光直射' },
];
export const PACKAGING_SYMBOLS=LEGACY_SYMBOLS.map(s=>OPEN_SYMBOLS.find(o=>o.id===s.id)??{...s,category:s.id.startsWith('recycle')||['green-dot','tidy-man','fsc'].includes(s.id)?'回收与材质':s.id==='food-contact'?'食品与日用':'运输与储存',source:s.id.startsWith('recycle-')?'Pictogrammers MDI + 折间材质文字':'折间旧版矢量',license:s.id.startsWith('recycle-')?'Apache-2.0':'项目内置'}).concat(OPEN_SYMBOLS.filter(o=>!LEGACY_SYMBOLS.some(s=>s.id===o.id)));

export function drawSymbol(ctx, symbolId, w, h, color) {
  const open=OPEN_SYMBOLS.find(s=>s.id===symbolId);
  if(open){ctx.save();ctx.fillStyle=color;drawOpenSymbol(ctx,open.path,w,h);ctx.restore();return;}
  const S = Math.min(w, h);
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = S * 0.045;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  switch (symbolId) {
    case 'recycle-pap':
    case 'recycle-pet':
    case 'recycle-pp': {
      // Draw recycling triangle with number inside and code text underneath
      drawMöbiusTriangle(ctx, S * 0.88, color);
      const num = symbolId === 'recycle-pap' ? '20' : symbolId === 'recycle-pet' ? '01' : '05';
      const code = symbolId === 'recycle-pap' ? 'PAP' : symbolId === 'recycle-pet' ? 'PET' : 'PP';
      ctx.font = `bold ${S * 0.12}px "Noto Sans SC", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(num, 0, -S * 0.02);
      ctx.font = `600 ${S * 0.12}px "Noto Sans SC", sans-serif`;
      ctx.fillText(code, 0, S * 0.38);
      break;
    }
    case 'recycle': {
      drawMöbiusTriangle(ctx, S * 0.85, color);
      break;
    }
    case 'green-dot': {
      // Two intertwined curved arrows forming a circle
      const R = S * 0.32;
      ctx.lineWidth = S * 0.08;
      // Top arrow
      ctx.beginPath();
      ctx.arc(0, 0, R, -Math.PI * 0.85, Math.PI * 0.15, false);
      ctx.stroke();
      // Top arrowhead
      drawArrowHead(ctx, R * Math.cos(Math.PI * 0.15), R * Math.sin(Math.PI * 0.15), Math.PI * 0.65, S * 0.16);

      // Bottom arrow
      ctx.beginPath();
      ctx.arc(0, 0, R, Math.PI * 0.15, -Math.PI * 0.85, false);
      ctx.stroke();
      // Bottom arrowhead
      drawArrowHead(ctx, R * Math.cos(-Math.PI * 0.85), R * Math.sin(-Math.PI * 0.85), -Math.PI * 0.35, S * 0.16);
      break;
    }
    case 'fragile': {
      // Wine goblet with crack
      const scale = S * 0.42;
      ctx.lineWidth = S * 0.04;
      // Bowl
      ctx.beginPath();
      ctx.moveTo(-scale * 0.6, -scale * 0.8);
      ctx.lineTo(scale * 0.6, -scale * 0.8);
      ctx.bezierCurveTo(scale * 0.6, scale * 0.2, -scale * 0.6, scale * 0.2, -scale * 0.6, -scale * 0.8);
      ctx.stroke();
      // Stem
      ctx.beginPath();
      ctx.moveTo(0, scale * 0.05);
      ctx.lineTo(0, scale * 0.8);
      // Base
      ctx.moveTo(-scale * 0.45, scale * 0.8);
      ctx.lineTo(scale * 0.45, scale * 0.8);
      ctx.stroke();
      // Crack zig-zag
      ctx.beginPath();
      ctx.moveTo(scale * 0.1, -scale * 0.8);
      ctx.lineTo(-scale * 0.05, -scale * 0.55);
      ctx.lineTo(scale * 0.12, -scale * 0.4);
      ctx.lineTo(0, -scale * 0.2);
      ctx.stroke();
      break;
    }
    case 'keep-dry': {
      // Umbrella with handle and raindrops
      const r = S * 0.35;
      const cy = -S * 0.05;
      // Umbrella dome
      ctx.beginPath();
      ctx.arc(0, cy, r, Math.PI, 0, false);
      ctx.bezierCurveTo(r * 0.6, cy - r * 0.15, r * 0.4, cy, r * 0.33, cy);
      ctx.bezierCurveTo(r * 0.1, cy - r * 0.15, -r * 0.1, cy, -r * 0.33, cy);
      ctx.bezierCurveTo(-r * 0.4, cy, -r * 0.6, cy - r * 0.15, -r, cy);
      ctx.closePath();
      ctx.fill();

      // Top tip
      ctx.beginPath();
      ctx.moveTo(0, cy - r);
      ctx.lineTo(0, cy - r - S * 0.08);
      ctx.stroke();

      // Umbrella handle
      ctx.lineWidth = S * 0.045;
      ctx.beginPath();
      ctx.moveTo(0, cy);
      ctx.lineTo(0, cy + S * 0.35);
      ctx.arc(-S * 0.07, cy + S * 0.35, S * 0.07, 0, Math.PI, false);
      ctx.stroke();

      // Raindrops
      for (const [rx, ry] of [[-S * 0.25, -S * 0.38], [0, -S * 0.42], [S * 0.25, -S * 0.38]]) {
        ctx.beginPath();
        ctx.arc(rx, ry, S * 0.022, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'this-way-up': {
      // Two upward arrows with a horizontal baseline
      const aw = S * 0.18;
      const ah = S * 0.5;
      const baseY = S * 0.28;

      for (const offset of [-S * 0.2, S * 0.2]) {
        ctx.beginPath();
        // Arrow head
        ctx.moveTo(offset, baseY - ah);
        ctx.lineTo(offset - aw * 0.9, baseY - ah + S * 0.18);
        ctx.lineTo(offset - aw * 0.4, baseY - ah + S * 0.18);
        // Shaft
        ctx.lineTo(offset - aw * 0.4, baseY - S * 0.05);
        ctx.lineTo(offset + aw * 0.4, baseY - S * 0.05);
        ctx.lineTo(offset + aw * 0.4, baseY - ah + S * 0.18);
        ctx.lineTo(offset + aw * 0.9, baseY - ah + S * 0.18);
        ctx.closePath();
        ctx.fill();
      }
      // Baseline
      ctx.lineWidth = S * 0.05;
      ctx.beginPath();
      ctx.moveTo(-S * 0.38, baseY + S * 0.05);
      ctx.lineTo(S * 0.38, baseY + S * 0.05);
      ctx.stroke();
      break;
    }
    case 'food-contact': {
      // Wine glass and fork
      const scale = S * 0.38;
      ctx.lineWidth = S * 0.04;
      // Glass
      ctx.beginPath();
      ctx.moveTo(-scale * 0.45, -scale * 0.7);
      ctx.lineTo(-scale * 0.1, -scale * 0.7);
      ctx.bezierCurveTo(-scale * 0.1, 0, -scale * 0.45, 0, -scale * 0.45, -scale * 0.7);
      ctx.moveTo(-scale * 0.28, -scale * 0.05);
      ctx.lineTo(-scale * 0.28, scale * 0.7);
      ctx.moveTo(-scale * 0.45, scale * 0.7);
      ctx.lineTo(-scale * 0.1, scale * 0.7);
      ctx.stroke();

      // Fork
      ctx.beginPath();
      ctx.moveTo(scale * 0.15, scale * 0.7);
      ctx.lineTo(scale * 0.15, -scale * 0.1);
      ctx.bezierCurveTo(scale * 0.15, -scale * 0.3, scale * 0.45, -scale * 0.3, scale * 0.45, -scale * 0.1);
      ctx.lineTo(scale * 0.45, scale * 0.7);
      // Tines
      ctx.moveTo(scale * 0.15, -scale * 0.1);
      ctx.lineTo(scale * 0.15, -scale * 0.7);
      ctx.moveTo(scale * 0.25, -scale * 0.1);
      ctx.lineTo(scale * 0.25, -scale * 0.7);
      ctx.moveTo(scale * 0.35, -scale * 0.1);
      ctx.lineTo(scale * 0.35, -scale * 0.7);
      ctx.moveTo(scale * 0.45, -scale * 0.1);
      ctx.lineTo(scale * 0.45, -scale * 0.7);
      ctx.stroke();
      break;
    }
    case 'tidy-man': {
      // Keep tidy / Tidy man silhouette
      const r = S * 0.06;
      // Head
      ctx.beginPath();
      ctx.arc(-S * 0.1, -S * 0.3, r, 0, Math.PI * 2);
      ctx.fill();

      // Body & Legs
      ctx.lineWidth = S * 0.045;
      ctx.beginPath();
      ctx.moveTo(-S * 0.1, -S * 0.22);
      ctx.lineTo(-S * 0.08, S * 0.05);
      // Left leg
      ctx.lineTo(-S * 0.18, S * 0.35);
      // Right leg
      ctx.moveTo(-S * 0.08, S * 0.05);
      ctx.lineTo(0, S * 0.35);
      // Right arm throwing trash into bin
      ctx.moveTo(-S * 0.1, -S * 0.18);
      ctx.lineTo(S * 0.05, -S * 0.08);
      ctx.lineTo(S * 0.15, -S * 0.02);
      ctx.stroke();

      // Trash paper falling
      ctx.beginPath();
      ctx.arc(S * 0.16, S * 0.07, S * 0.02, 0, Math.PI * 2);
      ctx.fill();

      // Waste basket
      ctx.beginPath();
      ctx.moveTo(S * 0.1, S * 0.1);
      ctx.lineTo(S * 0.28, S * 0.1);
      ctx.lineTo(S * 0.24, S * 0.35);
      ctx.lineTo(S * 0.14, S * 0.35);
      ctx.closePath();
      ctx.stroke();
      break;
    }
    case 'fsc': {
      // Tree silhouette with checkmark
      const scale = S * 0.4;
      ctx.beginPath();
      ctx.moveTo(0, -scale * 0.9);
      ctx.lineTo(scale * 0.6, -scale * 0.3);
      ctx.lineTo(scale * 0.35, -scale * 0.3);
      ctx.lineTo(scale * 0.75, scale * 0.3);
      ctx.lineTo(scale * 0.2, scale * 0.3);
      ctx.lineTo(scale * 0.2, scale * 0.85);
      ctx.lineTo(-scale * 0.2, scale * 0.85);
      ctx.lineTo(-scale * 0.2, scale * 0.3);
      ctx.lineTo(-scale * 0.75, scale * 0.3);
      ctx.lineTo(-scale * 0.35, -scale * 0.3);
      ctx.lineTo(-scale * 0.6, -scale * 0.3);
      ctx.closePath();
      ctx.fill();
      // Checkmark cutout
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = S * 0.06;
      ctx.beginPath();
      ctx.moveTo(-scale * 0.3, 0);
      ctx.lineTo(-scale * 0.05, scale * 0.25);
      ctx.lineTo(scale * 0.4, -scale * 0.2);
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
      break;
    }
    case 'sun-protect': {
      // Sun protected by a roof
      const R = S * 0.15;
      const cy = S * 0.08;
      // Sun circle
      ctx.beginPath();
      ctx.arc(0, cy, R, 0, Math.PI * 2);
      ctx.fill();
      // Sun rays
      ctx.lineWidth = S * 0.035;
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * (R + S * 0.03), cy + Math.sin(a) * (R + S * 0.03));
        ctx.lineTo(Math.cos(a) * (R + S * 0.09), cy + Math.sin(a) * (R + S * 0.09));
        ctx.stroke();
      }
      // Roof canopy
      ctx.lineWidth = S * 0.05;
      ctx.beginPath();
      ctx.moveTo(-S * 0.4, -S * 0.18);
      ctx.lineTo(0, -S * 0.38);
      ctx.lineTo(S * 0.4, -S * 0.18);
      ctx.stroke();
      break;
    }
    default:
      drawMöbiusTriangle(ctx, S * 0.8, color);
      break;
  }
  ctx.restore();
}

function drawMöbiusTriangle(ctx, size, color) {
  ctx.save();ctx.fillStyle=color;drawOpenSymbol(ctx,OPEN_SYMBOLS.find(s=>s.id==='recycle').path,size,size);ctx.restore();
}

function drawArrowHead(ctx, x, y, angle, headSize) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-headSize * 0.8, -headSize * 0.5);
  ctx.lineTo(-headSize * 0.5, 0);
  ctx.lineTo(-headSize * 0.8, headSize * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
