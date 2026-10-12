import { anchorsOf, keyString, type Anchor, type FigureKey } from '../../core/library/figure/bake';
import type { Work } from '../../core/library/figure/dress';
import type { ArmPose } from '../../core/library/figure/skeleton';
import type { CityMetrics } from '../../core/library/city/metrics';
import type { ShopTypeId } from '../../core/library/city/shops/catalog';
import { SHOP_FAMILY, type Family } from '../../core/library/city/shops/gestures';
import type { Rect } from '../../core/library/city/shops/slots';
import type { BudgetSprite } from '../../core/library/city/shops/sprite-budget';
import type { PropId } from '../../core/library/city/shops/scene/moves';
import { trackAt } from '../../core/library/city/shops/scene/score';
import { sidewalkPlan, type SidewalkPlan } from '../../core/library/city/shops/scene/sidewalk';
import { slotIndexAt } from '../../core/library/city/shops/scene/slots';
import type { ActorTrack, Score } from '../../core/library/city/shops/scene/types';
import type { Horn } from '../../core/library/city/traffic/horns';
import type { Sky } from '../../core/library/sky';
import { peekScore, slotGate, type ShopPlan } from './scene-scores';

// Lecture des partitions pour la boucle de la scène des commerces (G4b) : état d'exécution d'une boutique, fenêtre de
// visibilité et trottoir de chaque piste (mémoïsés par piste), klaxons, accroches du pantin, emplacements partagés (objets en
// main, montures, objets emportés, pictos) et figurants pour le plafond.

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
export type ShopRt = {
  plan: ShopPlan; open: boolean; gate: number; offset: number; still: boolean;
  winX: number; hSvg: number; floor: number; staffFloor: number; worktop: number; doorX: number; doorRect: Rect;
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
export function infoOf(track: ActorTrack, rt: ShopRt): Info {
  const geo = `${rt.doorX}|${rt.width}|${rt.doorXs.join(',')}`;
  const got = infos.get(track);
  if (got && got.geo === geo) return got;
  const plan = sidewalkPlan(track, { doorX: rt.doorX, width: rt.width, doorXs: rt.doorXs });
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
// Emplacement partagé : un exemplaire caché de chaque dessin, un seul visible, posé à l'accroche de qui le porte.
export type Slot = { node: Element; inner: Element; items: Map<string, Element>; shown: string | null };
// Ce qu'un emplacement montre à cette image : dessin `id` au point (x, y) de son calque, échelle `k` ; `pop` : saut du picto.
export type SlotAt = { id: string; x: number; y: number; k: number; pop?: { transform: string; opacity: string } };
export const slotsOf = (root: Element, sel: string, item: string, inner?: string): Slot[] =>
  [...root.querySelectorAll(`:scope > ${sel}`)].map((node) => {
    const items = new Map<string, Element>();
    for (const n of node.querySelectorAll(`[${item}]`)) items.set(n.getAttribute(item)!, n);
    return { node, inner: (inner ? node.querySelector(inner) : null) ?? node, items, shown: null };
  });
export function placeSlots(slots: readonly Slot[], list: readonly SlotAt[]): void {
  slots.forEach((slot, i) => {
    const p = list[i];
    setIf(slot.node, 'display', p ? 'inline' : 'none');
    const id = p ? p.id : null;
    if (slot.shown !== id) {
      if (slot.shown) setIf(slot.items.get(slot.shown) ?? null, 'display', 'none');
      if (id) setIf(slot.items.get(id) ?? null, 'display', 'inline');
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

// ---------- Plafond des figurants ----------
// Clients de la scène pour spriteBudget : chaque client visible dans la minute qui vient compte 1, avec son parti ; `served` :
// en plein geste dans la vitrine (à l'instant `t`, ou à sa première apparition dans la minute).
export function sceneBudgetOf(shops: readonly { rt: ShopRt }[], t: number): BudgetSprite[] {
  const out: BudgetSprite[] = [];
  for (const { rt } of shops) {
    if (rt.still || !rt.open) continue;
    const p = rt.plan;
    const sec = t + rt.offset;
    const n = slotIndexAt(p.type, sec);
    for (let idx = Math.max(0, n - 1); idx <= n + 1; idx++) {
      const sc = peekScore(p, idx, slotGate(p, idx, sec, rt.gate));
      if (!sc) continue;
      const tIn = sec - sc.start;
      for (const track of sc.tracks) {
        if (track.role !== 'customer') continue;
        const info = infoOf(track, rt);
        if (info.to < tIn || info.from > tIn + 60) continue;
        const v = trackAt(track, Math.max(tIn, info.from));
        const inside = v.where === 'inside';
        out.push({ id: track.id, kind: 'customer', x: inside ? rt.winX + v.x : rt.doorX, party: track.party ?? track.id, served: inside && v.gait !== 'walk' && !free(v.arms) });
      }
    }
  }
  return out;
}
