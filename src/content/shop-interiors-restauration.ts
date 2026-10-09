import { bistroTable, counter, ell, type Kit, poly, shelf } from './shop-interiors-kit';

// Intérieurs de la restauration (café → salon de thé). Même contrat : fond, toFront(), premier plan, abscisse du vendeur.

export function cafe(k: Kit): number {
  const { w, ct } = k;
  // Étagère derrière le comptoir : tasses retournées et bouteilles de sirop.
  const x0 = Math.max(3, 0.5 * w);
  k.each(x0 + 0.4, w - 0.3, 1.4, 0.9, (x, i) => (i % 3 === 2 ? k.rect(x, 1.4, 0.8, 2.6, '#C0392B') : k.rect(x, 3, 0.9, 1, '#F8F8F8')));
  shelf(k, x0, 4, w - x0, '#5A3A20');
  k.toFront();
  // Deux petites tables rondes avec chaises (une seule si la vitrine est étroite).
  const t1 = Math.max(2.4, 0.12 * w);
  bistroTable(k, t1, null, '#5A3A20');
  if (t1 + 9 < x0) bistroTable(k, t1 + 7.4, null, '#5A3A20');
  // Comptoir, percolateur chromé (tasse sous le bec), tasses.
  counter(k, x0, w - x0, '#7A3E2A', '#C9A06A');
  const px = x0 + 0.4;
  k.rect(px, ct - 3.6, 3, 2.8, '#C9D1D8', { stroke: '#7A8A96', sw: 0.2 });
  k.path(`M${px + 0.3} ${ct - 3.6} Q${px + 1.5} ${ct - 5} ${px + 2.7} ${ct - 3.6}Z`, '#B9C0C8');
  k.circle(px + 1.5, ct - 4.6, 0.35, '#1A1A1A');
  k.rect(px + 1.2, ct - 1.6, 0.8, 0.8, '#F8F8F8');
  k.each(px + 3.6, w - 0.4, 1.4, 0.9, (x) => k.rect(x, ct - 1.6, 0.9, 0.8, '#F8F8F8'));
  return x0 + (w - x0) * 0.62;
}

export function restaurant(k: Kit): number {
  const { w, h } = k;
  // Tableau noir du menu (cadre bois, lignes à la craie).
  const bw = Math.max(3, 0.22 * w);
  k.rect(0.06 * w, 1.5, bw, 5.5, '#24302A', { stroke: '#8A5A30', sw: 0.4 });
  for (const y of [2.8, 4, 5.2]) k.rect(0.06 * w + 0.6, y, (bw - 1.2) * (y === 4 ? 0.6 : 0.85), 0.35, '#EDEDED');
  // Un cadre au mur.
  if (w >= 20) k.rect(0.5 * w, 2, 3, 3.4, '#C9A23A', { stroke: '#7A5A20', sw: 0.3 });
  k.toFront();
  // Tables nappées de blanc, chaises, bougie au centre (flamme allumée quand la salle l'est).
  const end = Math.max(7, 0.8 * w);
  k.each(1, end, 9, 6, (x) => {
    const cx = x + 2.4;
    bistroTable(k, cx, '#FAFAFA', '#6A3A20');
    k.rect(cx - 0.25, h - 9.2, 0.5, 1.6, '#F2E8DA');
    if (k.lit) {
      k.circle(cx, h - 9.8, 1.4, '#FFC34A', { on: true, op: 0.3 });
      k.circle(cx, h - 9.6, 0.45, '#FFC34A', { on: true });
    }
  });
  return 0.88 * w;
}

export function pizzeria(k: Kit): number {
  const { w, h, ct } = k;
  // Four à bois en dôme de briques sur un socle de pierre, bouche orange (plus vive quand la salle est allumée).
  const ow = Math.max(6, Math.min(12, 0.5 * w));
  const x0 = Math.min(0.04 * w, w - ow);
  const cx = x0 + ow / 2;
  k.rect(cx - 0.8, 0, 1.6, 4, '#8C8478');
  k.path(`M${x0} ${ct} A${ow / 2} ${ct - 3} 0 0 1 ${x0 + ow} ${ct}Z`, '#B5532E');
  for (const y of [6, 8.5, 10.5]) k.line(x0 + 0.8, y, x0 + ow - 0.8, y, '#8A3A1E', 0.2);
  k.path(`M${cx - ow * 0.22} ${ct} A${ow * 0.22} 2.6 0 0 1 ${cx + ow * 0.22} ${ct}Z`, k.lit ? '#FFA03A' : '#E8701C', { on: k.lit });
  k.rect(x0, ct, ow, k.h - 0.5 - ct, '#8C8478');
  k.toFront();
  // Comptoir et pizza posée sur la pelle.
  const c0 = Math.max(0.45 * w, Math.min(x0 + ow, w - 5));
  counter(k, c0, w - c0, '#C8352B', '#F3DCC0');
  const px = c0 + Math.min(3, (w - c0) / 2);
  k.line(px + 1.6, ct - 1, Math.min(w - 0.3, px + 5), ct - 1, '#8A5A30', 0.4);
  k.path(ell(px, ct - 1.1, 1.8, 0.5), '#E8B04A');
  k.path(ell(px, ct - 1.2, 1.4, 0.35), '#C0392B');
  k.circle(px - 0.5, ct - 1.3, 0.2, '#F8F2D8');
  k.circle(px + 0.6, ct - 1.2, 0.2, '#3E7A2E');
  return Math.min(w - 2.5, c0 + (w - c0) * 0.7);
}

export function kebab(k: Kit): number {
  const { w, ct } = k;
  // Écran menu au mur : photos de plats (couleurs vives si la salle est allumée).
  const sx = Math.max(4.6, 0.42 * w);
  k.rect(sx, 1.2, w - sx - 0.4, 4.2, '#1A1A1A');
  k.each(sx + 0.4, w - 0.8, 2.2, 1.8, (x, i) => {
    k.rect(x, 1.6, 1.8, 2, ['#E0A21E', '#C0392B', '#5DAA3A'][i % 3]!, { on: k.lit });
    k.rect(x, 4, 1.8, 0.5, '#F8F8F8', { on: k.lit });
  });
  // Broche verticale : tige, cylindre de viande, résistance qui rougeoie derrière.
  const cx = Math.max(2.4, 0.18 * w);
  k.rect(cx - 2, 3, 0.8, 9, k.lit ? '#FF7A2A' : '#A8502A', { on: k.lit });
  k.line(cx, 1.6, cx, ct, '#8C939C', 0.3);
  k.path(`M${cx - 1.4} 3.6 L${cx + 1.4} 3.6 L${cx + 1} 11 L${cx - 1} 11Z`, '#8A4A22');
  for (const y of [5, 7, 9]) k.line(cx - 1.2, y, cx + 1.1, y + 0.4, '#5A2A10', 0.3);
  k.toFront();
  // Comptoir, vitre, bacs de garnitures (salade, tomate, oignon, sauce).
  counter(k, 0, w, '#E5791F', '#C9D1D8');
  k.rect(0.32 * w, ct - 3, 0.66 * w, 2.2, '#DCEFF5', { op: 0.45 });
  k.each(0.34 * w, 0.98 * w, 1.6, 1.3, (x, i) => k.rect(x, ct - 1.6, 1.3, 0.8, ['#5DAA3A', '#D63A2A', '#F2EEE0', '#F2C933'][i % 4]!));
  return Math.max(cx + 3.6, 0.6 * w);
}

export function sushi(k: Kit): number {
  const { w, ct } = k;
  // Lanterne rouge suspendue, étagère de bouteilles de saké.
  const lx = Math.max(1.8, 0.14 * w);
  k.line(lx, 0, lx, 1.6, '#1A1A1A', 0.25);
  k.path(ell(lx, 3.8, 1.5, 2.2), '#D33A2C', { on: k.lit });
  k.rect(lx - 0.9, 1.4, 1.8, 0.5, '#1A1A1A');
  k.rect(lx - 0.9, 5.8, 1.8, 0.5, '#1A1A1A');
  if (w >= 12) {
    k.each(0.45 * w, 0.95 * w, 1.6, 0.9, (x, i) => {
      k.rect(x, 3.2, 0.9, 2.2, i % 2 ? '#F2F2F2' : '#2A5A8A');
      k.rect(x + 0.25, 2.6, 0.4, 0.6, '#3A3A3A');
    });
    shelf(k, 0.43 * w, 5.4, 0.54 * w, '#C49A6A');
  }
  k.toFront();
  // Comptoir en bois clair, tapis roulant gris chargé de petites assiettes colorées.
  counter(k, 0, w, '#E4C79A', '#D2B07A');
  k.rect(0, ct - 1.8, w, 1, '#9AA0A6');
  k.rect(0, ct - 0.9, w, 0.2, '#6A7076');
  k.each(0.4, w - 0.2, 2.6, 1.8, (x, i) => {
    k.path(ell(x + 0.9, ct - 1.9, 0.9, 0.3), ['#D63A2A', '#F2C933', '#2E6FA0', '#5DAA3A', '#F8F8F8'][i % 5]!);
    k.rect(x + 0.4, ct - 2.6, 1, 0.6, i % 2 ? '#F08A5A' : '#F8F8F8');
    k.rect(x + 0.4, ct - 2.3, 1, 0.2, '#1A2A1A');
  });
  return 0.55 * w;
}

export function tearoom(k: Kit): number {
  const { w } = k;
  // Étagère de boîtes à thé colorées.
  const span = Math.max(5, 0.6 * w);
  k.each(0.4, span, 1.6, 1.2, (x, i) => {
    k.rect(x, 1.6, 1.2, 1.8, ['#C0392B', '#3A8A4A', '#D4A537', '#2E6FA0', '#8F5FA8'][i % 5]!);
    k.rect(x, 1.6, 1.2, 0.4, '#3A2A1A');
  });
  shelf(k, 0, 3.4, span + 0.4, '#8A6A44');
  // Présentoir de théières (corps rond, bec, anse).
  if (w >= 12) {
    shelf(k, span + 0.6, 7.6, w - span - 1, '#8A6A44');
    k.each(span + 1, w - 0.6, 3, 2, (x, i) => {
      const c = ['#F8F8F8', '#4A8AB0', '#C0663A'][i % 3]!;
      k.circle(x + 1, 6.6, 1, c);
      k.line(x + 1.9, 6.6, x + 2.6, 5.6, c, 0.4);
      k.path(`M${x + 0.1} 6 Q${x - 0.6} 6.6 ${x + 0.1} 7.2`, 'none', { stroke: c, sw: 0.35 });
      k.circle(x + 1, 5.5, 0.25, c);
    });
  }
  k.toFront();
  // Tables rondes nappées.
  k.each(0.6, Math.max(7, 0.7 * w), 9, 6, (x) => {
    bistroTable(k, x + 2.4, '#F4F0F6', '#6A4A3A');
    k.path(poly([[x + 1.6, k.h - 7.6], [x + 2.4, k.h - 7.6], [x + 2.2, k.h - 8.6], [x + 1.8, k.h - 8.6]]), '#F8F8F8');
  });
  // Debout entre les tables et le présentoir, sans cacher les théières.
  return span;
}
