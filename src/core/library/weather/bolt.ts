import { mulberry32 } from '../scene-world';

// Éclair peint (vague Ghibli) : tracé brisé en petits segments, du haut du ciel jusqu'à 55 % de la hauteur.
// Même graine (un éclair donné), même tracé : les copies de chaque fenêtre et les trois traits superposés coïncident.
export function boltPath(x: number, height: number, seed: number): string {
  const rng = mulberry32(seed);
  const bottom = height * 0.55;
  const pts: [number, number][] = [[x, 0]];
  let px = x;
  let py = 0;
  while (py < bottom) {
    px += (rng() - 0.55) * 18;
    py = Math.min(bottom, py + 8 + rng() * 12);
    pts.push([px, py]);
  }
  return pts.map(([a, b], i) => `${i === 0 ? 'M' : 'L'}${a.toFixed(1)} ${b.toFixed(1)}`).join(' ');
}
