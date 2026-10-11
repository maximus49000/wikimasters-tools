import { Fragment, useEffect, useMemo, useReducer, useState, type ReactElement } from 'react';
import type { YMD } from '../core/library/city/calendar';
import { DOOR_DARK, THRESHOLD_S, doorDarkOpacity, type Passage } from '../core/library/city/doorway';
import { STREET_SCALE, type CityMetrics } from '../core/library/city/metrics';
import { outfitFor, type Outfit } from '../core/library/city/people';
import { SHOP_DEFS, type ShopTypeId } from '../core/library/city/shops/catalog';
import { ACCESSORY, gestureAt } from '../core/library/city/shops/gestures';
import { openRangeAt } from '../core/library/city/shops/hours';
import type { Rect, ShopFrame } from '../core/library/city/shops/slots';
import { RUSH_CLEAR_MIN, RUSH_LEAVE_MIN, WEATHER_HOLD, holdWeather, isBad, terraceAt, terraceGuestMoves, terraceGuests, terraceWeatherAt, type GuestMove, type TerraceAt, type TerraceRush, type TerraceState, type TerraceWeather } from '../core/library/city/shops/terrace';
import type { ShopView } from '../core/library/city/shops/view';
import { TURN_S, YAW_BACK, YAW_FRONT, facingYaw, phaseIndexOf, turnYaw, yawToward } from '../core/library/figure/gait';
import type { ArmPose } from '../core/library/figure/skeleton';
import { hashString, mulberry32 } from '../core/library/scene-world';
import type { Sky } from '../core/library/sky';
import { FADE_MS } from '../core/library/weather/weather-clock';
import type { Weather } from '../core/library/weather/weather-types';
import { PersonSprite, tone } from './city-sprites';
import { placeSill, sillBox, sillFigTransform } from './door-passage';
import type { FigureRegistry } from './figure/figure-host';
import { GhibliFigure, hideFigure, poseFigure, type PoseIn } from './figure/ghibli-figure';
import { AccessorySprite, GhibliPosed, applyGhibliPose, facingOfYaw, ghibliHandles, ghibliPoseOf, type GhibliPoseHandles } from './shop-gesture-sprites';

// Terrasses (vague 1b-iv-b) : bar, café, restaurant, salon de thé et pizzeria sortent des tables rondes (deux chaises chacune)
// sur le trottoir, devant la façade, selon le moteur (terrace.ts) : montage juste après l'ouverture (les tables glissent depuis
// la porte, un employé les sort), démontage avant la fermeture, rien par mauvais temps ni de 22 h à 7 h, parasols en plein soleil.
// Rendu à la minute (re-rendu React) ; les tables glissent par une transition CSS d'une minute ; le serveur qui va servir est
// placé par la boucle d'animation (collectWaiters / placeWaiters). Aucun id SVG.
// G3b : les convives arrivent et repartent à pied par la porte du local (jamais posés ni effacés sur leur chaise) ; en Ghibli,
// convives assis en geste de table, serveur et porteur en tablier sont des pantins posés par la boucle.

// Échelle du mobilier et des convives (un peu plus petits que les passants : le trottoir est étroit).
const TERRACE_SCALE = 0.9;
// Largeur de façade par table : les tables alternent sur deux rangs (contre la façade, puis vers la rue).
const TABLE_PITCH = 6.5;
const ROW_DEPTH = [0.35, 0.72] as const; // fraction de l'écart entre la ligne des portes et celle des passants
const SLIDE = 'transform 60s linear, opacity 0.4s ease';
// Le serveur se tient à côté de la table (unités du passant), du côté de la porte.
const WAITER_BESIDE = 9;

// ---------- Météo de la rue : relevés de la dernière minute et des WEATHER_HOLD précédentes ----------
// `rush` : averse en cours (minutes de mauvais temps d'affilée, temps d'avant), pour que la terrasse se vide à pied (terraceAt).
export type TerraceSky = { now: TerraceWeather; before: TerraceWeather; rush?: TerraceRush };
// Au-delà, l'averse a fini de vider la terrasse : inutile de compter plus loin.
const RUSH_SPAN = RUSH_LEAVE_MIN + RUSH_CLEAR_MIN + 1;

// Historique des relevés par minute d'horloge. Seuls les relevés réels de la minute courante sont gardés (`store`) ; les minutes
// manquantes de la fenêtre sont relues sur l'horloge de météo au passé À CHAQUE relevé, sans être gardées (dix lectures par
// minute) : un relevé pris avant que l'horloge ait sa vraie source (réglée par un effet du parent, après le montage de la ville)
// ne fige donc pas une fausse fenêtre pendant dix minutes. L'hystérésis tient dès l'ouverture de la scène.
export function weatherHistory(): { sample(read: (nowMs: number) => Weather, nowMs: number, store?: boolean): TerraceSky } {
  const seen = new Map<number, TerraceWeather>();
  return {
    sample(read, nowMs, store = true) {
      const minute = Math.floor(nowMs / 60_000);
      const now = terraceWeatherAt(read(nowMs));
      if (store) seen.set(minute, now);
      const past = (k: number): TerraceWeather => (k === 0 ? now : (seen.get(minute - k) ?? terraceWeatherAt(read(nowMs - k * 60_000))));
      const window: TerraceWeather[] = [];
      for (let k = 1; k <= WEATHER_HOLD; k++) window.push(past(k));
      // Averse : minutes de mauvais temps d'affilée (minute courante comprise), puis les WEATHER_HOLD minutes d'avant.
      let badFor = 0;
      while (badFor < RUSH_SPAN && isBad(past(badFor))) badFor++;
      const prior: TerraceWeather[] = [];
      for (let k = badFor; k < badFor + WEATHER_HOLD; k++) prior.push(past(k));
      for (const key of seen.keys()) if (key < minute - WEATHER_HOLD - RUSH_SPAN) seen.delete(key);
      return { now, before: holdWeather(window), rush: { badFor, beforeBad: holdWeather(prior) } };
    },
  };
}

// Sans horloge de météo (scène sans météo) : seulement le drapeau « pluie » du décor, sans soleil.
// Au montage, l'horloge peut encore rendre sa météo par défaut (useWeather lui donne sa source dans un effet, qui passe après
// ceux de la ville) puis fondre 30 s vers la vraie : deux relevés forcés (juste après les effets, puis à la fin du fondu), et
// aucun relevé gardé avant la fin du fondu.
export function useTerraceWeather(clock: { read(nowMs: number): Weather } | undefined, rainy: boolean, minutes: number): TerraceSky {
  const history = useMemo(() => weatherHistory(), [clock]);
  const settledAt = useMemo(() => Date.now() + FADE_MS, [clock]);
  const [resample, bump] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    if (!clock) return;
    const timers = [window.setTimeout(bump, 0), window.setTimeout(bump, FADE_MS + 100)];
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [clock]);
  // Effet de bord idempotent dans useMemo : l'historique ne fait qu'enregistrer le relevé de la minute (le même relevé refait
  // donne le même résultat) ; il est propre à cette horloge.
  return useMemo(() => {
    if (clock) {
      const now = Date.now();
      return history.sample((ms) => clock.read(ms), now, now >= settledAt);
    }
    const w: TerraceWeather = { rain: rainy, snow: false, storm: false, wind: false, sunny: false };
    return { now: w, before: w };
    // `minutes` : nouveau relevé à chaque minute de la scène ; `resample` : relevés forcés après le montage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, clock, rainy, minutes, resample, settledAt]);
}

// ---------- Géométrie ----------
const span = (f: ShopFrame): [number, number] => [Math.min(f.window.x, f.door.x), Math.max(f.window.x + f.window.w, f.door.x + f.door.w)];

// 2 à `max` tables selon la largeur de la façade.
export const tablesFor = (max: number, f: ShopFrame): number => {
  const [a, b] = span(f);
  return Math.min(max, Math.max(2, Math.floor((b - a) / TABLE_PITCH)));
};

// Place de chaque table (pied, repère du monde) : réparties sur la façade, en quinconce sur deux rangs.
export function terraceTables(f: ShopFrame, m: CityMetrics, n: number): { x: number; y: number; row: 0 | 1 }[] {
  const [a, b] = span(f);
  return Array.from({ length: n }, (_, i) => {
    const row = (i % 2) as 0 | 1;
    return { x: a + ((i + 0.5) * (b - a)) / n, y: m.doorY + (m.walkY - m.doorY) * ROW_DEPTH[row], row };
  });
}

// Avancée de chaque table entre la porte (0) et sa place (1) : au montage elles sortent une à une, au démontage elles rentrent
// dans l'ordre inverse ; posées sinon (et toujours en mouvement réduit).
function slideOf(state: TerraceState, progress: number, n: number, i: number, still: boolean): number {
  const clamp = (x: number): number => Math.min(1, Math.max(0, x));
  if (still) return 1;
  if (state === 'setting-up') return clamp(progress * n - i);
  if (state === 'clearing') return 1 - clamp(progress * n - (n - 1 - i));
  return 1;
}

// ---------- Serveur ----------
const WAITER_CYCLE = 36; // un aller-retour toutes les 36 s : 4 s de marche, 6 s à la table, 4 s de retour, le reste à l'intérieur
const WAITER_WALK = 4;
const WAITER_SERVE = 6;

// ---------- Trajets à pied (G3b) : convives qui arrivent ou repartent, serveur en pantin ----------
// Personne n'apparaît ni ne disparaît sur sa chaise : on sort de la porte du local (seuil de door-passage.ts), on marche en
// diagonale sur le trottoir jusqu'à la chaise (ou la table servie), on s'assoit ; au départ, l'inverse. Script de segments
// enchaînés depuis `start` (s), posé par la boucle ; avant et après, `before` / `after` : assis sur sa chaise, ou dans le local.
type TripSeg =
  | { k: 'door'; from: number; to: number; yaw: number; dur: number; arms?: ArmPose; item?: boolean }
  | { k: 'turn'; x: number; y: number; from: number; to: number; dur: number; arms?: ArmPose; item?: boolean }
  | { k: 'walk'; x0: number; y0: number; x1: number; y1: number; dur: number; arms?: ArmPose; item?: boolean }
  | { k: 'still'; x: number; y: number; yaw: number; dur: number; arms?: ArmPose; item?: boolean };
// `k` : px du monde par unité du pantin (phase des pas réglée sur la distance) ; `door` : ouverture de la porte du local.
export type TerraceTrip = { start: number; k: number; doorX: number; door: Rect; segs: TripSeg[]; before: 'seated' | 'gone'; after: 'seated' | 'gone' };
export type TripView =
  | { where: 'seated' }
  | { where: 'street'; x: number; y: number; pose: PoseIn; item: boolean }
  | { where: 'door'; passage: Passage; pose: PoseIn; item: boolean }
  | null;
const SEATED: TripView = { where: 'seated' };

function tripSegView(w: TerraceTrip, s: TripSeg, p: number, walked: number): TripView {
  const arms = s.arms;
  const item = s.item === true;
  switch (s.k) {
    case 'door': {
      const depth = s.from + (s.to - s.from) * p;
      return { where: 'door', item, passage: { stage: 'threshold', x: w.doorX, depth, yaw: s.yaw, gait: 'walk', walked }, pose: { yaw: s.yaw, gait: 'walk', phase: phaseIndexOf(walked / w.k + depth * 8), head: 0, arms } };
    }
    case 'turn':
      return { where: 'street', item, x: s.x, y: s.y, pose: { yaw: turnYaw(s.from, s.to, p), gait: 'step', phase: phaseIndexOf(walked / w.k), head: 0, arms } };
    case 'walk': {
      const dx = s.x1 - s.x0;
      const dy = s.y1 - s.y0;
      return { where: 'street', item, x: s.x0 + dx * p, y: s.y0 + dy * p, pose: { yaw: yawToward(dx, dy), gait: 'walk', phase: phaseIndexOf((walked + Math.hypot(dx, dy) * p) / w.k), head: 0, arms } };
    }
    default:
      return { where: 'street', item, x: s.x, y: s.y, pose: { yaw: s.yaw, gait: 'stand', phase: 0, head: 0, arms } };
  }
}
export function tripAt(w: TerraceTrip, t: number): TripView {
  if (t < w.start) return w.before === 'seated' ? SEATED : null;
  let c = t - w.start;
  let walked = 0;
  for (const s of w.segs) {
    if (c < s.dur) return tripSegView(w, s, s.dur > 0 ? c / s.dur : 1, walked);
    c -= s.dur;
    if (s.k === 'walk') walked += Math.hypot(s.x1 - s.x0, s.y1 - s.y0);
  }
  return w.after === 'seated' ? SEATED : null;
}
const tripLength = (segs: readonly TripSeg[]): number => segs.reduce((n, s) => n + s.dur, 0);

// Allure d'un convive (unités du pantin par seconde, ≈ celle des passants) ; temps debout à côté de sa chaise avant de s'asseoir
// (ou après s'être levé) ; marge pour avoir fini avant le rendu de la minute suivante.
const GUEST_PACE = 28;
const STAND_S = 0.6;
const TRIP_SLACK_S = 1.5;
const MINUTE_S = 60;
// Trajet d'un convive pendant sa minute d'arrivée (porte → chaise, puis assis) ou de départ (chaise → porte, puis dans le local).
// `rnd` (0..1) : départ étalé dans la minute, pour que les convives ne bougent pas tous ensemble ; fini avant la minute suivante.
export type SeatPlace = { x: number; y: number; yaw: number };
export function guestTripOf(move: 'arrive' | 'leave', since: number, seat: SeatPlace, doorX: number, door: Rect, m: CityMetrics, k: number, rnd: number): TerraceTrip {
  const dx = seat.x - doorX;
  const dy = seat.y - m.doorY;
  const fixed = 2 * THRESHOLD_S + 2 * TURN_S + STAND_S;
  const walkS = Math.min(MINUTE_S - TRIP_SLACK_S - fixed, Math.max(0.8, Math.hypot(dx, dy) / (k * GUEST_PACE)));
  const toSeat = yawToward(dx, dy);
  const toDoor = yawToward(-dx, -dy);
  const segs: TripSeg[] =
    move === 'arrive'
      ? [
          { k: 'door', from: 1, to: 0, yaw: YAW_FRONT, dur: THRESHOLD_S },
          { k: 'turn', x: doorX, y: m.doorY, from: YAW_FRONT, to: toSeat, dur: TURN_S },
          { k: 'walk', x0: doorX, y0: m.doorY, x1: seat.x, y1: seat.y, dur: walkS },
          { k: 'turn', x: seat.x, y: seat.y, from: toSeat, to: seat.yaw, dur: TURN_S },
          { k: 'still', x: seat.x, y: seat.y, yaw: seat.yaw, dur: STAND_S },
        ]
      : [
          { k: 'still', x: seat.x, y: seat.y, yaw: seat.yaw, dur: STAND_S },
          { k: 'turn', x: seat.x, y: seat.y, from: seat.yaw, to: toDoor, dur: TURN_S },
          { k: 'walk', x0: seat.x, y0: seat.y, x1: doorX, y1: m.doorY, dur: walkS },
          { k: 'turn', x: doorX, y: m.doorY, from: toDoor, to: YAW_BACK, dur: TURN_S },
          { k: 'door', from: 0, to: 1, yaw: YAW_BACK, dur: THRESHOLD_S },
        ];
  const spare = Math.max(0, MINUTE_S - TRIP_SLACK_S - tripLength(segs));
  return { start: since + rnd * spare, k, doorX, door, segs, before: move === 'arrive' ? 'gone' : 'seated', after: move === 'arrive' ? 'seated' : 'gone' };
}

// Serveur (les deux graphismes) : un aller-retour toutes les WAITER_CYCLE s ; il passe le seuil de la porte du local (jamais de
// fondu sur place), marche en diagonale jusqu'à la table tirée au sort (Ghibli : l'objet du commerce à la main droite), le pose
// (bras tendu), puis revient les mains vides et rentre.
const SERVE_YAW: Readonly<Record<1 | -1, number>> = { 1: 2, [-1]: 6 };
export function waiterTripAt(t: number, phase: number, doorX: number, door: Rect, m: CityMetrics, targets: readonly number[], y: number, k: number): TerraceTrip | null {
  if (targets.length === 0) return null;
  const turn = Math.floor((t + phase) / WAITER_CYCLE);
  const target = targets[(Math.imul(turn + 1, 2654435761) >>> 0) % targets.length]!;
  const out: 1 | -1 = target >= doorX ? 1 : -1;
  const there = yawToward(target - doorX, y - m.doorY);
  const back = yawToward(doorX - target, m.doorY - y);
  const serve = SERVE_YAW[out];
  const segs: TripSeg[] = [
    { k: 'door', from: 1, to: 0, yaw: YAW_FRONT, dur: THRESHOLD_S, arms: 'hold', item: true },
    { k: 'turn', x: doorX, y: m.doorY, from: YAW_FRONT, to: there, dur: TURN_S, arms: 'hold', item: true },
    { k: 'walk', x0: doorX, y0: m.doorY, x1: target, y1: y, dur: WAITER_WALK, arms: 'hold', item: true },
    { k: 'still', x: target, y, yaw: serve, dur: WAITER_SERVE / 2, arms: 'reach', item: true },
    { k: 'still', x: target, y, yaw: serve, dur: WAITER_SERVE / 2, arms: 'down' },
    { k: 'turn', x: target, y, from: serve, to: back, dur: TURN_S },
    { k: 'walk', x0: target, y0: y, x1: doorX, y1: m.doorY, dur: WAITER_WALK },
    { k: 'turn', x: doorX, y: m.doorY, from: back, to: YAW_BACK, dur: TURN_S },
    { k: 'door', from: 0, to: 1, yaw: YAW_BACK, dur: THRESHOLD_S },
  ];
  return { start: turn * WAITER_CYCLE - phase, k, doorX, door, segs, before: 'gone', after: 'gone' };
}

// Repère d'un trajet (échelle, porte du local) : un TerraceTrip, ou le script du porteur.
type TripFrame = { k: number; doorX: number; door: Rect };

// Nœuds d'un trajet : trottoir (`[data-trip-street]`) et seuil (`svg[data-trip-door]`), chacun avec sa figure ; objets tenus
// (`[data-item-hand]`) montrés par `display` quand le segment le dit. `ghibli` : pantins (jamais en miroir), sinon passant
// classique retourné selon le côté regardé.
type TripNodes = { street: Element | null; door: Element | null; streetFig: Element | null; doorFig: Element | null; items: Element[] };
const tripNodesOf = (root: Element): TripNodes => {
  const street = root.querySelector(':scope > [data-trip-street]');
  const door = root.querySelector(':scope > svg[data-trip-door]');
  return { street, door, streetFig: street?.querySelector('[data-figure]') ?? null, doorFig: door?.querySelector('[data-figure]') ?? null, items: [...root.querySelectorAll('[data-item-hand]')] };
};
const tripStreetT = (x: number, y: number, sgn: number, k: number): string => `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${(sgn * k).toFixed(3)} ${k.toFixed(3)})`;
function placeTrip(n: TripNodes, v: TripView, w: TripFrame, m: CityMetrics, figures: FigureRegistry | null): void {
  const onStreet = v?.where === 'street' ? v : null;
  const atDoor = v?.where === 'door' ? v : null;
  setIfChanged(n.street, 'visibility', onStreet ? 'visible' : 'hidden');
  setIfChanged(n.door, 'visibility', atDoor ? 'visible' : 'hidden');
  if (onStreet) {
    setIfChanged(n.street, 'transform', tripStreetT(onStreet.x, onStreet.y, figures ? 1 : facingOfYaw(onStreet.pose.yaw), w.k));
    if (figures) poseFigure(figures, n.streetFig, onStreet.pose);
  } else if (figures) hideFigure(figures, n.streetFig);
  if (atDoor && n.door) {
    placeSill(n.door, w.door, atDoor.passage, m, w.k, figures ? 1 : facingOfYaw(atDoor.pose.yaw));
    if (figures) poseFigure(figures, n.doorFig, atDoor.pose);
  } else if (figures) hideFigure(figures, n.doorFig);
  const held = (onStreet ?? atDoor)?.item === true ? 'inline' : 'none';
  for (const it of n.items) setIfChanged(it, 'display', held);
}

// Serveurs : trajet par la porte posé par la boucle ; `figures` : pantins (null : passant classique).
export type Waiter = { door: number; rect: Rect; targets: number[]; phase: number; y: number; k: number; nodes: TripNodes };
export function collectWaiters(root: Element): Waiter[] {
  const out: Waiter[] = [];
  for (const node of root.querySelectorAll('[data-terrace-waiter]')) {
    out.push({
      door: Number(node.getAttribute('data-door-x')),
      rect: JSON.parse(node.getAttribute('data-door-rect')!) as Rect,
      targets: (node.getAttribute('data-targets') ?? '').split(' ').filter(Boolean).map(Number),
      phase: Number(node.getAttribute('data-phase')),
      y: Number(node.getAttribute('data-y')),
      k: Number(node.getAttribute('data-k')),
      nodes: tripNodesOf(node),
    });
  }
  return out;
}
const setIfChanged = (node: Element | null, name: string, value: string): void => {
  if (node && node.getAttribute(name) !== value) node.setAttribute(name, value);
};
export function placeWaiters(waiters: Waiter[], t: number, m: CityMetrics, figures: FigureRegistry | null): void {
  for (const w of waiters) {
    const trip = waiterTripAt(t, w.phase, w.door, w.rect, m, w.targets, w.y, w.k);
    if (trip) placeTrip(w.nodes, tripAt(trip, t), trip, m, figures);
  }
}

// Convives : nœud assis (`[data-terrace-guest]`, sur sa chaise, dans le groupe de la table) et, pour celui qui arrive ou repart,
// nœud de trajet (`[data-terrace-trip]`, même clé). Le plafond des figurants cache le nœud assis (visibility) : le trajet est
// alors caché aussi. Pantin assis (`g`) : geste de la famille posé à chaque image.
export type TerraceGuestNode = { guest: Element; seat: Element | null; g: GhibliPoseHandles | null; type: ShopTypeId | null; seed: number; yaw: number; trip: TerraceTrip | null; nodes: TripNodes | null };
export function collectTerraceGuests(root: Element): TerraceGuestNode[] {
  const trips = new Map<string, Element>();
  for (const n of root.querySelectorAll('[data-terrace-trip]')) trips.set(n.getAttribute('data-terrace-trip')!, n);
  const out: TerraceGuestNode[] = [];
  for (const guest of root.querySelectorAll('[data-terrace-guest]')) {
    const tn = trips.get(guest.getAttribute('data-guest-key') ?? '') ?? null;
    const ghibli = guest.hasAttribute('data-yaw');
    out.push({
      guest,
      seat: guest.querySelector(':scope > [data-guest-seat]'),
      g: ghibli ? ghibliHandles(guest) : null,
      type: (guest.getAttribute('data-gesture-type') as ShopTypeId | null) ?? null,
      seed: Number(guest.getAttribute('data-gesture-seed') ?? 0),
      yaw: Number(guest.getAttribute('data-yaw') ?? 0),
      trip: tn ? (JSON.parse(tn.getAttribute('data-trip')!) as TerraceTrip) : null,
      nodes: tn ? tripNodesOf(tn) : null,
    });
  }
  return out;
}
export function placeTerraceGuests(guests: TerraceGuestNode[], t: number, m: CityMetrics, figures: FigureRegistry | null): void {
  for (const g of guests) {
    const muted = g.guest.getAttribute('visibility') === 'hidden';
    const v = g.trip ? tripAt(g.trip, t) : SEATED;
    const seated = v?.where === 'seated';
    setIfChanged(g.seat, 'display', seated ? 'inline' : 'none');
    if (g.g && figures) {
      if (seated && !muted && g.type) {
        const pose = gestureAt(g.type, 'customer', t, g.seed);
        applyGhibliPose(figures, g.g, ghibliPoseOf(pose, g.yaw, true), pose, true);
      } else hideFigure(figures, g.g.fig);
    }
    if (g.trip && g.nodes) placeTrip(g.nodes, muted || seated ? null : v, g.trip, m, figures);
  }
}

// ---------- Porteur des tables (les deux graphismes) ----------
// Les tables glissent par leur transition CSS d'une minute (avancée `from` → `to`, 0 à la porte, 1 à leur place) ; le porteur
// est placé par la boucle à côté de la table en mouvement, du côté opposé au sens de la glissade (il la pousse, bras en avant sur
// le plateau : `carry`). Montage, pour chaque table : il revient de la précédente et rentre la chercher, ressort par le seuil de
// la porte avec elle et l'accompagne jusqu'à sa place. Démontage : il sort, va jusqu'à la table, la pousse jusqu'à la porte et
// rentre avec elle. `p0` : avancée du montage (ou démontage) au début de la minute ; `span` : sa durée (min).
export type CarrierSpec = { mode: 'setup' | 'clear'; since: number; p0: number; span: number; doorX: number; door: Rect; y: number; doorY: number; k: number; places: number[]; from: number[]; to: number[] };
// Temps pour rejoindre la table en sortant de la porte (ou la porte en la quittant), et part maximale d'une table faite à vide.
const APPROACH_S = 1.2;
const EMPTY_SHARE = 0.3;
const sideOf = (x: number, doorX: number): 1 | -1 => (x >= doorX ? 1 : -1);
export function carrierAt(c: CarrierSpec, t: number): TripView {
  const n = c.places.length;
  if (n === 0) return null;
  const f = Math.min(1, Math.max(0, (t - c.since) / MINUTE_S));
  const q = Math.min(1 - 1e-9, c.p0 + f / c.span) * n;
  const j = Math.floor(q);
  const i = c.mode === 'setup' ? j : n - 1 - j;
  const len = (c.span * MINUTE_S) / n;
  const s = (q - j) * len;
  const pace = c.k * GUEST_PACE;
  const side = sideOf(c.places[i]!, c.doorX);
  const dir = c.mode === 'setup' ? side : ((-side) as 1 | -1);
  const tableX = c.doorX + (c.places[i]! - c.doorX) * (c.from[i]! + (c.to[i]! - c.from[i]!) * f);
  const cx = tableX - dir * WAITER_BESIDE * c.k;
  const door = (from: number, to: number, p: number, yaw: number, carry: boolean): TripView => {
    const depth = from + (to - from) * p;
    return { where: 'door', item: false, passage: { stage: 'threshold', x: c.doorX, depth, yaw, gait: 'walk', walked: 0 }, pose: { yaw, gait: 'walk', phase: phaseIndexOf(depth * 8), head: 0, arms: carry ? 'carry' : undefined } };
  };
  const walk = (x0: number, y0: number, x1: number, y1: number, p: number, carry: boolean): TripView => {
    const dx = x1 - x0;
    const dy = y1 - y0;
    return { where: 'street', item: false, x: x0 + dx * p, y: y0 + dy * p, pose: { yaw: yawToward(dx, dy), gait: 'walk', phase: phaseIndexOf((Math.hypot(dx, dy) * p) / c.k), head: 0, arms: carry ? 'carry' : undefined } };
  };
  // Avec la table : profil dans le sens de la glissade, pas réglés sur la distance parcourue depuis la porte.
  const along = (): TripView => ({ where: 'street', item: false, x: cx, y: c.y, pose: { yaw: facingYaw(dir), gait: 'walk', phase: phaseIndexOf((Math.abs(cx - c.doorX) + Math.abs(c.y - c.doorY)) / c.k), head: 0, arms: 'carry' } });
  if (c.mode === 'setup') {
    let s0 = 0;
    if (j > 0) {
      const prev = c.places[j - 1]!;
      const px = prev - sideOf(prev, c.doorX) * WAITER_BESIDE * c.k;
      const back = Math.min(len * EMPTY_SHARE, Math.hypot(px - c.doorX, c.y - c.doorY) / pace);
      if (s < back) return walk(px, c.y, c.doorX, c.doorY, s / back, false);
      if (s < back + THRESHOLD_S) return door(0, 1, (s - back) / THRESHOLD_S, YAW_BACK, false);
      s0 = back + THRESHOLD_S;
    }
    if (s < s0 + THRESHOLD_S) return door(1, 0, (s - s0) / THRESHOLD_S, YAW_FRONT, true);
    const a = (s - s0 - THRESHOLD_S) / APPROACH_S;
    return a < 1 ? walk(c.doorX, c.doorY, cx, c.y, a, true) : along();
  }
  const reach = Math.min(len * EMPTY_SHARE, Math.hypot(cx - c.doorX, c.y - c.doorY) / pace);
  if (s < THRESHOLD_S) return door(1, 0, s / THRESHOLD_S, YAW_FRONT, false);
  if (s < THRESHOLD_S + reach) return walk(c.doorX, c.doorY, cx, c.y, (s - THRESHOLD_S) / reach, false);
  // Dernière table : il est rentré un peu avant la fin du démontage (la terrasse disparaît alors du rendu).
  const end = len - (j === n - 1 ? TRIP_SLACK_S : 0);
  const home = end - THRESHOLD_S;
  if (s >= end) return null;
  if (s >= home) return door(0, 1, (s - home) / THRESHOLD_S, YAW_BACK, true);
  if (s >= home - APPROACH_S) return walk(cx, c.y, c.doorX, c.doorY, (s - home + APPROACH_S) / APPROACH_S, true);
  return along();
}
// Retour du porteur la minute qui suit le montage : de la dernière table posée à la porte, puis dans le local.
export function carrierHomeTrip(since: number, from: number, y: number, doorX: number, door: Rect, m: CityMetrics, k: number): TerraceTrip {
  const dx = doorX - from;
  const dy = m.doorY - y;
  const back = yawToward(dx, dy);
  const at = facingYaw(sideOf(from, doorX));
  const segs: TripSeg[] = [
    { k: 'turn', x: from, y, from: at, to: back, dur: TURN_S },
    { k: 'walk', x0: from, y0: y, x1: doorX, y1: m.doorY, dur: Math.max(0.8, Math.hypot(dx, dy) / (k * GUEST_PACE)) },
    { k: 'turn', x: doorX, y: m.doorY, from: back, to: YAW_BACK, dur: TURN_S },
    { k: 'door', from: 0, to: 1, yaw: YAW_BACK, dur: THRESHOLD_S },
  ];
  return { start: since, k, doorX, door, segs, before: 'gone', after: 'gone' };
}
export type Carrier = { nodes: TripNodes; spec: CarrierSpec | null; trip: TerraceTrip | null };
export function collectCarriers(root: Element): Carrier[] {
  const out: Carrier[] = [];
  for (const node of root.querySelectorAll('[data-terrace-carrier]')) {
    const spec = node.getAttribute('data-carrier');
    const trip = node.getAttribute('data-trip');
    out.push({ nodes: tripNodesOf(node), spec: spec ? (JSON.parse(spec) as CarrierSpec) : null, trip: trip ? (JSON.parse(trip) as TerraceTrip) : null });
  }
  return out;
}
export function placeCarriers(carriers: Carrier[], t: number, m: CityMetrics, figures: FigureRegistry | null): void {
  for (const c of carriers) {
    if (c.spec) placeTrip(c.nodes, carrierAt(c.spec, t), c.spec, m, figures);
    else if (c.trip) placeTrip(c.nodes, tripAt(c.trip, t), c.trip, m, figures);
  }
}

// ---------- Sprites (repère du passant : pieds à l'origine, il regarde vers +x) ----------
function TableSprite({ sky }: { sky: Sky }): ReactElement {
  const t = (c: string): string => tone(c, sky);
  return (
    <g data-table-top="">
      <ellipse cx={0} cy={0} rx={3} ry={0.8} fill={t('#3A3A40')} />
      <rect x={-0.7} y={-12} width={1.4} height={12} fill={t('#3A3A40')} />
      <ellipse cx={0} cy={-12.4} rx={6} ry={1.6} fill={t('#D9D4C7')} />
    </g>
  );
}
// Chaise de bistrot, dossier du côté extérieur (`side` : -1 à gauche de la table, 1 à droite).
function ChairSprite({ side, sky }: { side: -1 | 1; sky: Sky }): ReactElement {
  const c = tone('#6B4A2E', sky);
  return (
    <g data-terrace-chair="" transform={`translate(${side * 9} 0) scale(${side} 1)`}>
      <rect x={-3} y={-8.6} width={6} height={1.4} fill={c} />
      <rect x={2.2} y={-17} width={1.2} height={17} fill={c} />
      <rect x={-3} y={-8} width={1} height={8} fill={c} />
    </g>
  );
}
function ParasolSprite({ sky, hue }: { sky: Sky; hue: string }): ReactElement {
  const t = (c: string): string => tone(c, sky);
  return (
    <g data-parasol="">
      <rect x={-0.4} y={-40} width={0.8} height={28} fill={t('#5A5A5A')} />
      <path d="M-14 -37 Q0 -49 14 -37 Z" fill={t(hue)} />
      <path d="M-14 -37 Q-5 -45 0 -46.5 Q-3 -42 -5 -37 Z" fill={t('#F4F1E8')} opacity={0.85} />
      <path d="M14 -37 Q5 -45 0 -46.5 Q3 -42 5 -37 Z" fill={t('#F4F1E8')} opacity={0.85} />
    </g>
  );
}
// Tablier blanc par-dessus la tenue : le serveur se distingue des clients.
function Apron({ sky }: { sky: Sky }): ReactElement {
  return <rect data-apron="" x={-4.2} y={-21} width={8.4} height={13} rx={1} fill={tone('#F4F1E8', sky)} />;
}

type TerraceProps = {
  view: ShopView;
  frame: ShopFrame;
  metrics: CityMetrics;
  minutes: number;
  date: YMD;
  weather: TerraceSky;
  // Affluence (0..1) déjà réglée sur l'activité de la rue : chance qu'une chaise soit prise.
  crowd: number;
  // Affluence aux minutes voisines (arrivées et départs des convives) ; absente : celle de la minute.
  crowdNear?: (minute: number) => number;
  reduced: boolean;
  sky: Sky;
  seed: number;
  // Tenue de l'employé qui sort le mobilier et sert : une figure en plus de l'équipe derrière la vitrine (l'invariant
  // « un local ouvert montre au moins une personne à l'intérieur » n'est pas touché).
  waiterOutfit: Outfit;
  // Ghibli (G3b) : convives, serveur et porteur en pantins, posés par la boucle.
  ghibli?: boolean;
};

const REST: PoseIn = { yaw: YAW_FRONT, gait: 'stand', phase: 0, head: 0 };
// Orientation d'un convive assis : tourné vers sa table, de trois quarts (place 0 à gauche de la table, place 1 à droite).
const SEAT_YAW: Readonly<Record<0 | 1, number>> = { 0: 2, 1: 6 };
const CHAIR_X = 9;

// Trajet rendu (trottoir + seuil de la porte du local) : la boucle le pose ensuite (placeTrip). `figure` : dessin de la personne
// pour une pose ; `sgn` du classique selon le côté regardé.
function TripBody({ v, trip, metrics, figure, ghibli }: { v: TripView; trip: TripFrame; metrics: CityMetrics; figure: (p: PoseIn, on: boolean, item: boolean) => ReactElement; ghibli: boolean }): ReactElement {
  const onStreet = v?.where === 'street' ? v : null;
  const atDoor = v?.where === 'door' ? v : null;
  const dPos: Passage = atDoor?.passage ?? { stage: 'threshold', x: trip.doorX, depth: 1, yaw: YAW_FRONT, gait: 'walk', walked: 0 };
  const { clip, dark } = sillBox(trip.door, dPos.depth, metrics, trip.k);
  const sgnOf = (p: PoseIn | undefined): number => (ghibli || !p ? 1 : facingOfYaw(p.yaw));
  const sx = onStreet ? onStreet.x : trip.doorX;
  const sy = onStreet ? onStreet.y : metrics.doorY;
  return (
    <>
      <g data-trip-street="" transform={tripStreetT(sx, sy, sgnOf(onStreet?.pose), trip.k)} visibility={onStreet ? 'visible' : 'hidden'}>
        {figure(onStreet ? onStreet.pose : REST, onStreet !== null, onStreet?.item === true)}
      </g>
      <svg data-trip-door="" x={clip.x.toFixed(2)} y={clip.y.toFixed(2)} width={clip.w.toFixed(2)} height={clip.h.toFixed(2)} overflow="hidden" visibility={atDoor ? 'visible' : 'hidden'}>
        <rect data-door-dark="" x={dark.x.toFixed(2)} y={dark.y.toFixed(2)} width={dark.w.toFixed(2)} height={dark.h.toFixed(2)} fill={DOOR_DARK} opacity={atDoor ? doorDarkOpacity(dPos.depth).toFixed(2) : '0.00'} />
        <g data-door-fig="" transform={sillFigTransform(dPos, clip, metrics, trip.k, sgnOf(atDoor?.pose))} opacity={(1 - dPos.depth).toFixed(2)}>
          {figure(atDoor ? atDoor.pose : REST, atDoor !== null, atDoor?.item === true)}
        </g>
      </svg>
    </>
  );
}

type Guest = { table: number; seat: 0 | 1; leavesAt: number };

export function ShopTerrace({ view, frame, metrics, minutes, date, weather, crowd, crowdNear, reduced, sky, seed, waiterOutfit, ghibli = false }: TerraceProps): ReactElement | null {
  // Début de la minute affichée (horloge murale) : repère des trajets des convives et du porteur.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const since = useMemo(() => Date.now() / 1000, [minutes]);
  // Premier rendu : les tables qui glissent sont posées où elles en sont au début de la minute, puis visent leur cible au rendu
  // suivant (la transition part de là, et non d'une table déjà sortie au montage de la scène) ; le porteur suit le même calcul.
  const [armed, arm] = useState(false);
  useEffect(() => arm(true), []);
  const type = view.sign?.type ?? null;
  if (!type || SHOP_DEFS[type].terrace === 0) return null;
  const def = SHOP_DEFS[type];
  const id = view.slot.id;
  // Météo d'une minute voisine : l'averse en cours (rush) est décalée d'autant (elle n'avait pas commencé la minute d'avant
  // sa première minute : temps d'avant l'averse) ; sans averse, la météo est supposée stable.
  const skyAround = (m: number): TerraceSky => {
    const r = weather.rush;
    if (!r || r.badFor === 0 || m === minutes) return weather;
    const bad = r.badFor + (m - minutes);
    if (bad <= 0) return { now: r.beforeBad, before: r.beforeBad, rush: { badFor: 0, beforeBad: r.beforeBad } };
    return { ...weather, rush: { badFor: bad, beforeBad: r.beforeBad } };
  };
  const stateAt = (m: number): TerraceAt => {
    const range = openRangeAt(def, date, m);
    const w = skyAround(m);
    return terraceAt(def, view.phase === 'open' && range !== null, m, w.now, range?.[0] ?? 0, range?.[1] ?? 0, w.before, w.rush);
  };
  const t = stateAt(minutes);
  if (t.state === 'none' || t.tables === 0) return null;
  const n = tablesFor(t.tables, frame);
  const places = terraceTables(frame, metrics, n);
  const now = terraceGuests(n, seed, id, minutes, crowd, t.state);
  const near = crowdNear ?? ((): number => crowd);
  const around = (m: number): Guest[] => terraceGuests(n, seed, id, m, near(m), stateAt(m).state);
  // Mouvement réduit : une personne assise par table au plus, immobile (ni arrivée ni départ). Sinon, ceux qui arrivent ou
  // repartent pendant la minute le font à pied (terraceGuestMoves) ; à l'averse, tous repartent pendant la minute « emptying ».
  const guests: (Guest & { move: GuestMove })[] = reduced
    ? now.filter((g, i) => now.findIndex((x) => x.table === g.table) === i).map((g) => ({ ...g, move: 'seated' }))
    : terraceGuestMoves(around(minutes - 1), now, around(minutes + 1));
  const k = metrics.unit * STREET_SCALE.person * TERRACE_SCALE;
  const door = frame.door;
  const doorX = door.x + door.w / 2;
  const hue = def.sign;
  const accessory = ACCESSORY[type];
  const sliding = t.state === 'setting-up' || t.state === 'clearing';
  // Glissade seulement pendant le montage et le démontage : une terrasse déjà posée (ouverte, parasols) n'a pas de transition,
  // sinon un nœud dont le style est résolu tard (onglet caché au montage) glisserait une minute depuis le coin (0, 0).
  const move = reduced || !sliding ? undefined : SLIDE;
  // Montage comme démontage : chaque table vise l'avancée de la minute suivante (la transition d'une minute l'y amène), comme le
  // hayon du camion ; à la dernière minute toutes sont donc à leur place (montage) ou rentrées par la porte (démontage).
  const ahead = sliding ? Math.min(1, t.progress + 1 / (t.span ?? 1)) : t.progress;
  const slides = places.map((_, i) => slideOf(t.state, ahead, n, i, reduced));
  const before = places.map((_, i) => slideOf(t.state, t.progress, n, i, reduced));
  const at = (i: number): number => doorX + (places[i]!.x - doorX) * (armed ? slides[i]! : before[i]!);
  const parasols = t.state === 'umbrellas';
  const waiterY = metrics.doorY + (metrics.walkY - metrics.doorY) * 0.5;
  // Porteur : script du montage ou du démontage ; la minute qui suit le montage, il revient de la dernière table et rentre.
  const lastSetup = !reduced && !sliding && stateAt(minutes - 1).state === 'setting-up';
  const carrierSpec: CarrierSpec | null =
    !reduced && sliding
      ? { mode: t.state === 'setting-up' ? 'setup' : 'clear', since, p0: t.progress, span: t.span ?? 1, doorX, door, y: waiterY, doorY: metrics.doorY, k, places: places.map((p) => p.x), from: before, to: slides }
      : null;
  const lastX = places[n - 1]!.x;
  const carrierHome = lastSetup ? carrierHomeTrip(since, lastX - (lastX >= doorX ? 1 : -1) * WAITER_BESIDE * k, waiterY, doorX, door, metrics, k) : null;
  const toward = (x: number): 1 | -1 => (x >= doorX ? 1 : -1);
  // Le serveur ne sert que ceux qui restent (pas pendant l'averse ni pendant le départ d'un convive).
  const served = t.state === 'emptying' ? [] : [...new Set(guests.filter((g) => g.move !== 'leave').map((g) => g.table))].map((i) => places[i]!.x - toward(places[i]!.x) * WAITER_BESIDE * k);
  const phase = (hashString(`${id}/waiter`) % 3600) / 100;
  const keyOf = (i: number, g: Guest): string => `${id}/${i}/${g.seat}/${g.leavesAt}`;
  const outfitOf = (i: number, g: Guest): Outfit => outfitFor('ordinary', mulberry32(seed ^ hashString(`${id}/terrace/${i}/${g.seat}/${g.leavesAt}`)));
  const gestureSeed = (i: number, g: { seat: 0 | 1 }): number => hashString(`${id}/terrace/${i}/${g.seat}`);
  const seatOf = (i: number, g: { seat: 0 | 1 }): SeatPlace => ({ x: places[i]!.x + (g.seat === 0 ? -CHAIR_X : CHAIR_X) * k, y: places[i]!.y, yaw: SEAT_YAW[g.seat] });
  // Trajets de la minute (arrivées et départs), dessinés juste après la table : derrière les tables du rang côté rue.
  const trips = new Map<string, TerraceTrip>();
  if (!reduced) {
    for (const g of guests) {
      if (g.move === 'seated') continue;
      const key = keyOf(g.table, g);
      trips.set(key, guestTripOf(g.move, since, seatOf(g.table, g), doorX, door, metrics, k, mulberry32(hashString(`${key}/trip`))()));
    }
  }
  // Rang du fond d'abord : les tables du rang côté rue passent devant.
  const order = places.map((p, i) => ({ p, i })).sort((a, b) => a.p.row - b.p.row || a.i - b.i);
  const guestFigure = (outfit: Outfit) => (p: PoseIn, on: boolean): ReactElement =>
    ghibli ? <GhibliFigure outfit={outfit} sky={sky} rainy={false} umbrella={false} initial={p} hidden={!on} /> : <PersonSprite outfit={outfit} sky={sky} rainy={false} umbrella={false} />;
  // Employé (serveur, porteur) : pantin en tablier (objet du commerce à la main droite pour le serveur), ou passant et tablier.
  const staffFigure = (withItem: boolean) => (p: PoseIn, on: boolean, held: boolean): ReactElement =>
    ghibli ? (
      <GhibliFigure
        outfit={waiterOutfit}
        sky={sky}
        rainy={false}
        umbrella={false}
        work="apron"
        initial={p}
        hidden={!on}
        held={withItem ? [{ anchor: 'handR', node: <g data-item-hand="" display={on && held ? 'inline' : 'none'}><AccessorySprite id={accessory} sky={sky} /></g> }] : undefined}
      />
    ) : (
      <>
        <PersonSprite outfit={waiterOutfit} sky={sky} rainy={false} umbrella={false} />
        <Apron sky={sky} />
      </>
    );
  const waiterTrip = !reduced && served.length > 0 ? waiterTripAt(since, phase, doorX, door, metrics, served, waiterY, k) : null;
  return (
    <g data-shop-terrace={id} data-terrace-state={t.state}>
      {order.map(({ p, i }) => {
        // Visible tant qu'elle est dehors ou qu'elle glisse pendant la minute (elle rentre par la porte, ou en sort).
        const shown = slides[i]! > 0 || before[i]! > 0;
        const here = guests.filter((g) => g.table === i);
        return (
          <Fragment key={i}>
            <g data-terrace-table={i} opacity={shown ? 1 : 0} style={{ transform: `translate(${at(i).toFixed(1)}px, ${p.y.toFixed(1)}px)`, transition: move }}>
              <g transform={`scale(${k.toFixed(3)})`}>
                <ChairSprite side={-1} sky={sky} />
                <ChairSprite side={1} sky={sky} />
                {here.map((g) => {
                  const key = keyOf(i, g);
                  const trip = trips.get(key);
                  const seatOn = !trip || tripAt(trip, since)?.where === 'seated';
                  const dx = g.seat === 0 ? -CHAIR_X : CHAIR_X;
                  const yaw = SEAT_YAW[g.seat];
                  const gseed = gestureSeed(i, g);
                  const pose = gestureAt(type, 'customer', reduced ? 0 : since, gseed);
                  return (
                    <g
                      key={`${g.seat}-${g.leavesAt}`}
                      data-terrace-guest=""
                      data-table={i}
                      data-seat={g.seat}
                      data-move={g.move}
                      data-guest-key={key}
                      data-seat-x={seatOf(i, g).x.toFixed(1)}
                      data-x={p.x.toFixed(1)}
                      {...(ghibli ? { 'data-yaw': yaw, 'data-gesture-type': type, 'data-gesture-seed': gseed } : {})}
                      transform={ghibli ? `translate(${dx} 0)` : `translate(${dx} 0) scale(${g.seat === 0 ? 1 : -1} 1)`}
                    >
                      <g data-guest-seat="" display={seatOn ? 'inline' : 'none'}>
                        {ghibli ? (
                          <GhibliPosed outfit={outfitOf(i, g)} sky={sky} rainy={false} accessory={accessory} figure={ghibliPoseOf(pose, yaw, true)} gesture={pose} seated hidden={!seatOn} />
                        ) : (
                          <PersonSprite outfit={outfitOf(i, g)} sky={sky} rainy={false} umbrella={false} seated />
                        )}
                      </g>
                    </g>
                  );
                })}
                <TableSprite sky={sky} />
                {parasols && <ParasolSprite sky={sky} hue={hue} />}
              </g>
            </g>
            {here.map((g) => {
              const key = keyOf(i, g);
              const trip = trips.get(key);
              if (!trip) return null;
              return (
                <g key={`trip-${key}`} data-terrace-trip={key} data-trip={JSON.stringify(trip)}>
                  <TripBody v={tripAt(trip, since)} trip={trip} metrics={metrics} figure={guestFigure(outfitOf(i, g))} ghibli={ghibli} />
                </g>
              );
            })}
          </Fragment>
        );
      })}
      {carrierSpec && (
        <g data-terrace-carrier="" data-carrier={JSON.stringify(carrierSpec)}>
          <TripBody v={carrierAt(carrierSpec, since)} trip={carrierSpec} metrics={metrics} figure={staffFigure(false)} ghibli={ghibli} />
        </g>
      )}
      {carrierHome && (
        <g data-terrace-carrier="" data-trip={JSON.stringify(carrierHome)}>
          <TripBody v={tripAt(carrierHome, since)} trip={carrierHome} metrics={metrics} figure={staffFigure(false)} ghibli={ghibli} />
        </g>
      )}
      {waiterTrip && (
        <g data-terrace-waiter="" data-door-x={doorX.toFixed(1)} data-door-rect={JSON.stringify(door)} data-targets={served.map((x) => x.toFixed(1)).join(' ')} data-phase={phase} data-y={waiterY.toFixed(1)} data-k={k.toFixed(4)}>
          <TripBody v={tripAt(waiterTrip, since)} trip={waiterTrip} metrics={metrics} figure={staffFigure(ghibli)} ghibli={ghibli} />
        </g>
      )}
    </g>
  );
}
