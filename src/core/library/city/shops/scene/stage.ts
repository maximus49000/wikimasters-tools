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
  chairs: number[]; // fauteuils de travail (coiffeur, tatoueur)
  waiting: number[]; // chaises d'attente (fauteuils), côté porte
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
// Groupe le plus large (trois personnes serrées) : la file commence au-delà, pour que le parti servi y tienne.
export const GROUP_EXTENT = 2 * TIGHT;

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
export type Span = readonly [number, number];
// Étendue (profondeurs) d'un groupe de `n` ancré en `d` : le meneur au plus profond, les autres serrés vers la porte.
export const blockSpan = (d: number, n: number): Span => {
  const a = Math.max(d, HALF + (n - 1) * TIGHT);
  return [a - (n - 1) * TIGHT - HALF, a + HALF];
};
export const disjoint = (a: Span, b: Span): boolean => a[1] <= b[0] + 1e-9 || b[1] <= a[0] + 1e-9;
const depthOf = (st: Pick<Stage, 'w' | 'doorEdge'>, x: number): number => (st.doorEdge === 'left' ? x : st.w - x);
// Où se tient le client servi : une demi-silhouette côté porte du vendeur.
export const serveDepth = (st: Pick<Stage, 'w' | 'doorEdge'>, post: number): number => Math.max(HALF, depthOf(st, post) - HALF);
// Zones où l'on ne s'arrête pas pour flâner (familles à caisse) : le parti servi au poste principal (groupe de trois au pire)
// et la file. Les clients qui MARCHENT peuvent les traverser (le rendu dessine le marcheur devant, léger décalage de
// profondeur) ; seuls les clients immobiles ne se chevauchent jamais.
export function standZones(st: Pick<Stage, 'w' | 'doorEdge' | 'posts' | 'queue'>, type: ShopTypeId): Span[] {
  const f = SHOP_FAMILY[type];
  if (!(f === 'browse' || f === 'till' || (f === 'machine' && type !== 'laundry'))) return [];
  const zones: Span[] = [blockSpan(serveDepth(st, st.posts[0]!), 3)];
  if (st.queue.length) {
    const ds = st.queue.map((x) => depthOf(st, x));
    zones.push([Math.min(...ds) - HALF, Math.max(...ds) + HALF]);
  }
  return zones;
}
// Nombre de places de file : comptoir 4, caisse / rayon 2 (on y flâne aussi), vélos 3.
const QUEUE_MAX: Partial<Record<string, number>> = { counter: 4, till: 2, browse: 2, machine: 3 };

export function stageFor(type: ShopTypeId, frame: ShopFrame): Stage {
  const w = frame.window.w;
  const doorEdge: 'left' | 'right' = frame.door.x > frame.window.x ? 'right' : 'left';
  // Profondeur `d` depuis la porte (0 = bord côté porte) ↔ x local.
  const x = (d: number): number => (doorEdge === 'left' ? d : w - d);
  const family = SHOP_FAMILY[type];
  // La porte du local est du côté opposé à l'entrée des habitants (shopFrame).
  const post0 = clamp(ghibliPostOf(type, frame.sign.w, doorEdge === 'right' ? 'left' : 'right'), HALF, w - HALF);
  const d0 = doorEdge === 'left' ? post0 : w - post0;
  const s0 = Math.max(HALF, d0 - HALF);
  const S = blockSpan(s0, 3);

  // File : côté porte derrière le parti servi ; si la porte est trop près du comptoir, le long du comptoir vers le fond.
  const queued = family === 'counter' || family === 'till' || family === 'browse' || (family === 'machine' && type !== 'laundry');
  const doorward = range(HALF, S[0] - HALF, PLACE).reverse();
  const deep = range(S[1] + HALF, w - HALF, PLACE);
  let queueDs = !queued ? [] : (doorward.length >= 2 || doorward.length >= deep.length ? doorward : deep).slice(0, QUEUE_MAX[family] ?? 0);

  // Postes de renfort (comptoir, bar) vers le fond, assez loin pour que deux partis servis ne se touchent pas, hors de la file.
  const gap = family === 'counter' ? 3 * PLACE : 2 * PLACE;
  const qZone = (): Span | null => (queueDs.length ? [Math.min(...queueDs) - HALF, Math.max(...queueDs) + HALF] : null);
  const postDs = [d0, ...(family === 'counter' || family === 'drink' ? [d0 + gap, d0 + 2 * gap] : [])].filter((d, i) => {
    if (i === 0) return true;
    const z = qZone();
    return d <= w - HALF && (family === 'drink' || !z || disjoint(blockSpan(Math.max(HALF, d - HALF), 3), z));
  });
  const posts = postDs.map(x);
  const seated = family === 'table' || family === 'chair';
  const lo = Math.min(...posts);
  const hi = Math.max(...posts);
  const reach = family === 'drink' ? 0.3 * w : PLACE;
  const counter = seated ? null : { x0: Math.max(0, lo - reach), x1: Math.min(w, hi + reach) };

  // Places debout : tabourets le long du bar ; rayons / machines hors des zones de service et de file (une place au moins :
  // la file raccourcit s'il le faut).
  let spots: number[] = [];
  // Bar, café : tabourets le long du comptoir, puis mange-debout jusqu'à la porte (le reste de la salle n'est pas perdu).
  if (family === 'drink' && counter) {
    const stools = range(counter.x0 + HALF, counter.x1 - HALF, PLACE * 1.2);
    const ds = stools.map((v) => depthOf({ w, doorEdge }, v));
    const step = PLACE * 1.2;
    // Vitrine minuscule (comptoir plus étroit qu'une place) : pas de tabouret, des places debout sur toute la largeur.
    const near = ds.length ? range(HALF, Math.min(...ds) - step, step) : range(HALF, w - HALF, step);
    const far = ds.length ? range(Math.max(...ds) + step, w - HALF, step) : [];
    spots = [...stools, ...near.map(x), ...far.map(x)];
  }
  else if (family === 'browse' || family === 'till' || family === 'machine') {
    for (;;) {
      const zones = standZones({ w, doorEdge, posts, queue: queueDs.map(x) }, type);
      spots = [];
      for (let d = HALF; d <= w - HALF + 1e-9; d += 0.5) {
        const free = zones.every((z) => disjoint([d - HALF, d + HALF], z));
        if (free && (spots.length === 0 || d - spots[spots.length - 1]! >= PLACE * 1.5)) spots.push(d);
      }
      if (spots.length > 0 || queueDs.length === 0) break;
      queueDs = queueDs.slice(0, -1);
    }
    spots = spots.map(x);
  }
  const queue = queueDs.map(x);
  const nTables = family === 'table' ? Math.max(1, Math.floor((w - PLACE) / 18)) : 0;
  const tables = Array.from({ length: nTables }, (_, i) => {
    const cx = PLACE + ((i + 0.5) * (w - 2 * PLACE)) / nTables;
    return { x: cx, seats: [clamp(cx - 4.2, HALF, w - HALF), clamp(cx + 4.2, HALF, w - HALF)] as [number, number] };
  });
  const nChairs = family === 'chair' ? Math.max(1, Math.floor((w - PLACE) / 14)) : 0;
  const seats = Array.from({ length: nChairs }, (_, i) => PLACE + HALF + ((i + 0.5) * (w - 2 * PLACE - HALF)) / nChairs);
  // Dès deux sièges, celui côté porte sert de chaise d'attente ; sinon on attend debout, juste passé la porte (spots).
  const waiting = nChairs >= 2 ? [x(seats[0]!)] : [];
  const chairs = (nChairs >= 2 ? seats.slice(1) : seats).map(x);
  if (family === 'chair' && waiting.length === 0) spots = [x(HALF)];
  const back = x(w - HALF);
  const window = [x(HALF + PLACE), ...(w >= 80 ? [x(w / 2)] : [])];
  return { w, doorEdge, counter, posts, queue, spots, tables, chairs, waiting, back, window };
}
