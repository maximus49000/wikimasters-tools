import { useMemo, type ReactElement } from 'react';
import { STREET_SCALE, type CityMetrics } from '../core/library/city/metrics';
import { outfitFor, type Outfit } from '../core/library/city/people';
import type { Change } from '../core/library/city/shops/lifecycle';
import type { MovingStep } from '../core/library/city/shops/moving';
import type { ShopFrame } from '../core/library/city/shops/slots';
import { changePlans, type ShopView } from '../core/library/city/shops/view';
import { WORLD_MARGIN, hashString, mulberry32 } from '../core/library/scene-world';
import type { Sky } from '../core/library/sky';
import { setIfChanged } from './city-shops-life';
import { tone } from './city-sprites';
import { PosedPerson, STANDING, applyPose, poseHandles } from './shop-gesture-sprites';
import type { Pose } from '../core/library/city/shops/gestures';

// Déménagement du matin (vague 1b-iv-b), le jour d'un changement de commerce (moving.ts) : un camion blanc et bleu arrive, se
// gare au bord du trottoir juste après la porte du local (du côté opposé à la vitrine, pour qu'on la voie se vider puis se
// remplir), ouvre son hayon ; deux ou trois déménageurs (bonnet rouge, tenue grise : pas la casquette bleue de l'équipe
// d'enseigne) font la navette entre la porte et le camion. Meuble lourd (vitrine, étagère, table, fauteuil) : tous les porteurs
// en file indienne sous le même meuble ; sinon un carton chacun. Puis le hayon se referme et le camion repart.
// Rendu à la minute (camion, hayon : transitions CSS d'une minute) ; la navette des porteurs est placée par la boucle
// d'animation de CityLifeLayer (collectMovers / placeMovers), qui n'écrit que ce qui change. Les porteurs sont dessinés avant
// le camion : arrivés à l'arrière, ils passent derrière lui (« dans » le camion). Tout est marqué `data-mover` (plafond global
// de sprites). Aucun id SVG. Mouvement réduit : camion garé hayon ouvert ; un porteur figé selon l'étape (au milieu du trajet, un
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
      {/* Hayon : panneau articulé en bas de la caisse ; fermé il est vertical, ouvert il fait rampe vers l'arrière. */}
      <g transform={`translate(${TRUCK_REAR} ${HINGE_Y})`}>
        <g data-tailgate-panel="" style={{ transform: `rotate(${(-90 * open).toFixed(1)}deg)`, transition: still ? undefined : 'transform 60s linear' }}>
          <rect x={-1.6} y={-27} width={1.6} height={27} fill={t('#D8DCE2')} stroke={t('#8C939C')} strokeWidth={0.3} />
        </g>
      </g>
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
};

export function MovingTruck({ view, frame, change, offset, seed, minutes, width, metrics, sky, lights, still }: TruckProps): ReactElement | null {
  if (!view.moving || !change) return null;
  const plan = changePlans(seed, view.slot.id, change.day, change.kind, offset).moving;
  const step = plan.steps.find((s) => s.step === view.moving!.step)!;
  const s = truckAt(step.step, minutes, step.from, step.to, still);
  const g = movingLayout(frame, metrics, width);
  const x = s.at === 'in' ? g.edgeIn : s.at === 'out' ? g.edgeOut : g.parkX;
  return (
    <g
      data-moving-truck={view.slot.id}
      data-mover="truck"
      data-truck-at={s.at}
      data-tailgate={s.open.toFixed(2)}
      style={{ transform: `translate(${x.toFixed(1)}px, ${g.truckY.toFixed(1)}px)`, transition: still ? undefined : `transform 60s ${s.at === 'out' ? 'ease-in' : 'ease-out'}` }}
    >
      <g transform={`scale(${(g.away * g.kv).toFixed(3)} ${g.kv.toFixed(3)})`}>
        <TruckSprite open={s.open} sky={sky} lights={lights} still={still} />
      </g>
    </g>
  );
}

// ---------- Déménageurs ----------
// Meubles portés : un rectangle stylisé par sorte ; les lourds sont portés par toute l'équipe en file indienne, le carton par
// chacun. La sorte change à chaque aller (suite tirée par local).
export const PIECES = ['vitrine', 'carton', 'etagere', 'carton', 'table', 'fauteuil', 'carton'] as const;
export type Piece = (typeof PIECES)[number];
const HEAVY: ReadonlySet<Piece> = new Set(['vitrine', 'etagere', 'table', 'fauteuil']);

// Navette (s) : aller chargé, dépôt (caché dans le camion ou le local), retour à vide, reprise ; FADE : fraction du trajet sur
// laquelle un porteur apparaît à la porte ou disparaît derrière le camion.
export const CARRY_CYCLE = 24;
const LEG = 9;
const DROP = 3;
const FADE = 0.08;
// Écart entre deux porteurs de la file (px du monde à unit = 1).
const FILE_GAP = 9;
// Hauteur des mains (repère du passant : pose « hold ») au-dessus des pieds.
const HANDS = 20;
const HOLD: Pose = { arms: 'hold', lean: 0, head: 'front', item: 'none', sway: 0 };
const REACH: Pose = { arms: 'reach', lean: 0, head: 'front', item: 'none', sway: 0 };

export type CrewGeom = { a: { x: number; y: number }; b: { x: number; y: number }; n: number; gap: number; phase: number; carry: 'out' | 'in'; kindSeed: number };
export type MoverState = { x: number; y: number; dir: 1 | -1; opacity: number; loaded: boolean };
export type CrewFrame = { movers: MoverState[]; kind: Piece; heavy: { x: number; y: number; opacity: number } | null };

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

// Positions de l'équipe à l'instant t (s) : le premier ouvre la marche, les suivants à `gap` (fraction du trajet) derrière.
export function crewFrame(g: CrewGeom, t: number, kp: number): CrewFrame {
  const u = t + g.phase;
  const trip = Math.floor(u / CARRY_CYCLE);
  const c = u - trip * CARRY_CYCLE;
  const kind = PIECES[(((g.kindSeed + trip) % PIECES.length) + PIECES.length) % PIECES.length]!;
  // Chargé : de l'origine du mobilier (porte pour sortir, camion pour rentrer) vers l'autre bout.
  const [src, dst] = g.carry === 'out' ? [g.a, g.b] : [g.b, g.a];
  const span = 1 + (g.n - 1) * g.gap;
  let from = src;
  let to = dst;
  let s = 0;
  let loaded = false;
  let shown = true;
  if (c < LEG) {
    s = (c / LEG) * span;
    loaded = true;
  } else if (c < LEG + DROP) {
    shown = false;
  } else if (c < 2 * LEG + DROP) {
    [from, to] = [dst, src];
    s = ((c - LEG - DROP) / LEG) * span;
  } else {
    shown = false;
  }
  const dir: 1 | -1 = to.x >= from.x ? 1 : -1;
  const movers: MoverState[] = [];
  for (let i = 0; i < g.n; i++) {
    const si = clamp01(s - i * g.gap);
    const opacity = shown ? clamp01(Math.min(si, 1 - si) / FADE) : 0;
    movers.push({ x: from.x + (to.x - from.x) * si, y: from.y + (to.y - from.y) * si, dir, opacity, loaded: loaded && opacity > 0 });
  }
  let heavy: CrewFrame['heavy'] = null;
  if (loaded && HEAVY.has(kind)) {
    const first = movers[0]!;
    const last = movers[g.n - 1]!;
    heavy = { x: (first.x + last.x) / 2, y: (first.y + last.y) / 2 - HANDS * kp, opacity: Math.max(...movers.map((m) => m.opacity)) };
  }
  return { movers, kind, heavy };
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

const moverTransform = (x: number, y: number, dir: number, kp: number): string => `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${(dir * kp).toFixed(3)} ${kp.toFixed(3)})`;

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
};

// Le groupe de l'équipe est à clé par étape : un changement d'étape recrée les nœuds, aucun carton visible, bras chargés ou
// opacité écrits par la boucle pendant le portage ne restent sur la pause ou la fermeture du hayon.
export function MovingCrew({ view, frame, day, seed, width, metrics, sky, rainy, still, t0 }: CrewProps): ReactElement | null {
  const id = view.slot.id;
  const n = moversFor(seed, id, day);
  const outfits = useMemo(() => Array.from({ length: n }, (_, i) => moverOutfit(seed, id, day, i)), [seed, id, day, n]);
  if (!view.moving) return null;
  const step = view.moving.step;
  const g = movingLayout(frame, metrics, width);
  const len = Math.hypot(g.b.x - g.a.x, g.b.y - g.a.y);
  const gap = (FILE_GAP * metrics.unit) / len;
  const at = (s: number): { x: number; y: number } => ({ x: g.a.x + (g.b.x - g.a.x) * s, y: g.a.y + (g.b.y - g.a.y) * s });
  const person = (i: number, x: number, y: number, dir: number, pose: Pose, box: boolean, extra: Record<string, string> = {}): ReactElement => (
    <g key={i} data-mover="porter" data-mover-i={i} transform={moverTransform(x, y, dir, g.kp)} {...extra}>
      <PosedPerson outfit={outfits[i]!} sky={sky} rainy={rainy} umbrella={false} accessory={null} pose={pose} />
      <g data-mover-box="" visibility={box ? 'visible' : 'hidden'}>
        <BoxSprite sky={sky} />
      </g>
    </g>
  );
  // Dans la cabine : à l'arrivée et au départ, on ne voit pas l'équipe (mouvement réduit compris).
  if (step === 'truck-arrives' || step === 'leave') return null;
  // Mouvement réduit : un seul porteur, figé. Pendant un portage, au milieu du trajet, un carton en main, tourné vers où il va ;
  // sinon (hayon, pause), debout à l'arrière du camion, les mains vides.
  if (still) {
    const carrying = step === 'carry-out' || step === 'carry-in';
    const p = at(carrying ? 0.5 : 0.62);
    const dir = (step === 'carry-in' ? g.a.x - g.b.x : g.b.x - g.a.x) >= 0 ? 1 : -1;
    return (
      <g key={`${id}-${step}`} data-moving-crew={id} data-moving-step={step} data-still="">
        {person(0, p.x, p.y, dir, carrying ? HOLD : STANDING, carrying)}
      </g>
    );
  }
  if (step === 'carry-out' || step === 'carry-in') {
    const geom: CrewGeom = { a: g.a, b: g.b, n, gap, phase: (hashString(`${id}/movers`) % 2400) / 100, carry: step === 'carry-out' ? 'out' : 'in', kindSeed: hashString(`${seed}/${id}/${day}/pieces`) % PIECES.length };
    const f = crewFrame(geom, t0, g.kp);
    const pieceLen = Math.max(7 * metrics.unit, (n - 1) * FILE_GAP * metrics.unit * (Math.abs(g.b.x - g.a.x) / len) + 6 * metrics.unit);
    return (
      <g
        key={`${id}-${step}`}
        data-moving-crew={id}
        data-moving-step={step}
        data-carry={geom.carry}
        data-ax={g.a.x.toFixed(2)}
        data-ay={g.a.y.toFixed(2)}
        data-bx={g.b.x.toFixed(2)}
        data-by={g.b.y.toFixed(2)}
        data-n={n}
        data-gap={gap.toFixed(4)}
        data-phase={geom.phase}
        data-kind-seed={geom.kindSeed}
        data-k={g.kp.toFixed(4)}
      >
        {/* Du dernier au premier : celui qui ouvre la marche est dessiné par-dessus. */}
        {[...f.movers.keys()].reverse().map((i) => {
          const m = f.movers[i]!;
          return person(i, m.x, m.y, m.dir, m.loaded ? HOLD : STANDING, m.loaded && f.kind === 'carton', { opacity: m.opacity.toFixed(2) });
        })}
        <g data-mover="piece" transform={`translate(${(f.heavy?.x ?? g.a.x).toFixed(1)} ${(f.heavy?.y ?? g.a.y).toFixed(1)})`} opacity={(f.heavy?.opacity ?? 0).toFixed(2)}>
          {PIECES.filter((k, i) => HEAVY.has(k) && PIECES.indexOf(k) === i).map((k) => (
            <g key={k} data-piece={k} visibility={f.kind === k ? 'visible' : 'hidden'}>
              <PieceSprite kind={k} len={pieceLen} u={metrics.unit} sky={sky} />
            </g>
          ))}
        </g>
      </g>
    );
  }
  // Hayon (ouverture, fermeture) et pause : l'équipe attend près de l'arrière du camion ; le premier manœuvre le hayon.
  const toTruck = g.b.x >= g.a.x ? 1 : -1;
  return (
    <g key={`${id}-${step}`} data-moving-crew={id} data-moving-step={step}>
      {outfits.map((_, i) => {
        const p = at(0.62 - i * gap * 1.3);
        const facing = step === 'pause' && i > 0 ? -toTruck : toTruck;
        return person(i, p.x, p.y, facing, step !== 'pause' && i === 0 ? REACH : STANDING, false);
      })}
    </g>
  );
}

// ---------- Boucle : navette des porteurs ----------
export type Crew = { geom: CrewGeom; k: number; movers: Element[]; boxes: (Element | null)[]; piece: Element | null; kinds: Element[] };
export function collectMovers(root: Element): Crew[] {
  const out: Crew[] = [];
  for (const node of root.querySelectorAll('[data-moving-crew][data-carry]')) {
    const num = (name: string): number => Number(node.getAttribute(name));
    const movers = [...node.querySelectorAll('[data-mover="porter"]')].sort((x, y) => Number(x.getAttribute('data-mover-i')) - Number(y.getAttribute('data-mover-i')));
    out.push({
      geom: { a: { x: num('data-ax'), y: num('data-ay') }, b: { x: num('data-bx'), y: num('data-by') }, n: num('data-n'), gap: num('data-gap'), phase: num('data-phase'), carry: node.getAttribute('data-carry') === 'in' ? 'in' : 'out', kindSeed: num('data-kind-seed') },
      k: num('data-k'),
      movers,
      boxes: movers.map((m) => m.querySelector('[data-mover-box]')),
      piece: node.querySelector('[data-mover="piece"]'),
      kinds: [...node.querySelectorAll('[data-piece]')],
    });
  }
  return out;
}

export function placeMovers(crews: Crew[], t: number): void {
  for (const c of crews) {
    const f = crewFrame(c.geom, t, c.k);
    f.movers.forEach((m, i) => {
      const node = c.movers[i];
      if (!node) return;
      setIfChanged(node, 'opacity', m.opacity.toFixed(2));
      if (m.opacity > 0) {
        setIfChanged(node, 'transform', moverTransform(m.x, m.y, m.dir, c.k));
        applyPose(poseHandles(node), m.loaded ? HOLD : STANDING);
      }
      setIfChanged(c.boxes[i] ?? null, 'visibility', m.loaded && f.kind === 'carton' ? 'visible' : 'hidden');
    });
    setIfChanged(c.piece, 'opacity', (f.heavy?.opacity ?? 0).toFixed(2));
    if (f.heavy) {
      setIfChanged(c.piece, 'transform', `translate(${f.heavy.x.toFixed(1)} ${f.heavy.y.toFixed(1)})`);
      for (const k of c.kinds) setIfChanged(k, 'visibility', k.getAttribute('data-piece') === f.kind ? 'visible' : 'hidden');
    }
  }
}
