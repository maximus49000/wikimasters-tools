// Intérieurs « services et nuit » (G4a), portés de la maquette validée : pharmacie, coiffeur, tatoueur, laverie, arcade, bar,
// boîte de nuit. Chaque dessin rend la place du vendeur.
import { INK, type Kit, hx, rgba, tools } from './kit';

export function pharmacy(k: Kit): number {
  const { w, h, lit } = k;
  const X = k.x;
  const { cel, R, F, dot, glow, each, room, shelf, counter } = tools(k);
 room(w, h, '#EAF5EE', '#C9DCCF');
  // mur de tiroirs, étagères de boîtes, croix verte lumineuse, affiche
  const x0 = w * 0.45; for (let yy = 1.6; yy < 7.2; yy += 1.8) each(x0, w - 0.3, 2.2, x => { R(x, yy, 2, 1.6, '#FAFCFB', { s: 0.15, sx: 0.8, l: 0, lw: 0.12 }); dot(x + 1, yy + 0.8, 0.2, '#8A9A92'); });
  for (const yy of [9.6, 12.6]) { shelf(x0, yy, w - x0 - 0.4, '#FFFFFF'); each(x0 + 0.3, w - 0.6, 1.3, (x, i) => { R(x, yy - 1.9, 1.1, 1.9, ['#FFFFFF', '#E8F4EC', '#FFFFFF', '#F6F0E0'][i % 4], { s: 0.2, sx: 0.7, l: 0, lw: 0.1 }); F(x, yy - 1.4, 1.1, 0.35, ['#1E8A4C', '#3A7AC8', '#E8402A', '#F2C83A'][(i * 3) % 4]); }); }
  const cx = w * 0.18; if (lit) glow(cx, 4.6, 3.4, '#2EE06A', 0.25); cel(() => { X.rect(cx - 0.8, 2.2, 1.6, 4.8); X.rect(cx - 2.4, 3.8, 4.8, 1.6); }, lit ? '#3CF27A' : '#1E8A4C', { s: 0, l: 0, lw: 0.15 });
  R(w * 0.3, 2, 3.4, 4.6, '#FFFFFF', { s: 0, l: 0, lw: 0.12 }); F(w * 0.3 + 0.4, 2.5, 2.6, 1.6, '#7AC8E8'); F(w * 0.3 + 0.4, 4.6, 2.6, 0.3, '#3A3A3A'); F(w * 0.3 + 0.4, 5.3, 1.8, 0.3, '#3A3A3A');
  const y = counter(0.6, w * 0.88, h, '#F6F8F7', '#D6E2DC'); F(0.6, y + 1.6, w * 0.88, 0.5, '#1E8A4C'); R(w * 0.6, y - 1.8, 2.4, 1.8, '#2A2A2A', { s: 0, l: 0.2, lw: 0.12 }); F(w * 0.6 + 0.3, y - 1.5, 1.8, 0.7, '#7AE8A0'); each(w * 0.15, w * 0.45, 2.4, (x, i) => R(x, y - 1.6, 1.8, 1.6, ['#FFFFFF', '#F6E0E8'][i % 2], { s: 0.2, l: 0, lw: 0.1 }));
  return w * 0.3;
}

export function hairdresser(k: Kit): number {
  const { w, h } = k;
  const X = k.x;
  const { cel, R, RR, E, L, F, room, bottle } = tools(k);
 room(w, h, '#DFF1F0', '#B0C9C8');
  F(0, h - 2.2, w, 2.2, '#F4F4F4'); X.fillStyle = '#2A2A2A'; for (let x = 0; x < w; x += 1.2) for (let k = 0; k < 2; k++) if (((x / 1.2 | 0) + k) % 2) X.fillRect(x, h - 2.2 + k * 1.1, 1.2, 1.1); // damier
  // postes : grand miroir rond, tablette de produits, fauteuil, casque sèche-cheveux, bac
  const n = w >= 30 ? 3 : 2;
  // Fond : miroirs et tablettes de tous les postes ; premier plan : fauteuils et casque (devant le coiffeur).
  for (let k = 0; k < n; k++) { const cx = (w / n) * (k + 0.5); E(cx, 5, 2.6, 3, '#C8A040', { s: 0.25, l: 0.2, lw: 0.2 }); E(cx, 5, 2.2, 2.6, '#D6E8F0', { s: 0.12, l: 0, lw: 0.12 }); L(cx - 1, 3.4, cx + 0.2, 2.6, '#FFFFFF', 0.25);
    R(cx - 2.4, 8.6, 4.8, 0.5, '#FFFFFF', { s: 0, l: 0, lw: 0.12 }); for (let j = 0; j < 4; j++) bottle(cx - 1.6 + j * 1.05, 8.6, 1.4 + (j % 2) * 0.4, ['#E8A0C8', '#7AC8E8', '#F2E8C0', '#3A3A3A'][j], { label: null, cap: '#2A2A2A', lw: 0.08 }); }
  X.toFront();
  for (let k = 0; k < n; k++) { const cx = (w / n) * (k + 0.5);
    // fauteuil (dossier, assise, pied chromé)
    RR(cx - 1.7, h - 10, 3.4, 4.4, 0.6, '#1A1A1A', { s: 0, l: 0.25, lw: 0.15 }); RR(cx - 2.1, h - 6, 4.2, 1.3, 0.4, '#1A1A1A', { s: 0, l: 0.2, lw: 0.12 }); F(cx - 0.3, h - 4.7, 0.6, 2.4, '#C8D0D8'); E(cx, h - 2.4, 1.6, 0.3, '#C8D0D8', { s: 0, l: 0, lw: 0.1 });
    if (k === n - 1) { L(cx + 2.8, h - 2.2, cx + 2.8, h - 10, '#C8D0D8', 0.3); cel(() => { X.arc(cx + 1.6, h - 10, 2.2, Math.PI * 0.95, Math.PI * 2.05); X.closePath(); }, '#F28CB4', { box: [cx - 0.6, h - 12.2, 4.4, 2.2], s: 0.25, l: 0.2, lw: 0.15 }); } }
  return w / n * 0.5 + 2.6;
}

export function tattoo(k: Kit): number {
  const { w, h, lit } = k;
  const X = k.x;
  const { cel, R, RR, E, P, L, F, dot, glow, each, room, shelf, bottle } = tools(k);
 room(w, h, '#2B2B2B', '#4A4A4A');
  // planches de « flash » au mur (dessins), fauteuil inclinable, lampe articulée, encres
  each(0.8, w - 0.8, 4, (x, i) => { const yy = 1.6 + (i % 2) * 0.6; R(x, yy, 3.6, 4.4, '#F4EAD0', { s: 0, l: 0, lw: 0.12 }); const k = i % 4; if (k === 0) { cel(() => { X.moveTo(x + 1.8, yy + 3.6); X.bezierCurveTo(x + 0.2, yy + 2.2, x + 0.8, yy + 0.8, x + 1.8, yy + 1.8); X.bezierCurveTo(x + 2.8, yy + 0.8, x + 3.4, yy + 2.2, x + 1.8, yy + 3.6); }, '#E63B3B', { s: 0, l: 0, lw: 0.12 }); } else if (k === 1) { L(x + 1.8, yy + 0.6, x + 1.8, yy + 3.2, '#1A1A1A', 0.3); E(x + 1.8, yy + 3.4, 0.9, 0.4, '#1A1A1A', { s: 0, l: 0, lw: 0 }); L(x + 0.9, yy + 1.2, x + 2.7, yy + 1.2, '#1A1A1A', 0.3); } else if (k === 2) { X.strokeStyle = '#2A6A3A'; X.lineWidth = 0.3; X.beginPath(); X.moveTo(x + 0.6, yy + 3.6); X.bezierCurveTo(x + 3.4, yy + 3, x + 0.4, yy + 1.4, x + 3, yy + 0.8); X.stroke(); dot(x + 3, yy + 0.8, 0.4, '#E63B3B'); } else { dot(x + 1.8, yy + 2.2, 1.2, '#F2C83A'); for (let a = 0; a < 8; a++) L(x + 1.8 + Math.cos(a * 0.785) * 1.3, yy + 2.2 + Math.sin(a * 0.785) * 1.3, x + 1.8 + Math.cos(a * 0.785) * 1.7, yy + 2.2 + Math.sin(a * 0.785) * 1.7, '#F2C83A', 0.2); } });
  // fauteuil de tatouage : pied central, assise rembourrée, dossier incliné avec appui-tête, repose-jambes
  X.toFront(); { const fx = w * 0.32, b = h - 2.2; E(fx, b - 0.3, 2.2, 0.35, '#5A5A62', { s: 0, l: 0, lw: 0.12 }); F(fx - 0.35, b - 4.6, 0.7, 4.3, '#C8D0D8'); L(fx - 0.35, b - 4.6, fx - 0.35, b - 0.3, INK, 0.1);
    RR(fx - 3.6, b - 5.8, 7.2, 1.5, 0.6, '#1A1A1A', { s: 0, l: 0.3, lx: 0.6, lw: 0.15 });
    X.save(); X.translate(fx + 3.4, b - 5.4); X.rotate(-0.95); RR(0, -1.5, 6, 1.5, 0.6, '#1A1A1A', { s: 0, l: 0.3, lx: 0.6, lw: 0.15 }); RR(6.2, -1.3, 1.8, 1.2, 0.5, '#1A1A1A', { s: 0, l: 0.3, lw: 0.12 }); X.restore();
    X.save(); X.translate(fx - 3.4, b - 5); X.rotate(0.85); RR(0, -1.4, 4.4, 1.4, 0.5, '#1A1A1A', { s: 0, l: 0.3, lx: 0.6, lw: 0.15 }); X.restore();
    F(fx - 3.4, b - 4.7, 7.2, 0.25, '#E63B3B'); }
  // lampe articulée
  const lx = w * 0.8; L(lx, h - 2.2, lx, 7, '#C8D0D8', 0.3); L(lx, 7, lx - 3, 5, '#C8D0D8', 0.3); P([[lx - 4.2, 6.2], [lx - 3.4, 4.4], [lx - 2.2, 5]], '#E8E8E8', { s: 0.2, l: 0, lw: 0.12 }); if (lit) glow(lx - 3.6, 6.4, 2.6, '#FFFFFF', 0.25);
  each(w * 0.68, w - 0.6, 0.9, (x, i) => bottle(x + 0.35, 10.6, 1.4, ['#1A1A1A', '#E63B3B', '#2A6AC8', '#F2C83A', '#3A9A4A'][i % 5], { label: null, cap: '#2A2A2A', lw: 0.06 })); shelf(w * 0.66, 10.6, w * 0.32, '#5A5A5A');
  return w * 0.72;
}

export function laundry(k: Kit): number {
  const { w, h, lit } = k;
  const X = k.x;
  const { R, E, L, F, dot, each, text, room } = tools(k);
 room(w, h, '#E3F3FA', '#B9D6E2', { tiles: '#EAF6FB' });
  // rangée de lave-linge à hublot (linge qui tourne), sèche-linge superposés, table de pliage, paniers, distributeur
  const ux = w * 0.72; for (let k = 0; k < 2; k++) { R(ux, 1.6 + k * 5, w - ux - 0.4, 4.8, '#F4F6F8', { s: 0.15, sx: 0.85, l: 0, lw: 0.15 }); E(ux + (w - ux) / 2, 4 + k * 5, 1.7, 1.7, '#9AA8B0', { s: 0, l: 0, lw: 0.15 }); E(ux + (w - ux) / 2, 4 + k * 5, 1.3, 1.3, '#2A3A4A', { s: 0, l: 0, lw: 0 }); dot(ux + (w - ux) / 2 - 0.3, 4.2 + k * 5, 0.6, '#F28CB4'); dot(ux + (w - ux) / 2 + 0.4, 3.6 + k * 5, 0.5, '#7AC8E8'); }
  X.toFront(); each(0.6, ux - 0.4, 4.4, (x, i) => { const y = h - 2.2 - 6.4; R(x, y, 4.2, 6.4, '#F4F6F8', { s: 0.15, sx: 0.85, l: 0, lw: 0.2 }); F(x + 0.4, y + 0.4, 3.4, 0.8, '#C8D0D8'); dot(x + 3.2, y + 0.8, 0.25, lit ? '#4AE88A' : '#3A8A5A'); E(x + 2.1, y + 3.8, 1.7, 1.7, '#9AA8B0', { s: 0, l: 0, lw: 0.15 }); E(x + 2.1, y + 3.8, 1.35, 1.35, '#BFE0F0', { s: 0, l: 0, lw: 0 }); X.save(); X.beginPath(); X.arc(x + 2.1, y + 3.8, 1.35, 0, 7); X.clip(); F(x + 0.6, y + 4.2, 3, 1.4, ['#F28CB4', '#F2D24A', '#7AC8E8', '#4AB86A'][i % 4]); dot(x + 2.6, y + 3.4, 0.6, ['#E8603A', '#FFFFFF'][i % 2]); X.restore(); L(x + 1.2, y + 2.8, x + 1.8, y + 2.4, '#FFFFFF', 0.2); });
  R(0.6, 1.8, w * 0.22, 3.4, '#FFFFFF', { s: 0, l: 0, lw: 0.12 }); text('5 kg  4 €', 0.6 + w * 0.11, 2.8, 0.9, '#3AA9D6', { b: true }); text('8 kg  6 €', 0.6 + w * 0.11, 4.1, 0.9, '#3AA9D6', { b: true });
  R(w * 0.3, 2, 2.6, 3.6, '#3AA9D6', { s: 0.25, l: 0.2, lw: 0.15 }); F(w * 0.3 + 0.5, 2.6, 1.6, 0.8, '#1A1A1A'); dot(w * 0.3 + 1.3, 4.6, 0.3, '#F2C83A');
  return w * 0.35;
}

export function arcade(k: Kit): number {
  const { w, h, lit } = k;
  const X = k.x;
  const { R, P, L, F, dot, glow, each, room, screen } = tools(k);
 room(w, h, '#2A2570', '#4B3F9A');
  if (lit) { X.fillStyle = 'rgba(61,242,224,0.12)'; for (let x = 0; x < w; x += 2) X.fillRect(x, 0, 1, 1.2); }
  // bornes d'arcade avec écrans pixel, flipper, pince à peluches
  each(0.6, w * 0.66, 4.4, (x, i) => { const b = h - 2.2; P([[x, b], [x + 4, b], [x + 4, b - 13], [x + 3.4, b - 13.6], [x + 0.6, b - 13.6], [x, b - 13]], ['#E8402A', '#3A8AE8', '#F2C83A', '#B84AE8'][i % 4], { s: 0.25, sx: 0.75, l: 0.15, lw: 0.2 }); R(x + 0.4, b - 13.2, 3.2, 1.4, '#1A1A22', { s: 0, l: 0, lw: 0.1 }); if (lit) F(x + 0.6, b - 13, 2.8, 1, ['#3DF2E0', '#FF4FD8', '#FFE45C'][i % 3]);
    screen(x + 0.5, b - 11.4, 3, 3.4, lit, i); P([[x + 0.2, b - 7.6], [x + 3.8, b - 7.6], [x + 4.2, b - 6.2], [x - 0.2, b - 6.2]], '#1A1A22', { s: 0, l: 0, lw: 0.12 }); dot(x + 1, b - 6.9, 0.3, '#E8402A'); dot(x + 2.4, b - 6.9, 0.22, '#F2C83A'); dot(x + 3, b - 6.9, 0.22, '#3AE8E8'); L(x + 1, b - 6.9, x + 1, b - 7.6, '#1A1A1A', 0.15); if (lit) glow(x + 2, b - 9.7, 3, ['#3DF2E0', '#FF4FD8', '#FFE45C'][i % 3], 0.2); });
  // pince à peluches
  X.toFront(); const cx = w * 0.84, b = h - 2.2; R(cx - 2.8, b - 14, 5.6, 14, '#FF4FD8', { s: 0.25, l: 0.2, lw: 0.2 }); R(cx - 2.2, b - 12.6, 4.4, 6.8, lit ? '#DDF4FF' : '#8AA8C8', { s: 0, l: 0, lw: 0.12, a: 0.85 }); L(cx, b - 12.6, cx, b - 10.4, '#C8C8C8', 0.12); P([[cx - 0.7, b - 10], [cx, b - 10.5], [cx + 0.7, b - 10], [cx + 0.4, b - 9.4], [cx - 0.4, b - 9.4]], '#C8C8C8', { s: 0, l: 0, lw: 0.1 });
  for (let k = 0; k < 5; k++) { const c = ['#F2C83A', '#7AC8E8', '#F28CB4', '#8AD06A', '#F28A2A'][k]; dot(cx - 1.6 + k * 0.8, b - 6.4 - (k % 2) * 0.6, 0.6, c); }
  return w * 0.7;
}

export function bar(k: Kit): number {
  const { w, h, lit } = k;
  const X = k.x;
  const { cel, R, E, F, each, room, shelf, counter, pendant, bottle } = tools(k);
 room(w, h, '#4A3350', '#2C2030');
  // étagères rétroéclairées de bouteilles, miroir, pompes à bière, tabourets, suspensions
  R(w * 0.06, 1.4, w * 0.88, 6.8, lit ? '#8A6A4A' : '#3A2A2A', { s: 0, l: 0, lw: 0.2 }); if (lit) { F(w * 0.06, 1.4, w * 0.88, 6.8, '#FFB347', 0.18); }
  for (const yy of [4.4, 8]) { shelf(w * 0.06, yy, w * 0.88, '#C8A040'); each(w * 0.08, w * 0.92, 1, (x, i) => bottle(x + 0.45, yy, 2.4 + (i * 7 % 3) * 0.5, ['#C88A3A', '#2E4A2A', '#E8E8D8', '#6A1A2A', '#3A7A8A', '#E8C060'][(i + yy | 0) % 6], { label: (i % 3) ? '#F4EAD0' : null, cap: '#2A2A2A', lw: 0.08 })); }
  if (lit) for (const x of [w * 0.25, w * 0.5, w * 0.75]) pendant(x, 9, '#FFB347', true);
  const y = counter(0.6, w * 0.98, h, '#C8A040', '#5A3A2A', { panels: true });
  each(w * 0.4, w * 0.6, 1.4, (x, i) => { F(x + 0.4, y - 3, 0.5, 3, '#C8C8C8'); E(x + 0.65, y - 3.3, 0.45, 0.45, '#2A2A2A', { s: 0, l: 0, lw: 0.08 }); R(x + 0.2, y - 4.6, 0.9, 1.4, ['#F2C83A', '#3A8AE8', '#E8402A'][i % 3], { s: 0, l: 0, lw: 0.08 }); });
  for (const x of [w * 0.15, w * 0.78]) { cel(() => { X.moveTo(x - 0.5, y - 1.8); X.lineTo(x + 0.5, y - 1.8); X.lineTo(x + 0.4, y); X.lineTo(x - 0.4, y); X.closePath(); }, '#F2C83A', { s: 0, l: 0, lw: 0.1, a: 0.9 }); F(x - 0.5, y - 2, 1, 0.4, '#FFFFFF'); }
  return w * 0.5;
}

export function nightclub(k: Kit): number {
  const { w, h, lit, r } = k;
  const X = k.x;
  const { R, E, L, F, dot, each, room, person } = tools(k);
 room(w, h, '#2A1250', '#1B0E38');
  // piste lumineuse, cabine de DJ avec platines, boule à facettes, faisceaux, foule en silhouettes
  const b = h - 2.2; for (let x = 0; x < w; x += 2) for (let k = 0; k < 2; k++) F(x + k, b + k * 1.1 - 0.1, 2, 1.1, lit ? ['#FF4FD8', '#3DF2E0', '#FFE45C', '#7A4AE8'][((x / 2 | 0) + k * 3) % 4] : '#2A1A4A');
  const dx = w * 0.5; L(dx, 0, dx, 1.4, '#8A8A8A', 0.12); E(dx, 2.6, 1.3, 1.3, '#C8D0D8', { s: 0.3, l: 0.25, lw: 0.15 }); X.strokeStyle = 'rgba(80,80,100,0.6)'; X.lineWidth = 0.06; for (let k = -1; k <= 1; k += 0.5) { X.beginPath(); X.moveTo(dx - 1.3, 2.6 + k); X.lineTo(dx + 1.3, 2.6 + k); X.stroke(); X.beginPath(); X.moveTo(dx + k, 1.3); X.lineTo(dx + k, 3.9); X.stroke(); }
  if (lit) { for (const [ang, c] of [[-0.5, '#FF4FD8'], [0.3, '#3DF2E0'], [0.9, '#FFE45C']] as const) { X.fillStyle = rgba(hx(c), 0.18); X.beginPath(); X.moveTo(dx, 2.6); X.lineTo(dx + Math.sin(ang) * 30 - 2, 2.6 + Math.cos(ang) * 30); X.lineTo(dx + Math.sin(ang) * 30 + 2, 2.6 + Math.cos(ang) * 30); X.fill(); } for (let k = 0; k < 14; k++) dot(r() * w, r() * (h - 4), 0.18, '#FFFFFF', 0.8); }
  // cabine de DJ
  X.toFront(); const bx = w * 0.62; R(bx, b - 5, w * 0.34, 5, '#3A2A6A', { s: 0.2, l: 0.15, lw: 0.2 }); F(bx, b - 3.6, w * 0.34, 0.5, lit ? '#FF4FD8' : '#5A3A8A'); E(bx + 1.6, b - 5.2, 1.2, 0.25, '#16141A', { s: 0, l: 0, lw: 0.1 }); E(bx + w * 0.34 - 1.6, b - 5.2, 1.2, 0.25, '#16141A', { s: 0, l: 0, lw: 0.1 });
  // foule
  each(0.8, bx - 1, 2.4, (x, i) => { X.save(); X.globalAlpha = 0.9; person(x + 1.2, b, 1 + (i % 2) * 0.1, ['#FF4FD8', '#3DF2E0', '#FFE45C', '#7A4AE8'][i % 4], '#2A1A3A', '#1A0A2A'); if (i % 2) L(x + 0.4, b - 2.2, x - 0.2, b - 4.2, '#2A1A3A', 0.35); X.restore(); });
  return w * 0.75;
}
