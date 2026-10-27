import { Fragment, useMemo, type ReactElement } from 'react';
import { STREET_SCALE, type CityMetrics } from '../core/library/city/metrics';
import { outfitFor, type Outfit } from '../core/library/city/people';
import type { Change } from '../core/library/city/shops/lifecycle';
import type { MovingStep } from '../core/library/city/shops/moving';
import { moverAt, pieceAt, planCrew, type CrewInput, type CrewPlan, type HeavyPiece, type MoverAt, type PieceAt, type Pt, type Seg } from '../core/library/city/shops/moving-crew';
import type { ShopFrame } from '../core/library/city/shops/slots';
import { changePlans, type ShopView } from '../core/library/city/shops/view';
import { WORLD_MARGIN, hashString, mulberry32 } from '../core/library/scene-world';
import type { Sky } from '../core/library/sky';
import { setIfChanged } from './city-shops-life';
import { citizenSeed } from '../core/citizens/identity';
import { tone } from './city-sprites';
import { PosedPerson, STANDING, applyPose, poseHandles, type PoseHandles } from './shop-gesture-sprites';
import { DOOR_DARK, doorDarkOpacity, type Passage } from '../core/library/city/doorway';
import { anchorsOf } from '../core/library/figure/bake';
import { shapeOf, signatureOf } from '../core/library/figure/dress';
import { YAW_BACK, YAW_FRONT, YAW_RIGHT, facingYaw, phaseIndexOf } from '../core/library/figure/gait';
import type { ArmPose } from '../core/library/figure/skeleton';
import { placeSill, sillBox, sillFigTransform } from './door-passage';
import { carryFit, carryLineY, type Carrier } from './figure/carry-fit';
import { CITIZENS_3D } from './figure/citizen-config';
import type { FigureRegistry } from './figure/figure-host';
import { GhibliFigure, hideFigure, poseFigure, type PoseIn } from './figure/ghibli-figure';
import { useSceneDayStart } from './parade-layer';
import type { Pose } from '../core/library/city/shops/gestures';
import { ScriptedCar } from './vehicle/scripted-car';
import { PropImage, PropInMirror } from './prop/prop-host';
import { PIECE_LEN } from '../core/library/paint/props/moving';
import '../core/library/paint/props/moving';
import { zeroDisplay } from './svg-write';

// Déménagement du matin (vague 1b-iv-b), le jour d'un changement de commerce (moving.ts) : un camion blanc et bleu arrive, se
// gare au bord du trottoir juste après la porte du local (du côté opposé à la vitrine, pour qu'on la voie se vider puis se
// remplir), ouvre son hayon ; deux ou trois déménageurs (bonnet rouge, tenue grise : pas la casquette bleue de l'équipe
// d'enseigne) font la navette entre la porte et le camion. Puis le hayon se referme et le camion repart.
// Revue du 2026-10-13 (« ville naturelle et vivante ») : l'équipe suit un planning par porteur (moving-crew.ts) — chacun son
// pas, ses temps de prise et de pose, cartons seul, meubles lourds à deux, pauses sur le trottoir — au lieu d'une file
// indienne réglée ; le hayon se manœuvre en quelques secondes par le premier arrivé ; dans le local, on voit les déménageurs
// travailler derrière la vitrine.
// Rendu à la minute (camion : transition CSS d'une minute) ; les porteurs sont placés par la boucle d'animation de
// CityLifeLayer (collectMovers / placeMovers), qui n'écrit que ce qui change. Les porteurs sont dessinés avant le camion :
// arrivés à l'arrière, ils passent derrière lui (« dans » le camion) ; ils sortent du local et y rentrent par le seuil de la
// porte (door-passage), sans fondu, dans les deux graphismes. Ghibli : pantins sans miroir, bras « carry », carton entre les
// deux mains. Tout est marqué `data-mover` (plafond global de sprites). Aucun id SVG. Mouvement réduit : camion garé hayon
// ouvert ; un porteur figé selon l'étape (au milieu du trajet, un carton en main, pendant les portages ; debout à l'arrière du
// camion pendant le hayon et la pause ; aucun à l'arrivée et au départ).

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
// Où est le camion à la minute affichée. Il arrive pendant la dernière minute de « truck-arrives » (transition d'une minute
// depuis le bord), repart dès la première de « leave ». Le hayon suit le planning de l'équipe (tailgateAt).
export type TruckState = { at: 'in' | 'park' | 'out' };
export function truckAt(step: MovingStep, minutes: number, to: number, still: boolean): TruckState {
  if (still) return { at: 'park' };
  if (step === 'truck-arrives') return { at: minutes >= to - 1 ? 'park' : 'in' };
  return { at: step === 'leave' ? 'out' : 'park' };
}

// Hayon à l'instant `now` : ouverture visée et transition CSS (délai jusqu'à l'heure de la manœuvre, puis sa durée). À
// l'ouverture et à la fermeture, c'est le premier déménageur arrivé à l'arrière qui le manœuvre (planCrew).
export function tailgateAt(step: MovingStep, plan: CrewPlan | null, now: number, still: boolean): { open: number; move?: string } {
  if (still) return { open: 1 };
  if (step === 'truck-arrives' || step === 'leave') return { open: 0 };
  if ((step !== 'open-back' && step !== 'close-back') || !plan?.tailgate) return { open: 1 };
  const g = plan.tailgate;
  const target = step === 'open-back' ? 1 : 0;
  const delay = g.at - now;
  if (delay + g.dur <= 0) return { open: target };
  // Déjà commencée (rendu tardif) : le reste de la manœuvre seulement.
  const dur = delay >= 0 ? g.dur : g.dur + delay;
  return { open: target, move: `transform ${dur.toFixed(2)}s ease-in-out ${Math.max(0, delay).toFixed(2)}s` };
}

const WHITE = '#F4F6F8';
const BLUE = '#2E6FD6';

// Hayon : panneau articulé en bas de la caisse ; fermé il est vertical, ouvert il fait rampe vers l'arrière. `move` :
// transition CSS du panneau (quelques secondes, à l'heure du planning). Ghibli (G5) : image cellulo `tailgate` (panneau
// galvanisé à nervures, charnière) peinte fermée dans le repère de la charnière et tournée par le même groupe, avec la même
// transition ; le camion peint étant en miroir pour `dir` = −1, l'image est cuite dans ce sens (PropInMirror).
function Tailgate({ open, sky, move, ghibli = false, dir = 1 }: { open: number; sky: Sky; move?: string; ghibli?: boolean; dir?: 1 | -1 }): ReactElement {
  const t = (c: string): string => tone(c, sky);
  const panel = <rect x={-1.6} y={-27} width={1.6} height={27} fill={t('#D8DCE2')} stroke={t('#8C939C')} strokeWidth={0.3} />;
  return (
    <g transform={`translate(${TRUCK_REAR} ${HINGE_Y})`}>
      <g data-tailgate-panel="" style={{ transform: `rotate(${(-90 * open).toFixed(1)}deg)`, transition: move }}>
        {ghibli ? <PropInMirror spec={{ id: 'tailgate', args: { open: 0 }, dir, day: sky.daylight }} fallback={panel} /> : panel}
      </g>
    </g>
  );
}

function TruckSprite({ open, sky, lights, move }: { open: number; sky: Sky; lights: boolean; move?: string }): ReactElement {
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
      <Tailgate open={open} sky={sky} move={move} />
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
  // Instant du rendu (s, horloge murale) : heure du hayon dans le planning de l'équipe.
  t0?: number;
  // Ghibli (V5) : camion peint (vehicle/scripted-car.tsx), roues tournées par la transition du camion, conducteur à bord
  // tant qu'il roule.
  ghibli?: boolean;
  rainy?: boolean;
};

export function MovingTruck({ view, frame, change, offset, seed, minutes, width, metrics, sky, lights, still, t0, ghibli = false, rainy = false }: TruckProps): ReactElement | null {
  const now = t0 ?? Date.now() / 1000;
  const dayStart = useSceneDayStart(minutes, now);
  if (!view.moving || !change) return null;
  const plan = changePlans(seed, view.slot.id, change.day, change.kind, offset).moving;
  const step = plan.steps.find((s) => s.step === view.moving!.step)!;
  const s = truckAt(step.step, minutes, step.to, still);
  const g = movingLayout(frame, metrics, width);
  const x = s.at === 'in' ? g.edgeIn : s.at === 'out' ? g.edgeOut : g.parkX;
  const move = still ? undefined : `transform 60s ${s.at === 'out' ? 'ease-in' : 'ease-out'}`;
  const input = crewInput(view, frame, change.day, seed, width, metrics, dayStart, offset);
  const gate = tailgateAt(step.step, input ? cachedPlan(input) : null, now, still);
  // Conducteur à bord tant que le camion roule : pendant toute l'arrivée (sa dernière minute est déjà « garé » mais la
  // transition l'amène encore à sa place) et au départ ; cabine vide une fois garé.
  const occupied = s.at !== 'park' || step.step === 'truck-arrives';
  return (
    <g
      data-moving-truck={view.slot.id}
      data-mover="truck"
      data-truck-at={s.at}
      data-tailgate={gate.open.toFixed(2)}
      style={{ transform: `translate(${x.toFixed(1)}px, ${g.truckY.toFixed(1)}px)`, transition: move }}
    >
      {ghibli ? (
        <ScriptedCar spec={{ id: 'moving-truck', seed: hashString(view.slot.id) }} dir={g.away} k={g.kv} sky={sky} rainy={rainy} lights={lights} still={still} occupied={occupied} roll={{ worldX: x, move }}>
          <Tailgate open={gate.open} sky={sky} move={gate.move} ghibli dir={g.away} />
        </ScriptedCar>
      ) : (
        <g transform={`scale(${(g.away * g.kv).toFixed(3)} ${g.kv.toFixed(3)})`}>
          <TruckSprite open={gate.open} sky={sky} lights={lights} move={gate.move} />
        </g>
      )}
    </g>
  );
}

// ---------- Déménageurs ----------
// Planning de l'équipe : core/library/city/shops/moving-crew.ts. Ici : géométrie de la scène, dessin et boucle.
const HANDS = 20;
const HOLD: Pose = { arms: 'hold', lean: 0, head: 'front', item: 'none', sway: 0 };
const REACH: Pose = { arms: 'reach', lean: 0, head: 'front', item: 'none', sway: 0 };
// Écart entre les deux porteurs d'un meuble (px du monde à unit = 1).
const PAIR_GAP = 9;
// Pas de base des déménageurs (px du monde par seconde à unit = 1).
const PACE = 12;

// Entrée du planning pour l'étape affichée (null : étape sans équipe visible). `dayStart` : début du jour de la scène sur
// l'horloge murale (s).
export function crewInput(view: ShopView, frame: ShopFrame, day: number, seed: number, width: number, metrics: CityMetrics, dayStart: number, offset: number): CrewInput | null {
  if (!view.moving) return null;
  const step = view.moving.step;
  if (step === 'truck-arrives' || step === 'leave') return null;
  const id = view.slot.id;
  const g = movingLayout(frame, metrics, width);
  const u = metrics.unit;
  const plan = changePlans(seed, id, day, view.moving.kind, offset).moving;
  const k = plan.steps.findIndex((s) => s.step === step);
  const cur = plan.steps[k]!;
  const rearX = g.parkX + g.away * TRUCK_REAR * g.kv;
  const toTruck: 1 | -1 = g.b.x >= g.a.x ? 1 : -1;
  const y = g.b.y;
  const n = moversFor(seed, id, day);
  // Places d'attente : une près de l'arrière du camion, les autres de l'autre côté de la porte, pas alignées.
  const spots: Pt[] = Array.from({ length: n }, (_, i) => {
    const r = mulberry32(hashString(`${seed}/${id}/${day}/spot/${i}`));
    const x = i === 0 ? rearX - toTruck * (5 + 3 * r()) * u : g.a.x - toTruck * (8 + 9 * (i - 1) + 4 * r()) * u;
    return { x, y: y + (r() - 0.5) * 3 * u };
  });
  return {
    step,
    prev: plan.steps[k - 1]?.step,
    // La scène change d'étape à la minute entière (movingAt sur la minute affichée) : le planning part de la première minute où
    // l'étape se voit, et finit à la première où la suivante se voit (personne ne surgit en cours de route).
    t0: dayStart + Math.ceil(cur.from - 1e-9) * 60,
    t1: dayStart + Math.ceil(cur.to - 1e-9) * 60,
    n,
    seed: (seed ^ hashString(`${id}/${day}`)) >>> 0,
    door: g.a,
    truck: g.b,
    rear: { x: rearX - toTruck * 3 * u, y },
    cab: { x: g.parkX + g.away * 14 * g.kv, y },
    spots,
    speed: PACE * u,
  };
}

// Plannings déjà tirés (la vue et la boucle relisent le même).
const plans = new Map<string, CrewPlan>();
export function cachedPlan(c: CrewInput): CrewPlan {
  const key = JSON.stringify(c);
  let p = plans.get(key);
  if (!p) {
    p = planCrew(c);
    plans.set(key, p);
    if (plans.size > 24) plans.delete(plans.keys().next().value as string);
  }
  return p;
}

// Tenue des déménageurs : profil `worker`, mais bonnet rouge et maillot gris (l'équipe d'enseigne a casquette et veste bleues).
export function moverOutfit(seed: number, slotId: string, day: number, i: number): Outfit {
  const o = outfitFor('worker', mulberry32(seed ^ hashString(`${slotId}/mover/${day}/${i}`)));
  return { ...o, hair: 'beanie', hatColor: i === 0 ? '#C0392B' : '#D95F2B', top: 'jersey', topColor: '#5A6470', bottom: 'pants', bottomColor: '#2A2F3A', accessory: 'none' };
}
export const moversFor = (seed: number, slotId: string, day: number): number => 2 + (hashString(`${seed}/${slotId}/${day}/movers`) % 2);

// Meuble lourd (centré sur x = 0, posé sur les mains à y = 0), en px du monde ; `len` : longueur portée.
// Dessin provisoire (aplats) : à reprendre avec Fable (note de la revue du 2026-10-13).
function PieceSprite({ kind, len, u, sky }: { kind: HeavyPiece; len: number; u: number; sky: Sky }): ReactElement {
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
    default:
      return (
        <>
          <rect x={x} y={-3 * u} width={len} height={3 * u} rx={0.8 * u} fill={t('#9A2A3A')} />
          <rect x={x} y={-6 * u} width={2.4 * u} height={6 * u} rx={0.8 * u} fill={t('#7A1A2A')} />
        </>
      );
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
// Ghibli : le même carton, posé sur les deux mains du pantin (accroche `hands`), centré entre elles ; G5 : image cellulo
// `box` (kraft, ruban, « FRAGILE ») au même cadre, carton classique en repli tant qu'elle n'est pas cuite.
const GHIBLI_BOX = 'translate(-9 21)';
const GhibliBox = ({ sky }: { sky: Sky }): ReactElement => <PropImage spec={{ id: 'box', day: sky.daylight }} fallback={<BoxSprite sky={sky} />} />;
// Ghibli : meuble lourd cellulo `piece`, peint en unités (longueur PIECE_LEN = PAIR_GAP + 6, celle de `pieceLen` à unit = 1) et
// mis à l'échelle du monde ici.
const GhibliPiece = ({ kind, u, sky }: { kind: HeavyPiece; u: number; sky: Sky }): ReactElement => (
  <g transform={`scale(${u.toFixed(3)})`}>
    <PropImage spec={{ id: 'piece', args: { kind, len: PIECE_LEN }, day: sky.daylight }} fallback={<PieceSprite kind={kind} len={PIECE_LEN} u={1} sky={sky} />} />
  </g>
);

// Ghibli : pose du pantin (sans miroir) ; classique : geste du passant (retourné selon le sens de marche).
const ghibliPose = (p: MoverAt, k: number): PoseIn => ({
  yaw: p.yaw,
  gait: p.gait,
  phase: p.gait === 'stand' ? 0 : phaseIndexOf(p.walked / k),
  head: 0,
  arms: (p.load ? 'carry' : p.gait === 'stand' ? p.arms : 'swing') as ArmPose,
});
const classicPose = (p: MoverAt): Pose => (p.load ? HOLD : p.arms === 'reach' ? REACH : STANDING);
// Hauteur des mains d'un déménageur Ghibli qui porte (bras `carry`), unités du pantin : le meuble lourd y est posé (la boucle
// le règle ensuite sur les mains 3D, pieceTransform).
const ghibliHands = (o: Outfit): number => {
  const a = anchorsOf({ sig: signatureOf(shapeOf(o, false)), yaw: YAW_RIGHT, gait: 'stand', phase: 0, head: 0, arms: 'carry', lean: 0 });
  return -(a.handR[1] + a.handL[1]) / 2;
};

const moverTransform = (x: number, y: number, dir: number, kp: number, ghibli: boolean): string =>
  `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${((ghibli ? 1 : dir) * kp).toFixed(3)} ${kp.toFixed(3)})`;
const sillPassage = (p: MoverAt, a: Pt): Passage =>
  p.where === 'door' ? { stage: 'threshold', x: p.x, depth: p.depth, yaw: p.yaw, gait: 'walk', walked: p.walked } : { stage: 'threshold', x: a.x, depth: 1, yaw: YAW_BACK, gait: 'walk', walked: 0 };
const piecePassage = (depth: number, a: Pt): Passage => ({ stage: 'threshold', x: a.x, depth, yaw: YAW_FRONT, gait: 'walk', walked: 0 });

// Dans le local à l'instant t (segment « off » au local) ?
function insideNow(segs: readonly Seg[], t: number): boolean {
  const s = segs.find((x) => t >= x.t && t < x.t + x.dur);
  return !!s && s.k === 'off' && s.at === 'shop';
}
// Dans le local, derrière la vitrine : on voit les déménageurs travailler (aller et venir le long de la vitrine, un peu
// assombris par le verre). Position tirée de l'instant (aller-retour lent, propre à chacun) ; repère : coin de la vitrine.
const GLASS = 0.78;
function insideAt(win: ShopFrame['window'], i: number, t: number, kp: number): { x: number; y: number; dir: 1 | -1; walked: number } {
  const margin = 6 * kp;
  const span = Math.max(1, win.w - 2 * margin);
  const sp = 6 + 1.5 * i;
  const ph = (t * sp) / span + i * 0.37;
  const m = ((ph % 2) + 2) % 2;
  return { x: margin + (1 - Math.abs(m - 1)) * span, y: win.h + 1, dir: m < 1 ? 1 : -1, walked: t * sp };
}

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

// Le groupe de l'équipe est à clé par étape : un changement d'étape recrée les nœuds (aucun carton ni bras chargé écrits par
// la boucle ne restent). Chaque porteur a trois nœuds : la rue, le seuil de la porte du local et l'intérieur du local derrière
// la vitrine (<svg> imbriqués rognés, ni clipPath ni masque).
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
  const kp = g.kp;
  const box = (on: boolean): ReactElement => (
    <g data-mover-box="" visibility={on ? 'visible' : 'hidden'}>
      {ghibli ? <g transform={GHIBLI_BOX}><GhibliBox sky={sky} /></g> : <BoxSprite sky={sky} />}
    </g>
  );
  const figure = (i: number, p: MoverAt, on: boolean): ReactElement =>
    ghibli ? (
      <GhibliFigure outfit={outfits[i]!} sky={sky} rainy={rainy} umbrella={false} initial={ghibliPose(p, kp)} hidden={!on} held={[{ anchor: 'hands', node: box(p.load === 'carton') }]} citizen={citizenSeed(`${id}/mover/${day}/${i}`)} kind="adult" />
    ) : (
      <>
        <PosedPerson outfit={outfits[i]!} sky={sky} rainy={rainy} umbrella={false} accessory={null} pose={classicPose(p)} />
        {box(p.load === 'carton')}
      </>
    );
  const streetNode = (i: number, p: MoverAt): ReactElement => {
    const on = p.where === 'street';
    return (
      <g key={`s${i}`} data-mover="porter" data-mover-i={i} transform={moverTransform(on ? p.x : g.a.x, on ? p.y : g.a.y, p.dir, kp, ghibli)} visibility={on ? 'visible' : 'hidden'}>
        {figure(i, p, on)}
      </g>
    );
  };
  // Mouvement réduit : un seul porteur, figé. Pendant un portage, au milieu du trajet, un carton en main, tourné vers où il va ;
  // sinon (hayon, pause), debout près de l'arrière du camion, les mains vides.
  if (still) {
    const loaded = step === 'carry-out' || step === 'carry-in';
    const toTruck: 1 | -1 = g.b.x >= g.a.x ? 1 : -1;
    const f = loaded ? 0.5 : 0.62;
    const dir: 1 | -1 = step === 'carry-in' ? (-toTruck as 1 | -1) : toTruck;
    const pos: MoverAt = { where: 'street', x: g.a.x + (g.b.x - g.a.x) * f, y: g.a.y + (g.b.y - g.a.y) * f, depth: 0, dir, yaw: loaded ? facingYaw(dir) : dir > 0 ? 2 : 6, gait: 'stand', walked: 0, load: loaded ? 'carton' : null, job: -1, arms: 'down' };
    return (
      <g key={`${id}-${step}`} data-moving-crew={id} data-moving-step={step} data-still="">
        {streetNode(0, pos)}
      </g>
    );
  }
  const input = crewInput(view, frame, day, seed, width, metrics, dayStart, offset)!;
  const plan = cachedPlan(input);
  // Premier dessin : le même instant que la première image de la boucle.
  const movers = plan.segs.map((segs) => moverAt(segs, input.door, t0));
  const piece = pieceAt(plan, movers, input.door, t0);
  const pieceLen = PAIR_GAP * u + 6 * u;
  const lift = (ghibli ? ghibliHands(outfits[0]!) : HANDS) * kp;
  const pieceArt = (
    <g transform={`translate(0 ${(-lift).toFixed(2)})`}>
      {(['vitrine', 'etagere', 'table', 'fauteuil'] as const).map((kd) => (
        <g key={kd} data-piece={kd} visibility={piece?.load === kd ? 'visible' : 'hidden'}>
          {ghibli ? <GhibliPiece kind={kd} u={u} sky={sky} /> : <PieceSprite kind={kd} len={pieceLen} u={u} sky={sky} />}
        </g>
      ))}
    </g>
  );
  const pBox = sillBox(frame.door, piece?.where === 'door' ? piece.depth : 1, metrics, 1);
  const win = frame.window;
  return (
    <g
      key={`${id}-${step}`}
      data-moving-crew={id}
      data-moving-step={step}
      data-script={JSON.stringify(input)}
      data-door={`${frame.door.x} ${frame.door.y} ${frame.door.w} ${frame.door.h}`}
      data-ghibli={ghibli ? 'true' : undefined}
      {...(step === 'carry-out' || step === 'carry-in' ? { 'data-carry': step === 'carry-out' ? 'out' : 'in' } : {})}
    >
      {/* Dans le local : derrière la vitrine (rognés à la vitre, assombris par le verre). */}
      {outfits.map((_, i) => {
        const inside = insideNow(plan.segs[i] ?? [], t0);
        const q = insideAt(win, i, t0, kp);
        const p: MoverAt = { where: 'street', x: q.x, y: q.y, depth: 0, dir: q.dir, yaw: facingYaw(q.dir), gait: 'walk', walked: q.walked, load: null, job: -1, arms: 'swing' };
        return (
          <svg key={`in${i}`} data-mover-inside="" data-mover-i={i} x={win.x.toFixed(2)} y={win.y.toFixed(2)} width={win.w.toFixed(2)} height={win.h.toFixed(2)} overflow="hidden" visibility={inside ? 'visible' : 'hidden'} opacity={GLASS}>
            <g data-inside-fig="" transform={moverTransform(q.x, q.y, q.dir, kp, ghibli)}>
              {figure(i, p, inside)}
            </g>
          </svg>
        );
      })}
      {/* Du dernier au premier. */}
      {[...movers.keys()].reverse().map((i) => {
        const p = movers[i]!;
        const sp = sillPassage(p, g.a);
        const { clip, dark } = sillBox(frame.door, sp.depth, metrics, kp);
        const door = p.where === 'door';
        return (
          <Fragment key={i}>
            {streetNode(i, p)}
            <svg data-mover-door="" data-mover-i={i} x={clip.x.toFixed(2)} y={clip.y.toFixed(2)} width={clip.w.toFixed(2)} height={clip.h.toFixed(2)} overflow="hidden" visibility={door ? 'visible' : 'hidden'}>
              <rect data-door-dark="" x={dark.x.toFixed(2)} y={dark.y.toFixed(2)} width={dark.w.toFixed(2)} height={dark.h.toFixed(2)} fill={DOOR_DARK} opacity={door ? doorDarkOpacity(sp.depth).toFixed(2) : '0.00'} display={zeroDisplay(door ? doorDarkOpacity(sp.depth).toFixed(2) : '0.00')} />
              <g data-door-fig="" transform={sillFigTransform(sp, clip, metrics, kp, ghibli ? 1 : p.dir)} opacity={(1 - sp.depth).toFixed(2)} display={zeroDisplay((1 - sp.depth).toFixed(2))}>
                {figure(i, p, door)}
              </g>
            </svg>
          </Fragment>
        );
      })}
      <g data-mover="piece" data-lift={CITIZENS_3D ? lift.toFixed(2) : undefined} transform={`translate(${(piece?.where === 'street' ? piece.x : g.a.x).toFixed(1)} ${(piece?.where === 'street' ? piece.y : g.a.y).toFixed(1)})`} visibility={piece?.where === 'street' ? 'visible' : 'hidden'}>
        {pieceArt}
      </g>
      <svg data-piece-door="" x={pBox.clip.x.toFixed(2)} y={pBox.clip.y.toFixed(2)} width={pBox.clip.w.toFixed(2)} height={pBox.clip.h.toFixed(2)} overflow="hidden" visibility={piece?.where === 'door' ? 'visible' : 'hidden'}>
        <g data-door-fig="" transform={sillFigTransform(piecePassage(piece?.depth ?? 1, g.a), pBox.clip, metrics, 1, 1)} opacity={(1 - (piece?.depth ?? 1)).toFixed(2)} display={zeroDisplay((1 - (piece?.depth ?? 1)).toFixed(2))}>
          {pieceArt}
        </g>
      </svg>
    </g>
  );
}

// ---------- Boucle : planning des porteurs ----------
type MoverNodes = { street: Element; door: Element | null; inside: Element | null; streetFig: Element | null; doorFig: Element | null; insideFig: Element | null; insideG: Element | null; boxes: Element[]; handles: PoseHandles[] };
type Box = { x: number; y: number; w: number; h: number };
// `lift` : hauteur (px) du dessous du meuble lourd au-dessus de l'origine de son groupe (mains du pantin de référence).
export type Crew = { input: CrewInput; door: Box; window: Box; ghibli: boolean; movers: MoverNodes[]; piece: Element | null; pieceDoor: Element | null; kinds: Element[]; lift: number };
const boxOf = (e: Element | null): Box => ({ x: Number(e?.getAttribute('x') ?? 0), y: Number(e?.getAttribute('y') ?? 0), w: Number(e?.getAttribute('width') ?? 0), h: Number(e?.getAttribute('height') ?? 0) });
export function collectMovers(root: Element): Crew[] {
  const out: Crew[] = [];
  for (const node of root.querySelectorAll('[data-moving-crew][data-script]')) {
    const ghibli = node.getAttribute('data-ghibli') === 'true';
    const byI = (sel: string): Map<number, Element> => new Map([...node.querySelectorAll(sel)].map((e) => [Number(e.getAttribute('data-mover-i')), e] as const));
    const streets = byI(':scope > [data-mover="porter"]');
    const doors = byI(':scope > svg[data-mover-door]');
    const insides = byI(':scope > svg[data-mover-inside]');
    const movers: MoverNodes[] = [...streets.keys()].sort((x, y) => x - y).map((i) => {
      const street = streets.get(i)!;
      const door = doors.get(i) ?? null;
      const inside = insides.get(i) ?? null;
      const nodes = [street, door, inside].filter((e): e is Element => e !== null);
      return {
        street,
        door,
        inside,
        streetFig: street.querySelector('[data-figure]'),
        doorFig: door?.querySelector('[data-figure]') ?? null,
        insideFig: inside?.querySelector('[data-figure]') ?? null,
        insideG: inside?.querySelector(':scope > [data-inside-fig]') ?? null,
        boxes: nodes.flatMap((e) => [...e.querySelectorAll('[data-mover-box]')]),
        handles: ghibli ? [] : nodes.map((e) => poseHandles(e)),
      };
    });
    const input = JSON.parse(node.getAttribute('data-script')!) as CrewInput;
    out.push({
      input,
      // Ouverture de la porte : relue sur le premier nœud de seuil au fond (profondeur 1 : le cadre de la porte elle-même).
      door: doorRectOf(node),
      window: boxOf(node.querySelector(':scope > svg[data-mover-inside]')),
      ghibli,
      movers,
      piece: node.querySelector(':scope > [data-mover="piece"]'),
      pieceDoor: node.querySelector(':scope > svg[data-piece-door]'),
      lift: Number(node.querySelector(':scope > [data-mover="piece"]')?.getAttribute('data-lift') ?? 0),
      kinds: [...node.querySelectorAll('[data-piece]')],
    });
  }
  return out;
}
// La porte du local : portée par le nœud (data-door) pour que la boucle replace les seuils sans la carte des cadres.
function doorRectOf(node: Element): Box {
  const d = node.getAttribute('data-door');
  if (!d) return { x: 0, y: 0, w: 0, h: 0 };
  const [x, y, w, h] = d.split(' ').map(Number);
  return { x: x!, y: y!, w: w!, h: h! };
}

// Meuble lourd sur le trottoir : entre les deux porteurs, à la hauteur des mains du pantin (rendu) ; un porteur montré en 3D
// déplace et incline le meuble pour que sa ligne d'appui passe par les mains 3D des deux porteurs (carryFit).
function pieceTransform(c: Crew, hp: NonNullable<PieceAt>, movers: readonly MoverAt[], kp: number): string {
  const base = `translate(${hp.x.toFixed(1)} ${hp.y.toFixed(1)})`;
  const ma = movers[hp.a];
  const mb = movers[hp.b];
  if (!CITIZENS_3D || !c.ghibli || ma?.where !== 'street' || mb?.where !== 'street') return base;
  const carrier = (m: MoverAt, i: number): Carrier => {
    const fig = c.movers[i]?.streetFig ?? null;
    return { fig, x: m.x, y: m.y, ref: { sig: fig?.getAttribute('data-sig') ?? '', yaw: m.yaw, gait: 'stand', phase: 0, head: 0, arms: 'carry', lean: 0 }, anchor: 'hands' };
  };
  const f = carryFit(carrier(ma, hp.a), carrier(mb, hp.b), kp);
  if (!f) return base;
  // Le dessous du meuble (à `lift` au-dessus de l'origine du groupe) posé sur la ligne des mains, incliné autour de ce point.
  const lift = c.lift;
  const x = hp.x + f.dx;
  const y = carryLineY(f, x) + lift;
  return `translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${f.deg.toFixed(2)} 0 ${(-lift).toFixed(2)})`;
}

// Pose de l'équipe à l'instant t (s) : n'écrit que ce qui change. `figures` : registre des pantins (Ghibli).
export function placeMovers(crews: Crew[], t: number, m: CityMetrics, figures: FigureRegistry | null = null): void {
  const kp = m.unit * STREET_SCALE.person;
  for (const c of crews) {
    const plan = cachedPlan(c.input);
    const movers = plan.segs.map((segs) => moverAt(segs, c.input.door, t));
    movers.forEach((p, i) => {
      const nd = c.movers[i];
      if (!nd) return;
      const street = p.where === 'street';
      const door = p.where === 'door';
      const inside = insideNow(plan.segs[i]!, t);
      setIfChanged(nd.street, 'visibility', street ? 'visible' : 'hidden');
      setIfChanged(nd.door, 'visibility', door ? 'visible' : 'hidden');
      setIfChanged(nd.inside, 'visibility', inside ? 'visible' : 'hidden');
      for (const b of nd.boxes) setIfChanged(b, 'visibility', p.load === 'carton' ? 'visible' : 'hidden');
      if (street) setIfChanged(nd.street, 'transform', moverTransform(p.x, p.y, p.dir, kp, c.ghibli));
      if (door && nd.door && c.door.w > 0) placeSill(nd.door, c.door, sillPassage(p, c.input.door), m, kp, c.ghibli ? 1 : p.dir);
      const q = inside && nd.insideG ? insideAt(c.window, i, t, kp) : null;
      if (q) setIfChanged(nd.insideG, 'transform', moverTransform(q.x, q.y, q.dir, kp, c.ghibli));
      if (c.ghibli && figures) {
        if (street) poseFigure(figures, nd.streetFig, ghibliPose(p, kp));
        else hideFigure(figures, nd.streetFig);
        if (door) poseFigure(figures, nd.doorFig, ghibliPose(p, kp));
        else hideFigure(figures, nd.doorFig);
        if (q) poseFigure(figures, nd.insideFig, { yaw: facingYaw(q.dir), gait: 'walk', phase: phaseIndexOf(q.walked / kp), head: 0, arms: 'swing' });
        else hideFigure(figures, nd.insideFig);
      } else if (street || door) for (const h of nd.handles) applyPose(h, classicPose(p));
    });
    const hp = pieceAt(plan, movers, c.input.door, t);
    setIfChanged(c.piece, 'visibility', hp?.where === 'street' ? 'visible' : 'hidden');
    setIfChanged(c.pieceDoor, 'visibility', hp?.where === 'door' ? 'visible' : 'hidden');
    if (hp) {
      if (hp.where === 'street') setIfChanged(c.piece, 'transform', pieceTransform(c, hp, movers, kp));
      else if (c.pieceDoor && c.door.w > 0) placeSill(c.pieceDoor, c.door, piecePassage(hp.depth, c.input.door), m, 1, 1);
      for (const kd of c.kinds) setIfChanged(kd, 'visibility', kd.getAttribute('data-piece') === hp.load ? 'visible' : 'hidden');
    }
  }
}
