// Fumée d'échappement (spec véhicules §3) : portage de exhaust / drawPuffs de la maquette. Les bouffées naissent au pot
// (position dans le monde) et y restent : elles dérivent lentement vers l'arrière et vers le haut, grossissent et
// s'effacent (1,8 s) pendant que le véhicule s'éloigne. Cadence selon le moteur : dense et sombre à l'accélération,
// régulière en roulant, lente au ralenti. Pool FIXE (aucune création à chaque image) : la plus ancienne bouffée est reprise.
import { hashString, mulberry32 } from '../../scene-world';

export type Puff = { x: number; y: number; k: number; born: number; dark: boolean; jitter: number; live: boolean };
export type PuffPool = { puffs: Puff[]; next: number; last: Map<string, number> };
export const PUFF_LIFE = 1.8;
const EVERY = 0.32;

export function createPuffs(n = 48): PuffPool {
  return { puffs: Array.from({ length: n }, () => ({ x: 0, y: 0, k: 1, born: -1e9, dark: false, jitter: 0, live: false })), next: 0, last: new Map() };
}

// Émet au plus une bouffée pour la source `src` à l'instant `t` (x, y : pot dans le monde ; k : échelle d'affichage ; acc et v
// en px du monde, unit : échelle de la pièce).
export function emitPuffs(pool: PuffPool, src: { id: string; x: number; y: number; k: number; acc: number; v: number; unit: number }, t: number): void {
  const rate = src.acc > 2 * src.unit ? 0.45 : src.v < 0.5 * src.unit ? 1.8 : 1;
  const prev = pool.last.get(src.id);
  if (prev !== undefined && t - prev < EVERY * rate && t >= prev) return;
  pool.last.set(src.id, t);
  const p = pool.puffs[pool.next % pool.puffs.length]!;
  p.x = src.x;
  p.y = src.y;
  p.k = src.k;
  p.born = t;
  p.dark = src.acc > 2 * src.unit;
  p.jitter = mulberry32(hashString(src.id) ^ pool.next)();
  p.live = true;
  pool.next++;
}

export function puffView(p: Puff, t: number): { cx: number; cy: number; r: number; alpha: number } | null {
  if (!p.live) return null;
  const age = (t - p.born) / PUFF_LIFE;
  if (age < 0 || age >= 1) {
    if (age >= 1) p.live = false;
    return null;
  }
  return {
    cx: p.x - age * 6 * p.k - p.jitter * p.k,
    cy: p.y - age * 4 * p.k - Math.sin(age * 6 + p.jitter * 3) * 0.5 * p.k,
    r: (0.7 + age * 2.8) * p.k,
    alpha: 0.5 * (1 - age) * (1 - age),
  };
}

export function forgetPuffSources(pool: PuffPool, alive: ReadonlySet<string>): void {
  for (const id of pool.last.keys()) if (!alive.has(id)) pool.last.delete(id);
}
