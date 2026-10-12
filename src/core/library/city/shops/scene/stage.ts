import { facadeGeometry } from '../../../paint/shop/facade';
import { interiorPostOf } from '../../../paint/shop/interiors';
import type { ShopTypeId } from '../catalog';
import { FIGURE_HALF_UNITS, INSIDE_SCALE } from '../customers';
import { SHOP_FAMILY } from '../gestures';
import type { ShopFrame } from '../slots';

// Géométrie intérieure d'un local pour le metteur en scène (G4b) : repère local de la vitrine (0 = bord gauche), px du
// monde. Postes des employés (derrière le comptoir), places de file côté porte, places de flânerie / tabourets, tables,
// fauteuils, porte de l'arrière-boutique et coins de vitrine. Pur : dérivé du type et du cadre, rien n'est peint.
export type Stage = {
  w: number;
  doorEdge: 'left' | 'right';
  counter: { x0: number; x1: number } | null;
  posts: number[]; // [0] = poste principal (celui de l'intérieur peint)
  queue: number[]; // places de file, de la tête (près du comptoir) vers la porte
  spots: number[]; // places debout : rayons (flânerie), tabourets (bar), machines
  tables: { x: number; seats: [number, number] }[];
  chairs: number[];
  back: number; // porte de l'arrière-boutique
  window: number[]; // où l'on regarde la rue
};

// Demi-silhouette d'un client dans la vitrine ; une place = deux demi-silhouettes.
export const HALF = FIGURE_HALF_UNITS * INSIDE_SCALE;
export const PLACE = 2 * HALF;
// Écart dans un groupe serré (couple, parent et enfant, amis) : les silhouettes se touchent presque.
export const TIGHT = 3.2;
// Position hors vitrine (derrière le montant) d'où l'on entre et où l'on sort : une demi-silhouette du plus grand client.
export const OUTSIDE = HALF * 1.1;
// En dessous de cette largeur on ne se croise pas : un seul parti à la fois, pas de file intérieure.
export const PASS_W = 40;
// Groupe le plus large (trois personnes serrées) : la file commence au-delà, pour que le parti servi y tienne.
const GROUP_EXTENT = 2 * TIGHT;

// Place du vendeur en Ghibli (repère de la vitrine) : celle du comptoir peint de l'intérieur Ghibli, décalée du pilastre
// quand la partie vitrée ne commence pas au bord de la vitrine. `doorSide` : côté de l'entrée des habitants (ShopSlot).
// Partagée avec le dessin (ghibliStaffPost) : une seule règle.
export function ghibliPostOf(type: ShopTypeId, signW: number, doorSide: 'left' | 'right'): number {
  const g = facadeGeometry({ type, name: '', w: signW, doorSide, state: 'open', placard: false, night: false, lit: false });
  return g.glass.x - g.win.x + interiorPostOf(type, g.glass.w, g.glass.h);
}

const clamp = (v: number, lo: number, hi: number): number => (hi < lo ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));
// Places régulières de `d0` à `d1` (profondeur depuis la porte), au pas `step`.
const range = (d0: number, d1: number, step: number): number[] => {
  const out: number[] = [];
  for (let d = d0; d <= d1 + 1e-9; d += step) out.push(d);
  return out;
};

export function stageFor(type: ShopTypeId, frame: ShopFrame): Stage {
  const w = frame.window.w;
  const doorEdge: 'left' | 'right' = frame.door.x > frame.window.x ? 'right' : 'left';
  // Profondeur `d` depuis la porte (0 = bord côté porte) ↔ x local.
  const x = (d: number): number => (doorEdge === 'left' ? d : w - d);
  const family = SHOP_FAMILY[type];
  // La porte du local est du côté opposé à l'entrée des habitants (shopFrame).
  const post0 = clamp(ghibliPostOf(type, frame.sign.w, doorEdge === 'right' ? 'left' : 'right'), HALF, w - HALF);
  const d0 = doorEdge === 'left' ? post0 : w - post0;
  // Postes de renfort : deux places plus loin vers le fond (jamais vers la porte : la file y attend).
  const postDs = [d0, d0 + 2 * PLACE, d0 + 4 * PLACE].filter((d, i) => i === 0 || d <= w - HALF);
  const posts = postDs.map(x);
  // Le client servi se tient une demi-silhouette côté porte du vendeur.
  const serveDs = postDs.map((d) => Math.max(HALF, d - HALF));
  const seated = family === 'table' || family === 'chair';
  const lo = Math.min(...posts);
  const hi = Math.max(...posts);
  const reach = family === 'drink' ? 0.3 * w : PLACE;
  const counter = seated ? null : { x0: Math.max(0, lo - reach), x1: Math.min(w, hi + reach) };

  // File (familles où l'on passe au comptoir ou à la caisse) : derrière le parti servi, jusqu'à une place de la porte.
  const queued = family === 'counter' || family === 'till' || family === 'browse' || family === 'machine';
  const qStart = Math.min(...serveDs) - (GROUP_EXTENT + PLACE);
  const queue = queued && w >= PASS_W ? range(HALF + PLACE, qStart, PLACE).reverse().map(x) : [];

  // Places debout : tabourets le long du bar, sinon rayons / machines répartis loin du comptoir de service.
  let spots: number[] = [];
  if (family === 'drink' && counter) spots = range(counter.x0 + HALF, counter.x1 - HALF, PLACE * 1.2);
  else if (family === 'browse' || family === 'till' || family === 'machine') {
    spots = range(HALF + PLACE, w - HALF, 2 * PLACE).filter((d) => serveDs.every((s) => Math.abs(d - s) >= PLACE)).map(x);
  }
  const nTables = family === 'table' ? Math.max(1, Math.floor((w - PLACE) / 18)) : 0;
  const tables = Array.from({ length: nTables }, (_, i) => {
    const cx = PLACE + ((i + 0.5) * (w - 2 * PLACE)) / nTables;
    return { x: cx, seats: [clamp(cx - 4.2, HALF, w - HALF), clamp(cx + 4.2, HALF, w - HALF)] as [number, number] };
  });
  const nChairs = family === 'chair' ? Math.max(1, Math.floor((w - PLACE) / 14)) : 0;
  const chairs = Array.from({ length: nChairs }, (_, i) => x(PLACE + HALF + ((i + 0.5) * (w - 2 * PLACE - HALF)) / nChairs));
  const back = x(w - HALF);
  const window = [x(HALF + PLACE), ...(w >= 2 * PASS_W ? [x(w / 2)] : [])];
  return { w, doorEdge, counter, posts, queue, spots, tables, chairs, back, window };
}
