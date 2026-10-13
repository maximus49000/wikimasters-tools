import { hashString, mulberry32 } from '../../scene-world';
import { THRESHOLD_S } from '../doorway';
import { TURN_S, YAW_BACK, YAW_FRONT, facingYaw, turnYaw } from '../../figure/gait';
import type { ArmPose } from '../../figure/skeleton';
import type { MovingStep } from './moving';

// Équipe de déménageurs « vivante » (revue du 2026-10-13) : plus de file indienne réglée comme une horloge (trois qui sortent,
// trois qui rentrent), mais un planning par porteur, tiré une fois pour toute l'étape (graine du local et du jour) :
// - chacun a son pas, prend plus ou moins de temps pour attraper ou poser (dans le local, dans le camion) ;
// - les cartons se portent seul ; les meubles lourds à deux (le premier arrivé attend l'autre à l'intérieur), pas toute
//   l'équipe ;
// - de temps en temps, l'un fait une pause sur le trottoir (téléphone, étirement, bras croisés…) pendant que les autres
//   continuent, ou enchaîne deux allers sans s'arrêter ;
// - à la pause, ils sortent l'un après l'autre et ne font pas tous la même chose ; à l'ouverture et à la fermeture, le premier
//   arrivé manœuvre le hayon (en quelques secondes, pas en quatre minutes).
// Personne n'apparaît ni ne disparaît sur place : on sort du local par le seuil de sa porte, du camion par l'arrière (caché par
// la caisse tant qu'on est derrière elle), de la cabine en passant derrière le camion.
// Moteur pur : les segments sont en secondes de l'horloge murale ; `crewAt` donne la pose de chacun à un instant.

export type Pt = { x: number; y: number };
// Lourds : portés à deux. Carton : seul.
export const HEAVY_PIECES = ['vitrine', 'etagere', 'table', 'fauteuil'] as const;
export type HeavyPiece = (typeof HEAVY_PIECES)[number];
export type Load = 'carton' | HeavyPiece | null;
// Où l'on est hors de vue : dans le local, dans la caisse du camion, dans la cabine.
export type OffAt = 'shop' | 'truck' | 'cab';

export type Seg =
  | { k: 'off'; at: OffAt; t: number; dur: number }
  | { k: 'walk'; from: Pt; to: Pt; load: Load; job: number; t: number; dur: number }
  | { k: 'sill'; from: number; to: number; face: 1 | -1; load: Load; job: number; t: number; dur: number }
  | { k: 'turn'; at: Pt; from: number; to: number; dir: 1 | -1; t: number; dur: number }
  | { k: 'stand'; at: Pt; face: 1 | -1; arms: readonly ArmPose[]; period: number; t: number; dur: number };

// Ce que la vue reçoit pour un porteur.
export type MoverAt = {
  where: 'street' | 'door' | 'off';
  x: number;
  y: number;
  depth: number; // sur le seuil : 0 trottoir, 1 au fond de l'entrée
  dir: 1 | -1;
  yaw: number;
  gait: 'walk' | 'step' | 'stand';
  walked: number;
  load: Load;
  job: number;
  arms: ArmPose;
};

export type CrewInput = {
  step: MovingStep;
  prev: MovingStep | undefined;
  t0: number;
  t1: number;
  n: number;
  seed: number; // graine du local et du jour
  door: Pt; // seuil de la porte du local (sur le trottoir)
  truck: Pt; // à l'intérieur de la caisse, juste derrière le bord arrière (caché par la carrosserie)
  rear: Pt; // sur le trottoir, juste derrière le camion (là où l'on manœuvre le hayon)
  cab: Pt; // derrière la cabine (caché), d'où l'on descend
  spots: Pt[]; // places d'attente sur le trottoir, entre la porte et le camion
  speed: number; // px/s
};

export type CrewPlan = { segs: Seg[][]; jobs: { load: Load; a: number; b: number }[]; tailgate: { at: number; dur: number } | null };

// Hayon : quelques secondes, manœuvré par le premier arrivé.
export const TAILGATE_S = 5;
const GESTURES: readonly (readonly ArmPose[])[] = [['phone'], ['stretch-1', 'stretch-2'], ['crossed'], ['chin'], ['yawn', 'down'], ['wipe-1', 'down'], ['down']];

const sideOf = (from: number, to: number, fallback: 1 | -1 = 1): 1 | -1 => (to > from ? 1 : to < from ? -1 : fallback);
const dist = (p: Pt, q: Pt): number => Math.hypot(q.x - p.x, q.y - p.y);
const standYaw = (face: 1 | -1): number => (face > 0 ? 2 : 6);

// Fil d'un porteur : ajoute des segments bout à bout et suit son orientation (jamais de demi-tour d'un coup).
class Track {
  segs: Seg[] = [];
  yaw: number;
  // Sens de la dernière marche (on entre dans le local tourné du côté d'où l'on arrive).
  lastDir: 1 | -1 = 1;
  constructor(
    public t: number,
    yaw: number,
    public pace: number,
  ) {
    this.yaw = yaw;
  }
  push(s: Seg): void {
    if (s.dur <= 0) return;
    this.segs.push(s);
    this.t = s.t + s.dur;
  }
  off(at: OffAt, until: number): void {
    this.push({ k: 'off', at, t: this.t, dur: until - this.t });
  }
  turn(at: Pt, to: number, dir: 1 | -1): void {
    if (to !== this.yaw) this.push({ k: 'turn', at, from: this.yaw, to, dir, t: this.t, dur: TURN_S });
    this.yaw = to;
  }
  walk(from: Pt, to: Pt, load: Load = null, job = -1, slow = 1): void {
    const dir = sideOf(from.x, to.x);
    this.turn(from, facingYaw(dir), dir);
    this.lastDir = dir;
    this.push({ k: 'walk', from, to, load, job, t: this.t, dur: dist(from, to) / (this.pace * slow) });
  }
  // Sortir du local (1 → 0) ou y entrer (0 → 1) par le seuil.
  sill(out: boolean, face: 1 | -1, load: Load = null, job = -1): void {
    this.push({ k: 'sill', from: out ? 1 : 0, to: out ? 0 : 1, face, load, job, t: this.t, dur: THRESHOLD_S });
    this.yaw = out ? facingYaw(face) : YAW_BACK;
  }
  stand(at: Pt, face: 1 | -1, arms: readonly ArmPose[], until: number, period = 2.4): void {
    this.turn(at, standYaw(face), face);
    this.push({ k: 'stand', at, face, arms, period, t: this.t, dur: until - this.t });
  }
}

// Planning de l'étape. Les étapes sans équipe visible (arrivée, départ) n'ont aucun segment.
export function planCrew(c: CrewInput): CrewPlan {
  const rng = mulberry32(c.seed ^ hashString(`crew-${c.step}`));
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)]!;
  const between = (a: number, b: number): number => a + (b - a) * rng();
  // Pas de chacun : 0,85 à 1,15 fois le pas de base.
  const paces = Array.from({ length: c.n }, (_, i) => c.speed * (0.85 + 0.3 * mulberry32(c.seed ^ hashString(`pace-${i}`))()));
  const toTruck = sideOf(c.door.x, c.rear.x);
  // Côté vers lequel chacun est tourné à sa place : à la pause, un sur deux face aux autres ; sinon vers le camion. L'étape
  // suivante repart de la même orientation (jamais de demi-tour d'un coup d'une étape à l'autre).
  const faceAt = (i: number, step: MovingStep | undefined): 1 | -1 => (step === 'pause' && i % 2 === 1 ? (-toTruck as 1 | -1) : toTruck);
  const tracks = paces.map((p, i) => new Track(c.t0, standYaw(faceAt(i, c.prev)), p));
  const jobs: CrewPlan['jobs'] = [];
  let tailgate: CrewPlan['tailgate'] = null;
  // Où sont-ils au début de l'étape (fin de la précédente).
  const startAt: 'cab' | 'spot' | 'shop' | 'truck' =
    c.step === 'open-back' ? 'cab' : c.step === 'carry-out' || c.step === 'carry-in' ? 'spot' : c.prev === 'carry-out' ? 'shop' : c.prev === 'carry-in' ? 'truck' : 'spot';
  // Sortie vers sa place, chacun à son heure (pas tous ensemble).
  const comeOut = (i: number, tr: Track, delay: number): void => {
    const spot = c.spots[i]!;
    if (startAt === 'spot') return;
    tr.off(startAt === 'shop' ? 'shop' : startAt === 'truck' ? 'truck' : 'cab', c.t0 + delay);
    if (startAt === 'shop') {
      tr.sill(true, sideOf(c.door.x, spot.x));
      tr.walk(c.door, spot);
    } else if (startAt === 'truck') {
      tr.walk(c.truck, spot);
    } else {
      // De la cabine, derrière la caisse (caché), jusqu'à l'arrière.
      tr.walk(c.cab, c.rear);
      if (i > 0 || c.step !== 'open-back') tr.walk(c.rear, spot);
    }
  };

  switch (c.step) {
    case 'open-back': {
      // Le premier descend, ouvre le hayon ; les autres suivent à leur rythme et attendent en discutant.
      tracks.forEach((tr, i) => comeOut(i, tr, i === 0 ? 0.5 : between(3, 9) + i * 2));
      const t0 = tracks[0]!;
      tailgate = { at: t0.t + 0.6, dur: TAILGATE_S };
      t0.stand(c.rear, toTruck, ['reach'], t0.t + 0.6 + TAILGATE_S + 0.4);
      t0.walk(c.rear, c.spots[0]!);
      tracks.forEach((tr, i) => tr.stand(c.spots[i]!, toTruck, pick(GESTURES), c.t1 + 3600));
      break;
    }
    case 'pause': {
      // Pause : sortie échelonnée, chacun son occupation, tournés les uns vers les autres.
      tracks.forEach((tr, i) => {
        comeOut(i, tr, between(0, 25) + i * 4);
        const face = faceAt(i, 'pause');
        // Deux occupations successives (ex. téléphone, puis bras croisés).
        const mid = between(tr.t + 20, Math.max(tr.t + 21, (c.t0 + c.t1) / 2 + between(-60, 60)));
        tr.stand(c.spots[i]!, face, pick(GESTURES), mid);
        tr.stand(c.spots[i]!, face, pick(GESTURES), c.t1 + 3600);
      });
      break;
    }
    case 'close-back': {
      // Tous dehors (échelonnés), le premier ferme le hayon, puis chacun remonte dans la cabine (derrière le camion).
      tracks.forEach((tr, i) => comeOut(i, tr, between(0, 8) + i * 2.5));
      const ready = Math.max(...tracks.map((tr) => tr.t)) + between(4, 10);
      const t0 = tracks[0]!;
      t0.stand(c.spots[0]!, faceAt(0, c.prev), pick(GESTURES), ready);
      t0.walk(c.spots[0]!, c.rear);
      tailgate = { at: t0.t + 0.4, dur: TAILGATE_S };
      t0.stand(c.rear, toTruck, ['reach'], t0.t + 0.4 + TAILGATE_S + 0.3);
      t0.walk(c.rear, c.cab);
      t0.off('cab', c.t1 + 3600);
      tracks.slice(1).forEach((tr, k) => {
        const i = k + 1;
        tr.stand(c.spots[i]!, faceAt(i, c.prev), pick(GESTURES), tailgate!.at + between(1, 6) + k * 1.5);
        tr.walk(c.spots[i]!, c.rear);
        tr.walk(c.rear, c.cab);
        tr.off('cab', c.t1 + 3600);
      });
      break;
    }
    case 'carry-out':
    case 'carry-in': {
      const out = c.step === 'carry-out';
      // Origine du mobilier (local pour sortir, camion pour rentrer) et destination.
      const fromShop = out;
      const offFrom: OffAt = fromShop ? 'shop' : 'truck';
      const offTo: OffAt = fromShop ? 'truck' : 'shop';
      const P = { shop: c.door, truck: c.truck };
      const origin = fromShop ? P.shop : P.truck;
      const dest = fromShop ? P.truck : P.shop;
      const leave = (tr: Track, from: OffAt, to: Pt, load: Load, job: number): void => {
        // Sortie de `from` puis marche vers `to`.
        if (from === 'shop') {
          tr.sill(true, sideOf(c.door.x, to.x), load, job);
          tr.walk(c.door, to, load, job, load === 'carton' || load === null ? 1 : 0.75);
        } else tr.walk(c.truck, to, load, job, load === 'carton' || load === null ? 1 : 0.75);
      };
      const enter = (tr: Track, into: OffAt, load: Load, job: number): void => {
        if (into === 'shop') tr.sill(false, tr.lastDir, load, job);
        // Le camion : la marche finit derrière le bord arrière, sous la caisse.
      };
      // Prélude : de sa place jusqu'à l'origine, chacun à son tour (pas en file serrée).
      const ready: number[] = tracks.map((tr, i) => {
        tr.stand(c.spots[i]!, faceAt(i, c.prev), pick(GESTURES), c.t0 + between(0, 6) + i * between(1.5, 4));
        tr.walk(c.spots[i]!, origin);
        enter(tr, offFrom, null, -1);
        return tr.t;
      });
      const end = c.t1 - 2;
      // Durée d'un aller-retour (sans attente) pour savoir s'il reste le temps d'en faire un.
      const trip = (i: number, slow: number): number => (2 * dist(c.door, c.truck)) / (paces[i]! * slow) + 2 * THRESHOLD_S + 2 * TURN_S + 8;
      let guard = 0;
      let heavyFails = 0;
      while (guard++ < 400) {
        // Le prochain disponible (à l'origine, hors de vue).
        let i = 0;
        for (let j = 1; j < c.n; j++) if (ready[j]! < ready[i]!) i = j;
        const roll = rng();
        const heavy = c.n >= 2 && roll < 0.32 && heavyFails < 3;
        if (heavy) {
          // Meuble lourd : le premier prêt attend l'autre (le prochain disponible après lui) à l'intérieur.
          let j = i === 0 ? 1 : 0;
          for (let q = 0; q < c.n; q++) if (q !== i && ready[q]! < ready[j]!) j = q;
          const start = Math.max(ready[i]!, ready[j]!) + between(2, 6);
          // Plus le temps (ou plus de partenaire) pour un meuble : un carton à la place, s'il en reste le temps.
          if (start + trip(i, 0.75) + 6 > end) heavyFails++;
          else {
          const load = pick(HEAVY_PIECES);
          const job = jobs.length;
          jobs.push({ load, a: i, b: j });
          const pace = Math.min(paces[i]!, paces[j]!);
          // Même pas pour les deux (ils portent ensemble) ; le second suit, un pas derrière.
          const gap = (9 * (c.speed / 10)) / pace;
          [i, j].forEach((m, k) => {
            const tr = tracks[m]!;
            tr.off(offFrom, start + k * gap);
            const keep = tr.pace;
            tr.pace = pace;
            leave(tr, offFrom, dest, load, job);
            enter(tr, offTo, load, job);
            tr.off(offTo, tr.t + between(2.5, 5) + (k === 0 ? gap : 0));
            tr.pace = keep;
            leave(tr, offTo, origin, null, -1);
            enter(tr, offFrom, null, -1);
            ready[m] = tr.t;
          });
          continue;
          }
        }
        const tr = tracks[i]!;
        const start = ready[i]! + between(1.2, 5);
        if (start + trip(i, 1) > end) {
          ready[i] = Infinity;
          if (ready.every((r) => !Number.isFinite(r))) break;
          continue;
        }
        const job = jobs.length;
        jobs.push({ load: 'carton', a: i, b: i });
        tr.off(offFrom, start);
        leave(tr, offFrom, dest, 'carton', job);
        enter(tr, offTo, 'carton', job);
        tr.off(offTo, tr.t + between(1.2, 4));
        // Au retour, parfois une pause sur le trottoir (seul, les autres continuent).
        if (roll > 0.86 && tr.t + 40 + trip(i, 1) < end) {
          const spot = c.spots[i]!;
          leave(tr, offTo, spot, null, -1);
          tr.stand(spot, rng() < 0.5 ? toTruck : (-toTruck as 1 | -1), pick(GESTURES), tr.t + between(8, 22));
          tr.walk(spot, origin);
        } else leave(tr, offTo, origin, null, -1);
        enter(tr, offFrom, null, -1);
        ready[i] = tr.t;
      }
      // Fin de l'étape : chacun reste à l'origine (la pause ou la fermeture les en fera sortir).
      tracks.forEach((tr) => tr.off(offFrom, c.t1 + 3600));
      break;
    }
    default:
      break;
  }
  return { segs: tracks.map((tr) => tr.segs), jobs, tailgate };
}

const OFF: MoverAt = { where: 'off', x: 0, y: 0, depth: 1, dir: 1, yaw: YAW_FRONT, gait: 'stand', walked: 0, load: null, job: -1, arms: 'down' };
const dirOfYaw = (yaw: number, fallback: 1 | -1): 1 | -1 => (yaw > 4 && yaw < 12 ? -1 : yaw < 4 || yaw > 12 ? 1 : fallback);
// Orientation sur le seuil : en sortant, de face puis tourné vers la rue ; en entrant, l'inverse, de dos au fond.
const SILL_TURN = 0.3;
function sillYaw(depth: number, out: boolean, face: 1 | -1): number {
  const side = facingYaw(face);
  if (out) return depth > SILL_TURN ? YAW_FRONT : turnYaw(YAW_FRONT, side, 1 - depth / SILL_TURN);
  return depth > SILL_TURN ? YAW_BACK : turnYaw(side, YAW_BACK, depth / SILL_TURN);
}

// Pose d'un porteur à l'instant t.
export function moverAt(segs: readonly Seg[], door: Pt, t: number): MoverAt {
  let walked = 0;
  for (const s of segs) {
    if (t >= s.t + s.dur) {
      if (s.k === 'walk') walked += dist(s.from, s.to);
      continue;
    }
    if (t < s.t) return OFF;
    const p = s.dur > 0 ? (t - s.t) / s.dur : 0;
    switch (s.k) {
      case 'off':
        return OFF;
      case 'walk': {
        const dir = sideOf(s.from.x, s.to.x);
        return {
          where: 'street',
          x: s.from.x + (s.to.x - s.from.x) * p,
          y: s.from.y + (s.to.y - s.from.y) * p,
          depth: 0,
          dir,
          yaw: facingYaw(dir),
          gait: 'walk',
          walked: walked + p * dist(s.from, s.to),
          load: s.load,
          job: s.job,
          arms: s.load ? 'carry' : 'swing',
        };
      }
      case 'sill': {
        const depth = s.from + (s.to - s.from) * p;
        return { where: 'door', x: door.x, y: door.y, depth, dir: s.face, yaw: sillYaw(depth, s.to < s.from, s.face), gait: 'walk', walked: walked + depth * 8, load: s.load, job: s.job, arms: s.load ? 'carry' : 'swing' };
      }
      case 'turn':
        return { where: 'street', x: s.at.x, y: s.at.y, depth: 0, dir: p < 0.5 ? dirOfYaw(s.from, s.dir) : s.dir, yaw: turnYaw(s.from, s.to, p), gait: 'step', walked, load: null, job: -1, arms: 'swing' };
      default: {
        const arms = s.arms[Math.floor((t - s.t) / s.period) % s.arms.length]!;
        return { where: 'street', x: s.at.x, y: s.at.y, depth: 0, dir: s.face, yaw: standYaw(s.face), gait: 'stand', walked, load: null, job: -1, arms };
      }
    }
  }
  return OFF;
}

// Meuble lourd porté à deux : au milieu des deux porteurs du même aller. Un porteur pas encore parti (encore dedans) compte à
// l'origine du meuble (porte du local, arrière du camion), un porteur déjà arrivé à sa destination : le meuble dépasse de la
// porte ou de la caisse, porté par celui qui est dehors. Sur le seuil quand les deux y sont ; caché quand personne ne le porte.
export type PieceAt = { load: HeavyPiece; where: 'street' | 'door'; x: number; y: number; depth: number } | null;
export function pieceAt(plan: CrewPlan, movers: readonly MoverAt[], door: Pt, t?: number): PieceAt {
  for (const [job, jb] of plan.jobs.entries()) {
    if (jb.load === 'carton' || jb.load === null) continue;
    const a = movers[jb.a];
    const b = movers[jb.b];
    if (!a || !b || (a.job !== job && b.job !== job)) continue;
    const anchor = (m: number, mv: MoverAt): { x: number; y: number; door: number | null } => {
      if (mv.job === job) return mv.where === 'door' ? { x: door.x, y: door.y, door: mv.depth } : { x: mv.x, y: mv.y, door: null };
      // Hors du trajet : avant (origine) ou après (destination), d'après ses segments de ce meuble.
      const own = plan.segs[m]!.filter((s): s is Extract<Seg, { k: 'walk' | 'sill' }> => (s.k === 'walk' || s.k === 'sill') && s.job === job);
      const first = own[0];
      const last = own[own.length - 1];
      const now = t ?? Infinity;
      const before = first !== undefined && now < first.t;
      const seg = before ? first : last;
      if (!seg) return { x: door.x, y: door.y, door: 1 };
      if (seg.k === 'sill') return { x: door.x, y: door.y, door: before ? seg.from : seg.to };
      const p = before ? seg.from : seg.to;
      return { x: p.x, y: p.y, door: null };
    };
    const pa = anchor(jb.a, a);
    const pb = anchor(jb.b, b);
    if (pa.door !== null && pb.door !== null) return { load: jb.load as HeavyPiece, where: 'door', x: door.x, y: door.y, depth: (pa.door + pb.door) / 2 };
    return { load: jb.load as HeavyPiece, where: 'street', x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2, depth: 0 };
  }
  return null;
}
