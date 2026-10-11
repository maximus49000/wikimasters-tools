// Intérieurs « boutiques » (G4a), portés de la maquette validée : fleuriste, librairie, disquaire, jeux, opticien, friperie,
// antiquaire, animalerie, vélos. Chaque dessin rend la place du vendeur.
import { C, INK, type Kit, PAL, rgba, tools } from './kit';

export function florist(k: Kit): number {
  const { w, h, r } = k;
  const X = k.x;
  const { R, L, each, room, shelf, plant, bucket } = tools(k);
 room(w, h, '#FBE6EE', '#D6B6C2');
  const cols = [['#F05A8A', '#FFFFFF'], ['#FFD84A', '#F28A2A'], ['#B85AE8', '#F05A8A'], ['#E8402A', '#FFFFFF'], ['#FFFFFF', '#F6C0D0']];
  // plantes suspendues, étagère de pots, seaux de fleurs coupées, bouquet emballé
  each(2, w - 2, 7, (x, i) => { L(x, 0, x, 2.4, '#8A6A4A', 0.12); R(x - 1, 2.4, 2, 1.4, '#C86A40', { s: 0.3, l: 0, lw: 0.12 }); for (let k = 0; k < 4; k++) { X.strokeStyle = '#3A8A3A'; X.lineWidth = 0.3; X.beginPath(); X.moveTo(x - 0.8 + k * 0.5, 3.6); X.quadraticCurveTo(x - 1.2 + k * 0.6, 5.6, x - 0.6 + k * 0.4, 6.6 + (k % 2)); X.stroke(); } });
  shelf(0.6, 9, w - 1.2, '#FFFFFF'); each(1.6, w - 1.6, 3.4, (x, i) => plant(x + 1, 9, 0.7));
  X.toFront(); each(0.6, w - 0.6, 3.2, (x, i) => bucket(x + 1.6, h - 2.4, r, cols[i % cols.length]!));
  return w * 0.55;
}

export function bookshop(k: Kit): number {
  const { w, h, r } = k;
  const X = k.x;
  const { R, L, F, each, text, room, shelf, bookRow } = tools(k);
 room(w, h, '#E7DEC9', '#9C7A55');
  // bibliothèque toute hauteur, échelle, table de nouveautés, panneau « coup de cœur »
  R(0.4, 1.2, w - 0.8, h - 3.4, '#7A5434', { s: 0.15, l: 0, lw: 0.2 }); for (let yy = 4.4; yy < h - 2.4; yy += 3.4) { R(0.9, yy - 3, w - 1.8, 3, '#4A3020', { s: 0, l: 0, lw: 0 }); bookRow(1, w - 1, yy, 2.7, r); shelf(0.6, yy, w - 1.2, '#8A6040'); }
  const lx = w * 0.62; L(lx, 1.4, lx + 2.4, h - 2.2, '#5A3A20', 0.4); L(lx + 1.6, 1.4, lx + 4, h - 2.2, '#5A3A20', 0.4); for (let k = 2.5; k < h - 3; k += 1.8) L(lx + (k / h) * 2.4, k, lx + 1.6 + (k / h) * 2.4, k, '#5A3A20', 0.25);
  X.toFront(); const ty = h - 6.2; R(1.4, ty, w * 0.42, 0.8, '#A87A4A', { s: 0, l: 0.2, lw: 0.15 }); F(2, ty + 0.8, 0.6, h - 2.2 - ty - 0.8, '#5A3A20'); F(w * 0.42, ty + 0.8, 0.6, h - 2.2 - ty - 0.8, '#5A3A20');
  each(2, w * 0.42, 2.6, (x, i) => { for (let k = 0; k < 3; k++) R(x + (k % 2) * 0.2, ty - 0.55 - k * 0.55, 2, 0.55, ['#C84A3A', '#3A6AA8', '#F2D27A', '#4A8A4A'][(i + k) % 4], { s: 0, l: 0, lw: 0.08 }); });
  R(w * 0.2, ty - 3.6, 2.6, 1.6, '#F6F0E0', { s: 0, l: 0, lw: 0.1 }); text('♥', w * 0.2 + 1.3, ty - 2.8, 1.2, '#C8243A');
  return w * 0.8;
}

export function records(k: Kit): number {
  const { w, h, r } = k;
  const X = k.x;
  const { R, E, L, each, text, room, vinyl, sleeve } = tools(k);
 room(w, h, '#34343C', '#56565F');
  // mur de pochettes de 33 tours, affiches, bacs à disques, platine qui tourne
  let i = 0; for (let yy = 1.6; yy < 8; yy += 3.1) each(0.8, w - 0.8, 3.1, x => sleeve(x, yy, 2.8, i++));
  // disque à moitié sorti de sa pochette au mur
  vinyl(w * 0.2 + 2.6, 4.6, 1.6, '#F2D24A'); sleeve(w * 0.2, 3.2, 2.8, 3);
  // bacs à disques : pochettes vues par le haut, inclinées
  X.toFront(); const by = h - 2.2; for (const bx of [0.8, w * 0.5]) { const bw = w * 0.42; for (let k = 0; k < bw / 0.9 - 1; k++) { X.save(); X.translate(bx + 0.8 + k * 0.85, by - 2.6); X.rotate(-0.25 + r() * 0.12); R(0, -2.4, 2.6, 2.4, PAL[(k * 5 + (bx | 0)) % PAL.length], { s: 0.15, sx: 0.8, l: 0, lw: 0.1 }); X.restore(); }
    R(bx, by - 3.4, bw, 3.4, '#A86A3A', { s: 0.25, sx: 0.8, l: 0.2, lw: 0.2 }); text('A–Z', bx + bw / 2, by - 1.7, 1, '#F6E0B0', { b: true }); }
  // platine sur un meuble
  const tx = w * 0.72, ty = 9.6; R(tx - 0.4, ty, 6.4, 1.2, '#2A2A30', { s: 0, l: 0.2, lw: 0.15 }); R(tx, ty - 0.9, 5.6, 0.9, '#C8B8A0', { s: 0.2, l: 0.2, lw: 0.15 }); E(tx + 2.3, ty - 1.05, 2.1, 0.32, '#16141A', { s: 0, l: 0, lw: 0.1 }); E(tx + 2.3, ty - 1.1, 0.6, 0.12, '#E8603A', { s: 0, l: 0, lw: 0 }); L(tx + 5, ty - 1.2, tx + 3.6, ty - 1.3, '#C8C8C8', 0.2);
  return w * 0.5;
}

export function games(k: Kit): number {
  const { w, h, lit } = k;
  const { R, E, F, dot, each, room, shelf, counter, screen } = tools(k);
 room(w, h, '#E5DAF5', '#A592CC');
  // boîtes de jeux de société, consoles, peluches, écran de démo
  for (const yy of [5, 9.4]) { shelf(0.6, yy, w * 0.6, '#FFFFFF'); each(1, w * 0.6, 2.6, (x, i) => { R(x, yy - 3.4 + (i % 2) * 0.6, 2.3, 3.4 - (i % 2) * 0.6, ['#E84A3A', '#3A8AE8', '#F2C83A', '#4AB84A', '#B84AE8'][(i * 3 + yy | 0) % 5], { s: 0.25, sx: 0.75, l: 0.15, lw: 0.12 }); dot(x + 1.1, yy - 2 + (i % 2) * 0.3, 0.55, '#FFFFFF'); F(x + 0.3, yy - 0.9, 1.7, 0.3, '#FFFFFF', 0.7); }); }
  screen(w * 0.66, 1.8, w * 0.3, 5.4, lit || true, 0); R(w * 0.66 + w * 0.15 - 0.4, 7.2, 0.8, 0.8, '#2A2A30', { s: 0, l: 0, lw: 0.1 });
  // manettes et peluches
  each(w * 0.66, w - 0.8, 2.4, (x, i) => { E(x + 1, 9.6, 1, 0.55, ['#2A2A30', '#E8E8E8'][i % 2], { s: 0.2, l: 0.2, lw: 0.1 }); dot(x + 0.6, 9.5, 0.15, '#E84A3A'); dot(x + 1.4, 9.5, 0.15, '#3A8AE8'); });
  const y = counter(w * 0.04, w * 0.55, h, '#E8E0F4', '#6A3FB5'); for (const [x, c] of [[w * 0.12, '#F6C83A'], [w * 0.3, '#F28CB4']] as const) { E(x, y - 1.2, 1.1, 1.1, c, { s: 0.25, l: 0.2, lw: 0.12 }); dot(x - 0.8, y - 2.3, 0.45, c); dot(x + 0.8, y - 2.3, 0.45, c); dot(x - 0.35, y - 1.4, 0.15, '#1A1A1A'); dot(x + 0.35, y - 1.4, 0.15, '#1A1A1A'); }
  return w * 0.42;
}

export function optician(k: Kit): number {
  const { w, h } = k;
  const { R, RR, E, F, each, text, room, counter, glasses } = tools(k);
 room(w, h, '#EEF1F8', '#C3C9DA');
  // présentoirs muraux de montures (vraies lunettes), miroir, tableau d'acuité, fauteuil d'examen
  const x0 = w * 0.3; for (let yy = 2.6; yy < 11; yy += 2.2) { F(x0, yy + 0.5, w - x0 - 0.6, 0.3, '#B8C0D0'); each(x0 + 0.4, w - 1, 4.6, (x, i) => glasses(x + 2.2, yy, 0.95, ['#2A2A2A', '#8A3A2A', '#2A4A9A', '#C8A040', '#C83A6A'][(i + yy | 0) % 5], ['#DCEEF6', '#E8D8C8', '#DCEEF6'][i % 3])); }
  // tableau d'acuité
  R(1, 1.8, w * 0.22, 7, '#FFFFFF', { s: 0, l: 0, lw: 0.15 }); [1.4, 1.1, 0.85, 0.65, 0.5].forEach((s, k) => text(['E', 'F P', 'T O Z', 'L P E D', 'P E C F D'][k]!, 1 + w * 0.11, 2.8 + k * 1.3, s, '#1A1A1A', { b: true }));
  RR(w * 0.12, h - 9, 2.6, 4, 0.5, '#243B8A', { s: 0, l: 0.2, lw: 0.15 }); RR(w * 0.1, h - 5.2, 3.6, 1.2, 0.4, '#243B8A', { s: 0, l: 0.2, lw: 0.12 }); F(w * 0.12 + 1, h - 4, 0.5, 1.8, '#C8D0D8');
  const y = counter(w * 0.36, w * 0.6, h, '#FFFFFF', '#DCE2EE'); each(w * 0.4, w * 0.92, 4, (x, i) => glasses(x + 2, y - 0.7, 0.8, ['#C83A6A', '#2A2A2A', '#2A4A9A'][i % 3])); E(w * 0.88, y - 2.6, 1.2, 1.8, '#C8D0D8', { s: 0.15, l: 0.2, lw: 0.15 });
  return w * 0.5;
}

export function thrift(k: Kit): number {
  const { w, h } = k;
  const X = k.x;
  const { E, P, L, F, each, room, shelf, hanger } = tools(k);
 room(w, h, '#F5E3D0', '#C79C78', { paper: true });
  // portant de vêtements, mannequin habillé, chapeaux, chaussures, miroir sur pied
  L(0.8, 2.6, w * 0.62, 2.6, '#8A8A8A', 0.3); L(1, 2.6, 1, h - 2.2, '#8A8A8A', 0.25); L(w * 0.62 - 0.2, 2.6, w * 0.62 - 0.2, h - 2.2, '#8A8A8A', 0.25);
  each(1.8, w * 0.6, 1.6, (x, i) => hanger(x + 0.4, 2.6, ['#E8603A', '#3AA8E8', '#F2D24A', '#4AB86A', '#F28CB4', '#8A5A3A', '#F4EAD0', '#6A3FB5'][(i * 3) % 8], i % 3 === 2 ? 1 : 0));
  // mannequin
  const mx0 = w * 0.78; F(mx0 - 0.2, h - 6, 0.4, 3.8, '#5A3A20'); E(mx0, h - 2.4, 1.4, 0.3, '#5A3A20', { s: 0, l: 0, lw: 0.1 }); P([[mx0 - 1.4, 4.6], [mx0 + 1.4, 4.6], [mx0 + 1, h - 8], [mx0 + 1.8, h - 6], [mx0 - 1.8, h - 6], [mx0 - 1, h - 8]], '#2E5E8E', { s: 0.25, sx: 0.6, l: 0.15, lw: 0.15 }); E(mx0, 3.6, 0.8, 1, '#E8D8C8', { s: 0.2, l: 0, lw: 0.12 }); E(mx0, 2.8, 1.4, 0.35, '#C8402A', { s: 0, l: 0, lw: 0.12 }); E(mx0, 2.5, 0.8, 0.5, '#C8402A', { s: 0.2, l: 0, lw: 0.12 });
  shelf(w * 0.66, 9.6, w * 0.32, '#8A5A3A'); for (const [x, c] of [[w * 0.7, '#3A3A3A'], [w * 0.86, '#C8A060']] as const) { E(x + 1, 9.1, 1.2, 0.35, c, { s: 0, l: 0, lw: 0.1 }); E(x + 1, 8.6, 0.7, 0.6, c, { s: 0.2, l: 0, lw: 0.1 }); }
  X.toFront(); each(1.4, w * 0.55, 2.4, (x, i) => P([[x, h - 2.3], [x + 1.6, h - 2.3], [x + 1.6, h - 2.8], [x + 0.6, h - 3.4], [x, h - 3.4]], ['#8A3A2A', '#1A1A1A', '#C8A060'][i % 3], { s: 0.2, l: 0.2, lw: 0.1 }));
  return w * 0.68;
}

export function antiques(k: Kit): number {
  const { w, h, lit } = k;
  const X = k.x;
  const { cel, R, E, P, L, dot, glow, room, frame } = tools(k);
 room(w, h, '#6E6446', '#8C7650', { paper: true });
  // horloge comtoise, tableaux à cadre doré, gramophone, lustre, commode, vases
  const cx = w * 0.12; R(cx - 1.4, 2, 2.8, h - 4.2, '#7A4A2A', { s: 0.3, l: 0.2, lw: 0.2 }); E(cx, 4.4, 1.1, 1.1, '#F6EAD0', { s: 0, l: 0, lw: 0.15 }); L(cx, 4.4, cx, 3.6, INK, 0.12); L(cx, 4.4, cx + 0.6, 4.6, INK, 0.12); R(cx - 0.8, 6.6, 1.6, 5, '#3A2414', { s: 0, l: 0, lw: 0.12 }); L(cx, 6.8, cx, 10.2, '#C8A040', 0.12); dot(cx, 10.4, 0.5, '#C8A040');
  frame(w * 0.3, 2, 5, 4, '#C8A040', '#5A7A5A'); frame(w * 0.5, 1.6, 4, 5.6, '#C8A040', '#8A6A9A'); frame(w * 0.68, 2.4, 6, 3.6, '#C8A040', '#C8A07A');
  // lustre
  const lx = w * 0.62; L(lx, 0, lx, 1.2, '#C8A040', 0.15); E(lx, 1.6, 2.2, 0.4, '#C8A040', { s: 0, l: 0, lw: 0.12 }); for (let k = -2; k <= 2; k += 1) dot(lx + k, 2.2, 0.3, lit ? '#FFF0B0' : '#F6EAD0'); if (lit) glow(lx, 2, 3.6, '#FFE6A0', 0.25);
  // commode + gramophone
  X.toFront(); const cy = h - 2.2; R(w * 0.32, cy - 5, w * 0.42, 5, '#8A5434', { s: 0.25, l: 0.2, lw: 0.2 }); for (let k = 0; k < 2; k++) { R(w * 0.34, cy - 4.4 + k * 2.2, w * 0.38, 1.8, '#9A6440', { s: 0.2, sx: 0.8, l: 0, lw: 0.1 }); dot(w * 0.53, cy - 3.5 + k * 2.2, 0.2, '#C8A040'); }
  const gx = w * 0.42; R(gx - 1.2, cy - 6.4, 2.4, 1.4, '#5A3A20', { s: 0.2, l: 0.2, lw: 0.12 }); L(gx + 0.4, cy - 6.4, gx + 1, cy - 8.2, '#C8A040', 0.25); P([[gx + 1, cy - 8.2], [gx + 3.4, cy - 11], [gx + 4.2, cy - 8.4]], '#C8A040', { s: 0.3, l: 0.25, lw: 0.15 });
  cel(() => { X.moveTo(w * 0.62, cy - 5); X.quadraticCurveTo(w * 0.62 - 1.4, cy - 6.8, w * 0.62 - 0.4, cy - 8.4); X.lineTo(w * 0.62 + 0.8, cy - 8.4); X.quadraticCurveTo(w * 0.62 + 1.8, cy - 6.8, w * 0.62 + 0.4, cy - 5); X.closePath(); }, '#2E5E9E', { box: [w * 0.62 - 1.4, cy - 8.4, 3.2, 3.4], s: 0.25, l: 0.2, lw: 0.15 });
  // fauteuil médaillon
  const fx = w * 0.86; E(fx, cy - 5.6, 1.6, 2, '#A84A5A', { s: 0.25, l: 0.2, lw: 0.15 }); R(fx - 2, cy - 3.6, 4, 1.4, '#A84A5A', { s: 0.25, l: 0.2, lw: 0.12 }); L(fx - 1.7, cy - 2.2, fx - 1.9, cy, '#7A4A2A', 0.3); L(fx + 1.7, cy - 2.2, fx + 1.9, cy, '#7A4A2A', 0.3);
  return w * 0.25;
}

export function petshop(k: Kit): number {
  const { w, h, lit, r } = k;
  const X = k.x;
  const { cel, R, E, P, L, F, dot, glow, each, room, fish } = tools(k);
 room(w, h, '#FBEBC8', '#D6BE8C');
  // mur d'aquariums lumineux avec poissons, cage à oiseau, sacs de croquettes, arbre à chat
  const ax = w * 0.5; for (let row = 0; row < 2; row++) each(ax, w - 0.6, 5, (x, i) => { const y = 1.6 + row * 4.2; R(x, y, 4.6, 3.6, lit ? '#7AD0F0' : '#5AA8C8', { s: 0, l: 0, lw: 0.2 }); F(x, y, 4.6, 0.6, '#1A1A1A'); F(x, y + 3, 4.6, 0.6, '#E8D8A8'); for (let k = 0; k < 3; k++) fish(x + 1 + r() * 2.6, y + 1.2 + r() * 1.6, 1, ['#F28A2A', '#F2D24A', '#E84A6A', '#3AE8E8'][(k + i) % 4], r() < 0.5 ? 1 : -1); L(x + 3.8, y + 3, x + 3.6, y + 1.6, '#3A9A4A', 0.25); dot(x + 1.2, y + 2, 0.15, '#FFFFFF', 0.7); if (lit) glow(x + 2.3, y + 1.8, 2.8, '#AEE8FF', 0.15); });
  // cage
  const cx = w * 0.18; L(cx, 0, cx, 1.6, '#5A5A5A', 0.12); cel(() => { X.moveTo(cx - 2, 6.4); X.lineTo(cx - 2, 3.4); X.quadraticCurveTo(cx, 1.4, cx + 2, 3.4); X.lineTo(cx + 2, 6.4); X.closePath(); }, '#F6F0E0', { box: [cx - 2, 1.4, 4, 5], s: 0, l: 0, lw: 0.15, a: 0.4 }); for (let k = -1.6; k <= 1.6; k += 0.55) L(cx + k, 2.6 + Math.abs(k) * 0.4, cx + k, 6.4, '#C8A040', 0.1); E(cx, 4.6, 0.7, 0.55, '#F2D24A', { s: 0.2, l: 0, lw: 0.1 }); dot(cx + 0.55, 4.3, 0.3, '#F2D24A'); dot(cx + 0.65, 4.2, 0.08, '#1A1A1A'); L(cx - 1.6, 5.4, cx + 1.6, 5.4, '#8A5A3A', 0.15);
  // arbre à chat avec chat
  const tx = w * 0.36; F(tx - 0.4, h - 12, 0.8, 9.8, '#C8B090'); R(tx - 2, h - 12.6, 4, 1, '#B8A8C8', { s: 0.2, l: 0.2, lw: 0.12 }); R(tx - 2, h - 7.4, 4, 1, '#B8A8C8', { s: 0.2, l: 0.2, lw: 0.12 }); E(tx, h - 13.6, 1.4, 0.9, '#F28A2A', { s: 0.25, l: 0.2, lw: 0.12 }); P([[tx - 1, h - 14.2], [tx - 0.7, h - 15.2], [tx - 0.3, h - 14.4]], '#F28A2A', { s: 0, l: 0, lw: 0.1 }); P([[tx + 0.3, h - 14.4], [tx + 0.7, h - 15.2], [tx + 1, h - 14.2]], '#F28A2A', { s: 0, l: 0, lw: 0.1 }); X.strokeStyle = '#F28A2A'; X.lineWidth = 0.3; X.beginPath(); X.moveTo(tx + 1.3, h - 13.4); X.quadraticCurveTo(tx + 2.2, h - 12.6, tx + 1.6, h - 11.8); X.stroke();
  // sacs de croquettes
  X.toFront(); each(0.6, w * 0.3, 2.6, (x, i) => { R(x, h - 6.4, 2.3, 4.2, ['#E8402A', '#3A8AE8', '#4AB84A'][i % 3], { s: 0.25, sx: 0.7, l: 0.2, lw: 0.12 }); E(x + 1.15, h - 4.6, 0.7, 0.6, '#FFFFFF', { s: 0, l: 0, lw: 0.08 }); dot(x + 1.15, h - 4.6, 0.25, '#8A5A3A'); });
  return w * 0.48;
}

export function bikes(k: Kit): number {
  const { w, h } = k;
  const X = k.x;
  const { cel, R, E, L, dot, each, room, shelf } = tools(k);
 room(w, h, '#EFE8E2', '#B7AEA6');
  // panneau d'outils, roues suspendues, vélos au mur et au sol, casques
  R(w * 0.04, 1.6, w * 0.3, 5.6, '#C8A070', { s: 0, l: 0, lw: 0.15 }); X.fillStyle = 'rgba(90,60,30,0.4)'; for (let x = w * 0.04 + 0.6; x < w * 0.34; x += 0.8) for (let y = 2.2; y < 7; y += 0.8) { X.beginPath(); X.arc(x, y, 0.1, 0, 7); X.fill(); }
  L(w * 0.08, 2.6, w * 0.08, 6, '#3A3A3A', 0.35); L(w * 0.13, 2.6, w * 0.14, 5.4, '#C83A3A', 0.35); E(w * 0.2, 3.6, 0.8, 0.8, '#3A3A3A', { s: 0, l: 0, lw: 0 }); E(w * 0.2, 3.6, 0.4, 0.4, '#C8A070', { s: 0, l: 0, lw: 0 }); L(w * 0.2, 4.4, w * 0.2, 6.2, '#3A3A3A', 0.35); L(w * 0.27, 2.6, w * 0.3, 6.2, '#8A8A8A', 0.3);
  each(w * 0.4, w - 1, 4.4, (x, i) => { L(x + 2, 1, x + 2, 1.6, '#5A5A5A', 0.15); X.strokeStyle = '#2A2A2A'; X.lineWidth = 0.35; X.beginPath(); X.arc(x + 2, 3.6, 1.9, 0, 7); X.stroke(); X.strokeStyle = '#B8B8B8'; X.lineWidth = 0.08; for (let a = 0; a < 6; a++) { X.beginPath(); X.moveTo(x + 2 + Math.cos(a * 0.52) * 1.8, 3.6 + Math.sin(a * 0.52) * 1.8); X.lineTo(x + 2 - Math.cos(a * 0.52) * 1.8, 3.6 - Math.sin(a * 0.52) * 1.8); X.stroke(); } dot(x + 2, 3.6, 0.3, '#8A8A8A'); });
  const bike = (bx: number, by: number, c: string | undefined, s = 1): void => { const rr = 2 * s; for (const d of [-1, 1]) { X.strokeStyle = '#1A1A1A'; X.lineWidth = 0.38 * s; X.beginPath(); X.arc(bx + d * 2.6 * s, by - rr, rr, 0, 7); X.stroke(); X.strokeStyle = '#C8C8C8'; X.lineWidth = 0.06; for (let a = 0; a < 4; a++) { X.beginPath(); X.moveTo(bx + d * 2.6 * s + Math.cos(a * 0.785) * rr * 0.9, by - rr + Math.sin(a * 0.785) * rr * 0.9); X.lineTo(bx + d * 2.6 * s - Math.cos(a * 0.785) * rr * 0.9, by - rr - Math.sin(a * 0.785) * rr * 0.9); X.stroke(); } }
    X.strokeStyle = c; X.lineWidth = 0.42 * s; X.lineJoin = 'round'; X.beginPath(); X.moveTo(bx - 2.6 * s, by - rr); X.lineTo(bx - 0.4 * s, by - rr); X.lineTo(bx - 1.2 * s, by - rr - 2.4 * s); X.lineTo(bx - 2.6 * s, by - rr); X.moveTo(bx - 0.4 * s, by - rr); X.lineTo(bx + 1.6 * s, by - rr - 2.2 * s); X.lineTo(bx - 1.2 * s, by - rr - 2.4 * s); X.moveTo(bx + 1.6 * s, by - rr - 2.2 * s); X.lineTo(bx + 2.6 * s, by - rr); X.stroke();
    L(bx - 1.2 * s, by - rr - 2.4 * s, bx - 1.4 * s, by - rr - 3 * s, '#1A1A1A', 0.25 * s); E(bx - 1.4 * s, by - rr - 3.1 * s, 0.8 * s, 0.25 * s, '#1A1A1A', { s: 0, l: 0, lw: 0 }); L(bx + 1.6 * s, by - rr - 2.2 * s, bx + 1.4 * s, by - rr - 3.2 * s, '#1A1A1A', 0.25 * s); L(bx + 1.4 * s, by - rr - 3.2 * s, bx + 2.2 * s, by - rr - 3.3 * s, '#1A1A1A', 0.25 * s); };
  X.toFront(); each(0.6, w - 0.6, 7, (x, i) => bike(x + 3.5, h - 2.3, ['#E0412B', '#2E78C8', '#2E9A5A', '#F2C83A'][i % 4], 0.85));
  shelf(w * 0.04, 9.4, w * 0.3, '#8A8A8A'); each(w * 0.05, w * 0.32, 2.4, (x, i) => cel(() => { X.arc(x + 1.1, 9.4, 1.1, Math.PI, 0); X.closePath(); }, ['#E0412B', '#F2F2F2', '#2E78C8'][i % 3], { box: [x, 8.3, 2.2, 1.1], s: 0.25, l: 0.25, lw: 0.12 }));
  return w * 0.3;
}
