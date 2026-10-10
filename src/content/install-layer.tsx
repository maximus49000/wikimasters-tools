import { useMemo, type ReactElement, type ReactNode } from 'react';
import type { YMD } from '../core/library/city/calendar';
import { doorsFor, type Door } from '../core/library/city/doors';
import {
  absMinute, crewAt, decorSetsFor, itemEquipment, itemPhase, itemShown,
  type DecorItem, type DecorSet,
} from '../core/library/city/install';
import { lampsFor, type Lamp } from '../core/library/city/lamps';
import { STREET_SCALE, type CityMetrics } from '../core/library/city/metrics';
import { outfitFor, type Outfit } from '../core/library/city/people';
import { DARK } from '../core/library/city/events';
import { dayNumber } from '../core/library/city/shops/hours';
import { hashString, mulberry32 } from '../core/library/scene-world';
import type { Sky } from '../core/library/sky';
import { entranceLeft } from './city-sprites';
import {
  BARRIER, Barrier, CrewWorker, DoorFlag, FlagArt, HOLD_HAND, HeldSpot, HeldTruss, LampFlag, LiftTruck, STAGE, StageFloor, StageFrame,
  StageSpots, Van, liftRest, type CrewPose,
} from './install-sprites';
import { StageBand, StageBeams } from './stage-band';
import { LadderSprite } from './shop-sprites';

// Calque des décors de fête et des équipes qui les posent (spec §7, tâche 10). Tout est une fonction de la date et de la minute
// (moteur pur city/install.ts) : rendu à la minute par React, les déplacements entre deux minutes glissent par une transition
// CSS (comme l'équipe du chantier d'enseigne). Trois parties : `back` (contre les façades, avant les passants : drapeaux
// d'entrée), `crew` (après les passants : scène et musiciens, équipes à l'échelle et porteurs — un passant passe toujours
// derrière une équipe ou la scène) et `front` (après les lampadaires : drapeaux de lampadaires, barrières, camionnettes,
// camions élévateurs et leur équipe). Mouvement réduit : seuls les décors posés (phase `present`), aucune équipe ni véhicule.
// Les travailleurs portent `data-worker` : le plafond global des figurants (shopSpriteBudget) les compte.

export type InstallPart = 'back' | 'crew' | 'front' | 'all';
type Layer = 'back' | 'crew' | 'front';
type Props = { width: number; height: number; seed: number; sky: Sky; still: boolean; date: YMD; minutes: number; metrics: CityMetrics; rainy: boolean; lights?: boolean; part?: InstallPart };

type Pt = { x: number; y: number };
type Drawn = { part: Layer; node: ReactElement };

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

// ---------- Camionnette ----------
// 1,4 fois l'échelle des véhicules (≈ 1,3 fois la hauteur d'un ouvrier) ; demi-longueur en unités du sprite.
const VAN_GROW = 1.4;
const VAN_HALF = 28;
const vanK = (u: number): number => u * STREET_SCALE.vehicle * VAN_GROW;
// Demi-longueur du camion élévateur (unités du sprite). Écart minimal entre le centre de la camionnette et le point de travail
// du camion élévateur : les deux carrosseries plus 8 px, et jamais moins de 60 px.
const LIFT_HALF = 32;
const vanClear = (u: number): number => Math.max(60, VAN_HALF * vanK(u) + LIFT_HALF * u * STREET_SCALE.vehicle + 8 * u);

// Place de la camionnette (centre, px du monde) : à côté de la scène, sinon tirée de la graine ; puis décalée pas à pas jusqu'à
// ne masquer le pied d'aucun lampadaire, ni la scène, ni les places où le camion élévateur du même jeu travaille.
function vanX(set: DecorSet, width: number, seed: number, lamps: readonly Lamp[], m: CityMetrics): number {
  const u = m.unit;
  const half = VAN_HALF * vanK(u);
  const stage = set.items.find((i) => i.kind === 'stage-floor');
  const base = stage ? stage.x + 90 * u : Math.round(60 + mulberry32(seed ^ hashString(`${set.id}-van`))() * Math.max(0, width - 120));
  const works = set.items.filter((i) => itemEquipment(set, i) === 'lift').flatMap((i) => [liftPark(i, 1, m), liftPark(i, -1, m)]);
  const free = (x: number): boolean =>
    x >= half + 2 && x <= width - half - 2
    && lamps.every((l) => Math.abs(l.x - x) >= half + 3 * u)
    && (!stage || Math.abs(x - stage.x) >= (STAGE.half + 4) * u + half)
    && works.every((w) => Math.abs(w - x) >= vanClear(u));
  for (let k = 0; k * 4 * u < width; k++) {
    for (const s of [1, -1]) {
      const x = base + s * k * 4 * u;
      if (free(x)) return x;
    }
  }
  return base;
}

// ---------- Barrières ----------
// 1,5 fois leur taille d'origine ; posées sur la chaussée, à la limite de la voie proche du trottoir (elles barrent la chaussée),
// décalées hors du pied d'un lampadaire.
export const barrierK = (u: number): number => u * 0.85 * 1.5;
export const barrierY = (m: CityMetrics): number => m.curb + 4 * m.unit;
export const barrierClear = (u: number): number => BARRIER.half * barrierK(u) + 6 * u;
export function barrierX(x: number, lamps: readonly Lamp[], u: number): number {
  const gap = barrierClear(u);
  let out = x;
  for (let pass = 0; pass < 3; pass++) {
    const hit = lamps.find((l) => Math.abs(l.x - out) < gap);
    if (!hit) break;
    out = hit.x + (out >= hit.x ? gap : -gap);
  }
  return out;
}

export function InstallLayer({ width, height, seed, sky, still, date, minutes, metrics, rainy, lights = false, part = 'all' }: Props): ReactElement {
  const dayKey = `${date.y}-${date.m}-${date.d}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sets = useMemo(() => decorSetsFor(date, width, height, seed), [dayKey, width, height, seed]);
  const doors = useMemo(() => new Map(doorsFor(width, height, seed).map((d) => [d.id, d] as const)), [width, height, seed]);
  const lamps = useMemo(() => lampsFor(width, seed), [width, seed]);
  const outfits = useMemo(
    () => new Map(sets.map((s) => [s.id, [0, 1].map((i) => outfitFor('worker', mulberry32(seed ^ hashString(`${s.id}-crew-${i}`))))] as const)),
    [sets, seed],
  );
  const bandOutfits = useMemo(() => [0, 1, 2].map((i) => outfitFor('ordinary', mulberry32(seed ^ hashString(`stage-band-${i}`)))), [seed]);
  const abs = absMinute(dayNumber(date), minutes);
  const dark = sky.daylight < DARK;
  const u = metrics.unit;
  const drawn: Drawn[] = [];

  // Équipes à l'œuvre (aucune en mouvement réduit).
  const crews: CrewInput[] = still
    ? []
    : sets.flatMap((set) => {
      const c = crewAt(set, abs, set.day);
      if (!c) return [];
      const item = set.items.find((i) => i.id === c.itemId)!;
      return [{ set, item, step: c.step, progress: c.progress, removing: c.removing, width, seed, metrics, sky, rainy, outfits: outfits.get(set.id)!, doors, lamps }];
    });
  // Zones occupées par les équipes (camion élévateur et ses ouvriers, équipe à pied) : la camionnette n'y est pas garée.
  const zones = crews.map((c) => crewZone(c));
  // Élément que des porteurs soulèvent (dépose à la main) : dessiné dans leurs mains, plus à sa place.
  const lifted = new Set(crews.filter((c) => c.removing && c.step === 'place' && itemEquipment(c.set, c.item) === 'hand').map((c) => `${c.set.id}/${c.item.id}`));

  for (const set of sets) {
    // Décors posés.
    for (const item of set.items) {
      const ph = itemPhase(set, item, abs, set.day);
      const shown = still ? ph.phase === 'present' : itemShown(set, item, ph);
      if (!shown || lifted.has(`${set.id}/${item.id}`)) continue;
      // Projecteurs allumés (et faisceaux) : posés, il fait nuit, et la fête n'est pas finie (la dépose commence après minuit).
      const lit = item.kind === 'stage-spots' && ph.phase === 'present' && dark && abs < absMinute(set.day + 1, 0);
      const d = decorNode(set, item, ph.phase, doors.get(item.id), metrics, sky, still, lamps, lit);
      if (d) drawn.push(d);
    }
    if (set.id === 'stage-music') drawn.push(...stageShow(set, abs, dark, bandOutfits, metrics, sky, rainy, still));
    if (still) continue;
    // Camionnette de l'équipe à pied (échelles, barrières, plancher), garée au bord de la rue pendant les fenêtres ; absente
    // tant qu'une équipe (camion élévateur compris) travaille ou passe devant sa place : elle ne cache jamais une équipe.
    if (hasCrewOnFoot(set)) {
      const crew = crewAt(set, abs, set.day);
      const x = vanX(set, width, seed, lamps, metrics);
      const half = VAN_HALF * vanK(u);
      const nearTruck = zones.some((z) => x + half > z.from && x - half < z.to);
      for (const removing of [false, true]) {
        const [a, b] = windowAbs(set, removing);
        if (nearTruck || abs < a - VAN_MARGIN || abs >= b + VAN_MARGIN) continue;
        drawn.push({
          part: 'front',
          node: (
            <g key={`${set.id}-van-${removing ? 'out' : 'in'}`} data-install-van={set.id} data-x={x.toFixed(1)} data-half={half.toFixed(1)} transform={`translate(${x.toFixed(1)} ${(metrics.curb + 1.5 * u).toFixed(1)}) scale(${vanK(u).toFixed(3)})`}>
              <Van sky={sky} lights={lights} ladder={set.equipment === 'ladder' && crew === null} />
            </g>
          ),
        });
      }
    }
    // Équipe à l'œuvre.
    const inp = crews.find((c) => c.set === set);
    if (inp) drawn.push(...crewNodes(inp));
  }

  const pick = (p: Layer): ReactNode[] => drawn.filter((d) => d.part === p).map((d) => d.node);
  const want = (p: Layer): boolean => part === 'all' || part === p;
  return (
    <>
      {want('back') && <g data-install-part="back">{pick('back')}</g>}
      {want('crew') && <g data-install-part="crew">{pick('crew')}</g>}
      {want('front') && <g data-install-part="front">{pick('front')}</g>}
    </>
  );
}

// ---------- Décors ----------
const entranceTransform = (door: Door, m: CityMetrics): string =>
  `translate(${entranceLeft(door.x, m.unit).toFixed(1)} ${m.doorY.toFixed(1)}) scale(${(m.unit * STREET_SCALE.entranceX).toFixed(3)} ${(m.unit * STREET_SCALE.entranceY).toFixed(3)})`;
const lampTransform = (x: number, m: CityMetrics): string => `translate(${x} ${m.curb.toFixed(1)}) scale(${(m.unit * STREET_SCALE.lamp).toFixed(3)})`;
// Base de la scène : sur le trottoir, son bord avant au bord du trottoir.
const stageBase = (m: CityMetrics): number => m.curb - m.unit;

function decorNode(set: DecorSet, item: DecorItem, phase: string, door: Door | undefined, m: CityMetrics, sky: Sky, still: boolean, lamps: readonly Lamp[], lit = false): Drawn | null {
  const attrs = { 'data-decor-item': item.id, 'data-decor-kind': item.kind, 'data-decor-set': set.id, 'data-decor-phase': phase };
  const key = `${set.id}-${item.id}`;
  switch (item.kind) {
    case 'lamp-flag':
      return { part: 'front', node: <g key={key} {...attrs} transform={lampTransform(item.x, m)}><LampFlag sky={sky} still={still} /></g> };
    case 'door-flag':
      if (!door) return null;
      return { part: 'back', node: <g key={key} {...attrs} transform={entranceTransform(door, m)}><DoorFlag sky={sky} /></g> };
    case 'barrier': {
      const x = barrierX(item.x, lamps, m.unit);
      return { part: 'front', node: <g key={key} {...attrs} data-x={x.toFixed(1)} transform={`translate(${x.toFixed(1)} ${barrierY(m).toFixed(1)}) scale(${barrierK(m.unit).toFixed(3)})`}><Barrier sky={sky} /></g> };
    }
    case 'stage-floor':
    case 'stage-frame':
    case 'stage-spots': {
      const t = `translate(${item.x.toFixed(1)} ${stageBase(m).toFixed(1)}) scale(${m.unit.toFixed(3)})`;
      const art = item.kind === 'stage-floor' ? <StageFloor sky={sky} /> : item.kind === 'stage-frame' ? <StageFrame sky={sky} /> : <StageSpots sky={sky} lit={lit} />;
      return { part: 'crew', node: <g key={key} {...attrs} transform={t}>{art}</g> };
    }
    default: {
      const never: never = item.kind;
      return never;
    }
  }
}

// Musiciens (17 h à minuit, plancher posé) et faisceaux (projecteurs posés et nuit), posés sur la scène. La nuit, les
// projecteurs éclairent les musiciens (teinte relevée).
const BAND_FROM = 17 * 60;
function stageShow(set: DecorSet, abs: number, dark: boolean, outfits: Outfit[], m: CityMetrics, sky: Sky, rainy: boolean, still: boolean): Drawn[] {
  const floor = set.items.find((i) => i.kind === 'stage-floor');
  const spots = set.items.find((i) => i.kind === 'stage-spots');
  if (!floor || !spots) return [];
  if (abs < absMinute(set.day, BAND_FROM) || abs >= absMinute(set.day + 1, 0)) return [];
  const fp = itemPhase(set, floor, abs, set.day);
  const sp = itemPhase(set, spots, abs, set.day);
  const t = `translate(${floor.x.toFixed(1)} ${stageBase(m).toFixed(1)}) scale(${m.unit.toFixed(3)})`;
  const lit = sp.phase === 'present' && dark;
  const out: Drawn[] = [];
  if (lit) out.push({ part: 'crew', node: <g key={`${set.id}-beams`} transform={t}><StageBeams still={still} /></g> });
  if (still ? fp.phase === 'present' : itemShown(set, floor, fp)) out.push({ part: 'crew', node: <g key={`${set.id}-band`} transform={t}><StageBand outfits={outfits} sky={sky} rainy={rainy} still={still} lit={lit} /></g> });
  return out;
}

// ---------- Équipes ----------
type CrewInput = {
  set: DecorSet; item: DecorItem; step: string; progress: number; removing: boolean; width: number; seed: number;
  metrics: CityMetrics; sky: Sky; rainy: boolean; outfits: Outfit[]; doors: Map<string, Door>; lamps: readonly Lamp[];
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
  if (eq === 'ladder') return [{ part: 'crew', node: <g key={`${inp.set.id}-crew`} {...attrs}>{ladderCrew(inp)}</g> }];
  return [{ part: 'crew', node: <g key={`${inp.set.id}-crew`} {...attrs}>{handCrew(inp)}</g> }];
}

type Worker = { x: number; y: number; dir: 1 | -1; pose: CrewPose; held?: ReactNode };

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

// Pièce de la scène tenue par l'ouvrier de la nacelle : tronçon de treillis (ossature) ou projecteur.
const heldPiece = (inp: CrewInput, dir: 1 | -1, up: boolean): ReactNode => {
  const u = inp.metrics.unit;
  const t = `translate(${(dir * 3 * u).toFixed(2)} ${(-(up ? 22 : 13) * u).toFixed(2)}) scale(${(dir * 0.8 * u).toFixed(3)} ${(0.8 * u).toFixed(3)})`;
  return <g transform={t}>{inp.item.kind === 'stage-frame' ? <HeldTruss sky={inp.sky} /> : <HeldSpot sky={inp.sky} />}</g>;
};

// Échelle : l'équipe la porte à l'épaule en marchant, l'appuie contre la façade (inclinée, centrée sur la porte), l'un monte,
// l'autre la tient en bas.
const LADDER_TILT = 12;
function ladderCrew(inp: CrewInput): ReactElement {
  const m = inp.metrics;
  const u = m.unit;
  const k = u * STREET_SCALE.person;
  const home = vanX(inp.set, inp.width, inp.seed, inp.lamps, m);
  const { from, to } = route(inp, (i) => i.x, () => home);
  const dirIn = sgn(inp.item.x - from);
  const dirOut = sgn(to - inp.item.x, dirIn);
  const h = 30 * u;
  const rad = (LADDER_TILT * Math.PI) / 180;
  // Pied décalé de la moitié de l'inclinaison : le milieu de l'échelle est au-dessus du centre de la porte.
  const lx = inp.item.x - dirIn * (h / 2) * Math.sin(rad);
  const foot = m.doorY;
  const along = (y: number): number => lx + dirIn * (foot - y) * Math.tan(rad);
  const bx = lx - dirIn * 8 * u;
  const top = foot - 14 * u;
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
  // `angle` : 0 = appuyée contre la façade (inclinée de LADDER_TILT), 90 = couchée au sol vers l'arrière.
  const standing = (angle: number): ReactElement => (
    <g data-ladder="" data-ladder-state={angle === 0 ? 'up' : 'moving'} transform={`translate(${lx.toFixed(1)} ${foot.toFixed(1)}) scale(${dirIn} 1) rotate(${(LADDER_TILT * (1 - angle / 90) - angle).toFixed(1)})`}>
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
      // On dresse l'échelle bras levés ; on la couche bras vers l'avant et le bas.
      const raise = inp.step === 'ladder-up' ? p : 1 - p;
      a = { x: lx + dirIn * 4 * u, y: foot, dir: (-dirIn) as 1 | -1, pose: inp.step === 'ladder-up' ? 'reach' : 'hold' };
      b = { x: bx, y: foot, dir: dirIn, pose: 'stand' };
      ladder = standing(90 * (1 - raise));
      break;
    }
    default: {
      // climb, fix / unfix, descend : l'ouvrier suit l'inclinaison de l'échelle.
      const onTop = inp.step === 'fix' || inp.step === 'unfix';
      const y = inp.step === 'climb' ? lerp(foot, top, p) : inp.step === 'descend' ? lerp(top, foot, p) : top;
      // Le drapeau est à la main pendant la montée et la fixation (pose) ; pendant la descente (dépose).
      const holds = inp.removing ? inp.step === 'descend' : inp.step === 'climb' || inp.step === 'fix';
      a = { x: along(y), y, dir: dirIn, pose: onTop ? 'reach' : 'climb', held: flagUp(holds) };
      b = { x: bx, y: foot, dir: dirIn, pose: 'hold' };
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

// À la main : deux porteurs tiennent l'objet (barrière, élément de plancher) par ses extrémités, bras vers l'avant et le bas,
// à hauteur des mains : celui de derrière le pousse, celui de devant le tire, bras vers l'arrière.
function handCrew(inp: CrewInput): ReactElement {
  const m = inp.metrics;
  const u = m.unit;
  const k = u * STREET_SCALE.person;
  const home = vanX(inp.set, inp.width, inp.seed, inp.lamps, m);
  const { from, to } = route(inp, (i) => i.x, () => home);
  const barrier = inp.item.kind === 'barrier';
  const placedX = barrier ? barrierX(inp.item.x, inp.lamps, u) : inp.item.x;
  const dirIn = sgn(placedX - from);
  const dirOut = sgn(to - placedX, dirIn);
  const y = m.curb - 2 * u;
  // Mains (pose `hold`) : en avant du corps, à mi-hauteur.
  const reach = HOLD_HAND.x * k;
  const gripY = y + HOLD_HAND.y * k;
  // Prises : les montants de la barrière (tenue à mi-hauteur), les bouts de la planche.
  const half = barrier ? BARRIER.post * barrierK(u) : 17 * u;
  const off = half + reach;
  const carryBase = barrier ? gripY + (BARRIER.height / 2) * barrierK(u) : gripY + 1.25 * u;
  const placedY = barrier ? barrierY(m) : stageBase(m);
  const p = inp.progress;
  const load = (x: number, base: number): ReactElement =>
    barrier ? (
      <g data-carried-item="barrier" transform={`translate(${x.toFixed(1)} ${base.toFixed(1)}) scale(${barrierK(u).toFixed(3)})`}><Barrier sky={inp.sky} /></g>
    ) : (
      <rect data-carried-item="plank" x={x - 17 * u} y={base - 2.5 * u} width={34 * u} height={2.5 * u} fill={inp.sky.daylight < 0.3 ? '#3A3036' : '#6A5848'} />
    );
  let a: Worker;
  let b: Worker;
  let carried: ReactElement | null = null;
  if (inp.step === 'arrive' || inp.step === 'leave') {
    const at = inp.step === 'arrive' ? lerp(from, placedX, p) : lerp(placedX, to, p);
    const dir = inp.step === 'arrive' ? dirIn : dirOut;
    const loaded = inp.step === 'arrive' ? !inp.removing : inp.removing;
    // Chargés : derrière pousse (bras vers l'avant), devant tire (bras vers l'arrière). À vide : ils marchent.
    a = { x: at + dir * off, y, dir, pose: loaded ? 'tow' : 'walk' };
    b = { x: at - dir * off, y, dir, pose: loaded ? 'hold' : 'walk' };
    if (loaded) carried = load(at, carryBase);
  } else {
    // place : face à face de part et d'autre de l'objet ; on le descend jusqu'au sol (pose) ou on le soulève (dépose).
    a = { x: placedX + dirIn * off, y, dir: (-dirIn) as 1 | -1, pose: 'hold' };
    b = { x: placedX - dirIn * off, y, dir: dirIn, pose: 'hold' };
    carried = load(placedX, inp.removing ? lerp(placedY, carryBase, p) : lerp(carryBase, placedY, p));
  }
  return (
    <>
      <WorkerNode w={b} outfit={inp.outfits[1]!} inp={inp} k={k} />
      <WorkerNode w={a} outfit={inp.outfits[0]!} inp={inp} k={k} />
      {carried}
    </>
  );
}

// ---------- Camion élévateur ----------
// Nacelle visée pour un élément (bas de la nacelle, px du monde). Lampadaire : nacelle du côté du drapeau (−x), assez près de
// la tête du mât pour que le drapeau tenu soit à ~8 px de son support.
function bucketTarget(item: DecorItem, m: CityMetrics): Pt {
  const u = m.unit;
  switch (item.kind) {
    case 'lamp-flag':
      return { x: item.x - 11 * u, y: m.curb - 37 * u };
    case 'stage-frame':
      return { x: item.x - 36 * u, y: stageBase(m) - 44 * u };
    default:
      return { x: item.x, y: stageBase(m) - 40 * u };
  }
}

// Place du camion (centre, px du monde). Lampadaire : toujours du côté du drapeau, assez loin pour que la nacelle repliée
// (au-dessus de la cabine) reste de ce côté du mât, quel que soit le sens du camion : elle ne traverse jamais le mât.
function liftPark(item: DecorItem, dir: 1 | -1, m: CityMetrics): number {
  if (item.kind === 'lamp-flag') return item.x - 33 * m.unit;
  return bucketTarget(item, m).x + dir * 22 * m.unit;
}

type LiftGeom = { dir: 1 | -1; here: number; tx: number; ty: number; outrigger: number; lift: number; inside: boolean; inBucket: boolean };

// Camion élévateur : il roule jusqu'à l'élément, déploie ses stabilisateurs, lève la nacelle (un travailleur dedans, l'autre
// au sol), fixe ou retire, redescend, replie et repart. Il se gare contre le trottoir (roues au bord, stabilisateurs courts).
function liftPlan(inp: CrewInput): LiftGeom {
  const m = inp.metrics;
  const u = m.unit;
  const ty = m.curb + 1.5 * u;
  const edge = (i: DecorItem): number => (i.x < inp.width / 2 ? -OFFSTAGE : inp.width + OFFSTAGE);
  // Sens du camion : celui de son arrivée (vers l'élément).
  const roughFrom = route(inp, (i) => i.x, edge).from;
  const dir = sgn(inp.item.x - roughFrom, sgn(inp.item.x - edge(inp.item)));
  const park = (i: DecorItem): number => liftPark(i, dir, m);
  const { from, to } = route(inp, park, edge);
  const here = park(inp.item);
  const p = inp.progress;
  let tx = here;
  let outrigger = 1;
  let lift = 0;
  let inside = false; // les deux travailleurs dans la cabine (en route)
  let inBucket = false; // l'un d'eux dans la nacelle (levée, en haut, redescente)
  switch (inp.step) {
    case 'arrive': tx = lerp(from, here, p); outrigger = 0; inside = true; break;
    case 'leave': tx = lerp(here, to, p); outrigger = 0; inside = true; break;
    case 'deploy': outrigger = p; break;
    case 'stow': outrigger = 1 - p; break;
    case 'rise': lift = p; inBucket = true; break;
    case 'lower': lift = 1 - p; inBucket = true; break;
    default: lift = 1; inBucket = true; // fix / unfix
  }
  return { dir, here, tx, ty, outrigger, lift, inside, inBucket };
}

// Étendue (px du monde) qu'occupe une équipe à l'œuvre : camion élévateur (carrosserie, ouvriers au sol, 60 px au moins
// autour de son point de travail) ; équipe à pied autour de son élément.
function crewZone(inp: CrewInput): { from: number; to: number } {
  const u = inp.metrics.unit;
  if (itemEquipment(inp.set, inp.item) !== 'lift') return { from: inp.item.x - 40 * u, to: inp.item.x + 40 * u };
  const g = liftPlan(inp);
  const body = LIFT_HALF * u * STREET_SCALE.vehicle + 6 * u;
  const lamp = inp.item.kind === 'lamp-flag' ? inp.item.x + 20 * u : -Infinity;
  return {
    from: Math.min(g.tx - body, g.here - 60, g.here - 40 * u),
    to: Math.max(g.tx + body, g.here + 60, g.here + 40 * u, lamp),
  };
}

function liftCrew(inp: CrewInput): ReactElement {
  const m = inp.metrics;
  const u = m.unit;
  const kv = u * STREET_SCALE.vehicle;
  const kp = u * STREET_SCALE.person;
  const g = liftPlan(inp);
  const target = bucketTarget(inp.item, m);
  const rest = liftRest(g.dir, kv, u);
  const goal = { x: target.x - g.here, y: target.y - g.ty };
  const bucket = { x: lerp(rest.x, goal.x, g.lift), y: lerp(rest.y, goal.y, g.lift) };
  const atTop = inp.step === 'fix' || inp.step === 'unfix';
  const holds = inp.removing ? inp.step === 'lower' : inp.step === 'rise' || inp.step === 'fix';
  const faceItem = sgn(inp.item.x - (g.here + bucket.x), g.dir);
  // Tenu à la main : le drapeau pour un lampadaire, une pièce de treillis ou un projecteur pour la scène.
  const held = !holds ? null : inp.item.kind === 'lamp-flag' ? heldFlag(inp, faceItem, true) : heldPiece(inp, faceItem, atTop);
  const rider = !g.inBucket ? null : (
    <g data-worker="" data-pose={atTop ? 'reach' : 'stand'}>
      <g transform={`scale(${(faceItem * kp).toFixed(3)} ${kp.toFixed(3)})`}>
        <CrewWorker outfit={inp.outfits[0]!} sky={inp.sky} rainy={inp.rainy} pose={atTop ? 'reach' : 'stand'} />
      </g>
      {held}
    </g>
  );
  // Au sol (stabilisateurs, manœuvre) : près du lampadaire, de l'autre côté du mât ; sinon derrière le camion. Pendant le
  // déploiement et le repli, l'ouvrier de la nacelle attend au sol à côté de lui.
  const lamp = inp.item.kind === 'lamp-flag';
  const gy = m.curb - 1 * u;
  const ground: Worker | null = g.inside ? null : { x: lamp ? inp.item.x + 7 * u : g.here - g.dir * 30 * u, y: gy, dir: lamp ? -1 : g.dir, pose: 'stand' };
  const waiting: Worker | null = g.inside || g.inBucket ? null : { x: lamp ? inp.item.x + 15 * u : g.here - g.dir * 39 * u, y: gy, dir: lamp ? -1 : g.dir, pose: 'stand' };
  return (
    <>
      {ground && <WorkerNode w={ground} outfit={inp.outfits[1]!} inp={inp} k={kp} />}
      {waiting && <WorkerNode w={waiting} outfit={inp.outfits[0]!} inp={inp} k={kp} />}
      <g data-lift-truck="" data-x={g.tx.toFixed(1)} data-park={g.here.toFixed(1)} style={{ transform: `translate(${g.tx.toFixed(1)}px, ${g.ty.toFixed(1)}px)`, transition: MOVE }}>
        <LiftTruck sky={inp.sky} still={false} dir={g.dir} k={kv} u={u} outrigger={g.outrigger} bucket={bucket} rider={rider} beacon />
      </g>
    </>
  );
}
