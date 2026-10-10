// Couleurs du peintre (vague Ghibli) : triplets 0..255, sans dépendance au DOM.
export type Rgb = readonly [number, number, number];
type Rng = () => number;

const clamp255 = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));

export function hexRgb(hex: string): Rgb {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  const k = Math.max(0, Math.min(1, t));
  return [clamp255(a[0] + (b[0] - a[0]) * k), clamp255(a[1] + (b[1] - a[1]) * k), clamp255(a[2] + (b[2] - a[2]) * k)];
}

// Variation de teinte d'une touche (± amount par canal).
export function jitter(c: Rgb, amount: number, rng: Rng): Rgb {
  return [clamp255(c[0] + (rng() * 2 - 1) * amount), clamp255(c[1] + (rng() * 2 - 1) * amount), clamp255(c[2] + (rng() * 2 - 1) * amount)];
}

export function rgba(c: Rgb, alpha: number): string {
  return `rgba(${c[0]},${c[1]},${c[2]},${Number(alpha.toFixed(3))})`;
}
