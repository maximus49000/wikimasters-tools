import type { Outfit } from '../../core/library/city/people';
import type { ShopTypeId } from '../../core/library/city/shops/catalog';
import { SHOP_FAMILY } from '../../core/library/city/shops/gestures';
import type { ShopFrame } from '../../core/library/city/shops/slots';
import type { StaffShift } from '../../core/library/city/shops/staff';
import type { ShopView } from '../../core/library/city/shops/view';
import { castFor } from '../../core/library/city/shops/scene/cast';
import { direct } from '../../core/library/city/shops/scene/director';
import type { PropId } from '../../core/library/city/shops/scene/moves';
import { ScoreCache, scoreKey } from '../../core/library/city/shops/scene/score';
import { SLOT_S, slotIndexAt, slotStart } from '../../core/library/city/shops/scene/slots';
import { stageFor, type Stage } from '../../core/library/city/shops/scene/stage';
import type { Score, SlotKey, StreetState } from '../../core/library/city/shops/scene/types';

// Partitions des commerces pour le rendu Ghibli (G4b) : plan d'une boutique (scène, capacité, employés), partitions des
// créneaux en cache (ScoreCache, 64), affluence du créneau figée à son début, et calcul étalé : `pumpScore` calcule au plus UNE
// partition par appel (une par image), d'abord le créneau courant des boutiques, puis le précédent (clients qui repartent dans la
// rue), puis le suivant (clients qui arrivent avant son début), bien avant la bascule.

// Employé du jour : `spans` = plages (s du jour) où il est derrière la vitrine, hors pause et hors geste du rideau.
export type SceneStaff = { id: string; outfit: Outfit; spans: readonly (readonly [number, number])[] };
// `open` : rideau levé à la minute (sinon la scène est cachée, le rideau roulant est dessiné avant elle).
export type SceneShop = { view: ShopView; frame: ShopFrame; staff: SceneStaff[]; open: boolean };
export type SceneEnv = { seed: number; day: number; street: (slotId: string, slotStartS: number, length: number) => StreetState };
export type ShopPlan = { id: string; type: ShopTypeId; frame: ShopFrame; stage: Stage; staff: SceneStaff[]; capacity: number; env: SceneEnv; L: number };

const cache = new ScoreCache(64);
// Affluence figée de chaque créneau (clé de la partition sans l'affluence) : la première vue pendant le créneau.
const gates = new Map<string, number>();
const GATE_MEMO_MAX = 512;
// Objets vus dans les partitions de chaque boutique (le rendu en pré-rend un exemplaire caché par nœud) ; ne fait que grandir.
const seenProps = new Map<string, Set<PropId>>();
const BASE_PROPS: readonly PropId[] = ['coin', 'card', 'accessory'];

// Clients servis à la fois (spec §6) : comptoir 4 dont la file, bar 7, restaurant une table par parti, salon fauteuils +
// attente ; caisse, rayon, machines : la place servie, la file et les places debout (4 au plus). Jamais moins d'un.
export function capacityOf(type: ShopTypeId, s: Stage): number {
  const f = SHOP_FAMILY[type];
  const n =
    f === 'counter' ? Math.min(4, 1 + s.queue.length)
      : f === 'drink' ? Math.min(7, s.spots.length)
        : f === 'table' ? s.tables.length
          : f === 'chair' ? s.chairs.length + s.waiting.length
            : Math.min(4, 1 + s.queue.length + s.spots.length);
  return Math.max(1, n);
}

export function planOf(shop: SceneShop, env: SceneEnv): ShopPlan {
  const type = shop.view.sign!.type;
  const stage = stageFor(type, shop.frame);
  return { id: shop.view.slot.id, type, frame: shop.frame, stage, staff: shop.staff, capacity: capacityOf(type, stage), env, L: SLOT_S(type) };
}

// Présence d'un employé dans un créneau (s depuis son début) : la plus longue de ses plages qui le recoupe ; null s'il n'y est pas.
export function presentIn(spans: SceneStaff['spans'], start: number, length: number): [number, number] | null {
  let best: [number, number] | null = null;
  for (const [a, b] of spans) {
    const lo = Math.max(a, start) - start;
    const hi = Math.min(b, start + length) - start;
    if (hi - lo > 1 && (!best || hi - lo > best[1] - best[0])) best = [lo, hi];
  }
  return best;
}

// Geste du rideau (ouvreur, fermeur) : la personne est dehors (StaffLayer) ; marge du script Ghibli (seuil, demi-tour, geste).
const SHUTTER_OUT_S = 15;
// Plages (s du jour) où un employé du jour est derrière la vitrine : de son entrée à sa sortie, hors pauses et hors geste du rideau.
export function staffSpans(sh: StaffShift): [number, number][] {
  const cuts: [number, number][] = sh.breaks.map(([a, b]) => [a * 60, b * 60]);
  for (const m of [sh.shutterUp, sh.shutterDown]) if (m !== undefined) cuts.push([m * 60, m * 60 + SHUTTER_OUT_S]);
  cuts.sort((x, y) => x[0] - y[0]);
  const out: [number, number][] = [];
  let from = sh.arriveAt * 60;
  for (const [a, b] of cuts) {
    if (a > from) out.push([from, Math.min(a, sh.leaveAt * 60)]);
    from = Math.max(from, b);
  }
  if (sh.leaveAt * 60 > from) out.push([from, sh.leaveAt * 60]);
  return out.filter(([a, b]) => b > a);
}

// Affluence au vingtième : une petite variation de minute ne change pas la partition du créneau suivant précalculé.
export const quantGate = (g: number): number => Math.round(Math.max(0, Math.min(1, g)) * 20) / 20;
const slotKey = (p: ShopPlan, index: number): SlotKey => ({ seed: p.env.seed, slotId: p.id, type: p.type, day: p.env.day, index });
const keyOf = (p: ShopPlan, index: number, gate: number): string => `${scoreKey(slotKey(p, index))}|${quantGate(gate)}`;

// Affluence d'un créneau : celle de sa première lecture (le suivant est lu, donc figé, quand on le précalcule), gardée ensuite —
// un changement d'affluence ou une fermeture en plein créneau ne recalcule jamais une partition déjà lue (personne ne saute ni
// ne disparaît) ; la fermeture n'empêche que les nouvelles admissions (placeScene).
export function slotGate(p: ShopPlan, index: number, gate: number): number {
  const k = scoreKey(slotKey(p, index));
  const memo = gates.get(k);
  if (memo !== undefined) return memo;
  const g = quantGate(gate);
  gates.set(k, g);
  while (gates.size > GATE_MEMO_MAX) gates.delete(gates.keys().next().value!);
  return g;
}

// Taille du cache réglée sur le nombre de boutiques lues (trois créneaux chacune, plus une marge) : jamais de va-et-vient.
export const sizeCache = (shops: number): void => cache.resize(3 * shops + 8);

export const peekScore = (p: ShopPlan, index: number, gate: number): Score | null => cache.peek(keyOf(p, index, gate));

export function makeScore(p: ShopPlan, index: number, gate: number): Score {
  const score = cache.get(keyOf(p, index, gate), () => {
    const key = slotKey(p, index);
    const start = slotStart(p.type, index);
    const staff = p.staff.flatMap((s) => {
      const present = presentIn(s.spans, start, p.L);
      return present ? [{ id: s.id, outfit: s.outfit, present }] : [];
    });
    const parties = castFor({ ...key, gate: quantGate(gate), capacity: p.capacity, dayMinutesAtStart: start / 60 });
    return direct({ key, frame: p.frame, staff, parties, street: p.env.street(p.id, start, p.L) });
  });
  const seen = seenProps.get(p.id) ?? new Set(BASE_PROPS);
  for (const tr of score.tracks) for (const s of tr.segments) if (s.prop) seen.add(s.prop);
  seenProps.set(p.id, seen);
  return score;
}

// Objets à pré-rendre pour une boutique (ordre stable).
export const propsOf = (p: ShopPlan): PropId[] => [...(seenProps.get(p.id) ?? BASE_PROPS)].sort();

// Créneaux à lire à `now` (s du jour) : courant, précédent (2 premières minutes : clients qui repartent), suivant (à partir du
// tiers du créneau : clients qui marchent vers la porte avant son début). Priorité : 0 courant, 1 précédent, 2 suivant.
export function slotsAt(p: ShopPlan, now: number): { index: number; prio: number }[] {
  const n = slotIndexAt(p.type, now);
  const into = now - slotStart(p.type, n);
  const out = [{ index: n, prio: 0 }];
  if (into < 120 && n > 0) out.push({ index: n - 1, prio: 1 });
  if (into > p.L / 3) out.push({ index: n + 1, prio: 2 });
  return out;
}

// Calcule au plus une partition manquante (la plus prioritaire) ; rend vrai si elle a calculé.
export function pumpScore(shops: readonly { plan: ShopPlan; gate: number }[], now: number): boolean {
  let pick: { plan: ShopPlan; index: number; gate: number; prio: number } | null = null;
  for (const { plan, gate } of shops) {
    for (const { index, prio } of slotsAt(plan, now)) {
      if (pick && prio >= pick.prio) continue;
      const g = slotGate(plan, index, gate);
      if (!peekScore(plan, index, g)) pick = { plan, index, gate: g, prio };
    }
  }
  if (!pick) return false;
  makeScore(pick.plan, pick.index, pick.gate);
  return true;
}
