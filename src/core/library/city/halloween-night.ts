// Nuit d'Halloween (spec 2026-10-20 Halloween §5.3-5.4, maquette `halloween/` galerie `nuit=1`) : le soir du 31 octobre, des
// familles (enfants déguisés, seau à bonbons, un adulte) vont d'entrée en entrée, des bandes de jeunes déguisés sonnent et
// s'enfuient, des adultes déguisés passent, et un jeune tapi dans une entrée fait peur à un passant. Tout est une fonction
// pure du jour, de la graine, de la rue (portes, entrées décorées, citrouilles) et de la pluie : le plan est tiré minute par
// minute de 16 h à minuit ; chaque groupe a un trajet d'un bord à l'autre fait de pièces `walk | stop | run`, lu à la seconde
// de la journée. Les passants ordinaires (people.ts) ne sont pas ici : seulement les groupes qui s'arrêtent et les farces.
import { hashString, mulberry32 } from '../scene-world';
import { facingYaw, YAW_BACK, YAW_FRONT } from '../figure/gait';
import type { ArmPose, Gait } from '../figure/skeleton';
import { isoDate, type YMD } from './calendar';
import { DOOR_WIDTH } from './metrics';
import { ADULT_COSTUMES, outfitFor, pickWeighted, TOUCHES, type Costume, type Guise, type Outfit } from './people';

export type NightKind = 'family' | 'teens' | 'adults';
export type NightMember = { id: string; outfit: Outfit; guise: Guise | null; kid: boolean; scale: number; acc: 'bucket' | 'bag' | null; umbrella: boolean };
export type StopKind = 'treat' | 'nobody' | 'ring';
// `door` : centre de la porte (px) ; `resident` : tenue de l'habitant qui ouvre (pas relié à un foyer), `hat` : chapeau pointu.
export type NightStop = { kind: StopKind; door: number; doorId: string; resident: Outfit; hat: boolean };
export type Piece = { mode: 'walk' | 'stop' | 'run'; t0: number; t1: number; x0: number; x1: number; stop?: NightStop };
export type NightGroup = { id: string; kind: NightKind; dir: 1 | -1; members: NightMember[]; gap: number; speed: number; pieces: Piece[]; t0: number; t1: number };
// Farce « faire peur » : `t0` = instant où le jeune surgit moins 5,5 s (début de l'embuscade visible : porte entrouverte).
export type NightScare = { id: string; door: number; doorId: string; t0: number; dir: 1 | -1; teen: NightMember; victim: NightMember; speed: number };
export type DoorEvent = { kind: StopKind | 'scare'; door: number; t0: number; group?: NightGroup; stop?: NightStop };
export type NightPlan = { groups: NightGroup[]; scares: NightScare[]; doors: Map<number, DoorEvent[]> };
export type NightStreet = { doors: readonly { id: string; x: number }[]; decorated: ReadonlySet<string>; pumpkins: ReadonlySet<string>; width: number; unit: number };

// Durées (secondes) des scènes à la porte ; minuterie du hall (comme HALL_TIMER_S).
export const TREAT_S = 24;
export const NOBODY_S = 13;
export const RING_S = 4;
const HALL_S = 120;
// Créneaux occupés autour d'une scène (secondes avant, après son début) : une porte, une scène à la fois.
const BUSY: Readonly<Record<StopKind | 'scare', readonly [number, number]>> = { treat: [-4, 34], nobody: [-4, 16], ring: [-2, 26], scare: [-26, 16] };
// Vitesses (px/s), course des jeunes qui détalent (multiplicateur, distance en unités).
const SPEED: Readonly<Record<NightKind, number>> = { family: 8.5, teens: 12.5, adults: 11.5 };
const RUN = { k: 2.6, dist: 42 } as const;
// Écart entre membres d'un groupe (unités) ; marge hors champ (px) des bouts du trajet.
const GAP: Readonly<Record<NightKind, number>> = { family: 7, teens: 8, adults: 7.5 };
const EDGE = 40;

// Débits par minute pour 720 px (lus sur la maquette, ramenés à la largeur) ; pluie : familles × 0,35, jeunes × 0,7, adultes × 0,6.
const ramp = (h: number, a: number, b: number, c: number, d: number): number => (h < a || h > d ? 0 : h < b ? (h - a) / (b - a) : h <= c ? 1 : 1 - (h - c) / (d - c));
export function nightRate(kind: NightKind, hour: number, wet: boolean): number {
  if (kind === 'family') return 1.1 * ramp(hour, 17.25, 17.9, 19.6, 20.8) * (wet ? 0.35 : 1);
  if (kind === 'teens') return 1.4 * ramp(hour, 18.8, 19.9, 22.4, 23.3) * (wet ? 0.7 : 1);
  return 0.6 * ramp(hour, 18.8, 19.8, 23, 23.9) * (wet ? 0.6 : 1);
}
export const isHalloweenNight = (date: YMD): boolean => date.m === 10 && date.d === 31;

const KID_COSTUMES: Readonly<Partial<Record<Costume, number>>> = { witch: 2, hero: 1.6, ghost: 1.5, pumpkin: 1.5, skeleton: 1.2, cat: 1.2, devil: 1, vampire: 0.8, mummy: 0.6, zombie: 0.6 };
const TEEN_COSTUMES: Readonly<Partial<Record<Costume, number>>> = { zombie: 2, skeleton: 1.5, vampire: 1.2, ghost: 1, devil: 1, witch: 1, mummy: 0.8, cat: 0.6, hero: 0.5 };

function memberOf(kind: NightKind, role: 'kid' | 'adult' | 'teen', r: () => number, wet: boolean, id: string): NightMember {
  const outfit = outfitFor(role === 'kid' ? 'child' : 'ordinary', r);
  if (role === 'kid') return { id, outfit, guise: pickWeighted(KID_COSTUMES, r()), kid: true, scale: 0.62 + r() * 0.12, acc: r() < 0.75 ? 'bucket' : 'bag', umbrella: false };
  if (role === 'teen') return { id, outfit, guise: r() < 0.9 ? pickWeighted(TEEN_COSTUMES, r()) : null, kid: false, scale: 0.9 + r() * 0.08, acc: null, umbrella: wet && r() < 0.25 };
  // Adulte qui accompagne (30 % : un accessoire) ou qui va à une soirée (60 % : déguisé, sinon un accessoire une fois sur deux).
  const party = kind === 'adults';
  const g = r();
  const guise: Guise | null = party ? (g < 0.6 ? pickWeighted(ADULT_COSTUMES, r()) : g < 0.8 ? TOUCHES[Math.floor(r() * 3)]! : null) : g < 0.3 ? TOUCHES[Math.floor(r() * 3)]! : null;
  return { id, outfit, guise, kid: false, scale: 0.96 + r() * 0.08, acc: null, umbrella: wet };
}

function groupOf(kind: NightKind, t0: number, r: () => number, wet: boolean, id: string, unit: number): NightGroup {
  const dir: 1 | -1 = r() < 0.5 ? 1 : -1;
  const members: NightMember[] = [];
  if (kind === 'family') {
    const n = 1 + (r() < 0.55 ? 1 : 0) + (r() < 0.2 ? 1 : 0);
    for (let i = 0; i < n; i++) members.push(memberOf(kind, 'kid', r, wet, `${id}-${i}`));
    members.push(memberOf(kind, 'adult', r, wet, `${id}-a`));
  } else if (kind === 'teens') {
    const n = 2 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) members.push(memberOf(kind, 'teen', r, wet, `${id}-${i}`));
  } else {
    for (let i = 0; i < 2; i++) members.push(memberOf(kind, 'adult', r, wet, `${id}-${i}`));
    // Au moins un des deux vraiment déguisé.
    if (!members.some((m) => m.guise && !(TOUCHES as readonly string[]).includes(m.guise))) members[0]!.guise = pickWeighted(ADULT_COSTUMES, r());
    members[1]!.umbrella = false;
  }
  const speed = SPEED[kind] * (0.92 + r() * 0.16) * (wet ? 1.08 : 1);
  return { id, kind, dir, members, gap: GAP[kind] * (wet && kind === 'family' ? 0.75 : 1) * unit, speed, pieces: [], t0, t1: t0 };
}

type Busy = { free(door: number, kind: StopKind | 'scare', t: number): boolean; take(door: number, kind: StopKind | 'scare', t: number): void };
function busyRegistry(): Busy {
  const taken = new Map<number, [number, number][]>();
  return {
    free: (door, kind, t) => {
      const [a, b] = BUSY[kind];
      return !(taken.get(door) ?? []).some(([x, y]) => t + a < y && t + b > x);
    },
    take: (door, kind, t) => {
      const [a, b] = BUSY[kind];
      const l = taken.get(door) ?? [];
      l.push([t + a, t + b]);
      taken.set(door, l);
    },
  };
}
const residentOf = (seed: number, doorId: string): { resident: Outfit; hat: boolean } => ({
  resident: outfitFor('ordinary', mulberry32(seed ^ hashString(`halloween-night-res:${doorId}`))),
  hat: hashString(`halloween-night-hat:${doorId}`) % 3 === 0,
});

// Trajet d'un groupe : il entre par un bord et ressort par l'autre ; familles : arrêt aux entrées décorées (80 %) ou aux
// immeubles à citrouille (35 %), on leur ouvre 85 % des fois (50 % sans décor) ; jeunes : 18 % sonnent et s'enfuient une fois.
function pathOf(g: NightGroup, st: NightStreet, r: () => number, busy: Busy, plan: NightPlan, seed: number): void {
  const u = st.unit;
  const trail = g.gap * g.members.length;
  let x = g.dir > 0 ? -EDGE : st.width + EDGE;
  const xEnd = g.dir > 0 ? st.width + EDGE + trail : -EDGE - trail;
  let t = g.t0;
  let rang = false;
  const walkTo = (x1: number, k = 1): void => {
    const dt = Math.abs(x1 - x) / (g.speed * k);
    g.pieces.push({ mode: k > 1 ? 'run' : 'walk', t0: t, t1: t + dt, x0: x, x1 });
    t += dt;
    x = x1;
  };
  const ahead = st.doors.map((d) => ({ id: d.id, c: d.x + DOOR_WIDTH / 2 })).sort((a, b) => g.dir * (a.c - b.c));
  for (const d of ahead) {
    const stopX = d.c - g.dir * (g.kind === 'teens' ? 12 : 6) * u;
    if (g.dir * (stopX - x) <= 0) continue;
    let kind: StopKind | null = null;
    if (g.kind === 'family') {
      const dec = st.decorated.has(d.id);
      const p = dec ? 0.8 : st.pumpkins.has(d.id) ? 0.35 : 0;
      const a = r();
      const b = r();
      if (a < p) kind = b < (dec ? 0.85 : 0.5) ? 'treat' : 'nobody';
    } else if (g.kind === 'teens' && !rang && r() < 0.18) kind = 'ring';
    if (!kind) continue;
    const tArr = t + Math.abs(stopX - x) / g.speed;
    if (!busy.free(d.c, kind, tArr)) continue;
    walkTo(stopX);
    busy.take(d.c, kind, t);
    const dur = kind === 'treat' ? TREAT_S : kind === 'nobody' ? NOBODY_S : RING_S;
    const stop: NightStop = { kind, door: d.c, doorId: d.id, ...residentOf(seed, d.id) };
    g.pieces.push({ mode: 'stop', t0: t, t1: t + dur, x0: x, x1: x, stop });
    if (kind !== 'nobody') pushEvent(plan, { kind, door: d.c, t0: t, group: g, stop });
    t += dur;
    if (kind === 'ring') {
      rang = true;
      walkTo(x + g.dir * RUN.dist * u, RUN.k);
    }
  }
  walkTo(xEnd);
  g.t1 = t;
}
function pushEvent(plan: NightPlan, e: DoorEvent): void {
  const l = plan.doors.get(e.door) ?? [];
  l.push(e);
  plan.doors.set(e.door, l);
}

// Plan de la soirée du 31 (vide les autres jours). `wet` : pluie au moment du calcul (le plan change avec elle).
export function halloweenNight(date: YMD, st: NightStreet, seed: number, wet: boolean): NightPlan {
  const plan: NightPlan = { groups: [], scares: [], doors: new Map() };
  if (!isHalloweenNight(date) || st.doors.length === 0) return plan;
  const busy = busyRegistry();
  const k = st.width / 720;
  const iso = isoDate(date);
  for (let m = 16 * 60; m < 24 * 60; m++) {
    const h = m / 60;
    const r = mulberry32(seed ^ hashString(`halloween-night:${iso}:${wet ? 'w' : 'd'}:${m}`));
    for (const kind of ['family', 'teens', 'adults'] as const) {
      const rate = nightRate(kind, h, wet) * k;
      const n = Math.floor(rate) + (r() < rate % 1 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const g = groupOf(kind, m * 60 + r() * 60, r, wet, `hn-${kind}-${m}-${i}`, st.unit);
        pathOf(g, st, r, busy, plan, seed);
        plan.groups.push(g);
      }
    }
    // Faire peur : de 20 h 30 à 22 h 45, environ une fois toutes les 7 minutes pour 720 px (pluie comprise).
    if (h >= 20.5 && h < 22.75 && r() < Math.min(1, k / 7)) {
      const d = st.doors[Math.floor(r() * st.doors.length)]!;
      const c = d.x + DOOR_WIDTH / 2;
      const t0 = m * 60 + r() * 60;
      const dir: 1 | -1 = r() < 0.5 ? 1 : -1;
      const teen = memberOf('teens', 'teen', r, false, `hn-scare-${m}-t`);
      teen.guise = (['zombie', 'skeleton', 'ghost', 'vampire', 'mummy'] as const)[Math.floor(r() * 5)]!;
      const victim = memberOf('adults', 'adult', r, wet, `hn-scare-${m}-v`);
      victim.guise = null;
      if (busy.free(c, 'scare', t0)) {
        busy.take(c, 'scare', t0);
        const s: NightScare = { id: `hn-scare-${m}`, door: c, doorId: d.id, t0, dir, teen, victim, speed: 11 };
        plan.scares.push(s);
        pushEvent(plan, { kind: 'scare', door: c, t0 });
      }
    }
  }
  return plan;
}

// ── Lecture à la seconde ──
export const pieceAt = (g: NightGroup, s: number): Piece | null => g.pieces.find((p) => s >= p.t0 && s < p.t1) ?? null;

// Figure à l'instant : `x` (px), `step` (0 = ligne des passants, 1 = pas de la porte), orientation et pose du pantin, `walked`
// (px parcourus, phase des pas), `held` (seau tendu, parapluie : la couche les pose), `back` (vu de dos).
export type NightFigure = { member: NightMember; x: number; step: number; yaw: number; gait: Gait; arms: ArmPose; head: number; walked: number };
const smooth = (v: number): number => {
  const t = Math.min(1, Math.max(0, v));
  return t * t * (3 - 2 * t);
};
// Bras d'un enfant qui marche : seau tenu devant lui.
const kidArms = (m: NightMember): ArmPose => (m.acc ? 'hold' : 'swing');
// Zombie : bras tendus (sauf sous un parapluie).
const walkArms = (m: NightMember): ArmPose => (m.kid ? kidArms(m) : m.guise === 'zombie' && !m.umbrella ? 'handlebar' : 'swing');

export function groupFigures(g: NightGroup, s: number, unit: number, out: NightFigure[] = []): NightFigure[] {
  const p = pieceAt(g, s);
  if (!p) return out;
  const slot = (i: number): number => -g.dir * i * g.gap;
  const face = facingYaw(g.dir);
  if (p.mode !== 'stop') {
    const q = (s - p.t0) / (p.t1 - p.t0);
    const x = p.x0 + (p.x1 - p.x0) * q;
    const run = p.mode === 'run';
    g.members.forEach((m, i) => {
      // Fin de la course : ils s'arrêtent de courir en riant (les derniers mètres au pas).
      const laugh = run && q > 0.75;
      out.push({ member: m, x: x + slot(i), step: 0, yaw: face, gait: laugh ? 'step' : 'walk', arms: run ? (laugh ? 'crossed' : 'swing') : walkArms(m), head: 0, walked: (s - g.t0) * g.speed });
    });
    return out;
  }
  const st = p.stop!;
  const t = s - p.t0;
  const dur = p.t1 - p.t0;
  if (st.kind === 'ring') {
    // Le premier file à la porte, sonne, revient en courant ; les autres attendent un peu plus loin, accroupis.
    g.members.forEach((m, i) => {
      const home = p.x0 + slot(i) - g.dir * 2 * unit;
      if (i > 0) {
        out.push({ member: m, x: home, step: 0, yaw: face, gait: 'crouch', arms: 'down', head: 0, walked: 0 });
        return;
      }
      const go = smooth(t / 1.4);
      const back = smooth((t - 2.3) / 1.4);
      const k = go * (1 - back);
      const moving = t < 1.4 || t > 2.3;
      out.push({ member: m, x: home + (st.door - home) * k, step: k, yaw: moving ? facingYaw(t < 1.4 ? g.dir : (-g.dir as 1 | -1)) : YAW_BACK, gait: moving ? 'walk' : 'stand', arms: moving ? 'swing' : 'point', head: 0, walked: t * g.speed * RUN.k });
    });
    return out;
  }
  // Porte-à-porte : les enfants vont au pas de la porte, l'aîné sonne ; l'adulte attend au bord du trottoir.
  const kids = g.members.filter((m) => m.kid);
  const nk = kids.length;
  const answered = st.kind === 'treat';
  g.members.forEach((m, i) => {
    if (!m.kid) {
      out.push({ member: m, x: p.x0 + slot(Math.max(nk, 1)) * 0.6, step: 0, yaw: YAW_FRONT - g.dir, gait: 'stand', arms: 'swing', head: Math.round(Math.sin(s / 3) * 2), walked: 0 });
      return;
    }
    const k = kids.indexOf(m);
    const spot = st.door + (k - (nk - 1) / 2) * 4.5 * unit;
    const path = p.x0 + slot(i);
    const leave = dur - 3.2;
    const q = smooth(t / 2.4) * (1 - smooth((t - leave) / 2.4));
    const x = path + (spot - path) * q;
    if (t < 2.4 || t > leave) {
      const towards = t < 2.4 ? spot - path : path - spot;
      out.push({ member: m, x, step: q, yaw: towards === 0 ? face : facingYaw(towards > 0 ? 1 : -1), gait: 'walk', arms: kidArms(m), head: 0, walked: t * g.speed });
      return;
    }
    let arms: ArmPose = 'down';
    if (k === 0 && ((t >= 2.6 && t < 3.6) || (!answered && t >= 7 && t < 7.8))) arms = 'point';
    if (answered) {
      const tg = 9 + k * 2.4;
      if (t >= tg - 0.6 && t < tg + 1.6) arms = 'give';
      if (t >= 17 && t < 19) arms = 'cheer';
    }
    const head = !answered && t > 9 ? Math.round(Math.sin(s * 2 + k) * 2) : 0;
    out.push({ member: m, x, step: 1, yaw: YAW_BACK, gait: 'stand', arms, head, walked: 0 });
  });
  return out;
}

// Porte à l'instant : ouverture (0..1) et fin de minuterie du hall à poser si elle doit être allumée (null : rien à poser).
export function doorStateAt(events: readonly DoorEvent[] | undefined, s: number): { open: number; hallUntil: number | null } {
  let open = 0;
  let hall: number | null = null;
  for (const e of events ?? []) {
    const t = s - e.t0;
    if (e.kind === 'treat') {
      if (t >= 4.5 && t < 4.5 + HALL_S) hall = Math.max(hall ?? -Infinity, e.t0 + 4.5 + HALL_S);
      open = Math.max(open, Math.min(1, Math.max(0, t - 7.5)) * Math.min(1, Math.max(0, 20.5 - t)));
    } else if (e.kind === 'ring') {
      if (t >= 8 && t < 8 + HALL_S) hall = Math.max(hall ?? -Infinity, e.t0 + 8 + HALL_S);
      open = Math.max(open, Math.min(1, Math.max(0, t - 12)) * Math.min(1, Math.max(0, 19.5 - t)));
    } else if (e.kind === 'scare') {
      open = Math.max(open, t > -22 && t < 5.5 ? 0.25 : t >= 5.5 && t < 10.5 ? 0.6 : t >= 10.5 && t < 12.5 ? 0.6 * (1 - (t - 10.5) / 2) : 0);
    }
  }
  return { open, hallUntil: hall };
}

// Habitant dans l'embrasure : porte-à-porte (8 → 20,2 s : coupe tenue, il donne à chaque enfant à son tour) ; sonner et
// s'enfuir (12,6 → 19,2 s : il regarde à gauche, à droite, personne). null : pas là.
export function residentAt(e: DoorEvent, s: number): { arms: ArmPose; yaw: number; head: number; giving: number | null } | null {
  const t = s - e.t0;
  if (e.kind === 'treat') {
    if (t < 8 || t >= 20.2) return null;
    const k = Math.floor((t - 9) / 2.4);
    const q = (t - 9) / 2.4 - k;
    const nk = e.group?.members.filter((m) => m.kid).length ?? 0;
    const giving = t >= 9 && k < nk && q > 0.25 && q < 0.75 ? k : null;
    return { arms: giving !== null ? 'give' : 'carry', yaw: YAW_FRONT, head: 0, giving };
  }
  if (e.kind === 'ring') {
    if (t < 12.6 || t >= 19.2) return null;
    const look = Math.floor((t - 13) / 1.4);
    return { arms: 'down', yaw: YAW_FRONT, head: t < 13 ? 0 : look % 2 ? 3 : -3, giving: null };
  }
  return null;
}

// Faire peur, à l'instant : le jeune (tapi, surgit, rit, rentre) et le passant (arrive, sursaute, main au cœur, repart).
export type ScareFigure = { x: number; step: number; yaw: number; gait: Gait; arms: ArmPose; head: number; walked: number; hidden: boolean; fade: number };
export function scareAt(sc: NightScare, s: number, unit: number, width: number): { teen: ScareFigure | null; victim: ScareFigure | null } {
  const t = s - sc.t0;
  const out: { teen: ScareFigure | null; victim: ScareFigure | null } = { teen: null, victim: null };
  const toward = facingYaw((-sc.dir) as 1 | -1);
  const outX = sc.door - sc.dir * 2 * unit;
  if (t >= -22 && t < 12) {
    if (t < 5.5) out.teen = { x: sc.door, step: 1, yaw: toward, gait: 'crouch', arms: 'down', head: 0, walked: 0, hidden: true, fade: 1 };
    else if (t < 6.3) { const q = smooth((t - 5.5) / 0.8); out.teen = { x: sc.door + (outX - sc.door) * q, step: 1 - q * 0.8, yaw: toward, gait: 'walk', arms: 'overhead', head: 0, walked: t * 20, hidden: false, fade: 1 }; }
    else if (t < 8.5) out.teen = { x: outX, step: 0.2, yaw: toward, gait: 'stand', arms: 'overhead', head: 0, walked: 0, hidden: false, fade: 1 };
    else if (t < 9.5) out.teen = { x: outX, step: 0.2, yaw: toward, gait: 'step', arms: 'crossed', head: 0, walked: 0, hidden: false, fade: 1 };
    else { const q = smooth((t - 9.5) / 2); out.teen = { x: outX + (sc.door - outX) * q, step: 0.2 + 0.8 * q, yaw: YAW_BACK, gait: 'walk', arms: 'swing', head: 0, walked: t * 10, hidden: false, fade: 1 - Math.max(0, Math.min(1, (t - 10.8) / 1.2)) }; }
  }
  const stopX = sc.door - sc.dir * 10 * unit;
  const x0 = sc.dir > 0 ? -EDGE : width + EDGE;
  const tWalk = Math.abs(stopX - x0) / sc.speed;
  const face = facingYaw(sc.dir);
  if (t >= 5.8 - tWalk && t < 5.8) out.victim = { x: stopX + (x0 - stopX) * ((5.8 - t) / tWalk), step: 0, yaw: face, gait: 'walk', arms: 'swing', head: 0, walked: (t - 5.8 + tWalk) * sc.speed, hidden: false, fade: 1 };
  else if (t >= 5.8 && t < 9.5) {
    const back = smooth((t - 5.8) / 0.5) * 3 * unit;
    out.victim = { x: stopX - sc.dir * back, step: 0, yaw: face, gait: t < 6.4 ? 'step' : 'stand', arms: t < 7.2 ? 'stretch-1' : 'cup', head: t < 7.2 ? -2 : 0, walked: 0, hidden: false, fade: 1 };
  } else if (t >= 9.5) {
    const x = stopX - sc.dir * 3 * unit + sc.dir * (t - 9.5) * sc.speed * 1.35;
    if (x > -EDGE && x < width + EDGE) out.victim = { x, step: 0, yaw: face, gait: 'walk', arms: 'swing', head: 0, walked: (t - 9.5) * sc.speed * 1.35, hidden: false, fade: 1 };
  }
  return out;
}
// Le passant visé est-il dans le champ entre `t0 − marge` et la fin de la farce ? (la couche ne garde que les farces en cours).
export const scareSpan = (sc: NightScare, width: number): [number, number] => [sc.t0 - 22 - (width + 2 * EDGE) / sc.speed, sc.t0 + 9.5 + (width + 2 * EDGE) / (sc.speed * 1.35)];
