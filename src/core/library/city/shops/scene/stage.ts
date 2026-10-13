import { facadeGeometry } from '../../../paint/shop/facade';
import { interiorFurnitureOf, interiorPostOf } from '../../../paint/shop/interiors';
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
  // `drawn` : comptoir réellement peint (les employés derrière lui sont rognés à son plan de travail) ; sinon zone de service
  // tirée des postes, sans meuble pour cacher le bas du corps : on n'y rogne personne.
  counter: { x0: number; x1: number; drawn: boolean } | null;
  posts: number[]; // [0] = poste principal (celui de l'intérieur peint)
  queue: number[]; // places de file, de la tête (près du comptoir) vers la porte
  spots: number[]; // places debout : rayons (flânerie), tabourets (bar), machines
  tables: { x: number; seats: [number, number] }[];
  chairs: number[]; // fauteuils de travail (coiffeur, tatoueur)
  waiting: number[]; // chaises d'attente (fauteuils), côté porte
  back: number; // porte de l'arrière-boutique
  window: number[]; // où l'on regarde la rue
  floorLine: number; // ligne du sol peint (y depuis le haut de la vitrine)
  seatH: number; // hauteur d'assise des sièges peints au-dessus du sol (tables, fauteuils)
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

// Ligne du plan de travail du comptoir peint (repère de la vitrine, y depuis le haut) : `counter` de kit.ts pose le dessus à
// 7,4 unités du bas de la partie vitrée (2,2 de socle + 5,2 de façade). Les acteurs derrière le comptoir sont rognés là.
export const COUNTER_TOP = 7.4;
export function ghibliWorktopOf(type: ShopTypeId, signW: number, doorSide: 'left' | 'right'): number {
  const g = facadeGeometry({ type, name: '', w: signW, doorSide, state: 'open', placard: false, night: false, lit: false });
  return g.glass.y - g.win.y + g.glass.h - COUNTER_TOP;
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
// Où se tient le client servi : une place côté porte du vendeur (les deux silhouettes se touchent sans se recouvrir : le
// vendeur reste lisible derrière son comptoir, le client devant).
export const serveDepth = (st: Pick<Stage, 'w' | 'doorEdge'>, post: number): number => Math.max(HALF, depthOf(st, post) - PLACE);
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

// Mobilier peint de l'intérieur Ghibli, ramené au repère de la vitrine (même décalage que ghibliPostOf) : comptoir,
// tables, fauteuils, ligne du sol. Les acteurs s'alignent sur ce qui est dessiné, pas sur une grille.
// La largeur d'enseigne se déduit de la vitrine (porte et montant : shopFrame), pas du cadre : un cadre d'essai à la vitrine
// élargie garde un intérieur peint à sa taille.
const SIGN_EXTRA = 7;
function paintedFurniture(type: ShopTypeId, doorSide: 'left' | 'right', w: number) {
  const g = facadeGeometry({ type, name: '', w: w + SIGN_EXTRA, doorSide, state: 'open', placard: false, night: false, lit: false });
  const f = interiorFurnitureOf(type, g.glass.w, g.glass.h);
  const ox = g.glass.x - g.win.x;
  const cx = (v: number): number => Math.min(w - HALF, Math.max(HALF, ox + v));
  return {
    counter: f.counter ? ([Math.max(0, ox + f.counter[0]), Math.min(w, ox + f.counter[1])] as const) : null,
    tables: f.tables.map((t) => ({ x: cx(t.x), seat: t.seat })),
    chairs: f.chairs.map((c) => ({ x: cx(c.x), seat: c.seat })),
    floorLine: g.glass.y - g.win.y + f.floor,
  };
}

export function stageFor(type: ShopTypeId, frame: ShopFrame): Stage {
  const w = frame.window.w;
  const doorEdge: 'left' | 'right' = frame.door.x > frame.window.x ? 'right' : 'left';
  // Profondeur `d` depuis la porte (0 = bord côté porte) ↔ x local.
  const x = (d: number): number => (doorEdge === 'left' ? d : w - d);
  const family = SHOP_FAMILY[type];
  // La porte du local est du côté opposé à l'entrée des habitants (shopFrame).
  const painted = paintedFurniture(type, doorEdge === 'right' ? 'left' : 'right', w);
  const post0 = clamp(ghibliPostOf(type, frame.sign.w, doorEdge === 'right' ? 'left' : 'right'), HALF, w - HALF);
  const d0 = doorEdge === 'left' ? post0 : w - post0;
  const s0 = Math.max(HALF, d0 - HALF);
  const S = blockSpan(s0, 3);

  // File : côté porte derrière le parti servi ; si la porte est trop près du comptoir, le long du comptoir vers le fond.
  const queued = family === 'counter' || family === 'till' || family === 'browse' || (family === 'machine' && type !== 'laundry');
  const doorward = range(HALF, S[0] - HALF, PLACE).reverse();
  const deep = range(S[1] + HALF, w - HALF, PLACE);
  const fromDoor = doorward.length >= 2 || doorward.length >= deep.length;
  let queueDs = !queued ? [] : (fromDoor ? doorward : deep).slice(0, QUEUE_MAX[family] ?? 0);

  // Postes de renfort (comptoir, bar) vers le fond, à deux places (deux partis servis côte à côte sans se toucher), hors de
  // la file : les vitrines réelles (33-45 px) n'ont la place d'un second poste qu'à cet écart.
  const gap = 2 * PLACE;
  const qZone = (): Span | null => (queueDs.length ? [Math.min(...queueDs) - HALF, Math.max(...queueDs) + HALF] : null);
  // Un poste de renfort se tient derrière le comptoir peint (s'il y en a un).
  const onCounter = (d: number): boolean => !painted.counter || (x(d) >= painted.counter[0] - 1e-9 && x(d) <= painted.counter[1] + 1e-9);
  const postDs = [d0, ...(family === 'counter' || family === 'drink' ? [d0 + gap, d0 + 2 * gap] : [])].filter((d, i) => {
    if (i === 0) return true;
    const z = qZone();
    return d <= w - HALF && onCounter(d) && (family === 'drink' || !z || disjoint(blockSpan(Math.max(HALF, d - HALF), 3), z));
  });
  // Comptoir dont le poste peint est au fond (vitrines larges) : le renfort se met côté porte, la file recule d'autant.
  if (family === 'counter' && postDs.length === 1 && queueDs.length) {
    const d2 = d0 - gap;
    const S2 = blockSpan(Math.max(HALF, d2 - HALF), 3);
    const doorward2 = range(HALF, S2[0] - HALF, PLACE).reverse();
    if (d2 - HALF > HALF && doorward2.length >= 1 && fromDoor && onCounter(d2)) {
      postDs.push(d2);
      queueDs = doorward2.slice(0, QUEUE_MAX[family] ?? 0);
    }
  }
  const posts = postDs.map(x);
  const seated = family === 'table' || family === 'chair';
  const lo = Math.min(...posts);
  const hi = Math.max(...posts);
  const reach = family === 'drink' ? 0.3 * w : PLACE;
  // Comptoir : celui qui est peint (les employés devant lui sont derrière, rognés au plan de travail), sinon autour des postes.
  const counter = seated ? null : painted.counter ? { x0: painted.counter[0], x1: painted.counter[1], drawn: true } : { x0: Math.max(0, lo - reach), x1: Math.min(w, hi + reach), drawn: false };

  // Places debout : tabourets le long du bar ; rayons / machines hors des zones de service et de file (une place au moins :
  // la file raccourcit s'il le faut).
  let spots: number[] = [];
  // Bar, café : tabourets le long du comptoir, puis mange-debout jusqu'à la porte (le reste de la salle n'est pas perdu).
  if (family === 'drink' && counter) {
    const stools = range(counter.x0 + HALF, counter.x1 - HALF, PLACE * 1.2);
    const ds = stools.map((v) => depthOf({ w, doorEdge }, v));
    const step = PLACE * 1.2;
    // L'embrasure reste libre : la première place debout est à une silhouette de la porte. Vitrine minuscule (comptoir
    // plus étroit qu'une place) : pas de tabouret, des places debout sur toute la largeur.
    const near = ds.length ? range(HALF + PLACE, Math.min(...ds) - step, step) : range(HALF + PLACE, w - HALF, step);
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
  // Tables : celles qui sont peintes (deux chaises de part et d'autre), sinon une grille selon la largeur.
  const nTables = family === 'table' ? Math.max(1, Math.floor((w - PLACE) / 18)) : 0;
  const tableXs = family !== 'table' ? [] : painted.tables.length ? painted.tables.map((t) => t.x) : Array.from({ length: nTables }, (_, i) => PLACE + ((i + 0.5) * (w - 2 * PLACE)) / nTables);
  const tables = tableXs.map((cx) => ({ x: cx, seats: [clamp(cx - 3, HALF, w - HALF), clamp(cx + 3, HALF, w - HALF)] as [number, number] }));
  // Fauteuils : ceux qui sont peints, sinon une grille ; dès deux sièges, celui côté porte sert de chaise d'attente ; sinon
  // on attend debout, juste passé la porte (spots).
  const nChairs = family === 'chair' ? Math.max(1, Math.floor((w - PLACE) / 14)) : 0;
  const seats = family !== 'chair' ? [] : painted.chairs.length ? painted.chairs.map((c) => depthOf({ w, doorEdge }, c.x)).sort((a, b) => a - b)
    : Array.from({ length: nChairs }, (_, i) => PLACE + HALF + ((i + 0.5) * (w - 2 * PLACE - HALF)) / nChairs);
  const waiting = seats.length >= 2 ? [x(seats[0]!)] : [];
  const chairs = (seats.length >= 2 ? seats.slice(1) : seats).map(x);
  if (family === 'chair' && waiting.length === 0) spots = [x(HALF)];
  const back = x(w - HALF);
  const window = [x(HALF + PLACE), ...(w >= 80 ? [x(w / 2)] : [])];
  const seatH = painted.chairs[0]?.seat ?? painted.tables[0]?.seat ?? 2.6;
  return { w, doorEdge, counter, posts, queue, spots, tables, chairs, waiting, back, window, floorLine: painted.floorLine, seatH };
}
