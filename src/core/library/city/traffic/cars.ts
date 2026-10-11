// Générateur de voitures (spec véhicules §2) : aucune voiture ne ressemble à une autre. Une voiture = un type de carrosserie
// (plages de proportions) + des proportions continues tirées dedans (longueur, hauteur, ceinture de caisse, capot, coffre,
// pentes du pare-brise et de la lunette, arrondi, roues, garde au sol) + une peinture (teinte imposée par la suite, saturation
// et clarté tirées : pastels, couleurs profondes, crème, presque noir ; toit bicolore, liseré) + des détails (jantes,
// pare-chocs, phares, galerie, roue de secours, toit ouvrant, antenne, jupes) + ses occupants. Repris de la maquette validée
// (`.superpowers/brainstorm/vehicules-ghibli/maquette.html`), tirages dans le même ordre.
// Suite (carStream), partagée par toutes les voies d'une pièce : sur 10 voitures consécutives, ni type ni case de teinte
// répétés (types et cases tirés parmi ceux absents des 9 derniers). Le nombre d'or de la maquette ne suffisait pas : sur
// 10 termes, son plus petit écart de teinte vaut 0,056 tour ; par cases de 0,1, deux teintes d'une fenêtre sont à ≥ 0,085.
// Unités : celles des sprites de véhicules (roues au sol y = 0, regard vers +x, longueur ≈ 30 à 60).
import { mulberry32 } from '../../scene-world';

export type CarArch = 'berline' | 'citadine' | 'compacte' | 'break' | 'coupé' | 'cabriolet' | 'monospace' | '4x4' | 'pick-up' | 'limousine' | 'bulle' | 'sport';
export type CarBack = 'trunk' | 'hatch' | 'wagon' | 'fast' | 'pickup' | 'open';
export type Rim = 'enjoliveur' | 'rayons' | 'tôle' | 'flancs blancs' | 'alliage';
export type Range = readonly [number, number];
// L longueur, H hauteur du toit, belt ceinture de caisse, hood/trunk capot et coffre (fraction de L), ws/rs pentes du
// pare-brise et de la lunette (0 droit, 1 couché), round arrondi, wheel rayon, clear garde au sol, win vitres latérales.
export type Arch = { L: Range; H: Range; belt: Range; hood: Range; trunk: Range; ws: Range; rs: Range; round: Range; wheel: Range; clear: Range; win: number; back: CarBack };
export type Occupant = { role: 'driver' | 'front' | 'rear'; child: boolean; outfitSeed: number };
export type CarSpec = {
  arch: CarArch;
  back: CarBack;
  L: number;
  H: number;
  belt: number;
  round: number;
  wheelR: number;
  clear: number;
  hood: number;
  trunk: number;
  ws: number;
  rs: number;
  body: string;
  twoTone: string | null;
  stripe: string | null;
  rim: Rim;
  rimColor: string;
  chrome: boolean;
  lamp: 'rond' | 'carré';
  rack: boolean;
  spare: boolean;
  sunroof: boolean;
  antenna: boolean;
  skirts: boolean;
  hue: number;
  seed: number;
  occupants: Occupant[];
};

export const ARCHETYPES: Readonly<Record<CarArch, Arch>> = {
  berline: { L: [44, 50], H: [20, 22.5], belt: [12, 13.5], hood: [0.24, 0.3], trunk: [0.16, 0.22], ws: [0.45, 0.7], rs: [0.45, 0.7], round: [0.3, 0.7], wheel: [4, 4.6], clear: [3, 3.8], win: 2, back: 'trunk' },
  citadine: { L: [30, 35], H: [18.5, 21], belt: [11, 12.5], hood: [0.16, 0.22], trunk: [0.02, 0.05], ws: [0.4, 0.65], rs: [0.05, 0.3], round: [0.4, 0.9], wheel: [3.2, 3.8], clear: [2.6, 3.2], win: 1, back: 'hatch' },
  compacte: { L: [36, 41], H: [19.5, 21.5], belt: [11.5, 13], hood: [0.2, 0.26], trunk: [0.03, 0.06], ws: [0.5, 0.75], rs: [0.25, 0.5], round: [0.3, 0.6], wheel: [3.6, 4.2], clear: [2.8, 3.4], win: 2, back: 'hatch' },
  break: { L: [46, 52], H: [21, 23], belt: [12, 13.5], hood: [0.22, 0.27], trunk: [0.02, 0.04], ws: [0.45, 0.65], rs: [0, 0.12], round: [0.2, 0.5], wheel: [4, 4.5], clear: [3, 3.6], win: 3, back: 'wagon' },
  'coupé': { L: [40, 46], H: [16.5, 18.5], belt: [10.5, 11.5], hood: [0.3, 0.38], trunk: [0.08, 0.14], ws: [0.75, 0.95], rs: [0.75, 0.95], round: [0.5, 0.9], wheel: [4, 4.6], clear: [2.4, 3], win: 1, back: 'fast' },
  cabriolet: { L: [38, 44], H: [13, 14], belt: [10.5, 11.5], hood: [0.3, 0.36], trunk: [0.14, 0.2], ws: [0.7, 0.9], rs: [0, 0], round: [0.4, 0.8], wheel: [3.8, 4.4], clear: [2.6, 3.2], win: 0, back: 'open' },
  monospace: { L: [40, 46], H: [25, 27.5], belt: [12.5, 14], hood: [0.12, 0.17], trunk: [0.02, 0.04], ws: [0.75, 0.9], rs: [0.05, 0.2], round: [0.4, 0.8], wheel: [4, 4.4], clear: [3, 3.6], win: 3, back: 'wagon' },
  '4x4': { L: [40, 46], H: [25, 27], belt: [14, 15.5], hood: [0.2, 0.25], trunk: [0.02, 0.04], ws: [0.2, 0.4], rs: [0, 0.08], round: [0.1, 0.3], wheel: [4.8, 5.6], clear: [4.4, 5.4], win: 2, back: 'wagon' },
  'pick-up': { L: [46, 52], H: [23, 25], belt: [13, 14.5], hood: [0.22, 0.28], trunk: [0.32, 0.38], ws: [0.4, 0.6], rs: [0, 0.05], round: [0.2, 0.4], wheel: [4.6, 5.2], clear: [4, 4.8], win: 1, back: 'pickup' },
  limousine: { L: [54, 60], H: [21, 22.5], belt: [12.5, 13.5], hood: [0.26, 0.3], trunk: [0.17, 0.21], ws: [0.5, 0.7], rs: [0.5, 0.7], round: [0.2, 0.5], wheel: [4.4, 4.8], clear: [3, 3.4], win: 3, back: 'trunk' },
  bulle: { L: [30, 36], H: [20, 22], belt: [10.5, 12], hood: [0.14, 0.2], trunk: [0.12, 0.18], ws: [0.5, 0.7], rs: [0.6, 0.85], round: [0.85, 1], wheel: [3.6, 4.2], clear: [2.6, 3.2], win: 1, back: 'fast' },
  sport: { L: [40, 45], H: [14.5, 16], belt: [9.5, 10.5], hood: [0.34, 0.42], trunk: [0.06, 0.1], ws: [0.85, 1], rs: [0.8, 1], round: [0.6, 1], wheel: [4.2, 4.8], clear: [2, 2.5], win: 1, back: 'fast' },
};
export const ARCH_NAMES = Object.keys(ARCHETYPES) as readonly CarArch[];
const RIMS: readonly Rim[] = ['enjoliveur', 'rayons', 'tôle', 'flancs blancs', 'alliage'];

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export function hsl(h: number, s: number, l: number): string {
  const hh = ((h % 1) + 1) % 1;
  const f = (n: number): number => {
    const k = (n + hh * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return '#' + [f(0), f(8), f(4)].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
}

// Occupants : conducteur toujours ; passager avant (45 %, sportive 40 %) ; à l'arrière un enfant (25 %) ou un adulte (12 %),
// seulement si la voiture a au moins 2 vitres latérales (pas le coupé).
function occupantsOf(r: () => number, arch: CarArch, seed: number): Occupant[] {
  const out: Occupant[] = [{ role: 'driver', child: false, outfitSeed: (seed ^ 0xd17e) >>> 0 }];
  if (r() < (arch === 'sport' ? 0.4 : 0.45)) out.push({ role: 'front', child: false, outfitSeed: (seed ^ 0xf0e7) >>> 0 });
  if (ARCHETYPES[arch].win >= 2 && arch !== 'coupé') {
    const x = r();
    if (x < 0.25) out.push({ role: 'rear', child: true, outfitSeed: (seed ^ 0xc41d) >>> 0 });
    else if (x < 0.37) out.push({ role: 'rear', child: false, outfitSeed: (seed ^ 0xbac4) >>> 0 });
  }
  return out;
}

export function genCar(seed: number, arch: CarArch, hue: number): CarSpec {
  const r = mulberry32(seed);
  const A = ARCHETYPES[arch];
  const pick = ([a, b]: Range): number => lerp(a, b, r());
  const L = pick(A.L);
  const H = pick(A.H);
  const belt = pick(A.belt);
  const round = pick(A.round);
  const wheelR = pick(A.wheel);
  const clear = pick(A.clear);
  const hood = pick(A.hood) * L;
  const trunk = pick(A.trunk) * L;
  const ws = pick(A.ws);
  const rs = A.rs[1] === 0 ? 0 : pick(A.rs);
  const style = r();
  const sat = style < 0.15 ? 0.08 : style < 0.6 ? lerp(0.35, 0.6, r()) : lerp(0.55, 0.8, r());
  const lum = style < 0.08 ? 0.2 : style < 0.15 ? 0.85 : lerp(0.38, 0.7, r());
  const body = hsl(hue, sat, lum);
  const twoTone = arch !== 'cabriolet' && r() < 0.3 ? hsl(hue + 0.5 + (r() - 0.5) * 0.2, 0.25, lerp(0.75, 0.92, r())) : null;
  const stripe = r() < 0.25 ? hsl(hue + 0.08, 0.3, lum > 0.5 ? 0.25 : 0.85) : null;
  const rim = RIMS[Math.floor(r() * 5)]!;
  const rimColor = r() < 0.5 ? '#d9d6cf' : r() < 0.5 ? '#2f2f33' : body;
  const chrome = r() < 0.55;
  const lamp = r() < 0.5 ? 'rond' : 'carré';
  const rack = (arch === 'break' || arch === '4x4' || arch === 'monospace' || arch === 'compacte') && r() < 0.4;
  const spare = arch === '4x4' && r() < 0.7;
  const sunroof = (arch === 'berline' || arch === 'compacte' || arch === 'citadine') && r() < 0.25;
  const antenna = r() < 0.4;
  const skirts = arch === 'limousine' || (arch === 'bulle' && r() < 0.5);
  return { arch, back: A.back, L, H, belt, round, wheelR, clear, hood, trunk, ws, rs, body, twoTone, stripe, rim, rimColor, chrome, lamp, rack, spare, sunroof, antenna, skirts, hue: ((hue % 1) + 1) % 1, seed, occupants: occupantsOf(r, arch, seed) };
}

// Vitesse voulue selon le type (× vitesse des voitures) : sportive plus vive, 4x4 et pick-up plus lents en ville.
const SPEED: Partial<Record<CarArch, number>> = { sport: 1.12, 'coupé': 1.06, '4x4': 0.9, 'pick-up': 0.9, bulle: 0.92, limousine: 0.95 };
export const carSpeedFactor = (arch: CarArch): number => SPEED[arch] ?? 1;

const WINDOW = 9; // types et cases retenus : la 10ᵉ voiture n'en reprend aucun
export type CarStream = { n: number; seed: number; off: number; recent: CarArch[]; slots: number[]; rng: () => number };
export function carStream(seed: number): CarStream {
  const rng = mulberry32((seed * 977 + 13) >>> 0);
  return { n: 0, seed, off: rng(), recent: [], slots: [], rng };
}
export function nextCar(s: CarStream): CarSpec {
  const r = s.rng;
  const pool = ARCH_NAMES.filter((a) => !s.recent.includes(a));
  const arch = pool[Math.floor(r() * pool.length)]!;
  s.recent.push(arch);
  if (s.recent.length > WINDOW) s.recent.shift();
  const free = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter((k) => !s.slots.includes(k));
  const slot = free[Math.floor(r() * free.length)]!;
  s.slots.push(slot);
  if (s.slots.length > WINDOW) s.slots.shift();
  const hue = (s.off + slot * 0.1 + r() * 0.015) % 1;
  const spec = genCar((s.seed * 10007 + s.n * 7919) >>> 0, arch, hue);
  s.n++;
  return spec;
}
