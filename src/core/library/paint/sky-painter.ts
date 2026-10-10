import { hashString, mulberry32 } from '../scene-world';
import { DAB_SPREAD, dab } from './brush';
import { hexRgb, jitter, mixRgb, type Rgb } from './color';
import type { PaintCtx } from './paint-ctx';

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

// Cumulus : bulles peintes du haut vers le bas, chaque touche éclairée selon sa place dans sa bulle (lumière en haut à
// gauche), contraste plus faible vers la base, liseré clair sur les bulles hautes, ventre ombré. Coordonnées du cadre.
// Portée des touches ≤ CLOUD_MARGIN : rayon 3,2 × 1,4 × DAB_SPREAD ≈ 5,2 ; liseré 2,6 × 1,8 × DAB_SPREAD ≈ 5,4.
export function paintCloud(ctx: PaintCtx, shape: CloudShape, palette: CloudPalette, seed: number): void {
  const rng = mulberry32(seed ^ hashString('ghibli-cloud-paint'));
  const [hi, mid, sh] = palette;
  const { w, h, base } = shape;
  const vertOf = (y: number): number => clamp01((y - h * 0.1) / (base - h * 0.1));
  for (const p of shape.puffs) {
    const n = Math.round(p.r * p.r * 2.2);
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2;
      const d = Math.sqrt(rng());
      const dx = Math.cos(a) * d;
      const dy = Math.sin(a) * d;
      const x = p.x + dx * p.r;
      const y = p.y + dy * p.r;
      if (y > base + 2) continue;
      const light = Math.max(-1, Math.min(1, -dx * 0.55 - dy * 0.85));
      const vert = vertOf(y);
      const contrast = 0.55 + 0.45 * (1 - vert);
      let c = light > 0 ? mixRgb(mid, hi, light * contrast) : mixRgb(mid, sh, -light * 0.9 * contrast);
      c = mixRgb(c, sh, vert * vert * 0.55);
      dab(ctx, rng, x, y, 1.2 + rng() * 2, jitter(c, 6, rng), d > 0.88 ? 0.22 : 0.55, 1.4, (rng() - 0.5) * 1.2);
    }
    const up = 1 - vertOf(p.y);
    for (let i = 0; i < p.r * 1.2 * up; i++) {
      const a = -2.4 + rng() * 1.6;
      dab(ctx, rng, p.x + Math.cos(a) * p.r * 0.9, p.y + Math.sin(a) * p.r * 0.9, 1 + rng() * 1.6, jitter(hi, 4, rng), 0.32, 1.8, a + Math.PI / 2);
    }
  }
  for (let i = 0; i < w * 2; i++) {
    dab(ctx, rng, w * 0.2 + rng() * w * 0.6, base - rng() * h * 0.05, 1 + rng() * 0.8, jitter(sh, 6, rng), 0.14, 2.6, (rng() - 0.5) * 0.15);
  }
}

// Touche reportée de l'autre côté du motif quand elle déborde : le motif se raccorde sur ses bords. Chaque copie rejoue le
// même générateur (`dabSeed`) pour avoir exactement la même forme.
function wrappedDab(ctx: PaintCtx, dabSeed: number, x: number, y: number, r: number, color: Rgb, alpha: number, elong: number, rot: number, wrapW: number, wrapH: number | null): void {
  const reach = r * elong * DAB_SPREAD;
  const xs = [0, -wrapW, wrapW].filter((ox) => x + ox + reach > 0 && x + ox - reach < wrapW);
  const ys = wrapH === null ? [0] : [0, -wrapH, wrapH].filter((oy) => y + oy + reach > 0 && y + oy - reach < wrapH);
  for (const ox of xs) for (const oy of ys) dab(ctx, mulberry32(dabSeed), x + ox, y + oy, r, color, alpha, elong, rot);
}

export const SKY_TEXTURE = 256;
const TEX_LIGHT = hexRgb('#FFFFFF');
const TEX_DARK = hexRgb('#2A3550');

// Texture du ciel : touches allongées, claires et sombres, très légères, sur un carré qui se raccorde dans les deux sens.
export function paintSkyTexture(ctx: PaintCtx, size: number, seed: number): void {
  const rng = mulberry32(seed ^ hashString('ghibli-sky-texture'));
  const n = Math.round(size * size * 0.03);
  for (let i = 0; i < n; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const r = 2 + rng() * 4;
    const color = rng() < 0.55 ? TEX_LIGHT : TEX_DARK;
    const alpha = 0.05 + rng() * 0.05;
    const rot = (rng() - 0.5) * 0.25;
    const dabSeed = Math.floor(rng() * 4294967296);
    wrappedDab(ctx, dabSeed, x, y, r, color, alpha, 2.8, rot, size, size);
  }
}

export const SUN_SIZE = 64;
// Soleil : disque de touches (rayon ≈ 20, comme le soleil actuel), bord plus soutenu ; le halo est un dégradé SVG.
export function paintSun(ctx: PaintCtx, dusk: boolean, seed: number): void {
  const rng = mulberry32(seed ^ hashString(dusk ? 'ghibli-sun-dusk' : 'ghibli-sun'));
  const c = SUN_SIZE / 2;
  const core = hexRgb(dusk ? '#FFB063' : '#FFF4C8');
  const rim = hexRgb(dusk ? '#FF8A4A' : '#FFE08A');
  for (let i = 0; i < 420; i++) {
    const a = rng() * Math.PI * 2;
    const d = Math.sqrt(rng()) * 20;
    dab(ctx, rng, c + Math.cos(a) * d, c + Math.sin(a) * d, 1.5 + rng() * 2, jitter(mixRgb(core, rim, (d / 20) * 0.6), 8, rng), 0.55, 1.3);
  }
}

export const MOON_SIZE = 48;
const MOON_LIT = hexRgb('#F4F2E6');
const MOON_SHADE = hexRgb('#C9CCD9');
// Lune : disque de touches (rayon 16) éclairé à gauche, trois cratères ; le halo est un dégradé SVG.
export function paintMoon(ctx: PaintCtx, seed: number): void {
  const rng = mulberry32(seed ^ hashString('ghibli-moon'));
  const c = MOON_SIZE / 2;
  for (let i = 0; i < 320; i++) {
    const a = rng() * Math.PI * 2;
    const d = Math.sqrt(rng()) * 16;
    const shade = clamp01((Math.cos(a) * d) / 16 + 0.2);
    dab(ctx, rng, c + Math.cos(a) * d, c + Math.sin(a) * d, 1.6 + rng() * 2.4, mixRgb(MOON_LIT, MOON_SHADE, shade), 0.6, 1.2);
  }
  ctx.fillStyle = 'rgba(150,155,175,0.35)';
  for (const [dx, dy, r] of [[-5, -4, 3.5], [5, 3, 2.6], [-2, 7, 2]] as const) {
    ctx.beginPath();
    ctx.ellipse(c + dx, c + dy, r, r, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

export const FOG_W = 720;
const FOG = hexRgb('#E2E7EE');
// Brume : trois bancs de touches très légères (répartition en cloche autour de leur hauteur), raccord gauche-droite.
export function paintFogBand(ctx: PaintCtx, w: number, h: number, seed: number): void {
  const rng = mulberry32(seed ^ hashString('ghibli-fog'));
  for (let b = 0; b < 3; b++) {
    const y0 = h * (0.25 + b * 0.25);
    const n = Math.round((w * 700) / FOG_W);
    for (let i = 0; i < n; i++) {
      const g = (rng() + rng() + rng() - 1.5) / 1.5;
      const r = 5 + rng() * 6;
      const reach = r * 2.6 * DAB_SPREAD;
      const y = Math.min(h - reach, Math.max(reach, y0 + g * h * 0.17));
      const dabSeed = Math.floor(rng() * 4294967296);
      wrappedDab(ctx, dabSeed, rng() * w, y, r, FOG, 0.03 * (1 - Math.abs(g)), 2.6, (rng() - 0.5) * 0.08, w, null);
    }
  }
}
