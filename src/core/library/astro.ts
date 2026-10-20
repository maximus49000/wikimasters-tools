import type { Position, Sky, Ymd } from './sky';

// Positions réelles du soleil et de la lune (formules basse précision d'astronomie de position, ≈ 1° près : bien assez
// pour un décor), calculées sur l'appareil. Angles en radians ; azimut compté depuis le nord, vers l'est.
const RAD = Math.PI / 180;
const OBLIQUITY = 23.4397 * RAD;
const J2000 = 2451545;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export type Horizontal = { alt: number; az: number };

const daysSinceJ2000 = (ms: number): number => ms / 86400000 + 2440587.5 - J2000;
const rightAscension = (l: number, b: number): number => Math.atan2(Math.sin(l) * Math.cos(OBLIQUITY) - Math.tan(b) * Math.sin(OBLIQUITY), Math.cos(l));
const declination = (l: number, b: number): number => Math.asin(Math.sin(b) * Math.cos(OBLIQUITY) + Math.cos(b) * Math.sin(OBLIQUITY) * Math.sin(l));
const siderealTime = (d: number, lon: number): number => RAD * (280.16 + 360.9856235 * d) + lon * RAD;

function horizontal(d: number, pos: Position, ra: number, dec: number): Horizontal {
  const phi = pos.lat * RAD;
  const h = siderealTime(d, pos.lon) - ra;
  const alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(h));
  // atan2 donne l'azimut depuis le sud, vers l'ouest : on le ramène au nord, vers l'est.
  const fromSouth = Math.atan2(Math.sin(h), Math.cos(h) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
  return { alt, az: (fromSouth + Math.PI) % (2 * Math.PI) };
}

export function sunPosition(ms: number, pos: Position): Horizontal {
  const d = daysSinceJ2000(ms);
  const m = RAD * (357.5291 + 0.98560028 * d);
  const c = RAD * (1.9148 * Math.sin(m) + 0.02 * Math.sin(2 * m) + 0.0003 * Math.sin(3 * m));
  const l = m + c + RAD * 102.9372 + Math.PI;
  return horizontal(d, pos, rightAscension(l, 0), declination(l, 0));
}

export function moonPosition(ms: number, pos: Position): Horizontal {
  const d = daysSinceJ2000(ms);
  const lm = RAD * (218.316 + 13.176396 * d);
  const m = RAD * (134.963 + 13.064993 * d);
  const f = RAD * (93.272 + 13.22935 * d);
  const l = lm + RAD * 6.289 * Math.sin(m);
  const b = RAD * 5.128 * Math.sin(f);
  const p = horizontal(d, pos, rightAscension(l, b), declination(l, b));
  // Parallaxe (≈ 0,95°) : vue d'un point de la Terre, la lune paraît plus basse que vue de son centre.
  return { alt: p.alt - 0.95 * RAD * Math.cos(p.alt), az: p.az };
}

// Vecteur unitaire (est, nord, zénith) d'une direction du ciel.
const enu = ({ alt, az }: Horizontal): [number, number, number] => [Math.cos(alt) * Math.sin(az), Math.cos(alt) * Math.cos(az), Math.sin(alt)];
const dot = (a: readonly number[], b: readonly number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;

// `lit` : part éclairée du disque (0 = nouvelle lune, 0,5 = quartier, 1 = pleine lune).
// `limb` : direction, sur l'écran (repère SVG, y vers le bas), du bord éclairé : vers le soleil, tel que l'observateur le voit
// en regardant la lune (droite = ouest quand il fait face au sud, est quand il fait face au nord).
export type MoonPhase = { lit: number; limb: number };

export function moonPhase(sun: Horizontal, moon: Horizontal): MoonPhase {
  const s = enu(sun);
  const m = enu(moon);
  const cosElong = clamp(dot(s, m), -1, 1);
  // Repère tangent au ciel en face de la lune : « haut » vers le zénith, « droite » = lune × zénith.
  const zm = m[2];
  const upRaw = [-zm * m[0], -zm * m[1], 1 - zm * zm];
  const upLen = Math.hypot(upRaw[0]!, upRaw[1]!, upRaw[2]!) || 1;
  const up = upRaw.map((v) => v / upLen);
  const rightRaw = [m[1], -m[0], 0];
  const rightLen = Math.hypot(rightRaw[0]!, rightRaw[1]!) || 1;
  const right = rightRaw.map((v) => v / rightLen);
  const toSun = s.map((v, i) => v - cosElong * m[i]!);
  return { lit: (1 - cosElong) / 2, limb: Math.atan2(-dot(toSun, up), dot(toSun, right)) };
}

// ── Mise en scène : du ciel réel au décor ───────────────────────────────────────────────────────────────────────────
// Le décor regarde vers l'équateur (le sud dans l'hémisphère nord) : l'est est à gauche, le midi solaire au milieu,
// l'ouest à droite (inversé dans l'hémisphère sud, qui regarde le nord). 135° de part et d'autre du méridien couvrent les
// levers et couchers les plus septentrionaux de France (≈ 50° d'azimut en juin).
const AZ_SPAN = 135 * RAD;
// Horizon juste sous la crête de la colline de la Ville (0,163 à 0,237 de la hauteur) : l'astre s'y couche ; il en sort dès
// quelques degrés de hauteur. Les hauteurs sont tassées (racine du sinus) pour que la course reste dans le ciel visible au-dessus
// de la colline, sans écraser l'écart entre l'hiver (soleil bas) et l'été (soleil haut).
const Y_HORIZON = 0.215;
const Y_TOP = 0.06;
const ALT_TOP = 66 * RAD;
// Sous l'horizon, l'astre continue de descendre derrière la colline.
const Y_PER_RAD_BELOW = 1.2;

export type SkyPoint = { x: number; y: number };

// Place d'un astre en fractions du monde (x de la largeur, y de la hauteur).
export function skyPoint({ alt, az }: Horizontal, lat: number): SkyPoint {
  const fromSouth = Math.atan2(Math.sin(az - Math.PI), Math.cos(az - Math.PI));
  const fromNorth = Math.atan2(Math.sin(az), Math.cos(az));
  const side = lat >= 0 ? fromSouth : fromNorth;
  const x = clamp(0.5 + (0.46 * side) / AZ_SPAN, 0.02, 0.98);
  const y = alt >= 0
    ? Y_HORIZON - (Y_HORIZON - Y_TOP) * Math.sqrt(Math.min(1, Math.sin(alt) / Math.sin(ALT_TOP)))
    : Y_HORIZON - alt * Y_PER_RAD_BELOW;
  return { x, y };
}

export type Astro = { sun: Horizontal; moon: Horizontal; sunAt: SkyPoint; moonAt: SkyPoint; phase: MoonPhase };

// Ciel réel du jour local `ymd` à la minute locale `minutes` (fuseau décalé de `tzOffsetMin` sur l'UTC).
export function astroAt(ymd: Ymd, minutes: number, pos: Position, tzOffsetMin: number): Astro {
  const ms = Date.UTC(ymd.y, ymd.m - 1, ymd.d) + (minutes - tzOffsetMin) * 60000;
  const sun = sunPosition(ms, pos);
  const moon = moonPosition(ms, pos);
  return { sun, moon, sunAt: skyPoint(sun, pos.lat), moonAt: skyPoint(moon, pos.lat), phase: moonPhase(sun, moon) };
}

// Ciel de `skyAt` complété par le ciel réel. Le soleil garde sa plage de visibilité (lever − 15 min à coucher + 15 min) ;
// la lune est là quand elle est levée, de jour comme de nuit, sauf autour de la nouvelle lune (invisible).
export function withRealSky(sky: Sky, astro: Astro): Sky {
  const moonUp = astro.moon.alt > -1 * RAD && astro.phase.lit > 0.03;
  return {
    ...sky,
    sunAt: astro.sunAt,
    moonAt: astro.moonAt,
    moonPhase: astro.phase,
    moonFrac: moonUp ? clamp((astro.moonAt.x - 0.04) / 0.92, 0, 1) : null,
  };
}
