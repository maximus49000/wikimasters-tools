// Intérieurs « alimentation » (G4a), portés de la maquette validée : boulangerie, pâtisserie, chocolatier, boucherie,
// poissonnerie, fromagerie, primeur, caviste, épicerie fine, supérette. Chaque dessin rend la place du vendeur.
import { INK, type Kit, rgba, tools } from './kit';

export function bakery(k: Kit): number {
  const { w, h } = k;
  const { R, E, F, dot, each, text, room, counter, baguette, boule, croissant, basket } = tools(k);
 room(w, h, '#F3E2C0', '#C9A06A', { wainscot: '#B88A5A' });
  // mur à pains : casiers en bois, baguettes debout, boules, couronnes
  R(w * 0.38, 1.6, w * 0.6, h - 9, '#A87048', { s: 0.2, l: 0, lw: 0.2 }); each(w * 0.38 + 0.5, w * 0.98 - 0.5, 4, (x, i) => { R(x, 2.2, 3.4, h - 10.2, '#8A5634', { s: 0.25, sx: 0.85, l: 0, lw: 0.12 }); if (i % 2 === 0) for (let k = 0; k < 5; k++) baguette(x + 0.6 + k * 0.55, h - 8.3, h - 11, -0.08 + k * 0.04); else { boule(x + 1.7, h - 9.4, 1.4); boule(x + 1.7, 4.6, 1.3); boule(x + 1.7, 7, 1.4); } });
  dot(w * 0.2, 4.4, 2.2, '#F6E8C8'); E(w * 0.2, 4.4, 2.2, 2.2, '#F6E8C8', { s: 0.2, l: 0, lw: 0.15 }); text('PAIN', w * 0.2, 4.4, 1.3, '#8A4B1E', { b: true, f: 'Georgia, serif' });
  const y = counter(0.6, w * 0.7, h, '#E8D8B8', '#C8A070', { panels: true }); // vitrine réfrigérée avec viennoiseries
  R(1, y - 3.2, w * 0.66, 3.2, '#DDEEF4', { s: 0, l: 0, lw: 0.15, a: 0.85 }); for (let k = 0; k < w * 0.66 / 2.4 - 0.5; k++) croissant(2.4 + k * 2.4, y - 1, 0.8); F(1.2, y - 3, w * 0.66 - 0.4, 0.4, '#FFFFFF', 0.5);
  basket(w * 0.75, h - 2.4, 4); for (let k = 0; k < 4; k++) baguette(w * 0.75 + 0.7 + k * 0.9, h - 3.4, 6, -0.25 + k * 0.15);
  return w * 0.35;
}

export function pastry(k: Kit): number {
  const { w, h } = k;
  const { R, E, L, each, room, shelf, counter, cake, macarons } = tools(k);
 room(w, h, '#FBE3EC', '#E8C4D0', { paper: true });
  // étagères à gâteaux, présentoir à étages de macarons, guirlande
  shelf(w * 0.45, 6, w * 0.53, '#FFFFFF'); shelf(w * 0.45, 11, w * 0.53, '#FFFFFF'); each(w * 0.46, w * 0.98, 3.4, (x, i) => { cake(x + 1.6, 6, 2.6, 2.2, ['#8A4A2A', '#F6E0B0', '#F28CB4'][i % 3], '#FFF6E8', '#D8243A'); cake(x + 1.6, 11, 2.4, 2, ['#F6E0B0', '#B8E07A', '#8A4A2A'][i % 3], '#F28CB4', '#FFFFFF'); });
  // présentoir à étages
  const px = w * 0.24; L(px, 2, px, 12, '#C8A040', 0.25); for (const [yy, rr] of [[4.6, 2.2], [8, 3], [11.6, 3.8]] as const) { E(px, yy, rr, 0.4, '#FFFFFF', { s: 0, l: 0, lw: 0.15 }); for (let k = -rr + 0.7; k < rr - 0.3; k += 1.1) { E(px + k, yy - 0.6, 0.5, 0.3, ['#F28CB4', '#B8E07A', '#F6E07A', '#B89AE8'][(k * 3 + yy | 0) & 3], { s: 0.2, l: 0, lw: 0.08 }); } }
  const y = counter(0.6, w * 0.88, h, '#FFFFFF', '#F6D0DC', { panels: true }); R(1, y - 3, w * 0.86, 3, '#EAF6FA', { s: 0, l: 0, lw: 0.15, a: 0.8 });
  each(1.6, w * 0.86, 2.6, (x, i) => i % 3 === 2 ? macarons(x + 1, y, 3) : cake(x + 1.1, y, 1.8, 1.4, ['#F6E0B0', '#8A4A2A'][i % 2], '#F28CB4', '#D8243A'));
  return w * 0.5;
}

export function chocolatier(k: Kit): number {
  const { w, h } = k;
  const { R, L, dot, each, room, shelf, counter } = tools(k);
 room(w, h, '#7B4B32', '#A9714F', { wainscot: '#4A2A1A' });
  // vitrines de pralinés, boîtes dorées à rubans, tablettes, fontaine
  for (const yy of [4.5, 8.6]) { shelf(1, yy, w - 2, '#C8A040'); each(1.4, w - 1.4, 3.6, (x, i) => { if ((i + yy | 0) % 2) { R(x, yy - 2.6, 3, 2.6, '#E8C060', { s: 0.25, l: 0.25, lw: 0.12 }); L(x + 1.5, yy - 2.6, x + 1.5, yy, '#C8243A', 0.25); L(x, yy - 1.3, x + 3, yy - 1.3, '#C8243A', 0.25); } else { R(x, yy - 1.4, 3, 1.4, '#3A1A10', { s: 0, l: 0, lw: 0.12 }); each(x + 0.4, x + 2.8, 0.75, xx => dot(xx + 0.3, yy - 0.8, 0.28, ['#6A3A20', '#E8D0A0', '#8A4A2A'][(xx * 3 | 0) % 3])); } }); }
  const y = counter(0.6, w * 0.9, h, '#E8C890', '#4A2A1A', { panels: true }); R(1, y - 2.6, w * 0.88, 2.6, '#F2E8DA', { s: 0, l: 0, lw: 0.15, a: 0.75 });
  each(1.6, w * 0.86, 1.1, (x, i) => { dot(x + 0.4, y - 0.6, 0.42, ['#3A1A10', '#6A3A20', '#E8D0A0', '#A8682A'][i % 4]); dot(x + 0.25, y - 0.8, 0.12, '#FFFFFF', 0.5); });
  return w * 0.55;
}

export function butcher(k: Kit): number {
  const { w, h } = k;
  const X = k.x;
  const { cel, R, E, P, L, F, dot, each, room, counter, steak } = tools(k);
 room(w, h, '#F4EDE6', '#D9D2CA', { tiles: '#F6F2EE' });
  F(0, 5.6, w, 0.5, '#A3262A'); // frise rouge dans la faïence
  // rail : jambons, saucissons, chapelets de saucisses
  L(0.5, 1.6, w - 0.5, 1.6, '#8A8A8A', 0.25); each(1.5, w - 1, 3.4, (x, i) => { L(x + 1, 1.6, x + 1, 2.6, '#5A5A5A', 0.12); if (i % 3 === 0) cel(() => { X.moveTo(x + 1, 2.6); X.quadraticCurveTo(x + 2.4, 3.6, x + 2, 6.6); X.quadraticCurveTo(x + 1, 7.8, x, 6.6); X.quadraticCurveTo(x - 0.3, 3.6, x + 1, 2.6); }, '#C8584A', { box: [x - 0.3, 2.6, 2.7, 5], s: 0.3, l: 0.2, lw: 0.15 }); else if (i % 3 === 1) for (let k = 0; k < 4; k++) E(x + 1, 3.2 + k * 1.1, 0.4, 0.55, '#A8483A', { s: 0.25, l: 0, lw: 0.1 }); else { E(x + 1, 4.4, 0.55, 1.8, '#8A3A2A', { s: 0.3, l: 0.15, lw: 0.12 }); for (let k = 0; k < 4; k++) dot(x + 0.8 + (k % 2) * 0.4, 3.4 + k * 0.6, 0.12, '#F6E8DC'); } });
  // planche, couteaux aimantés
  each(w * 0.55, w - 1, 1.2, (x, i) => { F(x, 7.2, 0.25, 1.4, '#3A3A3A'); P([[x - 0.2, 8.6], [x + 0.45, 8.6], [x + 0.35, 10.6], [x - 0.2, 10.2]], '#C8D0D8', { s: 0.2, l: 0, lw: 0.08 }); });
  const y = counter(0.6, w * 0.95, h, '#E8E8E8', '#F6F4F0'); R(0.9, y - 3.6, w * 0.93, 3.6, '#E8F4F8', { s: 0, l: 0, lw: 0.15, a: 0.6 }); F(0.9, y - 0.9, w * 0.93, 0.9, '#4A8A4A'); // persil
  each(1.6, w * 0.92, 2.8, (x, i) => i % 2 ? steak(x + 1.3, y - 1.4, 0.75) : (E(x + 1.3, y - 1.4, 1.2, 0.7, '#E87A6A', { s: 0.2, l: 0, lw: 0.1 }), L(x + 0.4, y - 1.4, x + 2.2, y - 1.4, '#F6E0D8', 0.15)));
  return w * 0.35;
}

export function fishmonger(k: Kit): number {
  const { w, h, r } = k;
  const X = k.x;
  const { R, E, P, L, F, each, room, fish, fruitAt } = tools(k);
 room(w, h, '#DCEBF2', '#B7CAD3', { tiles: '#E6F2F8' });
  // filets de pêche, bouée, ardoise des arrivages
  X.strokeStyle = 'rgba(90,110,130,0.5)'; X.lineWidth = 0.1; for (let k = 0; k < w * 0.5; k += 1.2) { X.beginPath(); X.moveTo(w * 0.45 + k, 1.2); X.lineTo(w * 0.45 + k + 3, 7); X.stroke(); X.beginPath(); X.moveTo(w * 0.45 + k + 3, 1.2); X.lineTo(w * 0.45 + k, 7); X.stroke(); }
  E(w * 0.85, 4, 1.8, 1.8, '#E8402A', { s: 0.2, l: 0, lw: 0.15 }); E(w * 0.85, 4, 0.9, 0.9, '#E6F2F8', { s: 0, l: 0, lw: 0.15 }); F(w * 0.85 - 0.3, 2.2, 0.6, 0.6, '#FFFFFF'); F(w * 0.85 - 0.3, 5.2, 0.6, 0.6, '#FFFFFF');
  R(1.2, 1.8, w * 0.32, 5.4, '#2E3A34', { s: 0, l: 0, lw: 0.2 }); for (let k = 0; k < 4; k++) L(1.8, 3 + k * 1.1, 1.8 + w * 0.22 - (k % 2) * 2, 3 + k * 1.1, 'rgba(255,255,255,0.75)', 0.18);
  // étal incliné sur glace pilée
  const y = h - 7.4; X.toFront(); P([[0.5, y + 0.6], [w - 0.5, y + 0.6], [w - 0.5, y - 3.4], [0.5, y - 1.4]], '#F2F8FB', { s: 0.12, l: 0, lw: 0.2 }); X.fillStyle = 'rgba(160,200,220,0.6)'; for (let k = 0; k < 60; k++) { X.beginPath(); X.arc(0.8 + r() * (w - 1.6), y - 0.8 - r() * 2.2 * (1), 0.18, 0, 7); X.fill(); }
  each(1.2, w - 2.4, 4.2, (x, i) => { fish(x + 2, y - 1.3 - i * 0.12, 3.6, ['#9AB8C8', '#C8A8B8', '#B8C8A8'][i % 3], i % 2 ? 1 : -1); });
  each(2.2, w - 3, 5.6, (x, i) => { if (i % 2) { E(x + 1.6, y - 2.6, 0.9, 0.55, '#E8603A', { s: 0.25, l: 0, lw: 0.1 }); L(x + 0.8, y - 2.8, x + 0.2, y - 3.3, '#C8402A', 0.15); L(x + 2.4, y - 2.8, x + 3, y - 3.3, '#C8402A', 0.15); } else { for (let k = 0; k < 3; k++) { X.strokeStyle = '#F28A8A'; X.lineWidth = 0.35; X.beginPath(); X.arc(x + 0.8 + k * 0.9, y - 2.6, 0.35, 0.5, 4.5); X.stroke(); } } });
  each(1.2, w - 1.2, 1.6, (x, i) => i % 3 === 0 && fruitAt(x, y - 0.6, 'lemon'));
  R(0.5, y + 0.6, w - 1, 4.6, '#F6F4F0', { s: 0.2, sx: 0.8, l: 0, lw: 0.2 }); F(0.5, y + 1.4, w - 1, 0.5, '#2D6F9A');
  return w * 0.3;
}

export function cheese(k: Kit): number {
  const { w, h, r } = k;
  const { E, P, dot, each, room, shelf, counter, cheeseWheel, wedge } = tools(k);
 room(w, h, '#F6E8B8', '#D8BE7A', { wainscot: '#8A6A3A' });
  // étagères en bois : meules, tommes, pyramides, cloche
  for (const yy of [5, 9.6]) { shelf(0.6, yy, w - 1.2, '#8A6A3A'); let x = 1.4; let i = 0; while (x < w - 3) { const k = (r() * 4) | 0; if (k === 0) { cheeseWheel(x + 1.5, yy, 1.6, '#E8C060', r() < 0.4); x += 3.6; } else if (k === 1) { cheeseWheel(x + 1, yy, 1, '#F6F0E0'); x += 2.4; } else if (k === 2) { P([[x, yy], [x + 2, yy], [x + 1.4, yy - 1.6], [x + 0.6, yy - 1.6]], '#4A4A4A', { s: 0.2, l: 0.15, lw: 0.12 }); x += 2.6; } else { cheeseWheel(x + 1.3, yy, 1.3, '#C87A3A'); x += 3; } i++; } }
  const y = counter(0.6, w * 0.92, h, '#F4EAD0', '#8A6A3A', { panels: true });
  each(1.4, w * 0.9, 3, (x, i) => i % 2 ? wedge(x, y, 0.9, ['#F6E08A', '#F6F0E0'][i % 2]) : cheeseWheel(x + 1.2, y, 1, '#F2C84A', true));
  E(w * 0.8, y - 1.6, 1.5, 1.6, '#DDEEF4', { s: 0, l: 0.2, lw: 0.15, a: 0.7 }); dot(w * 0.8, y - 3.3, 0.3, '#C8A040');
  return w * 0.4;
}

export function greengrocer(k: Kit): number {
  const { w, h, r } = k;
  const { R, E, each, room, counter, crate } = tools(k);
 room(w, h, '#E6F1D3', '#BFCF9D', { wainscot: '#7A8A4A' });
  // gradins de cageots inclinés, ardoise de prix, balance
  const fruits = ['apple', 'orange', 'lemon', 'pear', 'tomato', 'grape', 'banana', 'salad', 'carrot'];
  for (let row = 0; row < 3; row++) { const b = 5 + row * 4.4; each(0.8 + row * 0.6, w - 0.8, 4.2, (x, i) => { crate(x, b, 3.8, fruits[(i * 3 + row * 2) % fruits.length], r); R(x + 1.2, b - 0.8, 1.4, 0.9, '#FFFFFF', { s: 0, l: 0, lw: 0.08 }); }); }
  const y = counter(w * 0.62, w * 0.36, h, '#E8E0C8', '#8A6A3A'); R(w * 0.66, y - 1.6, 3, 1.6, '#E8E8E8', { s: 0.25, l: 0.2, lw: 0.12 }); E(w * 0.66 + 1.5, y - 2, 1.6, 0.4, '#C8C8C8', { s: 0, l: 0, lw: 0.12 });
  return w * 0.75;
}

export function wine(k: Kit): number {
  const { w, h } = k;
  const X = k.x;
  const { cel, R, L, F, dot, each, room, shelf, counter, bottle } = tools(k);
 room(w, h, '#8B3A52', '#6E4A3A', { wainscot: '#4A2A1A' });
  // casiers en losange, bouteilles vues par le cul, rangée de bouteilles debout, tonneau-table
  const cx0 = w * 0.42; R(cx0, 1.4, w - cx0 - 0.6, h - 8.4, '#6A4A2A', { s: 0.2, l: 0, lw: 0.2 });
  for (let yy = 2.2; yy < h - 8; yy += 1.2) for (let xx = cx0 + 0.7 + ((yy / 1.2 | 0) % 2) * 0.6; xx < w - 1.1; xx += 1.2) { dot(xx, yy + 0.4, 0.5, '#1E2A1A'); dot(xx, yy + 0.4, 0.22, ['#6A1A2A', '#2E4A2A', '#C8A040'][(xx * yy | 0) % 3]); X.strokeStyle = INK; X.lineWidth = 0.08; X.beginPath(); X.arc(xx, yy + 0.4, 0.5, 0, 7); X.stroke(); }
  shelf(0.8, 7.2, cx0 - 1.6, '#C8A070'); each(1.2, cx0 - 1, 1.1, (x, i) => bottle(x + 0.5, 7.2, 4.8, ['#2E4A2A', '#5A1A2A', '#1E2A1A', '#C8D8A8'][i % 4], { cap: ['#C8A040', '#A8243A', '#E8E8E8'][i % 3] }));
  shelf(0.8, 12.2, cx0 - 1.6, '#C8A070'); each(1.2, cx0 - 1, 1.6, (x, i) => { X.save(); X.translate(x + 0.8, 12.2); X.rotate(-1.5708); bottle(0, 0, 3.6, ['#2E4A2A', '#5A1A2A'][i % 2], { label: null, cap: '#C8A040' }); X.restore(); });
  // tonneau
  const bx = w * 0.18, by = h - 2.2; cel(() => { X.moveTo(bx - 2.4, by); X.quadraticCurveTo(bx - 3, by - 3, bx - 2.4, by - 6); X.lineTo(bx + 2.4, by - 6); X.quadraticCurveTo(bx + 3, by - 3, bx + 2.4, by); X.closePath(); }, '#A86A3A', { box: [bx - 3, by - 6, 6, 6], s: 0.3, l: 0.2, lw: 0.2 }); for (const k of [1.2, 4.8]) L(bx - 2.6, by - k, bx + 2.6, by - k, '#3A3A3A', 0.3);
  bottle(bx - 1, by - 6, 3.4, '#5A1A2A', { cap: '#A8243A' }); cel(() => { X.moveTo(bx + 0.7, by - 7.2); X.lineTo(bx + 1.9, by - 7.2); X.lineTo(bx + 1.6, by - 6.4); X.lineTo(bx + 1, by - 6.4); X.closePath(); }, '#E8F0F4', { s: 0, l: 0, lw: 0.1 }); F(bx + 0.85, by - 6.9, 0.9, 0.45, '#8A1A2A'); L(bx + 1.3, by - 6.4, bx + 1.3, by - 6, INK, 0.1);
  const y = counter(w * 0.52, w * 0.46, h, '#C8A070', '#4A2A1A', { panels: true });
  return w * 0.75;
}

export function grocery(k: Kit): number {
  const { w, h } = k;
  const X = k.x;
  const { cel, R, E, L, F, dot, each, room, shelf, counter } = tools(k);
 room(w, h, '#F2DDB4', '#B89A66', { wainscot: '#8A5A2A' });
  // bocaux, conserves, sacs de jute avec pelle, tresses d'ail
  for (const yy of [4.6, 8.8]) { shelf(0.6, yy, w - 1.2, '#8A5A2A'); each(1, w - 1, 2, (x, i) => { if ((i + yy | 0) % 3 === 0) { R(x, yy - 2.6, 1.6, 2.6, '#DDEEF4', { s: 0, l: 0.15, lw: 0.12, a: 0.85 }); F(x + 0.1, yy - 1.8, 1.4, 1.7, ['#E8A030', '#C8402A', '#6A9A3A', '#F2E8C0'][i % 4]); R(x - 0.1, yy - 3, 1.8, 0.5, '#C8A040', { s: 0, l: 0, lw: 0.1 }); } else { R(x, yy - 2, 1.6, 2, ['#E8402A', '#3A7AC8', '#F2C83A', '#4A9A4A'][i % 4], { s: 0.25, sx: 0.7, l: 0.25, lw: 0.12 }); F(x, yy - 1.4, 1.6, 0.8, '#F6EAD0'); } }); }
  for (const x of [w * 0.86, w * 0.94]) { L(x, 1, x, 6, '#C8A880', 0.15); for (let k = 0; k < 5; k++) dot(x + ((k % 2) - 0.5) * 0.5, 2 + k * 0.9, 0.42, '#F6F0E0'); }
  each(0.8, w * 0.6, 3.6, (x, i) => { cel(() => { X.moveTo(x, h - 2.2); X.lineTo(x + 0.3, h - 6.4); X.quadraticCurveTo(x + 1.6, h - 7, x + 2.9, h - 6.4); X.lineTo(x + 3.2, h - 2.2); X.closePath(); }, '#C8A870', { box: [x, h - 7, 3.2, 4.8], s: 0.3, l: 0.2, lw: 0.15 }); E(x + 1.6, h - 6.4, 1.3, 0.35, ['#5A3A20', '#F6F0E0', '#E8A030'][i % 3], { s: 0, l: 0, lw: 0.1 }); L(x + 2, h - 6.6, x + 2.8, h - 7.6, '#C8C8C8', 0.25); });
  const y = counter(w * 0.62, w * 0.36, h, '#E8D8B8', '#8A5A2A'); R(w * 0.66, y - 2.4, 3.4, 2.4, '#3A3A3A', { s: 0.2, l: 0.2, lw: 0.15 }); F(w * 0.66 + 0.4, y - 2, 2.6, 0.8, '#7AE8A0');
  return w * 0.78;
}

export function minimarket(k: Kit): number {
  const { w, h, lit } = k;
  const { R, F, each, text, room, shelf, counter, bottle } = tools(k);
 room(w, h, '#E8EEF4', '#C5CDD6');
  F(0, 1.2, w, 1.4, '#1C6FB8'); text('FRAIS · ÉPICERIE · BOISSONS', w * 0.45, 1.9, 0.9, '#FFE45C', { b: true });
  // frigos vitrés lumineux, gondoles de paquets, caisse
  const fx = w * 0.7; R(fx, 3, w - fx - 0.4, h - 5.2, '#D8DEE4', { s: 0.2, l: 0, lw: 0.2 }); for (let k = 0; k < 2; k++) { const gx = fx + 0.5 + k * (w - fx - 1.3) / 2; F(gx, 3.5, (w - fx - 1.3) / 2 - 0.2, h - 6.2, lit ? '#E8F8FF' : '#B8D0DC'); for (let yy = 5.6; yy < h - 3; yy += 2.6) { F(gx, yy, (w - fx - 1.3) / 2 - 0.2, 0.25, '#9AA8B0'); each(gx + 0.2, gx + (w - fx - 1.3) / 2 - 0.4, 0.8, (x, i) => bottle(x + 0.35, yy, 2.2, ['#E8402A', '#3AA8E8', '#F2D24A', '#4AB86A', '#FFFFFF'][(i + yy | 0) % 5], { label: '#FFFFFF', cap: '#3A3A3A', lw: 0.06 })); } }
  for (const yy of [6, 10.4]) { shelf(0.6, yy, fx - 1.2, '#9AA8B0'); each(1, fx - 1, 1.3, (x, i) => R(x, yy - 2.6 + (i % 3) * 0.3, 1.1, 2.6 - (i % 3) * 0.3, ['#E84A3A', '#3A8AE8', '#F2C83A', '#4AB84A', '#F4F4F4', '#B84AE8'][(i * 7 + yy | 0) % 6], { s: 0.25, sx: 0.7, l: 0, lw: 0.1 })); }
  const y = counter(0.6, w * 0.4, h, '#3A3A3A', '#1C6FB8'); R(w * 0.06, y - 2.2, 2.6, 2.2, '#2A2A2A', { s: 0, l: 0.2, lw: 0.12 }); F(w * 0.06 + 0.3, y - 1.9, 2, 0.8, lit ? '#7AE8A0' : '#2A4A3A'); each(w * 0.2, w * 0.4, 1.2, (x, i) => R(x, y - 1.2, 1, 1.2, ['#F2C83A', '#E84A3A', '#4AB84A'][i % 3], { s: 0, l: 0, lw: 0.08 }));
  return w * 0.2;
}
