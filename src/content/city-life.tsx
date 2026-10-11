import { Fragment, useId, useMemo, useRef, type ReactElement } from 'react';
import { activeFestivities } from '../core/library/city/calendar';
import { DOOR_WIDTH, TRIP_CYCLE, doorsFor, residentFlow, tripAt, tripHappens, tripsFor, type Trip } from '../core/library/city/doors';
import { DOOR_DARK, doorDarkOpacity, entranceOpening, type Passage } from '../core/library/city/doorway';
import { PULL_DY, fixedFade, placeEvent, pullOver, type EventFrame, type EventPlacement } from '../core/library/city/event-place';
import type { CityEvent } from '../core/library/city/events';
import { cityFacades } from '../core/library/city/facades';
import { cityIntensity, type CityContext } from '../core/library/city/intensity';
import { lampLit as streetLampLit, lampsFor } from '../core/library/city/lamps';
import { FAR_SHRINK, STREET_SCALE, cityMetrics, type CityMetrics } from '../core/library/city/metrics';
import { EDGE_PAD, festiveMark, pedShown, pedestrianGate, pedestriansFor, type Pedestrian } from '../core/library/city/people';
import { customerGate, visitsFor, type Visit, type VisitLock } from '../core/library/city/shops/customers';
import { dayNumber } from '../core/library/city/shops/hours';
import type { StaffShift } from '../core/library/city/shops/staff';
import { LANE_DIR, vehicleGate, vehiclesFor, type Vehicle } from '../core/library/city/vehicles';
import { facingYaw, phaseIndexOf } from '../core/library/figure/gait';
import { loopX } from '../core/library/scene-world';
import type { Weather } from '../core/library/weather/weather-types';
import type { Sky } from '../core/library/sky';
import { useArtStyle } from './art-setting';
import { placeSill, sillBox, sillFigTransform } from './door-passage';
import { useFigureRegistry } from './figure/figure-host';
import { GhibliFigure, hideFigure, poseFigure } from './figure/ghibli-figure';
import { CityEventSprite, eventWalked, poseEventFigures } from './city-event-sprites';
import { MarkHeld, markAnchor, markArms } from './festive-marks';
import { ShopCustomers, ShopOutdoors, ShopWorks, StaffLayer, collectPosedStaff, collectStaffWalks, collectSwaps, collectWorkers, dayShifts, placeCustomers, placeStaff, placeStaffWalks, placeSwaps, placeWorkers, setIfChanged, shopShutter, shopSpriteBudget, type PlacedWorker, type PosedStaff, type Swap, type WalkingStaff } from './city-shops-life';
import { MovingCrew, MovingTruck, collectMovers, placeMovers, type Crew } from './moving-truck';
import { FlypastLayer } from './flypast-sprite';
import { InstallLayer } from './install-layer';
import { ParadeCrowd } from './parade-crowd';
import { ParadeLayer } from './parade-layer';
import { interiorPost } from './shop-interiors';
import { collectCarriers, collectTerraceGuests, collectWaiters, placeCarriers, placeTerraceGuests, placeWaiters, useTerraceWeather, type Carrier, type TerraceGuestNode, type Waiter } from './shop-terrace';
import { LampSprite, PersonSprite, VehicleSprite, tone } from './city-sprites';
import { SantaLayer } from './santa-layer';
import { useCityEvents } from './use-city-events';
import { useStreetShops } from './use-street-shops';
import { useWallClockLoop } from './use-wallclock-loop';

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
// Durée du fondu d'apparition/disparition (CSS) ; un absent continue d'avancer tant qu'il s'efface (avec une petite marge).
const FADE_S = 3; // fondu des véhicules seulement (les passants entrent et sortent par les bords)
// Fondu court des voitures qui s'effacent devant un véhicule d'événement (les habitants n'ont plus de fondu : ils passent le
// seuil de leur porte, voir residentView).
const RESIDENT_FADE_S = 0.4;
// Les vélos roulent sur une piste au bord de la file du premier plan (côté droit du sens de marche, vers le spectateur).
const BIKE_TRACK_DY = 2;

// `dy` : décalage d'une voiture qui se range devant l'ambulance (0 sinon).
const vehicleTransform = (v: Vehicle, m: CityMetrics, width: number, t: number, dy = 0): string => {
  const x = loopX(v.phase, LANE_DIR[v.lane] * v.speed, width, t);
  const k = m.unit * STREET_SCALE.vehicle * v.scale * (v.lane === 'far' ? FAR_SHRINK : 1);
  const y = m.laneY[v.lane] + (v.kind === 'bike' ? BIKE_TRACK_DY * m.unit : 0) + dy;
  return `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${(LANE_DIR[v.lane] * k).toFixed(3)} ${k.toFixed(3)})`;
};

const NO_VISITS: Visit[] = [];
const NO_SHIFTS: StaffShift[] = [];
// Gestes des employés : posés au plus dix fois par seconde (les étapes durent au moins une demi-seconde).
const STAFF_POSE_S = 0.1;

const placementTransform = (p: EventPlacement): string => `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(${p.sx.toFixed(3)} ${p.sy.toFixed(3)})`;

// Décalage d'une voiture motorisée devant les ambulances actives de sa file (vers le bord : premier plan vers le bas, fond vers le haut).
const pullDy = (v: Vehicle, ambulances: CityEvent[], m: CityMetrics, width: number, t: number): number => {
  if (v.kind === 'bike' || ambulances.length === 0) return 0;
  let f = 0;
  for (const amb of ambulances) if (amb.track === v.lane) f = Math.max(f, pullOver(amb, loopX(v.phase, LANE_DIR[v.lane] * v.speed, width, t), width, t));
  return f * PULL_DY * m.unit * (v.lane === 'near' ? 1 : -1);
};

type StreetLampsProps = { width: number; height: number; seed: number; minutes: number; daylight: number; forcedNight?: boolean };

// Lampadaires au bord du trottoir : dessinés devant les passants (leur pied est plus près de la rue) et derrière les voitures.
// Ils sont dans le calque animé (la boucle n'y touche pas) ; sans contexte de ville, SceneActors les dessine seuls.
export function StreetLamps({ width, height, seed, minutes, daylight, forcedNight = false }: StreetLampsProps): ReactElement {
  const lamps = useMemo(() => lampsFor(width, seed), [width, seed]);
  const m = cityMetrics(height);
  const curb = m.curb;
  return (
    <g data-street-lamps="">
      {lamps.map((lamp) => {
        const lit = streetLampLit(lamp, minutes, daylight, forcedNight);
        return (
          <g key={lamp.id} data-street-lamp={lamp.id} data-lit={lit ? 'true' : 'false'} transform={`translate(${lamp.x} ${curb.toFixed(1)}) scale(${(m.unit * STREET_SCALE.lamp).toFixed(3)})`}>
            <LampSprite lit={lit} />
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

// `mirror` : le sprite classique se retourne selon le sens ; le pantin Ghibli se tourne de profil (pedPose), sans miroir.
const pedTransform = (p: Pedestrian, m: CityMetrics, width: number, t: number, mirror: boolean): string => {
  const x = loopX(p.phase, p.dir * p.speed, width, t);
  // Légère profondeur sur le trottoir : les passants ne marchent pas tous sur la même ligne.
  const y = m.walkY - (p.depth - 0.5) * m.unit * 6;
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

// Habitant : le nœud de rue (`[data-resident]`) et le nœud de porte (`svg[data-resident-door]`, rogné à l'ouverture sombre
// de l'entrée) ne sont jamais visibles ensemble. Un seul nœud de porte par trajet : au seuil de l'AUTRE porte (`endDoorX`),
// son attribut x est réécrit (simple, sans nœud superflu ; d'une porte à l'autre, seul le x de l'ouverture change).
const residentScale = (trip: Trip, m: CityMetrics): number => m.unit * STREET_SCALE.person * trip.scale;
// `mirror` : le sprite classique se retourne selon le sens ; le pantin Ghibli se tourne par `yaw`.
const residentTransform = (trip: Trip, x: number, m: CityMetrics, mirror: boolean): string => {
  const k = residentScale(trip, m);
  return `translate(${x.toFixed(1)} ${m.doorY.toFixed(1)}) scale(${((mirror ? trip.dir : 1) * k).toFixed(3)} ${k.toFixed(3)})`;
};
// Centre de la porte du seuil en cours (la sienne, ou celle de l'autre immeuble au bout du trajet).
const tripDoorX = (trip: Trip, pos: Passage): number => (pos.x === trip.doorX || trip.endDoorX === null ? trip.doorX : trip.endDoorX);
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
  // Passants et véhicules présents au dernier placement : ceux qui disparaissent continuent d'avancer pendant leur fondu.
  const moving = useRef<Set<string>>(new Set());
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
  const peds = useMemo(() => pedestriansFor(width, seed), [width, seed]);
  if (shownFor.current !== peds) {
    shownFor.current = peds;
    shownPeds.current = new Map();
  }
  const vehicles = useMemo(() => vehiclesFor(width, seed), [width, seed]);
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
  // Une entrée par immeuble : la probabilité par trajet est réduite selon le nombre d'entrées (≤ 6 habitants par 720 px).
  const flow = useMemo(() => residentFlow(intensity, city.minutes, doors.length, width), [intensity, city.minutes, doors.length, width]);
  const lights = sky.daylight < 0.5 || rainy;
  const gateOf = (trip: Trip): number => (trip.kind === 'out' ? flow.out : flow.in);
  const maskBase = `cm${useId().replace(/[^a-zA-Z0-9_-]/g, '')}-city-mask`;

  // Mouvement réduit : la boucle ne tourne pas, les positions restent celles du premier calcul (pas de saut à chaque minute).
  const frozen = useRef<number | null>(null);
  const still = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (frozen.current === null) frozen.current = Date.now() / 1000;

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

  // Terrasses : météo de la minute et des 10 précédentes (hystérésis du moteur).
  const terraceSky = useTerraceWeather(weather, rainy, city.minutes);

  // Événements de la ville : programme du grand créneau, événements actifs, voitures effacées, ambulances.
  // Fêtes actives à la minute de la scène (père Noël : 24 décembre de nuit).
  const fests = useMemo(() => activeFestivities(city.day.festivities, city.minutes), [city.day, city.minutes]);
  // Fêtes du jour (toute la journée) : route fermée et grand défilé du 14 juillet (parade-layer.tsx, flypast-sprite.tsx).
  const dayFests = useMemo(() => city.day.festivities.map((f) => f.id), [city.day]);
  const events = useCityEvents({ seed, width, city, intensity, vehicles, still, frozenT: frozen.current });

  // Décors de fête posés par des équipes (calendrier : jour de la scène et minute) ; les travailleurs (data-worker) comptent
  // dans le plafond des figurants (shopSpriteBudget).
  const install = { width, height, seed, sky, still, date, minutes: city.minutes, metrics, rainy, lights, ghibli };

  const pedActive = useMemo(() => new Set(peds.filter((p) => p.u < pedestrianGate(p, intensity)).map((p) => p.id)), [peds, intensity]);
  const marks = useMemo(() => new Map(peds.map((p) => [p.id, festiveMark(p, intensity)] as const)), [peds, intensity]);
  // Une voiture effacée par un véhicule d'événement n'est pas présente pendant tout son passage.
  const vehActive = useMemo(
    () => new Set(vehicles.filter((v) => v.u < vehicleGate(v, intensity) && !events.yielded.has(v.id)).map((v) => v.id)),
    [vehicles, intensity, events.yielded],
  );

  // Placement à chaque image. La table des nœuds est remplie au premier appel (après le montage) ;
  // tout est placé une fois, puis bougent les présents et, pendant leur fondu, ceux qui viennent de disparaître.
  const place = useMemo(() => {
    let nodes: Map<string, SVGGElement> | null = null;
    let first = true;
    let leaving = new Set<string>();
    let leaveUntil = 0;
    let staff: PosedStaff[] = [];
    let swaps: Swap[] = [];
    let waiters: Waiter[] = [];
    // Convives de terrasse (assis, ou à pied pendant leur minute d'arrivée ou de départ) et porteur des tables (Ghibli).
    let terraceGuests: TerraceGuestNode[] = [];
    let carriers: Carrier[] = [];
    let crews: Crew[] = [];
    // Ghibli : employés à pied (scripts porte → trottoir → porte) et ouvriers du chantier, posés par la boucle.
    let staffWalks: WalkingStaff[] = [];
    let workers: PlacedWorker[] = [];
    // Figures Ghibli de chaque passant (compagnons, puis lui-même, au même pas), trouvées à la collecte des nœuds.
    const pedFigs = new Map<string, Element[]>();
    // Nœuds de porte des habitants (<svg> imbriqués), par trajet.
    const doorNodes = new Map<string, Element>();
    let muted: Set<string> = new Set();
    let posedAt = -Infinity;
    // Véhicules seulement : les passants ne se fondent plus, leur présence bascule au bord (pedShown).
    const moves = (id: string, t: number): boolean => first || vehActive.has(id) || (t < leaveUntil && leaving.has(id));
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
        leaving = new Set([...moving.current].filter((id) => !vehActive.has(id)));
        leaveUntil = t + FADE_S + 0.2;
        moving.current = new Set(vehActive);
        doorNodes.clear();
        for (const node of el.querySelectorAll('svg[data-resident-door]')) doorNodes.set(node.getAttribute('data-trip-id')!, node);
        staff = collectPosedStaff(el);
        swaps = collectSwaps(el);
        waiters = collectWaiters(el);
        terraceGuests = collectTerraceGuests(el);
        carriers = collectCarriers(el);
        crews = collectMovers(el);
        staffWalks = ghibli ? collectStaffWalks(el) : [];
        workers = ghibli ? collectWorkers(el) : [];
        if (ghibli) {
          for (const p of peds) {
            const node = nodes.get(p.id);
            if (node) pedFigs.set(p.id, [...node.querySelectorAll(':scope > [data-companion] > [data-figure]'), ...node.querySelectorAll(':scope > [data-figure]')]);
          }
        }
        // Plafond global des figurants des commerces : convives de terrasse cachés, visites suspendues pour la minute.
        muted = shopSpriteBudget(el, width);
      }
      for (const v of vehicles) if (moves(v.id, t)) nodes.get(v.id)?.setAttribute('transform', vehicleTransform(v, metrics, width, t, pullDy(v, events.ambulances, metrics, width, t)));
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
        // Un passant caché n'est pas touché (sauf au premier placement de la scène).
        if (!next && !first) continue;
        node?.setAttribute('transform', pedTransform(p, metrics, width, t, !ghibli));
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
      placeCustomers(nodes, visits, gates, width, metrics, t, first, muted, { lock: visitLock.current, ghibli, figures });
      placeSwaps(swaps, t);
      if (!still) {
        placeWaiters(waiters, t, metrics, ghibli ? figures : null);
        placeCarriers(carriers, t, metrics, ghibli ? figures : null);
        placeTerraceGuests(terraceGuests, t, metrics, ghibli ? figures : null);
        placeMovers(crews, t, metrics, ghibli ? figures : null);
        if (ghibli) {
          placeStaffWalks(staffWalks, t, metrics, figures);
          placeWorkers(workers, t, figures);
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
  }, [vehicles, peds, trips, vehActive, pedActive, flow, metrics, width, still, events, frame, visits, gates, city.minutes, terraceSky, ghibli, figures, marks]);
  useWallClockLoop(place, [place]);

  // Rendu initial : mêmes calculs qu'à la première image, pour que le premier dessin (et les tests) soient justes.
  const t0 = still ? frozen.current : Date.now() / 1000;
  const eventNode = (e: CityEvent): ReactElement => (
    <g key={e.key} data-life-id={e.key} data-event={e.id} data-active="true" transform={placementTransform(placeEvent(e, t0, frame))} opacity={eventOpacity(e, t0, still)}>
      <CityEventSprite event={e} sky={sky} still={still} lights={lights} rainy={rainy} fests={fests} ghibli={ghibli} walked={e.layer === 'sidewalk' ? eventWalked(e, t0, metrics) : 0} />
    </g>
  );
  const of = (pred: (e: CityEvent) => boolean): CityEvent[] => events.active.filter(pred);
  const fireworks = of((e) => e.id === 'fireworks');
  const cranes = of((e) => e.id === 'crane');
  const near = facades.filter((b) => !b.far);
  const laneEvents = (which: 'far' | 'near'): CityEvent[] => of((e) => e.layer === 'street' && (e.track === which || (which === 'near' && e.track === 'bike')));
  // Profondeur : au premier plan, l'ambulance roule plus haut (vers le marquage central) que les voitures qui se rangent
  // vers le spectateur ; elle est donc dessinée avant elles. Au fond, c'est elle qui est la plus proche : dessinée après.
  const isNearAmbulance = (e: CityEvent): boolean => e.id === 'ambulance' && e.track === 'near';
  const lane = (which: 'far' | 'near'): ReactElement => (
    <g data-city-lane={which}>
      {laneEvents(which).filter(isNearAmbulance).map(eventNode)}
      {/* Vélos après les voitures : leur piste est au bord de la file, plus près du spectateur. */}
      {[...vehicles.filter((v) => v.lane === which && v.kind !== 'bike'), ...vehicles.filter((v) => v.lane === which && v.kind === 'bike')]
        .map((v) => {
          const active = vehActive.has(v.id);
          const yielded = events.yielded.has(v.id);
          return (
            <g
              key={v.id}
              data-life-id={v.id}
              data-vehicle=""
              data-kind={v.kind}
              data-lane={v.lane}
              data-active={active ? 'true' : 'false'}
              data-yield={yielded ? 'true' : undefined}
              transform={vehicleTransform(v, metrics, width, t0, pullDy(v, events.ambulances, metrics, width, t0))}
              opacity={active ? 1 : 0}
              style={{ transition: `opacity ${yielded ? RESIDENT_FADE_S : FADE_S}s ease` }}
            >
              <VehicleSprite vehicle={v} sky={sky} lights={lights} />
            </g>
          );
        })}
      {/* Autres véhicules d'événement de cette file (et de la piste cyclable pour le premier plan). */}
      {laneEvents(which).filter((e) => !isNearAmbulance(e)).map(eventNode)}
    </g>
  );
  const silhouette = (list: typeof facades): ReactElement[] =>
    list.map((b, i) => <rect key={i} x={b.x} y={metrics.ground - b.h} width={b.w} height={b.h + height} fill="#000" />);

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
              post={interiorPost(type, frame.window.w, frame.window.h)}
              ghibli={ghibli}
              doorXs={doorCenters}
            />
          );
        })}
        <ShopCustomers
          visits={visits}
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
              <GhibliFigure outfit={trip.outfit} sky={sky} rainy={rainy} umbrella={intensity.umbrellas} initial={residentPose(trip, p, metrics, still)} hidden={!on} />
            ) : (
              <PersonSprite outfit={trip.outfit} sky={sky} rainy={rainy} umbrella={intensity.umbrellas} />
            );
          return (
            <Fragment key={trip.id}>
              <g data-life-id={trip.id} data-trip-id={trip.id} data-resident="" data-trip={trip.kind} data-active={v.street ? 'true' : 'false'} transform={residentTransform(trip, sPos.x, metrics, !ghibli)} opacity={v.street ? '1.00' : '0.00'}>
                {sprite(sPos, v.street)}
              </g>
              {/* Nœud de porte : <svg> imbriqué rogné à l'ouverture (ni clipPath ni masque : cette couche est copiée par <use>). */}
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
        {/* Déménagement : les porteurs (dessinés avant le camion, ils passent derrière lui en y entrant). */}
        {shops.views.map((view) => (
          <MovingCrew key={view.slot.id} view={view} frame={shops.frames.get(view.slot.id)!} day={dayNumber(date)} seed={seed} width={width} metrics={metrics} sky={sky} rainy={rainy} still={still} t0={t0} minutes={city.minutes} offset={shops.offsets.get(view.slot.id) ?? 0} ghibli={ghibli} />
        ))}
        {peds.map((p) => {
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
              transform={pedTransform(p, metrics, width, t0, !ghibli)}
              opacity={active ? 1 : 0}
            >
              {/* Les enfants accompagnés suivent derrière le parent (repère du sprite : derrière = x négatif), à l'échelle 0,7. */}
              {p.companions.map((outfit, k) => (
                <g key={k} data-companion="" transform={p.pair ? `translate(${(ghibli ? -p.dir : -1) * PAIR_GAP} 0) scale(0.95)` : `translate(${(ghibli ? -p.dir : -1) * COMPANION_GAP * (k + 1)} 0) scale(0.7)`}>
                  {ghibli ? <GhibliFigure outfit={outfit} sky={sky} rainy={rainy} umbrella={false} initial={pedPose(p, metrics, t0, still)} hidden={!active} /> : <PersonSprite outfit={outfit} sky={sky} rainy={rainy} umbrella={false} />}
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
          />
        ))}
      </g>
      <StreetLamps width={width} height={height} seed={seed} minutes={city.minutes} daylight={sky.daylight} forcedNight={forcedNight} />
      {/* Drapeaux de lampadaires, barrières, camionnettes et camions élévateurs : devant les lampadaires, derrière les files. */}
      <InstallLayer {...install} part="front" />
      {/* Rue privatisée de la Fête de la musique : barrières en travers, stands de bière, serveurs, files et foule, triés par
          profondeur sur la chaussée (aucune voiture ne roule alors). */}
      <InstallLayer {...install} part="street" />
      {lane('far')}
      {/* Grand défilé du 14 juillet (route fermée, aucune voiture) : une file du fond réduite, derrière celle du premier plan. */}
      <ParadeLayer lane="far" width={width} seed={seed} sky={sky} still={still} dayFests={dayFests} minutes={city.minutes} metrics={metrics} />
      {lane('near')}
      <ParadeLayer lane="near" width={width} seed={seed} sky={sky} still={still} dayFests={dayFests} minutes={city.minutes} metrics={metrics} />
    </g>
  );
}
