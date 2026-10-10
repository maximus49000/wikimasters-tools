import type { ReactElement } from 'react';
import { SHOP_DEFS, type ShopTypeId } from '../core/library/city/shops/catalog';
import { mixHex, type Sky, skyAt } from '../core/library/sky';
import { tone } from './city-sprites';
import { bakery, butcher, cheese, chocolatier, fishmonger, greengrocer, grocery, minimarket, pastry, wine } from './shop-interiors-alimentation';
import { antiques, bikes, bookshop, florist, games, optician, petshop, records, thrift } from './shop-interiors-boutiques';
import { counter, group, type Kit, makeKit, poly, shelf } from './shop-interiors-kit';
import { cafe, kebab, pizzeria, restaurant, sushi, tearoom } from './shop-interiors-restauration';

// Intérieurs des 32 commerces, vus par la vitrine (dessinés dans le <svg> imbriqué de ShopFront, qui rogne). Repère LOCAL :
// x de 0 à w (8 à 40), y de 0 (plafond) à h (≈ 21, sol). Mur et bande de sol (3 px) aux couleurs du catalogue, mobilier en
// formes simples placé en fractions de w, éléments répétés tant qu'ils tiennent. Chaque dessin rend la place du vendeur (x) :
// le personnel (passants à l'échelle 0,5, ≈ 20 de haut, calque animé) s'y tient entre le fond et le premier plan, derrière le
// comptoir il n'en dépasse que le buste. Aucun `transform`. `lit` (boutique éclairée) allume écrans, frigos, aquariums, croix verte, bougies, bornes et spots, et garde au
// reste ses couleurs de jour réchauffées ; éteinte, tout suit tone(c, sky). Aucun id, aucune animation. Familles : alimentation, boutiques et restauration dans leurs
// fichiers ; services et nuit ci-dessous.

// ---------- Services ----------
function pharmacy(k: Kit): number {
  const { w, ct } = k;
  // Croix verte au mur, allumée (halo) quand la pharmacie l'est.
  const cx = Math.max(2.6, 0.2 * w);
  const green = k.lit ? '#2EE06A' : '#1E8A4C';
  if (k.lit) k.circle(cx, 5, 3, '#2EE06A', { on: true, op: 0.25 });
  k.rect(cx - 0.7, 3, 1.4, 4, green, { on: k.lit });
  k.rect(cx - 2, 4.3, 4, 1.4, green, { on: k.lit });
  // Mur de tiroirs blancs (poignée au milieu).
  const x0 = Math.max(cx + 2.4, 0.42 * w);
  for (let y = 1.4; y + 1.6 <= ct - 1; y += 1.8) {
    k.each(x0, w - 0.3, 2.2, 2, (x) => {
      k.rect(x, y, 2, 1.6, '#FAFCFB', { stroke: '#B8C8C0', sw: 0.15 });
      k.circle(x + 1, y + 0.8, 0.2, '#8A9A92');
    });
  }
  k.toFront();
  counter(k, 0.06 * w, 0.88 * w, '#F6F8F7', '#D6E2DC');
  k.rect(0.06 * w, k.ct + 2, 0.88 * w, 0.5, '#1E8A4C');
  return 0.62 * w;
}

function hairdresser(k: Kit): number {
  const { w, h } = k;
  // Miroirs ronds face aux fauteuils (un seul poste si la vitrine est étroite), bac à shampoing au bout.
  const seats = [Math.max(2.6, 0.22 * w), ...(w >= 16 ? [0.56 * w] : [])];
  for (const cx of seats) k.circle(cx, 6.4, 2.6, '#D6E4EA', { stroke: '#8C9AA2', sw: 0.4 });
  if (w >= 20) {
    const bx = 0.88 * w;
    k.rect(bx - 0.4, h - 8, 0.8, 7.5, '#B0C9C8');
    k.path(`M${bx - 2} ${h - 9} L${bx + 2} ${h - 9} Q${bx + 2} ${h - 7} ${bx} ${h - 7} Q${bx - 2} ${h - 7} ${bx - 2} ${h - 9}Z`, '#FAFAFA', { stroke: '#8C9AA2', sw: 0.2 });
  }
  k.toFront();
  // Fauteuils noirs : dossier, assise, pied chromé.
  for (const cx of seats) {
    k.rect(cx - 1.6, h - 9.4, 3.2, 4.2, '#1A1A1A', { rx: 0.6 });
    k.rect(cx - 2, h - 5.6, 4, 1.2, '#1A1A1A', { rx: 0.4 });
    k.rect(cx - 0.3, h - 4.4, 0.6, 3, '#B9C0C8');
    k.rect(cx - 1.5, h - 1.4, 3, 0.6, '#B9C0C8');
  }
  // Le coiffeur se tient juste derrière le premier fauteuil.
  return seats[0]! + 2.4;
}

function tattoo(k: Kit): number {
  const { w, h } = k;
  // « Flash » : murs couverts de petits dessins encadrés.
  const inks = ['#D63A2A', '#2E8A4A', '#2E6FA0', '#F2C933', '#1A1A1A'];
  for (const [r, y] of [1, 4, 7].entries()) {
    k.each(0.4 + (r % 2) * 1.4, w - 0.3, 3, 2.4, (x, i) => {
      k.rect(x, y, 2.4, 2.4, '#F2E8D0', { stroke: '#8A6A3A', sw: 0.2 });
      const c = inks[(i + r * 2) % inks.length]!;
      if ((i + r) % 2) k.circle(x + 1.2, y + 1.2, 0.6, c);
      else k.path(poly([[x + 1.2, y + 0.5], [x + 1.9, y + 1.9], [x + 0.5, y + 1.9]]), c);
    });
  }
  k.toFront();
  // Fauteuil inclinable (assise, dossier basculé, pied) et lampe articulée.
  const x0 = 0.06 * w;
  const cw = Math.max(5, Math.min(8, 0.5 * w));
  k.path(poly([[x0, h - 6.6], [x0 + cw * 0.65, h - 6.6], [x0 + cw, h - 9.4], [x0 + cw, h - 8.4], [x0 + cw * 0.7, h - 5.4], [x0, h - 5.4]]), '#9A2A3A', { stroke: '#F2E8D0', sw: 0.2 });
  k.rect(x0 + cw * 0.3, h - 5.4, 0.8, 4.9, '#8C939C');
  k.rect(x0 + cw * 0.1, h - 1.2, cw * 0.6, 0.7, '#8C939C');
  if (w >= 14) {
    const lx = 0.66 * w;
    k.line(lx, h - 0.6, lx, 6, '#8C939C', 0.35);
    k.line(lx, 6, lx - 2.6, 7.4, '#8C939C', 0.35);
    k.path(poly([[lx - 3.6, 8.6], [lx - 1.8, 8.6], [lx - 2.2, 7.2], [lx - 3.2, 7.2]]), '#2A2A2A');
    if (k.lit) k.circle(lx - 2.7, 9.4, 1.2, '#FFF2B0', { on: true, op: 0.5 });
  }
  return 0.82 * w;
}

function laundry(k: Kit): number {
  const { w, h } = k;
  // Deux rangées de machines (sèche-linge en haut, lave-linge en bas) : hublot gris, linge bleu derrière la vitre.
  for (const [top, bh] of [[1.4, 8.4], [h - 10, 9.5]] as const) {
    k.each(0.3, w - 0.3, 5, 4.6, (x) => {
      k.rect(x, top, 4.6, bh, '#F2F4F6', { stroke: '#9AA4AE', sw: 0.2 });
      k.rect(x + 0.4, top + 0.4, 3.8, 0.9, '#5A6470');
      k.circle(x + 2.3, top + bh / 2 + 0.7, 1.7, '#9AA4AE');
      k.circle(x + 2.3, top + bh / 2 + 0.7, 1.15, '#5AA7D6');
    });
  }
  k.toFront();
  // Banc d'attente.
  const x0 = 0.12 * w;
  const bw = Math.max(5, 0.6 * w);
  k.rect(x0, h - 4.4, bw, 0.8, '#9A6A3A');
  k.rect(x0 + 0.4, h - 3.6, 0.5, 3.1, '#5A3A20');
  k.rect(x0 + bw - 0.9, h - 3.6, 0.5, 3.1, '#5A3A20');
  return 0.84 * w;
}

// ---------- Nuit ----------
const NEON = ['#3DF2E0', '#FF4FD8', '#FFD84A', '#6AF26A'];

function arcade(k: Kit): number {
  const { w, h } = k;
  // Bornes alignées : fronton coloré, écran lumineux (vif quand la salle est allumée), pupitre, manette, boutons.
  k.each(0.3, w - 0.3, 4.8, 4.2, (x, i) => {
    const c = NEON[i % NEON.length]!;
    k.rect(x, 2, 4.2, h - 2.5, '#1C1A3A');
    k.rect(x + 0.2, 2.2, 3.8, 1.4, c, { on: k.lit });
    k.rect(x + 0.6, 4.4, 3, 3.6, c, { on: k.lit, op: k.lit ? 1 : 0.75 });
    k.rect(x + 1, 5, 1.2, 0.6, '#1C1A3A', { op: 0.6 });
    k.path(poly([[x, 10], [x + 4.2, 10], [x + 4.2, 8.6], [x, 9.2]]), '#3A3670');
    k.line(x + 1.2, 9.4, x + 1.2, 8.2, '#1A1A1A', 0.3);
    k.circle(x + 1.2, 8.1, 0.4, '#E63B3B');
    k.circle(x + 2.6, 9.2, 0.3, '#FFD84A');
    k.circle(x + 3.4, 9, 0.3, '#3DF2E0');
  });
  k.toFront();
  k.rect(0, k.f, w, 0.4, '#3DF2E0', { on: k.lit, op: 0.6 });
  k.rect(0, h - 1.6, w, 0.3, '#FF4FD8', { on: k.lit, op: 0.4 });
  return 0.86 * w;
}

function bar(k: Kit): number {
  const { w, h, ct } = k;
  // Étagère de bouteilles rétroéclairée (lueur ambrée, plus forte quand le bar est allumé).
  const x0 = 0.06 * w;
  const sw = 0.88 * w;
  k.rect(x0, 1.2, sw, 8.4, '#FFB347', { on: k.lit, op: k.lit ? 0.6 : 0.3 });
  for (const y of [5, 9.2]) {
    k.each(x0 + 0.3, x0 + sw - 0.3, 1.3, 0.8, (x, i) => {
      const bh = i % 3 === 0 ? 3 : 2.4;
      const c = ['#2F6A2A', '#8A4A14', '#D9D2C0', '#6A1020', '#2A4A8A'][i % 5]!;
      k.rect(x, y - bh, 0.8, bh, c);
      k.rect(x + 0.25, y - bh - 0.7, 0.3, 0.7, c);
    });
    shelf(k, x0, y, sw, '#3A2418');
  }
  k.toFront();
  // Comptoir en bois sombre, tireuses à bière, tabourets hauts devant.
  counter(k, 0, w, '#3A2418', '#6A4224');
  k.each(0.2 * w, 0.5 * w, 1.6, 0.6, (x, i) => {
    k.line(x + 0.3, ct - 0.8, x + 0.3, ct - 3, '#C9D1D8', 0.35);
    k.rect(x, ct - 4.2, 0.6, 1.2, ['#E0A21E', '#C0392B', '#2E6FA0'][i % 3]!);
  });
  k.each(0.8, w - 0.6, 6, 2.4, (x) => {
    k.rect(x, h - 6.2, 2.4, 0.8, '#8A1E2A', { rx: 0.3 });
    k.rect(x + 0.9, h - 5.4, 0.6, 4.9, '#1A1A1A');
    k.rect(x + 0.3, h - 2.6, 1.8, 0.3, '#1A1A1A');
  });
  return 0.62 * w;
}

function nightclub(k: Kit): number {
  const { w, h } = k;
  const magenta = '#FF4FD8';
  const cyan = '#3DF2E0';
  // Spots colorés (magenta, cyan) qui balaient la piste depuis les coins du plafond.
  k.path(poly([[0.5, 0.6], [1.5, 0.6], [0.6 * w, h], [0.25 * w, h]]), magenta, { on: k.lit, op: k.lit ? 0.35 : 0.18 });
  k.path(poly([[w - 1.5, 0.6], [w - 0.5, 0.6], [0.75 * w, h], [0.4 * w, h]]), cyan, { on: k.lit, op: k.lit ? 0.35 : 0.18 });
  k.rect(0, 0, 2, 1, '#555566');
  k.rect(w - 2, 0, 2, 1, '#555566');
  // Boule à facettes et ses éclats.
  const bx = 0.5 * w;
  k.line(bx, 0, bx, 1.6, '#8C939C', 0.2);
  k.circle(bx, 3, 1.5, '#D8DCE6', { on: k.lit });
  for (const [dx, dy] of [[-0.5, -0.5], [0.4, 0.2], [-0.2, 0.8]] as const) k.rect(bx + dx - 0.2, 3 + dy - 0.2, 0.4, 0.4, '#FFFFFF', { on: k.lit });
  for (const [sx, sy] of [[0.15, 6], [0.82, 4.4], [0.3, 9.4], [0.7, 8]] as const) k.circle(sx * w, sy, 0.25, '#FFFFFF', { on: k.lit, op: 0.8 });
  // Piste sombre : dalles qui s'allument par endroits.
  k.each(0, w, 2, 2, (x, i) => (i % 3 === 0 ? k.rect(x, k.f, 2, 3, i % 2 ? cyan : magenta, { on: k.lit, op: 0.35 }) : undefined));
  k.toFront();
  // Cabine du DJ (le vendeur, derrière), platine dessus, liseré néon.
  const x0 = Math.max(0.3 * w, bx - 4);
  const cw = Math.min(w - x0, Math.max(5, 0.4 * w));
  k.rect(x0, h - 8, cw, 7.5, '#120A24');
  k.rect(x0, h - 6, cw, 0.4, magenta, { on: k.lit });
  k.rect(x0 + 0.4, h - 9, cw - 0.8, 1, '#3A3A44');
  k.circle(x0 + cw * 0.3, h - 9.2, 0.6, '#0A0A0A', { stroke: '#8C939C', sw: 0.15 });
  k.circle(x0 + cw * 0.7, h - 9.2, 0.6, '#0A0A0A', { stroke: '#8C939C', sw: 0.15 });
  return x0 + cw / 2;
}

const DRAW: Readonly<Record<ShopTypeId, (k: Kit) => number>> = {
  bakery,
  pastry,
  chocolatier,
  butcher,
  fishmonger,
  cheese,
  greengrocer,
  wine,
  grocery,
  minimarket,
  florist,
  bookshop,
  records,
  games,
  optician,
  thrift,
  antiques,
  petshop,
  bikes,
  cafe,
  restaurant,
  pizzeria,
  kebab,
  sushi,
  tearoom,
  pharmacy,
  hairdresser,
  tattoo,
  laundry,
  arcade,
  bar,
  nightclub,
};

// Boutique ouverte et éclairée (`lit`) : l'intérieur garde ses couleurs de jour, légèrement réchauffées par la lumière des
// plafonniers, quelle que soit l'heure ; éteinte, il suit le ciel (tone). Les sources de lumière (`on`) restent vives.
export const LIT_SKY = skyAt(13 * 60, { kind: 'normal', sunrise: 360, sunset: 1200 });
const WARM = '#FFE2A8';

// Intérieur peint : le mobilier (fond, premier plan) et la place du vendeur (x, repère local), celle où se tient l'employé de service.
function paint(type: ShopTypeId, w: number, h: number, sky: Sky, lit: boolean): { k: Kit; post: number; t: (c: string) => string } {
  const t = lit ? (c: string): string => mixHex(tone(c, LIT_SKY), WARM, 0.12) : (c: string): string => tone(c, sky);
  const k = makeKit(w, h, t, lit);
  const post = Math.min(w - 2.5, Math.max(2.5, DRAW[type](k)));
  return { k, post, t };
}

// Place de l'employé de service (x dans la vitrine, de 0 à w) : derrière le comptoir, la caisse, le fauteuil… (calque animé).
const posts = new Map<string, number>();
export function interiorPost(type: ShopTypeId, w: number, h: number): number {
  const key = `${type}|${w}|${h}`;
  let x = posts.get(key);
  if (x === undefined) {
    x = paint(type, w, h, LIT_SKY, false).post;
    posts.set(key, x);
  }
  return x;
}

// Le personnel n'est plus peint dans l'intérieur (vague 1b-iv-b) : ce sont des habitants qui arrivent, travaillent et repartent,
// dessinés par le calque animé (StaffLayer, city-shops-life.tsx) entre le fond et le premier plan. Pour cela, quand le calque
// animé redessine le premier plan par-dessus le personnel (`front={false}` ici, ShopInteriorFront là-bas), le décor fixe ne
// dessine que le fond (pas de double opacité des éléments translucides).
export function ShopInterior({ type, w, h, sky, lit, front = true }: { type: ShopTypeId; w: number; h: number; sky: Sky; lit: boolean; front?: boolean }): ReactElement {
  const def = SHOP_DEFS[type];
  const { k, t } = paint(type, w, h, sky, lit);
  return (
    <g data-interior={type}>
      <rect x={0} y={0} width={w} height={h} fill={t(def.wall)} />
      <rect x={0} y={h - 3} width={w} height={3} fill={t(def.floor)} />
      {group(k.back)}
      {front && group(k.front)}
    </g>
  );
}

// Premier plan seul (comptoir, fauteuils, cabine…), dessiné par le calque animé DEVANT le personnel.
export function ShopInteriorFront({ type, w, h, sky, lit }: { type: ShopTypeId; w: number; h: number; sky: Sky; lit: boolean }): ReactElement {
  return <g data-interior-front={type}>{group(paint(type, w, h, sky, lit).k.front)}</g>;
}
