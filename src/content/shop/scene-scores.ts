import type { Outfit } from '../../core/library/city/people';
import type { ShopTypeId } from '../../core/library/city/shops/catalog';
import { SHOP_FAMILY } from '../../core/library/city/shops/gestures';
import type { ShopFrame } from '../../core/library/city/shops/slots';
import type { StaffShift } from '../../core/library/city/shops/staff';
import type { ShopView } from '../../core/library/city/shops/view';
import { castFor } from '../../core/library/city/shops/scene/cast';
import { direct } from '../../core/library/city/shops/scene/director';
import { mayReserve } from '../../core/library/city/shops/scene/behaviors/staff';
import type { PropId } from '../../core/library/city/shops/scene/moves';
import { ScoreCache, scoreKey } from '../../core/library/city/shops/scene/score';
import { SLOT_S, slotIndexAt, slotStart } from '../../core/library/city/shops/scene/slots';
import { stageFor, type Stage } from '../../core/library/city/shops/scene/stage';
import type { Score, SlotKey, StreetState } from '../../core/library/city/shops/scene/types';

// Partitions des commerces pour le rendu Ghibli (G4b) : plan d'une boutique (scène, capacité, employés), partitions des
// créneaux en cache (ScoreCache), affluence du créneau tirée de sa minute de début, et calcul étalé : `pumpScore` calcule au plus UNE
// partition par appel (une par image), d'abord le créneau courant des boutiques, puis le précédent (clients qui repartent dans la
// rue), puis le suivant (clients qui arrivent avant son début), bien avant la bascule.

// Employé du jour : `spans` = plages (s du jour) où il est derrière la vitrine, hors pause et hors geste du rideau. Son rang dans
// la liste du jour (`SceneShop.staff`) fixe son poste et son rôle de renfort, les mêmes d'un créneau à l'autre.
export type SceneStaff = { id: string; outfit: Outfit; spans: readonly (readonly [number, number])[] };
// `open` : rideau levé à la minute (sinon la scène est cachée, le rideau roulant est dessiné avant elle).
export type SceneShop = { view: ShopView; frame: ShopFrame; staff: SceneStaff[]; open: boolean };
export type SceneEnv = { seed: number; day: number; street: (slotId: string, slotStartS: number, length: number) => StreetState };
// Affluence d'une boutique : un niveau fixe, ou l'affluence à une minute du jour (celle du début du créneau est lue).
export type GateOf = number | ((minutes: number) => number);
export type ShopPlan = { id: string; type: ShopTypeId; frame: ShopFrame; stage: Stage; staff: SceneStaff[]; capacity: number; env: SceneEnv; L: number };

const cache = new ScoreCache(64);
// Affluence figée de chaque créneau (clé de la partition sans l'affluence) : celle de sa première lecture rideau levé.
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

// Plages d'un employé dans un créneau (s depuis son début), dans l'ordre : une pause en plein créneau en donne deux.
export function piecesIn(spans: SceneStaff['spans'], start: number, length: number): [number, number][] {
  const out: [number, number][] = [];
  for (const [a, b] of spans) {
    const lo = Math.max(a, start) - start;
    const hi = Math.min(b, start + length) - start;
    if (hi - lo > 1) out.push([lo, hi]);
  }
  return out.sort((x, y) => x[0] - y[0]);
}

// Là au début du créneau qui commence à `start` (même règle que piecesIn : une plage de plus d'une seconde).
const coversStart = (spans: SceneStaff['spans'], start: number, length: number): boolean =>
  spans.some(([a, b]) => a <= start && Math.min(b, start + length) - start > 1);

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
// Identité d'un créneau pour les caches : sa clé et la géométrie de la vitrine (les ids des locaux sont des rangs : après un
// redimensionnement, le même local peut changer de largeur ; postes, file, porte et mobilier en dépendent).
const slotId = (p: ShopPlan, index: number): string => `${scoreKey(slotKey(p, index))}|${p.frame.window.x}|${p.frame.window.w}|${p.stage.doorEdge}`;
const keyOf = (p: ShopPlan, index: number, gate: number): string => `${slotId(p, index)}|${quantGate(gate)}`;

// Affluence d'un créneau : celle de la minute de son début (`gate` fonction : affluence du type à cette minute × intensité du
// moment ; un nombre : niveau fixe) — rechargement, seconde fenêtre et créneau suivant précalculé ont la même distribution.
// Figée à sa première lecture rideau levé — un changement d'intensité ou une fermeture en plein créneau ne recalcule jamais une
// partition déjà lue (personne ne saute ni ne disparaît) ; la fermeture n'empêche que les nouvelles admissions (placeScene).
// Rideau baissé (`open` faux) : lue sans être figée — à la réouverture (matin, pause de midi), le créneau la relit.
export function slotGate(p: ShopPlan, index: number, gate: GateOf, open = true): number {
  const k = slotId(p, index);
  const memo = gates.get(k);
  if (memo !== undefined) return memo;
  const g = quantGate(typeof gate === 'number' ? gate : gate(slotStart(p.type, index) / 60));
  if (!open) return g;
  gates.set(k, g);
  while (gates.size > GATE_MEMO_MAX) gates.delete(gates.keys().next().value!);
  return g;
}

// Taille du cache réglée sur le nombre de boutiques lues (trois créneaux chacune, plus une marge) : jamais de va-et-vient.
// Idempotent (le cache ne fait que grandir) : appelé au rendu, avant les calculs de partitions du rendu.
export const sizeCache = (shops: number): void => cache.resize(3 * shops + 8);

// Veille et lendemain d'un plan : même boutique, jour voisin, employés du jour ramenés aux secondes de ce jour (ceux qui passent
// minuit y sont). Autour de minuit, les créneaux voisins sont ceux de l'autre jour, sous LEUR clé : les clients du dernier
// créneau de la veille finissent leur visite après la bascule, et ceux qui marchent vers la porte avant minuit sont ceux du
// premier créneau du lendemain (la même partition, en cache, après la bascule).
export const DAY_S = 86400;
const eves = new WeakMap<ShopPlan, ShopPlan>();
const morrows = new WeakMap<ShopPlan, ShopPlan>();
function nextDayOf(p: ShopPlan, dir: 1 | -1): ShopPlan {
  const memo = dir < 0 ? eves : morrows;
  let e = memo.get(p);
  if (!e) {
    const staff = p.staff.map((s) => ({ ...s, spans: s.spans.map(([a, b]) => [a - dir * DAY_S, b - dir * DAY_S] as const) }));
    memo.set(p, (e = { ...p, env: { ...p.env, day: p.env.day + dir }, staff }));
  }
  return e;
}
export const eveOf = (p: ShopPlan): ShopPlan => nextDayOf(p, -1);
export const lastSlot = (p: ShopPlan): number => slotIndexAt(p.type, DAY_S - 1);
// Créneau `idx` (rang depuis le début du jour du plan : −1 = dernier de la veille, au-delà du dernier = lendemain) : plan, rang
// dans son jour, décalage à ajouter aux secondes du jour du plan pour celles de ce jour. Lu par la boucle à chaque image : un
// seul objet réutilisé (à lire aussitôt, jamais à garder).
type SlotRef = { plan: ShopPlan; index: number; dt: number };
const ref: SlotRef = { plan: null as unknown as ShopPlan, index: 0, dt: 0 };
export function slotRef(p: ShopPlan, idx: number): Readonly<SlotRef> {
  const per = lastSlot(p) + 1;
  ref.plan = idx < 0 ? eveOf(p) : idx >= per ? nextDayOf(p, 1) : p;
  ref.index = idx < 0 ? idx + per : idx >= per ? idx - per : idx;
  ref.dt = idx < 0 ? DAY_S : idx >= per ? -DAY_S : 0;
  return ref;
}

export const peekScore = (p: ShopPlan, index: number, gate: number): Score | null => cache.peek(keyOf(p, index, gate));

export function makeScore(p: ShopPlan, index: number, gate: number): Score {
  const score = cache.get(keyOf(p, index, gate), () => {
    const key = slotKey(p, index);
    const start = slotStart(p.type, index);
    // Rang dans la liste du jour (poste, renfort) ; plages du créneau (une pause en plein créneau : il revient). Bornes : à
    // l'arrière-boutique à la fin du créneau précédent (renfort en réserve, ou pas encore là : il entre par le fond), absent au
    // début du suivant (il y rentre avant la fin) — personne ne paraît ni ne disparaît à son poste à la bascule.
    const prev = start - p.L;
    const day = p.env.day;
    const staff = p.staff.flatMap((s, rank) => {
      const pieces = piecesIn(s.spans, start, p.L);
      if (!pieces.length) return [];
      const reserveBefore = mayReserve(s.id, day, rank) && p.staff.some((o, k) => k !== rank && coversStart(o.spans, prev, p.L) && !mayReserve(o.id, day, k));
      const fromBack = reserveBefore || !s.spans.some(([a, b]) => a < start - 1 && b >= start);
      const leaves = !coversStart(s.spans, start + p.L, p.L);
      return [{ id: s.id, outfit: s.outfit, present: pieces[0]!, later: pieces.slice(1), rank, fromBack, leaves }];
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

// Créneaux à lire à `now` (s du jour) : courant, précédent (2 premières minutes : clients qui repartent ; au premier créneau du
// jour, le dernier de la veille), suivant (à partir du tiers du créneau : clients qui marchent vers la porte avant son début).
// Priorité : 0 courant, 1 précédent, 2 suivant.
export function slotsAt(p: ShopPlan, now: number): { plan: ShopPlan; index: number; prio: number }[] {
  const n = slotIndexAt(p.type, now);
  const into = now - slotStart(p.type, n);
  const at = (idx: number, prio: number) => {
    const r = slotRef(p, idx);
    return { plan: r.plan, index: r.index, prio };
  };
  const out = [at(n, 0)];
  if (into < 120) out.push(at(n - 1, 1));
  if (into > p.L / 3) out.push(at(n + 1, 2));
  return out;
}

// Calcule au plus une partition manquante (la plus prioritaire) ; rend vrai si elle a calculé.
export function pumpScore(shops: readonly { plan: ShopPlan; gate: GateOf }[], now: number): boolean {
  let pick: { plan: ShopPlan; index: number; gate: number; prio: number } | null = null;
  for (const { plan: p, gate } of shops) {
    for (const { plan, index, prio } of slotsAt(p, now)) {
      if (pick && prio >= pick.prio) continue;
      const g = slotGate(plan, index, gate);
      if (!peekScore(plan, index, g)) pick = { plan, index, gate: g, prio };
    }
  }
  if (!pick) return false;
  makeScore(pick.plan, pick.index, pick.gate);
  return true;
}

// Oublie les affluences figées (tests).
export const forgetGates = (): void => gates.clear();
