import { counter, ell, type Kit, poly, shelf } from './shop-interiors-kit';

// Intérieurs des boutiques (fleuriste → vélos). Même contrat que l'alimentation : fond, toFront(), premier plan, abscisse du vendeur.
const BRIGHT = ['#D63A2A', '#F2C933', '#E86AA0', '#8A4FC0', '#F08A24', '#2E8FD6'];
const SPINES = ['#B03A2E', '#2E6FA0', '#3A8A4A', '#D9A441', '#6A3FB5', '#E07A3A', '#2A2A2A', '#E8E0C8'];

export function florist(k: Kit): number {
  const { w, h, ct } = k;
  // Plantes vertes en hauteur, sur une tablette, avec des tiges qui retombent.
  k.each(0.05 * w, 0.95 * w, 3.5, 1.6, (x, i) => {
    k.circle(x + 0.8, 3.4, 1.3, i % 2 ? '#3E8A3A' : '#5DAA4A');
    k.circle(x + 0.2, 4, 0.8, '#4A9A3E');
    k.rect(x, 4.2, 1.6, 1.4, '#C0663A');
    k.line(x + 1.4, 5.6, x + 1.8, 8.4, '#3E8A3A', 0.35);
  });
  shelf(k, 0.03 * w, 5.6, 0.94 * w, '#9A6A3A');
  k.toFront();
  // Seaux de fleurs vives au sol.
  const span = Math.max(4, 0.6 * w);
  k.each(0.2, span, 2.8, 2.4, (x, i) => {
    const c = x + 1.2;
    for (const dx of [-0.7, 0, 0.7]) k.line(c, h - 4, c + dx, h - 7.6, '#3E7A2E', 0.25);
    k.circle(c - 0.7, h - 7.8, 0.75, BRIGHT[i % BRIGHT.length]!);
    k.circle(c + 0.7, h - 7.8, 0.75, BRIGHT[(i + 2) % BRIGHT.length]!);
    k.circle(c, h - 8.6, 0.75, BRIGHT[(i + 4) % BRIGHT.length]!);
    k.rect(x, h - 4, 2.4, 3.5, '#8C939C');
    k.rect(x, h - 4, 2.4, 0.5, '#B9C0C8');
  });
  // Table de travail : papier, un bouquet en cours.
  const x0 = Math.max(span, 0.66 * w);
  counter(k, x0, w - x0, '#B98A55', '#9A6A3A');
  k.path(poly([[x0 + 0.5, ct - 0.8], [x0 + 2.5, ct - 0.8], [x0 + 1.5, ct - 2.8]]), '#F2E8DA');
  k.circle(x0 + 1.5, ct - 3, 0.7, '#E86AA0');
  return x0 + (w - x0) * 0.55;
}

export function bookshop(k: Kit): number {
  const { w, h } = k;
  // Bibliothèques murales : dos colorés de hauteurs variées, un vide de temps en temps.
  for (const [r, y] of [4, 8, 12].entries()) {
    k.each(0.6, w - 0.6, 0.85, 0.7, (x, i) => {
      if ((i + r * 5) % 11 === 7) return;
      const bh = [2.6, 3, 2.3, 2.8][(i + r) % 4]!;
      k.rect(x, y - bh, 0.7, bh, SPINES[(i * 3 + r) % SPINES.length]!);
    });
    shelf(k, 0, y, w, '#6A4A2A');
  }
  k.rect(0, 0, 0.5, 12.6, '#6A4A2A');
  k.rect(w - 0.5, 0, 0.5, 12.6, '#6A4A2A');
  k.toFront();
  // Table des nouveautés avec des piles de livres.
  const x0 = 0.08 * w;
  const tw = Math.max(5, 0.48 * w);
  k.rect(x0, h - 6.5, tw, 0.8, '#7A5230');
  k.rect(x0 + 0.4, h - 5.7, 0.6, 5.2, '#5A3A20');
  k.rect(x0 + tw - 1, h - 5.7, 0.6, 5.2, '#5A3A20');
  k.each(x0 + 0.4, x0 + tw - 0.4, 3, 2.2, (x, i) => {
    for (let s = 0; s < 2 + (i % 2); s++) k.rect(x + (s % 2) * 0.2, h - 7.2 - s * 0.7, 2, 0.7, SPINES[(i + s * 2) % SPINES.length]!);
  });
  return 0.8 * w;
}

export function records(k: Kit): number {
  const { w, h, ct } = k;
  // Pochettes accrochées au mur (carré coloré, rond du disque).
  k.each(0.4, w - 0.4, 3.2, 2.6, (x, i) => {
    k.rect(x, 1.2, 2.6, 2.6, BRIGHT[(i * 2) % BRIGHT.length]!);
    k.circle(x + 1.3, 2.5, 0.7, '#1A1A1A');
  });
  k.toFront();
  // Bacs de vinyles : dossier clair, tranches noires serrées.
  const span = Math.max(4.5, 0.55 * w);
  k.rect(0.3, h - 7.6, span - 0.3, 2.8, '#C8A070');
  k.each(0.6, span - 0.3, 0.6, 0.35, (x, i) => k.rect(x, h - 7.2 + (i % 3) * 0.2, 0.35, 2.4, '#111111'));
  k.rect(0.3, h - 5, span - 0.3, 4.5, '#8A6238');
  k.rect(0.3, h - 3.2, span - 0.3, 0.3, '#5A3A20');
  // Comptoir et platine (disque noir, bras).
  const x0 = Math.max(span, 0.6 * w);
  counter(k, x0, w - x0, '#2A2A30', '#FF6A3D');
  const px = x0 + 0.3;
  k.rect(px, ct - 1.8, 3.4, 1, '#C8C8C8');
  k.path(ell(px + 1.5, ct - 1.9, 1.3, 0.4), '#111111');
  k.line(px + 3, ct - 2.2, px + 2.2, ct - 1.9, '#E8E8E8', 0.25);
  return x0 + (w - x0) * 0.65;
}

export function games(k: Kit): number {
  const { w, h } = k;
  // Boîtes de jeux empilées en couleurs sur deux étagères.
  for (const [r, y] of [4.2, 8.8].entries()) {
    k.each(0.05 * w, 0.95 * w, 3.4, 3, (x, i) => {
      for (let s = 0; s < 2 + ((i + r) % 2); s++) k.rect(x + (s % 2) * 0.2, y - 1 - s, 2.8, 1, BRIGHT[(i + s * 3 + r) % BRIGHT.length]!);
    });
    shelf(k, 0.03 * w, y, 0.94 * w, '#6A3FB5');
  }
  k.toFront();
  // Table de démo : plateau de jeu, pions, un dé.
  const x0 = 0.08 * w;
  const tw = Math.max(5.5, 0.52 * w);
  k.rect(x0, h - 7, tw, 0.9, '#9A6A3A');
  k.rect(x0 + 0.4, h - 6.1, 0.6, 5.6, '#6A4224');
  k.rect(x0 + tw - 1, h - 6.1, 0.6, 5.6, '#6A4224');
  k.rect(x0 + 0.6, h - 7.5, tw - 1.2, 0.5, '#3A8A4A', { stroke: '#F2F2F2', sw: 0.15 });
  k.each(x0 + 1, x0 + tw - 1.4, 1.6, 0.8, (x, i) => k.circle(x + 0.4, h - 8, 0.45, BRIGHT[(i + 1) % BRIGHT.length]!));
  k.rect(x0 + tw - 1.4, h - 8.4, 0.9, 0.9, '#F8F8F8', { stroke: '#2A2A2A', sw: 0.1 });
  return 0.8 * w;
}

export function optician(k: Kit): number {
  const { w, f } = k;
  // Présentoirs muraux clairs : rangées de lunettes (deux verres, un pont).
  const pw = Math.max(5, 0.6 * w);
  k.rect(0.3, 1.5, pw, 9, '#F8FAFC', { stroke: '#C3C9DA', sw: 0.3 });
  for (const y of [3, 5.5, 8]) {
    k.each(0.8, pw - 0.2, 2.6, 2.2, (x, i) => {
      const c = ['#1A1A1A', '#8A2A2A', '#2A4A8A'][i % 3]!;
      k.circle(x + 0.55, y, 0.5, 'none', { stroke: c, sw: 0.25 });
      k.circle(x + 1.65, y, 0.5, 'none', { stroke: c, sw: 0.25 });
      k.line(x + 1.05, y - 0.1, x + 1.15, y - 0.1, c, 0.2);
    });
  }
  // Miroir en pied.
  if (w >= 12) {
    const mx = 0.88 * w;
    k.rect(mx - 1, 2, 2, f - 2.5, '#C9D6DE', { stroke: '#7A8A96', sw: 0.3 });
    k.line(mx - 0.4, 3, mx + 0.2, 6, '#FFFFFF', 0.25, { op: 0.8 });
  }
  k.toFront();
  counter(k, 0.15 * w, Math.max(4, 0.6 * w), '#243B8A', '#EEF1F8');
  return 0.45 * w;
}

export function thrift(k: Kit): number {
  const { w, h, f } = k;
  // Portant : barre, montants, vêtements de couleurs variées.
  const span = Math.max(5, 0.62 * w);
  k.line(0.4, 4, span, 4, '#7A7A7A', 0.4);
  k.line(0.6, 4, 0.6, h - 0.6, '#7A7A7A', 0.4);
  k.line(span - 0.2, 4, span - 0.2, h - 0.6, '#7A7A7A', 0.4);
  k.each(1, span - 0.4, 1.6, 1.4, (x, i) => {
    k.line(x + 0.7, 4, x + 0.7, 4.8, '#4A4A4A', 0.2);
    k.rect(x, 4.8, 1.4, i % 3 === 1 ? 8.5 : 6, ['#C0392B', '#2E6FA0', '#E0A21E', '#5A8A3A', '#8A4FC0', '#E86AA0', '#3A3A44'][i % 7]!);
  });
  // Miroir sur pied.
  if (w >= 12) {
    const mx = 0.9 * w;
    k.rect(mx - 1.1, 5, 2.2, 8, '#C9D6DE', { rx: 1, stroke: '#8A6238', sw: 0.4 });
    k.line(mx - 1, f + 2, mx, 13, '#8A6238', 0.4);
    k.line(mx + 1, f + 2, mx, 13, '#8A6238', 0.4);
  }
  k.toFront();
  // Panier d'osier plein de foulards.
  const bx = Math.min(w - 3.2, span + 0.4);
  k.circle(bx + 0.8, h - 4.2, 0.8, '#E0A21E');
  k.circle(bx + 2, h - 4.4, 0.8, '#2E8FD6');
  k.rect(bx, h - 4, 3, 3.5, '#B08850');
  k.rect(bx, h - 2.6, 3, 0.3, '#8A6238');
  return Math.min(w - 2.5, span + 2);
}

export function antiques(k: Kit): number {
  const { w, h } = k;
  // Lustre au plafond : tige, bras dorés, bougies.
  const lx = 0.5 * w;
  k.line(lx, 0, lx, 2, '#C9A23A', 0.3);
  k.path(`M${lx - 2.4} 2 Q${lx} 4 ${lx + 2.4} 2`, 'none', { stroke: '#C9A23A', sw: 0.35 });
  for (const dx of [-2.4, 0, 2.4]) {
    k.rect(lx + dx - 0.2, dx === 0 ? 2.2 : 1.2, 0.4, 0.8, '#F2E8DA');
    k.circle(lx + dx, dx === 0 ? 1.9 : 0.9, 0.3, k.lit ? '#FFC34A' : '#C9A23A', { on: k.lit });
  }
  // Tableau dans un cadre doré.
  const pw = Math.max(3, 0.24 * w);
  k.rect(0.06 * w, 4, pw, 4.6, '#C9A23A');
  k.rect(0.06 * w + 0.5, 4.5, pw - 1, 3.6, '#4A6A5A');
  k.path(poly([[0.06 * w + 0.5, 8.1], [0.06 * w + pw * 0.45, 5.6], [0.06 * w + pw - 0.5, 8.1]]), '#7A8A5A');
  // Horloge comtoise.
  if (w >= 12) {
    const cx = 0.86 * w;
    k.rect(cx - 1.2, 2.4, 2.4, h - 2.9, '#6A3A1E');
    k.circle(cx, 4.4, 1, '#F2E8C8', { stroke: '#C9A23A', sw: 0.25 });
    k.line(cx, 4.4, cx + 0.5, 4, '#1A1A1A', 0.15);
    k.rect(cx - 0.6, 7, 1.2, 7, '#3A2010');
    k.line(cx, 7.2, cx, 12, '#C9A23A', 0.15);
    k.circle(cx, 12.4, 0.5, '#C9A23A');
  }
  k.toFront();
  // Commode ancienne : tiroirs, poignées dorées, pieds galbés.
  const x0 = 0.05 * w;
  const cw = Math.max(4.5, 0.4 * w);
  k.rect(x0, h - 7.6, cw, 0.6, '#5A2E14');
  k.rect(x0 + 0.2, h - 7, cw - 0.4, 5.2, '#7A4A28');
  for (const y of [h - 6.3, h - 4.3]) {
    k.rect(x0 + 0.6, y, cw - 1.2, 1.6, '#8A5A34', { stroke: '#4A2410', sw: 0.15 });
    k.circle(x0 + cw / 2, y + 0.8, 0.25, '#C9A23A');
  }
  k.path(`M${x0 + 0.2} ${h - 1.8} Q${x0 + 0.2} ${h - 0.5} ${x0 + 0.8} ${h - 0.5} L${x0 + 1.2} ${h - 1.8}Z`, '#5A2E14');
  k.path(`M${x0 + cw - 0.2} ${h - 1.8} Q${x0 + cw - 0.2} ${h - 0.5} ${x0 + cw - 0.8} ${h - 0.5} L${x0 + cw - 1.2} ${h - 1.8}Z`, '#5A2E14');
  return 0.62 * w;
}

export function petshop(k: Kit): number {
  const { w, h } = k;
  // Aquariums lumineux sur une tablette : eau bleue, plantes, poissons orange.
  const span = Math.max(5, 0.62 * w);
  k.each(0.4, span, 6.4, Math.min(6, span - 0.4), (x) => {
    const aw = Math.min(6, span - 0.4);
    k.rect(x, 2.6, aw, 5.4, k.lit ? '#5CC8F2' : '#3A8FBF', { on: k.lit, stroke: '#1A1A1A', sw: 0.3 });
    k.line(x + 0.8, 8, x + 0.6, 5.4, '#3E8A3A', 0.35);
    k.line(x + aw - 0.8, 8, x + aw - 0.6, 5.8, '#3E8A3A', 0.35);
    for (const [fx, fy] of [[0.35, 4.4], [0.6, 6.2]] as const) {
      const px = x + aw * fx;
      k.path(`M${px} ${fy} Q${px + 0.7} ${fy - 0.5} ${px + 1.3} ${fy} Q${px + 0.7} ${fy + 0.5} ${px} ${fy}Z M${px} ${fy} L${px - 0.5} ${fy - 0.4} L${px - 0.5} ${fy + 0.4}Z`, '#F08A24', { on: k.lit });
    }
  });
  shelf(k, 0, 8, span + 0.4, '#5A5A60');
  // Cage à oiseau (barreaux, perchoir, oiseau jaune).
  if (w >= 14) {
    const cx = 0.82 * w;
    k.path(`M${cx - 2} 9 L${cx - 2} 4.4 Q${cx} 2 ${cx + 2} 4.4 L${cx + 2} 9Z`, 'none', { stroke: '#8C939C', sw: 0.3 });
    for (const dx of [-1, 0, 1]) k.line(cx + dx, 3.6, cx + dx, 9, '#8C939C', 0.2);
    k.circle(cx - 0.4, 6.8, 0.6, '#F2C933');
    k.rect(cx - 2.2, 9, 4.4, 0.5, '#5A5A60');
  }
  k.toFront();
  // Sacs de croquettes au sol (étiquette blanche).
  k.each(0.3, span, 3, 2.4, (x, i) => {
    k.rect(x, h - 5.4, 2.4, 4.9, ['#C0392B', '#2E6FA0', '#E0A21E'][i % 3]!, { rx: 0.4 });
    k.rect(x + 0.5, h - 4, 1.4, 1.2, '#F8F8F8');
  });
  return Math.min(w - 2.5, span + 2.6);
}

export function bikes(k: Kit): number {
  const { w, h, ct } = k;
  // Vélos suspendus au mur : deux roues, cadre en triangle, guidon. Taille ajustée aux vitrines étroites.
  const s = Math.min(1, (w - 1) / 8);
  const frames = ['#C0392B', '#2E6FA0', '#3A8A4A', '#E0A21E'];
  k.each(0.4, w, 9 * s, 8 * s, (x, i) => {
    const y = 5.2;
    const r = 1.8 * s;
    const a = x + 2 * s;
    const b = x + 6 * s;
    k.circle(a, y, r, 'none', { stroke: '#1A1A1A', sw: 0.4 });
    k.circle(b, y, r, 'none', { stroke: '#1A1A1A', sw: 0.4 });
    const c = frames[i % frames.length]!;
    k.path(`M${a} ${y} L${x + 4 * s} ${y} L${x + 5.2 * s} ${y - 2.4 * s} L${x + 3.2 * s} ${y - 2.4 * s}Z M${x + 5.2 * s} ${y - 2.4 * s} L${b} ${y} M${x + 4 * s} ${y} L${x + 3 * s} ${y - 3 * s}`, 'none', { stroke: c, sw: 0.4 });
    k.line(x + 5 * s, y - 2.9 * s, x + 5.8 * s, y - 3 * s, '#1A1A1A', 0.3);
    k.line(x + 2.6 * s, y - 3 * s, x + 3.4 * s, y - 3 * s, '#1A1A1A', 0.4);
  });
  // Panneau d'outils au-dessus de l'établi.
  const x0 = Math.max(4, 0.52 * w);
  k.rect(x0, 8.2, w - x0, 3, '#C9A86A');
  k.each(x0 + 0.5, w - 0.3, 1.6, 0.6, (x, i) => (i % 2 ? k.line(x + 0.3, 8.6, x + 0.3, 10.8, '#5A5A60', 0.35) : k.path(`M${x} 8.8 L${x + 0.6} 8.8 L${x + 0.45} 10.8 L${x + 0.15} 10.8Z`, '#8C939C')));
  k.toFront();
  // Établi (plateau, pieds, étau) et une roue posée au sol.
  k.rect(x0, ct, w - x0, 1, '#8A5A30');
  k.rect(x0 + 0.4, ct + 1, 0.6, h - 0.5 - (ct + 1), '#5A3A20');
  k.rect(w - 1, ct + 1, 0.6, h - 0.5 - (ct + 1), '#5A3A20');
  k.rect(x0 + 0.6, ct - 1, 1.4, 1, '#5A5A60');
  const wx = Math.max(2.4, 0.2 * w);
  k.circle(wx, h - 2.8, 2.2, 'none', { stroke: '#1A1A1A', sw: 0.5 });
  k.circle(wx, h - 2.8, 0.4, '#8C939C');
  return x0 + (w - x0) * 0.55;
}
