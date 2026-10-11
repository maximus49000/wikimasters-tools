import { Fragment, useMemo, type ReactElement } from 'react';
import { STREET_SCALE, type CityMetrics } from '../core/library/city/metrics';
import { outfitFor, type Outfit } from '../core/library/city/people';
import type { Change } from '../core/library/city/shops/lifecycle';
import type { MovingStep } from '../core/library/city/shops/moving';
import type { Rect, ShopFrame } from '../core/library/city/shops/slots';
import { changePlans, type ShopView } from '../core/library/city/shops/view';
import { WORLD_MARGIN, hashString, mulberry32 } from '../core/library/scene-world';
import type { Sky } from '../core/library/sky';
import { setIfChanged } from './city-shops-life';
import { tone } from './city-sprites';
import { PosedPerson, STANDING, applyPose, poseHandles, type PoseHandles } from './shop-gesture-sprites';
import { DOOR_DARK, THRESHOLD_S, doorDarkOpacity, type Passage } from '../core/library/city/doorway';
import { anchorsOf } from '../core/library/figure/bake';
import { shapeOf, signatureOf } from '../core/library/figure/dress';
import { TURN_S, YAW_BACK, YAW_FRONT, YAW_RIGHT, facingYaw, phaseIndexOf, turnYaw } from '../core/library/figure/gait';
import { placeSill, sillBox, sillFigTransform } from './door-passage';
import type { FigureRegistry } from './figure/figure-host';
import { GhibliFigure, hideFigure, poseFigure, type PoseIn } from './figure/ghibli-figure';
import { useSceneDayStart } from './parade-layer';
import type { Pose } from '../core/library/city/shops/gestures';
import { ScriptedCar } from './vehicle/scripted-car';

// Déménagement du matin (vague 1b-iv-b), le jour d'un changement de commerce (moving.ts) : un camion blanc et bleu arrive, se
// gare au bord du trottoir juste après la porte du local (du côté opposé à la vitrine, pour qu'on la voie se vider puis se
// remplir), ouvre son hayon ; deux ou trois déménageurs (bonnet rouge, tenue grise : pas la casquette bleue de l'équipe
// d'enseigne) font la navette entre la porte et le camion. Meuble lourd (vitrine, étagère, table, fauteuil) : tous les porteurs
// en file indienne sous le même meuble ; sinon un carton chacun. Puis le hayon se referme et le camion repart.
// Rendu à la minute (camion, hayon : transitions CSS d'une minute) ; les porteurs suivent un scénario par étape (descente du
// camion, navette, retour à leur place, remontée), placé par la boucle d'animation de CityLifeLayer (collectMovers /
// placeMovers), qui n'écrit que ce qui change. Les porteurs sont dessinés avant le camion : arrivés à l'arrière, ils passent
// derrière lui (« dans » le camion) ; ils sortent du local et y rentrent par le seuil de la porte (door-passage), sans fondu,
// dans les deux graphismes. Ghibli : pantins sans miroir, bras « carry », carton entre les deux mains. Tout est marqué
// `data-mover` (plafond global de sprites). Aucun id SVG. Mouvement réduit : camion garé hayon ouvert ; un porteur figé selon l'étape (au milieu du trajet, un
// carton en main, pendant les portages ; debout à l'arrière du camion pendant le hayon et la pause ; aucun à l'arrivée et au départ).

// ---------- Géométrie ----------
// Écart (px du monde) entre le bord de la porte et l'arrière du camion ; profondeur à laquelle un porteur « entre » dans le camion.
const REAR_GAP = 14;
const INTO_TRUCK = 5;
// Repère du camion (sprite) : regarde vers +x, roues à y = 0, arrière à x = -32 ; charnière du hayon en bas de la caisse.
const TRUCK_REAR = -32;
const HINGE_Y = -6;
const TRUCK_HALF = 34;

export type MovingLayout = {
  doorX: number;
  // Sens du camion : il regarde à l'opposé de la vitrine (son arrière est contre la porte).
  away: 1 | -1;
  parkX: number;
  truckY: number;
  // Hors champ : d'où il arrive (derrière lui), où il repart (devant lui).
  edgeIn: number;
  edgeOut: number;
  // Trajet des porteurs : de la porte (a) à l'arrière du camion (b).
  a: { x: number; y: number };
  b: { x: number; y: number };
  kv: number;
  kp: number;
};

export function movingLayout(frame: ShopFrame, metrics: CityMetrics, width: number): MovingLayout {
  const { door, window: win } = frame;
  const u = metrics.unit;
  const kv = u * STREET_SCALE.vehicle;
  const kp = u * STREET_SCALE.person;
  const doorX = door.x + door.w / 2;
  const away: 1 | -1 = win.x + win.w / 2 < doorX ? 1 : -1;
  // Garé entièrement dans la scène : près d'un bord, le camion recule vers la porte (il peut alors couvrir le bas de la façade
  // voisine, limite assumée) ; l'arrière, où vont les porteurs, suit.
  const half = TRUCK_HALF * kv;
  const parkX = Math.min(width - half, Math.max(half, doorX + away * (door.w / 2 + REAR_GAP) - away * TRUCK_REAR * kv));
  const rearX = parkX + away * TRUCK_REAR * kv;
  const off = WORLD_MARGIN + half;
  return {
    doorX,
    away,
    parkX,
    truckY: metrics.curb + 2 * u,
    edgeIn: away > 0 ? -off : width + off,
    edgeOut: away > 0 ? width + off : -off,
    a: { x: doorX, y: metrics.doorY },
    b: { x: rearX + away * INTO_TRUCK, y: metrics.curb - 4 * u },
    kv,
    kp,
  };
}

// ---------- Camion ----------
// Où est le camion et combien le hayon est ouvert (0 fermé, 1 ouvert) à la minute affichée. Il arrive pendant la dernière minute
// de « truck-arrives » (transition d'une minute depuis le bord), repart dès la première de « leave ». Le hayon vise, à chaque
// minute, l'ouverture qu'il aura à la minute suivante (la transition d'une minute l'y amène).
export type TruckState = { at: 'in' | 'park' | 'out'; open: number };
export function truckAt(step: MovingStep, minutes: number, from: number, to: number, still: boolean): TruckState {
  if (still) return { at: 'park', open: 1 };
  const next = Math.min(1, Math.max(0, (minutes + 1 - from) / (to - from)));
  switch (step) {
    case 'truck-arrives':
      return { at: minutes >= to - 1 ? 'park' : 'in', open: 0 };
    case 'open-back':
      return { at: 'park', open: next };
    case 'close-back':
      return { at: 'park', open: 1 - next };
    case 'leave':
      return { at: 'out', open: 0 };
    default:
      return { at: 'park', open: 1 };
  }
}

const WHITE = '#F4F6F8';
const BLUE = '#2E6FD6';

// Hayon : panneau articulé en bas de la caisse ; fermé il est vertical, ouvert il fait rampe vers l'arrière.
function Tailgate({ open, sky, still }: { open: number; sky: Sky; still: boolean }): ReactElement {
  const t = (c: string): string => tone(c, sky);
  return (
    <g transform={`translate(${TRUCK_REAR} ${HINGE_Y})`}>
      <g data-tailgate-panel="" style={{ transform: `rotate(${(-90 * open).toFixed(1)}deg)`, transition: still ? undefined : 'transform 60s linear' }}>
        <rect x={-1.6} y={-27} width={1.6} height={27} fill={t('#D8DCE2')} stroke={t('#8C939C')} strokeWidth={0.3} />
      </g>
    </g>
  );
}

function TruckSprite({ open, sky, lights, still }: { open: number; sky: Sky; lights: boolean; still: boolean }): ReactElement {
  const t = (c: string): string => tone(c, sky);
  return (
    <g>
      {/* Caisse blanche, bande bleue, petit logo (un carton) ; cabine bleue à l'avant. */}
      <rect x={TRUCK_REAR} y={-34} width={42} height={28} rx={1.5} fill={t(WHITE)} stroke={t('#9AA4AE')} strokeWidth={0.5} />
      <rect x={TRUCK_REAR} y={-17} width={42} height={4} fill={t(BLUE)} />
      <rect x={-15} y={-29} width={8} height={7} fill={t('#C8A06A')} />
      <rect x={-15} y={-26} width={8} height={0.9} fill={t('#8A6A3A')} />
      <path d="M10 -6 V-24 H24 Q31 -24 32 -14 V-6Z" fill={t(BLUE)} />
      <path d="M22 -22 H25 Q29 -22 30 -15 H22Z" fill={t('#CFE4F2')} opacity={0.9} />
      <rect x={TRUCK_REAR} y={-6} width={64} height={2} fill={t('#3A3F4A')} />
      <circle cx={-20} cy={-4.5} r={4.5} fill="#222" />
      <circle cx={22} cy={-4.5} r={4.5} fill="#222" />
      {lights && <circle data-headlight="" cx={31} cy={-10} r={1.8} fill="#FFE9A0" />}
      <Tailgate open={open} sky={sky} still={still} />
    </g>
  );
}

type TruckProps = {
  view: ShopView;
  frame: ShopFrame;
  change: Change | null;
  // Décalage du déménagement de ce local (movingOffsets) : sert à retrouver les bornes de l'étape.
  offset: number;
  seed: number;
  minutes: number;
  width: number;
  metrics: CityMetrics;
  sky: Sky;
  lights: boolean;
  still: boolean;
  // Ghibli (V5) : camion peint (vehicle/scripted-car.tsx), roues tournées par la transition du camion, conducteur à bord
  // tant qu'il roule.
  ghibli?: boolean;
  rainy?: boolean;
};

export function MovingTruck({ view, frame, change, offset, seed, minutes, width, metrics, sky, lights, still, ghibli = false, rainy = false }: TruckProps): ReactElement | null {
  if (!view.moving || !change) return null;
  const plan = changePlans(seed, view.slot.id, change.day, change.kind, offset).moving;
  const step = plan.steps.find((s) => s.step === view.moving!.step)!;
  const s = truckAt(step.step, minutes, step.from, step.to, still);
  const g = movingLayout(frame, metrics, width);
  const x = s.at === 'in' ? g.edgeIn : s.at === 'out' ? g.edgeOut : g.parkX;
  const move = still ? undefined : `transform 60s ${s.at === 'out' ? 'ease-in' : 'ease-out'}`;
  // Conducteur à bord tant que le camion roule : pendant toute l'arrivée (sa dernière minute est déjà « garé » mais la
  // transition l'amène encore à sa place) et au départ ; cabine vide une fois garé.
  const occupied = s.at !== 'park' || step.step === 'truck-arrives';
  return (
    <g
      data-moving-truck={view.slot.id}
      data-mover="truck"
      data-truck-at={s.at}
      data-tailgate={s.open.toFixed(2)}
      style={{ transform: `translate(${x.toFixed(1)}px, ${g.truckY.toFixed(1)}px)`, transition: move }}
    >
      {ghibli ? (
        <ScriptedCar spec={{ id: 'moving-truck', seed: hashString(view.slot.id) }} dir={g.away} k={g.kv} sky={sky} rainy={rainy} lights={lights} still={still} occupied={occupied} roll={{ worldX: x, move }}>
          <Tailgate open={s.open} sky={sky} still={still} />
        </ScriptedCar>
      ) : (
        <g transform={`scale(${(g.away * g.kv).toFixed(3)} ${g.kv.toFixed(3)})`}>
          <TruckSprite open={s.open} sky={sky} lights={lights} still={still} />
        </g>
      )}
    </g>
  );
}

// ---------- Déménageurs ----------
// Meubles portés : un rectangle stylisé par sorte ; les lourds sont portés par toute l'équipe en file indienne, le carton par
// chacun. La sorte change à chaque aller (suite tirée par local).
export const PIECES = ['vitrine', 'carton', 'etagere', 'carton', 'table', 'fauteuil', 'carton'] as const;
export type Piece = (typeof PIECES)[number];
const HEAVY: ReadonlySet<Piece> = new Set(['vitrine', 'etagere', 'table', 'fauteuil']);

// Navette (s) : aller chargé, dépôt (dans le camion ou le local), retour à vide, reprise. SILL : part d'un trajet porte ↔
// camion passée sur le seuil de la porte du local (door-passage) : on en sort, on y rentre, jamais de fondu dans la rue ; au
// camion, on passe derrière la caisse (dessinée après les porteurs) : on y entre.
export const CARRY_CYCLE = 24;
const LEG = 9;
const DROP = 3;
const SILL = 0.1;
// Écart entre deux porteurs de la file (px du monde à unit = 1) ; décalage (s) entre deux porteurs qui descendent du camion,
// y remontent ou passent la porte l'un après l'autre ; profondeur du seuil sur laquelle on se tourne vers la rue (ou la porte).
const FILE_GAP = 9;
const STAGGER = 0.8;
const TURN = 0.3;
// Hauteur des mains (repère du passant : pose « hold ») au-dessus des pieds.
const HANDS = 20;
const HOLD: Pose = { arms: 'hold', lean: 0, head: 'front', item: 'none', sway: 0 };
const REACH: Pose = { arms: 'reach', lean: 0, head: 'front', item: 'none', sway: 0 };

type Pt = { x: number; y: number };
export type CrewGeom = { a: Pt; b: Pt; n: number; gap: number; carry: 'out' | 'in'; kindSeed: number };
// Porteur à un instant : dans la rue, sur le seuil de la porte (`depth` : 0 trottoir, 1 au fond de l'entrée) ou hors de vue
// (dans le local, dans le camion). `walked` : px parcourus (phase des pas du pantin) ; `reach` : main tendue vers le hayon.
export type MoverPos = { where: 'street' | 'door' | 'off'; x: number; y: number; depth: number; dir: 1 | -1; yaw: number; gait: 'walk' | 'step' | 'stand'; walked: number; loaded: boolean; reach: boolean };
// Meuble lourd : position des pieds de la file (milieu entre le premier et le dernier), dans la rue ou sur le seuil.
export type PiecePos = { where: 'street' | 'door'; x: number; y: number; depth: number };
export type CrewFrame = { movers: MoverPos[]; kind: Piece; heavy: PiecePos | null };

const OFF: MoverPos = { where: 'off', x: 0, y: 0, depth: 1, dir: 1, yaw: YAW_FRONT, gait: 'stand', walked: 0, loaded: false, reach: false };
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const lerpPt = (p: Pt, q: Pt, f: number): Pt => ({ x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f });
const sideOf = (from: number, to: number, fallback: 1 | -1 = 1): 1 | -1 => (to > from ? 1 : to < from ? -1 : fallback);

// Orientation sur le seuil : en sortant, de face puis tourné vers la rue (côté `face`) ; en entrant, l'inverse, de dos au fond.
function sillYaw(depth: number, out: boolean, face: 1 | -1): number {
  const side = facingYaw(face);
  if (out) return depth > TURN ? YAW_FRONT : turnYaw(YAW_FRONT, side, 1 - depth / TURN);
  return depth > TURN ? YAW_BACK : turnYaw(side, YAW_BACK, depth / TURN);
}

// Avancée `si` (0 → 1) sur un trajet entre la porte (a) et l'arrière du camion (b) ; `out` : de la porte vers le camion.
function legAt(g: CrewGeom, out: boolean, si: number, len: number): Omit<MoverPos, 'loaded' | 'reach'> {
  const dir = out ? sideOf(g.a.x, g.b.x) : sideOf(g.b.x, g.a.x);
  if (out ? si < SILL : si > 1 - SILL) {
    const depth = out ? 1 - si / SILL : (si - (1 - SILL)) / SILL;
    return { where: 'door', x: g.a.x, y: g.a.y, depth, dir, yaw: sillYaw(depth, out, dir), gait: 'walk', walked: out ? 0 : len };
  }
  const f = out ? (si - SILL) / (1 - SILL) : si / (1 - SILL);
  const p = out ? lerpPt(g.a, g.b, f) : lerpPt(g.b, g.a, f);
  return { where: 'street', x: p.x, y: p.y, depth: 0, dir, yaw: facingYaw(dir), gait: 'walk', walked: f * len };
}

// Navette à `tau` s de son début : le premier ouvre la marche, les suivants à `gap` (fraction du trajet) derrière ; au départ
// et à l'arrivée d'un trajet, hors de vue (dans le local ou le camion). Chaque tour finit l'équipe entière à l'origine du mobilier.
export function crewFrame(g: CrewGeom, tau: number): CrewFrame {
  const trip = Math.floor(tau / CARRY_CYCLE);
  const c = tau - trip * CARRY_CYCLE;
  const kind = PIECES[(((g.kindSeed + trip) % PIECES.length) + PIECES.length) % PIECES.length]!;
  const len = Math.hypot(g.b.x - g.a.x, g.b.y - g.a.y);
  const span = 1 + (g.n - 1) * g.gap;
  let s = 0;
  let leg: 'load' | 'back' | null = null;
  if (c < LEG) {
    s = (c / LEG) * span;
    leg = 'load';
  } else if (c >= LEG + DROP && c < 2 * LEG + DROP) {
    s = ((c - LEG - DROP) / LEG) * span;
    leg = 'back';
  }
  // Chargé : de l'origine du mobilier (porte pour sortir, camion pour rentrer) vers l'autre bout ; à vide, l'inverse.
  const out = (leg === 'load') === (g.carry === 'out');
  const movers: MoverPos[] = [];
  for (let i = 0; i < g.n; i++) {
    const si = clamp01(s - i * g.gap);
    movers.push(!leg || si <= 0 || si >= 1 ? OFF : { ...legAt(g, out, si, len), loaded: leg === 'load', reach: false });
  }
  let heavy: PiecePos | null = null;
  if (leg === 'load' && HEAVY.has(kind)) {
    const sm = (clamp01(s) + clamp01(s - (g.n - 1) * g.gap)) / 2;
    if (sm > 0 && sm < 1) {
      const p = legAt(g, out, sm, len);
      heavy = { where: p.where === 'door' ? 'door' : 'street', x: p.x, y: p.y, depth: p.depth };
    }
  }
  return { movers, kind, heavy };
}

// Scénario de l'équipe pour l'étape affichée (instants en secondes de l'horloge murale) : descente du camion (ouverture du
// hayon), allers et retours (portages, précédés du trajet jusqu'au local ou au camion), retour à leur place depuis le local ou
// le camion (pause, fermeture), remontée dans le camion (fermeture). Personne n'apparaît ni ne disparaît sur place : on sort
// de la caisse du camion (`hide`, cachée par la carrosserie) ou de la porte du local, on y rentre.
export type CrewScript = {
  step: MovingStep;
  t0: number;
  t1: number;
  door: Rect;
  geom: CrewGeom;
  hide: Pt;
  spots: Pt[];
  face: (1 | -1)[];
  // Où est l'équipe au début de l'étape (fin de la précédente) : dans le camion, à sa place, dans le local, à l'arrière du camion.
  from: 'hide' | 'spot' | 'door' | 'truck';
  // Le premier porteur manœuvre le hayon (ouverture, fermeture).
  reach: boolean;
  speed: number;
  k: number;
};
type Seg =
  | { k: 'off'; dur: number }
  | { k: 'turn'; at: Pt; from: number; to: number; dir: 1 | -1; dur: number }
  | { k: 'walk'; from: Pt; to: Pt; dur: number }
  | { k: 'sill'; from: number; to: number; face: 1 | -1; dur: number }
  | { k: 'stand'; at: Pt; face: 1 | -1; reach: boolean; dur: number };

// Orientation debout à sa place : de trois quarts, tourné vers `face` ; sens du sprite classique (miroir) d'une orientation.
const dirOfYaw = (yaw: number, fallback: 1 | -1): 1 | -1 => (yaw > 4 && yaw < 12 ? -1 : yaw < 4 || yaw > 12 ? 1 : fallback);
const standYaw = (face: 1 | -1): number => (face > 0 ? 2 : 6);

function segsOf(sc: CrewScript, i: number): Seg[] {
  const g = sc.geom;
  const spot = sc.spots[i]!;
  const segs: Seg[] = [];
  // Orientation courante : chaque marche commence (et finit) par quelques petits pas sur place, jamais de demi-tour d'un coup.
  let yaw = standYaw(sc.face[i]!);
  const turn = (at: Pt, to: number, dir: 1 | -1): void => {
    if (to !== yaw) segs.push({ k: 'turn', at, from: yaw, to, dir, dur: TURN_S });
    yaw = to;
  };
  const walk = (from: Pt, to: Pt): void => {
    const dir = sideOf(from.x, to.x);
    turn(from, facingYaw(dir), dir);
    segs.push({ k: 'walk', from, to, dur: Math.hypot(to.x - from.x, to.y - from.y) / sc.speed });
  };
  const toSpot = (): void => turn(spot, standYaw(sc.face[i]!), sc.face[i]!);
  const wait = i * STAGGER;
  if (sc.from === 'hide') {
    segs.push({ k: 'off', dur: wait });
    yaw = facingYaw(sideOf(sc.hide.x, spot.x)); // déjà tourné dans la caisse, caché
    walk(sc.hide, spot);
    toSpot();
  } else if (sc.from === 'door') {
    // Le seuil fait lui-même le quart de tour (de face, puis vers la rue).
    const dir = sideOf(g.a.x, spot.x);
    segs.push({ k: 'off', dur: wait }, { k: 'sill', from: 1, to: 0, face: dir, dur: THRESHOLD_S });
    yaw = facingYaw(dir);
    walk(g.a, spot);
    toSpot();
  } else if (sc.from === 'truck') {
    segs.push({ k: 'off', dur: wait });
    yaw = facingYaw(sideOf(g.b.x, spot.x));
    walk(g.b, spot);
    toSpot();
  }
  const stand = (dur: number): void => void segs.push({ k: 'stand', at: spot, face: sc.face[i]!, reach: sc.reach && i === 0, dur });
  switch (sc.step) {
    case 'carry-out':
      stand(wait);
      walk(spot, g.a);
      segs.push({ k: 'sill', from: 0, to: 1, face: sideOf(spot.x, g.a.x), dur: THRESHOLD_S });
      break;
    case 'carry-in':
      stand(wait);
      walk(spot, g.b);
      break;
    case 'close-back': {
      // Le hayon fermé aux trois cinquièmes de l'étape, ils remontent dans le camion l'un après l'autre.
      const before = segs.reduce((sum, x) => sum + x.dur, 0);
      stand(Math.max(0, (sc.t1 - sc.t0) * 0.6 - before) + wait);
      walk(spot, sc.hide);
      break;
    }
    default:
      stand(Infinity);
  }
  segs.push({ k: 'off', dur: Infinity });
  return segs;
}

function segPos(sc: CrewScript, s: Seg, p: number, walked: number): MoverPos {
  switch (s.k) {
    case 'off':
      return OFF;
    case 'turn':
      return { where: 'street', x: s.at.x, y: s.at.y, depth: 0, dir: p < 0.5 ? dirOfYaw(s.from, s.dir) : s.dir, yaw: turnYaw(s.from, s.to, p), gait: 'step', walked, loaded: false, reach: false };
    case 'walk': {
      const at = lerpPt(s.from, s.to, p);
      const dir = sideOf(s.from.x, s.to.x);
      return { where: 'street', x: at.x, y: at.y, depth: 0, dir, yaw: facingYaw(dir), gait: 'walk', walked: walked + p * s.dur * sc.speed, loaded: false, reach: false };
    }
    case 'sill': {
      const depth = s.from + (s.to - s.from) * p;
      return { where: 'door', x: sc.geom.a.x, y: sc.geom.a.y, depth, dir: s.face, yaw: sillYaw(depth, s.to < s.from, s.face), gait: 'walk', walked, loaded: false, reach: false };
    }
    default:
      return { where: 'street', x: s.at.x, y: s.at.y, depth: 0, dir: s.face, yaw: standYaw(s.face), gait: 'stand', walked, loaded: false, reach: s.reach };
  }
}

function scriptAt(sc: CrewScript, i: number, tau: number): MoverPos {
  let c = tau;
  let walked = 0;
  for (const s of segsOf(sc, i)) {
    if (c < s.dur) return segPos(sc, s, Number.isFinite(s.dur) && s.dur > 0 ? c / s.dur : 0, walked);
    c -= s.dur;
    if (s.k === 'walk') walked += s.dur * sc.speed;
  }
  return OFF;
}

// Portages : la navette part quand le dernier porteur est entré dans le local (ou le camion), et s'arrête au dernier tour complet.
const preludeOf = (sc: CrewScript): number =>
  Math.max(...sc.spots.map((_, i) => segsOf(sc, i).reduce((sum, s) => sum + (Number.isFinite(s.dur) ? s.dur : 0), 0))) + 0.5;
const carrying = (step: MovingStep): boolean => step === 'carry-out' || step === 'carry-in';

export function frameAt(sc: CrewScript, t: number): CrewFrame {
  const tau = Math.max(0, t - sc.t0);
  if (carrying(sc.step)) {
    const p = preludeOf(sc);
    if (tau >= p) {
      const cycles = Math.floor((sc.t1 - sc.t0 - p) / CARRY_CYCLE);
      if (tau - p < cycles * CARRY_CYCLE) return crewFrame(sc.geom, tau - p);
      return { movers: sc.spots.map(() => OFF), kind: 'carton', heavy: null };
    }
  }
  return { movers: sc.spots.map((_, i) => scriptAt(sc, i, tau)), kind: 'carton', heavy: null };
}

// Tenue des déménageurs : profil `worker`, mais bonnet rouge et maillot gris (l'équipe d'enseigne a casquette et veste bleues).
export function moverOutfit(seed: number, slotId: string, day: number, i: number): Outfit {
  const o = outfitFor('worker', mulberry32(seed ^ hashString(`${slotId}/mover/${day}/${i}`)));
  return { ...o, hair: 'beanie', hatColor: i === 0 ? '#C0392B' : '#D95F2B', top: 'jersey', topColor: '#5A6470', bottom: 'pants', bottomColor: '#2A2F3A', accessory: 'none' };
}
export const moversFor = (seed: number, slotId: string, day: number): number => 2 + (hashString(`${seed}/${slotId}/${day}/movers`) % 2);

// Meuble lourd (centré sur x = 0, posé sur les mains à y = 0), en px du monde ; `len` : longueur portée.
function PieceSprite({ kind, len, u, sky }: { kind: Piece; len: number; u: number; sky: Sky }): ReactElement | null {
  const t = (c: string): string => tone(c, sky);
  const x = -len / 2;
  switch (kind) {
    case 'vitrine':
      return (
        <>
          <rect x={x} y={-6 * u} width={len} height={6 * u} fill={t('#5A606C')} />
          <rect x={x + 0.8 * u} y={-5.2 * u} width={len - 1.6 * u} height={3.4 * u} fill={t('#BFE3F0')} />
        </>
      );
    case 'etagere':
      return (
        <>
          <rect x={x} y={-7 * u} width={len} height={7 * u} fill={t('#8A5A2B')} />
          <rect x={x} y={-4.8 * u} width={len} height={0.6 * u} fill={t('#5A3A1A')} />
          <rect x={x} y={-2.4 * u} width={len} height={0.6 * u} fill={t('#5A3A1A')} />
        </>
      );
    case 'table':
      // Retournée, pieds en l'air.
      return (
        <>
          <rect x={x} y={-1.6 * u} width={len} height={1.6 * u} fill={t('#A8743A')} />
          <rect x={x + 0.6 * u} y={-5 * u} width={0.8 * u} height={3.4 * u} fill={t('#7A5226')} />
          <rect x={-x - 1.4 * u} y={-5 * u} width={0.8 * u} height={3.4 * u} fill={t('#7A5226')} />
        </>
      );
    case 'fauteuil':
      return (
        <>
          <rect x={x} y={-3 * u} width={len} height={3 * u} rx={0.8 * u} fill={t('#9A2A3A')} />
          <rect x={x} y={-6 * u} width={2.4 * u} height={6 * u} rx={0.8 * u} fill={t('#7A1A2A')} />
        </>
      );
    default:
      return null;
  }
}

// Carton à la main (repère du passant : main de la pose « hold » en (9, -21)).
function BoxSprite({ sky }: { sky: Sky }): ReactElement {
  return (
    <>
      <rect x={4.5} y={-27} width={9} height={7} fill={tone('#C8A06A', sky)} />
      <rect x={4.5} y={-24} width={9} height={1.1} fill={tone('#8A6A3A', sky)} />
    </>
  );
}
// Ghibli : le même carton, posé sur les deux mains du pantin (accroche `hands`), centré entre elles.
const GHIBLI_BOX = 'translate(-9 21)';

// Ghibli : pose du pantin (sans miroir) ; classique : geste du passant (retourné selon le sens de marche).
const ghibliPose = (p: MoverPos, k: number): PoseIn => ({
  yaw: p.yaw,
  gait: p.gait,
  phase: p.gait === 'stand' ? 0 : phaseIndexOf(p.walked / k + p.depth * 8),
  head: 0,
  arms: p.loaded ? 'carry' : p.reach ? 'reach' : 'swing',
});
const classicPose = (p: MoverPos): Pose => (p.loaded ? HOLD : p.reach ? REACH : STANDING);
// Hauteur des mains d'un déménageur Ghibli qui porte (bras `carry`), unités du pantin : le meuble lourd y est posé.
const ghibliHands = (o: Outfit): number => {
  const a = anchorsOf({ sig: signatureOf(shapeOf(o, false)), yaw: YAW_RIGHT, gait: 'stand', phase: 0, head: 0, arms: 'carry', lean: 0 });
  return -(a.handR[1] + a.handL[1]) / 2;
};

const moverTransform = (x: number, y: number, dir: number, kp: number, ghibli: boolean): string =>
  `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${((ghibli ? 1 : dir) * kp).toFixed(3)} ${kp.toFixed(3)})`;
const sillPassage = (p: MoverPos, a: Pt): Passage =>
  p.where === 'door' ? { stage: 'threshold', x: p.x, depth: p.depth, yaw: p.yaw, gait: 'walk', walked: p.walked } : { stage: 'threshold', x: a.x, depth: 1, yaw: YAW_BACK, gait: 'walk', walked: 0 };
const piecePassage = (hp: PiecePos | null, a: Pt): Passage => ({ stage: 'threshold', x: hp?.where === 'door' ? hp.x : a.x, depth: hp?.where === 'door' ? hp.depth : 1, yaw: YAW_FRONT, gait: 'walk', walked: 0 });

type CrewProps = {
  view: ShopView;
  frame: ShopFrame;
  day: number;
  seed: number;
  width: number;
  metrics: CityMetrics;
  sky: Sky;
  rainy: boolean;
  still: boolean;
  // Instant du premier dessin (s) : même calcul qu'à la première image de la boucle.
  t0: number;
  // Minute de la scène (début du jour sur l'horloge murale) et décalage du déménagement (movingOffsets) : bornes de l'étape.
  minutes: number;
  offset: number;
  ghibli?: boolean;
};

// Le groupe de l'équipe est à clé par étape : un changement d'étape recrée les nœuds, aucun carton visible ni bras chargés
// écrits par la boucle pendant le portage ne restent sur la pause ou la fermeture du hayon. Chaque porteur a deux nœuds : la rue
// et le seuil de la porte du local (<svg> imbriqué rogné à l'ouverture, ni clipPath ni masque), comme les clients.
export function MovingCrew({ view, frame, day, seed, width, metrics, sky, rainy, still, t0, minutes, offset, ghibli = false }: CrewProps): ReactElement | null {
  const id = view.slot.id;
  const n = moversFor(seed, id, day);
  const outfits = useMemo(() => Array.from({ length: n }, (_, i) => moverOutfit(seed, id, day, i)), [seed, id, day, n]);
  const dayStart = useSceneDayStart(minutes, t0);
  if (!view.moving) return null;
  const step = view.moving.step;
  // Dans la cabine : à l'arrivée et au départ, on ne voit pas l'équipe (mouvement réduit compris).
  if (step === 'truck-arrives' || step === 'leave') return null;
  const g = movingLayout(frame, metrics, width);
  const u = metrics.unit;
  const len = Math.hypot(g.b.x - g.a.x, g.b.y - g.a.y);
  const gap = (FILE_GAP * u) / len;
  const at = (s: number): Pt => ({ x: g.a.x + (g.b.x - g.a.x) * s, y: g.a.y + (g.b.y - g.a.y) * s });
  const toTruck: 1 | -1 = g.b.x >= g.a.x ? 1 : -1;
  const kp = g.kp;
  const box = (on: boolean): ReactElement => (
    <g data-mover-box="" visibility={on ? 'visible' : 'hidden'}>
      {ghibli ? <g transform={GHIBLI_BOX}><BoxSprite sky={sky} /></g> : <BoxSprite sky={sky} />}
    </g>
  );
  const figure = (i: number, p: MoverPos, on: boolean, carton: boolean): ReactElement =>
    ghibli ? (
      <GhibliFigure outfit={outfits[i]!} sky={sky} rainy={rainy} umbrella={false} initial={ghibliPose(p, kp)} hidden={!on} held={[{ anchor: 'hands', node: box(p.loaded && carton) }]} />
    ) : (
      <>
        <PosedPerson outfit={outfits[i]!} sky={sky} rainy={rainy} umbrella={false} accessory={null} pose={classicPose(p)} />
        {box(p.loaded && carton)}
      </>
    );
  const streetNode = (i: number, p: MoverPos, carton: boolean): ReactElement => {
    const on = p.where === 'street';
    return (
      <g key={`s${i}`} data-mover="porter" data-mover-i={i} transform={moverTransform(on ? p.x : g.a.x, on ? p.y : g.a.y, p.dir, kp, ghibli)} visibility={on ? 'visible' : 'hidden'}>
        {figure(i, p, on, carton)}
      </g>
    );
  };
  // Mouvement réduit : un seul porteur, figé. Pendant un portage, au milieu du trajet, un carton en main, tourné vers où il va ;
  // sinon (hayon, pause), debout à l'arrière du camion, les mains vides.
  if (still) {
    const loaded = carrying(step);
    const p = at(loaded ? 0.5 : 0.62);
    const dir: 1 | -1 = step === 'carry-in' ? (-toTruck as 1 | -1) : toTruck;
    const pos: MoverPos = { where: 'street', x: p.x, y: p.y, depth: 0, dir, yaw: loaded ? facingYaw(dir) : dir > 0 ? 2 : 6, gait: 'stand', walked: 0, loaded, reach: false };
    return (
      <g key={`${id}-${step}`} data-moving-crew={id} data-moving-step={step} data-still="">
        {streetNode(0, pos, true)}
      </g>
    );
  }
  const plan = changePlans(seed, id, day, view.moving.kind, offset).moving;
  const k = plan.steps.findIndex((s) => s.step === step);
  const cur = plan.steps[k]!;
  const prev = plan.steps[k - 1]?.step;
  const geom: CrewGeom = { a: g.a, b: g.b, n, gap, carry: step === 'carry-in' ? 'in' : 'out', kindSeed: hashString(`${seed}/${id}/${day}/pieces`) % PIECES.length };
  const script: CrewScript = {
    step,
    t0: dayStart + cur.from * 60,
    t1: dayStart + cur.to * 60,
    door: frame.door,
    geom,
    hide: { x: g.parkX + g.away * (TRUCK_REAR + 21) * g.kv, y: g.b.y },
    spots: outfits.map((_, i) => at(0.62 - i * gap * 1.3)),
    face: outfits.map((_, i) => (step === 'pause' && i > 0 ? (-toTruck as 1 | -1) : toTruck)),
    from: step === 'open-back' ? 'hide' : carrying(step) ? 'spot' : prev === 'carry-out' ? 'door' : prev === 'carry-in' ? 'truck' : 'spot',
    reach: step === 'open-back' || step === 'close-back',
    speed: (len * (1 + (n - 1) * gap)) / LEG / (1 - SILL),
    k: kp,
  };
  // Premier dessin : le même instant que la première image de la boucle (t0 = Date.now() du rendu), pour que rien ne bouge
  // entre le rendu et la première pose.
  const f = frameAt(script, t0);
  const pieceLen = Math.max(7 * u, (n - 1) * FILE_GAP * u * (Math.abs(g.b.x - g.a.x) / len) + 6 * u);
  const lift = (ghibli ? ghibliHands(outfits[0]!) : HANDS) * kp;
  const pieceArt = (
    <g transform={`translate(0 ${(-lift).toFixed(2)})`}>
      {PIECES.filter((kd, i) => HEAVY.has(kd) && PIECES.indexOf(kd) === i).map((kd) => (
        <g key={kd} data-piece={kd} visibility={f.kind === kd ? 'visible' : 'hidden'}>
          <PieceSprite kind={kd} len={pieceLen} u={u} sky={sky} />
        </g>
      ))}
    </g>
  );
  const hp = f.heavy;
  const pp = piecePassage(hp, g.a);
  const pBox = sillBox(frame.door, pp.depth, metrics, 1);
  return (
    <g
      key={`${id}-${step}`}
      data-moving-crew={id}
      data-moving-step={step}
      data-script={JSON.stringify(script)}
      data-ghibli={ghibli ? 'true' : undefined}
      {...(carrying(step) ? { 'data-carry': geom.carry } : {})}
    >
      {/* Du dernier au premier : celui qui ouvre la marche est dessiné par-dessus. */}
      {[...f.movers.keys()].reverse().map((i) => {
        const p = f.movers[i]!;
        const carton = f.kind === 'carton';
        const sp = sillPassage(p, g.a);
        const { clip, dark } = sillBox(frame.door, sp.depth, metrics, kp);
        const door = p.where === 'door';
        return (
          <Fragment key={i}>
            {streetNode(i, p, carton)}
            <svg data-mover-door="" data-mover-i={i} x={clip.x.toFixed(2)} y={clip.y.toFixed(2)} width={clip.w.toFixed(2)} height={clip.h.toFixed(2)} overflow="hidden" visibility={door ? 'visible' : 'hidden'}>
              <rect data-door-dark="" x={dark.x.toFixed(2)} y={dark.y.toFixed(2)} width={dark.w.toFixed(2)} height={dark.h.toFixed(2)} fill={DOOR_DARK} opacity={door ? doorDarkOpacity(sp.depth).toFixed(2) : '0.00'} />
              <g data-door-fig="" transform={sillFigTransform(sp, clip, metrics, kp, ghibli ? 1 : p.dir)} opacity={(1 - sp.depth).toFixed(2)}>
                {figure(i, p, door, carton)}
              </g>
            </svg>
          </Fragment>
        );
      })}
      <g data-mover="piece" transform={`translate(${(hp?.where === 'street' ? hp.x : g.a.x).toFixed(1)} ${(hp?.where === 'street' ? hp.y : g.a.y).toFixed(1)})`} visibility={hp?.where === 'street' ? 'visible' : 'hidden'}>
        {pieceArt}
      </g>
      <svg data-piece-door="" x={pBox.clip.x.toFixed(2)} y={pBox.clip.y.toFixed(2)} width={pBox.clip.w.toFixed(2)} height={pBox.clip.h.toFixed(2)} overflow="hidden" visibility={hp?.where === 'door' ? 'visible' : 'hidden'}>
        <g data-door-fig="" transform={sillFigTransform(pp, pBox.clip, metrics, 1, 1)} opacity={(1 - pp.depth).toFixed(2)}>
          {pieceArt}
        </g>
      </svg>
    </g>
  );
}

// ---------- Boucle : scénario des porteurs ----------
type MoverNodes = { street: Element; door: Element | null; streetFig: Element | null; doorFig: Element | null; boxes: Element[]; handles: PoseHandles[] };
export type Crew = { script: CrewScript; ghibli: boolean; movers: MoverNodes[]; piece: Element | null; pieceDoor: Element | null; kinds: Element[] };
export function collectMovers(root: Element): Crew[] {
  const out: Crew[] = [];
  for (const node of root.querySelectorAll('[data-moving-crew][data-script]')) {
    const ghibli = node.getAttribute('data-ghibli') === 'true';
    const byI = (sel: string): Map<number, Element> => new Map([...node.querySelectorAll(sel)].map((e) => [Number(e.getAttribute('data-mover-i')), e] as const));
    const streets = byI(':scope > [data-mover="porter"]');
    const doors = byI(':scope > svg[data-mover-door]');
    const movers: MoverNodes[] = [...streets.keys()].sort((x, y) => x - y).map((i) => {
      const street = streets.get(i)!;
      const door = doors.get(i) ?? null;
      const nodes = door ? [street, door] : [street];
      return {
        street,
        door,
        streetFig: street.querySelector('[data-figure]'),
        doorFig: door?.querySelector('[data-figure]') ?? null,
        boxes: nodes.flatMap((e) => [...e.querySelectorAll('[data-mover-box]')]),
        handles: ghibli ? [] : nodes.map((e) => poseHandles(e)),
      };
    });
    out.push({
      script: JSON.parse(node.getAttribute('data-script')!) as CrewScript,
      ghibli,
      movers,
      piece: node.querySelector(':scope > [data-mover="piece"]'),
      pieceDoor: node.querySelector(':scope > svg[data-piece-door]'),
      kinds: [...node.querySelectorAll('[data-piece]')],
    });
  }
  return out;
}

// Pose de l'équipe à l'instant t (s) : n'écrit que ce qui change. `figures` : registre des pantins (Ghibli).
export function placeMovers(crews: Crew[], t: number, m: CityMetrics, figures: FigureRegistry | null = null): void {
  for (const c of crews) {
    const sc = c.script;
    const f = frameAt(sc, t);
    f.movers.forEach((p, i) => {
      const nd = c.movers[i];
      if (!nd) return;
      const street = p.where === 'street';
      const door = p.where === 'door';
      setIfChanged(nd.street, 'visibility', street ? 'visible' : 'hidden');
      setIfChanged(nd.door, 'visibility', door ? 'visible' : 'hidden');
      for (const b of nd.boxes) setIfChanged(b, 'visibility', p.loaded && f.kind === 'carton' ? 'visible' : 'hidden');
      if (street) setIfChanged(nd.street, 'transform', moverTransform(p.x, p.y, p.dir, sc.k, c.ghibli));
      if (door && nd.door) placeSill(nd.door, sc.door, sillPassage(p, sc.geom.a), m, sc.k, c.ghibli ? 1 : p.dir);
      if (c.ghibli && figures) {
        if (street) poseFigure(figures, nd.streetFig, ghibliPose(p, sc.k));
        else hideFigure(figures, nd.streetFig);
        if (door) poseFigure(figures, nd.doorFig, ghibliPose(p, sc.k));
        else hideFigure(figures, nd.doorFig);
      } else if (street || door) for (const h of nd.handles) applyPose(h, classicPose(p));
    });
    const hp = f.heavy;
    setIfChanged(c.piece, 'visibility', hp?.where === 'street' ? 'visible' : 'hidden');
    setIfChanged(c.pieceDoor, 'visibility', hp?.where === 'door' ? 'visible' : 'hidden');
    if (hp) {
      if (hp.where === 'street') setIfChanged(c.piece, 'transform', `translate(${hp.x.toFixed(1)} ${hp.y.toFixed(1)})`);
      else if (c.pieceDoor) placeSill(c.pieceDoor, sc.door, piecePassage(hp, sc.geom.a), m, 1, 1);
      for (const k of c.kinds) setIfChanged(k, 'visibility', k.getAttribute('data-piece') === f.kind ? 'visible' : 'hidden');
    }
  }
}
