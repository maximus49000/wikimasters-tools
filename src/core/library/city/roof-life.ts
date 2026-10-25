import { hashString, mulberry32 } from '../scene-world';
import type { FacadeLayout } from './facade-layout';
import type { SceneDay } from './scene-day';
import type { Schedule } from './schedules';

// Vie des toits du premier plan (spec 2026-10-19 « vie au-dessus de la rue », objectif 4, §5.2 ; maquette
// docs/superpowers/maquettes/vie-etages/src/07b-balcon-toit.js : `catState`, `flockState`, `paintSmoke`, `paintRoofer`).
// Fonctions pures de (graine, date ISO, minute, météo du jour) : aucun état caché. Rien n'apparaît ni ne disparaît sur
// place : le chat sort et rentre par la tabatière, les pigeons arrivent et repartent en vol par le haut de la scène, le
// couvreur monte et redescend par l'arrière du toit (caché sous la ligne du terrasson). Imprévisible d'un jour à l'autre mais
// logique : trois sorties du chat tirées dans leurs créneaux (aucune sous la pluie), pigeons le jour seulement, fumées en
// hiver quand quelqu'un est chez soi, couvreur le mardi et le jeudi par temps sec.
// Minutes depuis minuit du jour de scène (secondes de scène = minutes × 60 pour les phases des dessins).

const SEC = 1 / 60;
const sat = (v: number): number => Math.min(1, Math.max(0, v));
const smooth = (t: number): number => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
// Ligne du terrasson où l'on marche (maquette : roofWalk.y = top + 0,6) ; le faîtage du terrasson est à top + 0,5.
export const walkY = (l: FacadeLayout): number => l.top + 0.6;
const terrasson = (l: FacadeLayout): [number, number] => [l.x + 6, l.x + l.w - 6];

// Souche visible : son couronnement et ses pots (d'où sort la fumée, contre lesquels le chat s'assoit) ne sont recouverts
// par aucune lucarne (le peintre des toits pose les lucarnes après les souches ; une tabatière tombe parfois sur une souche et
// la cache). Le bas d'une souche caché par un fronton ne compte pas. Ni fumée ni chat contre une souche cachée.
export function chimneyVisible(l: FacadeLayout, k: number): boolean {
  const c = l.chimneys[k];
  if (!c) return false;
  const [cy0, cy1] = [c.top - 2.3, c.top + 1.2];
  return l.dormers.every((d) => {
    // Boîte peinte : tabatière penchée (+1,2 à droite), capucine avec son toit (2,8 au-dessus, débord 2,5), les autres à leur cadre.
    const [x0, x1, y0] = d.type === 'tabatiere' ? [d.cx - d.w / 2, d.cx + d.w / 2 + 1.2, d.y] : d.type === 'capucine' ? [d.cx - d.w / 2 - 2.5, d.cx + d.w / 2 + 2.5, d.y - 2.8] : [d.cx - d.w / 2 - 1.2, d.cx + d.w / 2 + 1.2, d.y];
    // Cachée si la lucarne couvre au moins 1,5 px des 4 px du fût (un bord de couronnement mordu ne compte pas).
    return Math.min(x1, c.x + 4) - Math.max(x0, c.x) < 1.5 || d.y + d.h <= cy0 || y0 >= cy1;
  });
}

// ───────────── chat ─────────────
export type CatPose = { x: number; y: number; pose: 'emerge' | 'walk' | 'sit'; phase: number; dir: 1 | -1 } | null;
export type Outing = { start: number; dur: number };
// Sortie (et rentrée) par la tabatière : 20 s ; marche jusqu'à la souche à 0,8 px/s (entre 10 et 50 s).
export const CAT_EMERGE = 20 * SEC;
const CAT_SPEED = 0.8; // px/s
const CAT_SLOTS: readonly (readonly [number, number])[] = [[600, 720], [900, 1020], [1320, 1440]];
const CAT_DUR: readonly [number, number] = [40, 55];
const CAT_P = 0.5; // part des toits éligibles qui ont un chat
const CAT_MAX = 2;

// Toits qui ont un chat (index dans `layouts`) : à la Mansart avec une tabatière ; la moitié d'entre eux (tirage de la ville,
// le même chaque jour : un chat habite son toit), deux au plus.
export function catRoofs(layouts: readonly (FacadeLayout | null)[], seed: number): number[] {
  const out: number[] = [];
  layouts.forEach((l, i) => {
    if (!l || l.roof.kind !== 'mansard' || !l.dormers.some((d) => d.type === 'tabatiere')) return;
    if (mulberry32(seed ^ hashString('cat-roof') ^ Math.round(l.x * 8))() < CAT_P && out.length < CAT_MAX) out.push(i);
  });
  return out;
}

// Trois sorties tirées par jour : 10 h-12 h, 15 h-17 h, 22 h-24 h, chacune de 40 à 55 min, entière dans son créneau.
export function catOutings(seed: number, iso: string, facadeIndex: number): Outing[] {
  const rng = mulberry32(seed ^ hashString(iso) ^ hashString('cat') ^ Math.imul(facadeIndex + 1, 0x9e3779b1));
  return CAT_SLOTS.map(([a, b]) => {
    const dur = lerp(CAT_DUR[0], CAT_DUR[1], rng());
    return { start: a + rng() * (b - a - dur), dur };
  });
}

// Chemin du chat : de la tabatière (cx + 2,5, comme le dessin) à la souche la plus proche (assis contre elle, du côté de la
// tabatière), sur le terrasson.
function catPath(l: FacadeLayout): { x0: number; x1: number; walk: number } | null {
  if (l.roof.kind !== 'mansard') return null;
  const tab = l.dormers.find((d) => d.type === 'tabatiere');
  if (!tab) return null;
  const [lo, hi] = terrasson(l);
  const x0 = tab.cx + 2.5;
  const ch = l.chimneys.filter((_, k) => chimneyVisible(l, k)).sort((a, b) => Math.abs(a.x + 2 - x0) - Math.abs(b.x + 2 - x0))[0];
  const x1 = clamp(ch ? (ch.x + 2 < x0 ? ch.x + 4 + 1.8 : ch.x - 1.8) : x0 + 8, lo, hi);
  return { x0, x1, walk: clamp(Math.abs(x1 - x0) / CAT_SPEED, 10, 50) * SEC };
}

// Sorties maintenues par temps sec : `wet` = intervalles de pluie [début, fin] (fin = Infinity si elle dure). Une sortie
// commencée sous la pluie est annulée ; une averse en cours de sortie fait rentrer le chat : il finit d'aller à la souche s'il
// y allait, puis revient tout de suite (pas de saut).
export function dryOutings(outings: readonly Outing[], wet: readonly (readonly [number, number])[], walk = 50 * SEC): Outing[] {
  const out: Outing[] = [];
  for (const o of outings) {
    if (wet.some(([a, b]) => o.start >= a && o.start <= b)) continue;
    const rain = wet.map(([a]) => a).filter((a) => a > o.start && a < o.start + o.dur).sort((p, q) => p - q)[0];
    if (rain === undefined) {
      out.push(o);
      continue;
    }
    const back = Math.max(rain, o.start + CAT_EMERGE + walk);
    out.push({ start: o.start, dur: Math.min(o.dur, back + walk + CAT_EMERGE - o.start) });
  }
  return out;
}

// Pose du chat à la minute `m` : sort (emerge 0 → 1), marche jusqu'à la souche, s'assoit, revient, rentre (emerge 1 → 0, en
// regardant la tabatière). null hors des sorties, ou toit sans tabatière.
export function catState(l: FacadeLayout, outings: readonly Outing[], m: number): CatPose {
  const path = catPath(l);
  if (!path) return null;
  const { x0, x1, walk } = path;
  const y = walkY(l);
  const out: 1 | -1 = x1 >= x0 ? 1 : -1;
  for (const { start: a, dur } of outings) {
    const b = a + dur;
    if (m < a || m > b) continue;
    const s = (m - a) * 60;
    const em = CAT_EMERGE;
    // Sortie raccourcie (averse) : marche aller et retour se partagent la durée, sans pause.
    const w = Math.min(walk, (dur - 2 * em) / 2);
    if (m < a + em) return { x: x0, y, pose: 'emerge', phase: (m - a) / em, dir: out };
    if (m < a + em + w) return { x: lerp(x0, x1, (m - a - em) / walk), y, pose: 'walk', phase: s, dir: out };
    const xs = lerp(x0, x1, w / walk);
    if (m < b - em - w) return { x: xs, y, pose: 'sit', phase: s, dir: (-out) as 1 | -1 };
    if (m < b - em) return { x: lerp(xs, x0, (m - (b - em - w)) / w), y, pose: 'walk', phase: s, dir: (-out) as 1 | -1 };
    return { x: x0, y, pose: 'emerge', phase: sat((b - m) / em), dir: (-out) as 1 | -1 };
  }
  return null;
}
export const catWalkMinutes = (l: FacadeLayout): number => catPath(l)?.walk ?? 50 * SEC;

// ───────────── pigeons ─────────────
export type PigeonBird = { id: number; x: number; y: number; pose: 'perch' | 'peck' | 'fly'; phase: number; dir: 1 | -1 };
// Volée d'un toit pour la journée : oiseaux (place sur la corniche, sens), cycle P (min) et son origine, heures d'arrivée du
// matin et de départ du soir, côté du départ (+1 : vers la droite).
export type PigeonFlock = { birds: { id: number; x: number; dir: 1 | -1 }[]; y: number; P: number; phase: number; open: number; close: number; side: 1 | -1 };
const PIGEON_HOST = 0.3; // part des toits qui ont des pigeons ce jour-là
const FLIGHT = 25 * SEC; // envol et retour
const PERCHED = 0.72; // part du cycle passée posée
const STAGGER = 0.1; // décalage d'un oiseau à l'autre dans la volée (part du vol)
const PECK_SLICE = 7; // s : un oiseau picore ou reste posé par tranches de 7 s
const PECK_P = 0.35;
const SKY_Y = -14; // au-dessus du haut de la scène

// Jusqu'à deux volées de 1 à 3 pigeons sur la corniche (eave − 0,8, de la corniche au toit), tirées par jour et par toit.
// `sun` : lever et coucher du lieu (`SceneDay`) ; les pigeons arrivent après le lever (7 h-7 h 45 au plus tôt) et partent
// vers le coucher (de 15 min avant à 30 min après, 19 h 30-20 h 45 au plus tard : un long jour d'été ne les garde pas).
export function pigeonFlocks(l: FacadeLayout, seed: number, iso: string, sun?: { sunrise: number; sunset: number }): PigeonFlock[] {
  const rng = mulberry32(seed ^ hashString(iso) ^ hashString('pigeons') ^ Math.round(l.x * 8));
  if (rng() >= PIGEON_HOST || l.w < 20) return [];
  const flocks: PigeonFlock[] = [];
  let id = 0;
  const n = rng() < 0.5 ? 1 : 2;
  for (let k = 0; k < n; k++) {
    const count = 1 + Math.floor(rng() * 3);
    const span = (count - 1) * 3.2;
    // Chaque volée a sa part de la corniche (deux volées ne se chevauchent pas).
    const seg = (l.w - 6) / n;
    const cx = l.x + 3 + k * seg + span / 2 + rng() * Math.max(0, seg - span);
    const birds = Array.from({ length: count }, (_, i) => ({ id: id++, x: cx - span / 2 + i * 3.2, dir: (rng() < 0.5 ? 1 : -1) as 1 | -1 }));
    const P = 11 + rng() * 6;
    const phase = rng() * P, rOpen = rng(), rClose = rng();
    const open = Math.max(420 + rOpen * 45, sun ? sun.sunrise + rOpen * 30 : 0);
    const close = Math.min(1170 + rClose * 75, sun ? sun.sunset - 15 + rClose * 45 : Infinity);
    flocks.push({ birds, y: l.eave - 0.8, P, phase, open, close, side: rng() < 0.5 ? 1 : -1 });
  }
  return flocks;
}

const bezier = (p0: number, c: number, p1: number, q: number): number => (1 - q) * (1 - q) * p0 + 2 * (1 - q) * q * c + q * q * p1;

// Oiseaux visibles à la minute `m` (absents : rien) : posés (picorent par instants, jamais sous la pluie), envol vers le haut
// de la scène puis retour du côté opposé. Un cycle commence à l'atterrissage ; seuls comptent les cycles posés entre l'arrivée
// du matin et le départ du soir (la nuit, les pigeons sont ailleurs).
export function pigeonsOf(flocks: readonly PigeonFlock[], m: number, wet: boolean): PigeonBird[] {
  const out: PigeonBird[] = [];
  const s = m * 60;
  for (const f of flocks) {
    const n = f.birds.length;
    // Cycle k : atterrissage fini à L = phase + k·P, posé jusqu'à L + PERCHED·P, envol, absent, retour (cycle k + 1).
    const k = Math.floor((m - f.phase + FLIGHT) / f.P);
    const L = f.phase + k * f.P;
    const active = (start: number): boolean => start >= f.open && start + PERCHED * f.P <= f.close;
    if (!active(L)) continue;
    const c = m - L;
    let mode: 'land' | 'perch' | 'takeoff';
    let p = 0;
    if (c < 0) [mode, p] = ['land', (c + FLIGHT) / FLIGHT];
    else if (c < PERCHED * f.P) mode = 'perch';
    else if (c < PERCHED * f.P + FLIGHT) [mode, p] = ['takeoff', (c - PERCHED * f.P) / FLIGHT];
    else continue;
    f.birds.forEach((b, i) => {
      if (mode === 'perch') {
        const slice = Math.floor(s / PECK_SLICE);
        const peck = !wet && mulberry32(hashString(`${b.id}:${slice}`) ^ Math.round(f.phase * 1000))() < PECK_P;
        out.push({ id: b.id, x: b.x, y: f.y, pose: peck ? 'peck' : 'perch', phase: s + i, dir: b.dir });
        return;
      }
      // Avancement propre à l'oiseau (les premiers partent avant), 0 au perchoir, 1 hors de la scène.
      const q = sat(p * (1 + STAGGER * (n - 1)) - (mode === 'takeoff' ? i : n - 1 - i) * STAGGER);
      const away = mode === 'takeoff' ? q : 1 - q;
      if (away <= 0) {
        out.push({ id: b.id, x: b.x, y: f.y, pose: 'perch', phase: s + i, dir: b.dir });
        return;
      }
      const side = mode === 'takeoff' ? f.side : -f.side;
      // Sens réel de la marche : vers `f.side` au départ comme au retour (au retour l'oiseau vient de l'autre côté).
      const far = [b.x + side * (95 + i * 12), SKY_Y - i * 4];
      const ctl = [b.x + side * 30, f.y - 60];
      out.push({ id: b.id, x: bezier(b.x, ctl[0]!, far[0]!, away), y: bezier(f.y, ctl[1]!, far[1]!, away), pose: 'fly', phase: s * 9 + i, dir: f.side });
    });
  }
  return out;
}

export function pigeonsAt(l: FacadeLayout, seed: number, iso: string, m: number, wet: boolean, sun?: { sunrise: number; sunset: number }): PigeonBird[] {
  return pigeonsOf(pigeonFlocks(l, seed, iso, sun), m, wet);
}

// ───────────── fumées ─────────────
const SMOKE_P = 0.5; // part des souches qui fument (feu allumé), tirée par jour (maquette : 0,7, trop chargé à 20 souches)

// Par souche visible : fume en hiver (`cold`) si quelqu'un est chez soi sous ce toit ; la moitié des souches, tirées par jour.
export function smokeAt(l: FacadeLayout, day: SceneDay, anyoneHome: boolean, seed: number): boolean[] {
  const rng = mulberry32(seed ^ hashString(day.iso) ^ hashString('smoke') ^ Math.round(l.x * 8));
  return l.chimneys.map((_, k) => rng() < SMOKE_P && day.cold && anyoneHome && chimneyVisible(l, k));
}

// Vent du jour pour les fumées (dérive, signe = sens) : le même pour toutes les souches.
export function smokeWind(seed: number, iso: string): number {
  const rng = mulberry32(seed ^ hashString(iso) ^ hashString('wind'));
  return (rng() < 0.5 ? -1 : 1) * (0.5 + rng() * 0.7);
}

// Quelqu'un du foyer (membres 0 à members − 1, invités exclus) est-il chez lui à la minute `m` ? Sorti par la porte et pas
// encore revenu : dehors ; premier passage du jour = un retour (rentré de nuit, de vacances) : dehors jusque-là. Logement
// parti (emploi du temps vide) : personne.
export function homeOccupied(s: Schedule, members: number, m: number): boolean {
  if (s.segments.length === 0) return false;
  const last: (number | null)[] = new Array<number | null>(members).fill(null);
  const firstT: number[] = new Array<number>(members).fill(Infinity);
  const out: boolean[] = new Array<boolean>(members).fill(false);
  for (const g of s.segments) {
    if ((g.k !== 'depart' && g.k !== 'return') || g.m >= members || g.t >= firstT[g.m]!) continue;
    firstT[g.m] = g.t;
    out[g.m] = g.k === 'return';
  }
  for (const g of s.segments) {
    if ((g.k !== 'depart' && g.k !== 'return') || g.m >= members || g.t > m) continue;
    if (last[g.m] === null || g.t >= last[g.m]!) {
      last[g.m] = g.t;
      out[g.m] = g.k === 'depart';
    }
  }
  return out.some((o) => !o);
}

// ───────────── couvreur ─────────────
export type RooferPose = { facade: number; x: number; y: number; pose: 'kneel' | 'walk'; phase: number; dir: 1 | -1 } | null;
const ROOFER_DAYS = new Set([2, 4]);
const CLIMB = 30 * SEC; // montée ou descente par l'échelle de l'arrière
const ROOFER_SPEED = 1.1; // px/s
// Profondeur sous la ligne du terrasson où il est entièrement caché (pantin de 11 px, échelle du calque ≤ 1,2).
export const ROOFER_HIDE = 14;
const WORK_END = 990; // 16 h 30

type RooferDay = { facade: number; climbX: number; spot: number; bouts: [number, number][] };

// Journée du couvreur : un toit à la Mansart tiré, arrivée 9 h-9 h 25, pause de midi, départ 16 h 10-16 h 30. Il monte par
// l'arrière, à un bout du terrasson sans souche, et travaille aux deux tiers du toit (maquette : x + 0,62 w).
function rooferDay(facades: readonly FacadeLayout[], seed: number, day: SceneDay): RooferDay | null {
  if (!ROOFER_DAYS.has(day.weekday)) return null;
  const roofs = facades.map((l, i) => ({ l, i })).filter(({ l }) => l.roof.kind === 'mansard' && l.w >= 30);
  if (roofs.length === 0) return null;
  const rng = mulberry32(seed ^ hashString(day.iso) ^ hashString('roofer'));
  const { l, i } = roofs[Math.floor(rng() * roofs.length)]!;
  const [lo, hi] = terrasson(l);
  const free = (x: number): boolean => l.chimneys.every((c) => x < c.x - 3 || x > c.x + 7);
  const climbX = free(hi) ? hi : free(lo) ? lo : hi;
  const spot = clamp(l.x + l.w * 0.62, lo + 4, hi - 4);
  const arrive = 540 + rng() * 25;
  const lunch = 735 + rng() * 15;
  const back = 800 + rng() * 10;
  const leave = WORK_END - rng() * 20;
  return { facade: i, climbX, spot, bouts: [[arrive, lunch], [back, leave]] };
}

// Toit où travaille le couvreur ce jour-là (index dans `facades`), quel que soit le temps ; null : pas de couvreur.
export const rooferRoof = (facades: readonly FacadeLayout[], seed: number, day: SceneDay): number | null => rooferDay(facades, seed, day)?.facade ?? null;

// Couvreur à la minute `m` : monte par l'arrière du toit (pieds de ROOFER_HIDE px sous le terrasson à 0), marche jusqu'à son
// ouvrage, martèle à genoux, repart et redescend ; mardi et jeudi, 9 h-16 h 30, temps sec. `rainFrom` : minute où la pluie a
// commencé ce jour-là (le jour est alors humide) : il finit ce qu'il fait, redescend et ne revient pas ; pluie avant son
// arrivée (ou jour humide sans bascule connue) : il ne vient pas.
export function rooferAt(facades: readonly FacadeLayout[], seed: number, day: SceneDay, m: number, rainFrom?: number): RooferPose {
  const d = rooferDay(facades, seed, day);
  if (!d) return null;
  if (day.wet && rainFrom === undefined) return null;
  const l = facades[d.facade]!;
  const y0 = walkY(l);
  const walk = (Math.abs(d.spot - d.climbX) / ROOFER_SPEED) * SEC;
  const toSpot: 1 | -1 = d.spot >= d.climbX ? 1 : -1;
  const s = m * 60;
  for (const [a, b0] of d.bouts) {
    if (rainFrom !== undefined && rainFrom <= a) return null;
    const b = rainFrom !== undefined && rainFrom < b0 ? Math.min(b0, Math.max(rainFrom, a + CLIMB + walk) + walk + CLIMB) : b0;
    if (m < a || m > b) continue;
    const at = (x: number, y: number, pose: 'kneel' | 'walk', dir: 1 | -1): RooferPose => ({ facade: d.facade, x, y, pose, phase: s, dir });
    if (m < a + CLIMB) return at(d.climbX, y0 + (1 - smooth((m - a) / CLIMB)) * ROOFER_HIDE, 'walk', toSpot);
    if (m < a + CLIMB + walk) return at(lerp(d.climbX, d.spot, (m - a - CLIMB) / walk), y0, 'walk', toSpot);
    if (m < b - CLIMB - walk) return at(d.spot, y0, 'kneel', toSpot);
    if (m < b - CLIMB) return at(lerp(d.spot, d.climbX, (m - (b - CLIMB - walk)) / walk), y0, 'walk', (-toSpot) as 1 | -1);
    return at(d.climbX, y0 + smooth(sat((m - (b - CLIMB)) / CLIMB)) * ROOFER_HIDE, 'walk', (-toSpot) as 1 | -1);
  }
  return null;
}
