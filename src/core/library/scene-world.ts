import type { SceneId } from './library-types';

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

export type ActorKind = 'cloud' | 'walker' | 'car' | 'sheep' | 'tractor' | 'hiker' | 'eagle' | 'boat' | 'gull' | 'satellite' | 'probe' | 'station';
// `u` ∈ [0,1) : seuil d'activité (voir activity.ts) ; u < 0 = toujours présent. `phase` : décalage de départ en px.
export type Actor = { id: string; kind: ActorKind; y: number; speed: number; phase: number; u: number; scale: number };

export const WORLD_MARGIN = 80;

const positiveMod = (a: number, n: number): number => ((a % n) + n) % n;

// Position horizontale d'un objet qui traverse tout le monde puis recommence (`speed` signé, `phase` en px).
export function loopX(phase: number, speed: number, width: number, t: number): number {
  const loop = width + 2 * WORLD_MARGIN;
  const travelled = positiveMod(phase + Math.abs(speed) * t, loop);
  return speed > 0 ? travelled - WORLD_MARGIN : width + WORLD_MARGIN - travelled;
}

// Position horizontale (repère de la pièce) d'un acteur à l'instant t (secondes) : il traverse tout le monde puis recommence.
// Tous les cadres montrent le même monde, donc un acteur passe d'une fenêtre à l'autre après distance ÷ vitesse.
export function actorX(actor: Actor, width: number, t: number): number {
  return loopX(actor.phase, actor.speed, width, t);
}

type Spec = { kind: ActorKind; every: number; yMin: number; yMax: number; speedMin: number; speedMax: number; active: boolean; scale: [number, number] };

// Un acteur tous les `every` px de largeur. `y` en fraction de la hauteur.
const SPECS: Record<SceneId, Spec[]> = {
  city: [
    { kind: 'cloud', every: 420, yMin: 0.06, yMax: 0.3, speedMin: 5, speedMax: 11, active: false, scale: [0.8, 1.5] },
  ],
  countryside: [
    { kind: 'cloud', every: 380, yMin: 0.06, yMax: 0.28, speedMin: 5, speedMax: 12, active: false, scale: [0.8, 1.6] },
    { kind: 'sheep', every: 300, yMin: 0.84, yMax: 0.92, speedMin: 3, speedMax: 6, active: false, scale: [0.8, 1.1] },
    { kind: 'tractor', every: 900, yMin: 0.78, yMax: 0.8, speedMin: 14, speedMax: 20, active: true, scale: [1, 1.2] },
  ],
  mountain: [
    { kind: 'cloud', every: 420, yMin: 0.05, yMax: 0.25, speedMin: 4, speedMax: 9, active: false, scale: [0.8, 1.5] },
    { kind: 'hiker', every: 700, yMin: 0.86, yMax: 0.9, speedMin: 8, speedMax: 14, active: true, scale: [0.9, 1.1] },
    { kind: 'eagle', every: 800, yMin: 0.15, yMax: 0.4, speedMin: 25, speedMax: 40, active: false, scale: [0.9, 1.3] },
  ],
  sea: [
    { kind: 'cloud', every: 400, yMin: 0.05, yMax: 0.25, speedMin: 5, speedMax: 11, active: false, scale: [0.8, 1.5] },
    { kind: 'boat', every: 600, yMin: 0.6, yMax: 0.7, speedMin: 8, speedMax: 16, active: true, scale: [0.9, 1.3] },
    { kind: 'gull', every: 700, yMin: 0.15, yMax: 0.4, speedMin: 22, speedMax: 36, active: false, scale: [0.9, 1.1] },
  ],
  space: [
    { kind: 'satellite', every: 900, yMin: 0.15, yMax: 0.7, speedMin: 12, speedMax: 22, active: false, scale: [0.9, 1.2] },
    { kind: 'probe', every: 1600, yMin: 0.2, yMax: 0.6, speedMin: 30, speedMax: 50, active: false, scale: [1, 1.3] },
  ],
  earth: [
    { kind: 'station', every: 1400, yMin: 0.2, yMax: 0.5, speedMin: 18, speedMax: 26, active: false, scale: [1, 1.2] },
    { kind: 'satellite', every: 700, yMin: 0.1, yMax: 0.6, speedMin: 14, speedMax: 24, active: false, scale: [0.8, 1.1] },
  ],
};

export function actorsFor(scene: SceneId, width: number, height: number, seed: number): Actor[] {
  const rng = mulberry32(seed ^ hashString(`actors-${scene}`));
  const actors: Actor[] = [];
  for (const spec of SPECS[scene]) {
    const count = Math.max(1, Math.round(width / spec.every));
    for (let i = 0; i < count; i++) {
      const dir = rng() < 0.5 ? 1 : -1;
      actors.push({
        id: `${spec.kind}-${i}`,
        kind: spec.kind,
        y: Math.round((spec.yMin + rng() * (spec.yMax - spec.yMin)) * height),
        speed: dir * (spec.speedMin + rng() * (spec.speedMax - spec.speedMin)),
        phase: rng() * (width + 2 * WORLD_MARGIN),
        u: spec.active ? rng() : -1,
        scale: spec.scale[0] + rng() * (spec.scale[1] - spec.scale[0]),
      });
    }
  }
  return actors;
}

export type Lamp = { x: number; y: number; u: number; blue: boolean };
// Socle commun d'un lot « jumeaux » : rez-de-chaussée commercial + un étage, partagé (même objet) par les deux tours.
export type Podium = { id: number; x: number; w: number; h: number };
export type Building = { x: number; w: number; h: number; far: boolean; lamps: Lamp[]; podium?: Podium };

export const CHUNK = 360;
// Hauteur du socle des jumeaux : rez-de-chaussée (GROUND_FLOOR = 30, city/facades.ts) + une rangée de fenêtres (14).
export const PODIUM_H = 44;
const LOT = { start: 12, twin: 0.4, touch: 0.45 } as const;

// Sol sur lequel `citySkyline` pose ses fenêtres (son tirage n'en dépend pas) ; la rue dessinée a son propre sol (city/metrics.ts).
export const SKYLINE_GROUND = 0.78;

// Grille de fenêtres d'origine (colonnes de 10 px, rangées de 14 px) posée sur SKYLINE_GROUND.
function lampsOf(rng: () => number, x: number, w: number, h: number, ground: number): Lamp[] {
  const lamps: Lamp[] = [];
  for (let r = 0; r < Math.floor(h / 14); r++) {
    for (let c = 0; c < Math.floor(w / 10); c++) lamps.push({ x: x + 4 + c * 10, y: ground - h + 4 + r * 14, u: rng(), blue: rng() < 0.15 });
  }
  return lamps;
}

// Rang du fond : par tranche de 360 (tirage inchangé). Premier plan : une suite de lots de gauche à droite (un seul
// générateur, préfixe stable quand la pièce s'élargit) : simple (40-70 px) ou jumeaux (deux tours sur un socle commun),
// mitoyens ou séparés de 8 à 22 px.
export function citySkyline(width: number, height: number, seed: number): Building[] {
  const ground = height * SKYLINE_GROUND;
  const out: Building[] = [];
  for (let chunk = 0; chunk * CHUNK < width + CHUNK; chunk++) {
    const rng = mulberry32(seed ^ Math.imul(chunk + 1, 2654435761));
    let x = chunk * CHUNK;
    const end = (chunk + 1) * CHUNK;
    while (x < end) {
      const w = 34 + rng() * 30;
      const h = 50 + rng() * 70;
      out.push({ x, w, h, far: true, lamps: [] });
      x += w - 4;
    }
  }
  const rng = mulberry32(seed ^ hashString('city-lots'));
  let podiumId = 0;
  for (let x = LOT.start; x < width + CHUNK; ) {
    if (rng() < LOT.twin) {
      const wa = 26 + rng() * 18;
      const wb = 26 + rng() * 18;
      const gap = rng() * 8;
      const ha = 45 + rng() * 55;
      let hb = 45 + rng() * 55;
      if (Math.abs(ha - hb) < 12.5) hb = ha < 72.5 ? ha + 12.5 : ha - 12.5;
      const podium: Podium = { id: podiumId++, x, w: wa + gap + wb, h: PODIUM_H };
      out.push({ x, w: wa, h: ha, far: false, lamps: lampsOf(rng, x, wa, ha, ground), podium });
      out.push({ x: x + wa + gap, w: wb, h: hb, far: false, lamps: lampsOf(rng, x + wa + gap, wb, hb, ground), podium });
      x += podium.w;
    } else {
      const w = 40 + rng() * 30;
      const h = 40 + rng() * 60;
      out.push({ x, w, h, far: false, lamps: lampsOf(rng, x, w, h, ground) });
      x += w;
    }
    x += rng() < LOT.touch ? 0 : 8 + rng() * 14;
  }
  return out;
}
