import { GULL_FLAP_HZ, GULL_FRAMES } from '../paint/props/gull';
import { hashString, mulberry32 } from '../scene-world';

// Mouettes de la Ville (G5, tâche 14 ; notes.md §10, `flock` de la maquette) : des volées de 2 à 5 oiseaux traversent le ciel
// dans la bande de la crête de la colline (0,05 – 0,3 de la hauteur). Moteur pur et sans état : la pose de chaque oiseau est
// une fonction de (instant t en secondes d'horloge murale, graine de la pièce, taille de la scène, heure et ciel) ; le calque
// (gulls-layer.tsx) la relit à chaque image. Remplace les mouettes figées du décor peint (city-plan.ts : `hill.gulls` vide).
//
// Horaire : par heure d'horloge, 3 à 5 volées (5 à 7 de 7 h à 10 h), une par part égale de l'heure, tirées de (graine, heure) ;
// aucune ne PART la nuit (`daylight` < 0,3) ni par forte pluie (`rain` ≥ 0,6) : décidé à l'heure de départ de chaque volée
// (`closed`, intervalles de mauvais temps que le calque mémorise) ; une volée partie avant la nuit ou la pluie finit sa traversée par le bord, une
// volée qui serait partie pendant n'apparaît pas au retour du beau temps (rien n'apparaît ni ne disparaît sur place). Distance par volée : lointaine une fois sur quatre
// (s 0,3, pâleur 0,6, 9 px/s), moyenne (0,55 / 0,35 / 16 px/s) ou proche (1 / 0 / 24 px/s) ; chaque oiseau ×0,8..1,2.
// Vol : salves de battement de 1,6 s (3,3 battements/s, 8 poses) puis plané de 1,5 à 3,5 s (vu de biais quand il vire),
// trajectoire sinueuse décalée de ses voisines (−9 par rang, ±5 en hauteur, ±2,5 à 0,9 rad/s), qui descend doucement en plané
// et remonte en battant. Pose : quand la colline a des cheminées visibles, environ une volée proche ou moyenne sur deux a un
// oiseau qui la quitte vers une cheminée (approche de 5 s en arc, plané puis ailes hautes en flare), y reste 42 s ailes
// repliées, s'envole en battant (6 s) puis rejoint la hauteur de sa volée et sort de la scène. En s'approchant de la colline il
// rapetisse et pâlit jusqu'à l'échelle de la maison (perspective).

export type GullPose = { x: number; y: number; s: number; far: number; wing: 'flap' | 'glide' | 'turn' | 'perched'; flap: number; dir: 1 | -1 };
// Haut d'une cheminée de la colline (centre de la brique, à son sommet), échelle et brume de la maison.
export type GullPerch = { x: number; y: number; s: number; haze: number };
// `minutes` : heure de la scène en minutes entières, alignée sur la minute murale (voir `gullMinutes`). `closed` : intervalles
// muraux [début, fin] où le temps était fermé (nuit, pluie forte ; fin = Infinity s'il l'est encore) ; absent, le temps
// actuel (`daylight`, `rain`) vaut depuis toujours.
export type GullSky = { minutes: number; daylight: number; rain: number; closed?: readonly (readonly [number, number])[] };

const HOUR = 3600;
export const GULL_DARK = 0.3;
export const GULL_RAIN = 0.6;
const BAND: readonly [number, number] = [0.05, 0.3];
const MARGIN = 40; // les volées naissent et sortent à 40 px hors de la scène
const BURST = 1.6; // durée d'une salve de battement (s)
const APPROACH = 5;
const PERCHED = 42;
const TAKEOFF = 6;
const LAND_FROM = 70; // l'oiseau quitte la volée à 70 px de la cheminée
const PERCH_K = 0.6; // échelle posée = 0,6 × échelle de la maison (le corps couvre la brique de 3 s)
const TIERS = [
  { s: 0.3, far: 0.6, speed: 9 },
  { s: 0.55, far: 0.35, speed: 16 },
  { s: 1, far: 0, speed: 24 },
] as const;

type Bird = { dx: number; dy: number; ph: number; s: number; glideP: number };
type Flock = { start: number; dir: 1 | -1; y0: number; tier: (typeof TIERS)[number]; birds: Bird[]; perch: number | null };

const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const easeOut = (k: number): number => 1 - (1 - k) * (1 - k);
const mod = (a: number, n: number): number => ((a % n) + n) % n;

// Volées de l'heure d'horloge `h` ; `minutes` : heure de la scène au début de cette heure (matinée plus fréquentée). Le
// nombre de tirages ne dépend ni des cheminées ni de la taille : une volée garde les mêmes oiseaux quand la scène change.
function flocksOfHour(h: number, seed: number, height: number, minutes: number, perches: number): Flock[] {
  const r = mulberry32(seed ^ hashString('ghibli-gulls') ^ Math.imul(h + 1, 2654435761));
  const morning = minutes >= 7 * 60 && minutes < 10 * 60;
  const n = (morning ? 5 : 3) + Math.floor(r() * 3);
  const slot = HOUR / n;
  const lo = height * BAND[0] + 12;
  const hi = height * BAND[1] - 12;
  const out: Flock[] = [];
  for (let k = 0; k < n; k++) {
    const start = h * HOUR + k * slot + r() * slot * 0.6;
    const tr = r();
    const tier = TIERS[tr < 0.25 ? 0 : tr < 0.6 ? 1 : 2];
    const dir: 1 | -1 = r() < 0.5 ? 1 : -1;
    const y0 = lerp(lo, Math.max(lo, hi), r());
    const count = 2 + Math.floor(r() * 4);
    const birds: Bird[] = [];
    for (let i = 0; i < count; i++) birds.push({ dx: -i * 9 - r() * 6, dy: (r() - 0.5) * 10, ph: r() * 10, s: tier.s * (0.8 + r() * 0.4), glideP: 1.5 + r() * 2 });
    const lands = r() < 0.45;
    const pick = r();
    out.push({ start, dir, y0, tier, birds, perch: lands && perches > 0 && tier.speed > 9 ? Math.floor(pick * perches) : null });
  }
  return out;
}

// Vol libre d'un oiseau (τ : secondes depuis le départ de la volée) : aile, pose du battement, ordonnée.
function flight(b: Bird, f: Flock, tau: number): { wing: GullPose['wing']; flap: number; y: number } {
  const tt = tau + b.ph;
  const cyc = mod(tt, BURST + b.glideP);
  const flapping = cyc < BURST;
  const sF = f.tier.s;
  // Plané : descend de 0,4 px/s ; salve : remonte d'autant (continu aux deux bascules).
  const drift = flapping ? 0.4 * b.glideP * (1 - cyc / BURST) : 0.4 * (cyc - BURST);
  const y = f.y0 + (b.dy + 2.5 * Math.sin(0.9 * tt) + drift) * sF;
  if (flapping) return { wing: 'flap', flap: Math.floor(cyc * GULL_FLAP_HZ * GULL_FRAMES) % GULL_FRAMES, y };
  return { wing: Math.abs(Math.sin(0.4 * tt)) > 0.7 ? 'turn' : 'glide', flap: 0, y };
}

const flapAt = (tau: number): number => mod(Math.floor(tau * GULL_FLAP_HZ * GULL_FRAMES), GULL_FRAMES);

// Oiseau qui se pose : null tant qu'il vole avec sa volée (ou si la cheminée est trop près de son entrée dans la scène).
function lander(b: Bird, f: Flock, p: GullPerch, tau: number, x0: number, band: [number, number]): Omit<GullPose, 'dir'> | null {
  const { dir, tier } = f;
  const tauA = (dir * (p.x - x0) - LAND_FROM - b.dx * tier.s) / tier.speed;
  if (tauA <= 0 || tau < tauA) return null;
  const sP = PERCH_K * p.s;
  const yP = p.y - 1.5 * sP;
  const k0 = tau - tauA;
  if (k0 < APPROACH) {
    const k = k0 / APPROACH;
    const from = flight(b, f, tauA);
    const xA = p.x - dir * LAND_FROM;
    const e = easeOut(k);
    const wing = k < 0.4 ? 'flap' : k < 0.8 ? 'glide' : 'flap';
    return { x: lerp(xA, p.x, e), y: lerp(Math.min(band[1], Math.max(band[0], from.y)), yP, e) - Math.sin(k * Math.PI) * 8 * tier.s, s: lerp(b.s, sP, e), far: lerp(tier.far, p.haze, e), wing, flap: wing === 'glide' ? 0 : k < 0.4 ? flapAt(tau) : 6 };
  }
  if (k0 < APPROACH + PERCHED) return { x: p.x, y: yP, s: sP, far: p.haze, wing: 'perched', flap: 0 };
  const k1 = k0 - APPROACH - PERCHED;
  if (k1 < TAKEOFF) {
    const k = k1 / TAKEOFF;
    return { x: p.x + dir * 40 * k, y: yP - 26 * k + 6 * Math.sin(k * Math.PI), s: sP, far: p.haze, wing: 'flap', flap: flapAt(tau) };
  }
  // Retour au vol : rejoint la hauteur de sa volée (12 px/s), reprend sa taille en 6 s, sort à 0,8 × la vitesse.
  const k2 = k1 - TAKEOFF;
  const e = Math.min(1, k2 / 6);
  const fl = flight(b, f, tau);
  const yE = yP - 26;
  const dy = f.y0 - yE;
  const y = Math.abs(dy) < 1e-6 ? f.y0 : yE + dy * Math.min(1, (12 * k2) / Math.abs(dy));
  return { x: p.x + dir * (40 + k2 * tier.speed * 0.8), y: y + (fl.y - f.y0) * e, s: lerp(sP, b.s, e), far: lerp(p.haze, tier.far, e), wing: fl.wing, flap: fl.flap };
}

// Heure de la scène (minutes entières) au début de l'heure d'horloge `h`, vue depuis l'instant t : `minutes` est alignée sur la
// minute murale de t, donc on recule d'un nombre entier de minutes (stable dans toute la minute, et d'une minute à l'autre).
const hourStartMinutes = (t: number, h: number, minutes: number): number => mod(minutes - (Math.floor(t / 60) * 60 - h * HOUR) / 60, 1440);

// Heure de la scène vue par les mouettes : `minutes` (minute de la scène, entière) avancée avec l'horloge murale depuis le
// dernier changement de `minutes` vu (`clock`, gardée par l'appelant). En heure réelle, c'est `minutes` ; en heure fixe
// (`minutes` immobile), l'heure avance quand même minute par minute : les départs d'une heure ne sont jamais redistribués.
export function gullMinutes(clock: { m: number; base: number } | null, minutes: number, t: number): { clock: { m: number; base: number }; minutes: number } {
  const now = Math.floor(t / 60) * 60;
  const c = clock && clock.m === minutes ? clock : { m: minutes, base: now };
  return { clock: c, minutes: mod(minutes + (now - c.base) / 60, 1440) };
}

// Instants de départ des volées de l'heure d'horloge `h`, vue depuis l'instant t (tests : fenêtre du matin, stabilité).
export function gullDepartures(h: number, seed: number, t: number, minutes: number): number[] {
  return flocksOfHour(h, seed, 400, hourStartMinutes(t, h, minutes), 0).map((f) => f.start);
}

// Beau temps pour les mouettes (ni nuit ni forte pluie).
export const gullsOpen = (ctx: Pick<GullSky, 'daylight' | 'rain'>): boolean => ctx.daylight >= GULL_DARK && ctx.rain < GULL_RAIN;

// Oiseaux visibles à l'instant t. `perches` : hauts de cheminée de la colline (sans eux, aucune pose).
export function flocksAt(t: number, seed: number, width: number, height: number, ctx: GullSky, perches: readonly GullPerch[] = []): GullPose[] {
  // Volée montrée seulement si elle est partie par beau temps (départ hors de tout intervalle fermé).
  const closed = ctx.closed ?? (gullsOpen(ctx) ? [] : [[-Infinity, Infinity] as const]);
  const departed = (start: number): boolean => !closed.some(([a, b]) => start >= a && start < b);
  if (closed.some(([a, b]) => a === -Infinity && b === Infinity)) return [];
  const out: GullPose[] = [];
  const band: [number, number] = [height * BAND[0], height * BAND[1]];
  const span = width + 2 * MARGIN + 60;
  // Plus longue présence d'une volée (posée comprise, sortie à 0,8 × la vitesse) : les heures précédentes peuvent en avoir encore.
  const longest = span / TIERS[1].speed + span / (0.8 * TIERS[1].speed) + APPROACH + PERCHED + TAKEOFF + 6;
  const H = Math.floor(t / HOUR);
  for (let h = H - Math.ceil(longest / HOUR); h <= H; h++) {
    for (const f of flocksOfHour(h, seed, height, hourStartMinutes(t, h, ctx.minutes), perches.length)) {
      const tau = t - f.start;
      if (tau < 0 || tau > longest || !departed(f.start)) continue;
      const x0 = f.dir > 0 ? -MARGIN : width + MARGIN;
      f.birds.forEach((b, i) => {
        const p = i === 0 && f.perch !== null ? perches[f.perch] : undefined;
        const landed = p ? lander(b, f, p, tau, x0, band) : null;
        if (landed) {
          if (landed.x >= -MARGIN && landed.x <= width + MARGIN) out.push({ ...landed, dir: f.dir });
          return;
        }
        const x = x0 + f.dir * (tau * f.tier.speed + b.dx * f.tier.s);
        if (x < -MARGIN || x > width + MARGIN) return;
        const fl = flight(b, f, tau);
        out.push({ x, y: Math.min(band[1], Math.max(band[0], fl.y)), s: b.s, far: f.tier.far, wing: fl.wing, flap: fl.flap, dir: f.dir });
      });
    }
  }
  return out;
}
