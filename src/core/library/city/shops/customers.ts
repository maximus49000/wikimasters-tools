import { WORLD_MARGIN, hashString, mulberry32 } from '../../scene-world';
import { TURN_S, facingYaw, turnYaw } from '../../figure/gait';
import { endDoorOf } from '../doors';
import { THRESHOLD_S, passageAt, type Passage } from '../doorway';
import type { CityIntensity } from '../intensity';
import { STREET_SCALE, WALK_PACE } from '../metrics';
import { outfitFor, type Outfit, type Profile } from '../people';
import { SHOP_DEFS, type ShopTypeId } from './catalog';
import { gestureAt, SHOP_FAMILY, takesAway, type Pose } from './gestures';
import { crowdAt } from './hours';
import type { Rect, ShopFrame, ShopSlot } from './slots';
import type { ShopView } from './view';

// Clients : comme les habitants (doors.ts), un aller-retour avec un arrêt DANS le magasin. Il vient du bord du monde (ou d'une
// entrée d'immeuble, `endDoorX`, quand le bord est hors plafond), se tourne et passe de dos le seuil de la porte du local,
// marche derrière la vitrine jusqu'à sa place, s'y tourne, reste, revient au bord de la vitrine, ressort de face par la porte,
// fait demi-tour et repart d'où il est venu. Jamais de fondu : il n'apparaît et ne disparaît qu'au bord du monde ou dans
// l'ombre d'une porte. Deux visites par local et par cycle de VISIT_CYCLE secondes ; présence tirée par (visite, tour de cycle).
export const VISIT_CYCLE = 240;
// Réglage global du dessin classique : avec deux visites par local, la moyenne reste vers 4 clients en route par 720 px.
export const CLASSIC_CUSTOMER_SCALE = 0.55;
// Affluence G4b (scène Ghibli des commerces, spec §6) : boutiques plus peuplées, capacité intérieure par famille.
export const CUSTOMER_SCALE = 0.8;
// Taille d'un client derrière la vitrine (repère de la vitrine, px du monde) : celle du vendeur (0,5) un peu réduite, pour que
// la tête tienne dans la vitrine (21 px de haut) quand il se tient au bord du sol.
export const INSIDE_SCALE = 0.45;
// Repli d'un trajet de client (aller ET retour dans le cycle) : au plus lent (16 × 0,7 = 11,2 px/s), 2 × 900 px ≈ 161 s,
// plus 60 s de séjour et, par sens, un seuil et un demi-tour à chaque bout (≈ 6 s en tout) : ≈ 227 s, sous VISIT_CYCLE − 1.
export const MAX_VISIT_FALLBACK_PX = 900;
// Demi-largeur d'un client dans le dessin (unités du sprite) : la marche intérieure commence et finit une demi-silhouette AU-DELÀ
// du bord de la vitrine, le corps glisse derrière le montant au lieu d'apparaître à moitié.
export const FIGURE_HALF_UNITS = 6;
// Part du séjour au plus consacrée à chaque marche intérieure (vitrine très large : il marche plus vite, pas plus longtemps).
const INNER_WALK_SHARE = 0.3;

// `endDoorX` : centre de l'entrée d'immeuble d'où il vient et où il repart (null : bord du monde). `shopDoor` : porte du local
// (px du monde) ; `window` : vitrine (bord gauche, largeur), où il marche en repère local (0 = bord gauche de la vitrine).
export type Visit = { id: string; slotId: string; doorX: number; endDoorX: number | null; dir: 1 | -1; speed: number; phase: number; stay: number; outfit: Outfit; scale: number;
  // Type du commerce au calcul des visites (null si inconnu) et place du client dans l'intérieur, selon la famille.
  type: ShopTypeId | null;
  seat: { x: number; facing: 1 | -1 };
  shopDoor: Rect;
  window: { x: number; w: number };
};

// Places (fractions de la vitrine) des deux clients : au fauteuil, à la table, sinon devant le comptoir/rayon.
const SEAT_FRACTIONS = { chair: [0.3, 0.68], table: [0.3, 0.72], other: [0.35, 0.7] } as const;

// `doorXs` : centres des entrées d'immeubles (bouts de trajet possibles, même règle que les habitants : endDoorOf) ; `width` :
// largeur du monde (infinie par défaut : jamais de porte au bout). Il arrive en marchant dans le sens `dir`, repart en sens inverse.
export function visitsFor(slots: ShopSlot[], frames: Map<string, ShopFrame>, seed: number, typeOf: (slotId: string) => ShopTypeId | null, doorXs: readonly number[] = [], width = Infinity): Visit[] {
  const rng = mulberry32(seed ^ hashString('shop-visits'));
  const out: Visit[] = [];
  for (const slot of slots) {
    const f = frames.get(slot.id)!;
    const type = typeOf(slot.id);
    const family = type ? SHOP_FAMILY[type] : null;
    const fractions = family === 'chair' ? SEAT_FRACTIONS.chair : family === 'table' ? SEAT_FRACTIONS.table : SEAT_FRACTIONS.other;
    for (let k = 0; k < 2; k++) {
      const seatX = f.window.x + f.window.w * fractions[k]!;
      const profile: Profile = rng() < 0.2 ? 'suit' : 'ordinary';
      const doorX = f.door.x + f.door.w / 2;
      const dir: 1 | -1 = rng() < 0.5 ? 1 : -1;
      out.push({
        id: `${slot.id}-v${k}`,
        slotId: slot.id,
        doorX,
        // Il vient du côté opposé à son sens de marche : le bout du trajet est cherché dans le sens −dir.
        endDoorX: endDoorOf(doorX, (-dir) as 1 | -1, width, doorXs, MAX_VISIT_FALLBACK_PX),
        dir,
        speed: (16 + rng() * 8) * WALK_PACE,
        phase: rng() * VISIT_CYCLE,
        stay: 20 + rng() * 40,
        outfit: outfitFor(profile, rng),
        scale: 0.95 + rng() * 0.15,
        type,
        // Le client regarde vers le centre de la vitrine.
        seat: { x: seatX, facing: seatX <= f.window.x + f.window.w / 2 ? 1 : -1 },
        shopDoor: f.door,
        window: { x: f.window.x, w: f.window.w },
      });
    }
  }
  return out;
}

// Étapes : `in` (rue, et seuil de l'entrée d'immeuble de départ), `enter` (seuil de la porte du local, de dos), `inside`
// (derrière la vitrine), `exit` (seuil de la porte du local, de face, puis demi-tour), `out` (rue, et seuil d'arrivée).
// `passage` : sur le trottoir ou dans une porte (null dans le local) ; `inner` : dans le local (null ailleurs), x local à la vitrine.
// `inner.gait` : `step` pendant qu'il se tourne (petits pas sur place), `stand` / `seated` à sa place (selon la famille).
export type VisitStage = 'in' | 'enter' | 'inside' | 'exit' | 'out';
export type InnerGait = 'walk' | 'step' | 'stand' | 'seated';
export type VisitInner = { x: number; yaw: number; gait: InnerGait; walked: number };
export type VisitState = { stage: VisitStage; x: number; passage: Passage | null; inner: VisitInner | null; gesture: Pose | null; carry: boolean };

// Aller (bord ou entrée d'immeuble → porte du local) et retour (porte du local → même bout), au sens de passageAt ; durée d'un sens.
const legs = (v: Visit, width: number) => {
  const edge = v.dir > 0 ? -WORLD_MARGIN : width + WORLD_MARGIN;
  const far = v.endDoorX ?? edge;
  const go = { fromX: far, toX: v.doorX, dir: v.dir, speed: v.speed, fromDoor: v.endDoorX !== null, toDoor: true };
  const back = { fromX: v.doorX, toX: far, dir: (-v.dir) as 1 | -1, speed: v.speed, fromDoor: true, toDoor: v.endDoorX !== null };
  const length = Math.abs(v.doorX - far) / v.speed + (v.endDoorX !== null ? THRESHOLD_S + TURN_S : 0) + TURN_S + THRESHOLD_S;
  return { go, back, length };
};

const seatedFamily = (type: ShopTypeId | null): boolean => type !== null && (SHOP_FAMILY[type] === 'chair' || SHOP_FAMILY[type] === 'table');

// Dans le local (`c` : secondes depuis l'entrée) : de derrière le bord de la vitrine côté porte jusqu'à sa place, à l'allure du client ramenée
// à sa taille dans la vitrine (INSIDE_SCALE contre STREET_SCALE.person), demi-tour vers sa place (yaw 2 ou 6), séjour, retour.
const innerAt = (v: Visit, c: number): VisitInner => {
  const off = FIGURE_HALF_UNITS * INSIDE_SCALE * v.scale;
  const from = v.doorX < v.window.x + v.window.w / 2 ? -off : v.window.w + off;
  const to = v.seat.x - v.window.x;
  const sgn: 1 | -1 = to >= from ? 1 : -1;
  const dist = Math.abs(to - from);
  const speed = (v.speed * INSIDE_SCALE) / STREET_SCALE.person;
  const walk = Math.min(dist / speed, (v.stay - 2 * TURN_S) * INNER_WALK_SHARE);
  const pace = walk > 0 ? dist / walk : speed;
  const seatYaw = v.seat.facing > 0 ? 2 : 6;
  const goYaw = facingYaw(sgn);
  const backYaw = facingYaw((-sgn) as 1 | -1);
  const rest = v.stay - 2 * walk - 2 * TURN_S;
  let s = c;
  if (s < walk) return { x: from + sgn * pace * s, yaw: goYaw, gait: 'walk', walked: pace * s };
  s -= walk;
  if (s < TURN_S) return { x: to, yaw: turnYaw(goYaw, seatYaw, s / TURN_S), gait: 'step', walked: dist };
  s -= TURN_S;
  if (s < rest) return { x: to, yaw: seatYaw, gait: seatedFamily(v.type) ? 'seated' : 'stand', walked: dist };
  s -= rest;
  if (s < TURN_S) return { x: to, yaw: turnYaw(seatYaw, backYaw, s / TURN_S), gait: 'step', walked: dist };
  s -= TURN_S;
  const back = Math.min(s, walk) * pace;
  return { x: to - sgn * back, yaw: backYaw, gait: 'walk', walked: dist + back };
};

// État d'une visite `t` secondes après la date d'origine, ou null si le client n'est pas en route (ni dans le local).
// Une visite trop longue pour le cycle (bord du monde au-delà du repli, sans entrée à portée) n'a jamais lieu.
// Geste (dessin classique) seulement à sa place ; objet emporté seulement dans la rue, après la porte.
export function visitAt(v: Visit, width: number, t: number): VisitState | null {
  const c = (((t + v.phase) % VISIT_CYCLE) + VISIT_CYCLE) % VISIT_CYCLE;
  const { go, back, length } = legs(v, width);
  if (!(2 * length + v.stay < VISIT_CYCLE - 1)) return null;
  if (c < length) {
    const p = passageAt(go, c)!;
    return { stage: c >= length - THRESHOLD_S ? 'enter' : 'in', x: p.x, passage: p, inner: null, gesture: null, carry: false };
  }
  if (c < length + v.stay) {
    const inner = innerAt(v, c - length);
    const still = inner.gait === 'stand' || inner.gait === 'seated';
    return { stage: 'inside', x: v.window.x + inner.x, passage: null, inner, gesture: still && v.type ? gestureAt(v.type, 'customer', t, hashString(v.id)) : null, carry: false };
  }
  const b = c - length - v.stay;
  const p = passageAt(back, b);
  if (!p) return null;
  const leaving = b < THRESHOLD_S + TURN_S;
  return { stage: leaving ? 'exit' : 'out', x: p.x, passage: p, inner: null, gesture: null, carry: !leaving && v.type !== null && takesAway(v.type) };
}

// Verrou du tirage (comme les habitants) : décidé au premier instant observé de chaque tour de cycle, gardé tout le tour ;
// un changement de minute (probabilité, plafond des figurants) ne fait ni apparaître ni disparaître un client en route.
export type VisitLock = Map<string, { turn: number; on: boolean }>;
// `commit` faux : lecture sans décider (rendu initial, avant que la boucle connaisse le plafond des figurants).
export function lockedVisit(lock: VisitLock, v: Visit, t: number, gate: number, commit = true): boolean {
  const turn = Math.floor((t + v.phase) / VISIT_CYCLE);
  const got = lock.get(v.id);
  if (got && got.turn === turn) return got.on;
  const on = gate > 0 && visitHappens(v, t, gate);
  if (commit) lock.set(v.id, { turn, on });
  return on;
}

export function visitHappens(v: Visit, t: number, gate: number): boolean {
  const turn = Math.floor((t + v.phase) / VISIT_CYCLE);
  return mulberry32(hashString(v.id) ^ Math.imul(turn, 2654435761))() < gate;
}

// Probabilité qu'une visite ait lieu : seulement si le local est ouvert ; affluence du type × activité de la ville.
// `scale` : CLASSIC_CUSTOMER_SCALE (visites du dessin classique) ou CUSTOMER_SCALE (scène G4b).
export function customerGate(view: ShopView, minutes: number, i: CityIntensity, scale = CLASSIC_CUSTOMER_SCALE): number {
  if (view.phase !== 'open' || !view.sign) return 0;
  return Math.min(1, crowdAt(SHOP_DEFS[view.sign.type], minutes) * Math.max(0.3, i.walkers) * scale);
}
