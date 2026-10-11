import { useLayoutEffect, useMemo, useRef, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import type { YMD } from '../core/library/city/calendar';
import { COUNTER_HALF, STAND_DEPTH } from '../core/library/city/beer';
import { doorsFor, type Door } from '../core/library/city/doors';
import {
  LIFT_FETCH, absMinute, beerStandsFor, crewAt, crewStepWindow, decorSetsFor, footWindow, inVehicle, itemEquipment, itemPhase, itemShown,
  setWindow, type DecorItem, type DecorSet, type Transport,
} from '../core/library/city/install';
import { TRANSPORT_SPEED, vanAt, vanCrewAt, vanVisit, type VanVisit, type VehicleKind } from '../core/library/city/van';
import { lampsFor, type Lamp } from '../core/library/city/lamps';
import { STREET_SCALE, type CityMetrics } from '../core/library/city/metrics';
import { outfitFor, type Outfit } from '../core/library/city/people';
import { pathAt, pathDir, pathLength } from '../core/library/city/walk-path';
import { DARK } from '../core/library/city/events';
import { dayNumber } from '../core/library/city/shops/hours';
import { hashString, mulberry32 } from '../core/library/scene-world';
import { anchorsOf } from '../core/library/figure/bake';
import { shapeOf, signatureOf } from '../core/library/figure/dress';
import { YAW_BACK, facingYaw } from '../core/library/figure/gait';
import { crankPhase } from './figure/ghibli-cyclist';
import type { Sky } from '../core/library/sky';
import { workerPose, type CrewLook, type WorkerMove } from './city-shops-life';
import { entranceLeft } from './city-sprites';
import { GhibliFigure } from './figure/ghibli-figure';
import {
  BARRIER, BIKE, Barrier, CargoBike, CrewWorker, DoorFlag, FLATBED, FlagArt, FlagCrate, Flatbed, HOLD_HAND, HeldSpot, HeldTruss, LIFT_CRATE,
  LampFlag, LiftTruck, STAGE, StageFloor, StageFrame, StageSpots, VAN_LADDER, Van, liftRest, type CrewPose,
} from './install-sprites';
import { CarriedCounter, HeldRoll, StandAwning, StandCounter } from './music-sprites';
import { MusicStreet, type StreetNode } from './music-street';
import { StageBand, StageBeams } from './stage-band';
import { LadderSprite } from './shop-sprites';

// Calque des décors de fête et des équipes qui les posent (spec §7, tâche 10). Tout est une fonction de la date et de la minute
// (moteur pur city/install.ts) : rendu à la minute par React, les déplacements entre deux minutes glissent par une transition
// CSS (comme l'équipe du chantier d'enseigne). Quatre parties : `back` (contre les façades, avant les passants : drapeaux
// d'entrée), `crew` (après les passants : scène et musiciens, équipes à l'échelle et porteurs — un passant passe toujours
// derrière une équipe ou la scène), `front` (après les lampadaires : drapeaux de lampadaires, barrières du défilé,
// camionnettes, camions élévateurs et leur équipe) et `street` (sur la chaussée de la rue privatisée de la Fête de la musique :
// barrières en travers, stands de bière, leurs équipes, serveurs, clients et foule, triés par profondeur, music-street.tsx).
// Mouvement réduit : seuls les décors posés (phase `present`), aucune équipe ni véhicule.
// Les décors sont ENTREPOSÉS dans un véhicule de transport (`set.transport`, spec §7.2) : camionnette (barrières, échelle),
// vélo porteur (drapeaux d'entrée et échelle, un seul ouvrier), camion plateau (scène, stands de bière) ou plateau du camion
// élévateur (drapeaux de lampadaires). Le véhicule arrive chargé en roulant depuis le bord du monde, se gare, on y prend chaque
// élément à la pose ; à la dépose, chaque élément y est rangé avant qu'il reparte (city/van.ts). Aucun humain n'apparaît ni ne
// disparaît sur place : les ouvriers à pied descendent du véhicule (portière arrière, cabine du camion plateau, selle du vélo)
// et y remontent ; ceux du camion élévateur sortent de sa cabine et y rentrent. Rien n'apparaît ni ne disparaît dans les mains :
// pour chaque élément, l'équipe à pied va à l'arrière du véhicule, en sort l'objet (barrière, planche, comptoir) ou prend
// l'échelle, le porte jusqu'à sa place, puis revient ; à la dépose, elle rapporte l'objet et le range. Un élément entreposé
// est marqué `data-stored-item` (`set/item`, `data-carried` = `van` | `bike` | `truck` | `lift`), un élément porté
// `data-load-item` ; un objet porté (`data-carried-item`, `data-ladder`) porte `data-carried` : `hands` (tenu), `held`
// (échelle dressée, tenue en bas), `van` | `bike` | `truck` | `lift` (encore à moitié dans le véhicule).
// Les travailleurs portent `data-worker` : le plafond global des figurants (shopSpriteBudget) les compte.

export type InstallPart = 'back' | 'crew' | 'front' | 'street' | 'all';
type Layer = 'back' | 'crew' | 'front' | 'street';
// `ghibli` : graphisme Ghibli (musiciens, serveurs, clients et foule de la Fête de la musique au pantin).
type Props = { width: number; height: number; seed: number; sky: Sky; still: boolean; date: YMD; minutes: number; metrics: CityMetrics; rainy: boolean; lights?: boolean; part?: InstallPart; ghibli?: boolean };

type Pt = { x: number; y: number };
// `depth` : pour la partie `street`, profondeur (unités sous le bord du trottoir) qui ordonne le dessin.
type Drawn = { part: Layer; node: ReactElement; under?: boolean; depth?: number };

const MOVE = 'transform 30s linear';
// La camionnette roule d'un rendu à la minute au suivant sans à-coups.
const VAN_MOVE = 'transform 60s linear';
// Hors champ : le camion élévateur vient du bord du monde le plus proche et y repart, carrosserie et nacelle repliée
// entièrement hors du cadre.
const liftOff = (u: number): number => Math.max(70, 40 * u + 20);
const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;
const sgn = (d: number, fallback: 1 | -1 = 1): 1 | -1 => (d > 0 ? 1 : d < 0 ? -1 : fallback);
const mid = (a: number, b: number): number => (a + b) / 2;

// Ordre d'intervention (même tri que le moteur : u ou removeU, puis id).
const orderOf = (set: DecorSet, removing: boolean): DecorItem[] => {
  const key = (i: DecorItem): number => (removing ? i.removeU : i.u);
  return [...set.items].sort((a, b) => key(a) - key(b) || (a.id < b.id ? -1 : 1));
};

const hasCrewOnFoot = (set: DecorSet): boolean => set.items.some((i) => itemEquipment(set, i) !== 'lift');
const hasLadder = (set: DecorSet): boolean => set.items.some((i) => itemEquipment(set, i) === 'ladder');
// Jeux posés sur la chaussée de la rue privatisée : leurs décors et leurs équipes sont dessinés dans la partie `street`.
const STREET_SETS: ReadonlySet<string> = new Set(['beer-stands-music', 'barriers-music']);
const onStreet = (set: DecorSet): boolean => STREET_SETS.has(set.id);

// ---------- Véhicules de transport (camionnette, vélo porteur, camion plateau) ----------
// Échelle : camionnette 1,4 fois celle des véhicules (≈ 1,3 fois la hauteur d'un ouvrier), vélo porteur 1 fois, camion plateau
// 1,1 fois. En unités du sprite : `half` demi-longueur, `door` arrière (où l'on prend et range les objets), `cab` endroit où
// l'on monte et descend (centre de la caisse fermée, cabine, selle), `ladder` centre de l'échelle rangée.
const VAN_GROW = 1.4;
const VAN_HALF = 28;
type Spec = { grow: number; half: number; door: number; cab: number; ladder: { x: number; y: number } };
const SPEC: Readonly<Record<VehicleKind, Spec>> = {
  van: { grow: VAN_GROW, half: VAN_HALF, door: 22, cab: 0, ladder: VAN_LADDER },
  'cargo-bike': { grow: 1, half: BIKE.half, door: BIKE.door, cab: BIKE.saddle, ladder: BIKE.ladder },
  truck: { grow: 1.1, half: FLATBED.half, door: FLATBED.door, cab: FLATBED.cab, ladder: FLATBED.ladder },
};
// Véhicule de l'équipe à pied d'un jeu (les drapeaux de lampadaires n'en ont pas : ils voyagent sur le camion élévateur).
const kindOf = (set: DecorSet): VehicleKind => (set.transport === 'lift' ? 'van' : set.transport);
const vehK = (kind: VehicleKind, u: number): number => u * STREET_SCALE.vehicle * SPEC[kind].grow;
const vehHalf = (kind: VehicleKind, u: number): number => SPEC[kind].half * vehK(kind, u);
// `data-carried` d'un objet encore (à moitié) dans son véhicule, et des éléments qui y sont entreposés.
const TAG: Readonly<Record<Transport, string>> = { van: 'van', 'cargo-bike': 'bike', truck: 'truck', lift: 'lift' };
// Demi-longueur du camion élévateur (unités du sprite). Écart minimal entre le centre d'un véhicule garé et le point de travail
// d'un camion élévateur : les deux carrosseries plus 8 px si la rue le permet, et jamais moins de 60 px.
const LIFT_HALF = 32;
const vanClear = (u: number, half: number): number => Math.max(60, half + LIFT_HALF * u * STREET_SCALE.vehicle + 8 * u);
const LIFT_MIN = 60;
// Distance (unités) sur laquelle la camionnette se range contre le trottoir depuis la file de circulation la plus proche.
const VAN_PULL = 70;
// Hors champ : la carrosserie entière plus une marge.
const vanOff = (half: number, u: number): number => half + 20 * u;
// Trottoir au bord de la rue : là où les ouvriers descendent du véhicule et y remontent (derrière sa carrosserie).
const vanY = (m: CityMetrics): number => m.curb - 2 * m.unit;
// Fête de la musique : plusieurs véhicules le même jour (scènes, stands, barrières), parfois en même temps. Ils roulent le
// long du trottoir (la route est fermée, les barrières laissent ce passage) chacun dans sa rangée, décalés de VAN_ROW unités
// en profondeur : l'un passe devant l'autre, jamais à travers ; garés, ils ne se recouvrent pas.
const VAN_ROW = 2.5;
const VAN_ROWS = 4;
const vanBaseY = (m: CityMetrics, row: number): number => m.curb + (1.5 + row * VAN_ROW) * m.unit;
// Arrière du véhicule garé, au sol : sur le trottoir (équipes du trottoir) ou au niveau des roues (équipes de la chaussée).
function homePt(g: VanGeom | null, item: DecorItem, m: CityMetrics, street: boolean): Pt {
  if (!g) return { x: item.x, y: vanY(m) };
  return { x: g.park - g.dir * (g.half + HOME_GAP * m.unit), y: street ? g.baseY : vanY(m) };
}
// Ouvriers à pied : à l'arrière du véhicule garé, juste après sa carrosserie (ils y prennent et y rangent les objets).
const HOME_GAP = 5;
// Chaussée : couloir de marche des équipes de la rue privatisée (devant les comptoirs, derrière les barrières de la file proche).
const AISLE = 30;
// Part d'un trajet passée à l'arrière du véhicule, à sortir l'objet (ou l'échelle) ou à le ranger.
const FETCH = 0.25;

// Géométrie du véhicule garé, pour l'équipe à pied : type, centre, sens, bas des roues, échelle, demi-longueur.
type VanGeom = { kind: VehicleKind; park: number; dir: 1 | -1; baseY: number; k: number; half: number };

// Place du véhicule (centre, px du monde) : à côté de la scène, sinon tirée de la graine ; puis décalée pas à pas jusqu'à ne
// masquer le pied d'aucun lampadaire, ni une scène, ni une barrière posée, à 60 px au moins des places où un camion élévateur
// travaille. Si la rue le permet, aussi : loin des autres véhicules du jour (`taken`), d'aucun stand de bière (fûts compris :
// sur la chaussée, devant le véhicule rangé contre le trottoir), et à l'écart des camions élévateurs de deux carrosseries.
function vanX(
  set: DecorSet, width: number, seed: number, lamps: readonly Lamp[], m: CityMetrics, works: readonly number[],
  taken: readonly { x: number; half: number }[], stands: readonly number[], stages: readonly number[],
): number {
  const u = m.unit;
  const half = vehHalf(kindOf(set), u);
  const stage = set.items.find((i) => i.kind === 'stage-floor');
  const base = stage ? stage.x + (STAGE.half + 6) * u + half : Math.round(60 + mulberry32(seed ^ hashString(`${set.id}-van`))() * Math.max(0, width - 120));
  const own = set.items.filter((i) => itemEquipment(set, i) === 'lift').flatMap((i) => [liftPark(i, 1, m), liftPark(i, -1, m)]);
  const barriers = set.items.filter((i) => i.kind === 'barrier').map((i) => barrierX(i.x, lamps, u));
  const free = (x: number): boolean =>
    x >= half + 2 && x <= width - half - 2
    && lamps.every((l) => Math.abs(l.x - x) >= half + 3 * u)
    && barriers.every((b) => Math.abs(b - x) >= half + barrierClear(u))
    && stages.every((st) => Math.abs(x - st) >= (STAGE.half + 4) * u + half)
    && own.every((w) => Math.abs(w - x) >= vanClear(u, half))
    && works.every((w) => Math.abs(w - x) >= LIFT_MIN);
  const apart = (x: number): boolean => taken.every((p) => Math.abs(p.x - x) >= half + p.half + 6 * u);
  const offStands = (x: number): boolean => stands.every((st) => Math.abs(st - x) >= half + (COUNTER_HALF + 16) * u);
  const wide = (x: number): boolean => works.every((w) => Math.abs(w - x) >= vanClear(u, half));
  // Du plus exigeant au moins exigeant : une place qui respecte tout, sinon on renonce d'abord à l'écart large des camions
  // élévateurs, puis aux stands, enfin aux autres véhicules (rangés dans une autre rangée : l'un passe devant l'autre).
  const tiers: ((x: number) => boolean)[] = [(x) => apart(x) && offStands(x) && wide(x), (x) => apart(x) && offStands(x), apart, () => true];
  for (const ok of tiers) {
    for (let k = 0; k * 4 * u < width; k++) {
      for (const s of [1, -1]) {
        const x = base + s * k * 4 * u;
        if (free(x) && ok(x)) return x;
      }
    }
  }
  return base;
}

// Places de travail de tous les camions élévateurs des jeux du jour (les deux sens d'arrivée).
const liftWorks = (sets: readonly DecorSet[], m: CityMetrics): number[] =>
  sets.flatMap((s) => s.items.filter((i) => itemEquipment(s, i) === 'lift').flatMap((i) => [liftPark(i, 1, m), liftPark(i, -1, m)]));

// Visite du véhicule pour la fenêtre de montage (ou de démontage) d'un jeu à équipe à pied, sinon null. Le camion plateau reste
// garé toute la fenêtre (le camion élévateur y prend encore des pièces). Fête de la musique : on longe le trottoir (pas de file
// de circulation : route fermée). Le vélo porteur roule le long du trottoir.
function visitOf(set: DecorSet, removing: boolean, park: number, width: number, m: CityMetrics): VanVisit | null {
  const fw = footWindow(set, removing);
  if (!fw) return null;
  const u = m.unit;
  const kind = kindOf(set);
  const half = vehHalf(kind, u);
  return vanVisit({
    park, width, offstage: vanOff(half, u), first: fw.first, last: fw.last, speed: TRANSPORT_SPEED[kind] * u, door: SPEC[kind].door * vehK(kind, u),
    pull: kind === 'van' && set.fest !== 'music' ? VAN_PULL * u : 0, hold: kind === 'truck' ? setWindow(set, removing) : null,
  });
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
// Rue privatisée : barrière EN TRAVERS d'une file, vue de biais (elle s'étend en profondeur sur ~26 unités). Centre (unités) :
// file du fond de 10 à 36, file proche de 36 à 61 ; le passage le long du trottoir (0 à 10) reste libre pour les camionnettes.
export const LANE_BARRIER_DEPTH = { far: 23, near: 48.5 } as const;
export const laneBarrierY = (m: CityMetrics, lane: 'far' | 'near'): number => m.curb + LANE_BARRIER_DEPTH[lane] * m.unit;
// `tilt` : 0 = de face (portée), 1 = en travers (posée).
const barrierMatrix = (u: number, tilt: number): string => {
  const k = barrierK(u);
  return `matrix(${lerp(k, 0.3 * k, tilt).toFixed(3)} ${lerp(0, 0.72 * k, tilt).toFixed(3)} 0 ${k.toFixed(3)} 0 0)`;
};

// ---------- Stands de bière ----------
// Comptoir (devant à STAND_DEPTH) ; l'auvent est dessiné derrière les serveurs (ses poteaux du fond sont à STAND_DEPTH − 8).
const AWNING_DEPTH = STAND_DEPTH - 10;
const standBase = (m: CityMetrics): number => m.curb + STAND_DEPTH * m.unit;

export function InstallLayer({ width, height, seed, sky, still, date, minutes, metrics, rainy, lights = false, part = 'all', ghibli = false }: Props): ReactElement {
  const dayKey = `${date.y}-${date.m}-${date.d}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sets = useMemo(() => decorSetsFor(date, width, height, seed), [dayKey, width, height, seed]);
  const doors = useMemo(() => new Map(doorsFor(width, height, seed).map((d) => [d.id, d] as const)), [width, height, seed]);
  const lamps = useMemo(() => lampsFor(width, seed), [width, seed]);
  const standSide = useMemo(() => new Map(beerStandsFor(width, height, seed).map((s) => [s.id, s.side] as const)), [width, height, seed]);
  const outfits = useMemo(
    () => new Map(sets.map((s) => [s.id, [0, 1].map((i) => outfitFor('worker', mulberry32(seed ^ hashString(`${s.id}-crew-${i}`))))] as const)),
    [sets, seed],
  );
  // Un trio par scène, chacun avec ses tenues (la première scène garde celles d'avant : `stage-band-i`).
  const bandOutfits = useMemo(
    () => new Map(sets.filter((s) => s.id.startsWith('stage-music')).map((s) => [
      s.id,
      [0, 1, 2].map((i) => outfitFor('ordinary', mulberry32(seed ^ hashString(s.id === 'stage-music-0' ? `stage-band-${i}` : `stage-band-${s.id}-${i}`)))),
    ] as const)),
    [sets, seed],
  );
  const abs = absMinute(dayNumber(date), minutes);
  const dark = sky.daylight < DARK;
  const u = metrics.unit;
  const drawn: Drawn[] = [];
  const works = liftWorks(sets, metrics);
  const parks = new Map<string, number>();
  const standXs = [...standSide.keys()].length > 0 ? beerStandsFor(width, height, seed).map((st) => st.x) : [];
  // Scènes du jour (jamais de véhicule garé dessus).
  const stageXsOfDay = sets.flatMap((s) => s.items.filter((i) => i.kind === 'stage-floor').map((i) => i.x));
  for (const s of sets.filter(hasCrewOnFoot)) {
    const taken = [...parks].map(([id, x]) => ({ x, half: vehHalf(kindOf(sets.find((o) => o.id === id)!), u) }));
    parks.set(s.id, vanX(s, width, seed, lamps, metrics, works, taken, s.fest === 'music' ? standXs : [], s.fest === 'music' ? stageXsOfDay : []));
  }
  // Rangées des véhicules de la Fête de la musique (une par jeu, dans l'ordre des jeux).
  const rows = new Map(sets.filter((s) => s.fest === 'music' && hasCrewOnFoot(s)).map((s, i) => [s.id, i % VAN_ROWS] as const));
  const visit = (set: DecorSet, removing: boolean): VanVisit | null => (parks.has(set.id) ? visitOf(set, removing, parks.get(set.id)!, width, metrics) : null);
  const geomOf = (set: DecorSet, removing: boolean): VanGeom | null => {
    const v = visit(set, removing);
    const kind = kindOf(set);
    return v ? { kind, park: v.park, dir: v.dir, baseY: vanBaseY(metrics, rows.get(set.id) ?? 0), k: vehK(kind, u), half: vehHalf(kind, u) } : null;
  };
  const homeOf = (g: VanGeom | null, item: DecorItem, street: boolean): Pt => homePt(g, item, metrics, street);

  // Équipes à l'œuvre (aucune en mouvement réduit).
  const crews: CrewInput[] = still
    ? []
    : sets.flatMap((set) => {
      const c = crewAt(set, abs, set.day);
      if (!c) return [];
      const item = set.items.find((i) => i.id === c.itemId)!;
      const w = crewStepWindow(set, abs, set.day)!;
      const van = geomOf(set, c.removing);
      return [{
        set, item, step: c.step, progress: c.progress, removing: c.removing, width, seed, metrics, sky, rainy, outfits: outfits.get(set.id)!, doors, lamps,
        abs, stepFrom: w.from, stepTo: w.to, home: homeOf(van, item, onStreet(set)), van, street: onStreet(set), standSide, ghibli, lights,
      }];
    });
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
      const d = decorNode(set, item, ph.phase, doors.get(item.id), metrics, sky, still, lamps, lit, standSide);
      if (d) drawn.push(d);
    }
    if (set.id.startsWith('stage-music')) drawn.push(...stageShow(set, abs, dark, bandOutfits.get(set.id)!, metrics, sky, rainy, still, width, ghibli));
    if (still) continue;
    // Véhicule de transport de l'équipe à pied (camionnette, vélo porteur, camion plateau) : il arrive chargé en roulant, se
    // gare au bord de la rue avant le premier créneau et repart en roulant après le dernier (city/van.ts), une fois tout rangé.
    // Il ne s'efface jamais : un camion élévateur qui passe (ou se gare tout près, si la rue est trop courte pour l'éviter) est
    // dessiné devant lui.
    const inp = crews.find((c) => c.set === set);
    let boarding: Drawn | null = null;
    if (hasCrewOnFoot(set)) {
      const crew = crewAt(set, abs, set.day);
      const kind = kindOf(set);
      const k = vehK(kind, u);
      const half = vehHalf(kind, u);
      const row = rows.get(set.id) ?? 0;
      // L'échelle est sur le véhicule tant que l'équipe ne la tient pas (elle l'y prend et l'y range : ladderCrew).
      const ladderOnRoof = hasLadder(set) && !(crew && inp && itemEquipment(inp.set, inp.item) === 'ladder');
      // Éléments entreposés dans le véhicule à cet instant (pris à la pose, rangés à la dépose).
      const stored = set.items.filter((i) => inVehicle(set, i, abs));
      for (const removing of [false, true]) {
        const v = visit(set, removing);
        const st = v && vanAt(v, abs);
        if (!v || !st) continue;
        // Ouvriers qui descendent du véhicule ou y remontent (juste avant le premier créneau, juste après le dernier ; le camion
        // élévateur du même jeu peut être à l'œuvre en même temps).
        const vc = vanCrewAt(v, abs);
        if ((!inp || itemEquipment(inp.set, inp.item) === 'lift') && (vc.phase === 'alight' || vc.phase === 'board')) {
          const van = geomOf(set, removing);
          boarding = vanCrewNode({ set, removing, visit: v, boarding: vc.phase === 'board', q: vc.q, abs, width, seed, metrics, sky, rainy, outfits: outfits.get(set.id)!, doors, lamps, van, street: onStreet(set), standSide, home: { x: 0, y: 0 }, ghibli });
        }
        // Portière (hayon) ouverte : à la descente et à la remontée, et quand un ouvrier sort ou range un objet à l'arrière.
        const open = st.door || (!!inp && inp.removing === removing && st.phase === 'parked' && atVan(inp));
        // Rangé (ou presque) : sous les camions élévateurs et les barrières ; dans la file : devant eux.
        const y = lerp(vanBaseY(metrics, row), metrics.laneY.far, st.lane);
        const ids = stored.map((i) => `${set.id}/${i.id}`);
        // Vélo porteur : l'ouvrier est en selle tant qu'il n'en est pas descendu.
        const rider = vc.phase === 'inside' ? outfits.get(set.id)![0]! : null;
        // Ghibli (V5) : camionnette et camion plateau peints, roues tournées par la transition du véhicule ; conducteur à
        // bord tant que l'équipe n'est pas descendue.
        const gh = ghibli && kind !== 'cargo-bike' ? { rainy, dir: st.dir, k, worldX: st.x, move: VAN_MOVE, occupied: vc.phase === 'inside', still } : undefined;
        const art = kind === 'cargo-bike'
          ? <CargoBike sky={sky} lights={lights} ladder={ladderOnRoof} flags={ids} rider={rider} ghibli={ghibli ? { rainy, dir: st.dir, phase: crankPhase(Math.abs(st.x) / k) } : undefined} />
          : kind === 'truck'
            ? <Flatbed sky={sky} lights={lights} open={open} ladder={ladderOnRoof} load={stored.map((i) => ({ id: `${set.id}/${i.id}`, kind: i.kind }))} ghibli={gh} />
            : <Van sky={sky} lights={lights} ladder={ladderOnRoof} open={open} stored={ids} ghibli={gh} />;
        drawn.push({
          part: 'front',
          under: st.lane < 0.5,
          node: (
            <g
              key={`${set.id}-van-${removing ? 'out' : 'in'}`}
              data-install-van={set.id}
              data-transport={kind}
              data-x={st.x.toFixed(1)}
              data-half={half.toFixed(1)}
              data-door-x={v.door.toFixed(1)}
              data-van-phase={st.phase}
              data-van-lane={st.lane.toFixed(2)}
              data-van-row={row}
              style={{ transform: `translate(${st.x.toFixed(1)}px, ${y.toFixed(1)}px)`, transition: VAN_MOVE }}
            >
              {gh ? art : <g transform={`scale(${(st.dir * k).toFixed(3)} ${k.toFixed(3)})`}>{art}</g>}
            </g>
          ),
        });
      }
    }
    // Équipe à l'œuvre, ou qui descend de la camionnette / y remonte (même clé : elle glisse d'un état à l'autre).
    if (inp) drawn.push(...crewNodes(inp));
    if (boarding) drawn.push(boarding);
  }

  // Les camionnettes d'abord : un camion élévateur passe toujours devant elles.
  const pick = (p: Layer): ReactNode[] => [...drawn.filter((d) => d.part === p && d.under), ...drawn.filter((d) => d.part === p && !d.under)].map((d) => d.node);
  const want = (p: Layer): boolean => part === 'all' || part === p;
  const street: StreetNode[] = drawn.filter((d) => d.part === 'street').map((d) => ({ depth: d.depth ?? 0, node: d.node }));
  return (
    <>
      {want('back') && <g data-install-part="back">{pick('back')}</g>}
      {want('crew') && <g data-install-part="crew">{pick('crew')}</g>}
      {want('front') && <g data-install-part="front">{pick('front')}</g>}
      {want('street') && (
        <g data-install-part="street">
          <MusicStreet width={width} height={height} seed={seed} sky={sky} still={still} rainy={rainy} date={date} minutes={minutes} metrics={metrics} extra={street} ghibli={ghibli} />
        </g>
      )}
    </>
  );
}

// ---------- Décors ----------
const entranceTransform = (door: Door, m: CityMetrics): string =>
  `translate(${entranceLeft(door.x, m.unit).toFixed(1)} ${m.doorY.toFixed(1)}) scale(${(m.unit * STREET_SCALE.entranceX).toFixed(3)} ${(m.unit * STREET_SCALE.entranceY).toFixed(3)})`;
const lampTransform = (x: number, m: CityMetrics): string => `translate(${x} ${m.curb.toFixed(1)}) scale(${(m.unit * STREET_SCALE.lamp).toFixed(3)})`;
// Base de la scène : sur le trottoir, son bord avant au bord du trottoir.
const stageBase = (m: CityMetrics): number => m.curb - m.unit;

function decorNode(
  set: DecorSet, item: DecorItem, phase: string, door: Door | undefined, m: CityMetrics, sky: Sky, still: boolean, lamps: readonly Lamp[], lit: boolean,
  standSide: ReadonlyMap<string, 1 | -1>,
): Drawn | null {
  const attrs = { 'data-decor-item': item.id, 'data-decor-kind': item.kind, 'data-decor-set': set.id, 'data-decor-phase': phase };
  const key = `${set.id}-${item.id}`;
  switch (item.kind) {
    case 'lamp-flag':
      return { part: 'front', node: <g key={key} {...attrs} transform={lampTransform(item.x, m)}><LampFlag sky={sky} still={still} /></g> };
    case 'door-flag':
      if (!door) return null;
      return { part: 'back', node: <g key={key} {...attrs} transform={entranceTransform(door, m)}><DoorFlag sky={sky} /></g> };
    case 'barrier': {
      if (item.lane) {
        // En travers de la file : dans la partie `street`, à sa profondeur.
        const y = laneBarrierY(m, item.lane);
        return {
          part: 'street',
          depth: LANE_BARRIER_DEPTH[item.lane],
          node: <g key={key} {...attrs} data-barrier-lane={item.lane} data-x={item.x.toFixed(1)} transform={`translate(${item.x.toFixed(1)} ${y.toFixed(1)}) ${barrierMatrix(m.unit, 1)}`}><Barrier sky={sky} /></g>,
        };
      }
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
    case 'stand-counter':
    case 'stand-awning': {
      // Stands de bière : sur la chaussée ; l'auvent derrière les serveurs, le comptoir devant eux.
      const t = `translate(${item.x.toFixed(1)} ${standBase(m).toFixed(1)}) scale(${m.unit.toFixed(3)})`;
      if (item.kind === 'stand-awning') return { part: 'street', depth: AWNING_DEPTH, node: <g key={key} {...attrs} transform={t}><StandAwning sky={sky} /></g> };
      return {
        part: 'street',
        depth: STAND_DEPTH,
        node: <g key={key} {...attrs} data-beer-stand={item.group} transform={t}><StandCounter sky={sky} side={standSide.get(item.group ?? '') ?? 1} /></g>,
      };
    }
    default: {
      const never: never = item.kind;
      return never;
    }
  }
}

// Musiciens (plancher posé) : ils arrivent à pied de 16 h 46 à 17 h, jouent jusqu'à minuit et repartent à pied de 0 h 01 à
// 0 h 15 (stage-band.tsx) ; aucun n'apparaît ni ne disparaît sur place. Faisceaux (projecteurs posés, nuit, 17 h à minuit :
// les trois musiciens sont alors en place, jamais une scène vide éclairée). La nuit, les projecteurs éclairent les musiciens.
const BAND_FROM = 17 * 60;
const BAND_WINDOW: readonly [number, number] = [16 * 60 + 45, 24 * 60 + 20];
function stageShow(set: DecorSet, abs: number, dark: boolean, outfits: Outfit[], m: CityMetrics, sky: Sky, rainy: boolean, still: boolean, width: number, ghibli: boolean): Drawn[] {
  const floor = set.items.find((i) => i.kind === 'stage-floor');
  const spots = set.items.find((i) => i.kind === 'stage-spots');
  if (!floor || !spots) return [];
  if (abs < absMinute(set.day, BAND_WINDOW[0]) || abs >= absMinute(set.day, BAND_WINDOW[1])) return [];
  const fp = itemPhase(set, floor, abs, set.day);
  const sp = itemPhase(set, spots, abs, set.day);
  const t = `translate(${floor.x.toFixed(1)} ${stageBase(m).toFixed(1)}) scale(${m.unit.toFixed(3)})`;
  const playing = abs >= absMinute(set.day, BAND_FROM) && abs < absMinute(set.day + 1, 0);
  const lit = sp.phase === 'present' && dark && playing;
  const out: Drawn[] = [];
  if (lit) out.push({ part: 'crew', node: <g key={`${set.id}-beams`} transform={t}><StageBeams still={still} /></g> });
  if (still ? fp.phase === 'present' : itemShown(set, floor, fp)) {
    const day = Math.floor(abs / 1440);
    out.push({
      part: 'crew',
      node: (
        <StageBand
          key={`${set.id}-band`}
          stageId={set.id}
          stageX={floor.x}
          base={stageBase(m)}
          unit={m.unit}
          width={width}
          minutes={abs - day * 1440}
          dayOffset={day - set.day}
          outfits={outfits}
          sky={sky}
          rainy={rainy}
          still={still}
          lit={lit}
          ghibli={ghibli}
        />
      ),
    });
  }
  return out;
}

// ---------- Équipes ----------
type CrewInput = {
  set: DecorSet; item: DecorItem; step: string; progress: number; removing: boolean; width: number; seed: number;
  metrics: CityMetrics; sky: Sky; rainy: boolean; outfits: Outfit[]; doors: Map<string, Door>; lamps: readonly Lamp[];
  // Minute absolue et bornes de l'étape en cours ; `home` : arrière de la camionnette garée (base de l'équipe à pied) ;
  // `van` : sa géométrie ; `street` : équipe de la chaussée (partie `street`) ; `standSide` : côté de la file de chaque stand ;
  // `ghibli` : ouvriers au pantin (gilet), objets tenus aux accroches des mains.
  abs: number; stepFrom: number; stepTo: number; home: Pt; van: VanGeom | null; street: boolean; standSide: ReadonlyMap<string, 1 | -1>; ghibli: boolean; lights?: boolean;
};

// Itinéraire du camion élévateur : les éléments qu'il pose, dans l'ordre d'intervention. Un élément se rejoint depuis le milieu
// du chemin qui le sépare du précédent (ou depuis le bord du monde) et se quitte vers le milieu du chemin vers le suivant : d'un
// créneau à l'autre, le camion ne saute pas.
type Route = { from: number; to: number; fromHome: boolean; toHome: boolean };
function route(inp: CrewInput, anchor: (i: DecorItem) => number, home: (i: DecorItem) => number): Route {
  const lift = itemEquipment(inp.set, inp.item) === 'lift';
  const list = orderOf(inp.set, inp.removing).filter((i) => (itemEquipment(inp.set, i) === 'lift') === lift);
  const k = list.findIndex((i) => i.id === inp.item.id);
  const here = anchor(inp.item);
  const prev = list[k - 1];
  const next = list[k + 1];
  return { from: prev ? mid(anchor(prev), here) : home(inp.item), to: next ? mid(here, anchor(next)) : home(inp.item), fromHome: !prev, toHome: !next };
}

// Équipe à pied : chaque élément est un aller-retour depuis l'arrière de la camionnette (`home`). À l'aller, l'objet est sorti
// de la camionnette (ou l'échelle descendue de la galerie) pendant la première part FETCH du trajet ; au retour, il y est rangé
// pendant la dernière part. `withLoad` : l'objet voyage dans ce sens. `k` : 0 = dans la camionnette, 1 = dans les mains ;
// `q` : avancée (0 à 1) sur le chemin à pied.
type Stage = { atVan: boolean; k: number; q: number };
function tripStage(step: string, p: number, withLoad: boolean): Stage {
  if (step === 'arrive') {
    if (withLoad && p < FETCH) return { atVan: true, k: p / FETCH, q: 0 };
    return { atVan: false, k: 1, q: withLoad ? (p - FETCH) / (1 - FETCH) : p };
  }
  if (withLoad && p > 1 - FETCH) return { atVan: true, k: (1 - p) / FETCH, q: 1 };
  return { atVan: false, k: 1, q: withLoad ? p / (1 - FETCH) : p };
}
// L'équipe est-elle à l'arrière de la camionnette, à y prendre ou y ranger un objet (portière ouverte) ?
function atVan(inp: CrewInput): boolean {
  const eq = itemEquipment(inp.set, inp.item);
  if (eq === 'lift' || (inp.step !== 'arrive' && inp.step !== 'leave')) return false;
  const withLoad = eq === 'ladder' || (inp.step === 'arrive' ? !inp.removing : inp.removing);
  return tripStage(inp.step, inp.progress, withLoad).atVan;
}
// Chemin à pied de la camionnette au point de travail. Sur la chaussée : on descend du trottoir jusqu'au couloir AISLE (devant
// les camionnettes et les comptoirs), on le longe, puis on rejoint sa place.
// `startX` : départ (et retour) à l'arrière de la camionnette, décalé pour que les deux porteurs et leur charge restent
// derrière la carrosserie, jamais dessus.
function footPath(inp: CrewInput, work: Pt, startX = inp.home.x): Pt[] {
  const start = { x: startX, y: inp.home.y };
  if (!inp.street) return [start, work];
  const aisle = inp.metrics.curb + AISLE * inp.metrics.unit;
  return [start, { x: startX, y: aisle }, { x: work.x, y: aisle }, work];
}
function walkAt(path: readonly Pt[], q: number, fallback: 1 | -1): Pt & { dir: 1 | -1 } {
  const pts = path.map((p) => ({ x: p.x, d: p.y }));
  const dist = Math.min(1, Math.max(0, q)) * pathLength(pts, 1);
  const at = pathAt(pts, dist, 1);
  return { x: at.x, y: at.d, dir: pathDir(pts, dist, 1, fallback) };
}
// Profondeur de dessin d'une équipe de la chaussée : devant son couloir et sa place.
const streetDepth = (item: DecorItem): number => Math.max(AISLE, item.lane ? LANE_BARRIER_DEPTH[item.lane] : STAND_DEPTH + 3) + 0.5;

// Équipe à pied : les deux ouvriers (un seul pour le vélo porteur : `b` null), plus ce qui est dessiné derrière eux (échelle)
// et devant eux (charge portée). Même structure pour l'équipe qui descend du véhicule : React garde les mêmes nœuds et la
// transition les fait glisser.
type FootCrew = { back: ReactNode; a: Worker; b: Worker | null; front: ReactNode };

function crewNodes(inp: CrewInput): Drawn[] {
  const eq = itemEquipment(inp.set, inp.item);
  const attrs = {
    'data-crew': inp.set.id,
    'data-crew-item': inp.item.id,
    'data-equipment': eq,
    'data-high': inp.item.high ? 'true' : 'false',
    'data-removing': inp.removing ? 'true' : 'false',
    'data-step': inp.step,
    'data-at-van': atVan(inp) ? 'true' : undefined,
  };
  if (eq === 'lift') return [{ part: 'front', node: <g key={`${inp.set.id}-crew`} {...attrs}>{liftCrew(inp)}</g> }];
  const c = eq === 'ladder' ? ladderCrew(inp) : handCrew(inp);
  const node = <g key={`${inp.set.id}-crew`} {...attrs}>{footNodes(c, inp)}</g>;
  return [inp.street ? { part: 'street', depth: streetDepth(inp.item), node } : { part: 'crew', node }];
}

const footNodes = (c: FootCrew, inp: Pick<CrewInput, 'outfits' | 'sky' | 'rainy' | 'metrics' | 'ghibli'>): ReactNode => {
  const k = inp.metrics.unit * STREET_SCALE.person;
  return (
    <>
      {c.back}
      {c.b && <WorkerNode w={c.b} outfit={inp.outfits[1]!} inp={inp} k={k} id="b" />}
      <WorkerNode w={c.a} outfit={inp.outfits[0]!} inp={inp} k={k} id="a" />
      {c.front}
    </>
  );
};

// Ouvriers qui descendent du véhicule (du centre de la caisse de la camionnette, de la cabine du camion plateau, où ils sont
// cachés, ou de la selle du vélo porteur, jusqu'à leur place au début du premier créneau) ou y remontent (de leur place à la
// fin du dernier créneau jusque-là). Positions de départ et d'arrivée tirées de la géométrie même de l'équipe : aucun saut au
// passage. Toujours dans la partie `crew` (avant le véhicule, qui les cache).
type BoardInput = Omit<CrewInput, 'item' | 'step' | 'progress' | 'stepFrom' | 'stepTo'> & { visit: VanVisit; boarding: boolean; q: number };
function vanCrewNode(b: BoardInput): Drawn | null {
  const foot = orderOf(b.set, b.removing).filter((i) => itemEquipment(b.set, i) !== 'lift');
  const item = b.boarding ? foot[foot.length - 1] : foot[0];
  if (!item) return null;
  const home = homePt(b.van, item, b.metrics, b.street);
  const inp: CrewInput = { ...b, item, step: b.boarding ? 'leave' : 'arrive', progress: b.boarding ? 1 : 0, stepFrom: b.abs, stepTo: b.abs, home };
  const eq = itemEquipment(b.set, item);
  const edge = eq === 'ladder' ? ladderCrew(inp) : handCrew(inp);
  const center = b.van ? b.visit.park + b.visit.dir * SPEC[b.van.kind].cab * b.van.k : b.visit.park;
  // Ils passent la plus grande part de la descente (de la remontée) cachés dans la carrosserie, puis gagnent l'arrière.
  const k = b.boarding ? Math.min(1, b.q / 0.6) : Math.max(0, (b.q - 0.4) / 0.6);
  const move = (w: Worker): Worker => {
    const x = b.boarding ? lerp(w.x, center, k) : lerp(center, w.x, k);
    const y = b.boarding ? lerp(w.y, vanY(b.metrics), k) : lerp(vanY(b.metrics), w.y, k);
    const dir = sgn(b.boarding ? center - w.x : w.x - center, w.dir);
    return { x, y, dir, pose: 'walk' };
  };
  const attrs = { 'data-crew': b.set.id, 'data-van-crew': b.boarding ? 'board' : 'alight', 'data-removing': b.removing ? 'true' : 'false' };
  return { part: 'crew', node: <g key={`${b.set.id}-crew`} {...attrs}>{footNodes({ back: null, a: move(edge.a), b: edge.b && move(edge.b), front: null }, b)}</g> };
}

// `held` : objet tenu (repère du passant en classique, du sprite à la main droite en Ghibli) ; `ladder` : sur l'échelle.
type Worker = { x: number; y: number; dir: 1 | -1; pose: CrewPose; held?: ReactNode; ladder?: boolean };

// Ghibli : allure et bras du pantin pour la pose du classique. Marche, port, poussée et traction de profil dans le sens de
// marche ; sur l'échelle de dos (escalade, objet posé bras au-dessus de la tête) ; debout de trois quarts. Jamais de miroir.
function crewLook(w: Pick<Worker, 'pose' | 'dir' | 'ladder'>): CrewLook {
  const yaw = facingYaw(w.dir);
  switch (w.pose) {
    case 'climb': return { yaw: YAW_BACK, gait: 'climb', arms: 'swing' };
    case 'reach': return w.ladder ? { yaw: YAW_BACK, gait: 'climb', arms: 'overhead' } : { yaw, gait: 'walk', arms: 'overhead' };
    case 'carry': return { yaw, gait: 'walk', arms: 'carry' };
    case 'hold': return { yaw, gait: 'walk', arms: 'hold' };
    case 'tow': return { yaw, gait: 'walk', arms: 'tow' };
    case 'walk': return { yaw, gait: 'walk', arms: 'swing' };
    default: return { yaw: w.dir > 0 ? 2 : 6, gait: 'stand', arms: 'swing' };
  }
}
const crewSig = (o: Outfit): string => signatureOf(shapeOf(o, false, 'vest'));
// Main droite (repère du sprite) d'un ouvrier Ghibli debout dans ce geste : la charge portée à deux s'y accroche (le
// balancement de la marche ne la fait pas bouger).
const restHand = (o: Outfit, w: Pick<Worker, 'pose' | 'dir' | 'ladder'>): readonly [number, number] => {
  const l = crewLook(w);
  return anchorsOf({ sig: crewSig(o), yaw: l.yaw, gait: 'stand', phase: 0, head: 0, arms: l.arms, lean: 0 }).handR;
};

// Ghibli : déplacement depuis le rendu précédent (transition CSS de 30 s entre deux minutes, comme le classique), lu par la
// boucle (collectWorkers / placeWorkers) : la marche et l'escalade avancent avec la distance parcourue. Orientation changée
// (demi-tour, arrivée à l'échelle, mise en place face à face) : la boucle la fait tourner à petits pas pendant les TURN_S
// premières secondes (`turnFrom`), au lieu d'un saut.
function useWorkerMove(w: Worker, k: number, ghibli: boolean): WorkerMove | null {
  const xs = w.x.toFixed(1);
  const ys = w.y.toFixed(1);
  const look = crewLook(w);
  const prev = useRef<{ x: number; y: number; yaw: number } | null>(null);
  const step = useMemo(
    () => {
      const p = prev.current;
      return { since: Date.now() / 1000, dist: p ? Math.hypot(w.x - p.x, w.y - p.y) : 0, turnFrom: p && p.yaw !== look.yaw ? p.yaw : undefined };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [xs, ys, look.yaw],
  );
  useLayoutEffect(() => {
    prev.current = { x: w.x, y: w.y, yaw: look.yaw };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xs, ys, look.yaw]);
  return ghibli ? { look, since: step.since, dist: step.dist, k, ...(step.turnFrom !== undefined ? { turnFrom: step.turnFrom } : {}) } : null;
}

function WorkerNode({ w, outfit, inp, k, id }: { w: Worker; outfit: Outfit; inp: Pick<CrewInput, 'sky' | 'rainy' | 'ghibli'>; k: number; id?: string }): ReactElement {
  const move = useWorkerMove(w, k, inp.ghibli);
  return (
    <g
      data-worker=""
      data-worker-k={id}
      data-pose={w.pose}
      {...(move ? { 'data-move': JSON.stringify(move) } : {})}
      style={{ transform: `translate(${w.x.toFixed(1)}px, ${w.y.toFixed(1)}px)`, transition: MOVE }}
    >
      {move ? (
        <g transform={`scale(${k.toFixed(3)})`}>
          <GhibliFigure outfit={outfit} sky={inp.sky} rainy={inp.rainy} umbrella={false} work="vest" initial={workerPose(move, move.since)} held={w.held ? [{ anchor: 'handR', node: w.held }] : undefined} />
        </g>
      ) : (
        <>
          <g transform={`scale(${(w.dir * k).toFixed(3)} ${k.toFixed(3)})`}>
            <CrewWorker outfit={outfit} sky={inp.sky} rainy={inp.rainy} pose={w.pose} />
          </g>
          {w.held}
        </>
      )}
    </g>
  );
}

// Élément porté (`set/item`) et d'où il vient : `hands` (tenu), ou le véhicule où il est encore à moitié.
const loadAttrs = (inp: Pick<CrewInput, 'set' | 'item'>, by: string): Record<string, string> => ({ 'data-load-item': `${inp.set.id}/${inp.item.id}`, 'data-carried': by });
// Objet tenu à la main, d'échelle `s` (unités du monde par unité du dessin, à unit = 1) : classique, à bout de bras dans le
// repère du passant (bras levé : `up`) ; Ghibli, à la main droite du pantin (repère du sprite, déjà à l'échelle du passant).
const heldTransform = (inp: CrewInput, dir: 1 | -1, up: boolean, s: number): string => {
  const u = inp.metrics.unit;
  if (inp.ghibli) return `scale(${((dir * s) / STREET_SCALE.person).toFixed(3)} ${(s / STREET_SCALE.person).toFixed(3)})`;
  return `translate(${(dir * 3 * u).toFixed(2)} ${(-(up ? 22 : 13) * u).toFixed(2)}) scale(${(dir * s * u).toFixed(3)} ${(s * u).toFixed(3)})`;
};
// Petit drapeau tenu à bout de bras (roulé ou déplié).
const heldFlag = (inp: CrewInput, dir: 1 | -1, up: boolean, by = 'hands'): ReactNode => (
  <g data-held-flag="" {...loadAttrs(inp, by)} transform={heldTransform(inp, dir, up, 0.7)}>
    <line x1={0} y1={0} x2={0} y2={-9} stroke={inp.sky.daylight < 0.3 ? '#3A3228' : '#6B5B4A'} strokeWidth={0.8} />
    <g transform="translate(0 -9)"><FlagArt sky={inp.sky} w={6} h={4} /></g>
  </g>
);
// Toile de l'auvent roulée, tenue à la main (au bout du bras levé en haut de l'échelle).
const heldRoll = (inp: CrewInput, dir: 1 | -1, up: boolean, by = 'hands'): ReactNode => (
  <g {...loadAttrs(inp, by)} transform={heldTransform(inp, dir, up, 0.8)}>
    <HeldRoll sky={inp.sky} />
  </g>
);

// Pièce de la scène tenue par l'ouvrier de la nacelle : tronçon de treillis (ossature) ou projecteur.
const heldPiece = (inp: CrewInput, dir: 1 | -1, up: boolean, by = 'hands'): ReactNode => (
  <g {...loadAttrs(inp, by)} transform={heldTransform(inp, dir, up, 0.8)}>{inp.item.kind === 'stage-frame' ? <HeldTruss sky={inp.sky} /> : <HeldSpot sky={inp.sky} />}</g>
);

// Échelle : l'équipe la prend sur son véhicule (galerie de la camionnette, porte-bagages du vélo porteur, flanc du camion
// plateau), la porte à l'épaule en marchant, l'appuie (inclinée) contre la façade, centrée sur la porte, ou contre le bout de
// l'auvent d'un stand ; l'un monte, l'autre la tient en bas. Au retour, ils l'y rangent. Le drapeau (sorti de la caisse du vélo)
// ou la toile de l'auvent (sortie du plateau) voyage à la main. Vélo porteur : un seul ouvrier, l'échelle portée en son milieu.
const LADDER_TILT = 12;
function ladderCrew(inp: CrewInput): FootCrew {
  const m = inp.metrics;
  const u = m.unit;
  const h = 30 * u;
  const rad = (LADDER_TILT * Math.PI) / 180;
  const awning = inp.item.kind === 'stand-awning';
  const toward = sgn(inp.item.x - inp.home.x);
  // `lean` : côté vers lequel penche l'échelle (le mur, ou le centre du stand) ; `lx` : son pied ; `foot` : sol.
  let lean: 1 | -1;
  let lx: number;
  let foot: number;
  if (awning) {
    // Bout du stand du côté de la file (vide pendant le montage et la dépose ; les fûts sont à l'autre bout).
    const end = inp.standSide.get(inp.item.group ?? '') ?? 1;
    lean = (-end) as 1 | -1;
    lx = inp.item.x + end * (COUNTER_HALF + 8) * u;
    foot = m.curb + (STAND_DEPTH + 3) * u;
  } else {
    lean = toward;
    // Pied décalé de la moitié de l'inclinaison : le milieu de l'échelle est au-dessus du centre de la porte.
    lx = inp.item.x - lean * (h / 2) * Math.sin(rad);
    foot = m.doorY;
  }
  const along = (y: number): number => lx + lean * (foot - y) * Math.tan(rad);
  const bx = lx - lean * 8 * u;
  const top = foot - 14 * u;
  const p = inp.progress;
  const solo = inp.set.transport === 'cargo-bike';
  const tag = TAG[inp.set.transport];
  const object = (on: boolean, dir: 1 | -1, up: boolean, by = 'hands'): ReactNode => (on ? (awning ? heldRoll(inp, dir, up, by) : heldFlag(inp, dir, up, by)) : null);
  let a: Worker;
  let b: Worker | null;
  let ladder: ReactElement;
  // Échelle couchée sur l'épaule : de `ax` (devant) vers l'arrière, à la hauteur `ly`.
  // Même structure de transformation (CSS, avec la transition des ouvriers) portée, dressée ou couchée : l'échelle glisse avec
  // ceux qui la tiennent d'un rendu à la minute au suivant.
  const ladderStyle = (x: number, y: number, dir: 1 | -1, deg: number): CSSProperties => ({ transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${dir}, 1) rotate(${deg.toFixed(1)}deg)`, transition: MOVE });
  const carried = (ax: number, dir: 1 | -1, ly: number, by = 'hands'): ReactElement => (
    <g data-ladder="" data-ladder-state="carried" data-carried={by} data-x={(ax - (dir * h) / 2).toFixed(1)} style={ladderStyle(ax, ly, dir, -90)}>
      <LadderSprite height={h} />
    </g>
  );
  // `angle` : 0 = appuyée (inclinée de LADDER_TILT), 90 = couchée au sol vers l'arrière.
  const standing = (angle: number): ReactElement => (
    <g data-ladder="" data-ladder-state={angle === 0 ? 'up' : 'moving'} data-carried={angle === 0 ? 'held' : 'hands'} data-x={lx.toFixed(1)} style={ladderStyle(lx, foot, lean, LADDER_TILT * (1 - angle / 90) - angle)}>
      <LadderSprite height={h} />
    </g>
  );
  switch (inp.step) {
    case 'arrive':
    case 'leave': {
      const arrive = inp.step === 'arrive';
      const st = tripStage(inp.step, p, true);
      const work = { x: lx, y: foot };
      const dirW = arrive ? toward : ((-toward) as 1 | -1);
      // L'échelle portée s'étend derrière celui de devant (seul : de part et d'autre de lui) : si l'équipe s'éloigne du véhicule,
      // elle part une échelle (une demi-échelle) plus loin.
      const away = inp.van ? ((-inp.van.dir) as 1 | -1) : dirW;
      const behind = solo ? h / 2 : h - 3 * u;
      const startX = inp.home.x + (dirW === away ? away * behind : 0);
      const path = arrive ? footPath(inp, work, startX) : footPath(inp, work, startX).reverse();
      const pos = walkAt(path, st.q, dirW);
      // Le drapeau (la toile) part avec l'équipe à la pose, revient avec elle à la dépose.
      const withObject = arrive ? !inp.removing : inp.removing;
      if (st.atVan && inp.van) {
        // À l'arrière du véhicule : ils prennent l'échelle rangée dessus (ou l'y rangent), bras levés ; le drapeau (la toile)
        // sort de la caisse (du plateau) ou y rentre en même temps.
        const g = inp.van;
        const face = sgn(g.park - pos.x, g.dir);
        const L = SPEC[g.kind].ladder;
        const roofX = g.park + g.dir * L.x * g.k;
        const roofY = g.baseY + L.y * g.k;
        const by = st.k < 0.15 ? tag : 'hands';
        a = { x: pos.x, y: pos.y, dir: face, pose: 'reach', held: object(withObject, dirW, false, by) };
        b = solo ? null : { x: lerp(pos.x - face * 6 * u, pos.x - dirW * (h - 3 * u), st.k), y: pos.y, dir: face, pose: 'reach' };
        const front = solo ? pos.x + (dirW * h) / 2 : pos.x;
        ladder = carried(lerp(roofX + (dirW * h) / 2, front, st.k), dirW, lerp(roofY, pos.y - 20 * u, st.k), by);
      } else {
        a = { x: pos.x, y: pos.y, dir: pos.dir, pose: 'carry', held: object(withObject, pos.dir, false) };
        b = solo ? null : { x: pos.x - pos.dir * (h - 3 * u), y: pos.y, dir: pos.dir, pose: 'carry' };
        ladder = carried(solo ? pos.x + (pos.dir * h) / 2 : pos.x, pos.dir, pos.y - 20 * u);
      }
      break;
    }
    case 'ladder-up':
    case 'ladder-down': {
      // On dresse l'échelle bras levés ; on la couche bras vers l'avant et le bas. L'autre garde le drapeau (la toile).
      const raise = inp.step === 'ladder-up' ? p : 1 - p;
      const holds = inp.step === 'ladder-up' ? !inp.removing : inp.removing;
      a = { x: lx + lean * 4 * u, y: foot, dir: (-lean) as 1 | -1, pose: inp.step === 'ladder-up' ? 'reach' : 'hold', held: solo ? object(holds, (-lean) as 1 | -1, false) : undefined };
      b = solo ? null : { x: bx, y: foot, dir: lean, pose: 'stand', held: object(holds, lean, false) };
      ladder = standing(90 * (1 - raise));
      break;
    }
    default: {
      // climb, fix / unfix, descend : l'ouvrier suit l'inclinaison de l'échelle.
      const onTop = inp.step === 'fix' || inp.step === 'unfix';
      const y = inp.step === 'climb' ? lerp(foot, top, p) : inp.step === 'descend' ? lerp(top, foot, p) : top;
      // L'objet est à la main pendant la montée et la fixation (pose) ; pendant la descente (dépose).
      const holds = inp.removing ? inp.step === 'descend' : inp.step === 'climb' || inp.step === 'fix';
      a = { x: along(y), y, dir: lean, pose: onTop ? 'reach' : 'climb', held: object(holds, lean, true), ladder: true };
      b = solo ? null : { x: bx, y: foot, dir: lean, pose: 'hold' };
      ladder = standing(0);
    }
  }
  return { back: ladder, a, b, front: null };
}

// À la main : deux porteurs tiennent l'objet (barrière, élément de plancher, comptoir) par ses extrémités, bras vers l'avant et
// le bas, à hauteur des mains : celui de derrière le pousse, celui de devant le tire, bras vers l'arrière. L'objet sort de
// l'arrière de la camionnette (pose) et y rentre (dépose). Barrière de la rue privatisée : portée de face, tournée en travers
// de la file en la posant.
function handCrew(inp: CrewInput): FootCrew {
  const m = inp.metrics;
  const u = m.unit;
  const k = u * STREET_SCALE.person;
  const kind = inp.item.kind;
  const lane = inp.item.lane;
  const barrier = kind === 'barrier';
  const counter = kind === 'stand-counter';
  const placedX = barrier && !lane ? barrierX(inp.item.x, inp.lamps, u) : inp.item.x;
  const workY = lane ? laneBarrierY(m, lane) : counter ? m.curb + (STAND_DEPTH + 2) * u : vanY(m);
  // Mains (pose `hold`) : en avant du corps, à mi-hauteur.
  const reach = HOLD_HAND.x * k;
  // Prises : les montants de la barrière (tenue à mi-hauteur), les bouts de la planche ou du comptoir.
  const half = barrier ? BARRIER.post * barrierK(u) : counter ? (COUNTER_HALF - 3) * u : 17 * u;
  const off = half + reach;
  // Main droite d'un porteur (relative à ses pieds, px du monde) : classique, pose `hold` à `reach` devant lui (derrière pour
  // `tow`) ; Ghibli, accroche du pantin debout dans ce geste.
  const handAt = (i: 0 | 1, pose: CrewPose, dir: 1 | -1): Pt => {
    if (!inp.ghibli) return { x: dir * (pose === 'tow' ? -reach : reach), y: HOLD_HAND.y * k };
    const h = restHand(inp.outfits[i]!, { pose, dir });
    return { x: h[0] * k, y: h[1] * k };
  };
  // Porteur `i` (0 : a, 1 : b) dont la main droite tient le bout `end` de la charge : le centre de la charge est entre les deux
  // mains qui la portent.
  const grip = (i: 0 | 1, end: number, y: number, dir: 1 | -1, pose: CrewPose): Worker => ({ x: end - handAt(i, pose, dir).x, y, dir, pose });
  // Bas de la charge portée, depuis les pieds des porteurs : à la hauteur moyenne de leurs mains.
  const carryDy = (a: Worker, b: Worker): number => (handAt(0, a.pose, a.dir).y + handAt(1, b.pose, b.dir).y) / 2 + (barrier ? (BARRIER.height / 2) * barrierK(u) : counter ? 7 * u : 1.25 * u);
  const placedY = lane ? laneBarrierY(m, lane) : barrier ? barrierY(m) : counter ? standBase(m) : stageBase(m);
  const p = inp.progress;
  // Charge : placée par une transformation CSS avec la même transition que les porteurs (elle glisse avec eux).
  const load = (x: number, base: number, tilt: number, by: string): ReactElement => {
    const attrs = { 'data-carried-item': barrier ? 'barrier' : counter ? 'counter' : 'plank', ...loadAttrs(inp, by), 'data-x': x.toFixed(1) };
    const k = barrierK(u);
    const shape = barrier
      ? `matrix(${lerp(k, 0.3 * k, tilt).toFixed(3)}, ${lerp(0, 0.72 * k, tilt).toFixed(3)}, 0, ${k.toFixed(3)}, 0, 0)`
      : `matrix(${u.toFixed(3)}, 0, 0, ${u.toFixed(3)}, 0, 0)`;
    return (
      <g {...attrs} style={{ transform: `translate(${x.toFixed(1)}px, ${base.toFixed(1)}px) ${shape}`, transition: MOVE }}>
        {barrier ? <Barrier sky={inp.sky} /> : counter ? <CarriedCounter sky={inp.sky} /> : <rect x={-17} y={-2.5} width={34} height={2.5} fill={inp.sky.daylight < 0.3 ? '#3A3036' : '#6A5848'} />}
      </g>
    );
  };
  const work = { x: placedX, y: workY };
  const toward = sgn(work.x - inp.home.x);
  let a: Worker;
  let b: Worker;
  let carried: ReactElement | null = null;
  if (inp.step === 'arrive' || inp.step === 'leave') {
    const arrive = inp.step === 'arrive';
    const loaded = arrive ? !inp.removing : inp.removing;
    const st = tripStage(inp.step, p, loaded);
    // Départ : la charge (et ses deux porteurs) entièrement derrière l'arrière de la camionnette.
    const away = inp.van ? ((-inp.van.dir) as 1 | -1) : toward;
    const startX = inp.home.x + away * off;
    const path = arrive ? footPath(inp, work, startX) : footPath(inp, work, startX).reverse();
    const pos = walkAt(path, st.q, arrive ? toward : ((-toward) as 1 | -1));
    // Chargés : derrière pousse (bras vers l'avant), devant tire (bras vers l'arrière). À vide : ils marchent.
    a = loaded ? grip(0, pos.x + pos.dir * half, pos.y, pos.dir, 'tow') : { x: pos.x + pos.dir * off, y: pos.y, dir: pos.dir, pose: 'walk' };
    b = loaded ? grip(1, pos.x - pos.dir * half, pos.y, pos.dir, 'hold') : { x: pos.x - pos.dir * off, y: pos.y, dir: pos.dir, pose: 'walk' };
    if (loaded && st.atVan && inp.van) {
      // Sortie (ou rangement) : face à la portière ouverte, ils tirent l'objet hors de la camionnette (ou l'y poussent).
      const g = inp.van;
      // Trottoir : l'objet sort de derrière la carrosserie (qui le cache) ; chaussée (dessinée après la camionnette) : il apparaît
      // à la portière ouverte, juste derrière l'arrière.
      const inside = inp.street ? g.park - g.dir * (g.half + half + u) : g.park - g.dir * (g.half - half * 0.4);
      // Ghibli : chacun la main droite à un bout de la charge (classique : de part et d'autre, comme avant).
      a = inp.ghibli ? grip(0, pos.x + g.dir * half, pos.y, g.dir, 'hold') : { x: pos.x + g.dir * off, y: pos.y, dir: g.dir, pose: 'hold' };
      b = inp.ghibli ? grip(1, pos.x - g.dir * half, pos.y, g.dir, 'hold') : { x: pos.x - g.dir * off, y: pos.y, dir: g.dir, pose: 'hold' };
      carried = load(lerp(inside, pos.x, st.k), pos.y + carryDy(a, b), 0, st.k < 0.15 ? TAG[inp.set.transport] : 'hands');
    } else if (loaded) carried = load(pos.x, pos.y + carryDy(a, b), 0, 'hands');
  } else {
    // place : face à face de part et d'autre de l'objet ; on le descend jusqu'au sol (pose) ou on le soulève (dépose).
    a = grip(0, placedX + toward * half, workY, (-toward) as 1 | -1, 'hold');
    b = grip(1, placedX - toward * half, workY, toward, 'hold');
    const down = inp.removing ? 1 - p : p;
    carried = load(placedX, lerp(workY + carryDy(a, b), placedY, down), lane ? down : 0, 'hands');
  }
  return { back: null, a, b, front: carried };
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
  const off = liftOff(u);
  const edge = (i: DecorItem): number => (i.x < inp.width / 2 ? -off : inp.width + off);
  // Sens du camion : celui de son arrivée (vers l'élément).
  const roughFrom = route(inp, (i) => i.x, edge).from;
  const dir = sgn(inp.item.x - roughFrom, sgn(inp.item.x - edge(inp.item)));
  const park = (i: DecorItem): number => liftPark(i, dir, m);
  const { from, to, fromHome, toHome } = route(inp, park, edge);
  const here = park(inp.item);
  // Trajet depuis / vers le bord du monde : le camion reste hors champ la première minute de son arrivée et a quitté le champ
  // dès la dernière minute de son départ (rendu à la minute : il n'est jamais ôté ni posé dans le champ).
  const span = inp.stepTo - inp.stepFrom;
  const roll = Math.max(span - 1, span / 2);
  const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
  const p = inp.step === 'arrive' && fromHome && span > 0
    ? clamp01((inp.abs - inp.stepFrom - (span - roll)) / roll)
    : inp.step === 'leave' && toHome && span > 0 ? clamp01((inp.abs - inp.stepFrom) / roll) : inp.progress;
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
  // Ghibli : pantin debout dans la nacelle, tourné vers l'élément, bras levés quand il pose ou retire, sinon le long du corps ;
  // la pièce (drapeau, treillis, projecteur) à la main droite. Immobile (`dist` 0), mais posé par la boucle comme les autres :
  // un sprite pas encore peint au rendu (bras qui changent) y est posé dès qu'il l'est.
  const look: CrewLook = { yaw: facingYaw(faceItem), gait: 'stand', arms: atTop ? 'overhead' : 'down' };
  const perched: WorkerMove = { look, since: 0, dist: 0, k: kp };
  const rider = !g.inBucket ? null : inp.ghibli ? (
    <g data-worker="" data-pose={atTop ? 'reach' : 'stand'} data-move={JSON.stringify(perched)}>
      <g transform={`scale(${kp.toFixed(3)})`}>
        <GhibliFigure
          outfit={inp.outfits[0]!}
          sky={inp.sky}
          rainy={inp.rainy}
          umbrella={false}
          work="vest"
          initial={workerPose(perched, 0)}
          held={held ? [{ anchor: 'handR', node: held }] : undefined}
        />
      </g>
    </g>
  ) : (
    <g data-worker="" data-pose={atTop ? 'reach' : 'stand'}>
      <g transform={`scale(${(faceItem * kp).toFixed(3)} ${kp.toFixed(3)})`}>
        <CrewWorker outfit={inp.outfits[0]!} sky={inp.sky} rainy={inp.rainy} pose={atTop ? 'reach' : 'stand'} />
      </g>
      {held}
    </g>
  );
  // Au sol (stabilisateurs, manœuvre) : près du lampadaire, de l'autre côté du mât ; sinon derrière le camion. Il descend de la
  // cabine au déploiement (il en sort, caché par elle, et marche jusqu'à sa place) et y remonte au repli. L'ouvrier de la
  // nacelle attend au pied de la cabine, sous la nacelle repliée, pendant le déploiement et le repli : il y monte et en descend.
  const lamp = inp.item.kind === 'lamp-flag';
  const gy = m.curb - 1 * u;
  const cab = g.here + g.dir * 20 * kv;
  const spot = lamp ? inp.item.x + 7 * u : g.here - g.dir * 30 * u;
  const gx = inp.step === 'deploy' ? lerp(cab, spot, inp.progress) : inp.step === 'stow' ? lerp(spot, cab, inp.progress) : spot;
  const walking = inp.step === 'deploy' || inp.step === 'stow';
  const ground: Worker | null = g.inside
    ? null
    : { x: gx, y: gy, dir: walking ? sgn(inp.step === 'deploy' ? spot - cab : cab - spot, g.dir) : lamp ? -1 : g.dir, pose: walking ? 'walk' : 'stand' };
  // La pièce à poser est entreposée (city/install.ts, `inVehicle`) : drapeaux dans la caisse du plateau du camion élévateur,
  // pièces de la scène sur le camion plateau garé tout près. Au déploiement (pose), l'ouvrier de la nacelle va l'y prendre
  // (LIFT_FETCH) et revient sous la nacelle ; au repli (dépose), il va l'y ranger et revient.
  const W0 = g.here + rest.x;
  const own = inp.set.transport === 'lift' || !inp.van;
  const F = own ? g.here + g.dir * LIFT_CRATE.x * kv : inp.home.x;
  const tag = own ? 'lift' : TAG[inp.set.transport];
  const fetching = (inp.step === 'deploy' && !inp.removing) || (inp.step === 'stow' && inp.removing);
  let waiting: Worker | null = g.inside || g.inBucket ? null : { x: W0, y: gy, dir: g.dir, pose: 'stand' };
  if (waiting && fetching) {
    const p = inp.progress;
    const piece = (dir: 1 | -1, by: string): ReactNode => (lamp ? heldFlag(inp, dir, false, by) : heldPiece(inp, dir, false, by));
    // Va (mains vides à la pose, chargé à la dépose), prend ou range, revient (chargé à la pose, mains vides à la dépose).
    // Il sort de la cabine (au début de l'étape) et y rentre (à la fin) sous la nacelle : il attend là un instant.
    const go = 0.1;
    const back = 0.85;
    if (p < LIFT_FETCH.from) {
      const dir = sgn(F - W0, g.dir);
      const q = Math.max(0, (p - go) / (LIFT_FETCH.from - go));
      waiting = { x: lerp(W0, F, q), y: gy, dir, pose: q > 0 ? 'walk' : 'stand', held: inp.removing ? piece(dir, 'hands') : undefined };
    } else if (p < LIFT_FETCH.to) {
      const q = (p - LIFT_FETCH.from) / (LIFT_FETCH.to - LIFT_FETCH.from);
      const out = inp.removing ? 1 - q : q; // 0 : dans le véhicule, 1 : en main
      const dir = sgn(F - W0, g.dir);
      waiting = { x: F, y: gy, dir, pose: 'reach', held: piece(dir, out < 0.5 ? tag : 'hands') };
    } else {
      const dir = sgn(W0 - F, g.dir);
      const q = Math.min(1, (p - LIFT_FETCH.to) / (back - LIFT_FETCH.to));
      waiting = { x: lerp(F, W0, q), y: gy, dir: q < 1 ? dir : g.dir, pose: q < 1 ? 'walk' : 'stand', held: inp.removing ? undefined : piece(dir, 'hands') };
    }
  }
  // Caisse de drapeaux sur le plateau du camion élévateur : ceux qui restent à poser, ou déjà rangés.
  const cargo = inp.set.transport === 'lift'
    ? <FlagCrate sky={inp.sky} tag="lift" flags={inp.set.items.filter((i) => inVehicle(inp.set, i, inp.abs)).map((i) => `${inp.set.id}/${i.id}`)} />
    : null;
  return (
    <>
      {ground && <WorkerNode w={ground} outfit={inp.outfits[1]!} inp={inp} k={kp} />}
      {waiting && <WorkerNode w={waiting} outfit={inp.outfits[0]!} inp={inp} k={kp} />}
      <g data-lift-truck="" data-x={g.tx.toFixed(1)} data-half={(LIFT_HALF * kv).toFixed(1)} data-park={g.here.toFixed(1)} style={{ transform: `translate(${g.tx.toFixed(1)}px, ${g.ty.toFixed(1)}px)`, transition: MOVE }}>
        <LiftTruck
          sky={inp.sky}
          still={false}
          dir={g.dir}
          k={kv}
          u={u}
          outrigger={g.outrigger}
          bucket={bucket}
          rider={rider}
          beacon
          cargo={cargo}
          lights={inp.lights ?? false}
          ghibli={inp.ghibli ? { rainy: inp.rainy, dir: g.dir, k: kv, worldX: g.tx, move: MOVE, occupied: g.inside, still: false } : undefined}
        />
      </g>
    </>
  );
}
