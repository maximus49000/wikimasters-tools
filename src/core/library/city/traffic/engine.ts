// Moteur de circulation de la scène Ville (spec véhicules §1). Pur : graine et temps passés en argument, aucun hasard caché.
// Remplace la boucle (vehiclesFor) : les véhicules entrent par un bord, en pelotons (feu hors champ en amont), et sortent par
// l'autre. Chaque conducteur a son caractère (temperament.ts) et réagit à ce qu'il a perçu il y a `react` s : véhicule de
// devant (historique de 2 s) et feu. Loi de poursuite IDM, pied progressif (commande lissée), freinage franc en dernier
// recours. Arrêts : bus à son arrêt, camionnette en livraison (feux de détresse), benne à ordures ; un conducteur patient
// dépasse un véhicule arrêté quand la voie d'en face est libre. L'ambulance fait ranger les véhicules devant elle.
// Coordonnée de voie `s` : distance parcourue depuis le point d'entrée (x = −MARGIN côté gauche pour la voie du premier plan
// et la piste cyclable, x = width + MARGIN à droite pour la voie du fond) ; sortie quand l'arrière dépasse l'autre bord.
// Pas fixe DT ; l'affichage interpole entre les deux derniers pas.
import { hashString, mulberry32 } from '../../scene-world';
import { outfitFor, type Outfit } from '../people';
import { temperamentOf, type Temperament } from './temperament';
import { carSpeedFactor, carStream, nextCar, type CarSpec, type CarStream } from './cars';
import { carExtent } from './car-art';
import { lightColorAt, newWalker, stepLight, stepWalker, type PushLight, type Walker } from './crossing';
import { SPECIAL_SPEED, specialExtent, type SpecialId, type SpecialSpec } from './special-art';
import { directed, fallbackLine, sceneStopIndex, type BusLine } from './bus-lines';
import { createStopCrowd, stepStops, type StopCrowd, type StopSide } from './bus-stop';
import { stepHorns, type Horn, type HornClock } from './horns';

export type { Horn } from './horns';

export type Track = 'near' | 'far' | 'bike';
export const TRACK_DIR: Readonly<Record<Track, 1 | -1>> = { near: 1, far: -1, bike: 1 };
export type AgentKind = 'car' | 'van' | 'bus' | 'bike' | 'tram' | 'ambulance' | 'garbage-truck' | 'delivery-bike' | 'moto' | 'school-bus';
export type StopReason = 'bus' | 'delivery' | 'garbage' | 'light' | null;

export const DT = 0.1;
// Demi-largeur du passage piéton au feu (px à unit = 1) : les voitures s'arrêtent avant, les feux sont à ses deux bords.
export const CROSS_HALF = 16;
// Poteau du feu d'une voie : à sa ligne d'arrêt (CROSS_HALF + 4 avant le centre du passage), donc en amont du passage pour
// les voitures qui arrivent, jamais derrière.
export const lightPoleX = (lightX: number, track: Track, unit: number): number => lightX - TRACK_DIR[track] * (CROSS_HALF + 3) * unit;
const HIST = 20; // 2 s d'historique
export const MARGIN = 90; // px hors champ de chaque côté (× unit)
const WARM_S = 120;
const MAX_CATCHUP_S = 120;

// Demi-longueur dessinée (repère du sprite) et vitesse de base (px/s à unit = 1) par genre.
export const KIND_HALF: Readonly<Record<AgentKind, number>> = { car: 20, van: 23, bus: 34, bike: 12, tram: 68, ambulance: 21, 'garbage-truck': 34, 'delivery-bike': 12, moto: 12, 'school-bus': 34 };
const KIND_V0: Readonly<Record<AgentKind, number>> = { car: 70, van: 62, bus: 52, bike: 21, tram: 46, ambulance: 130, 'garbage-truck': 34, 'delivery-bike': 27, moto: 64, 'school-bus': 50 };
const VEHICLE_SCALE = 0.85; // STREET_SCALE.vehicle
const FAR_SHRINK = 0.9;
const COLORS = ['#3B6FD6', '#C0463A', '#E0A21E', '#2E8B6A', '#444444', '#EEEEEE', '#7A3B8C', '#B3262B', '#4A9CC4'];

export type Agent = {
  id: string;
  kind: AgentKind;
  track: Track;
  seed: number;
  scale: number;
  half: number; // px
  vmax: number; // px/s
  color: string;
  rider?: Outfit;
  car?: CarSpec; // fiche générée (voitures seulement)
  special?: SpecialSpec; // véhicule à part (bus, utilitaire, service, deux-roues, taxi, police)
  event?: string; // clé de l'événement de rue d'origine
  h: Temperament;
  s: number;
  ps: number; // s au pas précédent (interpolation)
  v: number;
  cmd: number; // accélération appliquée (px/s²)
  dist: number;
  lat: number; // décalage latéral (fraction de l'écart entre voies ; > 0 vers le centre de la chaussée)
  plat: number;
  hist: { s: Float64Array; v: Float64Array; at: number };
  stop: StopReason;
  stopUntil: number;
  stops: number[]; // positions s des arrêts encore à faire (bus, livraison, benne)
  stopFor: [number, number]; // durée d'un arrêt (s), bornes
  waited: number; // temps passé à l'arrêt derrière un véhicule arrêté (patience)
  passing: string | null; // id du véhicule arrêté qu'il dépasse
  pulled: boolean; // rangé devant une ambulance
  hazard: boolean;
  pitch: number; // tangage (rad, > 0 : nez qui plonge)
  ppitch: number;
  lean: number; // inertie des occupants (> 0 : penchés en avant)
  plean: number;
};

export type ScheduledArrival = { key: string; kind: Extract<AgentKind, 'bus' | 'tram' | 'ambulance' | 'garbage-truck' | 'delivery-bike' | 'school-bus'>; track: Track; start: number; half?: number };
export type TrafficEnv = {
  demand: Readonly<Record<Track, number>>; // 0 à 1
  closed: boolean;
  arrivals: readonly ScheduledArrival[];
  // Points de livraison (x du monde) devant les commerces du premier plan.
  deliveries: readonly number[];
  // Piétons du passage : affluence (0 à 1) et largeur de chaussée à traverser (px).
  crowd: number;
  crossPx: number;
  // Inscriptions des fourgons Type H selon les commerces de la rue (LAITERIE par défaut).
  vanLabels?: readonly string[];
  // Lignes de bus réelles (relais /buslines) ; absentes ou vides : trois lignes de repli tirées par la graine.
  busLines?: readonly BusLine[];
  // Établissement scolaire proche (girouette du car scolaire).
  school?: string | null;
};

export type TrafficWorld = {
  width: number;
  seed: number;
  unit: number;
  t: number; // temps du dernier pas (s)
  agents: Agent[];
  serial: number;
  spawnAt: Record<Track, number>;
  rngs: Record<Track, () => number>;
  spawned: Set<string>;
  busStop: Record<'near' | 'far', number>; // x du monde
  light: PushLight; // feu à bouton-poussoir du passage piéton
  walkers: Walker[];
  walkerSerial: number;
  walkerAt: number;
  walkerRng: () => number;
  roster: number; // incrémenté quand la liste des agents change
  cars: CarStream; // suite des voitures générées, partagée par toutes les voies
  vanLabels: readonly string[]; // inscriptions des Type H (relues de l'environnement à chaque entrée)
  lineSrc: readonly BusLine[] | undefined; // lignes reçues (pour repérer un changement)
  lines: readonly BusLine[]; // lignes des bus (réelles, sinon de repli), dans le sens de la voie du premier plan
  stopNames: Record<StopSide, string>; // nom de l'arrêt de la scène, par voie servie
  school: string | null;
  stopCrowd: StopCrowd; // voyageurs des deux arrêts
  horns: Horn[]; // coups de klaxon des 10 dernières secondes (horns.ts)
  hornClock: Map<string, HornClock>; // attente et dernier klaxon des conducteurs impatients
};

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));

export const xOfS = (w: TrafficWorld, track: Track, s: number): number => (TRACK_DIR[track] > 0 ? s - MARGIN * w.unit : w.width + MARGIN * w.unit - s);
const sOfX = (w: TrafficWorld, track: Track, x: number): number => (TRACK_DIR[track] > 0 ? x + MARGIN * w.unit : w.width + MARGIN * w.unit - x);
const span = (w: TrafficWorld): number => w.width + 2 * MARGIN * w.unit;

// Feu tricolore hors champ, en amont de chaque voie : les entrées n'arrivent que pendant son vert (pelotons).
const UPSTREAM = { cycle: 40, green: 24 };
const upstreamGreen = (track: Track, t: number): boolean => {
  const off = (hashString(`up-${track}`) % 1000) / 1000;
  return ((t / UPSTREAM.cycle + off) % 1) * UPSTREAM.cycle < UPSTREAM.green;
};
export function createTraffic(o: { width: number; seed: number; unit: number; startS: number }): TrafficWorld {
  const r = mulberry32(o.seed ^ hashString('traffic'));
  const w: TrafficWorld = {
    width: o.width,
    seed: o.seed,
    unit: o.unit,
    t: Math.floor((o.startS - WARM_S) / DT) * DT,
    agents: [],
    serial: 0,
    spawnAt: { near: 0, far: 0, bike: 0 },
    rngs: { near: mulberry32(o.seed ^ hashString('tr-near')), far: mulberry32(o.seed ^ hashString('tr-far')), bike: mulberry32(o.seed ^ hashString('tr-bike')) },
    spawned: new Set(),
    busStop: { near: o.width * lerp(0.25, 0.75, r()), far: o.width * lerp(0.25, 0.75, r()) },
    // Feu à bouton-poussoir et passage piéton dans toutes les pièces, vers le milieu de la rue ; vert au départ.
    light: { x: o.width * lerp(0.4, 0.6, r()), color: 'green', since: 0, pressedAt: null, log: [] },
    walkers: [],
    walkerSerial: 0,
    walkerAt: 0,
    walkerRng: mulberry32(o.seed ^ hashString('tr-walkers')),
    roster: 0,
    cars: carStream(o.seed ^ hashString('cars')),
    vanLabels: [],
    lineSrc: undefined,
    lines: [],
    stopNames: { near: '', far: '' },
    school: null,
    stopCrowd: createStopCrowd(o.seed, 0),
    horns: [],
    hornClock: new Map(),
  };
  setLines(w, undefined);
  // Arrêts de bus à l'écart du passage piéton (poteaux, voyageurs, bus arrêté et sa file ne se mêlent pas au feu) : au moins
  // 170 unités (230 pour celui d'en face, pour que les deux poteaux ne s'alignent pas), du côté tiré s'il reste dans le monde,
  // sinon de l'autre.
  for (const side of ['near', 'far'] as const) {
    const gap = (side === 'near' ? 230 : 170) * o.unit;
    const d = w.busStop[side] - w.light.x;
    if (Math.abs(d) >= gap) continue;
    const pref = d >= 0 ? 1 : -1;
    const x = w.light.x + pref * gap;
    w.busStop[side] = x > 40 * o.unit && x < o.width - 40 * o.unit ? x : w.light.x - pref * gap;
  }
  w.light.since = w.t - 60;
  w.light.log.push({ t: w.t - 60, color: 'green' });
  w.walkerAt = w.t;
  w.stopCrowd = createStopCrowd(o.seed, w.t);
  w.spawnAt = { near: w.t, far: w.t, bike: w.t };
  return w;
}

function newAgent(w: TrafficWorld, kind: AgentKind, track: Track, extra: Partial<Agent> = {}): Agent {
  const seed = (w.seed * 7919 + w.serial * 104729) >>> 0;
  const r = mulberry32(seed ^ 0x51ed);
  const h = temperamentOf(r);
  // Voiture : fiche tirée de la suite au moment de la création (après le test de place : aucune fiche perdue) ; sa longueur
  // (+ pare-chocs) et son type règlent la demi-longueur et la vitesse voulue. Véhicule à part : son modèle (passé par
  // `extra.special`, sinon tiré ici) règle de même la demi-longueur et la vitesse.
  const special = extra.special ?? specialOf(w, kind, seed, track);
  const car = kind === 'car' && !special ? nextCar(w.cars) : undefined;
  const scale = car || special ? 1 : kind === 'van' ? 0.9 + r() * 0.2 : 1;
  const far = track === 'far' ? FAR_SHRINK : 1;
  const ext = car ? carExtent(car) : special ? specialExtent(special) : KIND_HALF[kind] * scale;
  // `extra.half` (événement de rue sans modèle) est déjà à l'échelle des véhicules.
  const half = (extra.half !== undefined && !special ? extra.half : ext * VEHICLE_SCALE * far) * w.unit;
  const v0 = KIND_V0[kind] * w.unit * (kind === 'ambulance' || kind === 'tram' ? 1 : h.want) * (car ? carSpeedFactor(car.arch) : special ? SPECIAL_SPEED[special.id] : 1);
  const a: Agent = {
    id: `tr-${w.serial++}`,
    kind,
    track,
    seed,
    scale,
    half,
    vmax: v0,
    color: COLORS[Math.floor(r() * COLORS.length)]!,
    ...(kind === 'bike' || kind === 'moto' ? { rider: outfitFor('ordinary', mulberry32(seed ^ 0xb1ce)) } : {}),
    ...(car ? { car } : {}),
    ...(special ? { special } : {}),
    h,
    s: -half,
    ps: -half,
    v: v0 * 0.85,
    cmd: 0,
    dist: 0,
    lat: 0,
    plat: 0,
    hist: { s: new Float64Array(HIST).fill(-half), v: new Float64Array(HIST).fill(v0 * 0.85), at: 0 },
    stop: null,
    stopUntil: 0,
    stops: [],
    stopFor: [0, 0],
    waited: 0,
    passing: null,
    pulled: false,
    hazard: false,
    pitch: 0,
    ppitch: 0,
    lean: 0,
    plean: 0,
    ...extra,
  };
  a.half = half;
  if (special) a.special = special;
  return a;
}

// Modèle d'un véhicule à part, tiré de sa graine (camionnettes, deux-roues) ou fixé par son genre (bus, car scolaire, tram,
// ambulance, benne). Un bus porte l'une des trois lignes de la pièce. Taxis, police et camionnettes de livraison reçoivent
// leur modèle de `spawn` (extra.special).
const pickW = <T,>(u: number, list: readonly (readonly [T, number])[]): T => {
  let acc = u * list.reduce((s, [, p]) => s + p, 0);
  for (const [v, p] of list) if ((acc -= p) < 0) return v;
  return list[list.length - 1]![0];
};
const VANS: readonly (readonly [SpecialId, number])[] = [['estafette', 35], ['type-h', 25], ['poste', 20], ['tipper', 20]];
const MOTOS: readonly (readonly [SpecialId, number])[] = [['vespa', 35], ['mobylette', 30], ['sidecar', 15], ['triporteur', 20]];
function specialOf(w: TrafficWorld, kind: AgentKind, seed: number, track: Track): SpecialSpec | undefined {
  const u = mulberry32(seed ^ 0x5bec)();
  switch (kind) {
    case 'bus':
      return { id: 'bus', seed, line: directed(w.lines[Math.floor(u * w.lines.length)]!, TRACK_DIR[track]) };
    case 'school-bus':
      return { id: 'school-bus', seed, ...(w.school ? { label: w.school } : {}) };
    case 'tram':
      return { id: 'tram', seed };
    case 'ambulance':
      return { id: 'ambulance', seed };
    case 'garbage-truck':
      return { id: 'garbage', seed };
    case 'van':
      return vanSpec(w, pickW(u, VANS), seed);
    case 'moto':
      return { id: pickW(u, MOTOS), seed };
    default:
      void track;
      return undefined;
  }
}
// Lignes des bus de la pièce : réelles si on en a, sinon trois lignes de repli ; nom de l'arrêt de la scène pour chaque sens
// (un arrêt intermédiaire de la première ligne, dans le sens de la voie).
function setLines(w: TrafficWorld, src: readonly BusLine[] | undefined): void {
  w.lineSrc = src;
  w.lines = src && src.length > 0 ? src : [0, 1, 2].map((i) => fallbackLine((w.seed * 3 + i) >>> 0));
  for (const side of ['near', 'far'] as const) {
    const line = directed(w.lines[0]!, TRACK_DIR[side]);
    w.stopNames[side] = line.stops[sceneStopIndex(line, w.seed ^ hashString(`stop-${side}`))] ?? line.to;
  }
}
function vanSpec(w: TrafficWorld, id: SpecialId, seed: number): SpecialSpec {
  if (id !== 'type-h') return { id, seed };
  const labels = w.vanLabels.length > 0 ? w.vanLabels : ['LAITERIE'];
  return { id, seed, label: labels[Math.floor(mulberry32(seed ^ 0x1abe)() * labels.length)]! };
}

const onTrack = (w: TrafficWorld, track: Track): Agent[] => w.agents.filter((a) => a.track === track).sort((p, q) => q.s - p.s);

// Place libre à l'entrée de la voie pour un véhicule de demi-longueur `half`.
function entryFree(w: TrafficWorld, track: Track, half: number): boolean {
  let rear = Infinity;
  for (const a of w.agents) if (a.track === track) rear = Math.min(rear, a.s - a.half);
  return rear - 2 * half > 18 * w.unit;
}

function spawn(w: TrafficWorld, env: TrafficEnv, t: number): void {
  w.vanLabels = env.vanLabels ?? [];
  w.school = env.school ?? null;
  if (env.busLines !== w.lineSrc) {
    setLines(w, env.busLines);
    w.roster++;
  }
  // Événements de rue planifiés : entrent à leur heure dès qu'il y a la place (route fermée : aucun car scolaire).
  for (const e of env.arrivals) {
    if (w.spawned.has(e.key) || e.start > t) continue;
    if (env.closed && e.kind === 'school-bus') continue;
    if (t - e.start > 300) continue; // trop ancien (pièce ouverte longtemps après) : ignoré
    const half = e.half !== undefined ? e.half * VEHICLE_SCALE * (e.track === 'far' ? FAR_SHRINK : 1) : undefined;
    if (!entryFree(w, e.track, (half ?? KIND_HALF[e.kind] * VEHICLE_SCALE) * w.unit)) continue;
    const a = newAgent(w, e.kind, e.track, { event: e.key, ...(half !== undefined ? { half } : {}) });
    if (e.kind === 'bus') { a.stops = [sOfX(w, e.track, w.busStop[e.track === 'far' ? 'far' : 'near'])]; a.stopFor = [8, 14]; }
    if (e.kind === 'garbage-truck') {
      for (let s = 140 * w.unit; s < span(w); s += lerp(110, 170, mulberry32(a.seed)()) * w.unit) a.stops.push(s);
      a.stopFor = [4, 7];
    }
    w.agents.push(a);
    w.spawned.add(e.key);
    w.roster++;
  }
  if (env.closed) return;
  for (const track of ['near', 'far', 'bike'] as const) {
    const d = env.demand[track];
    if (d <= 0.01 || t < w.spawnAt[track]) continue;
    if (track !== 'bike' && !upstreamGreen(track, t)) continue;
    const r = w.rngs[track];
    const roll = r();
    // Part des genres : bus 2,5 %, camionnettes 13,5 %, deux-roues motorisés 5 %, police 1,2 %, taxis 4,8 %, voitures générées.
    const kind: AgentKind = track === 'bike' ? 'bike' : roll < 0.025 ? 'bus' : roll < 0.16 ? 'van' : roll < 0.21 ? 'moto' : 'car';
    const service: SpecialId | null = kind === 'car' && roll < 0.222 ? 'police' : kind === 'car' && roll < 0.27 ? 'taxi' : null;
    const mean = (track === 'bike' ? 9 : 2.1) / d;
    // Prochaine tentative : intervalle tiré (pelotons serrés ou espacés), quelle que soit la place disponible.
    w.spawnAt[track] = t + Math.max(0.6, -Math.log(1 - r() * 0.98) * mean);
    // Place d'entrée : la fiche d'une voiture n'est tirée qu'à sa création, d'où le plus grand encombrement possible (60/2 + 4,2).
    const half = (kind === 'car' ? 34.2 : KIND_HALF[kind] * 1.1) * VEHICLE_SCALE * (track === 'far' ? FAR_SHRINK : 1) * w.unit;
    if (!entryFree(w, track, half)) continue;
    // Camionnette de livraison : Estafette ou Type H (graine de l'agent à venir, comme dans newAgent).
    const nextSeed = (w.seed * 7919 + w.serial * 104729) >>> 0;
    const delivery = kind === 'van' && track === 'near' && env.deliveries.length > 0 && mulberry32(nextSeed ^ 0xde1)() < 0.45;
    const special: SpecialSpec | undefined = service ? { id: service, seed: nextSeed } : delivery ? vanSpec(w, mulberry32(nextSeed ^ 0x5bec)() < 0.55 ? 'estafette' : 'type-h', nextSeed) : undefined;
    const a = newAgent(w, kind, track, special ? { special } : {});
    if (kind === 'bus') { a.stops = [sOfX(w, track, w.busStop[track === 'far' ? 'far' : 'near'])]; a.stopFor = [8, 14]; }
    if (delivery) {
      const x = env.deliveries[Math.floor(mulberry32(a.seed ^ 0xde2)() * env.deliveries.length)]!;
      a.stops = [sOfX(w, track, x)];
      a.stopFor = [20, 40];
    }
    w.agents.push(a);
    w.roster++;
  }
}

// Ce que `me` perçoit de `lead` : sa position et sa vitesse il y a me.h.react s, jamais plus loin qu'il n'est.
function perceived(me: Agent, lead: Agent): { s: number; v: number } {
  const back = Math.min(HIST - 1, Math.round(me.h.react / DT));
  const i = (lead.hist.at - back + HIST * 4) % HIST;
  return { s: Math.min(lead.hist.s[i]!, lead.s), v: lead.hist.v[i]! };
}

function idm(me: Agent, gap: number, vLead: number, t: number, u: number): number {
  const h = me.h;
  const v0 = me.vmax * (1 + h.wobble * Math.sin(t * 0.4 + me.seed));
  const a = h.a * u * (me.kind === 'ambulance' ? 2 : me.kind === 'bike' || me.kind === 'delivery-bike' ? 0.5 : 1);
  const b = h.b * u;
  const sStar = h.s0 * u + me.v * h.T + (me.v * (me.v - vLead)) / (2 * Math.sqrt(a * b));
  const free = 1 - (me.v / Math.max(1, v0)) ** 4;
  return a * (gap < Infinity ? free - (Math.max(sStar, 0) / Math.max(gap, 0.1)) ** 2 : free);
}

// Voie d'en face libre pour dépasser sur [x0, x1] (x du monde) pendant ~3 s.
function oncomingClear(w: TrafficWorld, track: Track, x0: number, x1: number): boolean {
  const other: Track = track === 'near' ? 'far' : 'near';
  const lo = Math.min(x0, x1);
  const hi = Math.max(x0, x1);
  for (const o of w.agents) {
    if (o.track !== other) continue;
    const xo = xOfS(w, other, o.s);
    // L'autre vient en sens inverse : il entre dans la zone en lo..hi s'il en est à moins de 3 s.
    const reach = o.v * 3 + o.half;
    if (xo + reach >= lo && xo - reach <= hi) return false;
  }
  return true;
}

function stepOnce(w: TrafficWorld, env: TrafficEnv): void {
  const t = w.t + DT;
  const u = w.unit;
  spawn(w, env, t);
  stepCrossing(w, env, t);
  const ambulances = w.agents.filter((a) => a.kind === 'ambulance');
  for (const track of ['near', 'far', 'bike'] as const) {
    const list = onTrack(w, track);
    for (let i = 0; i < list.length; i++) {
      const me = list[i]!;
      me.ps = me.s;
      me.plat = me.lat;
      // Ambulance qui arrive derrière : se ranger (s'arrêter au bord) tant qu'elle n'est pas passée.
      const amb = me.kind === 'ambulance' ? null : ambulances.find((a) => a.track === track && a.s < me.s + 30 * u && me.s - a.s < 170 * u);
      const ambPassed = me.pulled && !ambulances.some((a) => a.track === track && a.s < me.s + me.half + a.half + 10 * u);
      if (amb) me.pulled = true;
      else if (ambPassed) me.pulled = false;
      // Véhicule de devant (on ignore les véhicules rangés pour l'ambulance, et celui qu'on dépasse).
      let lead: Agent | null = null;
      for (let j = i - 1; j >= 0; j--) {
        const c = list[j]!;
        if (me.kind === 'ambulance' && c.pulled) continue;
        if (me.passing === c.id) continue;
        lead = c;
        break;
      }
      let gap = Infinity;
      let vLead = 0;
      if (lead) {
        const p = perceived(me, lead);
        gap = p.s - lead.half - (me.s + me.half);
        vLead = p.v;
      }
      // Arrêt prévu (bus, livraison, benne) : obstacle immobile à son point d'arrêt.
      if (me.stop === null && me.stops.length > 0) {
        const g = me.stops[0]! - (me.s + me.half * 0.2);
        if (g < -2 * u) me.stops.shift();
        else if (g < gap) { gap = Math.max(g, 0); vLead = 0; }
        // IDM s'immobilise à sa marge (s0) avant l'obstacle : l'arrêt commence dès qu'il y est presque arrêté.
        if (g < me.h.s0 * u + 3 * u && me.v < 2 * u) {
          me.stops.shift();
          me.stop = me.kind === 'van' ? 'delivery' : me.kind === 'bus' ? 'bus' : 'garbage';
          me.stopUntil = t + lerp(me.stopFor[0], me.stopFor[1], mulberry32(me.seed ^ me.stops.length)());
          me.hazard = me.stop === 'delivery';
        }
      }
      // Feu du monde : perçu avec retard ; s'arrête à la ligne si c'est possible sans freiner trop fort.
      if (track !== 'bike' && me.kind !== 'ambulance') {
        // Ligne d'arrêt avant le passage piéton.
        const stopS = sOfX(w, track, w.light.x) - (CROSS_HALF + 4) * u;
        const front = me.s + me.half;
        const seen = lightColorAt(w.light, t - me.h.react);
        if (seen !== 'green' && front < stopS) {
          const g = stopS - front;
          const canStop = (me.v * me.v) / (2 * me.h.b * u * 1.8) < g + 2 * u;
          if (canStop && g < gap) { gap = g; vLead = 0; }
        }
      }
      let target: number;
      if (me.stop !== null) {
        target = -me.h.b * u * 2;
        if (t >= me.stopUntil) { me.stop = null; me.hazard = false; }
      } else if (me.pulled) {
        target = me.v > 0 ? -me.h.b * u * 1.6 : 0;
      } else target = idm(me, gap, vLead, t, u);
      target = clamp(target, -me.h.b * u * 3, me.h.a * u * (me.kind === 'ambulance' ? 2 : 1));
      if (gap < 1.5 * u) target = Math.min(target, -me.h.b * u * 3);
      me.cmd += (target - me.cmd) * Math.min(1, DT * 3);
      if (gap < 1.5 * u || me.stop !== null) me.cmd = Math.min(me.cmd, target);
      me.v = Math.max(0, me.v + me.cmd * DT);
      // Tangage amorti (nez qui plonge au freinage, arrière qui s'assied à l'accélération) et inertie des occupants, plus
      // lente que la caisse ; bornés (rattrapage après un onglet en arrière-plan).
      me.ppitch = me.pitch;
      me.plean = me.lean;
      const acc = me.v <= 0 && me.cmd < 0 ? 0 : me.cmd / u;
      me.pitch = clamp(me.pitch + (-acc * 0.0006 - me.pitch) * Math.min(1, DT * 6), -0.06, 0.06);
      me.lean = clamp(me.lean + (-acc * 0.03 - me.lean) * Math.min(1, DT * 4), -1.5, 1.5);
      // Aucun chevauchement, même avec un retard de perception : on ne dépasse jamais l'arrière du véhicule de devant.
      let next = me.s + me.v * DT;
      if (lead && me.passing !== lead.id) {
        const limit = lead.s - lead.half - me.half - 1 * u;
        if (next > limit) { next = Math.max(me.s, limit); me.v = Math.min(me.v, lead.v); }
      }
      me.dist += next - me.s;
      me.s = next;
      if (me.v < 0.5 * u && me.cmd < 0) me.cmd = 0;
      // Patience : bloqué derrière un véhicule arrêté (bus, livraison, benne) → le dépasse si la voie d'en face est libre.
      if (track !== 'bike' && me.kind !== 'bus' && me.kind !== 'tram' && lead && lead.stop !== null && lead.stop !== 'light' && me.passing === null && gap < 40 * u && me.v < 3 * u) {
        me.waited += DT;
        if (me.waited > me.h.patience && oncomingClear(w, track, xOfS(w, track, me.s - me.half), xOfS(w, track, lead.s + lead.half + 2 * me.half + 30 * u))) {
          me.passing = lead.id;
          me.waited = 0;
        }
      } else if (me.passing === null) me.waited = 0;
      if (me.passing !== null) {
        const p = w.agents.find((a) => a.id === me.passing);
        if (!p || me.s - me.half > p.s + p.half + 8 * u) me.passing = null;
      }
      // Décalage latéral : place préférée et ondulation ; vers le centre pour dépasser, vers le bord pour se ranger ou livrer.
      const want = me.passing !== null ? 0.62 : me.kind === 'ambulance' ? 0.3 : me.pulled ? -0.3 : me.hazard ? -0.22 : (me.h.lane * 0.08 + me.h.sway * 0.08 * Math.sin(me.dist * me.h.swayF + me.seed)) / Math.max(0.6, u);
      me.lat += (want - me.lat) * Math.min(1, DT * (me.passing !== null || me.pulled ? 1.6 : 0.8));
      const k = (me.hist.at + 1) % HIST;
      me.hist.s[k] = me.s;
      me.hist.v[k] = me.v;
      me.hist.at = k;
    }
  }
  stepBusStops(w, env, t);
  const before = w.agents.length;
  w.agents = w.agents.filter((a) => a.s - a.half < span(w));
  if (w.agents.length !== before) w.roster++;
  stepHorns(w, t, DT, (a) => xOfS(w, a.track, a.s));
  w.t = t;
}

// Porte avant du bus (fraction de sa demi-longueur, voir special-art : porte en x = 26 sur un encombrement de 37,6).
export const BUS_DOOR = 0.69;
// Voyageurs des arrêts (bus-stop.ts) : un bus arrêté à l'arrêt de la scène est retenu tant qu'on monte ou descend.
function stepBusStops(w: TrafficWorld, env: TrafficEnv, t: number): void {
  const busAt = (side: StopSide): { id: string; door: number } | null => {
    const a = w.agents.find((x) => x.track === side && x.kind === 'bus' && x.stop === 'bus');
    return a ? { id: a.id, door: xOfS(w, side, a.s) + TRACK_DIR[side] * a.half * BUS_DOOR } : null;
  };
  const { changed, hold } = stepStops(
    w.stopCrowd,
    { stopX: w.busStop, buses: { near: busAt('near'), far: busAt('far') }, crowd: env.crowd, closed: env.closed, width: w.width, margin: MARGIN * w.unit, unit: w.unit },
    t,
    DT,
  );
  for (const a of w.agents) if (hold.has(a.id)) a.stopUntil = Math.max(a.stopUntil, t + 2 * DT);
  if (changed) w.roster++;
}

// Piétons du passage : arrivées tirées selon l'affluence (au plus 8 à la fois), feu à bouton-poussoir.
function stepCrossing(w: TrafficWorld, env: TrafficEnv, t: number): void {
  if (env.crowd > 0.02 && t >= w.walkerAt) {
    w.walkerAt = t + Math.max(3, -Math.log(1 - w.walkerRng() * 0.98) * (16 / env.crowd));
    if (w.walkers.length < 8) {
      w.walkers.push(newWalker(w.seed, w.walkerSerial++, w.width, MARGIN * w.unit, w.light.x, CROSS_HALF, w.unit));
      w.roster++;
    }
  }
  const before = w.walkers.length;
  w.walkers = w.walkers.filter((p) => stepWalker(p, w.light, t, DT, env.crossPx));
  if (w.walkers.length !== before) w.roster++;
  stepLight(w.light, t);
}

// Fait avancer le monde jusqu'à `toS` (pas fixes). Un retard de plus de MAX_CATCHUP_S (onglet en arrière-plan) est rattrapé
// sur les dernières MAX_CATCHUP_S seulement.
export function advance(w: TrafficWorld, toS: number, env: TrafficEnv): void {
  if (toS - w.t > MAX_CATCHUP_S) w.t = Math.floor((toS - MAX_CATCHUP_S) / DT) * DT;
  while (w.t + DT <= toS + 1e-9) stepOnce(w, env);
}

// Monde déjà vivant à l'instant `startS` (démarrage à chaud de WARM_S s).
export function warmTraffic(o: { width: number; seed: number; unit: number; startS: number }, env: TrafficEnv): TrafficWorld {
  const w = createTraffic(o);
  advance(w, o.startS, env);
  return w;
}

// Position d'affichage interpolée entre les deux derniers pas (`nowS` ≥ w.t − DT).
export function agentView(w: TrafficWorld, a: Agent, nowS: number): { x: number; lat: number; pitch: number; lean: number } {
  const f = clamp((nowS - w.t) / DT + 1, 0, 1);
  return { x: xOfS(w, a.track, lerp(a.ps, a.s, f)), lat: lerp(a.plat, a.lat, f), pitch: lerp(a.ppitch, a.pitch, f), lean: lerp(a.plean, a.lean, f) };
}
// Freine (feux stop) : décélération franche ou arrêt.
export const braking = (a: Agent, unit: number): boolean => a.cmd < -6 * unit || (a.v < 2 * unit && a.stop !== 'delivery');
