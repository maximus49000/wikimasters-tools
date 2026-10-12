import { mixHex } from '../sky';

// Éclairage de concert de la Fête de la musique (G5, maquette g5-fetes notes §8) : moteur pur, déterministe en t (secondes
// depuis le début de la séquence). Repère de la scène d'install-sprites (centre x = 0, base y = 0 au sol, plancher −8).
// 120 bpm : temps 0,5 s, mesure 2 s ; palette changée toutes les 4 mesures (8 s) ; « hit » blanc sur le premier temps de
// chaque mesure (0,14 s, α 0,35) ; stroboscope rare (0,6 s toutes les 32 s, 12 Hz, α 0,5) ; lyres en éventail croisé sur 4 s.

export type Palette = readonly [string, string];
// c0 / c1 : 1 magenta / ambre, 2 cyan / violet, 3 vert / ambre, 4 rouge / blanc.
export const PALS: readonly Palette[] = [
  ['#FF2FB0', '#FFB020'],
  ['#20D8FF', '#8A40FF'],
  ['#30FF80', '#FFC040'],
  ['#FF3030', '#F0F0FF'],
];
// Positions fixes (repère de la scène) : lyres sous la traverse, contre-jours au fond, PAR (projecteurs de la traverse)
// vers les musiciens.
export const LYRES: readonly number[] = [-40, -14, 14, 40];
export const BACKS: readonly number[] = [-30, 0, 30];
export const PARS: readonly number[] = [-24, 0, 24];
export const LYRE_Y = -55;
export const BACK_Y = -40;
// Plancher de la scène (STAGE.floor d'install-sprites) : les faisceaux vers le plancher visent y = −floor + 1.
export const STAGE_FLOOR = 8;

export const BAR_S = 2;
export const PAL_S = 8;
export const HIT_S = 0.14;
export const HIT_A = 0.35;
export const STROBE_EVERY_S = 32;
export const STROBE_S = 0.6;
export const STROBE_HZ = 12;
export const STROBE_A = 0.5;
export const LYRE_SWEEP_S = 4;

export type Lyre = { pan: number; color: string; target: 'floor' | 'crowd' };
export type ConcertState = { pal: Palette; lyres: readonly Lyre[]; hit: number; strobe: number; led: number };

const wrap = (t: number, p: number): number => ((t % p) + p) % p;

export const paletteIndex = (t: number): number => Math.floor(wrap(t, PAL_S * PALS.length) / PAL_S);

export function concertState(t: number): ConcertState {
  const pal = PALS[paletteIndex(t)]!;
  const [c0, c1] = pal;
  const hit = wrap(t, BAR_S) < HIT_S ? HIT_A : 0;
  const strobe = wrap(t, STROBE_EVERY_S) < STROBE_S && Math.floor(t * STROBE_HZ) % 2 === 0 ? STROBE_A : 0;
  const led = Math.abs(Math.sin(t * 4));
  const lyres = LYRES.map((_, i) => {
    const ph = (2 * Math.PI * t) / LYRE_SWEEP_S + (i * Math.PI) / 2;
    return { pan: Math.sin(ph) * (i % 2 ? 1 : -1), color: i % 2 ? c0 : c1, target: i === 1 || i === 2 ? ('floor' as const) : ('crowd' as const) };
  });
  return { pal, lyres, hit, strobe, led };
}

// Cible du faisceau de la lyre i pour un pan dans [−1, 1] : sur le plancher (±26 u) ou dans le public (±60 u, à y = +30).
export function lyreTarget(i: number, pan: number): [number, number] {
  const x = LYRES[i]!;
  return i === 1 || i === 2 ? [x + pan * 26, -STAGE_FLOOR + 1] : [x * 0.4 + pan * 60, 30];
}

// Faisceau : quadrilatère de la source (demi-largeur w0) à la cible (demi-largeur w1) ; `core` : cœur plus étroit (0,4 / 0,35).
export type Beam = { points: string; core: string };
const f2 = (v: number): string => v.toFixed(2);
export function beamShape(sx: number, sy: number, tx: number, ty: number, w0: number, w1: number): Beam {
  const dx = tx - sx;
  const dy = ty - sy;
  const l = Math.hypot(dx, dy) || 1;
  const nx = -dy / l;
  const ny = dx / l;
  const quad = (a: number, b: number): string =>
    `${f2(sx + nx * a)},${f2(sy + ny * a)} ${f2(tx + nx * b)},${f2(ty + ny * b)} ${f2(tx - nx * b)},${f2(ty - ny * b)} ${f2(sx - nx * a)},${f2(sy - ny * a)}`;
  return { points: quad(w0, w1), core: quad(w0 * 0.4, w1 * 0.35) };
}

// Couleur éclaircie (mélange au blanc) : cœur des faisceaux, teinte des révélations.
export const lighten = (c: string, k: number): string => mixHex(c, '#FFFFFF', k);
