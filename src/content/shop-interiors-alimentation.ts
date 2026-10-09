import { counter, type Kit, poly, shelf } from './shop-interiors-kit';

// Intérieurs de l'alimentation (boulangerie → supérette). Chaque fonction dessine le fond, bascule au premier plan (toFront)
// pour le comptoir, et rend l'abscisse du vendeur. Hauteur de vitrine ≈ 21 : f = 18 (sol), ct = 12 (plateau du comptoir).
const CAKES = ['#E58FB0', '#6B3A22', '#F2D27A', '#C0392B', '#F5E6C4'];
const BOXES = ['#C0392B', '#2E6FA0', '#E0A21E', '#3A8A4A', '#E07A3A', '#6A3FB5', '#F2F2F2', '#D63A6A'];
const FRUITS = ['#D63A2A', '#F08A24', '#5DAA3A', '#F2C933'];

export function bakery(k: Kit): number {
  const { w, ct } = k;
  // Deux panières inclinées au mur, pleines de baguettes dorées penchées.
  for (const y of [1, 6]) {
    k.each(0.6, w - 1.2, 1.3, 1.4, (x) => k.line(x, y + 3.6, x + 1.4, y + 0.3, '#D9A441', 1));
    k.path(poly([[0, y + 4.4], [w, y + 4.4], [w, y + 2.8], [0, y + 3.2]]), '#9A6A32');
  }
  k.toFront();
  // Comptoir vitré bas : gâteaux ronds colorés derrière la vitre.
  const x0 = 0.12 * w;
  k.rect(x0, ct + 4, w - x0, k.h - 0.5 - (ct + 4), '#B98A55');
  k.rect(x0, ct, w - x0, 4, '#CFE8F0', { op: 0.75 });
  k.each(x0 + 0.6, w - 0.4, 2.6, 2.2, (x, i) => k.circle(x + 1.1, ct + 2.6, 1.1, CAKES[i % CAKES.length]!));
  k.rect(x0, ct - 0.6, w - x0, 0.6, '#7A5230');
  return 0.6 * w;
}

export function pastry(k: Kit): number {
  const { w, h, f } = k;
  k.toFront();
  // Pièce montée sur un côté (trois étages de choux crème, sujet rose au sommet).
  const cx = Math.max(2, 0.12 * w);
  for (const [i, tw] of [4, 3, 2].entries()) k.rect(cx - tw / 2, f - 2.4 * (i + 1), tw, 2.4, i % 2 ? '#EBD3A4' : '#F7EBD0', { rx: 0.5 });
  k.circle(cx, f - 7.8, 0.7, '#F28DB2');
  // Présentoir réfrigéré à deux étages : vitre bleutée, gâteaux rose / chocolat / crème.
  const x0 = 0.3 * w;
  k.rect(x0, 16, w - x0, h - 16.5, '#F4F4F4');
  k.rect(x0, 9, w - x0, 7, '#BFE3F0', { op: 0.55 });
  for (const y of [12.4, 15.6]) {
    k.rect(x0, y, w - x0, 0.5, '#9FB4BE');
    k.each(x0 + 0.5, w - 0.3, 2.2, 1.6, (x, i) => k.rect(x, y - 1.6, 1.6, 1.6, ['#F28DB2', '#5A3020', '#F5E6C4'][(i + (y > 13 ? 1 : 0)) % 3]!, { rx: 0.3 }));
  }
  k.rect(x0, 8.5, w - x0, 0.6, '#D0D8DC');
  return 0.65 * w;
}

export function chocolatier(k: Kit): number {
  const { w, ct } = k;
  // Étagères murales de boîtes marron et or (ruban sur les boîtes dorées).
  for (const y of [3.4, 8]) {
    k.each(0.06 * w, 0.94 * w, 2, 1.6, (x, i) => {
      k.rect(x, y - 2, 1.6, 2, i % 2 ? '#D4A537' : '#5A3020');
      if (i % 2) k.rect(x + 0.6, y - 2, 0.4, 2, '#8A2A2A');
    });
    shelf(k, 0.04 * w, y, 0.92 * w, '#3A2014');
  }
  k.toFront();
  counter(k, 0.15 * w, 0.85 * w, '#3E2416', '#C9A15A');
  // Cloche de verre sur le comptoir, un gâteau dessous.
  const cx = Math.max(2.4, 0.3 * w);
  k.rect(cx - 1.2, ct - 2, 2.4, 1.2, '#4A2414');
  k.path(`M${cx - 2} ${ct - 0.8} A2 2.4 0 0 1 ${cx + 2} ${ct - 0.8}Z`, '#E8F4F8', { op: 0.5, stroke: '#FFFFFF', sw: 0.3 });
  k.circle(cx, ct - 3.4, 0.4, '#C9A15A');
  return 0.62 * w;
}

export function butcher(k: Kit): number {
  const { w, h, f, ct } = k;
  // Carrelage blanc (joints gris clair).
  for (let y = 2; y < f; y += 2) k.line(0, y, w, y, '#D2CAC2', 0.2);
  for (let x = 2; x < w; x += 2) k.line(x, 0, x, f, '#D2CAC2', 0.2);
  // Crochets et jambons au mur.
  k.rect(0, 1, w, 0.5, '#6A6A6A');
  k.each(0.6, w - 0.4, 4, 2.4, (x) => {
    const c = x + 1.2;
    k.line(c, 1.4, c, 2.6, '#6A6A6A', 0.3);
    k.path(`M${c} 2.6 Q${c + 1.6} 5 ${c + 0.7} 7.2 Q${c} 8 ${c - 0.7} 7.2 Q${c - 1.6} 5 ${c} 2.6Z`, '#A0442E');
    k.circle(c, 2.9, 0.4, '#F2E8DA');
  });
  k.toFront();
  // Billot sur pieds, à gauche.
  const bw = Math.max(3, 0.2 * w);
  k.rect(0.03 * w, h - 8, bw, 2.6, '#B07A44');
  k.rect(0.03 * w, h - 8, bw, 0.5, '#D2A26A');
  k.rect(0.03 * w + 0.4, h - 5.4, 0.7, 4.9, '#6A4224');
  k.rect(0.03 * w + bw - 1.1, h - 5.4, 0.7, 4.9, '#6A4224');
  // Vitrine réfrigérée rouge et blanc, morceaux de viande derrière la vitre.
  const x0 = 0.3 * w;
  k.rect(x0, ct + 3.5, w - x0, h - 0.5 - (ct + 3.5), '#B8282C');
  k.rect(x0, ct + 3.5, w - x0, 1, '#FFFFFF');
  k.rect(x0, ct, w - x0, 3.5, '#E6F2F6', { op: 0.7 });
  k.each(x0 + 0.5, w - 0.3, 2.2, 1.8, (x, i) => k.rect(x, ct + 1.8, 1.8, 1.4, i % 2 ? '#E07A6E' : '#C0392B', { rx: 0.5 }));
  k.rect(x0, ct - 0.5, w - x0, 0.5, '#F2F2F2');
  return 0.62 * w;
}

export function fishmonger(k: Kit): number {
  const { w, h, ct } = k;
  // Ardoise des prix (cadre bois, lignes à la craie).
  const aw = Math.max(3, 0.22 * w);
  k.rect(0.06 * w, 1.5, aw, 5, '#2A2E30', { stroke: '#8A5A30', sw: 0.4 });
  for (const y of [2.8, 4, 5.2]) k.rect(0.06 * w + 0.6, y, aw * 0.6, 0.35, '#EDEDED');
  k.toFront();
  // Étal incliné de glace pilée, poissons gris-bleu sur deux rangs, rondelles de citron.
  const x0 = 0.25 * w;
  k.rect(x0, ct + 4, w - x0, h - 0.5 - (ct + 4), '#5E7C8C');
  k.path(poly([[x0, ct + 4], [w, ct + 4], [w, ct - 1], [x0 + 1, ct - 1]]), '#EEF6FA');
  for (const [r, y] of [ct + 0.4, ct + 2.4].entries()) {
    k.each(x0 + 1 + r * 1.4, w - 0.2, 3.2, 2.8, (x, i) => {
      k.path(`M${x} ${y} Q${x + 1} ${y - 0.9} ${x + 2} ${y} L${x + 2.8} ${y - 0.7} L${x + 2.8} ${y + 0.7} L${x + 2} ${y} Q${x + 1} ${y + 0.9} ${x} ${y}Z`, i % 2 ? '#7A8FA6' : '#5F7590');
      k.circle(x + 0.5, y - 0.1, 0.18, '#1A1A1A');
    });
  }
  k.circle(w - 1.2, ct - 0.3, 0.6, '#F2D33A');
  return 0.6 * w;
}

export function cheese(k: Kit): number {
  const { w, ct } = k;
  // Meules jaunes empilées sur deux étagères.
  const tints = ['#E8C04A', '#F2D98A', '#D9A83A'];
  for (const y of [4.6, 9.4]) {
    k.each(0.05 * w, 0.95 * w, 2.8, 2.4, (x, i) => {
      k.rect(x, y - 1.6, 2.4, 1.6, tints[i % 3]!, { rx: 0.6 });
      if (i % 2 === 0) k.rect(x + 0.2, y - 3.2, 2, 1.6, tints[(i + 1) % 3]!, { rx: 0.6 });
    });
    shelf(k, 0.03 * w, y, 0.94 * w, '#8A6A3A');
  }
  k.toFront();
  counter(k, 0.08 * w, 0.88 * w, '#C9A86A', '#8A6A3A');
  // Cloche de verre, et une meule entamée (face coupée plus pâle).
  const cx = Math.max(2.2, 0.22 * w);
  k.rect(cx - 1, ct - 1.8, 2, 1, '#F2D98A');
  k.path(`M${cx - 1.8} ${ct - 0.8} A1.8 2.2 0 0 1 ${cx + 1.8} ${ct - 0.8}Z`, '#E8F4F8', { op: 0.5, stroke: '#FFFFFF', sw: 0.3 });
  if (w >= 14) {
    const x = 0.75 * w;
    k.rect(x - 1.6, ct - 2.6, 3.2, 1.8, '#E8C04A', { rx: 0.5 });
    k.path(poly([[x + 0.4, ct - 2.6], [x + 1.6, ct - 2.6], [x + 1.6, ct - 0.8]]), '#F7E6A8');
  }
  return 0.55 * w;
}

export function greengrocer(k: Kit): number {
  const { w, h, ct } = k;
  // Cagettes en gradins (du fond vers l'avant) : tomates, oranges, salades, citrons.
  const span = Math.max(5, 0.7 * w);
  k.rect(0, 12, span, h - 12.5, '#7A5A34');
  for (let tier = 0; tier < 3; tier++) {
    const y = 9 + tier * 3.2;
    k.each(0.2 + (tier % 2) * 0.8, span, 3.6, 3.4, (x, i) => {
      const c = FRUITS[(i + tier) % FRUITS.length]!;
      for (const fx of [0.8, 1.7, 2.6]) k.circle(x + fx, y + 1, 0.75, c);
      k.rect(x, y + 1.4, 3.4, 1.6, '#C08A50');
      k.rect(x, y + 2.1, 3.4, 0.25, '#8A6236');
    });
  }
  k.toFront();
  // Petit comptoir et balance à plateau.
  const x0 = Math.max(span, 0.74 * w);
  counter(k, x0, w - x0, '#5A8A3A', '#3E6A28');
  const bx = x0 + 0.4;
  k.rect(bx, ct - 2, 2.2, 1.2, '#D8D8D8', { stroke: '#7A7A7A', sw: 0.2 });
  k.path(`M${bx - 0.2} ${ct - 2.4} Q${bx + 1.1} ${ct - 1.6} ${bx + 2.4} ${ct - 2.4}Z`, '#B9C0C8');
  return x0 + (w - x0) * 0.6;
}

export function wine(k: Kit): number {
  const { w, h } = k;
  // Casiers en losanges (lattes à 45°) et bouteilles couchées, vertes et bordeaux, au cœur des losanges.
  k.rect(0, 1, w, 11.6, '#3A1A22');
  for (let c = -12; c <= w + 12; c += 3) {
    k.line(c + 1.5, 1.5, c + 12, 12, '#B07A4A', 0.4);
    k.line(c - 1.5, 1.5, c - 12, 12, '#B07A4A', 0.4);
  }
  for (let j = 2; j * 1.5 <= 10.5; j++) {
    for (let i = (j + 1) % 2; i * 1.5 <= w - 0.8; i += 2) {
      if (i * 1.5 < 0.8) continue;
      k.circle(i * 1.5, j * 1.5, 0.6, (i + j) % 4 < 2 ? '#3E8A3A' : '#8A1A2E');
      k.circle(i * 1.5 - 0.15, j * 1.5 - 0.15, 0.2, '#E8E0C8');
    }
  }
  k.rect(0, 0.6, w, 0.7, '#5A3A22');
  k.rect(0, 12, w, 0.7, '#5A3A22');
  k.toFront();
  // Tonneau servant de table : cerclages, plateau, une bouteille et un verre dessus.
  const cx = Math.max(3.2, 0.32 * w);
  k.rect(cx - 2.5, h - 7, 5, 6.5, '#8A5A30', { rx: 1.2 });
  for (const y of [h - 6, h - 2.2]) k.rect(cx - 2.5, y, 5, 0.5, '#3A2A1A');
  k.rect(cx - 3.2, h - 7.6, 6.4, 0.7, '#6A4224');
  k.rect(cx - 1.4, h - 10.4, 0.8, 2.8, '#2F6A2A');
  k.rect(cx - 1.2, h - 11.2, 0.4, 0.8, '#2F6A2A');
  k.path(`M${cx + 0.8} ${h - 9.4} L${cx + 1.8} ${h - 9.4} L${cx + 1.3} ${h - 8.4}Z`, '#8A1A2A');
  return 0.74 * w;
}

export function grocery(k: Kit): number {
  const { w, ct } = k;
  // Rayonnages pleins de petites boîtes colorées.
  for (const [r, y] of [3.5, 7, 10.5].entries()) {
    k.each(0.04 * w, 0.96 * w, 1.5, 1.2, (x, i) => k.rect(x, y - (i % 3 === 1 ? 2.4 : 1.8), 1.2, i % 3 === 1 ? 2.4 : 1.8, BOXES[(i + r * 3) % BOXES.length]!));
    shelf(k, 0, y, w, '#8A6A44');
  }
  k.toFront();
  // Caisse avec écran.
  const x0 = 0.6 * w;
  counter(k, x0, w - x0, '#C2701F', '#8A4A14');
  k.rect(x0 + 0.4, ct - 2.2, 2.4, 1.4, '#3A3A40');
  k.rect(x0 + 0.8, ct - 3.8, 1.6, 1.4, k.lit ? '#9FE0FF' : '#5A8AA6', { on: k.lit, stroke: '#2A2A2A', sw: 0.2 });
  return 0.84 * w;
}

export function minimarket(k: Kit): number {
  const { w, h, ct } = k;
  // Rayonnages à gauche, frigos verticaux lumineux à droite (plus clairs quand la boutique est éclairée).
  const split = 0.45 * w;
  for (const [r, y] of [5, 9.5].entries()) {
    k.each(0.3, split - 0.3, 1.5, 1.2, (x, i) => k.rect(x, y - 2, 1.2, 2, BOXES[(i + r * 2) % BOXES.length]!));
    shelf(k, 0, y, split, '#8A93A0');
  }
  const fw = Math.min(4.4, w - split - 0.3);
  k.each(split + 0.3, w, fw + 0.4, fw, (x) => {
    k.rect(x, 1.5, fw, h - 2, '#D7DDE3');
    k.rect(x + 0.4, 2, fw - 0.8, h - 3.6, k.lit ? '#DDF4FF' : '#8FB8CF', { on: k.lit });
    for (const [r, y] of [5, 8.5, 12, 15.5].entries()) {
      k.rect(x + 0.4, y, fw - 0.8, 0.3, '#A9B8C4');
      for (let b = 0; 0.6 + b * 0.85 + 0.55 <= fw - 0.4; b++) k.rect(x + 0.6 + b * 0.85, y - 1.9, 0.55, 1.9, BOXES[(b + r) % BOXES.length]!);
    }
  });
  k.toFront();
  // Caisse au premier plan à gauche.
  counter(k, 0, Math.max(4, 0.38 * w), '#1C6FB8', '#E8EEF4');
  k.rect(0.6, ct - 2, 2, 1.2, '#3A3A40');
  return Math.max(2.5, 0.2 * w);
}
