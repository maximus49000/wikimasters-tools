import { useMemo, type ReactElement, type ReactNode } from 'react';
import type { YMD } from '../core/library/city/calendar';
import { doorsFor, type Door } from '../core/library/city/doors';
import {
  absMinute, crewAt, decorSetsFor, itemEquipment, itemPhase, itemShown,
  type DecorItem, type DecorSet,
} from '../core/library/city/install';
import { STREET_SCALE, type CityMetrics } from '../core/library/city/metrics';
import { outfitFor, type Outfit } from '../core/library/city/people';
import { dayNumber } from '../core/library/city/shops/hours';
import { hashString, mulberry32 } from '../core/library/scene-world';
import type { Sky } from '../core/library/sky';
import { entranceLeft } from './city-sprites';
import { Barrier, CrewWorker, DoorFlag, FlagArt, LampFlag, LiftTruck, StageFloor, StageFrame, StageSpots, Van, liftRest } from './install-sprites';
import { LadderSprite, type WorkerPose } from './shop-sprites';

// Calque des décors de fête et des équipes qui les posent (spec §7, tâche 10). Tout est une fonction de la date et de la minute
// (moteur pur city/install.ts) : rendu à la minute par React, les déplacements entre deux minutes glissent par une transition
// CSS (comme l'équipe du chantier d'enseigne). Deux parties : `back` (dans le trottoir : drapeaux d'entrée, scène, équipes à
// l'échelle et porteurs) et `front` (après les lampadaires : drapeaux de lampadaires, barrières, camionnettes, camions
// élévateurs). Mouvement réduit : seuls les décors posés (phase `present`), aucune équipe ni véhicule.
// Les travailleurs portent `data-worker` : le plafond global des figurants (shopSpriteBudget) les compte.

export type InstallPart = 'back' | 'front' | 'all';
type Props = { width: number; height: number; seed: number; sky: Sky; still: boolean; date: YMD; minutes: number; metrics: CityMetrics; rainy: boolean; lights?: boolean; part?: InstallPart };

type Pt = { x: number; y: number };
type Drawn = { part: 'back' | 'front'; node: ReactElement };

const MOVE = 'transform 30s linear';
// Hors champ : le camion élévateur vient du bord du monde le plus proche et y repart.
const OFFSTAGE = 70;
// Marge (min) pendant laquelle la camionnette est garée avant le premier élément et après le dernier (échelle rangée).
const VAN_MARGIN = 20;
const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;
const sgn = (d: number, fallback: 1 | -1 = 1): 1 | -1 => (d > 0 ? 1 : d < 0 ? -1 : fallback);
const mid = (a: number, b: number): number => (a + b) / 2;

// Ordre d'intervention (même tri que le moteur : u ou removeU, puis id).
const orderOf = (set: DecorSet, removing: boolean): DecorItem[] => {
  const key = (i: DecorItem): number => (removing ? i.removeU : i.u);
  return [...set.items].sort((a, b) => key(a) - key(b) || (a.id < b.id ? -1 : 1));
};

const windowAbs = (set: DecorSet, removing: boolean): [number, number] => {
  const w = removing ? set.remove : set.install;
  return [absMinute(set.day + w.dayOffset, w.from), absMinute(set.day + w.dayOffset, w.to)];
};

const hasCrewOnFoot = (set: DecorSet): boolean => set.items.some((i) => itemEquipment(set, i) !== 'lift');

// Place de la camionnette (centre, px du monde) : à côté de la scène, sinon tirée de la graine.
function vanX(set: DecorSet, width: number, seed: number, u: number): number {
  const stage = set.items.find((i) => i.kind === 'stage-floor');
  if (stage) return stage.x + 80 * u < width - 30 ? stage.x + 80 * u : stage.x - 80 * u;
  return Math.round(60 + mulberry32(seed ^ hashString(`${set.id}-van`))() * Math.max(0, width - 120));
}

export function InstallLayer({ width, height, seed, sky, still, date, minutes, metrics, rainy, lights = false, part = 'all' }: Props): ReactElement {
  const dayKey = `${date.y}-${date.m}-${date.d}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sets = useMemo(() => decorSetsFor(date, width, height, seed), [dayKey, width, height, seed]);
  const doors = useMemo(() => new Map(doorsFor(width, height, seed).map((d) => [d.id, d] as const)), [width, height, seed]);
  const outfits = useMemo(
    () => new Map(sets.map((s) => [s.id, [0, 1].map((i) => outfitFor('worker', mulberry32(seed ^ hashString(`${s.id}-crew-${i}`))))] as const)),
    [sets, seed],
  );
  const abs = absMinute(dayNumber(date), minutes);
  const u = metrics.unit;
  const drawn: Drawn[] = [];

  for (const set of sets) {
    // Décors posés.
    for (const item of set.items) {
      const ph = itemPhase(set, item, abs, set.day);
      const shown = still ? ph.phase === 'present' : itemShown(set, item, ph);
      if (!shown) continue;
      const d = decorNode(set, item, ph.phase, doors.get(item.id), metrics, sky, still);
      if (d) drawn.push(d);
    }
    if (still) continue;
    // Camionnette de l'équipe à pied (échelles, barrières, plancher), garée au bord de la rue pendant les fenêtres.
    if (hasCrewOnFoot(set)) {
      const crew = crewAt(set, abs, set.day);
      for (const removing of [false, true]) {
        const [a, b] = windowAbs(set, removing);
        if (abs < a - VAN_MARGIN || abs >= b + VAN_MARGIN) continue;
        const k = u * STREET_SCALE.vehicle;
        const x = vanX(set, width, seed, u);
        drawn.push({
          part: 'front',
          node: (
            <g key={`${set.id}-van-${removing ? 'out' : 'in'}`} data-install-van={set.id} transform={`translate(${x.toFixed(1)} ${(metrics.curb + 2 * u).toFixed(1)}) scale(${k.toFixed(3)})`}>
              <Van sky={sky} lights={lights} ladder={set.equipment === 'ladder' && crew === null} />
            </g>
          ),
        });
      }
    }
    // Équipe à l'œuvre.
    const c = crewAt(set, abs, set.day);
    if (!c) continue;
    const item = set.items.find((i) => i.id === c.itemId)!;
    drawn.push(...crewNodes({ set, item, step: c.step, progress: c.progress, removing: c.removing, width, seed, metrics, sky, rainy, outfits: outfits.get(set.id)!, doors }));
  }

  const pick = (p: 'back' | 'front'): ReactNode[] => drawn.filter((d) => d.part === p).map((d) => d.node);
  return (
    <>
      {part !== 'front' && <g data-install-part="back">{pick('back')}</g>}
      {part !== 'back' && <g data-install-part="front">{pick('front')}</g>}
    </>
  );
}

// ---------- Décors ----------
const entranceTransform = (door: Door, m: CityMetrics): string =>
  `translate(${entranceLeft(door.x, m.unit).toFixed(1)} ${m.doorY.toFixed(1)}) scale(${(m.unit * STREET_SCALE.entranceX).toFixed(3)} ${(m.unit * STREET_SCALE.entranceY).toFixed(3)})`;
const lampTransform = (x: number, m: CityMetrics): string => `translate(${x} ${m.curb.toFixed(1)}) scale(${(m.unit * STREET_SCALE.lamp).toFixed(3)})`;
// Base de la scène : sur le trottoir, son bord avant au bord du trottoir.
const stageBase = (m: CityMetrics): number => m.curb - m.unit;
const barrierY = (m: CityMetrics): number => m.curb + 1.5 * m.unit;

function decorNode(set: DecorSet, item: DecorItem, phase: string, door: Door | undefined, m: CityMetrics, sky: Sky, still: boolean): Drawn | null {
  const attrs = { 'data-decor-item': item.id, 'data-decor-kind': item.kind, 'data-decor-set': set.id, 'data-decor-phase': phase };
  const key = `${set.id}-${item.id}`;
  switch (item.kind) {
    case 'lamp-flag':
      return { part: 'front', node: <g key={key} {...attrs} transform={lampTransform(item.x, m)}><LampFlag sky={sky} still={still} /></g> };
    case 'door-flag':
      if (!door) return null;
      return { part: 'back', node: <g key={key} {...attrs} transform={entranceTransform(door, m)}><DoorFlag sky={sky} /></g> };
    case 'barrier':
      return { part: 'front', node: <g key={key} {...attrs} transform={`translate(${item.x.toFixed(1)} ${barrierY(m).toFixed(1)}) scale(${(m.unit * 0.85).toFixed(3)})`}><Barrier sky={sky} /></g> };
    case 'stage-floor':
    case 'stage-frame':
    case 'stage-spots': {
      const t = `translate(${item.x.toFixed(1)} ${stageBase(m).toFixed(1)}) scale(${m.unit.toFixed(3)})`;
      const art = item.kind === 'stage-floor' ? <StageFloor sky={sky} /> : item.kind === 'stage-frame' ? <StageFrame sky={sky} /> : <StageSpots sky={sky} lit={false} />;
      return { part: 'back', node: <g key={key} {...attrs} transform={t}>{art}</g> };
    }
    default: {
      const never: never = item.kind;
      return never;
    }
  }
}

// ---------- Équipes ----------
type CrewInput = {
  set: DecorSet; item: DecorItem; step: string; progress: number; removing: boolean; width: number; seed: number;
  metrics: CityMetrics; sky: Sky; rainy: boolean; outfits: Outfit[]; doors: Map<string, Door>;
};

// Itinéraire de l'équipe : les éléments du même matériel (camion élévateur, ou équipe à pied) dans l'ordre d'intervention.
// Un élément se rejoint depuis le milieu du chemin qui le sépare du précédent (ou depuis la base : camionnette, bord du monde)
// et se quitte vers le milieu du chemin vers le suivant : d'un créneau à l'autre, l'équipe ne saute pas.
function route(inp: CrewInput, anchor: (i: DecorItem) => number, home: (i: DecorItem) => number): { from: number; to: number } {
  const lift = itemEquipment(inp.set, inp.item) === 'lift';
  const list = orderOf(inp.set, inp.removing).filter((i) => (itemEquipment(inp.set, i) === 'lift') === lift);
  const k = list.findIndex((i) => i.id === inp.item.id);
  const here = anchor(inp.item);
  const prev = list[k - 1];
  const next = list[k + 1];
  return { from: prev ? mid(anchor(prev), here) : home(inp.item), to: next ? mid(here, anchor(next)) : home(inp.item) };
}

function crewNodes(inp: CrewInput): Drawn[] {
  const eq = itemEquipment(inp.set, inp.item);
  const attrs = {
    'data-crew': inp.set.id,
    'data-crew-item': inp.item.id,
    'data-equipment': eq,
    'data-high': inp.item.high ? 'true' : 'false',
    'data-removing': inp.removing ? 'true' : 'false',
    'data-step': inp.step,
  };
  if (eq === 'lift') return [{ part: 'front', node: <g key={`${inp.set.id}-crew`} {...attrs}>{liftCrew(inp)}</g> }];
  if (eq === 'ladder') return [{ part: 'back', node: <g key={`${inp.set.id}-crew`} {...attrs}>{ladderCrew(inp)}</g> }];
  return [{ part: 'back', node: <g key={`${inp.set.id}-crew`} {...attrs}>{handCrew(inp)}</g> }];
}

type Worker = { x: number; y: number; dir: 1 | -1; pose: WorkerPose; held?: ReactNode };

function WorkerNode({ w, outfit, inp, k }: { w: Worker; outfit: Outfit; inp: CrewInput; k: number }): ReactElement {
  return (
    <g data-worker="" data-pose={w.pose} style={{ transform: `translate(${w.x.toFixed(1)}px, ${w.y.toFixed(1)}px)`, transition: MOVE }}>
      <g transform={`scale(${(w.dir * k).toFixed(3)} ${k.toFixed(3)})`}>
        <CrewWorker outfit={outfit} sky={inp.sky} rainy={inp.rainy} pose={w.pose} />
      </g>
      {w.held}
    </g>
  );
}

// Petit drapeau tenu à bout de bras (roulé ou déplié).
const heldFlag = (inp: CrewInput, dir: 1 | -1, up: boolean): ReactNode => {
  const u = inp.metrics.unit;
  return (
    <g data-held-flag="" transform={`translate(${(dir * 3 * u).toFixed(2)} ${(-(up ? 22 : 13) * u).toFixed(2)}) scale(${(dir * 0.7 * u).toFixed(3)} ${(0.7 * u).toFixed(3)})`}>
      <line x1={0} y1={0} x2={0} y2={-9} stroke={inp.sky.daylight < 0.3 ? '#3A3228' : '#6B5B4A'} strokeWidth={0.8} />
      <g transform="translate(0 -9)"><FlagArt sky={inp.sky} w={6} h={4} /></g>
    </g>
  );
};

// Échelle : l'équipe la porte à l'épaule en marchant, la dresse contre la façade, l'un monte, l'autre la tient en bas.
function ladderCrew(inp: CrewInput): ReactElement {
  const m = inp.metrics;
  const u = m.unit;
  const k = u * STREET_SCALE.person;
  const { from, to } = route(inp, (i) => i.x, () => vanX(inp.set, inp.width, inp.seed, u));
  const dirIn = sgn(inp.item.x - from);
  const dirOut = sgn(to - inp.item.x, dirIn);
  const lx = inp.item.x - dirIn * 9 * u;
  const bx = lx - dirIn * 8 * u;
  const foot = m.doorY;
  const top = foot - 14 * u;
  const h = 30 * u;
  const shoulder = foot - 20 * u;
  const p = inp.progress;
  const flagUp = (on: boolean): ReactNode => (on ? heldFlag(inp, dirIn, true) : null);
  let a: Worker;
  let b: Worker;
  let ladder: ReactElement;
  const carried = (ax: number, dir: 1 | -1): ReactElement => (
    <g data-ladder="" data-ladder-state="carried" transform={`translate(${ax.toFixed(1)} ${shoulder.toFixed(1)}) scale(${dir} 1) rotate(-90)`}>
      <LadderSprite height={h} />
    </g>
  );
  const standing = (angle: number): ReactElement => (
    <g data-ladder="" data-ladder-state={angle === 0 ? 'up' : 'moving'} transform={`translate(${lx.toFixed(1)} ${foot.toFixed(1)}) scale(${dirIn} 1) rotate(${(-angle).toFixed(1)})`}>
      <LadderSprite height={h} />
    </g>
  );
  switch (inp.step) {
    case 'arrive': {
      const ax = lerp(from, lx, p);
      a = { x: ax, y: foot, dir: dirIn, pose: 'carry' };
      b = { x: ax - dirIn * (h - 3 * u), y: foot, dir: dirIn, pose: 'carry' };
      ladder = carried(ax, dirIn);
      break;
    }
    case 'leave': {
      const ax = lerp(lx, to, p);
      a = { x: ax, y: foot, dir: dirOut, pose: 'carry', held: inp.removing ? heldFlag(inp, dirOut, false) : null };
      b = { x: ax - dirOut * (h - 3 * u), y: foot, dir: dirOut, pose: 'carry' };
      ladder = carried(ax, dirOut);
      break;
    }
    case 'ladder-up':
    case 'ladder-down': {
      const raise = inp.step === 'ladder-up' ? p : 1 - p;
      a = { x: lx + dirIn * 3 * u, y: foot, dir: (-dirIn) as 1 | -1, pose: 'reach' };
      b = { x: bx, y: foot, dir: dirIn, pose: 'stand' };
      ladder = standing(90 * (1 - raise));
      break;
    }
    default: {
      // climb, fix / unfix, descend
      const onTop = inp.step === 'fix' || inp.step === 'unfix';
      const y = inp.step === 'climb' ? lerp(foot, top, p) : inp.step === 'descend' ? lerp(top, foot, p) : top;
      // Le drapeau est à la main pendant la montée et la fixation (pose) ; pendant la descente (dépose).
      const holds = inp.removing ? inp.step === 'descend' : inp.step === 'climb' || inp.step === 'fix';
      a = { x: lx, y, dir: dirIn, pose: onTop ? 'reach' : 'climb', held: flagUp(holds) };
      b = { x: bx, y: foot, dir: dirIn, pose: 'stand' };
      ladder = standing(0);
    }
  }
  return (
    <>
      {ladder}
      <WorkerNode w={b} outfit={inp.outfits[1]!} inp={inp} k={k} />
      <WorkerNode w={a} outfit={inp.outfits[0]!} inp={inp} k={k} />
    </>
  );
}

// À la main : deux porteurs, l'objet (barrière, élément de plancher) tenu entre eux à hauteur de taille.
function handCrew(inp: CrewInput): ReactElement {
  const m = inp.metrics;
  const u = m.unit;
  const k = u * STREET_SCALE.person;
  const { from, to } = route(inp, (i) => i.x, () => vanX(inp.set, inp.width, inp.seed, u));
  const dirIn = sgn(inp.item.x - from);
  const dirOut = sgn(to - inp.item.x, dirIn);
  const y = m.curb - 2 * u;
  const carryY = y - 9 * u;
  const p = inp.progress;
  const gap = 11 * u;
  const barrier = inp.item.kind === 'barrier';
  const placedY = barrier ? barrierY(m) : stageBase(m);
  const load = (x: number, yy: number): ReactElement =>
    barrier ? (
      <g data-carried-item="barrier" transform={`translate(${x.toFixed(1)} ${yy.toFixed(1)}) scale(${(u * 0.85).toFixed(3)})`}><Barrier sky={inp.sky} /></g>
    ) : (
      <rect data-carried-item="plank" x={x - 17 * u} y={yy - 2.5 * u} width={34 * u} height={2.5 * u} fill={inp.sky.daylight < 0.3 ? '#3A3036' : '#6A5848'} />
    );
  let at: number;
  let dir: 1 | -1;
  let pose: WorkerPose;
  let carried: ReactElement | null = null;
  if (inp.step === 'arrive') {
    at = lerp(from, inp.item.x, p);
    dir = dirIn;
    pose = inp.removing ? 'walk' : 'carry';
    if (!inp.removing) carried = load(at, carryY);
  } else if (inp.step === 'leave') {
    at = lerp(inp.item.x, to, p);
    dir = dirOut;
    pose = inp.removing ? 'carry' : 'walk';
    if (inp.removing) carried = load(at, carryY);
  } else {
    // place : on pose (la barrière descend jusqu'au sol) ; à la dépose, l'objet est encore à sa place (dessiné par le décor).
    at = inp.item.x;
    dir = dirIn;
    pose = 'reach';
    if (!inp.removing) carried = load(at, lerp(carryY, placedY, p));
  }
  // En posant, les deux porteurs se font face de part et d'autre de l'objet ; en marchant, ils vont dans le même sens.
  const a: Worker = { x: at + dir * gap, y, dir: inp.step === 'place' ? ((-dir) as 1 | -1) : dir, pose };
  const b: Worker = { x: at - dir * gap, y, dir, pose };
  return (
    <>
      <WorkerNode w={b} outfit={inp.outfits[1]!} inp={inp} k={k} />
      {carried}
      <WorkerNode w={a} outfit={inp.outfits[0]!} inp={inp} k={k} />
    </>
  );
}

// Nacelle visée pour un élément (bas de la nacelle, px du monde).
function bucketTarget(item: DecorItem, m: CityMetrics): Pt {
  const u = m.unit;
  switch (item.kind) {
    case 'lamp-flag':
      return { x: item.x - 14 * u, y: m.curb - 40 * u };
    case 'stage-frame':
      return { x: item.x - 36 * u, y: stageBase(m) - 44 * u };
    default:
      return { x: item.x, y: stageBase(m) - 40 * u };
  }
}

// Camion élévateur : il roule jusqu'à l'élément, déploie ses stabilisateurs, lève la nacelle (un travailleur dedans, l'autre
// au sol), fixe ou retire, redescend, replie et repart.
function liftCrew(inp: CrewInput): ReactElement {
  const m = inp.metrics;
  const u = m.unit;
  const kv = u * STREET_SCALE.vehicle;
  const kp = u * STREET_SCALE.person;
  const ty = m.curb + 7 * u;
  const edge = (i: DecorItem): number => (i.x < inp.width / 2 ? -OFFSTAGE : inp.width + OFFSTAGE);
  // Sens du camion : celui de son arrivée (vers l'élément) ; le camion se gare la nacelle à portée de l'élément.
  const roughFrom = route(inp, (i) => i.x, edge).from;
  const dir = sgn(inp.item.x - roughFrom, sgn(inp.item.x - edge(inp.item)));
  const park = (i: DecorItem): number => bucketTarget(i, m).x + dir * 22 * u;
  const { from, to } = route(inp, park, edge);
  const here = park(inp.item);
  const target = bucketTarget(inp.item, m);
  const p = inp.progress;
  let tx = here;
  let outrigger = 1;
  let lift = 0;
  let inside = true; // les deux travailleurs sont dans la cabine (en route)
  switch (inp.step) {
    case 'arrive': tx = lerp(from, here, p); outrigger = 0; break;
    case 'leave': tx = lerp(here, to, p); outrigger = 0; break;
    case 'deploy': outrigger = p; inside = false; break;
    case 'stow': outrigger = 1 - p; inside = false; break;
    case 'rise': lift = p; inside = false; break;
    case 'lower': lift = 1 - p; inside = false; break;
    default: lift = 1; inside = false; // fix / unfix
  }
  const rest = liftRest(dir, kv, u);
  const goal = { x: target.x - here, y: target.y - ty };
  const bucket = { x: lerp(rest.x, goal.x, lift), y: lerp(rest.y, goal.y, lift) };
  const atTop = inp.step === 'fix' || inp.step === 'unfix';
  const holds = inp.removing ? inp.step === 'lower' : inp.step === 'rise' || inp.step === 'fix';
  const faceItem = sgn(inp.item.x - (here + bucket.x), dir);
  const rider = inside ? null : (
    <g data-worker="" data-pose={atTop ? 'reach' : 'stand'}>
      <g transform={`scale(${(faceItem * kp).toFixed(3)} ${kp.toFixed(3)})`}>
        <CrewWorker outfit={inp.outfits[0]!} sky={inp.sky} rainy={inp.rainy} pose={atTop ? 'reach' : 'stand'} />
      </g>
      {holds ? heldFlag(inp, faceItem, true) : null}
    </g>
  );
  const ground: Worker | null = inside ? null : { x: here - dir * 30 * u, y: m.curb - 1 * u, dir, pose: 'stand' };
  return (
    <>
      {ground && <WorkerNode w={ground} outfit={inp.outfits[1]!} inp={inp} k={kp} />}
      <g data-lift-truck="" style={{ transform: `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px)`, transition: MOVE }}>
        <LiftTruck sky={inp.sky} still={false} dir={dir} k={kv} u={u} outrigger={outrigger} bucket={bucket} rider={rider} beacon />
      </g>
    </>
  );
}
