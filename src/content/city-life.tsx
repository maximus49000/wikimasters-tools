import { Fragment, useCallback, useContext, useId, useMemo, useRef, type ReactElement } from 'react';
import { activeFestivities, addDays, isoDate, publicHolidays } from '../core/library/city/calendar';
import { DOOR_WIDTH, TRIP_CYCLE, doorsFor, residentFlow, tripAt, tripHappens, tripsFor, type Trip } from '../core/library/city/doors';
import { DOOR_DARK, doorDarkOpacity, entranceOpening, type Passage } from '../core/library/city/doorway';
import { fixedFade, placeEvent, type EventFrame, type EventPlacement } from '../core/library/city/event-place';
import { EVENT_DEFS, type CityEvent } from '../core/library/city/events';
import { cityFacades } from '../core/library/city/facades';
import { cityIntensity, schoolWindows, type CityContext } from '../core/library/city/intensity';
import { schoolBusArrivals } from '../core/library/city/traffic/school-bus';
import { busArrivals, serviceKindOf } from '../core/library/city/traffic/bus-timetable';
import { lampLit as streetLampLit, lampsFor } from '../core/library/city/lamps';
import { STREET_SCALE, cityMetrics, type CityMetrics } from '../core/library/city/metrics';
import { actorShadow, nearestLamp } from '../core/library/city/night-light';
import { EDGE_PAD, festiveMark, pedShown, pedestrianGate, pedestriansFor, type Pedestrian } from '../core/library/city/people';
import { CUSTOMER_SCALE, customerGate, visitsFor, type Visit, type VisitLock } from '../core/library/city/shops/customers';
import { paradeOn } from '../core/library/city/parade';
import { inScene } from '../core/library/city/shops/scene/slots';
import { GHIBLI_SHOP_SPRITE_CAP, capFor } from '../core/library/city/shops/sprite-budget';
import { streetFor } from '../core/library/city/shops/scene/street';
import { dayNumber } from '../core/library/city/shops/hours';
import { SHOP_DEFS, type ShopTypeId } from '../core/library/city/shops/catalog';
import type { StaffShift } from '../core/library/city/shops/staff';
import type { Vehicle } from '../core/library/city/vehicles';
import { facingYaw, phaseIndexOf } from '../core/library/figure/gait';
import { loopX } from '../core/library/scene-world';
import type { Weather } from '../core/library/weather/weather-types';
import type { Sky } from '../core/library/sky';
import { useArtStyle } from './art-setting';
import { placeSill, sillBox, sillFigTransform } from './door-passage';
import { useFigureRegistry } from './figure/figure-host';
import { GhibliFigure, hideFigure, poseFigure, prewarmFigure, type PoseIn } from './figure/ghibli-figure';
import { CityEventSprite, eventWalked, poseEventFigures } from './city-event-sprites';
import { MarkHeld, markAnchor, markArms } from './festive-marks';
import { ShopCustomers, ShopOutdoors, ShopWorks, StaffLayer, collectPosedStaff, collectStaffWalks, collectSwaps, collectWorkers, dayShifts, placeCustomers, placeStaff, placeStaffWalks, placeSwaps, placeWorkers, setIfChanged, shopShutter, shopSpriteBudget, staffOutfit, type PlacedWorker, type PosedStaff, type Swap, type WalkingStaff } from './city-shops-life';
import { ShopScene, collectScene, muteScene, placeScene, sceneBudget, type SceneNodes } from './shop/shop-scene';
import { staffSpans, type SceneShop } from './shop/scene-scores';
import { MovingCrew, MovingTruck, collectMovers, movingLayout, placeMovers, type Crew } from './moving-truck';
import { FlypastLayer } from './flypast-sprite';
import { InstallLayer, collectFlags, placeFlags, type WavingFlag } from './install-layer';
import { ParadeCrowd } from './parade-crowd';
import { ParadeLayer } from './parade-layer';
import { interiorPost } from './shop-interiors';
import { PropContext, PropImage } from './prop/prop-host';
import '../core/library/paint/props/street';
import { ghibliStaffPost } from './shop/ghibli-shop-glass';
import { collectCarriers, collectCups, collectTerraceGuests, collectWaiters, placeCarriers, placeCups, placeTerraceGuests, placeWaiters, useTerraceWeather, type Carrier, type CupNode, type TerraceGuestNode, type Waiter } from './shop-terrace';
import { citizenSeed, kindOfProfile } from '../core/citizens/identity';
import { LampSprite, PersonSprite, tone } from './city-sprites';
import { FrontSidewalk } from './front-sidewalk';
import { BusStopRiders, CrossingLayer, Crosswalk, TrafficFixtures, TrafficLane, useTraffic } from './traffic-layer';
import { CROSS_HALF, type ScheduledArrival, type TrafficEnv } from '../core/library/city/traffic/engine';
import { SantaLayer } from './santa-layer';
import { useCityEvents } from './use-city-events';
import { useStreetShops } from './use-street-shops';
import { useWallClockLoop } from './use-wallclock-loop';
import { HALL_TIMER_S, crossingDoorX, hallLit, seedHallTimers } from '../core/library/city/hall-lights';
import { HallLights, hallTransition } from './hall-lights';

// Vie de la scène Ville : passants, habitants qui sortent de leur immeuble ou y rentrent, deux files de circulation,
// les événements de la ville (vague 1b-i), les clients des commerces et l'équipe d'un chantier (vague 1b-iv-a,
// city-shops-life.tsx). La présence (data-active, opacité) ne change qu'à la minute (re-rendu React) ou quand l'ensemble
// des événements change ; les positions sont posées par la boucle d'animation directement sur `transform`, sans re-rendu.
// Seuls les habitants et les clients voient aussi leur présence décidée par la boucle (un tirage par tour de cycle de
// trajet ou de visite).
// `forcedNight` : mode « Toujours la nuit » (les lampadaires restent allumés). `weather` : horloge de la météo de la scène
// (terrasses : pluie, vent, soleil, avec 10 min d'hystérésis) ; absente, seul `rainy` compte.
export type CityLifeProps = { width: number; height: number; sky: Sky; seed: number; city: CityContext; rainy: boolean; forcedNight?: boolean; weather?: { read(nowMs: number): Weather } };

// Écart entre un parent et chaque enfant qu'il accompagne (repère du sprite, avant l'échelle).
const COMPANION_GAP = 16;
// Couple (Saint-Valentin) : le second adulte marche à côté, à taille normale.
const PAIR_GAP = 13;
// Le moteur de circulation remplace les véhicules d'ambiance : plus de voitures à effacer devant les événements de rue.
const VAN_LABELS: Partial<Record<ShopTypeId, string>> = { bakery: 'BOULANGERIE', pastry: 'BOULANGERIE', cheese: 'LAITERIE', grocery: 'LAITERIE', minimarket: 'LAITERIE', florist: 'FLEURS', greengrocer: 'PRIMEURS', wine: 'VINS', butcher: 'BOUCHERIE', fishmonger: 'MARÉE' };
const NO_VEHICLES: Vehicle[] = [];
const NO_VISITS: Visit[] = [];
const NO_SHIFTS: StaffShift[] = [];
// Gestes des employés : posés au plus dix fois par seconde (les étapes durent au moins une demi-seconde).
const STAFF_POSE_S = 0.1;

const placementTransform = (p: EventPlacement): string => `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(${p.sx.toFixed(3)} ${p.sy.toFixed(3)})`;

type StreetLampsProps = { width: number; height: number; seed: number; minutes: number; daylight: number; forcedNight?: boolean; ghibli?: boolean };

// Lampadaires au bord du trottoir : dessinés devant les passants (leur pied est plus près de la rue) et derrière les voitures.
// Ils sont dans le calque animé (la boucle n'y touche pas) ; sans contexte de ville, SceneActors les dessine seuls.
// Ghibli : lampadaire cellulo peint (accessoire `lamp`, G5) au même repère, le sprite classique en repli tant qu'il n'est
// pas cuit ; sa lumière de nuit (découpe éclairée, bloom, pluie) est celle de GhibliNightLight (ghibli-night.tsx).
export function StreetLamps({ width, height, seed, minutes, daylight, forcedNight = false, ghibli = false }: StreetLampsProps): ReactElement {
  const lamps = useMemo(() => lampsFor(width, seed), [width, seed]);
  const m = cityMetrics(height);
  const curb = m.curb;
  return (
    <g data-street-lamps="">
      {lamps.map((lamp) => {
        const lit = streetLampLit(lamp, minutes, daylight, forcedNight);
        return (
          <g key={lamp.id} data-street-lamp={lamp.id} data-lit={lit ? 'true' : 'false'} transform={`translate(${lamp.x} ${curb.toFixed(1)}) scale(${(m.unit * STREET_SCALE.lamp).toFixed(3)})`}>
            {ghibli ? <PropImage spec={{ id: 'lamp', day: daylight, lit }} fallback={<LampSprite lit={lit} />} /> : <LampSprite lit={lit} />}
          </g>
        );
      })}
    </g>
  );
}

// Marge hors champ (px) d'un groupe : EDGE_PAD + étendue de ses accompagnants (unités du sprite, demi-largeur ~6 comprise) à l'échelle du passant.
// Reste sous WORLD_MARGIN (80) : chaque groupe sort entièrement du champ à chaque tour.
export const pedEdgePad = (p: Pedestrian, m: CityMetrics): number => {
  const trail = p.pair ? PAIR_GAP : p.companions.length * COMPANION_GAP;
  return EDGE_PAD + (trail + 6) * m.unit * STREET_SCALE.person * p.scale;
};

// Zones à contourner sur le trottoir des immeubles (revue du 2026-10-13, version légère) : sur [x0, x1], le passant se décale
// en douceur jusqu'à la ligne `y` — devant (côté bordure) pour longer une terrasse, derrière (côté façades) pour passer dans le
// dos des déménageurs ou des piétons qui attendent au passage piéton (dessinés après les passants, ils les cachent alors).
export type DodgeZone = { x0: number; x1: number; y: number };
// Distance (unités) sur laquelle le passant rejoint sa ligne de contournement.
const DODGE_RAMP = 12;
export function dodgeY(x: number, baseY: number, zones: readonly DodgeZone[], unit: number): number {
  let best = 0;
  let y = baseY;
  for (const z of zones) {
    const out = x < z.x0 ? z.x0 - x : x > z.x1 ? x - z.x1 : 0;
    const w = Math.max(0, 1 - out / (DODGE_RAMP * unit));
    if (w > best) {
      best = w;
      // Lissé (smoothstep) : pas de virage brusque.
      y = baseY + (z.y - baseY) * (w * w * (3 - 2 * w));
    }
  }
  return y;
}

// Pieds d'un passant (repère du monde). Légère profondeur sur le trottoir : les passants ne marchent pas tous sur la même ligne.
const pedFoot = (p: Pedestrian, m: CityMetrics, width: number, t: number, zones: readonly DodgeZone[] = []): { x: number; y: number } => {
  const x = loopX(p.phase, p.dir * p.speed, width, t);
  const y = m.walkY - (p.depth - 0.5) * m.unit * 6;
  return { x, y: zones.length > 0 ? dodgeY(x, y, zones, m.unit) : y };
};

// `mirror` : le sprite classique se retourne selon le sens ; le pantin Ghibli se tourne de profil (pedPose), sans miroir.
const pedTransform = (p: Pedestrian, m: CityMetrics, width: number, t: number, mirror: boolean, zones: readonly DodgeZone[] = []): string => {
  const { x, y } = pedFoot(p, m, width, t, zones);
  const k = m.unit * STREET_SCALE.person * p.scale;
  return `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${((mirror ? p.dir : 1) * k).toFixed(3)} ${k.toFixed(3)})`;
};

// Pose d'un passant Ghibli : profil dans le sens de marche, image réglée sur la distance (unités du pantin). Mouvement réduit
// (`still`) : debout, toujours de profil (pas de jambes figées en plein pas).
export const pedPose = (p: Pedestrian, m: CityMetrics, t: number, still = false): { yaw: number; gait: 'walk' | 'stand'; phase: number; head: 0 } => {
  if (still) return { yaw: facingYaw(p.dir), gait: 'stand', phase: 0, head: 0 };
  const k = m.unit * STREET_SCALE.person * p.scale;
  return { yaw: facingYaw(p.dir), gait: 'walk', phase: phaseIndexOf((p.phase + p.speed * t) / k), head: 0 };
};

// Ombre portée d'un passant par la lampe allumée la plus proche (Ghibli, nuit, notes §5) : pantin ≈ 40 × 11 unités du sprite.
const PED_SHADE = { h: 40, w: 11 } as const;
// `side` : sens de l'ombre (r = vers la droite, lampe à gauche), choisit le dégradé partagé.
type PedShade = { points: string; opacity: number; side: 'r' | 'l' } | null;
const pedShade = (p: Pedestrian, m: CityMetrics, width: number, t: number, litLamps: readonly { x: number }[], zones: readonly DodgeZone[] = []): PedShade => {
  const foot = pedFoot(p, m, width, t, zones);
  const lampX = nearestLamp(foot.x, litLamps);
  if (lampX === null) return null;
  const k = m.unit * STREET_SCALE.person * p.scale;
  const s = actorShadow(foot.x, foot.y, PED_SHADE.w * k, PED_SHADE.h * k, lampX, m.unit);
  return s && { ...s, side: foot.x >= lampX ? 'r' : 'l' };
};

// Pose l'ombre d'un passant (n'écrit que ce qui change ; sans ombre : opacité 0).
const placeShade = (node: Element, s: PedShade, fill: (side: 'r' | 'l') => string): void => {
  if (!s) {
    setIfChanged(node, 'opacity', '0');
    return;
  }
  node.setAttribute('points', s.points);
  setIfChanged(node, 'opacity', s.opacity.toFixed(2));
  setIfChanged(node, 'fill', fill(s.side));
};

// Habitant : le nœud de rue (`[data-resident]`) et le nœud de porte (`svg[data-resident-door]`, rogné à l'ouverture sombre
// de l'entrée) ne sont jamais visibles ensemble. Un seul nœud de porte par trajet : au seuil de l'AUTRE porte (`endDoorX`),
// son attribut x est réécrit (simple, sans nœud superflu ; d'une porte à l'autre, seul le x de l'ouverture change).
const residentScale = (trip: Trip, m: CityMetrics): number => m.unit * STREET_SCALE.person * trip.scale;
// `mirror` : le sprite classique se retourne selon le sens ; le pantin Ghibli se tourne par `yaw`.
const residentTransform = (trip: Trip, x: number, m: CityMetrics, mirror: boolean): string => {
  const k = residentScale(trip, m);
  return `translate(${x.toFixed(1)} ${m.doorY.toFixed(1)}) scale(${((mirror ? trip.dir : 1) * k).toFixed(3)} ${k.toFixed(3)})`;
};
// Centre de la porte du seuil en cours (la sienne, ou celle de l'autre immeuble au bout du trajet) : city/hall-lights.ts.
const tripDoorX = crossingDoorX;
const doorOpening = (centerX: number, m: CityMetrics) => entranceOpening(centerX - DOOR_WIDTH / 2, m);
// Pose Ghibli d'un habitant (rue : image réglée sur la distance ; seuil : la profondeur fait avancer les pas). Mouvement réduit
// (`still`) : debout, tourné dans le sens du passage.
const residentPose = (trip: Trip, pos: Passage, m: CityMetrics, still: boolean): { yaw: number; gait: 'walk' | 'step' | 'stand'; phase: number; head: 0 } =>
  still ? { yaw: pos.yaw, gait: 'stand', phase: 0, head: 0 } : { yaw: pos.yaw, gait: pos.gait, phase: phaseIndexOf(pos.walked / residentScale(trip, m) + pos.depth * 8), head: 0 };

// Verrou du tirage : décidé au premier instant observé de chaque tour de cycle, gardé tout le tour (un changement de minute,
// donc de probabilité, ne fait pas disparaître un habitant en route).
type TripLock = Map<string, { turn: number; on: boolean }>;
const lockedHappens = (lock: TripLock, trip: Trip, t: number, gate: number): boolean => {
  const turn = Math.floor((t + trip.phase) / TRIP_CYCLE);
  const got = lock.get(trip.id);
  if (got && got.turn === turn) return got.on;
  const on = tripHappens(trip, t, gate);
  lock.set(trip.id, { turn, on });
  return on;
};

// Habitants 3D : un trajet qui a lieu dans moins de WARM_AHEAD_S secondes (ou en cours) fait rendre d'avance les cycles de
// toutes ses poses (orientation × allure, relevées tous les quarts de seconde le long du trajet) : l'habitant sort de sa porte
// directement en 3D, sans pantin ni changement de modèle sous les yeux (il n'a pas d'attente waitFor3D : il apparaît en place).
export const WARM_AHEAD_S = 12;
type WarmCache = Map<string, { start: number; poses: PoseIn[] }>;
export function tripWarmPoses(trip: Trip, cache: WarmCache, width: number, t: number, gate: number, m: CityMetrics): PoseIn[] | null {
  const c = (((t + trip.phase) % TRIP_CYCLE) + TRIP_CYCLE) % TRIP_CYCLE;
  // Début du tour en cours si le trajet est en route, sinon du prochain.
  const start = tripAt(trip, width, t) !== null ? t - c : t - c + TRIP_CYCLE;
  if (start - t > WARM_AHEAD_S || !tripHappens(trip, start + 1, gate)) return null;
  let e = cache.get(trip.id);
  if (!e || Math.abs(e.start - start) > 0.5) {
    const seen = new Map<string, PoseIn>();
    let on = false;
    for (let dt = 0; dt < TRIP_CYCLE; dt += 0.25) {
      const p = tripAt(trip, width, start + dt);
      if (!p) {
        if (on) break;
        continue;
      }
      on = true;
      const pose = residentPose(trip, p, m, false);
      const k = `${pose.yaw}|${pose.gait}`;
      if (!seen.has(k)) seen.set(k, pose);
    }
    e = { start, poses: [...seen.values()] };
    cache.set(trip.id, e);
  }
  return e.poses;
}

// État d'un habitant à l'instant t : passage s'il a lieu ce tour-ci, et nœud visible (rue ou porte).
const residentView = (trip: Trip, lock: TripLock, gate: number, width: number, t: number): { pos: Passage | null; street: boolean; door: boolean } => {
  const raw = tripAt(trip, width, t);
  const pos = raw !== null && lockedHappens(lock, trip, t, gate) ? raw : null;
  return { pos, street: pos !== null && pos.stage !== 'threshold', door: pos !== null && pos.stage === 'threshold' };
};

// Opacité d'un événement : fondu des événements fixes, aucun fondu en mouvement réduit (opacité 1).
const eventOpacity = (e: CityEvent, t: number, still: boolean): string => (still ? '1' : fixedFade(e, t).toFixed(2));

export function CityLifeLayer({ width, height, sky, seed, city, rainy, forcedNight = false, weather }: CityLifeProps): ReactElement {
  const root = useRef<SVGGElement | null>(null);
  // Présence affichée de chaque passant, gardée entre les minutes : elle ne suit la présence voulue qu'au bord du monde.
  // Remise à zéro quand la population change (largeur, graine) : sinon des présences d'une autre population seraient reprises.
  const shownPeds = useRef<Map<string, boolean>>(new Map());
  const shownFor = useRef<Pedestrian[] | null>(null);
  // Verrou des tirages de trajets, gardé entre les minutes (remis à zéro si les trajets changent).
  const tripLock = useRef<TripLock>(new Map());
  const lockFor = useRef<Trip[] | null>(null);
  // Verrou des tirages de visites des commerces, gardé entre les minutes (les visites sont recalculées à chaque minute avec les
  // vues des locaux, mais leurs identifiants et tirages ne dépendent que de la rue) : remis à zéro si la rue change.
  const visitLock = useRef<VisitLock>(new Map());
  const visitLockFor = useRef('');
  // Calculs mémoïsés par (width, height, seed) : populations, entrées, trajets, façades. Recalculés par minute : intensités.
  const metrics = useMemo(() => cityMetrics(height), [height]);
  // Art Ghibli : les passants sont des pantins (sprites du registre de la pièce), posés par la boucle, sans miroir.
  const [art] = useArtStyle();
  const ghibli = art === 'ghibli';
  const figures = useFigureRegistry();
  // Images des accessoires (G5) : la boucle y prend les poses des drapeaux qui ondulent (install-layer.tsx, placeFlags).
  const props = useContext(PropContext);
  const peds = useMemo(() => pedestriansFor(width, seed), [width, seed]);
  if (shownFor.current !== peds) {
    shownFor.current = peds;
    shownPeds.current = new Map();
  }
  const doors = useMemo(() => doorsFor(width, height, seed), [width, height, seed]);
  const trips = useMemo(() => tripsFor(doors, seed, width), [doors, seed, width]);
  if (lockFor.current !== trips) {
    lockFor.current = trips;
    tripLock.current = new Map();
  }
  const doorXs = useMemo(() => doors.map((d) => d.x), [doors]);
  const facades = useMemo(() => cityFacades(width, height, seed), [width, height, seed]);
  const frame = useMemo<EventFrame>(() => ({ width, height, metrics, facades }), [width, height, metrics, facades]);
  const intensity = useMemo(() => cityIntensity(city), [city]);
  // Une entrée par lot : la probabilité par trajet est réduite selon le nombre d'entrées (≤ 6 habitants par 720 px).
  const flow = useMemo(() => residentFlow(intensity, city.minutes, doors.length, width), [intensity, city.minutes, doors.length, width]);
  const lights = sky.daylight < 0.5 || rainy;
  const gateOf = (trip: Trip): number => (trip.kind === 'out' ? flow.out : flow.in);
  const maskBase = `cm${useId().replace(/[^a-zA-Z0-9_-]/g, '')}-city-mask`;
  // Ombres portées des passants (Ghibli, nuit) : lampes allumées à la minute ; dégradés partagés à id unique par instance de
  // scène (le contenu est recopié par <use>), un par sens (l'ombre part à l'opposé de la lampe).
  const lamps = useMemo(() => lampsFor(width, seed), [width, seed]);
  const litLamps = useMemo(
    () => (ghibli ? lamps.filter((l) => streetLampLit(l, city.minutes, sky.daylight, forcedNight)) : []),
    [ghibli, lamps, city.minutes, sky.daylight, forcedNight],
  );
  const shadeBase = `${maskBase}-shade`;
  const shadeFill = (side: 'r' | 'l'): string => `url(#${shadeBase}-${side})`;

  // Mouvement réduit : la boucle ne tourne pas, les positions restent celles du premier calcul (pas de saut à chaque minute).
  const frozen = useRef<number | null>(null);
  const still = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (frozen.current === null) frozen.current = Date.now() / 1000;
  // Minuterie des halls : fin de minuterie par porte, amorcée au montage d'après les passages des 2 dernières minutes, puis
  // relancée par la boucle à chaque habitant affiché sur un seuil. Remise à zéro si les trajets changent.
  const hallDark = sky.daylight < 0.45;
  const hallUntil = useRef<Map<number, number>>(new Map());
  const hallFor = useRef<Trip[] | null>(null);
  if (hallFor.current !== trips) {
    hallUntil.current = seedHallTimers(trips, width, still ? (frozen.current ?? 0) : Date.now() / 1000, gateOf);
    hallFor.current = trips;
  }

  // Commerces : deux visites par local (seulement si la rue a des commerces) ; probabilité d'une visite recalculée à la minute,
  // nulle si le local n'est pas ouvert, et en mouvement réduit (aucun client ne bouge).
  const shops = useStreetShops(width, height, seed, city);
  // Bouts de trajet des clients : les entrées d'immeubles (centres), comme les habitants.
  const doorCenters = useMemo(() => doors.map((d) => d.x + DOOR_WIDTH / 2), [doors]);
  const allVisits = useMemo(
    () => visitsFor(shops.slots, shops.frames, seed, (id) => shops.views.find((v) => v.slot.id === id)?.sign?.type ?? null, doorCenters, width),
    [shops.slots, shops.frames, shops.views, seed, doorCenters, width],
  );
  if (visitLockFor.current !== `${width}:${height}:${seed}`) {
    visitLockFor.current = `${width}:${height}:${seed}`;
    visitLock.current = new Map();
  }
  const visits = shops.views.length > 0 ? allVisits : NO_VISITS;
  // Personnel : postes du jour mémoïsés par (rue, jour) — staffShiftsAt recalcule deux plans à chaque appel.
  const date = city.day.date;
  const dayKey = `${date.y}-${date.m}-${date.d}`;
  const shifts = useMemo(
    () => new Map(shops.street.map((s) => [s.slot.id, dayShifts(s, seed, date, shops.offsets.get(s.slot.id) ?? 0)])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shops.street, shops.offsets, seed, dayKey],
  );
  // Un client n'entre que rideau levé (pas pendant qu'il monte ou descend).
  const gates = useMemo(
    () =>
      new Map(
        shops.views.map((v) => [
          v.slot.id,
          still || shopShutter(v, shifts.get(v.slot.id) ?? NO_SHIFTS, date, city.minutes, false) !== 'up' ? 0 : customerGate(v, city.minutes, intensity),
        ]),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shops.views, shifts, city.minutes, intensity, still],
  );

  // Scène G4b (Ghibli) : les boutiques du metteur en scène (hors boîte de nuit et salle de jeux, hors chantier et déménagement)
  // ont leurs clients et leur personnel posté rendus par ShopScene ; leurs visites de l'ancien rendu ne sont plus dessinées.
  const sceneShops = useMemo<SceneShop[]>(() => {
    if (!ghibli) return [];
    return shops.views.flatMap((v) => {
      const type = v.sign?.type;
      if (!type || !inScene(type) || (v.phase !== 'open' && v.phase !== 'closed') || v.works || v.moving) return [];
      const sh = shifts.get(v.slot.id) ?? NO_SHIFTS;
      const staff = sh.map((x) => ({ id: x.id, outfit: staffOutfit(seed, x.outfitKey), spans: staffSpans(x) }));
      return [{ view: v, frame: shops.frames.get(v.slot.id)!, staff, open: shopShutter(v, sh, date, city.minutes, still) === 'up' }];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ghibli, shops.views, shops.frames, shifts, seed, city.minutes, still]);
  const sceneIds = useMemo(() => new Set(sceneShops.map((x) => x.view.slot.id)), [sceneShops]);
  // Affluence G4b (CUSTOMER_SCALE) : fonction de la minute, lue par la scène à la minute de DÉBUT de chaque créneau (même
  // distribution au rechargement, dans une autre fenêtre, pour le créneau suivant précalculé) ; intensité du moment. Rideau
  // levé seulement, nulle en mouvement réduit.
  const sceneGates = useMemo(
    () => new Map(sceneShops.map((x) => [x.view.slot.id, still || !x.open ? 0 : (m: number) => customerGate(x.view, m, intensity, CUSTOMER_SCALE)])),
    [sceneShops, still, intensity],
  );
  // Rue d'un créneau : pluie connue seulement à l'instant (averse dès le début du créneau, ou pas), défilé du 14 juillet, parapluies.
  const sceneDayFests = useMemo(() => city.day.festivities.map((f) => f.id), [city.day]);
  const sceneStreet = useCallback(
    (_slotId: string, slotStartS: number, length: number) =>
      streetFor({ slotStartS, length, precipAt: () => city.precip, paradeActive: (m) => paradeOn(sceneDayFests, ((m % 1440) + 1440) % 1440), busArrivalsS: [], umbrellas: intensity.umbrellas }),
    [city.precip, sceneDayFests, intensity.umbrellas],
  );
  const shopVisits = sceneIds.size > 0 ? visits.filter((v) => !sceneIds.has(v.slotId)) : visits;
  // Horloge de la scène : seconde du jour = minute de la scène + secondes écoulées depuis le début de la minute murale où elle
  // a été lue (repère gardé tant que la minute ne change pas : pas de saut au re-rendu).
  const sceneClock = useRef<{ m: number; base: number } | null>(null);

  // Terrasses : météo de la minute et des 10 précédentes (hystérésis du moteur).
  const terraceSky = useTerraceWeather(weather, rainy, city.minutes);

  // Événements de la ville : programme du grand créneau, événements actifs, voitures effacées, ambulances.
  // Fêtes actives à la minute de la scène (père Noël : 24 décembre de nuit).
  const fests = useMemo(() => activeFestivities(city.day.festivities, city.minutes), [city.day, city.minutes]);
  // Fêtes du jour (toute la journée) : route fermée et grand défilé du 14 juillet (parade-layer.tsx, flypast-sprite.tsx).
  const dayFests = useMemo(() => city.day.festivities.map((f) => f.id), [city.day]);
  const events = useCityEvents({ seed, width, city, intensity, vehicles: NO_VEHICLES, still, frozenT: frozen.current });

  // Décors de fête posés par des équipes (calendrier : jour de la scène et minute) ; les travailleurs (data-worker) comptent
  // dans le plafond des figurants (shopSpriteBudget).
  const install = { width, height, seed, sky, still, date, minutes: city.minutes, metrics, rainy, lights, ghibli };

  // Circulation (spec véhicules §1) : demande par voie selon l'intensité, route fermée, événements de rue planifiés (ils
  // entrent par le bord à leur heure), livraisons devant les portes des commerces.
  const eventsByKey = useMemo(() => new Map(events.schedule.map((e) => [e.key, e] as const)), [events.schedule]);
  // Cars scolaires (spec véhicules §4) : 2 à 4 passages par créneau d'école du jour, recalculés à la minute.
  const day = dayNumber(date);
  const schoolBuses = useMemo<ScheduledArrival[]>(
    () => schoolBusArrivals({ seed, day, nowS: still ? (frozen.current ?? 0) : Date.now() / 1000, minutes: city.minutes, windows: schoolWindows(city.day) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seed, day, city.day, city.minutes, still],
  );
  // Bus à horaires (bus-timetable.ts) : passages des 45 prochaines minutes, recalculés à la minute. La veille compte pour les
  // passages d'après minuit. Jours fériés (du jour comme de la veille) : service du dimanche.
  const timetableBuses = useMemo<ScheduledArrival[]>(
    () =>
      busArrivals({
        seed,
        day,
        nowS: still ? (frozen.current ?? 0) : Date.now() / 1000,
        minutes: city.minutes,
        today: serviceKindOf(city.day.weekday, city.day.publicHoliday !== null),
        yesterday: serviceKindOf((city.day.weekday + 6) % 7, isoDate(addDays(city.day.date, -1)) in publicHolidays(addDays(city.day.date, -1).y)),
        // Lignes de la plaque de l'arrêt (réelles, sinon les trois de repli du moteur).
        lines: city.buses?.lines.length || 3,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seed, day, city.day, city.minutes, still, city.buses?.lines.length],
  );
  const arrivals = useMemo<ScheduledArrival[]>(
    () => [
      ...events.schedule.flatMap((e): ScheduledArrival[] =>
        e.layer === 'street' && e.track !== null && (e.id === 'bus' || e.id === 'tram' || e.id === 'ambulance' || e.id === 'garbage-truck' || e.id === 'delivery-bike')
          ? [{ key: e.key, kind: e.id, track: e.track, start: e.start, half: EVENT_DEFS.find((d) => d.id === e.id)?.half }]
          : [],
      ),
      ...schoolBuses,
      ...timetableBuses,
    ],
    [events.schedule, schoolBuses, timetableBuses],
  );
  // Inscriptions des fourgons Type H : commerces de bouche et fleuristes de la rue (LAITERIE sinon).
  const vanLabels = useMemo(() => {
    const out = new Set<string>();
    for (const v of shops.views) {
      const label = v.sign?.type ? VAN_LABELS[v.sign.type] : undefined;
      if (label) out.add(label);
    }
    return [...out].sort();
  }, [shops.views]);
  const deliveries = useMemo(() => shops.views.flatMap((v) => { const f = shops.frames.get(v.slot.id); return f ? [f.door.x + f.door.w / 2] : []; }), [shops.views, shops.frames]);
  const trafficEnv = useMemo<TrafficEnv>(
    () => ({
      demand: { near: intensity.traffic, far: intensity.traffic, bike: intensity.closed ? 0 : intensity.walkers * 0.4 },
      closed: intensity.closed,
      arrivals,
      deliveries,
      crowd: intensity.closed ? 0 : intensity.walkers,
      timetable: true,
      crossPx: metrics.farSide + 5 * metrics.unit - metrics.walkY,
      vanLabels,
      ...(city.buses ? { busLines: city.buses.lines, school: city.buses.school } : {}),
    }),
    [intensity, arrivals, deliveries, metrics, vanLabels, city.buses],
  );
  const traffic = useTraffic({ width, seed, unit: metrics.unit, env: trafficEnv, startS: still ? (frozen.current ?? 0) : Date.now() / 1000 });

  const pedActive = useMemo(() => new Set(peds.filter((p) => p.u < pedestrianGate(p, intensity)).map((p) => p.id)), [peds, intensity]);
  // Zones à contourner fixes pour la minute : terrasses (devant) et déménagements (derrière).
  const dodgeZones = useMemo<DodgeZone[]>(() => {
    const u = metrics.unit;
    const front = metrics.walkY + 2.5 * u;
    const back = metrics.walkY - 4.5 * u;
    const out: DodgeZone[] = [];
    for (const v of shops.views) {
      const f = shops.frames.get(v.slot.id);
      if (!f) continue;
      const type = v.sign?.type;
      if (type && v.phase === 'open' && SHOP_DEFS[type].terrace > 0) {
        const x0 = Math.min(f.window.x, f.door.x);
        const x1 = Math.max(f.window.x + f.window.w, f.door.x + f.door.w);
        out.push({ x0: x0 - 4 * u, x1: x1 + 4 * u, y: front });
      }
      if (v.moving && v.moving.step !== 'truck-arrives' && v.moving.step !== 'leave') {
        const g = movingLayout(f, metrics, width);
        const reach = 34 * u; // places d'attente de l'autre côté de la porte
        out.push({ x0: Math.min(g.a.x - reach, g.b.x) , x1: Math.max(g.a.x + reach, g.b.x), y: back });
      }
    }
    return out;
  }, [shops.views, shops.frames, metrics, width]);
  // Plus les piétons qui attendent au passage (trottoir des immeubles), relus à chaque image ; réutilisé sans allocation.
  const zonesNow = useRef<DodgeZone[]>([]);
  const pedsByDepth = useMemo(() => [...peds].sort((a, b) => b.depth - a.depth), [peds]);
  const marks = useMemo(() => new Map(peds.map((p) => [p.id, festiveMark(p, intensity)] as const)), [peds, intensity]);
  // Placement à chaque image. La table des nœuds est remplie au premier appel (après le montage) ;
  // tout est placé une fois, puis bougent les présents et, pendant leur fondu, ceux qui viennent de disparaître.
  const place = useMemo(() => {
    let nodes: Map<string, SVGGElement> | null = null;
    let first = true;
    let staff: PosedStaff[] = [];
    let swaps: Swap[] = [];
    let waiters: Waiter[] = [];
    // Convives de terrasse (assis, ou à pied pendant leur minute d'arrivée ou de départ) et porteur des tables (Ghibli).
    let terraceGuests: TerraceGuestNode[] = [];
    let cups: CupNode[] = [];
    let carriers: Carrier[] = [];
    let crews: Crew[] = [];
    // Ghibli : employés à pied (scripts porte → trottoir → porte) et ouvriers du chantier, posés par la boucle.
    let staffWalks: WalkingStaff[] = [];
    let workers: PlacedWorker[] = [];
    // Ghibli : drapeaux de fête qui ondulent (poses clés choisies par la boucle).
    let flags: WavingFlag[] = [];
    // Figures Ghibli de chaque passant (compagnons, puis lui-même, au même pas), trouvées à la collecte des nœuds.
    const pedFigs = new Map<string, Element[]>();
    // Nœuds de porte des habitants (<svg> imbriqués), par trajet.
    const doorNodes = new Map<string, Element>();
    // Ombres portées des passants (Ghibli, nuit), par passant.
    const shadeNodes = new Map<string, Element>();
    // Lumières des halls, par centre de porte.
    const hallNodes = new Map<number, Element>();
    let muted: Set<string> = new Set();
    // Scène G4b (Ghibli) : nœuds de ShopScene, posés après les clients de l'ancien rendu.
    let scene: SceneNodes | null = null;
    let posedAt = -Infinity;
    // Habitants 3D : poses des trajets à venir (cache par trajet) et dernière demande d'avance (une par seconde).
    const warm: WarmCache = new Map();
    let warmAt = -Infinity;
    return (now: number): void => {
      // Mouvement réduit : toujours le même instant, y compris quand le placement est refait après un changement de minute.
      const t = still ? frozen.current! : now;
      const el = root.current;
      if (!el) return;
      // Une fois par image : peint les sprites demandés (budget par image) et applique le plafond.
      if (ghibli) figures.flush();
      if (!nodes) {
        nodes = new Map();
        for (const node of el.querySelectorAll<SVGGElement>('[data-life-id]')) nodes.set(node.getAttribute('data-life-id')!, node);
        doorNodes.clear();
        for (const node of el.querySelectorAll('svg[data-resident-door]')) doorNodes.set(node.getAttribute('data-trip-id')!, node);
        shadeNodes.clear();
        for (const node of el.querySelectorAll('[data-shade-for]')) shadeNodes.set(node.getAttribute('data-shade-for')!, node);
        hallNodes.clear();
        for (const node of el.querySelectorAll('[data-hall-light]')) hallNodes.set(Number(node.getAttribute('data-hall-light')), node);
        staff = collectPosedStaff(el);
        swaps = collectSwaps(el);
        waiters = collectWaiters(el);
        terraceGuests = collectTerraceGuests(el);
        cups = collectCups(el);
        carriers = collectCarriers(el);
        crews = collectMovers(el);
        staffWalks = ghibli ? collectStaffWalks(el) : [];
        workers = ghibli ? collectWorkers(el) : [];
        flags = ghibli ? collectFlags(el) : [];
        if (ghibli) {
          for (const p of peds) {
            const node = nodes.get(p.id);
            if (node) pedFigs.set(p.id, [...node.querySelectorAll(':scope > [data-companion] > [data-figure]'), ...node.querySelectorAll(':scope > [data-figure]')]);
          }
        }
        scene = ghibli ? collectScene(el) : null;
        // Plafond global des figurants des commerces : convives de terrasse cachés, visites suspendues pour la minute ; scène G4b :
        // partis entiers retenus pour la minute (plafond Ghibli : GHIBLI_SHOP_SPRITE_CAP).
        muted = ghibli ? shopSpriteBudget(el, width, capFor(width, GHIBLI_SHOP_SPRITE_CAP), scene ? sceneBudget(scene, t) : []) : shopSpriteBudget(el, width);
        if (scene) muteScene(scene, muted);
      }
      const zones = zonesNow.current;
      zones.length = 0;
      for (const z of dodgeZones) zones.push(z);
      const lw = traffic.world;
      if (lw.walkers.some((w) => (w.down && (w.stage === 'approach' || w.stage === 'wait')) || (!w.down && w.stage === 'leave'))) {
        const half = (CROSS_HALF + 8) * metrics.unit;
        zones.push({ x0: lw.light.x - half, x1: lw.light.x + half, y: metrics.walkY - 4.5 * metrics.unit });
      }
      for (const p of peds) {
        const wanted = pedActive.has(p.id);
        const prev = shownPeds.current.get(p.id) ?? wanted;
        // Mouvement réduit : pas de boucle, la présence voulue s'applique telle quelle. Sinon elle ne bascule qu'hors champ.
        const next = still ? wanted : pedShown(prev, wanted, loopX(p.phase, p.dir * p.speed, width, t), width, pedEdgePad(p, metrics));
        shownPeds.current.set(p.id, next);
        const node = nodes.get(p.id);
        if (node && next !== prev) {
          setIfChanged(node, 'data-active', next ? 'true' : 'false');
          setIfChanged(node, 'opacity', next ? '1' : '0');
        }
        // Ghibli : un passant caché lâche ses sprites (<image> sans href), seulement à la bascule ou au premier placement.
        if (ghibli && !next && (first || next !== prev)) for (const fig of pedFigs.get(p.id) ?? []) hideFigure(figures, fig);
        const shade = shadeNodes.get(p.id);
        if (shade) placeShade(shade, next ? pedShade(p, metrics, width, t, litLamps, zones) : null, shadeFill);
        // Un passant caché n'est pas touché (sauf au premier placement de la scène).
        if (!next && !first) continue;
        node?.setAttribute('transform', pedTransform(p, metrics, width, t, !ghibli, zones));
        if (ghibli && next) {
          const pose = pedPose(p, metrics, t, still);
          // Le chef du groupe (dernière figure) tient son signe de fête : bras `hold` pour un objet à la main.
          const figs = pedFigs.get(p.id) ?? [];
          const arms = markArms(marks.get(p.id));
          figs.forEach((fig, i) => poseFigure(figures, fig, i === figs.length - 1 && arms !== 'swing' ? { ...pose, arms } : pose));
        }
      }
      for (const e of events.active) {
        const node = nodes.get(e.key);
        if (!node) continue;
        node.setAttribute('transform', placementTransform(placeEvent(e, t, frame)));
        // Fondu des événements fixes (2 s à l'arrivée et au départ) ; n'écrire l'opacité que lorsqu'elle change.
        if (e.layer === 'fixed') setIfChanged(node, 'opacity', eventOpacity(e, t, still));
        // Ghibli : pas des figurants du trottoir réglés sur leur chemin (le ripeur du camion garde sa pose).
        else if (ghibli && e.layer === 'sidewalk') poseEventFigures(figures, node, e, t, metrics, still);
      }
      for (const trip of trips) {
        const node = nodes.get(trip.id);
        if (!node) continue;
        const v = residentView(trip, tripLock.current, trip.kind === 'out' ? flow.out : flow.in, width, t);
        // Habitant sur le seuil : la minuterie du hall de cette porte repart pour 2 minutes.
        if (v.door && v.pos) hallUntil.current.set(tripDoorX(trip, v.pos), t + HALL_TIMER_S);
        // N'écrire que ce qui change : la plupart des habitants restent chez eux, inutile de toucher leurs nœuds à chaque image.
        // Ghibli : nœud éteint (bascule ou premier placement) → figure cachée, sprite libéré.
        const streetOff = !v.street && (first || node.getAttribute('data-active') !== 'false');
        setIfChanged(node, 'data-active', v.street ? 'true' : 'false');
        setIfChanged(node, 'opacity', v.street ? '1.00' : '0.00');
        if (v.street && v.pos) {
          node.setAttribute('transform', residentTransform(trip, v.pos.x, metrics, !ghibli));
          if (ghibli) poseFigure(figures, node.querySelector(':scope > [data-figure]'), residentPose(trip, v.pos, metrics, still));
        } else if (first) node.setAttribute('transform', residentTransform(trip, trip.doorX, metrics, !ghibli));
        if (ghibli && streetOff) hideFigure(figures, node.querySelector(':scope > [data-figure]'));
        const dnode = doorNodes.get(trip.id);
        if (!dnode) continue;
        const doorOff = !v.door && (first || dnode.getAttribute('data-active') !== 'false');
        setIfChanged(dnode, 'data-active', v.door ? 'true' : 'false');
        setIfChanged(dnode, 'opacity', v.door ? '1.00' : '0.00');
        if (v.door && v.pos) {
          // Cadre large sur le seuil (parapluie compris), resserré sur l'ouverture avec la profondeur (door-passage.ts).
          placeSill(dnode, doorOpening(tripDoorX(trip, v.pos), metrics), v.pos, metrics, residentScale(trip, metrics), ghibli ? 1 : trip.dir);
          if (ghibli) poseFigure(figures, dnode.querySelector('[data-figure]'), residentPose(trip, v.pos, metrics, still));
        } else if (ghibli && doorOff) hideFigure(figures, dnode.querySelector('[data-figure]'));
      }
      if (ghibli && !still && Math.abs(t - warmAt) >= 1) {
        warmAt = t;
        for (const trip of trips) {
          const poses = tripWarmPoses(trip, warm, width, t, trip.kind === 'out' ? flow.out : flow.in, metrics);
          if (poses) prewarmFigure(figures, nodes.get(trip.id)?.querySelector(':scope > [data-figure]') ?? null, poses);
        }
      }
      // Halls : allumés tant que la minuterie court et qu'il fait sombre ; n'écrire qu'à la bascule (allumage franc, extinction douce).
      for (const [x, node] of hallNodes) {
        const on = hallLit(hallUntil.current, x, t, hallDark);
        if (node.getAttribute('data-lit') === (on ? 'true' : 'false') && !first) continue;
        (node as SVGElement).style.transition = hallTransition(on, still);
        node.setAttribute('data-lit', on ? 'true' : 'false');
        node.setAttribute('opacity', on ? '1' : '0');
      }
      placeCustomers(nodes, shopVisits, gates, width, metrics, t, first, muted, { lock: visitLock.current, ghibli, figures });
      if (scene) placeScene(scene, t, figures, traffic.world.horns);
      placeSwaps(swaps, t);
      if (!still) {
        placeWaiters(waiters, t, metrics, ghibli ? figures : null);
        placeCarriers(carriers, t, metrics, ghibli ? figures : null);
        placeTerraceGuests(terraceGuests, t, metrics, ghibli ? figures : null);
        placeCups(cups, t);
        placeMovers(crews, t, metrics, ghibli ? figures : null);
        if (ghibli) {
          placeStaffWalks(staffWalks, t, metrics, figures);
          placeWorkers(workers, t, figures);
          placeFlags(flags, t, props);
        }
      }
      // Mouvement réduit : l'employé reste dans sa pose de départ (debout à son poste).
      if (!still && Math.abs(t - posedAt) >= STAFF_POSE_S) {
        placeStaff(staff, t, ghibli ? figures : null);
        posedAt = t;
      }
      first = false;
      // En dernier : peut demander un re-rendu (nouvel ensemble d'événements), qui recrée cette fonction.
      events.check(t);
    };
    // `city.minutes` : le personnel est re-rendu à la minute (nœuds posés, relève de l'ouvreur) ; la table des nœuds doit être
    // refaite à chaque minute même si rien d'autre ne change (aujourd'hui `gates` et `visits` changent aussi à la minute).
    // `terraceSky` : la météo relue après le montage peut sortir une terrasse hors du changement de minute ; le plafond des
    // figurants (shopSpriteBudget) doit alors compter ses convives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peds, trips, pedActive, flow, metrics, width, still, events, frame, shopVisits, gates, city.minutes, terraceSky, ghibli, figures, props, marks, sceneShops, traffic, litLamps, hallDark, dodgeZones]);
  useWallClockLoop(place, [place]);

  // Rendu initial : mêmes calculs qu'à la première image, pour que le premier dessin (et les tests) soient justes.
  const t0 = still ? frozen.current : Date.now() / 1000;
  if (!sceneClock.current || sceneClock.current.m !== city.minutes) sceneClock.current = { m: city.minutes, base: Math.floor(t0! / 60) * 60 };
  const sceneSeconds = city.minutes * 60 + (t0! - sceneClock.current.base);
  const eventNode = (e: CityEvent): ReactElement => (
    <g key={e.key} data-life-id={e.key} data-event={e.id} data-active="true" transform={placementTransform(placeEvent(e, t0, frame))} opacity={eventOpacity(e, t0, still)}>
      <CityEventSprite event={e} sky={sky} still={still} lights={lights} rainy={rainy} fests={fests} ghibli={ghibli} walked={e.layer === 'sidewalk' ? eventWalked(e, t0, metrics) : 0} />
    </g>
  );
  const of = (pred: (e: CityEvent) => boolean): CityEvent[] => events.active.filter(pred);
  const fireworks = of((e) => e.id === 'fireworks');
  const cranes = of((e) => e.id === 'crane');
  const near = facades.filter((b) => !b.far);
  // Voies : véhicules du moteur de circulation (ambiance et événements de rue), voir traffic-layer.tsx.
  const lane = (which: 'far' | 'near'): ReactElement => (
    <g data-city-lane={which}>
      <TrafficLane handle={traffic} lane={which} metrics={metrics} sky={sky} lights={lights} rainy={rainy} still={still} ghibli={ghibli} fests={fests} eventsByKey={eventsByKey} frozenT={frozen.current ?? 0} />
    </g>
  );
  // Silhouette des immeubles et des socles des jumeaux (la grue reste derrière le socle, dans le retrait entre les tours).
  const silhouette = (list: typeof facades): ReactElement[] => [
    ...list.map((b, i) => <rect key={i} x={b.x} y={metrics.ground - b.h} width={b.w} height={b.h + height} fill="#000" />),
    ...list.filter((b) => b.podium && b.x === b.podium.x).map((b) => <rect key={`p${b.podium!.id}`} x={b.podium!.x} y={metrics.ground - b.podium!.h} width={b.podium!.w} height={b.podium!.h + height} fill="#000" />),
  ];

  return (
    <g data-city-life="" ref={root}>
      {/* Masques des toits : le feu d'artifice part de derrière tous les immeubles, la grue est derrière le premier plan. */}
      {(fireworks.length > 0 || cranes.length > 0) && (
        <defs>
          {fireworks.length > 0 && (
            <mask id={`${maskBase}-skyline`} maskUnits="userSpaceOnUse" x={0} y={0} width={width} height={height}>
              <rect x={0} y={0} width={width} height={height} fill="#fff" />
              {silhouette(facades)}
            </mask>
          )}
          {cranes.length > 0 && (
            <mask id={`${maskBase}-near`} maskUnits="userSpaceOnUse" x={0} y={0} width={width} height={height}>
              <rect x={0} y={0} width={width} height={height} fill="#fff" />
              {silhouette(near)}
            </mask>
          )}
        </defs>
      )}
      <g data-city-events-back="">
        {fireworks.length > 0 && <g data-event-mask="skyline" mask={`url(#${maskBase}-skyline)`}>{fireworks.map(eventNode)}</g>}
        {cranes.length > 0 && <g data-event-mask="near" mask={`url(#${maskBase}-near)`}>{cranes.map(eventNode)}</g>}
        {of((e) => e.layer === 'sky' || e.id === 'kite' || e.id === 'apartment' || e.id === 'bells').map(eventNode)}
        <SantaLayer width={width} height={height} seed={seed} sky={sky} facades={facades} ground={metrics.ground} fests={fests} daylight={city.daylight} still={still} frozenT={frozen.current!} ghibli={ghibli} />
        <FlypastLayer width={width} height={height} sky={sky} still={still} dayFests={dayFests} minutes={city.minutes} />
      </g>
      {/* Ordre de dessin : trottoir (passants, habitants, événements de trottoir) au fond, contre les immeubles, puis les
          lampadaires (bord du trottoir), la file du fond, puis celle du premier plan. */}
      <g data-city-sidewalk="">
        {/* Lumières des halls (minuterie) : devant le décor, derrière les habitants qui passent le seuil. */}
        <HallLights doors={doors} unit={metrics.unit} doorY={metrics.doorY} ghibli={ghibli} still={still} lit={(x) => hallLit(hallUntil.current, x, t0!, hallDark)} />
        {/* Contre les devantures : l'équipe d'un chantier, le personnel (derrière la vitrine, rideau roulant, trottoir), puis les
            clients (derrière les vitrines et sur le trottoir). */}
        {shops.views.map((view, i) =>
          view.phase === 'works' ? (
            <ShopWorks key={view.slot.id} view={view} frame={shops.frames.get(view.slot.id)!} change={shops.street[i]?.change ?? null} width={width} metrics={metrics} sky={sky} rainy={rainy} still={still} seed={seed} ghibli={ghibli} />
          ) : null,
        )}
        {/* Décors de fête contre les façades : drapeaux d'entrée (install-layer.tsx). */}
        <InstallLayer {...install} part="back" />
        {shops.views.map((view) => {
          const frame = shops.frames.get(view.slot.id)!;
          const type = view.sign?.type ?? null;
          if (!type) return null;
          return (
            <StaffLayer
              key={view.slot.id}
              view={view}
              shifts={shifts.get(view.slot.id) ?? NO_SHIFTS}
              frame={frame}
              metrics={metrics}
              minutes={city.minutes}
              reduced={still}
              date={date}
              width={width}
              sky={sky}
              rainy={rainy}
              umbrella={intensity.umbrellas}
              seed={seed}
              seats={visits.filter((v) => v.slotId === view.slot.id).map((v) => v.seat.x - frame.window.x)}
              post={ghibli ? ghibliStaffPost(view, frame) : interiorPost(type, frame.window.w, frame.window.h)}
              ghibli={ghibli}
              doorXs={doorCenters}
              scene={sceneIds.has(view.slot.id)}
            />
          );
        })}
        <ShopCustomers
          visits={shopVisits}
          frames={shops.frames}
          views={shops.views}
          gates={gates}
          width={width}
          metrics={metrics}
          t0={t0}
          sky={sky}
          rainy={rainy}
          umbrella={intensity.umbrellas}
          lock={visitLock.current}
          ghibli={ghibli}
        />
        {/* Scène G4b (Ghibli) : clients et personnel posté des boutiques du metteur en scène (shop/shop-scene.tsx). */}
        {sceneShops.length > 0 && (
          <ShopScene
            shops={sceneShops}
            seed={seed}
            day={day}
            secondsOfDay={sceneSeconds}
            t0={t0!}
            width={width}
            metrics={metrics}
            sky={sky}
            rainy={rainy}
            umbrella={intensity.umbrellas}
            gates={sceneGates}
            street={sceneStreet}
            doorXs={doorCenters}
            still={still}
          />
        )}
        {trips.map((trip) => {
          const v = residentView(trip, tripLock.current, gateOf(trip), width, t0);
          // Rendu initial = première image : au repos, l'habitant est posé devant sa porte, de face.
          const rest: Passage = { stage: 'street', x: trip.doorX, depth: 0, yaw: 4, gait: 'walk', walked: 0 };
          const sPos = v.street && v.pos ? v.pos : rest;
          const dPos = v.door && v.pos ? v.pos : { ...rest, depth: 1 };
          const { clip: o, dark } = sillBox(doorOpening(v.door && v.pos ? tripDoorX(trip, v.pos) : trip.doorX, metrics), dPos.depth, metrics, residentScale(trip, metrics));
          // Ghibli : le nœud inactif (rue ou seuil) est rendu caché, sans sprite.
          const sprite = (p: Passage, on: boolean): ReactElement =>
            ghibli ? (
              <GhibliFigure outfit={trip.outfit} sky={sky} rainy={rainy} umbrella={intensity.umbrellas} initial={residentPose(trip, p, metrics, still)} hidden={!on} citizen={citizenSeed(trip.id)} />
            ) : (
              <PersonSprite outfit={trip.outfit} sky={sky} rainy={rainy} umbrella={intensity.umbrellas} />
            );
          return (
            <Fragment key={trip.id}>
              <g data-life-id={trip.id} data-trip-id={trip.id} data-resident="" data-trip={trip.kind} data-active={v.street ? 'true' : 'false'} transform={residentTransform(trip, sPos.x, metrics, !ghibli)} opacity={v.street ? '1.00' : '0.00'}>
                {sprite(sPos, v.street)}
              </g>
              {/* Nœud de porte : <svg> imbriqué rogné à l'ouverture (ni clipPath ni masque : cette couche reste copiable par <use>, comme pour la fenêtre soulevée). */}
              <svg data-resident-door="" data-trip-id={trip.id} data-active={v.door ? 'true' : 'false'} x={o.x.toFixed(2)} y={o.y.toFixed(2)} width={o.w.toFixed(2)} height={o.h.toFixed(2)} overflow="hidden" opacity={v.door ? '1.00' : '0.00'}>
                <rect data-door-dark="" x={dark.x.toFixed(2)} y={dark.y.toFixed(2)} width={dark.w.toFixed(2)} height={dark.h.toFixed(2)} fill={DOOR_DARK} opacity={v.door ? doorDarkOpacity(dPos.depth).toFixed(2) : '0.00'} />
                <g data-door-fig="" transform={sillFigTransform(dPos, o, metrics, residentScale(trip, metrics), ghibli ? 1 : trip.dir)} opacity={(1 - dPos.depth).toFixed(2)}>
                  {sprite(dPos, v.door)}
                </g>
              </svg>
            </Fragment>
          );
        })}
        {/* Devant les façades, entre la ligne des portes et celle des passants : terrasses, cordon, videurs et file. */}
        {shops.views.map((view) => (
          <ShopOutdoors
            key={view.slot.id}
            view={view}
            frame={shops.frames.get(view.slot.id)!}
            metrics={metrics}
            minutes={city.minutes}
            date={date}
            weather={terraceSky}
            walkers={intensity.walkers}
            reduced={still}
            sky={sky}
            seed={seed}
            sessionT0={frozen.current!}
            ghibli={ghibli}
            width={width}
            doorXs={doorCenters}
          />
        ))}
        {/* Ombres portées des passants sous leurs pieds (Ghibli, nuit, lampe allumée à moins de 75u), en multiply ; posées
            par la boucle. Le liseré chaud côté lampe (actorRim de la maquette) n'est pas porté. */}
        {litLamps.length > 0 && (
          <g data-actor-shades="" style={{ mixBlendMode: 'multiply' }}>
            <defs>
              {(['r', 'l'] as const).map((side) => (
                <linearGradient key={side} id={`${shadeBase}-${side}`} x1={side === 'r' ? 0 : 1} y1={0} x2={side === 'r' ? 1 : 0} y2={0}>
                  <stop offset="0" stopColor="rgb(22,18,70)" stopOpacity={1} />
                  <stop offset="0.5" stopColor="rgb(22,18,70)" stopOpacity={0.5} />
                  <stop offset="1" stopColor="rgb(30,26,80)" stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            {peds.map((p) => {
              const active = still ? pedActive.has(p.id) : (shownPeds.current.get(p.id) ?? pedActive.has(p.id));
              const s = active ? pedShade(p, metrics, width, t0!, litLamps, dodgeZones) : null;
              return <polygon key={p.id} data-shade-for={p.id} points={s?.points ?? ''} opacity={s ? s.opacity.toFixed(2) : '0'} fill={shadeFill(s?.side ?? 'r')} />;
            })}
          </g>
        )}
        {/* Du plus loin (côté façades) au plus proche : un passant plus près passe devant un autre. */}
        {pedsByDepth.map((p) => {
          // Présence affichée (pas la voulue) : mémorisée au premier rendu, puis changée seulement par la boucle, au bord.
          if (!shownPeds.current.has(p.id)) shownPeds.current.set(p.id, pedActive.has(p.id));
          const active = still ? pedActive.has(p.id) : shownPeds.current.get(p.id)!;
          const mark = marks.get(p.id) ?? null;
          return (
            <g
              key={p.id}
              data-life-id={p.id}
              data-ped=""
              data-role={p.role}
              data-profile={p.profile}
              data-mark={mark ?? undefined}
              data-active={active ? 'true' : 'false'}
              transform={pedTransform(p, metrics, width, t0, !ghibli, dodgeZones)}
              opacity={active ? 1 : 0}
            >
              {/* Les enfants accompagnés suivent derrière le parent (repère du sprite : derrière = x négatif), à l'échelle 0,7.
                  Habitants 3D : chacun a sa graine (id du passant), les enfants un corps d'enfant (l'accompagnant de la
                  Saint-Valentin est un adulte) ; rien n'est montré tant que leurs images 3D peuvent arriver (waitFor3D, 4 s
                  au plus, puis le pantin) : à l'ouverture, la rue se remplit au fil des rendus (spec, option b). */}
              {p.companions.map((outfit, k) => (
                <g key={k} data-companion="" transform={p.pair ? `translate(${(ghibli ? -p.dir : -1) * PAIR_GAP} 0) scale(0.95)` : `translate(${(ghibli ? -p.dir : -1) * COMPANION_GAP * (k + 1)} 0) scale(0.7)`}>
                  {ghibli ? <GhibliFigure outfit={outfit} sky={sky} rainy={rainy} umbrella={false} initial={pedPose(p, metrics, t0, still)} hidden={!active} citizen={citizenSeed(`${p.id}+${k}`)} kind={p.pair ? undefined : 'child'} waitFor3D /> : <PersonSprite outfit={outfit} sky={sky} rainy={rainy} umbrella={false} />}
                </g>
              ))}
              {/* Ghibli : le signe de fête est tenu par le pantin (accroche de la tête ou main droite, festive-marks). */}
              {ghibli ? (
                <GhibliFigure
                  outfit={p.outfit}
                  sky={sky}
                  rainy={rainy}
                  umbrella={intensity.umbrellas}
                  initial={{ ...pedPose(p, metrics, t0, still), arms: markArms(mark) }}
                  hidden={!active}
                  citizen={citizenSeed(p.id)}
                  kind={kindOfProfile(p.profile)}
                  waitFor3D
                  held={mark ? [{ anchor: markAnchor(mark, intensity.umbrellas), node: <MarkHeld mark={mark} t={(c) => tone(c, sky)} dir={p.dir} /> }] : undefined}
                />
              ) : (
                <PersonSprite outfit={p.outfit} sky={sky} rainy={rainy} umbrella={intensity.umbrellas} mark={mark} />
              )}
            </g>
          );
        })}
        {of((e) => e.layer === 'sidewalk').map(eventNode)}
        {/* Foule du défilé du 14 juillet : au bord du trottoir, derrière les barrières (posées sur la chaussée) et les équipes. */}
        <ParadeCrowd width={width} seed={seed} sky={sky} still={still} rainy={rainy} dayFests={dayFests} minutes={city.minutes} metrics={metrics} doorXs={doorXs} ghibli={ghibli} />
        {/* Scène, équipes à l'échelle et porteurs : devant les passants (un passant passe toujours derrière une équipe). */}
        <InstallLayer {...install} part="crew" />
        {/* Déménagement : les porteurs, après les passants (un passant les contourne par derrière, ils le cachent) et avant le
            camion (ils passent derrière lui en y entrant). */}
        {shops.views.map((view) => (
          <MovingCrew key={view.slot.id} view={view} frame={shops.frames.get(view.slot.id)!} day={dayNumber(date)} seed={seed} width={width} metrics={metrics} sky={sky} rainy={rainy} still={still} t0={t0} minutes={city.minutes} offset={shops.offsets.get(view.slot.id) ?? 0} ghibli={ghibli} />
        ))}
        {/* Camion de déménagement garé au bord du trottoir : devant les passants, derrière les lampadaires et les files. */}
        {shops.views.map((view, i) => (
          <MovingTruck
            key={view.slot.id}
            view={view}
            frame={shops.frames.get(view.slot.id)!}
            change={shops.street[i]?.change ?? null}
            offset={shops.offsets.get(view.slot.id) ?? 0}
            seed={seed}
            minutes={city.minutes}
            width={width}
            metrics={metrics}
            sky={sky}
            lights={lights}
            still={still}
            t0={t0}
            ghibli={ghibli}
            rainy={rainy}
          />
        ))}
      </g>
      <StreetLamps width={width} height={height} seed={seed} minutes={city.minutes} daylight={sky.daylight} forcedNight={forcedNight} ghibli={ghibli} />
      {/* Drapeaux de lampadaires, barrières, camionnettes et camions élévateurs : devant les lampadaires, derrière les files. */}
      <InstallLayer {...install} part="front" />
      {/* Rue privatisée de la Fête de la musique : barrières en travers, stands de bière, serveurs, files et foule, triés par
          profondeur sur la chaussée (aucune voiture ne roule alors). */}
      <InstallLayer {...install} part="street" />
      <Crosswalk handle={traffic} metrics={metrics} sky={sky} ghibli={ghibli} />
      {/* Voyageurs de l'arrêt du trottoir des immeubles (voie du fond) : derrière ses bus. */}
      <BusStopRiders handle={traffic} metrics={metrics} sky={sky} rainy={rainy} still={still} ghibli={ghibli} frozenT={frozen.current ?? 0} part="far" />
      {/* Piétons du passage sur le trottoir des immeubles (avant de traverser, ou une fois montés) : derrière les voitures. */}
      <CrossingLayer handle={traffic} metrics={metrics} sky={sky} rainy={rainy} still={still} ghibli={ghibli} frozenT={frozen.current ?? 0} part="far" />
      <TrafficFixtures handle={traffic} metrics={metrics} sky={sky} still={still} frozenT={frozen.current ?? 0} side="near" ghibli={ghibli} />
      {lane('far')}
      {/* Grand défilé du 14 juillet (route fermée, aucune voiture) : une file du fond réduite, derrière celle du premier plan. */}
      <ParadeLayer lane="far" width={width} seed={seed} sky={sky} still={still} dayFests={dayFests} minutes={city.minutes} metrics={metrics} ghibli={ghibli} />
      {/* Montée et descente au premier plan : derrière la caisse du bus de la voie du premier plan. */}
      <BusStopRiders handle={traffic} metrics={metrics} sky={sky} rainy={rainy} still={still} ghibli={ghibli} frozenT={frozen.current ?? 0} part="near-step" />
      {lane('near')}
      <ParadeLayer lane="near" width={width} seed={seed} sky={sky} still={still} dayFests={dayFests} minutes={city.minutes} metrics={metrics} ghibli={ghibli} />
      <CrossingLayer handle={traffic} metrics={metrics} sky={sky} rainy={rainy} still={still} ghibli={ghibli} frozenT={frozen.current ?? 0} part="near" />
      <TrafficFixtures handle={traffic} metrics={metrics} sky={sky} still={still} frozenT={frozen.current ?? 0} side="far" ghibli={ghibli} />
      <BusStopRiders handle={traffic} metrics={metrics} sky={sky} rainy={rainy} still={still} ghibli={ghibli} frozenT={frozen.current ?? 0} part="near" />
      {/* Trottoir d'en face : passants, devant tout (revue du 2026-10-13, « plus de vie sans cacher la ville »). */}
      <FrontSidewalk width={width} seed={seed} metrics={metrics} sky={sky} rainy={rainy} still={still} ghibli={ghibli} intensity={intensity} handle={traffic} frozenT={frozen.current ?? 0} />
    </g>
  );
}
