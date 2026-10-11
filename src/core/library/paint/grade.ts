// Étalonnage de la ville peinte (vague Ghibli) : on peint un seul dessin de jour ; l'heure est rendue par une matrice
// feColorMatrix (4 lignes × 5 colonnes, appliquée en sRGB). Pas d'effet sur l'alpha.
export type Grade = number[];

export const IDENTITY: Grade = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
// Nuit : sombre et bleu-violet, comme la maquette cellulo (multiplication par #6878C0 puis voile sombre) ; les fenêtres
// allumées et les flaques des lampadaires sont dessinées par-dessus, hors filtre.
export const NIGHT: Grade = [0.36, 0, 0, 0, 0.01, 0, 0.41, 0, 0, 0.02, 0, 0, 0.66, 0, 0.05, 0, 0, 0, 1, 0];
// Lever et coucher : doré.
export const DUSK: Grade = [1.1, 0.04, 0, 0, 0.03, 0.02, 0.92, 0, 0, 0.01, 0, 0, 0.74, 0, 0, 0, 0, 0, 1, 0];

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const lerp = (a: Grade, b: Grade, t: number): Grade => a.map((v, i) => v + (b[i]! - v) * t);

// Composition de deux matrices affines (applique `b` puis `a`).
function compose(a: Grade, b: Grade): Grade {
  const out: Grade = new Array(20).fill(0);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 5; j++) {
      let v = j === 4 ? a[i * 5 + 4]! : 0;
      for (let k = 0; k < 4; k++) v += a[i * 5 + k]! * b[k * 5 + j]!;
      out[i * 5 + j] = v;
    }
  }
  return out;
}

// Ciel couvert : 30 % de désaturation et ×0,85 sur les couleurs.
function gloomMatrix(): Grade {
  const s = 0.7;
  const k = 0.85;
  const lr = 0.2126 * (1 - s);
  const lg = 0.7152 * (1 - s);
  const lb = 0.0722 * (1 - s);
  return [k * (lr + s), k * lg, k * lb, 0, 0, k * lr, k * (lg + s), k * lb, 0, 0, k * lr, k * lg, k * (lb + s), 0, 0, 0, 0, 0, 1, 0];
}

export function gradeFor(daylight: number, twilight: number, gloom: boolean): Grade {
  const base = lerp(IDENTITY, DUSK, clamp01(twilight));
  const graded = lerp(base, NIGHT, 1 - clamp01(daylight));
  return gloom ? compose(gloomMatrix(), graded) : graded;
}

export const gradeValues = (g: Grade): string => g.map((v) => Number(v.toFixed(3))).join(' ');
