import { hashString, mulberry32 } from '../scene-world';
import { hexRgb, mixRgb, type Rgb } from './color';

// Ciel peint (vague Ghibli, G2) : formes et couleurs des cumulus, peintres de la texture du ciel, des astres et de la brume.
// Fonctions pures et déterministes (tirages dérivés de la graine), sur l'interface PaintCtx.

export type Puff = { x: number; y: number; r: number };
// Cadre du nuage à l'échelle 1 : `base` = ventre plat ; bulles triées du haut vers le bas.
export type CloudShape = { w: number; h: number; base: number; puffs: Puff[] };

export const CLOUD_KINDS = 12;
// Marge autour des bulles : portée maximale d'une touche de nuage (voir paintCloud).
export const CLOUD_MARGIN = 6;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

// Cumulus n° k : rangée basse de bulles au ventre plat, puis étages de bulles plus petites vers le sommet.
export function cloudShape(seed: number, k: number): CloudShape {
  const rng = mulberry32(((seed ^ hashString('ghibli-cloud')) + Math.imul(k + 1, 0x9e3779b1)) >>> 0);
  const w = 80 + rng() * 40;
  const h = w * 0.85;
  const base = h - CLOUD_MARGIN - 2;
  const fit = (p: Puff): Puff => {
    const r = Math.min(p.r, (w - 2 * CLOUD_MARGIN) / 2);
    return {
      x: Math.min(w - CLOUD_MARGIN - r, Math.max(CLOUD_MARGIN + r, p.x)),
      y: Math.min(base, Math.max(CLOUD_MARGIN + r, p.y)),
      r,
    };
  };
  const puffs: Puff[] = [];
  const n = 5 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const r = w * (0.09 + 0.06 * Math.sin(Math.PI * t)) * (0.85 + rng() * 0.3);
    puffs.push(fit({ x: w * (0.16 + 0.68 * t), y: base - r * 0.55, r }));
  }
  let layer = puffs.slice();
  for (let lv = 0; lv < 3 && layer.length >= 2; lv++) {
    const next: Puff[] = [];
    for (let i = 0; i < Math.max(1, layer.length - 2); i++) {
      const a = layer[1 + Math.floor(rng() * Math.max(1, layer.length - 2))] ?? layer[0]!;
      const r = a.r * (0.75 + rng() * 0.35) * (lv === 0 ? 1.15 : 1);
      if (a.y - a.r * 0.75 - r < CLOUD_MARGIN) continue;
      next.push(fit({ x: a.x + (rng() - 0.5) * a.r * 0.9, y: a.y - a.r * 0.75, r }));
    }
    puffs.push(...next);
    layer = next;
  }
  return { w, h, base, puffs: puffs.sort((p, q) => p.y - q.y) };
}

// Lumière, milieu, ombre.
export type CloudPalette = readonly [Rgb, Rgb, Rgb];
const pal = (a: string, b: string, c: string): CloudPalette => [hexRgb(a), hexRgb(b), hexRgb(c)];
export const CLOUD_DAY = pal('#FFFDF6', '#DCE3EE', '#A6A3C9');
export const CLOUD_DUSK = pal('#FFE7B8', '#F1A783', '#7A6699');
export const CLOUD_NIGHT = pal('#7381AE', '#4B5687', '#262C58');
export const CLOUD_GREY = pal('#C9CDD4', '#9AA0AC', '#5E6474');
export const CLOUD_STORM = pal('#8B90A0', '#5B6070', '#2C3040');
// Nuit de pluie : les gros nuages restent visibles, gris sombre.
export const CLOUD_NIGHT_STORM = pal('#4A4F63', '#33384A', '#1C2030');

const mixPal = (a: CloudPalette, b: CloudPalette, t: number): CloudPalette => [mixRgb(a[0], b[0], t), mixRgb(a[1], b[1], t), mixRgb(a[2], b[2], t)];

// `dark` : obscurité des nuages calculée par la boucle météo (pluie, ciel très couvert), 0..1.
export function cloudPalette(daylight: number, twilight: number, dark: number): CloudPalette {
  const d = clamp01(daylight);
  const k = clamp01(dark);
  const lit = mixPal(CLOUD_DAY, CLOUD_DUSK, clamp01(twilight));
  const wet = k < 0.6 ? mixPal(lit, CLOUD_GREY, k / 0.6) : mixPal(CLOUD_GREY, CLOUD_STORM, (k - 0.6) / 0.4);
  const night = mixPal(CLOUD_NIGHT, CLOUD_NIGHT_STORM, k);
  return mixPal(night, wet, d);
}

export type CloudStep = { daylight: number; twilight: number; dark: number };
export const STEPS = 12;
const q = (v: number): number => Math.round(clamp01(v) * STEPS) / STEPS;

// Cran de couleur des nuages : un jeu de 12 nuages est peint par cran.
export const cloudStep = (daylight: number, twilight: number, dark: number): CloudStep => ({ daylight: q(daylight), twilight: q(twilight), dark: q(dark) });
export const stepKey = (s: CloudStep): string => `${Math.round(s.daylight * STEPS)}-${Math.round(s.twilight * STEPS)}-${Math.round(s.dark * STEPS)}`;
