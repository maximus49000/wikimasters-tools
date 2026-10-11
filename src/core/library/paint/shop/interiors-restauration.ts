// Intérieurs « restauration » (G4a), portés de la maquette validée : café, restaurant, pizzeria, kebab, sushis, salon de thé.
// Chaque dessin rend la place du vendeur.
import { INK, type Kit, rgba, tools } from './kit';

export function cafe(k: Kit): number {
  const { w, h, lit } = k;
  const X = k.x;
  const { R, L, F, each, text, room, shelf, counter, pendant, bottle, bistroTable } = tools(k);
 room(w, h, '#E8D4B8', '#A8815A', { wainscot: '#7A3E2A' });
  // comptoir en zinc, percolateur, bouteilles sur étagères, miroir, ardoise, tables bistrot
  R(w * 0.48, 1.4, w * 0.5, 4.6, '#C8D8E0', { s: 0.1, l: 0, lw: 0.2 }); X.strokeStyle = '#C8A040'; X.lineWidth = 0.4; X.strokeRect(w * 0.48, 1.4, w * 0.5, 4.6); L(w * 0.52, 2, w * 0.58, 4.8, '#FFFFFF', 0.3);
  shelf(w * 0.5, 6.4, w * 0.46, '#7A3E2A'); each(w * 0.52, w * 0.96, 1, (x, i) => bottle(x + 0.4, 6.4, 2.6 + (i % 3) * 0.4, ['#2E4A2A', '#C88A3A', '#E8E8D8', '#6A1A2A', '#3A7A8A'][i % 5], { label: i % 2 ? '#F4EAD0' : null, cap: '#2A2A2A', lw: 0.08 }));
  R(1.2, 1.6, w * 0.26, 4.6, '#2E3A34', { s: 0, l: 0, lw: 0.2 }); text('Café 1€80', 1.2 + w * 0.13, 2.8, 0.9, '#FFFFFF'); text('Crème 3€', 1.2 + w * 0.13, 4, 0.9, '#FFFFFF'); text('Croque 6€', 1.2 + w * 0.13, 5.2, 0.9, '#F2D27A');
  if (lit) for (const x of [w * 0.2, w * 0.4]) pendant(x, 6.4, '#E8C060', true);
  const y = counter(w * 0.5, w * 0.48, h, '#C8D0D8', '#7A3E2A', { panels: true });
  // percolateur
  const px = w * 0.62; R(px, y - 3.4, 4.4, 3.4, '#C8D0D8', { s: 0.25, l: 0.3, lw: 0.15 }); R(px + 0.3, y - 4.2, 3.8, 0.8, '#C8A040', { s: 0, l: 0.2, lw: 0.12 }); F(px + 0.8, y - 1.4, 0.6, 0.6, '#2A2A2A'); F(px + 2.8, y - 1.4, 0.6, 0.6, '#2A2A2A'); for (let k = 0; k < 3; k++) R(w * 0.82 + k * 1.1, y - 0.9, 0.9, 0.9, '#FFFFFF', { s: 0.2, l: 0, lw: 0.08 });
  bistroTable(w * 0.2, h - 2.2); if (w > 34) bistroTable(w * 0.38, h - 2.2);
  return w * 0.75;
}

export function restaurant(k: Kit): number {
  const { w, h, lit } = k;
  const X = k.x;
  const { cel, R, P, L, F, dot, glow, each, room, pendant, frame, bottle } = tools(k);
 room(w, h, '#C9A98A', '#7B4F36', { wainscot: '#5A2A1A', paper: true });
  // tables nappées blanches avec verres et bougies, tableaux, lustre, desserte à vin
  frame(w * 0.1, 2, 5, 3.6, '#C8A040', '#7A9A6A'); frame(w * 0.42, 2.2, 4, 3.2, '#C8A040', '#C88A5A');
  if (lit) { pendant(w * 0.28, 5.4, '#F2C84A', true); pendant(w * 0.62, 5.4, '#F2C84A', true); }
  const tbl = (cx: number): void => { const b = h - 2.2; R(cx - 3, b - 4, 6, 0.6, '#FFFFFF', { s: 0, l: 0, lw: 0.15 }); P([[cx - 3, b - 3.4], [cx + 3, b - 3.4], [cx + 2.6, b - 1.4], [cx - 2.6, b - 1.4]], '#FFFFFF', { s: 0.15, sx: 0.7, l: 0, lw: 0.15 }); F(cx - 2.4, b - 1.4, 0.4, 1.4, '#3A2414'); F(cx + 2, b - 1.4, 0.4, 1.4, '#3A2414');
    for (const d of [-1.6, 1.6]) { cel(() => { X.moveTo(cx + d - 0.45, b - 5.6); X.lineTo(cx + d + 0.45, b - 5.6); X.lineTo(cx + d + 0.3, b - 4.8); X.lineTo(cx + d - 0.3, b - 4.8); X.closePath(); }, '#E8F0F4', { s: 0, l: 0, lw: 0.1, a: 0.85 }); F(cx + d - 0.35, b - 5.3, 0.7, 0.45, '#8A1A2A'); L(cx + d, b - 4.8, cx + d, b - 4, INK, 0.1); }
    F(cx - 0.2, b - 5.4, 0.4, 1.4, '#F6F0E0'); dot(cx, b - 5.7, 0.25, '#F2A03A'); if (lit) glow(cx, b - 5.6, 1.6, '#FFD890', 0.35);
    for (const d of [-1, 1]) { X.strokeStyle = '#3A2414'; X.lineWidth = 0.35; X.beginPath(); X.moveTo(cx + d * 4, b); X.lineTo(cx + d * 4, b - 6.4); X.stroke(); R(cx + d * 3.6 - 0.8, b - 2.6, 1.6, 0.5, '#8B1E2D', { s: 0, l: 0, lw: 0.1 }); } };
  X.toFront(); tbl(w * 0.28); if (w > 34) tbl(w * 0.66);
  R(w - 5.2, h - 8.8, 4.6, 6.6, '#5A2A1A', { s: 0.25, l: 0.15, lw: 0.2 }); each(w - 4.8, w - 0.8, 1, (x, i) => bottle(x + 0.45, h - 6, 2.4, ['#5A1A2A', '#2E4A2A'][i % 2], { cap: '#C8A040', lw: 0.08 }));
  return w * 0.45;
}

export function pizzeria(k: Kit): number {
  const { w, h } = k;
  const X = k.x;
  const { cel, R, E, P, L, F, dot, glow, each, room } = tools(k);
 room(w, h, '#F3DCC0', '#9B6B4A', { tiles: '#F6E8D8' });
  // four à bois en dôme de briques avec feu, pelle, pizzas, nappes à carreaux, piments et ail suspendus
  const ox = w * 0.72, ob = h - 6.4; cel(() => { X.moveTo(ox - 5, ob); X.quadraticCurveTo(ox - 5, ob - 7.6, ox, ob - 8); X.quadraticCurveTo(ox + 5, ob - 7.6, ox + 5, ob); X.closePath(); }, '#C8603A', { box: [ox - 5, ob - 8, 10, 8], s: 0.3, sx: 0.65, l: 0.2, lw: 0.25 });
  X.strokeStyle = 'rgba(120,40,20,0.5)'; X.lineWidth = 0.1; for (let k = 1; k < 7; k++) { X.beginPath(); X.moveTo(ox - 5 + k * 0.2, ob - k * 1.05); X.lineTo(ox + 5 - k * 0.2, ob - k * 1.05); X.stroke(); }
  cel(() => { X.moveTo(ox - 2.2, ob); X.lineTo(ox - 2.2, ob - 1.8); X.quadraticCurveTo(ox, ob - 3.6, ox + 2.2, ob - 1.8); X.lineTo(ox + 2.2, ob); X.closePath(); }, '#2A1410', { s: 0, l: 0, lw: 0.2 }); for (let k = 0; k < 4; k++) P([[ox - 1.6 + k * 0.9, ob], [ox - 1.2 + k * 0.9, ob - 1.6 - (k % 2)], [ox - 0.8 + k * 0.9, ob]], ['#F2A03A', '#F2D24A'][k % 2], { s: 0, l: 0, lw: 0 }); glow(ox, ob - 0.8, 3, '#F28A2A', 0.3);
  R(ox - 5.4, ob, 10.8, 4.2, '#E8D8C0', { s: 0.2, sx: 0.8, l: 0, lw: 0.2 }); L(ox + 5, ob - 3, ox + 7, ob - 7, '#A87A4A', 0.3);
  each(1, ox - 6.4, 2.4, (x, i) => { L(x + 1, 0, x + 1, 1.4, '#8A6A4A', 0.1); if (i % 2) for (let k = 0; k < 4; k++) P([[x + 0.6 + (k % 2) * 0.6, 1.6 + k * 0.8], [x + 1.4 + (k % 2) * 0.6, 1.6 + k * 0.8], [x + 1 + (k % 2) * 0.6, 3 + k * 0.8]], '#D8243A', { s: 0, l: 0, lw: 0.08 }); else for (let k = 0; k < 4; k++) E(x + 1 + ((k % 2) - 0.5) * 0.6, 2 + k * 0.8, 0.5, 0.45, '#F2EAD8', { s: 0.25, l: 0, lw: 0.12 }); });
  X.toFront(); const tb = h - 2.2; R(1, tb - 4, w * 0.4, 0.7, '#FFFFFF', { s: 0, l: 0, lw: 0.15 }); X.fillStyle = '#D8243A'; for (let x = 1; x < 1 + w * 0.4; x += 0.8) X.fillRect(x, tb - 4, 0.4, 0.7); P([[1, tb - 3.3], [1 + w * 0.4, tb - 3.3], [w * 0.4 - 0.4, tb - 1.6], [1.4, tb - 1.6]], '#FFFFFF', { s: 0.15, l: 0, lw: 0.12 }); F(2, tb - 1.6, 0.4, 1.6, '#3A2414'); F(w * 0.4 - 1, tb - 1.6, 0.4, 1.6, '#3A2414');
  for (const cx of [w * 0.12, w * 0.32]) { E(cx, tb - 4.3, 1.8, 0.4, '#E8B860', { s: 0, l: 0, lw: 0.12 }); E(cx, tb - 4.35, 1.5, 0.3, '#D8402A', { s: 0, l: 0, lw: 0 }); for (let k = 0; k < 4; k++) dot(cx - 1 + k * 0.65, tb - 4.4 + (k % 2) * 0.1, 0.18, k % 2 ? '#F6F0E0' : '#3A6A2A'); }
  return w * 0.5;
}

export function kebab(k: Kit): number {
  const { w, h, lit } = k;
  const X = k.x;
  const { cel, R, L, F, glow, each, text, room, counter, bottle } = tools(k);
 room(w, h, '#F2E2C8', '#A9835C', { tiles: '#F6EEE0' });
  // panneaux-menus lumineux, broche verticale qui grille, plaque, sauces, frigo à boissons
  F(0.6, 1.2, w - 1.2, 4, lit ? '#FFF4D0' : '#F4E8C8'); each(1, w - 1, 4.4, (x, i) => { R(x, 1.5, 4, 3.4, ['#C87A3A', '#E8C84A', '#8AB84A', '#E8603A'][i % 4], { s: 0.15, l: 0.15, lw: 0.12 }); F(x + 0.4, 4.2, 3.2, 0.5, '#FFFFFF', 0.85); text(`${5 + i},50€`, x + 2, 4.45, 0.55, '#C8352B', { b: true }); });
  // broche
  const sx = w * 0.3, sb = h - 7.4; R(sx - 2.6, 6, 0.8, sb - 6, '#8A8A8A', { s: 0, l: 0.2, lw: 0.12 }); F(sx - 2.4, 6.6, 0.4, sb - 7, lit ? '#F28A2A' : '#C85A2A'); if (lit) glow(sx - 2.2, 9.5, 2.4, '#F28A2A', 0.3); L(sx, 5.6, sx, sb + 0.6, '#C8C8C8', 0.25);
  cel(() => { X.moveTo(sx - 1.2, 6.6); X.lineTo(sx + 1.2, 6.6); X.quadraticCurveTo(sx + 1.6, 9, sx + 0.8, sb); X.lineTo(sx - 0.8, sb); X.quadraticCurveTo(sx - 1.6, 9, sx - 1.2, 6.6); X.closePath(); }, '#B8663A', { box: [sx - 1.6, 6.6, 3.2, sb - 6.6], s: 0.3, sx: 0.55, l: 0.25, lx: 0.35, lw: 0.15 }); for (let y = 7.2; y < sb; y += 0.7) L(sx - 1, y, sx + 1, y + 0.3, '#8A4020', 0.1);
  const y = counter(0.6, w * 0.98, h, '#C8D0D8', '#F4F4F4'); F(0.6, y + 1.6, w * 0.98, 0.5, '#E5791F');
  R(w * 0.45, y - 2, w * 0.3, 2, '#DDEEF4', { s: 0, l: 0, lw: 0.12, a: 0.8 }); each(w * 0.46, w * 0.74, 1.4, (x, i) => F(x, y - 1.2, 1.2, 1.1, ['#7AC84A', '#E8402A', '#F6F0E0', '#8A3A9A', '#F2D24A'][i % 5]));
  for (const [x, c] of [[w * 0.12, '#E8402A'], [w * 0.17, '#F6F0E0'], [w * 0.22, '#F2D24A']] as const) bottle(x, y, 2, c, { label: null, cap: '#2A2A2A', lw: 0.08 });
  R(w - 5, 5.6, 4.4, h - 13.6, lit ? '#E8F8FF' : '#B8D0DC', { s: 0, l: 0, lw: 0.2 });
  return w * 0.55;
}

export function sushi(k: Kit): number {
  const { w, h, lit } = k;
  const X = k.x;
  const { cel, R, E, P, L, F, dot, glow, each, room, counter } = tools(k);
 room(w, h, '#F4E9E4', '#2F2F33');
  // comptoir à tapis roulant, assiettes de sushis, poissons dans la vitrine du chef, lanternes, chat porte-bonheur, estampe
  F(0, 1.2, w, 0.6, '#2A1A14'); each(2, w - 2, 6, (x, i) => { L(x + 1, 1.8, x + 1, 2.6, '#2A1A14', 0.12); cel(() => X.ellipse(x + 1, 4, 1.3, 1.6, 0, 0, 7), lit ? '#FF6A6A' : '#E2294B', { box: [x - 0.3, 2.4, 2.6, 3.2], s: 0.25, l: 0.2, lw: 0.15 }); L(x - 0.2, 3.2, x + 2.2, 3.2, '#2A1A14', 0.1); L(x - 0.2, 4.8, x + 2.2, 4.8, '#2A1A14', 0.1); if (lit) glow(x + 1, 4, 2.6, '#FF7A7A', 0.25); });
  R(w * 0.7, 6.4, 4, 5.4, '#F6F0E0', { s: 0, l: 0, lw: 0.15 }); E(w * 0.7 + 2, 8.2, 1.6, 0.8, '#E2294B', { s: 0, l: 0, lw: 0 }); E(w * 0.7 + 2, 8.2, 1.1, 0.55, '#F6F0E0', { s: 0, l: 0, lw: 0 }); L(w * 0.7 + 0.8, 9.8, w * 0.7 + 3.2, 10.4, '#3A3A3A', 0.12);
  // chat porte-bonheur
  const nx = w * 0.12, ny = 10; E(nx, ny, 1.2, 1.4, '#FFFFFF', { s: 0.2, l: 0, lw: 0.15 }); E(nx, ny - 1.7, 1, 0.9, '#FFFFFF', { s: 0.15, l: 0, lw: 0.15 }); P([[nx - 0.9, ny - 2.2], [nx - 0.6, ny - 3], [nx - 0.2, ny - 2.5]], '#FFFFFF', { s: 0, l: 0, lw: 0.1 }); P([[nx + 0.2, ny - 2.5], [nx + 0.6, ny - 3], [nx + 0.9, ny - 2.2]], '#FFFFFF', { s: 0, l: 0, lw: 0.1 }); E(nx + 1.3, ny - 2, 0.35, 0.8, '#FFFFFF', { s: 0, l: 0, lw: 0.12 }); dot(nx, ny - 0.4, 0.35, '#F2C83A'); F(nx - 0.9, ny - 1, 1.8, 0.25, '#E2294B');
  const y = counter(0.6, w * 0.98, h, '#C8A070', '#3A2A20'); F(0.6, y - 0.5, w * 0.98, 0.5, '#9AA0A8'); // tapis
  each(1, w - 2, 2.6, (x, i) => { E(x + 1.1, y - 0.7, 1.1, 0.3, ['#3A8AE8', '#E8402A', '#F2C83A', '#FFFFFF'][i % 4], { s: 0, l: 0, lw: 0.1 }); if (i % 2) { R(x + 0.4, y - 1.5, 1.4, 0.7, '#FFFFFF', { s: 0, l: 0, lw: 0.08 }); F(x + 0.4, y - 1.6, 1.4, 0.4, '#F28A5A'); X.strokeStyle = '#FFFFFF'; X.lineWidth = 0.08; X.beginPath(); X.moveTo(x + 0.6, y - 1.5); X.lineTo(x + 0.9, y - 1.2); X.moveTo(x + 1.1, y - 1.5); X.lineTo(x + 1.4, y - 1.2); X.stroke(); } else { dot(x + 1.1, y - 1.2, 0.55, '#1A2A1A'); dot(x + 1.1, y - 1.2, 0.38, '#FFFFFF'); dot(x + 1.1, y - 1.2, 0.18, '#F28A5A'); } });
  return w * 0.45;
}

export function tearoom(k: Kit): number {
  const { w, h } = k;
  const X = k.x;
  const { R, E, P, L, F, dot, each, room, shelf, cake } = tools(k);
 room(w, h, '#EBDDF0', '#C8B0D2', { paper: true, wainscot: '#8F5FA8' });
  // vaisselier de théières, présentoir à étages, petites tables rondes, nappes en dentelle
  R(w * 0.58, 1.6, w * 0.38, 7, '#FFFFFF', { s: 0.15, l: 0, lw: 0.2 }); for (const yy of [4.6, 8]) { shelf(w * 0.6, yy, w * 0.34, '#C8B0D2'); each(w * 0.61, w * 0.93, 2.8, (x, i) => { const c = ['#F28CB4', '#7AC8E8', '#F6E07A', '#B89AE8'][(i + yy | 0) % 4]; E(x + 1.2, yy - 1, 1, 0.9, c, { s: 0.25, l: 0.2, lw: 0.12 }); L(x + 2.2, yy - 1.2, x + 2.8, yy - 1.8, c, 0.3); X.strokeStyle = INK; X.lineWidth = 0.12; X.beginPath(); X.arc(x + 0.1, yy - 1, 0.45, 1.6, 4.7); X.stroke(); dot(x + 1.2, yy - 2, 0.2, c); }); }
  const px = w * 0.2; L(px, 3, px, 10.6, '#C8A040', 0.25); for (const [yy, rr] of [[5, 1.8], [7.8, 2.4], [10.6, 3]] as const) { E(px, yy, rr, 0.35, '#FFFFFF', { s: 0, l: 0, lw: 0.12 }); for (let k = -rr + 0.6; k < rr - 0.2; k += 1) cake(px + k + 0.1, yy - 0.2, 0.8, 0.7, ['#F6E0B0', '#8A4A2A', '#F28CB4'][(k * 2 + yy | 0) % 3 < 0 ? 0 : (k * 2 + yy | 0) % 3], '#FFFFFF', '#D8243A'); }
  X.toFront(); for (const cx of [w * 0.3, w * 0.68]) { const b = h - 2.2; E(cx, b - 3.8, 2.2, 0.4, '#FFFFFF', { s: 0, l: 0, lw: 0.15 }); P([[cx - 2.2, b - 3.6], [cx + 2.2, b - 3.6], [cx + 1.8, b - 2.2], [cx - 1.8, b - 2.2]], '#FFFFFF', { s: 0.1, l: 0, lw: 0.12 }); X.fillStyle = '#FFFFFF'; for (let k = -1.8; k < 1.8; k += 0.6) { X.beginPath(); X.arc(cx + k + 0.3, b - 2.2, 0.3, 0, Math.PI); X.fill(); } F(cx - 0.15, b - 2, 0.3, 2, '#5A3A20'); E(cx - 0.6, b - 4.4, 0.6, 0.4, '#F28CB4', { s: 0.2, l: 0, lw: 0.1 }); E(cx + 0.9, b - 4.2, 0.4, 0.2, '#FFFFFF', { s: 0, l: 0, lw: 0.08 }); }
  return w * 0.75;
}
