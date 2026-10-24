import { publicHolidays } from '../city/calendar';
import { lampLit } from '../city/lamps';
import { nightness, windowLit, type WindowDay } from '../city/window-lights';
import { light, shade } from './cel';
import type { CityPaintPlan, Landmark, PaintBuilding } from './city-plan';
import { hexRgb, mixRgb, type Rgb } from './color';
import type { Escape, FondHouse } from './fond-plan';
import { fondRng, fountainOn, lerp, ramp, sat, shutterK, slotHours, smooth, type FondMeteo, type FondMoment, type Season } from './fond-time';
import type { Grade } from './grade';

// Vie animée du fond (chantier « fond vivant », PR 2b) : port de `04-vie-fond.js` de la maquette validée
// (docs/superpowers/maquettes/fond-ville/, notes.md §3). Pur : l'état à l'instant T est une fonction de (graine, date, heure,
// météo), jamais de Math.random ni de l'horloge. Le calque SVG `vie-fond` (src/content/fond-life.tsx) monte une fois les
// nœuds de `vieModel` (liste FIXE, rien n'est créé ni détruit au fil du temps) et la boucle écrit, nœud par nœud, les
// attributs de `vieFrame` qui ont changé.
// Règles : rien n'apparaît ni ne disparaît sur place (voitures, piétons, fanfare : entrée et sortie derrière le mur du fond,
// par une gare ou par un bord ; oiseaux : par les bords du ciel ; fumées : naissent au conduit et se dissipent) ; tirages par
// graine + date + objet ; mouvement réduit : rien ne défile (voitures, piétons et oiseaux ne sortent pas, poses fixes).

type Pt = [number, number];
const TAU = Math.PI * 2;
const MIN = 1 / 60;
const SEC = 1 / 3600;
const HAZE = hexRgb('#9CC0E4');
const haze = (c: Rgb, t: number): Rgb => mixRgb(c, HAZE, t);
const hex = (c: Rgb): string => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
const INK = '#2a1a18';
const f1 = (v: number): string => (Math.round(v * 10) / 10).toString();
const f2 = (v: number): string => (Math.round(v * 100) / 100).toString();

// Palette (maquette, notes.md §4).
const CABIN = hexRgb('#C8463A');
const BUS = hexRgb('#E8B040');
const CARS = ['#D84A3A', '#F0F0E8', '#3A5A9A', '#8A8A90', '#E8C040', '#4A8A5A'].map(hexRgb);
const GLASS_FAR = hexRgb('#5A7AA8');
const SMOKE = hexRgb('#ECE8E4');
const CRANE = hexRgb('#F0C030');
const FLAG = ['#2E4A9A', '#F4F0E8', '#D84040'].map(hexRgb);
const SAIL = hexRgb('#F0E8D0');
const LIT_WARM = '#FFDFA0';
const LIT_BLUE = '#C4D8FF';
const FUNI_GAP = 2.2;

// Plafonds des réservoirs de nœuds (notes.md §3) : au plus 6 voitures et 6 piétons en route par échappée, 10 silhouettes de
// la fanfare, 12 panaches de fumée en vue, 3 nuées d'étourneaux et 4 vols de martinets.
export const VIE_POOL = { vehicles: 6, walkers: 6, kiosk: 10, plumes: 12, starlings: 3, swifts: 4 } as const;

// ── Jour de la vie : date, saison, type de jour (trafic, grasses matinées), fête nationale (drapeaux), froid (fumées), météo.
export type VieMeteo = FondMeteo & { fog: number };
export type VieDay = {
  date: string;
  prev: string;
  y: number;
  month: number;
  day: number;
  doy: number;
  weekday: number;
  season: Season;
  weekend: boolean;
  national: boolean;
  cold: boolean;
  week: number;
  sunset: number;
  meteo: VieMeteo;
};
const NATIONAL = new Set(['Fête nationale', 'Victoire de 1945', 'Armistice']);
const pad = (n: number): string => String(n).padStart(2, '0');
// Lever / coucher à Paris (heure locale) par mois, interpolés au jour près entre les milieux de mois (maquette, 01-outils.js).
const SUNS: readonly (readonly [number, number])[] = [[8.7, 17.3], [8.1, 18.2], [7.2, 19.0], [7.1, 20.7], [6.3, 21.4], [5.8, 21.9], [6.1, 21.8], [6.8, 21.1], [7.5, 20.1], [8.2, 19.0], [8.0, 17.3], [8.6, 16.9]];
export function sunsAt(month: number, day: number): [number, number] {
  const k = (day - 15) / 30;
  const a = SUNS[month - 1]!;
  const b = SUNS[(month - 1 + (k < 0 ? 11 : 1)) % 12]!;
  const t = Math.abs(k);
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
}
// `kind` : type du jour de la ville (calendar.ts, DayKind) quand il est connu ; sans lui, week-end et fériés du calendrier.
export function vieDay(m: FondMoment, opts: { kind?: string; fog?: number } = {}): VieDay {
  const holidays = publicHolidays(m.y);
  const holiday = holidays[m.date];
  const weekend = opts.kind !== undefined ? opts.kind === 'weekend' || opts.kind === 'public-holiday' : m.weekday === 0 || m.weekday === 6 || holiday !== undefined;
  const p = new Date(Date.UTC(m.y, m.month - 1, m.day - 1));
  const prev = `${p.getUTCFullYear()}-${pad(p.getUTCMonth() + 1)}-${pad(p.getUTCDate())}`;
  return {
    date: m.date,
    prev,
    y: m.y,
    month: m.month,
    day: m.day,
    doy: m.doy,
    weekday: m.weekday,
    season: m.season,
    weekend,
    national: holiday !== undefined && NATIONAL.has(holiday),
    cold: m.month <= 3 || m.month >= 11 || m.meteo.snow,
    week: Math.floor((Date.UTC(m.y, m.month - 1, m.day) / 864e5 + 3) / 7),
    sunset: sunsAt(m.month, m.day)[1],
    meteo: { ...m.meteo, fog: opts.fog ?? 0 },
  };
}

// ── Parcours (route, escalier, sentier d'une gare) : polyligne et longueurs cumulées.
export type VieRoute = { pts: Pt[]; cum: number[]; L: number };
export function routeOf(pts: readonly Pt[]): VieRoute {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]));
  return { pts: pts.slice(), cum, L: cum[cum.length - 1]! };
}
export function routeAt(r: VieRoute, d: number): { x: number; y: number; dir: number } {
  const dd = Math.max(0, Math.min(r.L, d));
  let lo = 1;
  let hi = r.pts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (r.cum[mid]! < dd) lo = mid + 1;
    else hi = mid;
  }
  const a = r.pts[lo - 1]!;
  const b = r.pts[lo]!;
  const l = r.cum[lo]! - r.cum[lo - 1]! || 1;
  const t = (dd - r.cum[lo - 1]!) / l;
  return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, dir: Math.sign(b[0] - a[0]) || 1 };
}
const quadPts = (p: readonly Pt[], n = 10): Pt[] => {
  const out: Pt[] = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const u = 1 - t;
    out.push([u * u * p[0]![0] + 2 * u * t * p[1]![0] + t * t * p[2]![0], u * u * p[0]![1] + 2 * u * t * p[1]![1] + t * t * p[2]![1]]);
  }
  return out;
};

// ── Modèle : emplacements lus dans le plan peint (fond-plan.ts), une fois par plan.
export type VieChimney = { x: number; y: number; s: number; haze: number; key: string; wall: boolean };
export type VieLamp = { x: number; y: number; u: number; off: number; mast: boolean };
export type VieWindow = { x: number; y: number; w: number; h: number; u: number; blue: boolean; alpha: number };
export type VieEscape = {
  e: Escape;
  road: VieRoute;
  // Haut de la route caché (derrière le mur du fond, le premier plan ou hors de la scène) : on peut y entrer et en sortir.
  topHidden: boolean;
  // Route du bas de la route jusqu'à la gare haute, par le sentier de la gare (null sans sentier).
  gare: VieRoute | null;
  stairs: VieRoute;
  kiosk: { x: number; y: number; d: number } | null;
  fountain: { x: number; y: number } | null;
};
export type VieModel = {
  W: number;
  H: number;
  seed: number;
  escapes: VieEscape[];
  chimneys: VieChimney[];
  landmarks: Landmark[];
  hillTop: Float32Array;
  nearTop: Float32Array;
  lamps: VieLamp[];
  windows: VieWindow[];
  clipHill: string;
  clipWall: string;
  nodes: VieNode[];
  // Trajets d'une heure (voitures, piétons) déjà tirés : clé échappée, date, heure.
  trips: Map<string, unknown>;
};

// Point caché : derrière le mur du fond ou le premier plan (découpe « colline »), ou hors de la scène.
export function hiddenAt(m: Pick<VieModel, 'W' | 'hillTop'>, x: number, y: number): boolean {
  if (x < -3 || x > m.W + 3) return true;
  const i = Math.max(0, Math.min(m.hillTop.length - 1, Math.round(x)));
  return y > m.hillTop[i]! + 0.5;
}
const pathAbove = (arr: Float32Array, W: number): string => {
  let d = `M0 -40`;
  for (let x = 0; x <= W; x++) d += `L${x} ${f1(arr[Math.min(arr.length - 1, x)]!)}`;
  return `${d}L${W} -40Z`;
};

const MODELS = new WeakMap<CityPaintPlan, VieModel>();
export function vieModel(plan: CityPaintPlan): VieModel {
  const hit = MODELS.get(plan);
  if (hit) return hit;
  const F = plan.fond;
  const W = plan.width;
  const H = plan.height;
  const base = { W, hillTop: F.hillTop };
  const escapes: VieEscape[] = F.escapes.map((e) => {
    const road = routeOf(e.road);
    const top = road.pts[road.pts.length - 1]!;
    const topHidden = hiddenAt(base, top[0], top[1]);
    const f = e.funi;
    // Sentier de la gare haute (link(funi.x1 + 14, funi.y1 − 2) du plan), puis la porte de la gare.
    const sp = e.verdure.find((v) => v.kind === 'path' && Math.abs(v.pts![0]![0] - (f.x1 + 14)) < 0.01 && Math.abs(v.pts![0]![1] - (f.y1 - 2)) < 0.01);
    let gare: VieRoute | null = null;
    if (sp) {
      const end = sp.pts![2]!;
      const j = e.road.findIndex((p) => p[0] === end[0] && p[1] === end[1]);
      if (j >= 0) gare = routeOf([...e.road.slice(0, j + 1), ...quadPts(sp.pts!).reverse().slice(1), [f.x1 + 6, f.y1 - 8], [f.x1 + 0.5, f.y1 - 8]]);
    }
    const st = e.stairs;
    const stairs = routeOf([[st.x0, st.y0 - 1.2], [st.x1, st.y1 - 1.2], [f.x1 + 6, f.y1 - 8], [f.x1 + 0.5, f.y1 - 8]]);
    const k = e.verdure.find((v) => v.kind === 'kiosk');
    let kiosk: VieEscape['kiosk'] = null;
    if (k) {
      let best: { d: number; dd: number } | null = null;
      for (let d = 0; d < road.L; d += 4) {
        const p = routeAt(road, d);
        const dd = Math.hypot(p.x - k.x!, p.y - k.y!);
        if (!best || dd < best.dd) best = { d, dd };
      }
      kiosk = { x: k.x!, y: k.y!, d: best!.d };
    }
    const fo = e.verdure.find((v) => v.kind === 'fountain');
    return { e, road, topHidden, gare, stairs, kiosk, fountain: fo ? { x: fo.x!, y: fo.y! } : null };
  });
  // Cheminées : maisons de la colline (clé `col-…` de la maquette) et mur du fond (`mur-…`), seulement celles dont le haut se
  // voit ; rangées de la plus proche (mur, puis rangs 2, 1, 0) à la plus lointaine : les 12 premières qui fument le jour même
  // gardent leur panache toute la journée.
  const chimneys: VieChimney[] = [];
  for (const b of plan.buildings) {
    if (!b.far || b.look.chimney === null) continue;
    const x = b.x + b.w * b.look.chimney + 1.5;
    const y = b.top + 1;
    if (x >= 2 && x <= W - 2 && F.nearTop[Math.round(x)]! > y + 2) chimneys.push({ x, y, s: 1, haze: 0.1, key: `mur-${b.id}`, wall: true });
  }
  for (const h of [...plan.hill.houses].sort((a, b) => b.row - a.row || a.x - b.x) as FondHouse[]) {
    if (!h.chimneyTop) continue;
    const { x, y } = h.chimneyTop;
    if (x < 0 || x > W || hiddenAt(base, x, y + 2)) continue;
    chimneys.push({ x, y, s: h.s, haze: h.haze, key: `col-${h.row}-${Math.round(h.x)}`, wall: false });
  }
  // Réverbères (K) : route, gares, escalier, sentiers et chapelet de la crête.
  const lamps: VieLamp[] = [];
  for (const ve of escapes) {
    const e = ve.e;
    for (const l of e.lamps) {
      const p = routeAt(ve.road, l.d);
      lamps.push({ x: p.x + 1, y: p.y - 4, u: l.u, off: l.off, mast: false });
    }
    const f = e.funi;
    lamps.push({ x: f.x0 - 7.5, y: f.y0 + 1, u: 0.44, off: 5, mast: false }, { x: f.x1 + 7.5, y: f.y1 - 15, u: 0.45, off: 0, mast: false });
    const st = e.stairs;
    const sdx = st.x1 - st.x0;
    const sdy = st.y1 - st.y0;
    const sL = Math.hypot(sdx, sdy);
    const snx = (-sdy / sL) * 3.2;
    const sny = (sdx / sL) * 3.2;
    for (const q of [0.2, 0.5, 0.8]) lamps.push({ x: st.x0 + sdx * q + snx + 0.8, y: st.y0 + sdy * q + sny - 4.5, u: 0.42 + q * 0.04, off: 3, mast: false });
    for (const l of e.pathLamps) lamps.push({ x: l.x, y: l.y - 3, u: l.u, off: l.off, mast: true });
  }
  for (const l of F.crestLamps) lamps.push({ x: l.x, y: l.y - 3, u: l.u, off: l.off, mast: true });
  // Fenêtres allumables de la colline (A) : maisons du plan, du rang de crête et de l'échappée.
  const windows: VieWindow[] = [];
  for (const h of [...(plan.hill.houses as FondHouse[]), ...F.crestHouses, ...F.escapes.flatMap((e) => e.houses)]) for (const w of h.lit ?? []) windows.push({ ...w, alpha: 0.5 * (1 - h.haze) });
  const m: VieModel = { W, H, seed: plan.seed, escapes, chimneys, landmarks: plan.hill.landmarks, hillTop: F.hillTop, nearTop: F.nearTop, lamps, windows, clipHill: pathAbove(F.hillTop, W), clipWall: pathAbove(F.nearTop, W), nodes: [], trips: new Map() };
  m.nodes = vieNodes(m);
  MODELS.set(plan, m);
  return m;
}

// ── C : fumées de cheminée. Par jour froid (nov.–mars, neige), 30 % des cheminées (tirage du jour) fument le matin (6 h 20 –
// 8 h 40) et le soir (17 h – 21 h 50), chacune à ses heures, 3 min de fondu. Bouffées nées au conduit toutes les 1,4 s, qui
// montent, dérivent sous le vent, grossissent et pâlissent sur 9 s.
export const PUFF_P = 1.4;
export const PUFF_LIFE = 9;
// Horaires du jour d'une cheminée (tirage `fumee-<clé>` + date), gardés : la boucle les relit à chaque bouffée.
const SMOKE_DAYS = new Map<string, { on: boolean; o1: number; o2: number }>();
function smokeDay(D: VieDay, key: string, seed: number): { on: boolean; o1: number; o2: number } {
  const k = `${seed}|${key}|${D.date}`;
  let v = SMOKE_DAYS.get(k);
  if (!v) {
    if (SMOKE_DAYS.size > 2000) SMOKE_DAYS.clear();
    const r = fondRng(seed, `fumee-${key}`, D.date);
    const on = r() <= 0.3;
    v = { on, o1: r() * 1.2, o2: r() * 1.5 };
    SMOKE_DAYS.set(k, v);
  }
  return v;
}
export function smokeK(T: number, D: VieDay, key: string, seed: number): number {
  if (!D.cold) return 0;
  const { on, o1, o2 } = smokeDay(D, key, seed);
  if (!on) return 0;
  return Math.max(Math.min(ramp(T, 6.3 + o1, 3 * MIN), 1 - ramp(T, 8.6 + o1, 3 * MIN)), Math.min(ramp(T, 17 + o2, 3 * MIN), 1 - ramp(T, 21.8 + o2, 3 * MIN)));
}
const smokesToday = (D: VieDay, key: string, seed: number): boolean => D.cold && smokeDay(D, key, seed).on;
// Panaches du jour : au plus VIE_POOL.plumes, toujours les mêmes de la journée (aucun ne s'éteint pour céder sa place).
export function plumesOfDay(m: VieModel, D: VieDay): VieChimney[] {
  return cachedTrips(m, `c|${D.date}|${D.cold}`, () => m.chimneys.filter((c) => smokesToday(D, c.key, m.seed)).slice(0, VIE_POOL.plumes));
}
export type Puff = { x: number; y: number; r: number; a: number; age: number };
export function puffsAt(ch: VieChimney, T: number, D: VieDay, seed: number, still: boolean): Puff[] {
  const out: Puff[] = [];
  // Mouvement réduit : une pose fixe du panache (bouffées régulièrement espacées), dont seule l'opacité suit l'heure.
  const t = still ? PUFF_P * 0.5 : T * 3600;
  const wind = 0.5 + D.meteo.wind * 2.2;
  const s = ch.s;
  const i0 = Math.floor(t / PUFF_P);
  for (let i = i0; i > i0 - PUFF_LIFE / PUFF_P - 1; i--) {
    const born = i * PUFF_P;
    const a = t - born;
    if (a < 0 || a > PUFF_LIFE) continue;
    const kb = smokeK(still ? T : born * SEC, D, ch.key, seed);
    if (kb <= 0) continue;
    const q = a / PUFF_LIFE;
    const x = ch.x + a * wind * (0.6 + 0.4 * q) + Math.sin(a * 0.9 + i) * 0.5 * s;
    const y = ch.y - a * (2.2 - 1.2 * q) * s;
    const r = (0.8 + a * 0.42) * s;
    out.push({ x, y, r, a: kb * Math.min(1, a / 0.7) * (1 - q) * 0.6, age: a });
  }
  return out;
}

// ── D : trafic de la route en lacets. Départs par heure tirés de (graine, bande, date, heure) : pointes 7-9 h et 17-19 h, presque
// rien la nuit. Le bas de la route est toujours derrière le mur du fond ; si le haut aussi, les voitures traversent dans un sens
// ou dans l'autre, sinon elles montent depuis le bas, s'arrêtent au bout de la route (livraison, visite) et redescendent.
const TRAFFIC = (h: number, D: VieDay): number => {
  if (h >= 7 && h < 9) return D.weekend ? 2 : 5;
  if (h >= 17 && h < 19) return D.weekend ? 3 : 5;
  if (h >= 9 && h < 17) return 3;
  if (h >= 19 && h < 22) return 2;
  if (h === 6 || h === 22) return 1;
  return 0.4;
};
export type Trip = { key: string; t0: number; t1: number };
type CarTrip = Trip & { up: boolean; bus: boolean; color: number; speed: number; wait: number };
// Instant d'heure `h` (peut être −1, −2 : la veille) : clé de date et heure de 0 à 23.
const hourKey = (D: VieDay, h: number): { date: string; hh: number } => (h < 0 ? { date: D.prev, hh: h + 24 } : { date: D.date, hh: h });
function carTripsOfHour(ve: VieEscape, D: VieDay, seed: number, h: number): CarTrip[] {
  const { date, hh } = hourKey(D, h);
  const r = fondRng(seed, `trafic-${ve.e.band}-${hh}`, date);
  const rate = TRAFFIC(hh, D);
  const n = Math.floor(rate) + (r() < rate % 1 ? 1 : 0);
  const out: CarTrip[] = [];
  for (let k = 0; k < n; k++) {
    const t0 = h + r();
    const up = r() < 0.5;
    const bus = r() < 0.15;
    const color = Math.floor(r() * CARS.length);
    const speed = bus ? 5.5 : 6.5 + r() * 2;
    const wait = 20 + r() * 70;
    const dur = ve.topHidden ? ve.road.L / speed : (2 * ve.road.L) / speed + wait;
    out.push({ key: `v${ve.e.band}-${date}-${hh}-${k}`, t0, t1: t0 + dur * SEC, up, bus, color, speed, wait });
  }
  return out;
}
function cachedTrips<T>(m: VieModel, key: string, make: () => T[]): T[] {
  let v = m.trips.get(key) as T[] | undefined;
  if (!v) {
    if (m.trips.size > 400) m.trips.clear();
    v = make();
    m.trips.set(key, v);
  }
  return v;
}
// Plafond d'un réservoir sans rien faire disparaître : un trajet n'est pas fait (en entier) si `pool` trajets partis avant lui
// sont encore en route à son départ. Décision locale, pure : à tout instant, au plus `pool` trajets en vue.
export function capTrips<T extends Trip>(trips: T[], pool: number): T[] {
  const sorted = trips.slice().sort((a, b) => a.t0 - b.t0 || (a.key < b.key ? -1 : 1));
  return sorted.filter((t, i) => sorted.slice(0, i).filter((o) => o.t1 > t.t0).length < pool);
}
export type CarPose = { key: string; x: number; y: number; dir: number; bus: boolean; color: number };
export function vehiclesAt(m: VieModel, ve: VieEscape, T: number, D: VieDay): CarPose[] {
  const h0 = Math.floor(T);
  const trips: CarTrip[] = [];
  for (let h = h0 - 2; h <= h0; h++) trips.push(...cachedTrips(m, `v${ve.e.band}|${D.date}|${h}`, () => carTripsOfHour(ve, D, m.seed, h)));
  const out: CarPose[] = [];
  for (const t of cachedTrips(m, `vc${ve.e.band}|${D.date}|${h0}`, () => capTrips(trips, VIE_POOL.vehicles))) {
    if (T < t.t0 || T > t.t1) continue;
    const s = (T - t.t0) * 3600;
    const L = ve.road.L;
    let d: number;
    let up: boolean;
    if (ve.topHidden) {
      up = t.up;
      d = up ? s * t.speed : L - s * t.speed;
    } else {
      const climb = L / t.speed;
      up = s < climb + t.wait / 2;
      d = s < climb ? s * t.speed : s < climb + t.wait ? L : L - (s - climb - t.wait) * t.speed;
    }
    const p = routeAt(ve.road, d);
    out.push({ key: t.key, x: p.x, y: p.y, dir: up ? p.dir : -p.dir, bus: t.bus, color: t.color });
  }
  return out;
}

// ── Piétons minuscules (12/h de 8 h à 20 h, 4/h en soirée et à 7 h, aucun la nuit ; 40 % sous la pluie) : sur l'escalier
// (bas derrière le mur, haut à la gare), par le sentier de la gare, ou sur toute la route si son haut est caché ; 2-2,8 px/s.
const WALK_RATE = (h: number): number => (h >= 8 && h < 20 ? 12 : (h >= 20 && h < 23) || h === 7 ? 4 : 0);
type WalkTrip = Trip & { route: VieRoute; up: boolean; speed: number; side: number };
function walkTripsOfHour(ve: VieEscape, D: VieDay, seed: number, h: number): WalkTrip[] {
  const { date, hh } = hourKey(D, h);
  const r = fondRng(seed, `pietons-${ve.e.band}-${hh}`, date);
  const rate = WALK_RATE(hh) * (D.meteo.precip > 0.3 ? 0.4 : 1);
  const n = Math.floor(rate) + (r() < rate % 1 ? 1 : 0);
  const out: WalkTrip[] = [];
  for (let k = 0; k < n; k++) {
    const t0 = h + r();
    const u = r();
    const up = r() < 0.5;
    const speed = 2 + r() * 0.8;
    const route = u < 0.4 ? ve.stairs : u < 0.7 || !ve.topHidden ? (ve.gare ?? ve.stairs) : ve.road;
    out.push({ key: `p${ve.e.band}-${date}-${hh}-${k}`, t0, t1: t0 + (route.L / speed) * SEC, route, up, speed, side: route === ve.stairs ? 0 : up ? 2.2 : -2.2 });
  }
  return out;
}
export type WalkerPose = { key: string; x: number; y: number; dir: number; moving: boolean; musician: boolean };
export function walkersAt(m: VieModel, ve: VieEscape, T: number, D: VieDay): WalkerPose[] {
  const h0 = Math.floor(T);
  const trips: WalkTrip[] = [];
  for (let h = h0 - 3; h <= h0; h++) trips.push(...cachedTrips(m, `p${ve.e.band}|${D.date}|${D.meteo.precip > 0.3 ? 1 : 0}|${h}`, () => walkTripsOfHour(ve, D, m.seed, h)));
  const out: WalkerPose[] = [];
  for (const t of cachedTrips(m, `pc${ve.e.band}|${D.date}|${D.meteo.precip > 0.3 ? 1 : 0}|${h0}`, () => capTrips(trips, VIE_POOL.walkers))) {
    if (T < t.t0 || T > t.t1) continue;
    const d = (T - t.t0) * 3600 * t.speed;
    const p = routeAt(t.route, t.up ? d : t.route.L - d);
    out.push({ key: t.key, x: p.x + t.side, y: p.y - 0.6, dir: t.up ? p.dir : -p.dir, moving: true, musician: false });
  }
  return out;
}
// Fanfare du kiosque : les dimanches de mai à septembre, hors pluie, quatre musiciens et six badauds montent par la route
// (depuis le bas, caché) jusqu'au point le plus proche du kiosque, puis gagnent leur place en 25 s ; arrivés de 14 h 50 à
// 15 h 15, ils repartent par le même chemin à partir de 18 h.
export const kioskDay = (D: VieDay): boolean => D.weekday === 0 && D.month >= 5 && D.month <= 9 && D.meteo.precip <= 0;
const KIOSK_SPEED = 2.3;
const KIOSK_STEP = 25;
export function kioskAt(m: VieModel, ve: VieEscape, T: number, D: VieDay): (WalkerPose | null)[] {
  const out: (WalkerPose | null)[] = [];
  const k = ve.kiosk;
  for (let i = 0; i < VIE_POOL.kiosk; i++) {
    if (!k || !kioskDay(D)) {
      out.push(null);
      continue;
    }
    const r = fondRng(m.seed, `fanfare-${ve.e.band}-${i}`, D.date);
    const musician = i < 4;
    const tin = 14 + 50 * MIN + i * 2.5 * MIN + r() * MIN;
    const tout = 18 + i * 1.5 * MIN + r() * 2 * MIN;
    const spot = musician ? { x: k.x - 4 + i * 2.6, y: k.y + 2.6 } : { x: k.x - 10 + r() * 20, y: k.y + 4.5 + r() * 3 };
    const walk = (k.d / KIOSK_SPEED) * SEC;
    const step = KIOSK_STEP * SEC;
    const a0 = tin - step - walk;
    const b1 = tout + step + walk;
    if (T < a0 || T > b1) {
      out.push(null);
      continue;
    }
    const join = routeAt(ve.road, k.d);
    let x: number;
    let y: number;
    let dir: number;
    let moving = true;
    if (T < tin - step) {
      const p = routeAt(ve.road, (T - a0) * 3600 * KIOSK_SPEED);
      [x, y, dir] = [p.x + 2.2, p.y - 0.6, p.dir];
    } else if (T < tin) {
      const q = smooth((T - (tin - step)) / step);
      [x, y, dir] = [lerp(join.x + 2.2, spot.x, q), lerp(join.y - 0.6, spot.y, q), spot.x > join.x ? 1 : -1];
    } else if (T <= tout) {
      [x, y, dir, moving] = [spot.x, spot.y, 1, false];
    } else if (T < tout + step) {
      const q = smooth((T - tout) / step);
      [x, y, dir] = [lerp(spot.x, join.x - 2.2, q), lerp(spot.y, join.y - 0.6, q), join.x > spot.x ? 1 : -1];
    } else {
      const p = routeAt(ve.road, k.d - (T - tout - step) * 3600 * KIOSK_SPEED);
      [x, y, dir] = [p.x - 2.2, p.y - 0.6, -p.dir];
    }
    out.push({ key: `f${i}`, x, y, dir, moving, musician });
  }
  return out;
}

// ── J : funiculaire. Service 6 h – 0 h 45 ; un cycle = montée (110 s) puis attente en gare, toutes les 5 min (10 min après
// 21 h) ; les deux cabines sont solidaires du câble. Hors service, à quai (même image : les deux cabines se ressemblent).
export function funiAt(T: number, still = false): { a: number; b: number; moving: boolean } {
  const on = T >= 6 || T < 0.75;
  if (!on || still) return { a: 0, b: 1, moving: false };
  const P = T >= 21 || T < 0.75 ? 600 : 300;
  const t = (T * 3600) % (2 * P);
  const half = t < P ? t : t - P;
  const prog = smooth(Math.min(1, half / 110));
  const a = t < P ? prog : 1 - prog;
  return { a, b: 1 - a, moving: half < 110 };
}
const cabinAt = (f: Escape['funi'], p: number, o: number): { x: number; y: number } => ({ x: f.x0 + (f.x1 - f.x0) * p + o, y: f.y0 + (f.y1 - f.y0) * p });

// ── I : grue de chantier certaines semaines (10 par échappée), montée le lundi 7 h – 9 h, démontée le vendredi 17 h – 19 h ; la
// flèche pivote aux heures ouvrées (lun.–ven. 8 h – 17 h), figée sinon.
export function craneK(e: Escape, T: number, D: VieDay): number {
  if (!e.crane.weeks.includes(D.week % 52)) return 0;
  const wd = D.weekday;
  if (wd === 0 || wd === 6) return 0;
  if (wd === 1) return ramp(T, 7, 2);
  if (wd === 5) return 1 - ramp(T, 17, 2);
  return 1;
}
export const craneWorking = (T: number, D: VieDay): boolean => D.weekday >= 1 && D.weekday <= 5 && T >= 8 && T < 17;

// ── L : à l'heure pile (8 h – 21 h), la cloche fait s'envoler les six pigeons du beffroi : un tour en 40 s, puis ils se reposent.
export const pigeonsFlying = (T: number): boolean => {
  const h = Math.floor(T);
  return h >= 8 && h <= 21 && (T - h) * 3600 < 40;
};

// ── F : vols au loin. Oct.–fév. : 3 nuées d'étourneaux au crépuscule (coucher − 1 h 18 → coucher) ; été 4, printemps 2 vols de
// martinets le soir ; aucun sous forte pluie. Traversée bord à bord (20 px/s les nuées, 39 px/s les martinets).
export type Flight = { kind: 'starlings' | 'swifts'; t0: number; dur: number; dir: 1 | -1; y0: number; n: number; seed: number };
export function flightsOf(m: Pick<VieModel, 'W' | 'H' | 'seed'>, D: VieDay): Flight[] {
  const r = fondRng(m.seed, 'vols', D.date);
  const ss = D.sunset;
  const out: Flight[] = [];
  const kY = m.H / 340;
  if (D.month >= 10 || D.month <= 2) for (let i = 0; i < VIE_POOL.starlings; i++) out.push({ kind: 'starlings', t0: ss - 1.3 + r() * 1.3, dur: (m.W + 120) / 20.8, dir: r() < 0.5 ? 1 : -1, y0: (16 + r() * 30) * kY, n: 36, seed: r() * 1000 });
  if (D.season === 'summer' || D.season === 'spring') for (let i = 0; i < (D.season === 'summer' ? 4 : 2); i++) out.push({ kind: 'swifts', t0: ss - 3.2 + r() * 2.8, dur: (m.W + 120) / 39, dir: r() < 0.5 ? 1 : -1, y0: (20 + r() * 40) * kY, n: 6, seed: r() * 1000 });
  return out;
}
export function flightCenter(m: Pick<VieModel, 'W'>, f: Flight, T: number): { x: number; y: number; t: number } | null {
  const t = (T - f.t0) * 3600;
  if (t < 0 || t > f.dur) return null;
  const x0 = f.dir > 0 ? -60 : m.W + 60;
  return { x: x0 + f.dir * t * ((m.W + 120) / f.dur), y: f.y0 + Math.sin(t * 0.35 + f.seed) * 8, t };
}

// ── M : brume au creux de la colline, matins frais d'automne-hiver (se lève de 8 h 50 à 10 h 40) et temps de brouillard.
export function mistK(T: number, D: VieDay): number {
  if (D.meteo.fog > 0.4) return D.meteo.fog;
  if (D.season === 'autumn' || D.season === 'winter') return 0.75 * (1 - ramp(T, 8.8, 1.8)) * ramp(T, 5, 1);
  return 0;
}

// ── N : drapeaux tricolores les jours de fête nationale, hissés à 8 h, amenés au coucher du soleil.
export const flagK = (T: number, D: VieDay): number => (D.national ? Math.min(ramp(T, 8, 1 * MIN), 1 - ramp(T, D.sunset, 1 * MIN)) : 0);
// Monuments illuminés du crépuscule (lumière du jour < 0,4) à 1 h.
export const monumentK = (T: number, daylight: number): number =>
  daylight < 0.4 && (T >= 12 || T < 1) ? Math.min(1, (0.4 - daylight) / 0.2) * (T < 1 ? 1 - ramp(T, 0.9, 0.1) : 1) : 0;

// ── Ailes du moulin : 0,15 + 1,1 × vent rad/s, avec des à-coups (la vitesse va de la moitié à une fois et demie).
export function millAngle(phase: number, wind: number, S: number): number {
  const w = 0.15 + 1.1 * wind;
  return phase + w * S + 0.5 * w * (7 / TAU) * Math.sin((TAU * S) / 7 + phase);
}

// ═════════════ Nœuds : liste fixe montée par le calque, et poses à l'instant ═════════════
// Un nœud = un élément SVG (avec ses enfants) dans un des groupes du calque. `light` : lumière (hors étalonnage, jamais
// teintée par la matrice de la nuit) ; sinon les couleurs `fill` / `stroke` sont étalonnées par le calque. `fade` : transition
// d'opacité de 4 s (lumières qui s'allument et s'éteignent, comme les fenêtres de la ville).
export type VieGroup = 'hill' | 'wall' | 'lights' | 'top';
export type VieEl = { tag: 'g' | 'path' | 'rect' | 'circle'; attrs: Record<string, string>; light?: boolean; fade?: boolean; kids?: VieEl[] };
export type VieNode = VieEl & { id: string; group: VieGroup; mobile: boolean };
// Pose d'un nœud : attributs du nœud (`a`) et de ses enfants (`k`, même ordre que `kids`).
export type VieNodePose = { a: Record<string, string>; k?: Record<string, string>[] };

const rectD = (x: number, y: number, w: number, h: number): string => `M${f2(x)} ${f2(y)}h${f2(w)}v${f2(h)}h${f2(-w)}Z`;
const discD = (x: number, y: number, r: number): string => `M${f2(x - r)} ${f2(y)}a${f2(r)} ${f2(r)} 0 1 0 ${f2(2 * r)} 0a${f2(r)} ${f2(r)} 0 1 0 ${f2(-2 * r)} 0`;
const P = (attrs: Record<string, string>, more: Partial<VieEl> = {}): VieEl => ({ tag: 'path', attrs, ...more });
const HIDE = { display: 'none' };

function vieNodes(m: VieModel): VieNode[] {
  const nodes: VieNode[] = [];
  const add = (id: string, group: VieGroup, mobile: boolean, el: VieEl): void => void nodes.push({ id, group, mobile, ...el, attrs: { display: 'none', ...el.attrs } });
  // Brume (M) : nappe, bande de tête et écharpes.
  add('brume-nappe', 'hill', true, P({ fill: '#e8eef6', d: rectD(0, m.H * 0.3 + 6, m.W, m.H * 0.4 - 6) }));
  add('brume-tete', 'hill', true, P({ fill: '#e8eef6', d: rectD(0, m.H * 0.3 - 2, m.W, 8) }));
  add('brume-echarpes', 'hill', true, P({ fill: '#e8eef6' }));
  m.escapes.forEach((ve, k) => {
    // Grue (I) : mât, treillis, flèche et câbles, contrepoids, crochet.
    add(`grue-${k}`, 'hill', true, {
      tag: 'g',
      attrs: {},
      kids: [P({ fill: 'none', stroke: hex(haze(CRANE, 0.2)), 'stroke-width': '1.2' }), P({ fill: 'none', stroke: INK, 'stroke-opacity': '0.6', 'stroke-width': '0.4' }), P({ fill: 'none', stroke: hex(haze(CRANE, 0.2)), 'stroke-width': '1' }), P({ fill: INK, 'fill-opacity': '0.8' })],
    });
    add(`grue-feu-${k}`, 'lights', true, P({ fill: '#FF4030' }, { light: true }));
    // Moulin : ailes qui tournent (gabarit à l'angle 0, rotation autour du moyeu).
    const mill = ve.e.mill;
    if (mill) {
      const s = mill.s;
      const hub = { x: mill.x - 0.5 * s, y: mill.y - 13 * s };
      const kids: VieEl[] = [];
      for (let q = 0; q < 4; q++) {
        const a = (q * Math.PI) / 2;
        const ex = hub.x + Math.cos(a) * 9 * s;
        const ey = hub.y + Math.sin(a) * 9 * s;
        const bx = hub.x + Math.cos(a) * 2 * s;
        const by = hub.y + Math.sin(a) * 2 * s;
        const nx = Math.cos(a + Math.PI / 2) * 2.2 * s;
        const ny = Math.sin(a + Math.PI / 2) * 2.2 * s;
        kids.push(P({ d: `M${f2(hub.x)} ${f2(hub.y)}L${f2(ex)} ${f2(ey)}`, fill: 'none', stroke: INK, 'stroke-opacity': '0.46', 'stroke-width': '0.6' }));
        kids.push(P({ d: `M${f2(bx)} ${f2(by)}L${f2(ex)} ${f2(ey)}L${f2(ex + nx)} ${f2(ey + ny)}L${f2(bx + nx)} ${f2(by + ny)}Z`, fill: hex(haze(SAIL, 0.34)), 'fill-opacity': '0.85', stroke: INK, 'stroke-opacity': '0.46', 'stroke-width': '0.35' }));
      }
      kids.push(P({ d: discD(hub.x, hub.y, 0.8 * s), fill: INK, 'fill-opacity': '0.51' }));
      add(`moulin-${k}`, 'hill', true, { tag: 'g', attrs: { display: 'inline' }, kids });
    }
    // Jet de la fontaine (deux poses clés).
    if (ve.fountain) add(`jet-${k}`, 'hill', true, P({ fill: 'none', stroke: '#c8e6ff', 'stroke-opacity': '0.9', 'stroke-width': '0.6' }));
    // Voitures et bus (D) : carrosserie, avant, toit, roues ; phares et feux (lumières).
    for (let i = 0; i < VIE_POOL.vehicles; i++)
      add(`voiture-${k}-${i}`, 'hill', true, {
        tag: 'g',
        attrs: {},
        kids: [P({}), P({}), P({}), P({ fill: INK, 'fill-opacity': '0.8' }), P({ fill: '#fff0c8', 'fill-opacity': '0.35' }, { light: true }), P({ fill: '#FFF4D0' }, { light: true }), P({ fill: '#FF5040' }, { light: true })],
      });
    // Piétons et fanfare : corps, tête, jambes ; instrument et note (musiciens).
    const walker = (): VieEl => ({
      tag: 'g',
      attrs: {},
      kids: [P({ d: `${rectD(-0.6, -3.2, 1.2, 2.6)}${discD(0, -3.6, 0.6)}`, fill: INK, 'fill-opacity': '0.85' }), P({ fill: 'none', stroke: INK, 'stroke-opacity': '0.85', 'stroke-width': '0.5' }), P({ d: rectD(0.4, -2.6, 1, 0.8), fill: '#E8C040' }), P({ d: rectD(-1.5, -5.5, 0.5, 0.5), fill: '#ffffff', 'fill-opacity': '0.7' })],
    });
    for (let i = 0; i < VIE_POOL.walkers; i++) add(`pieton-${k}-${i}`, 'hill', true, walker());
    for (let i = 0; i < VIE_POOL.kiosk; i++) add(`fanfare-${k}-${i}`, 'hill', true, walker());
    // Funiculaire (J) : câbles, deux cabines (fenêtres éclairées la nuit).
    add(`cables-${k}`, 'hill', true, P({ fill: 'none', stroke: INK, 'stroke-opacity': '0.5', 'stroke-width': '0.4' }));
    const c = haze(CABIN, 0.18);
    for (let i = 0; i < 2; i++)
      add(`cabine-${k}-${i}`, 'hill', true, {
        tag: 'g',
        attrs: {},
        kids: [
          P({ d: rectD(-3, -5, 6, 4.4), fill: hex(c) }),
          P({ d: rectD(1, -5, 2, 4.4), fill: hex(shade(c, 0.35)) }),
          P({ d: rectD(-3.3, -5.6, 6.6, 0.8), fill: hex(light(c, 0.45)) }),
          P({ d: `${rectD(-2.2, -4.2, 1.6, 1.6)}${rectD(0.2, -4.2, 1.6, 1.6)}`, fill: hex(haze(GLASS_FAR, 0.3)) }),
          P({ d: rectD(-3, -5, 6, 4.4), fill: 'none', stroke: INK, 'stroke-opacity': '0.8', 'stroke-width': '0.5' }),
          P({ d: `${rectD(-2.2, -4.2, 1.6, 1.6)}${rectD(0.2, -4.2, 1.6, 1.6)}`, fill: '#FFDFA0', 'fill-opacity': '0.85' }, { light: true }),
        ],
      });
  });
  // Fumées (C) : un réservoir par découpe (mur du fond, colline), deux voiles par panache (bouffées jeunes, vieilles).
  for (const grp of ['wall', 'hill'] as const)
    for (let i = 0; i < VIE_POOL.plumes; i++) add(`fumee-${grp}-${i}`, grp, true, { tag: 'g', attrs: {}, kids: [P({}), P({})] });
  // Tour (E, L, N) et dômes (N) : pigeons posés et en vol, drapeaux.
  m.landmarks.forEach((l, k) => {
    const { x, s, base } = l;
    if (l.kind === 'tower') {
      const ledge = base - 70 * s + 8.5 * s;
      let d = '';
      for (let i = 0; i < 6; i++) d += rectD(x + 1.5 * s + i * 2 * s, ledge - 0.9, 1.1, 0.9);
      add(`pigeons-poses-${k}`, 'hill', true, P({ d, fill: INK, 'fill-opacity': '0.85' }));
      add(`pigeons-vol-${k}`, 'hill', true, P({ fill: 'none', stroke: INK, 'stroke-opacity': '0.85', 'stroke-width': '0.6' }));
    }
    const fh = 3 * s;
    const fw = 5 * s;
    const kids: VieEl[] = FLAG.map((c, i) => P({ d: `M${f2((fw / 3) * i)} 0H${f2((fw / 3) * (i + 1))}V${f2(fh)}H${f2((fw / 3) * i)}Z`, fill: hex(haze(c, 0.15)) }));
    kids.push(P({ d: `M0 0H${f2(fw)}V${f2(fh)}H0Z`, fill: 'none', stroke: INK, 'stroke-opacity': '0.7', 'stroke-width': '0.4' }));
    if (l.kind === 'dome') kids.unshift(P({ d: rectD(-0.3, 0, 0.6, 6 * s), fill: INK, 'fill-opacity': '0.8' }));
    add(`drapeau-${k}`, 'hill', true, { tag: 'g', attrs: {}, kids });
  });
  // Vols (F) : nuées d'étourneaux (points) et martinets (chevrons).
  for (let i = 0; i < VIE_POOL.starlings; i++) add(`etourneaux-${i}`, 'hill', true, P({ fill: INK, 'fill-opacity': '0.7' }));
  for (let i = 0; i < VIE_POOL.swifts; i++) add(`martinets-${i}`, 'hill', true, P({ fill: 'none', stroke: INK, 'stroke-opacity': '0.75', 'stroke-width': '0.5' }));
  // Lumières (A, K, N, cadran) : changent à la minute, avec un fondu.
  m.windows.forEach((w, i) => add(`fenetre-${i}`, 'lights', false, { tag: 'rect', attrs: { x: f2(w.x), y: f2(w.y), width: f2(w.w), height: f2(w.h), fill: w.blue ? LIT_BLUE : LIT_WARM, opacity: '0' }, light: true, fade: true }));
  m.lamps.forEach((l, i) => {
    if (l.mast) add(`mat-${i}`, 'lights', false, P({ d: `M${f2(l.x)} ${f2(l.y + 3)}V${f2(l.y)}`, fill: 'none', stroke: INK, 'stroke-opacity': '0.55', 'stroke-width': '0.5', display: 'inline' }));
    add(`reverbere-${i}`, 'lights', false, { tag: 'g', attrs: { opacity: '0', display: 'inline' }, light: true, fade: true, kids: [P({ d: discD(l.x, l.y, 2.6), fill: '#ffe096', 'fill-opacity': '0.25' }, { light: true }), P({ d: discD(l.x, l.y, 0.9), fill: '#FFE8B0' }, { light: true })] });
  });
  m.landmarks.forEach((l, k) => {
    const { x, s, base } = l;
    const d =
      l.kind === 'tower'
        ? `${rectD(x, base - 70 * s, 14 * s, 70 * s)}M${f2(x - 2 * s)} ${f2(base - 70 * s)}L${f2(x + 7 * s)} ${f2(base - 92 * s)}L${f2(x + 16 * s)} ${f2(base - 70 * s)}Z`
        : `M${f2(x)} ${f2(base - 26 * s)}a${f2(13 * s)} ${f2(13 * s)} 0 0 1 ${f2(26 * s)} 0V${f2(base)}H${f2(x)}Z`;
    add(`monument-${k}`, 'lights', false, P({ d, fill: '#ffd68c', opacity: '0', display: 'inline' }, { light: true, fade: true }));
    if (l.kind === 'tower') {
      add(`cadran-${k}`, 'lights', false, P({ d: discD(x + 7 * s, base - 58 * s, 4.2 * s), fill: '#ffecbe', opacity: '0', display: 'inline' }, { light: true, fade: true }));
      // Aiguilles (E), par-dessus la lueur du cadran : gabarits à midi, tournés autour du centre.
      const cx = x + 7 * s;
      const cy = base - 58 * s;
      add(`aiguille-h-${k}`, 'top', true, P({ d: `M${f2(cx)} ${f2(cy)}V${f2(cy - 2.6 * s)}`, fill: 'none', stroke: INK, 'stroke-opacity': '0.95', 'stroke-width': '0.8', display: 'inline' }));
      add(`aiguille-m-${k}`, 'top', true, P({ d: `M${f2(cx)} ${f2(cy)}V${f2(cy - 3.8 * s)}`, fill: 'none', stroke: INK, 'stroke-opacity': '0.95', 'stroke-width': '0.6', display: 'inline' }));
    }
  });
  return nodes;
}

// Instant vu par le calque : heure de la scène (décimale, secondes comprises), jour, lumière, mouvement réduit.
// `day` : jour vu par les fenêtres de la ville (le même que GhibliWindows pour le mur du fond) ; absent, celui de `D`.
export type VieInput = { T: number; D: VieDay; daylight: number; gloom: boolean; dim: number; minutes: number; forcedNight?: boolean; still: boolean; millOffset?: number[]; day?: WindowDay; lights?: boolean };

const lampOn = (l: VieLamp, minutes: number, daylight: number, forcedNight: boolean): boolean => daylight < l.u && lampLit({ id: '', x: 0, offJitter: l.off }, minutes, daylight, forcedNight);
const carParts = (bus: boolean, color: number): string[] => {
  const w = bus ? 6 : 4;
  const h = bus ? 2.6 : 2;
  const x = -w / 2;
  const y = -h - 0.4;
  const c = bus ? BUS : CARS[color]!;
  return [
    rectD(x, y, w, h),
    hex(haze(c, 0.15)),
    rectD(x + w * 0.6, y, w * 0.4, h),
    hex(haze(shade(c, 0.35), 0.15)),
    rectD(x + w * 0.25, y - 0.6, w * 0.5, 0.7),
    hex(haze(light(c, 0.5), 0.15)),
    `${rectD(x + 0.4, y + h - 0.2, 1, 0.7)}${rectD(x + w - 1.4, y + h - 0.2, 1, 0.7)}`,
    discD(w / 2 + 1.5, -1.2, 1.6),
    rectD(w / 2 - 0.3, -1.6, 0.7, 0.7),
    rectD(-w / 2 - 0.3, -1.6, 0.7, 0.7),
  ];
};
const SHOW = { display: 'inline' };
const off = (): VieNodePose => ({ a: HIDE });

// Pose de chaque nœud de `m.nodes` à l'instant (même ordre, même longueur). Pure.
export function vieFrame(m: VieModel, I: VieInput): VieNodePose[] {
  const { T, D, still } = I;
  const S = T * 3600;
  const night = I.gloom ? 1 : nightness(I.daylight);
  const dark = night > 0.2;
  const rainy = D.meteo.precip > 0.3;
  const poses = new Map<string, VieNodePose>();
  const set = (id: string, p: VieNodePose): void => void poses.set(id, p);
  // Brume.
  const mk = mistK(T, D);
  if (mk > 0) {
    set('brume-nappe', { a: { ...SHOW, opacity: f2(0.45 * mk) } });
    set('brume-tete', { a: { ...SHOW, opacity: f2(0.3 * mk) } });
    const drift = still ? 0 : Math.floor(S * (0.3 + D.meteo.wind * 1.5));
    const y0 = m.H * 0.3;
    let d = '';
    for (let i = 0; i < 12; i++) {
      const x = ((((i * 173 + drift) % (m.W + 140)) + m.W + 140) % (m.W + 140)) - 70;
      const y = y0 - 8 + (i % 3) * 5 + Math.sin(i) * 2;
      const w = 56 + (i % 4) * 14;
      d += `M${f1(x + 2.5)} ${f1(y)}h${w - 5}a2.5 2.5 0 0 1 0 5h${-(w - 5)}a2.5 2.5 0 0 1 0 -5Z`;
    }
    set('brume-echarpes', { a: { ...SHOW, d, opacity: f2(0.35 * mk) } });
  }
  m.escapes.forEach((ve, k) => {
    const e = ve.e;
    // Grue.
    const ck = craneK(e, T, D);
    if (ck > 0) {
      const c = e.crane;
      const work = craneWorking(T, D);
      const tw = still ? 0 : T < 8 ? 0 : work ? (T - 8) * 3600 : 9 * 3600;
      const ang = -0.5 + 0.55 * Math.sin(tw / 45);
      const mast = c.mast * smooth(ck);
      const boom = c.boom * sat((ck - 0.6) / 0.4);
      const ty = c.base - mast;
      let lattice = '';
      for (let y = c.base; y > c.base - mast; y -= 3) lattice += `M${f1(c.x - 0.6)} ${f1(y)}L${f1(c.x + 0.6)} ${f1(y - 3)}`;
      const kids: Record<string, string>[] = [{ d: `M${f1(c.x)} ${f1(c.base)}V${f1(ty)}` }, { d: lattice }, { d: '' }, { d: '' }];
      if (boom > 0) {
        const bx = c.x + Math.cos(ang) * boom;
        const by = ty + Math.sin(ang) * boom * 0.25;
        const cbx = c.x - Math.cos(ang) * boom * 0.35;
        const cby = ty - Math.sin(ang) * boom * 0.25 * 0.35;
        const hx = c.x + Math.cos(ang) * boom * (0.55 + 0.25 * Math.sin(tw / 70));
        const hy = ty + Math.sin(ang) * boom * 0.25 * 0.6;
        kids[2] = { d: `M${f1(cbx)} ${f1(cby)}L${f1(bx)} ${f1(by)}` };
        kids[1] = { d: `${lattice}M${f1(c.x)} ${f1(ty - 3)}L${f1(bx)} ${f1(by)}M${f1(c.x)} ${f1(ty - 3)}L${f1(cbx)} ${f1(cby)}M${f1(hx)} ${f1(hy)}V${f1(hy + 5 + 3 * Math.sin(tw / 30))}` };
        kids[3] = { d: rectD(cbx - 1, cby - 0.5, 2, 1.4) };
      }
      set(`grue-${k}`, { a: SHOW, k: kids });
      if (dark && ck >= 1) set(`grue-feu-${k}`, { a: { ...SHOW, d: discD(c.x, ty - 1, 0.7), opacity: still || Math.floor(S) % 2 === 0 ? '1' : '0' } });
    }
    if (e.mill) {
      const deg = (((still ? e.mill.phase : millAngle(e.mill.phase, D.meteo.wind, S) + (I.millOffset?.[k] ?? 0)) * 180) / Math.PI) % 360;
      const s = e.mill.s;
      set(`moulin-${k}`, { a: { ...SHOW, transform: `rotate(${f1(deg)} ${f2(e.mill.x - 0.5 * s)} ${f2(e.mill.y - 13 * s)})` } });
    }
    if (ve.fountain && fountainOn(D as unknown as FondMoment)) {
      const { x, y } = ve.fountain;
      const pose = still ? 0 : Math.floor(S * 2) % 2;
      const d = `M${f1(x)} ${f1(y - 3)}Q${f1(x - 1.5)} ${f1(y - 7 - pose * 0.6)} ${f1(x - 2.2)} ${f1(y - 1.2)}M${f1(x)} ${f1(y - 3)}Q${f1(x + 1.5)} ${f1(y - 7 + pose * 0.6)} ${f1(x + 2.2)} ${f1(y - 1.2)}M${f1(x)} ${f1(y - 3)}V${f1(y - 8 + pose)}`;
      set(`jet-${k}`, { a: { ...SHOW, d } });
    }
    if (!still) {
      vehiclesAt(m, ve, T, D).forEach((v, i) => {
        const p = carParts(v.bus, v.color);
        const lo = dark ? '1' : '0';
        set(`voiture-${k}-${i}`, { a: { ...SHOW, transform: `translate(${f1(v.x)} ${f1(v.y)}) scale(${v.dir} 1)` }, k: [{ d: p[0]!, fill: p[1]! }, { d: p[2]!, fill: p[3]! }, { d: p[4]!, fill: p[5]! }, { d: p[6]! }, { d: p[7]!, opacity: lo }, { d: p[8]!, opacity: lo }, { d: p[9]!, opacity: lo }] });
      });
      const legs = (x: number, moving: boolean): Record<string, string> => {
        const st = moving ? Math.round(Math.sin(S * 6 + x) * 2) / 4 : 0;
        return { d: `M0 -0.8L${-st} 0M0 -0.8L${st} 0` };
      };
      const person = (w: WalkerPose): VieNodePose => {
        const note = w.musician && !w.moving && Math.floor(S * 2) % 2 === 1;
        return { a: { ...SHOW, transform: `translate(${f1(w.x)} ${f1(w.y)}) scale(${w.dir} 1)` }, k: [{}, legs(w.x, w.moving), { opacity: w.musician && !w.moving ? '1' : '0' }, { opacity: note ? '1' : '0', transform: `translate(${Math.floor((S * 3) % 3)} 0)` }] };
      };
      walkersAt(m, ve, T, D).forEach((w, i) => set(`pieton-${k}-${i}`, person(w)));
      kioskAt(m, ve, T, D).forEach((w, i) => w && set(`fanfare-${k}-${i}`, person(w)));
    }
    const f = e.funi;
    const st = funiAt(T, still);
    const pa = cabinAt(f, st.a, -FUNI_GAP);
    const pb = cabinAt(f, st.b, FUNI_GAP);
    set(`cables-${k}`, { a: { ...SHOW, d: `M${f1(pa.x)} ${f1(pa.y - 1)}L${f1(f.x1 - FUNI_GAP)} ${f1(f.y1 - 1)}M${f1(pb.x)} ${f1(pb.y - 1)}L${f1(f.x1 + FUNI_GAP)} ${f1(f.y1 - 1)}` } });
    [pa, pb].forEach((p, i) => set(`cabine-${k}-${i}`, { a: { ...SHOW, transform: `translate(${f1(p.x)} ${f1(p.y)})` }, k: [{}, {}, {}, {}, {}, { opacity: dark ? '1' : '0' }] }));
  });
  // Fumées.
  const counts = { wall: 0, hill: 0 };
  for (const ch of plumesOfDay(m, D)) {
    const grp = ch.wall ? 'wall' : 'hill';
    const id = `fumee-${grp}-${counts[grp]++}`;
    const puffs = puffsAt(ch, T, D, m.seed, still);
    if (puffs.length === 0) continue;
    const tint = hex(haze(SMOKE, ch.haze));
    let young = '';
    let old = '';
    for (const p of puffs) {
      const d = discD(p.x, p.y, p.r);
      if (p.age < PUFF_LIFE * 0.45) young += d;
      else old += d;
    }
    // Opacité d'une bande : celle de sa bouffée la plus marquée (fondu du matin et du soir compris).
    const aY = Math.max(0, ...puffs.filter((p) => p.age < PUFF_LIFE * 0.45).map((p) => p.a));
    const aO = Math.max(0, ...puffs.filter((p) => p.age >= PUFF_LIFE * 0.45).map((p) => p.a));
    set(id, { a: SHOW, k: [{ d: young, fill: tint, 'fill-opacity': f2(aY) }, { d: old, fill: tint, 'fill-opacity': f2(aO) }] });
  }
  // Tour et dômes.
  m.landmarks.forEach((l, k) => {
    const { x, s, base } = l;
    if (l.kind === 'tower') {
      const top = base - 70 * s;
      const ledge = top + 8.5 * s;
      const cx = x + 7 * s;
      const h = Math.floor(T);
      const age = (T - h) * 3600;
      if (still || !pigeonsFlying(T)) set(`pigeons-poses-${k}`, { a: SHOW });
      else {
        const q = age / 40;
        const spread = Math.min(1, age / 5, (40 - age) / 5);
        let d = '';
        for (let i = 0; i < 6; i++) {
          const a = -Math.PI / 2 + q * TAU * 1.2 + i * 0.55;
          const ox = cx + Math.cos(a) * (14 + i * 1.2) * s;
          const oy = ledge - 3 * s - Math.sin(a) * 7 * s - 4 * s;
          // Départ et retour depuis leur place sur la corniche (jamais d'un point commun).
          const px = lerp(x + 1.5 * s + i * 2 * s + 0.55, ox, spread);
          const py = lerp(ledge - 0.9, oy, spread);
          const flap = Math.sin(age * 14 + i) * 0.7 * spread;
          d += `M${f1(px - 1.1)} ${f1(py - flap)}L${f1(px)} ${f1(py + 0.3)}L${f1(px + 1.1)} ${f1(py - flap)}`;
        }
        set(`pigeons-vol-${k}`, { a: { ...SHOW, d } });
      }
    }
    const fk = flagK(T, D);
    if (fk > 0) {
      const px = l.kind === 'tower' ? x + 14 * s + 1.8 * s : x + 13 * s;
      const py = l.kind === 'tower' ? base - 70 * s - 2 * s : base - 44 * s - 1;
      const fw = 5 * s;
      const top = (l.kind === 'tower' ? py : py - 6 * s) + (1 - fk) * 6 * s;
      const pose = still ? 1 : Math.floor(S * (2 + D.meteo.wind * 6)) % 3;
      const dy = [-0.5, 0, 0.5][pose]!;
      const kw = [0.92, 1, 0.96][pose]!;
      const kids: Record<string, string>[] = [];
      if (l.kind === 'dome') kids.push({ transform: `translate(0 ${f2(py - 6 * s - top)})` });
      set(`drapeau-${k}`, { a: { ...SHOW, transform: `translate(${f2(px)} ${f2(top)}) matrix(${f2(kw)} ${f2(dy / fw)} 0 1 0 0)` }, k: kids.length ? [...kids, {}, {}, {}, {}] : undefined });
    }
  });
  // Vols.
  if (!still && !rainy) {
    const c = { starlings: 0, swifts: 0 };
    for (const fl of flightsOf(m, D)) {
      const id = fl.kind === 'starlings' ? `etourneaux-${c.starlings++}` : `martinets-${c.swifts++}`;
      const at = flightCenter(m, fl, T);
      if (!at) continue;
      let d = '';
      if (fl.kind === 'starlings') {
        const sq = 0.7 + 0.3 * Math.sin(at.t * 0.5 + fl.seed);
        for (let j = 0; j < fl.n; j++) {
          const a = j * 2.399 + fl.seed;
          const rx = 6 + (j % 7) * 2.6;
          const ry = 2.5 + (j % 5) * 1.1;
          d += `M${f1(at.x + Math.cos(a + at.t * 1.1) * rx * sq)} ${f1(at.y + (Math.sin(a * 1.7 + at.t * 0.8) * ry) / sq)}h0.8v0.6h-0.8Z`;
        }
      } else {
        for (let j = 0; j < fl.n; j++) {
          const px = at.x + Math.sin(at.t * 1.7 + j * 1.3) * 18 - j * 7 * fl.dir;
          const py = at.y + Math.sin(at.t * 2.3 + j) * 9 + j * 2;
          d += `M${f1(px - 1.2)} ${f1(py - 0.5)}L${f1(px)} ${f1(py + 0.4)}L${f1(px + 1.2)} ${f1(py - 0.5)}`;
        }
      }
      set(id, { a: { ...SHOW, d } });
    }
  }
  // Lumières : fenêtres de la colline, réverbères, monuments, cadran. `lights: false` : la boucle ne les relit pas (elles ne
  // changent qu'avec la minute et la lumière du jour) ; leurs poses sont alors celles « éteintes », à ne pas écrire.
  if (I.lights === false) {
    m.landmarks.forEach((l, k) => {
      if (l.kind !== 'tower') return;
      const cx = l.x + 7 * l.s;
      const cy = l.base - 58 * l.s;
      const tm = Math.floor(T * 360) / 360;
      set(`aiguille-h-${k}`, { a: { ...SHOW, transform: `rotate(${f1(((tm % 12) / 12) * 360)} ${f2(cx)} ${f2(cy)})` } });
      set(`aiguille-m-${k}`, { a: { ...SHOW, transform: `rotate(${f1((tm % 1) * 360)} ${f2(cx)} ${f2(cy)})` } });
    });
    return m.nodes.map((n) => poses.get(n.id) ?? off());
  }
  const day: WindowDay = I.day ?? { weekday: D.weekday, kind: D.weekend ? 'weekend' : 'school' };
  m.windows.forEach((w, i) => set(`fenetre-${i}`, { a: { ...SHOW, opacity: windowLit(w.u, I.minutes, day, I.daylight, I.gloom) ? f2(w.alpha * I.dim) : '0' } }));
  m.lamps.forEach((l, i) => {
    if (l.mast) set(`mat-${i}`, { a: SHOW });
    set(`reverbere-${i}`, { a: { ...SHOW, opacity: lampOn(l, I.minutes, I.daylight, I.forcedNight ?? false) ? '1' : '0' } });
  });
  const monu = monumentK(T, I.daylight);
  m.landmarks.forEach((l, k) => {
    const s = l.kind === 'tower' ? 0.28 : 0.26;
    set(`monument-${k}`, { a: { ...SHOW, opacity: f2(s * monu) } });
    if (l.kind === 'tower') {
      set(`cadran-${k}`, { a: { ...SHOW, opacity: dark ? f2(0.6 * night) : '0' } });
      const cx = l.x + 7 * l.s;
      const cy = l.base - 58 * l.s;
      // Heure de la scène, sans les secondes pour l'aiguille des heures ; celle des minutes avance d'un cran par 10 s.
      const tm = Math.floor(T * 360) / 360;
      set(`aiguille-h-${k}`, { a: { ...SHOW, transform: `rotate(${f1(((tm % 12) / 12) * 360)} ${f2(cx)} ${f2(cy)})` } });
      set(`aiguille-m-${k}`, { a: { ...SHOW, transform: `rotate(${f1((tm % 1) * 360)} ${f2(cx)} ${f2(cy)})` } });
    }
  });
  return m.nodes.map((n) => poses.get(n.id) ?? off());
}

// Lumière d'une fenêtre allumée du mur du fond derrière ses volets (maquette : 15 % derrière un volet fermé). `b.life.wins`
// est parallèle à `b.wins` ; la fenêtre allumable est retrouvée par sa place. 1 sans volets.
export function farLightK(b: Pick<PaintBuilding, 'wins' | 'life' | 'look'>, win: { x: number; y: number }, D: FondMoment): number {
  if (!b.look.shutters || !b.life) return 1;
  const i = b.wins.findIndex((v) => v.x === win.x && v.y === win.y);
  const wl = i >= 0 ? b.life.wins[i] : undefined;
  return wl ? 1 - 0.85 * shutterK(slotHours(D.minutes), D, wl) : 1;
}

// Couleur étalonnée (matrice feColorMatrix de grade.ts, appliquée en sRGB) : le calque se teinte seul la nuit, sans filtre.
export function gradeHex(c: string, g: Grade): string {
  const v = hexRgb(c).map((x) => x / 255);
  const out = [0, 1, 2].map((i) => {
    const r = g[i * 5]! * v[0]! + g[i * 5 + 1]! * v[1]! + g[i * 5 + 2]! * v[2]! + g[i * 5 + 3]! + g[i * 5 + 4]!;
    return Math.max(0, Math.min(255, Math.round(r * 255)));
  }) as unknown as Rgb;
  return hex(out);
}
