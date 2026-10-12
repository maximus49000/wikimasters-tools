import { anchorsOf, keyString, type Anchor, type FigureKey } from '../../core/library/figure/bake';
import type { Work } from '../../core/library/figure/dress';
import type { ArmPose } from '../../core/library/figure/skeleton';
import type { CityMetrics } from '../../core/library/city/metrics';
import type { ShopTypeId } from '../../core/library/city/shops/catalog';
import { SHOP_FAMILY, type Family } from '../../core/library/city/shops/gestures';
import type { Rect } from '../../core/library/city/shops/slots';
import type { PropId } from '../../core/library/city/shops/scene/moves';
import { sidewalkPlan, type SidewalkPlan } from '../../core/library/city/shops/scene/sidewalk';
import type { ActorTrack, Score } from '../../core/library/city/shops/scene/types';
import type { Horn } from '../../core/library/city/traffic/horns';
import type { Sky } from '../../core/library/sky';
import type { GateOf, SceneStaff, ShopPlan } from './scene-scores';

// Lecture des partitions pour la boucle de la scène des commerces (G4b) : état d'exécution d'une boutique, fenêtre de
// visibilité et trottoir de chaque piste (mémoïsés par piste), klaxons, accroches du pantin, emplacements partagés (objets en
// main, montures, objets emportés, pictos).

export const STAFF_SCALE = 0.5;
// Objets tenus de la main gauche (lecture, carnet) ; objets emportés dans la rue.
export const HAND_L: ReadonlySet<PropId> = new Set<PropId>(['book', 'menu', 'notepad']);
export const CARRIED: ReadonlySet<PropId> = new Set<PropId>(['bag', 'parcel', 'bouquet', 'book', 'accessory']);
const APRON: ReadonlySet<Family> = new Set<Family>(['counter', 'drink', 'table']);
export const workOf = (type: ShopTypeId): Work => (APRON.has(SHOP_FAMILY[type]) ? 'apron' : 'none');
// Klaxon : portée (px du monde) et durée de la tête tournée (s).
const HORN_PX = 120;
const HORN_S = 1;

// État d'exécution d'une boutique, publié par ShopScene à chaque rendu (repère de la vitrine : y depuis le haut du <svg>).
// `offset` : seconde du jour − horloge murale ; `worktop` : ligne du plan de travail ; `floor` / `staffFloor` : pieds.
// `geo` : signature du trottoir (porte, largeur, entrées d'immeubles) ; `staffById` : employés du jour par id.
export type ShopRt = {
  plan: ShopPlan; open: boolean; gate: GateOf; offset: number; still: boolean; geo: string; staffById: ReadonlyMap<string, SceneStaff>;
  winX: number; winY: number; hSvg: number; floor: number; staffFloor: number; worktop: number; doorX: number; doorRect: Rect;
  // Ligne du sol peint et hauteur d'assise des sièges (repère du <svg> de la vitrine) : un client assis a les hanches sur le siège.
  floorLine: number; seatH: number;
  metrics: CityMetrics; width: number; doorXs: readonly number[]; sky: Sky; inSky: Sky; rainy: boolean; umbrella: boolean; work: Work;
};
export const runtimes = new WeakMap<Element, ShopRt>();

export const setIf = (node: Element | null, name: string, value: string): void => {
  if (node && node.getAttribute(name) !== value) node.setAttribute(name, value);
};
export const turnOn = (node: Element, on: boolean): void => {
  setIf(node, 'display', on ? 'inline' : 'none');
  setIf(node, 'data-active', on ? 'true' : 'false');
};

// ---------- Pistes ----------
// Fenêtre où la piste est visible (s du créneau : trottoir compris), trottoir, objet emporté.
export type Info = { geo: string; plan: SidewalkPlan | null; from: number; to: number; carry: PropId | null };
const infos = new WeakMap<ActorTrack, Info>();
// Première entrée de chaque parti d'une partition (le parti arrive ensemble à la porte).
const partyEnters = new WeakMap<Score, Map<string, number>>();
function partyEnter(sc: Score, track: ActorTrack): number | null {
  if (!track.party) return track.enter;
  let m = partyEnters.get(sc);
  if (!m) {
    m = new Map();
    for (const tr of sc.tracks) if (tr.party && tr.enter !== null) m.set(tr.party, Math.min(m.get(tr.party) ?? Infinity, tr.enter));
    partyEnters.set(sc, m);
  }
  return m.get(track.party) ?? null;
}
export function infoOf(track: ActorTrack, rt: ShopRt, sc: Score): Info {
  const got = infos.get(track);
  if (got && got.geo === rt.geo) return got;
  const geo = rt.geo;
  const plan = sidewalkPlan(track, { doorX: rt.doorX, width: rt.width, doorXs: rt.doorXs }, partyEnter(sc, track));
  const segs = track.segments;
  const last = segs[segs.length - 1];
  const from = Math.min(plan?.from ?? Infinity, segs[0]?.t0 ?? Infinity);
  const to = Math.max(plan?.to ?? -Infinity, last?.t1 ?? -Infinity);
  // Ce qu'il emporte dans la rue : l'objet de son dernier geste, s'il s'emporte (verre, tasse, monture restent au comptoir).
  const carry = last?.prop && CARRIED.has(last.prop) ? last.prop : null;
  const info = { geo, plan, from, to, carry };
  infos.set(track, info);
  return info;
}
const staffTracks = new WeakMap<Score, Map<string, ActorTrack>>();
export function staffTrack(sc: Score, id: string): ActorTrack | undefined {
  let m = staffTracks.get(sc);
  if (!m) staffTracks.set(sc, (m = new Map(sc.tracks.filter((t) => t.role === 'staff').map((t) => [t.id, t]))));
  return m.get(`staff:${id}`);
}
// Taille de chaque parti d'une partition (admission : tout le parti a sa place dans la réserve, ou personne).
const partySizes = new WeakMap<Score, Map<string, number>>();
export function partySize(sc: Score, party: string): number {
  let m = partySizes.get(sc);
  if (!m) {
    m = new Map();
    for (const tr of sc.tracks) if (tr.party) m.set(tr.party, (m.get(tr.party) ?? 0) + 1);
    partySizes.set(sc, m);
  }
  return m.get(party) ?? 1;
}

// Libre (pas en plein geste) : bras le long du corps ou en marche.
export const free = (arms: ArmPose): boolean => arms === 'down' || arms === 'swing';
// Rotation de tête d'un geste (radians, MOVES) en crans du pantin (π/8, −4…4).
export const headOf = (rad: number): number => Math.max(-4, Math.min(4, Math.round(rad / (Math.PI / 8))));
// Tête tournée vers un klaxon récent (≤ HORN_S) et proche (≤ HORN_PX) quand l'acteur est libre, sinon `head` : de trois quarts
// vers la rue, du côté du klaxon (surcouche du rendu, la partition n'en sait rien).
export function hornHead(horns: readonly Horn[], t: number, wx: number, yaw: number, head: number, ok: boolean): number {
  if (!ok) return head;
  for (let i = horns.length - 1; i >= 0; i--) {
    const h = horns[i]!;
    const age = t - h.t;
    if (age < 0 || age > HORN_S || Math.abs(h.x - wx) > HORN_PX) continue;
    const target = h.x >= wx ? 2 : 6;
    return Math.max(-4, Math.min(4, ((((target - yaw) % 16) + 24) % 16) - 8));
  }
  return head;
}

// ---------- Accroches et emplacements partagés ----------
const anchorCache = new Map<string, ReturnType<typeof anchorsOf>>();
// Point d'accroche du pantin (repère du sprite) ramené au calque : pieds en (x, y), échelle k.
export function anchorAt(key: FigureKey, anchor: Anchor, x: number, y: number, k: number): readonly [number, number] {
  const ks = keyString(key);
  let a = anchorCache.get(ks);
  if (!a) {
    if (anchorCache.size > 2048) anchorCache.clear();
    anchorCache.set(ks, (a = anchorsOf(key)));
  }
  const p = a[anchor];
  return [x + p[0] * k, y + p[1] * k];
}
// Emplacement partagé : un exemplaire caché de chaque dessin, un seul visible, posé à l'accroche de qui le porte. Emplacement
// à réserve (`pool`) : les dessins vivent dans une réserve cachée de la boutique (rendue par React, jamais déplacée) ; la
// boucle en clone une copie par emplacement et par dessin à la première demande (`clones`), posée dans l'emplacement.
export type Slot = { node: Element; inner: Element; items: Map<string, Element>; shown: string | null; pooled: boolean; cur: Element | null; clones: Map<string, Element> };
// Ce qu'un emplacement montre à cette image : dessin `id` au point (x, y) de son calque, échelle `k` ; `pop` : saut du picto.
export type SlotAt = { id: string; x: number; y: number; k: number; pop?: { transform: string; opacity: string } };
export const slotsOf = (root: Element, sel: string, item: string, inner?: string): Slot[] =>
  [...root.querySelectorAll(`:scope > ${sel}`)].map((node) => {
    const items = new Map<string, Element>();
    for (const n of node.querySelectorAll(`[${item}]`)) items.set(n.getAttribute(item)!, n);
    return { node, inner: (inner ? node.querySelector(inner) : null) ?? node, items, shown: null, pooled: false, cur: null, clones: new Map() };
  });
// Emplacements à réserve (`poolSel` : la réserve, sœur des emplacements) ; `prev` : les emplacements de la collecte précédente
// (leurs clones sont gardés tant que la réserve est la même, oubliés si elle a été re-rendue : autre ciel, autres objets).
export function pooledSlotsOf(root: Element, sel: string, poolSel: string, item: string, prev: readonly Slot[]): Slot[] {
  const pool = root.querySelector(`:scope > ${poolSel}`);
  const items = new Map<string, Element>();
  if (pool) for (const n of pool.querySelectorAll(`[${item}]`)) items.set(n.getAttribute(item)!, n);
  return [...root.querySelectorAll(`:scope > ${sel}`)].map((node, i) => {
    const old = prev[i];
    if (old && old.node === node && old.items.size === items.size && [...items].every(([k, v]) => old.items.get(k) === v)) return old;
    if (old?.cur) old.cur.remove();
    return { node, inner: node, items, shown: null, pooled: true, cur: null, clones: new Map() };
  });
}
export function placeSlots(slots: readonly Slot[], list: readonly SlotAt[]): void {
  slots.forEach((slot, i) => {
    const p = list[i];
    setIf(slot.node, 'display', p ? 'inline' : 'none');
    const id = p ? p.id : null;
    if (slot.shown !== id) {
      if (slot.pooled) {
        if (slot.cur) slot.cur.remove();
        slot.cur = null;
        if (id) {
          let el = slot.clones.get(id) ?? null;
          if (!el) {
            const base = slot.items.get(id);
            if (base) slot.clones.set(id, (el = base.cloneNode(true) as Element));
          }
          if (el) {
            slot.node.appendChild(el);
            slot.cur = el;
          }
        }
      } else {
        if (slot.shown) setIf(slot.items.get(slot.shown) ?? null, 'display', 'none');
        if (id) setIf(slot.items.get(id) ?? null, 'display', 'inline');
      }
      slot.shown = id;
    }
    if (!p) return;
    setIf(slot.node, 'transform', `translate(${p.x.toFixed(2)} ${p.y.toFixed(2)}) scale(${p.k.toFixed(3)})`);
    if (p.pop) {
      setIf(slot.inner, 'transform', p.pop.transform);
      setIf(slot.inner, 'opacity', p.pop.opacity);
    }
  });
}
