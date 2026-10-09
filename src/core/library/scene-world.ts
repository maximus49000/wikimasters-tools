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

// Position horizontale (repère de la pièce) d'un acteur à l'instant t (secondes) : il traverse tout le monde puis recommence.
// Tous les cadres montrent le même monde, donc un acteur passe d'une fenêtre à l'autre après distance ÷ vitesse.
export function loopX(phase: number, speed: number, width: number, t: number): number {
  const loop = width + 2 * WORLD_MARGIN;
  const travelled = positiveMod(phase + Math.abs(speed) * t, loop);
  return speed > 0 ? travelled - WORLD_MARGIN : width + WORLD_MARGIN - travelled;
}

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
export type Building = { x: number; w: number; h: number; far: boolean; lamps: Lamp[] };

export const CHUNK = 360;

// Immeubles de la ville, tirés par bandes de 360 px (une zone de pièce) : agrandir la pièce à droite ne change pas ce qui existe déjà.
export function citySkyline(width: number, height: number, seed: number): Building[] {
  const ground = height * 0.78;
  const out: Building[] = [];
  for (let chunk = 0; chunk * CHUNK < width + CHUNK; chunk++) {
    const rng = mulberry32(seed ^ Math.imul(chunk + 1, 2654435761));
    for (const far of [true, false]) {
      let x = chunk * CHUNK + (far ? 0 : 12);
      const end = (chunk + 1) * CHUNK;
      while (x < end) {
        const w = (far ? 34 : 28) + rng() * (far ? 30 : 26);
        const h = (far ? 50 : 40) + rng() * (far ? 70 : 60);
        const lamps: Lamp[] = [];
        if (!far) {
          for (let r = 0; r < Math.floor(h / 14); r++) {
            for (let c = 0; c < Math.floor(w / 10); c++) {
              lamps.push({ x: x + 4 + c * 10, y: ground - h + 4 + r * 14, u: rng(), blue: rng() < 0.15 });
            }
          }
        }
        out.push({ x, w, h, far, lamps });
        x += w + (far ? -4 : 8 + rng() * 14);
      }
    }
  }
  return out;
}
