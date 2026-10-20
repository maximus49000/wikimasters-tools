// src/content/rain-art.ts
// Dessin de la pluie naturelle (canvas 2D) : porté de `RainOutside.paint`, `GlassRain.paint` / `drawDrop` et `lightAt` de la
// maquette docs/superpowers/maquettes/pluie-naturelle (couleurs et formules de notes.md). Sans l'éclair ni le flash (couche météo).
// Les moteurs sont ailleurs (weather/rain-drops.ts, weather/glass-rain.ts) : ici on ne fait que peindre leur état.
// Économies Android : aucune `ctx.filter` ; alpha par `globalAlpha` (une seule chaîne de couleur par rôle et par pas de nuit) ;
// dégradés des traits et halos mis en cache par contexte ; sprites des gouttes de vitre précalculés par (rayon au demi-pixel,
// teinte quantifiée, jour/nuit, échelle) ; buée = masque à demi-résolution ; aucune allocation de tableau par image.
import { hexRgb, mixRgb, rgba, type Rgb } from '../core/library/paint/color';
import { mulberry32 } from '../core/library/scene-world';
import type { GlassSim, GlassTrailPoint, Pane } from '../core/library/weather/glass-rain';
import { gust, LAYERS, type RainEnv, type RainSim, type RainWorld } from '../core/library/weather/rain-drops';

export type RainLight = { x: number; y: number; w: number; color: string; k: number }; // lampadaire (w ≤ 10) ou vitrine
export type LightField = {
  lightAt(x: number, y: number): number;
  colorAt(x: number, y: number): string;
  /** Même couleur, sans allocation (les gouttes de vitre en font trois par goutte). */
  rgbAt?(x: number, y: number, out: number[]): void;
  /** Sources connues (reflets au sol, halos). */
  lights?: readonly RainLight[];
};
export type FogMask = {
  erase(trail: readonly { x: number; y: number; r: number }[]): void;
  regrow(dt: number): void;
  draw(ctx: CanvasRenderingContext2D, pane: Pane, env: { precip: number; daylight: number }): void;
};

const TAU = Math.PI * 2;
const RAIN = hexRgb('#E6EDF7'), RAIN_NIGHT = hexRgb('#C9D6EA'); // gouttes : jamais teintées par la nuit (c'est de la lumière)
const WATER_DAY = hexRgb('#9FB4C8'), WATER_NIGHT = hexRgb('#1C2440');
const BRUME_DAY = hexRgb('#DCE4EC'), BRUME_NIGHT = hexRgb('#2A3450');
const WHITE: Rgb = [255, 255, 255];
const INK: Rgb = [42, 26, 24];
const INK_STR = 'rgba(42,26,24,1)';
const TRAIL_NIGHT_RGB: Rgb = [200, 212, 236]; // filet des traces : blanc le jour, bleuté la nuit
const FOG_DAY = hexRgb('#EEF2F6'), FOG_NIGHT = hexRgb('#C4CEE0');

const lerp = (a: number, b: number, u: number): number => a + (b - a) * u;
const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const clamp01 = (v: number): number => (Number.isFinite(v) ? clamp(v, 0, 1) : 0);
const lum = (c: ArrayLike<number>): number => (0.299 * c[0]! + 0.587 * c[1]! + 0.114 * c[2]!) / 255;
const mixInto = (out: number[], a: ArrayLike<number>, b: ArrayLike<number>, t: number): void => {
  out[0] = a[0]! + (b[0]! - a[0]!) * t;
  out[1] = a[1]! + (b[1]! - a[1]!) * t;
  out[2] = a[2]! + (b[2]! - a[2]!) * t;
};

// ───────────── couleurs par pas de nuit (21 pas) : une chaîne par rôle, calculée une fois ─────────────
type Tone = 'base' | 'ripple' | 'filet' | 'bouillon' | 'water' | 'brume';
const TONES: Record<Tone, (string | undefined)[]> = { base: [], ripple: [], filet: [], bouillon: [], water: [], brume: [] };
function tone(role: Tone, nb: number): string {
  const cached = TONES[role][nb];
  if (cached) return cached;
  const night = nb / 20;
  const base = mixRgb(RAIN, RAIN_NIGHT, night);
  const c: Rgb =
    role === 'base' ? base
      : role === 'ripple' ? mixRgb(base, WHITE, 0.3)
        : role === 'filet' ? mixRgb(base, WHITE, 0.2)
          : role === 'bouillon' ? mixRgb(base, WHITE, 0.4)
            : role === 'water' ? mixRgb(WATER_DAY, WATER_NIGHT, night)
              : mixRgb(BRUME_DAY, BRUME_NIGHT, night);
  return (TONES[role][nb] = rgba(c, 1));
}
const nightStep = (daylight: number): number => Math.round(clamp01(1 - daylight) * 20);

// ───────────── champ de lumière : éclairement (alpha des gouttes la nuit) et couleur derrière (gouttes de vitre) ─────────────
type Src = RainLight & { rgb: Rgb; lamp: boolean };
// Contribution d'une source en un point (maquette `lightAt`) : cônes des lampadaires (demi-largeur 12 + 0,6 dy, décroît sur
// 300 px) + boule de 80 px autour de la lanterne ; vitrine : 0,6 devant, 0,35 décroissant sur le trottoir (pour k = 0,7).
function contrib(l: Src, x: number, y: number): number {
  let f = 0;
  if (l.lamp) {
    const dy = y - l.y;
    if (dy > -8) {
      const hw = 12 + dy * 0.6;
      const d = Math.abs(x - l.x);
      if (d < hw) f += (1 - d / hw) * clamp(1 - dy / 300, 0.25, 1);
    }
    const r = Math.hypot(x - l.x, y - l.y);
    if (r < 80) f += (1 - r / 80) * 0.9;
  } else if (y > l.y - 60 && y < l.y + 34 && Math.abs(x - l.x) < l.w + 14) f += y < l.y + 4 ? 0.86 : 0.5 * (1 - (y - l.y - 4) / 30);
  return f * l.k;
}

export function makeLightField(lights: readonly RainLight[], sky: { top: string; bottom: string }, height: number): LightField {
  const srcs: Src[] = lights.map((l) => ({ ...l, rgb: hexRgb(l.color), lamp: l.w <= 10 }));
  const top = hexRgb(sky.top), bottom = hexRgb(sky.bottom);
  const h = height > 0 ? height : 1;
  const scratch = [0, 0, 0];
  const rgbAt = (x: number, y: number, out: number[]): void => {
    mixInto(out, top, bottom, clamp(y / h, 0, 1));
    for (const l of srcs) {
      const w = contrib(l, x, y);
      if (w > 0.01) mixInto(out, out, l.rgb, Math.min(1, w));
    }
  };
  return {
    lights,
    lightAt: (x, y) => {
      let f = 0;
      for (const l of srcs) f += contrib(l, x, y);
      return f;
    },
    rgbAt,
    colorAt: (x, y) => {
      rgbAt(x, y, scratch);
      return `rgba(${Math.round(scratch[0]!)},${Math.round(scratch[1]!)},${Math.round(scratch[2]!)},1)`;
    },
  };
}

const RGB_RE = /(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)/;
function sample(field: LightField, x: number, y: number, out: number[]): void {
  if (field.rgbAt) return field.rgbAt(x, y, out);
  const s = field.colorAt(x, y);
  if (s.startsWith('#')) { const c = hexRgb(s); out[0] = c[0]; out[1] = c[1]; out[2] = c[2]; return; }
  const m = RGB_RE.exec(s);
  out[0] = m ? Number(m[1]) : 143; out[1] = m ? Number(m[2]) : 163; out[2] = m ? Number(m[3]) : 184;
}

// alpha d'une goutte selon la lumière locale (nuit : visible à 30 % hors des cônes, ressort dedans et devant les vitrines)
function alphaAt(field: LightField, daylight: number, x: number, y: number, a: number): number {
  if (daylight > 0.95) return a;
  return a * lerp(0.3 + 0.9 * Math.min(1.2, field.lightAt(x, y)), 1, daylight);
}

// ───────────── caches par contexte : dégradés des traits (par longueur et pas de nuit) et halos (par lampadaire) ─────────────
type Caches = { grads: Map<number, CanvasGradient>; halos: WeakMap<RainLight, { R: number; g: CanvasGradient }> };
const CACHES = new WeakMap<CanvasRenderingContext2D, Caches>();
function cachesOf(ctx: CanvasRenderingContext2D): Caches {
  let c = CACHES.get(ctx);
  if (!c) CACHES.set(ctx, (c = { grads: new Map(), halos: new WeakMap() }));
  return c;
}
// Trait qui s'estompe vers la queue (tête en bas) : dégradé vertical local (0, −len) → (0, 0), l'alpha global fait le reste.
function strokeGradient(ctx: CanvasRenderingContext2D, caches: Caches, lenBucket: number, nb: number): CanvasGradient {
  const key = lenBucket * 32 + nb;
  let g = caches.grads.get(key);
  if (!g) {
    if (caches.grads.size > 600) caches.grads.clear();
    const base = mixRgb(RAIN, RAIN_NIGHT, nb / 20);
    g = ctx.createLinearGradient(0, -lenBucket * 2, 0, 0);
    g.addColorStop(0, rgba(base, 0));
    g.addColorStop(0.7, rgba(base, 1));
    g.addColorStop(1, rgba(base, 1));
    caches.grads.set(key, g);
  }
  return g;
}

/** Pluie qui tombe : gouttes à 3 profondeurs, gouttes des bords, halos des lampadaires, brume. */
export function drawRainAir(ctx: CanvasRenderingContext2D, sim: RainSim, world: RainWorld, env: RainEnv, field: LightField): void {
  const P = clamp01(env.precip);
  const daylight = clamp01(env.daylight);
  if (P <= 0 && sim.drops.length === 0 && sim.drips.length === 0) return;
  const night = 1 - daylight;
  const nb = nightStep(daylight);
  const baseStr = tone('base', nb);
  const caches = cachesOf(ctx);
  const lean = clamp01(env.wind) * gust(env.t);
  const dirx = 0.08 + lean * 0.55; // direction du trait = direction de la vitesse
  const nrm = 1 / Math.hypot(dirx, 1);
  ctx.lineCap = 'round';
  // halos de pluie autour des lampadaires (nuit) : volume éclairé, plus large et plus dense avec l'averse ; monte en fondu dès P = 0,02
  const haloIn = clamp01((P - 0.02) / 0.05);
  if (night > 0.05 && haloIn > 0 && field.lights) {
    const R = Math.round(40 + 56 * P);
    for (const l of field.lights) {
      if (l.w > 10) continue;
      let h = caches.halos.get(l);
      if (!h || h.R !== R) {
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
        g.addColorStop(0, l.color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        caches.halos.set(l, (h = { R, g }));
      }
      ctx.globalAlpha = night * (0.14 + 0.26 * P) * l.k * haloIn;
      ctx.fillStyle = h.g;
      ctx.translate(l.x, l.y - 4);
      ctx.fillRect(-R, -R, R * 2, R * 2);
      ctx.translate(-l.x, -(l.y - 4));
    }
  }
  // gouttes, par couche (loin → proche)
  const soft = sim.soft ? 0.85 : 1;
  for (let li = 0; li < 3; li++) {
    const L = LAYERS[li]!;
    for (const d of sim.drops) {
      if (d.layer !== li) continue;
      const len = d.len * (1 + lean * 0.3), dx = (dirx + d.tilt) * len * nrm, dy = len * nrm;
      const a = alphaAt(field, daylight, d.x, d.y, d.a) * soft;
      if (a < 0.015) continue;
      if (L.blur > 0) { // halo flou de la couche proche : même trait, plus large et pâle
        ctx.strokeStyle = baseStr; ctx.globalAlpha = a * 0.22; ctx.lineWidth = d.w + L.blur;
        ctx.beginPath(); ctx.moveTo(d.x - dx, d.y - dy); ctx.lineTo(d.x, d.y); ctx.stroke();
      }
      ctx.lineWidth = d.w; ctx.globalAlpha = a;
      if (li > 0) { // queue transparente → tête opaque (cassure à 70 %)
        ctx.strokeStyle = strokeGradient(ctx, caches, Math.max(1, Math.round(dy / 2)), nb);
        ctx.translate(d.x, d.y);
        ctx.beginPath(); ctx.moveTo(-dx, -dy); ctx.lineTo(0, 0); ctx.stroke();
        ctx.translate(-d.x, -d.y);
      } else {
        ctx.strokeStyle = baseStr;
        ctx.beginPath(); ctx.moveTo(d.x - dx, d.y - dy); ctx.lineTo(d.x, d.y); ctx.stroke();
      }
      if (d.big && li === 2) { ctx.fillStyle = baseStr; ctx.globalAlpha = a * 0.9; ctx.beginPath(); ctx.ellipse(d.x, d.y, d.w * 0.9, d.w * 1.4, 0, 0, TAU); ctx.fill(); }
    }
  }
  // gouttes qui tombent des bords : goutte allongée par la vitesse
  ctx.fillStyle = baseStr;
  for (const d of sim.drips) {
    ctx.globalAlpha = alphaAt(field, daylight, d.x, d.y, 0.8);
    ctx.beginPath(); ctx.ellipse(d.x, d.y, d.r * 0.8, d.r * (1 + d.vy / 250), 0, 0, TAU); ctx.fill();
  }
  // perles qui pendent aux points des bords (grossissent avec la phase) ; s'effacent avec la pluie qui cesse
  const pearl = Math.min(1, P * 8);
  if (pearl > 0) {
    for (let i = 0; i < world.drips.length; i++) {
      const pt = world.drips[i]!, tm = sim.dripTimers[i];
      if (!tm) continue;
      const r = 0.6 + tm.phase * 1.6;
      const a = alphaAt(field, daylight, pt.x, pt.y, 0.75) * pearl;
      ctx.fillStyle = baseStr; ctx.globalAlpha = a;
      ctx.beginPath(); ctx.ellipse(pt.x, pt.y + r * 0.6, r * 0.8, r, 0, 0, TAU); ctx.fill();
      // la gouttière coule en filet au-delà de P = 0,55
      if (pt.kind === 'gouttiere' && P > 0.55) {
        ctx.strokeStyle = baseStr; ctx.globalAlpha = a * 0.6 * (P - 0.55) / 0.45; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(pt.x, pt.y);
        for (let y = pt.y; y < world.groundTop; y += 6) ctx.lineTo(pt.x + Math.sin(y * 0.4 + env.t * 9) * 1.2, y + 6);
        ctx.stroke();
      }
    }
  }
  // brume de pluie : voile clair qui s'épaissit avec l'averse (jour) ; de nuit, voile bleuté léger
  if (P > 0) { ctx.fillStyle = tone('brume', nb); ctx.globalAlpha = P * (0.1 + 0.06 * night); ctx.fillRect(0, 0, world.width, world.height); }
  ctx.globalAlpha = 1;
}

// Tirage des reflets au sol, calculé une fois (4096 valeurs, puissance de 2) : plus de générateur recréé à chaque image.
const REFLECT_RNG: Float32Array = (() => { const g = mulberry32(11), a = new Float32Array(4096); for (let i = 0; i < a.length; i++) a[i] = g(); return a; })();

/** Sol mouillé : reflets des lumières, éclaboussures, anneaux dans les flaques, lame du caniveau. */
export function drawRainGround(ctx: CanvasRenderingContext2D, sim: RainSim, world: RainWorld, env: RainEnv & { wet?: number }, field: LightField): void {
  const P = clamp01(env.precip);
  const daylight = clamp01(env.daylight);
  const wet = env.wet === undefined ? Math.min(1, P * 4) : clamp01(env.wet);
  if (P <= 0 && wet <= 0 && sim.splashes.length === 0 && sim.ripples.length === 0) return;
  const night = 1 - daylight;
  const nb = nightStep(daylight);
  const baseStr = tone('base', nb);
  ctx.lineCap = 'round';
  // reflets des lumières sur le sol mouillé : traînée verticale sous chaque source, rompue par des rides (rangées inégales)
  if (wet > 0 && field.lights) {
    let ri = 0;
    const rr = (): number => REFLECT_RNG[ri++ & (REFLECT_RNG.length - 1)]!; // tirage précalculé (même suite que mulberry32(11))
    for (const L of field.lights) {
      const lamp = L.w <= 10;
      const strength = wet * L.k * (lamp ? 0.14 + 0.5 * night : 0.05 + 0.16 * night);
      if (strength < 0.02) continue;
      const y0 = Math.max(L.y + 2, world.groundTop), len = lamp ? 150 : 70;
      const ww0 = lamp ? 5 : L.w * 0.55;
      ctx.fillStyle = L.color;
      for (let y = y0; y < Math.min(world.height, y0 + len); y += 2 + rr() * 3) {
        const u = (y - y0) / len;
        if (rr() < 0.3) continue;
        const ww = ww0 * (0.55 + 0.6 * rr()) * (1 + u * 0.6);
        ctx.globalAlpha = Math.min(1, strength * (1 - u) * (1 - u) * (0.5 + rr()));
        ctx.fillRect(L.x - ww + (rr() - 0.5) * 3, y, ww * 2, 1.6);
      }
    }
  }
  // éclaboussures : couronne (anneau qui s'ouvre) + gouttelettes
  for (const s of sim.splashes) {
    const u = s.age / 0.3;
    const a = alphaAt(field, daylight, s.x, s.y, 0.7) * (1 - u);
    if (a <= 0) continue;
    ctx.strokeStyle = baseStr; ctx.globalAlpha = a * 0.8; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.ellipse(s.x, s.y, (1 + u * 7) * s.k, (0.4 + u * 2) * s.k, 0, 0, TAU); ctx.stroke();
    ctx.fillStyle = baseStr; ctx.globalAlpha = a;
    ctx.beginPath();
    for (const p of s.parts) { ctx.moveTo(p.x + 0.9 * s.k, p.y); ctx.arc(p.x, p.y, 0.9 * s.k, 0, TAU); }
    ctx.fill();
  }
  // anneaux dans les flaques
  if (sim.ripples.length) {
    ctx.strokeStyle = tone('ripple', nb); ctx.lineWidth = 0.9;
    for (const rp of sim.ripples) {
      const u = rp.age / rp.life;
      const a = alphaAt(field, daylight, rp.x, rp.y, 0.55) * (1 - u) * P;
      if (a <= 0.01) continue;
      ctx.globalAlpha = a;
      ctx.beginPath(); ctx.ellipse(rp.x, rp.y, rp.R * u + 1, (rp.R * u + 1) * 0.26, 0, 0, TAU); ctx.stroke();
    }
  }
  // ruissellement du caniveau : lame d'eau le long de la bordure, filets clairs qui courent vers la grille, bouillon à la grille
  const gutter = world.gutter;
  const gutterIn = clamp01((P - 0.08) / 0.05); // la lame monte en fondu dès P = 0,08
  if (gutter && gutterIn > 0) {
    const h = 1.5 + 6 * P;
    ctx.fillStyle = tone('water', nb); ctx.globalAlpha = (0.55 + 0.3 * P) * gutterIn; ctx.fillRect(0, gutter.y, world.width, h);
    ctx.strokeStyle = tone('filet', nb); ctx.globalAlpha = alphaAt(field, daylight, world.width / 2, gutter.y, 0.55) * gutterIn; ctx.lineWidth = 0.9;
    ctx.beginPath();
    const speed = 60 + 120 * P;
    for (let k = 0; k < 40 * P + 6; k++) {
      const x0 = ((k * 97.3 + env.t * speed * (0.8 + (k % 3) * 0.2)) % (world.width + 40)) - 20;
      const y = gutter.y + 1 + ((k * 0.61) % 1) * (h - 1);
      ctx.moveTo(x0, y); ctx.lineTo(x0 + 6 + 8 * P, y + Math.sin(k) * 0.6);
    }
    ctx.stroke();
    ctx.fillStyle = tone('bouillon', nb); ctx.globalAlpha = 0.35 * P * gutterIn;
    ctx.beginPath();
    for (let k = 0; k < 6; k++) { const ph = (env.t * 3 + k * 1.1) % 1; const x = gutter.grateX + 2 + k * 4 + Math.sin(k) * 2, y = gutter.y + 2 + ph * 3; ctx.moveTo(x + 1 + ph, y); ctx.arc(x, y, 1 + ph, 0, TAU); }
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ───────────── gouttes de vitre : sprites par (rayon au demi-pixel, teinte quantifiée, pas de nuit, échelle) ─────────────
// Le cache est borné : au-delà du plafond, les entrées les moins récemment employées partent une à une (ordre d'insertion
// de la `Map`, clé remise en fin à son premier emploi dans l'image) — jamais de vidage d'un coup, qui recréait 100 à 150
// canvas dans la même image sous une averse de nuit (teintes réfractées nombreuses).
type Sprite = { cv: HTMLCanvasElement | null; half: number; used: number };
const SPRITES = new Map<number, Sprite>();
const SPRITES_MAX = 400;
let FRAME = 0; // compteur d'images de `drawGlass`
// Teintes quantifiées (niveaux par canal) : la lumière `lit` (halo, bas lumineux, moitié du corps) à 4 niveaux (64 teintes) ;
// la couleur derrière `here` à 2 niveaux (8 teintes) — elle ne pèse que 0,5 × 0,7 × 0,6 ≈ 20 % du pixel final, l'écart entre
// deux niveaux y est invisible sur des gouttes de 1 à 5 px. Ainsi le nombre de sprites réellement employés reste petit.
type Quant = { count: number; pack(c: number[]): number; unpack(qv: number, out: number[]): void };
function quant(levels: number): Quant {
  const step = 256 / levels;
  const q = (v: number): number => Math.min(levels - 1, Math.max(0, Math.floor(v / step)));
  return {
    count: levels ** 3,
    pack: (c) => (q(c[0]!) * levels + q(c[1]!)) * levels + q(c[2]!),
    unpack: (qv, out) => {
      out[0] = (Math.floor(qv / (levels * levels)) + 0.5) * step;
      out[1] = (Math.floor(qv / levels) % levels + 0.5) * step;
      out[2] = (qv % levels + 0.5) * step;
    },
  };
}
const Q_LIT = quant(4), Q_HERE = quant(2);
const S_BELOW = [0, 0, 0], S_ABOVE = [0, 0, 0], S_HERE = [0, 0, 0], S_LIT = [0, 0, 0], S_BODY = [0, 0, 0], S_TMP = [0, 0, 0];
const rgbStr = (c: ArrayLike<number>, a: number): string => `rgba(${Math.round(c[0]!)},${Math.round(c[1]!)},${Math.round(c[2]!)},${Number(a.toFixed(3))})`;
// Chaîne opaque d'une teinte quantifiée (queue des coulures, 4 niveaux) : calculée une fois par teinte.
const TINTS: (string | undefined)[] = new Array<string | undefined>(Q_LIT.count);
function tintStr(qv: number): string {
  let s = TINTS[qv];
  if (!s) { Q_LIT.unpack(qv, S_TMP); TINTS[qv] = s = rgbStr(S_TMP, 1); }
  return s;
}

// Nuit des gouttes de vitre : paramètre continu (0 = jour plein à daylight ≥ 0,75, 1 = nuit pleine à daylight ≤ 0,25 ; centré
// sur l'ancienne bascule à 0,5), quantifié en NIGHT_STEPS pas pour les sprites et les chaînes — la bascule se fait en fondu.
const NIGHT_STEPS = 8;
const nightOf = (daylight: number): number => clamp01((0.75 - clamp01(daylight)) / 0.5);
const nightStepOf = (daylight: number): number => Math.round(nightOf(daylight) * NIGHT_STEPS);
const TRAILS: (string | undefined)[] = new Array<string | undefined>(NIGHT_STEPS + 1);
function trailStr(ns: number): string {
  let s = TRAILS[ns];
  if (!s) TRAILS[ns] = s = rgba(mixRgb(WHITE, TRAIL_NIGHT_RGB, ns / NIGHT_STEPS), 1);
  return s;
}

// Goutte cellulo (maquette `drawDrop`) : corps clair teinté par ce qu'il y a derrière (image inversée : la lumière du bas paraît en
// bas), haut assombri (jour), bas lumineux, bord encré bas-droit, reflet blanc en haut-gauche ; la nuit, devant une lumière, un halo.
// `n` = nuit continue (0 jour, 1 nuit) : chaque réglage est interpolé, rien ne bascule d'un coup.
function paintDrop(c: CanvasRenderingContext2D, x: number, y: number, r: number, n: number, here: number[], lit: number[], stretch = 1): void {
  const L = lum(lit);
  mixInto(S_TMP, here, lit, 0.5);
  mixInto(S_BODY, S_TMP, WHITE, lerp(0.3, 0.18, n));
  if (n > 0 && L > 0.4 && r > 0.9) {
    const g = c.createRadialGradient(x, y, 0, x, y, r * 3.2);
    g.addColorStop(0, rgbStr(lit, 0.7 * (L - 0.25) * n));
    g.addColorStop(1, rgbStr(lit, 0));
    c.fillStyle = g; c.fillRect(x - r * 3.2, y - r * 3.2, r * 6.4, r * 6.4);
  }
  c.fillStyle = rgbStr(S_BODY, lerp(0.6, 0.68, n));
  c.beginPath(); c.ellipse(x, y, r, r * 1.15 * stretch, 0, 0, TAU); c.fill();
  if (n < 1) { c.fillStyle = rgbStr(INK, 0.14 * (1 - n)); c.beginPath(); c.ellipse(x, y - r * 0.35 * stretch, r * 0.7, r * 0.45 * stretch, 0, 0, TAU); c.fill(); }
  mixInto(S_TMP, lit, WHITE, 0.4);
  c.fillStyle = rgbStr(S_TMP, lerp(0.4, 0.35 + 0.5 * L, n));
  c.beginPath(); c.ellipse(x, y + r * 0.38 * stretch, r * 0.62, r * 0.5 * stretch, 0, 0, TAU); c.fill();
  if (r > 0.8) { c.strokeStyle = 'rgba(42,26,24,0.5)'; c.lineWidth = Math.min(1, r * 0.3); c.beginPath(); c.ellipse(x, y, r * 0.9, r * 1.05 * stretch, 0, -0.3, 1.9); c.stroke(); }
  c.fillStyle = 'rgba(255,255,255,0.85)';
  c.beginPath(); c.ellipse(x - r * 0.38, y - r * 0.45 * stretch, r * 0.26, r * 0.18, -0.6, 0, TAU); c.fill();
}

function makeCanvas(w: number, h: number): { cv: HTMLCanvasElement; c: CanvasRenderingContext2D } | null {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, w); cv.height = Math.max(1, h);
  const c = cv.getContext('2d');
  return c ? { cv, c } : null;
}

function spriteFor(r2: number, ns: number, hq: number, lq: number, k2: number): Sprite {
  const key = (((r2 * (NIGHT_STEPS + 1) + ns) * Q_HERE.count + hq) * Q_LIT.count + lq) * 8 + k2;
  let s = SPRITES.get(key);
  if (s !== undefined) {
    if (s.used !== FRAME) { s.used = FRAME; SPRITES.delete(key); SPRITES.set(key, s); } // le plus récent en fin (une fois par image)
    return s;
  }
  while (SPRITES.size >= SPRITES_MAX) SPRITES.delete(SPRITES.keys().next().value!); // éviction du moins récent
  const r = r2 / 2, k = k2 / 2, n = ns / NIGHT_STEPS;
  Q_HERE.unpack(hq, S_HERE); Q_LIT.unpack(lq, S_LIT);
  const halo = n > 0 && lum(S_LIT) > 0.4 && r > 0.9;
  const half = (halo ? 3.2 * r : 1.3 * r) + 1.5;
  const made = makeCanvas(Math.ceil(half * 2 * k), Math.ceil(half * 2 * k));
  if (made) { made.c.scale(k, k); paintDrop(made.c, half, half, r, n, S_HERE, S_LIT); s = { cv: made.cv, half, used: FRAME }; }
  else s = { cv: null, half, used: FRAME };
  SPRITES.set(key, s);
  return s;
}

// Échelle du contexte (dpr) : les sprites sont dessinés à cette finesse (au demi, entre 1 et 3).
function scaleOf(ctx: CanvasRenderingContext2D): number {
  const t = typeof ctx.getTransform === 'function' ? ctx.getTransform() : null;
  return t ? clamp(Math.round(t.a * 2) / 2, 1, 3) : 1;
}

// Rayons des sprites (en demi-pixels) : 5 gabarits, le sprite est étiré au rayon réel par `drawImage` (l'écart est ≤ 25 %,
// invisible sur des gouttes de 1 à 5 px) — avec 11 rayons au demi-pixel, le cache ne se remplissait jamais.
const spriteR2 = (r: number): number => (r < 1.25 ? 2 : r < 2.5 ? 4 : r < 3.5 ? 6 : r < 5 ? 8 : 12);

function drawDropSprite(ctx: CanvasRenderingContext2D, field: LightField, x: number, y: number, r: number, ns: number, k: number, stretch: number): void {
  sample(field, x, y + r * 6, S_BELOW); sample(field, x, y - r * 6, S_ABOVE); sample(field, x, y, S_HERE);
  const lit = lum(S_BELOW) > lum(S_ABOVE) ? S_BELOW : S_ABOVE;
  const r2 = spriteR2(r);
  const s = spriteFor(r2, ns, Q_HERE.pack(S_HERE), Q_LIT.pack(lit), Math.round(k * 2));
  if (s.cv) {
    const half = s.half * (r / (r2 / 2));
    ctx.drawImage(s.cv, x - half, y - half * stretch, half * 2, half * 2 * stretch);
  } else paintDrop(ctx, x, y, r, ns / NIGHT_STEPS, S_HERE, lit, stretch); // sans canvas hors écran (cas de repli) : tracé direct
}

// Trace d'une coulure : filet clair (eau) + bord encré léger, s'estompent en 8 s ; segments groupés par 6 (un style par groupe).
const TRAIL_CHUNK = 6;
function drawTrail(ctx: CanvasRenderingContext2D, tr: readonly GlassTrailPoint[], ns: number): void {
  if (tr.length < 2) return;
  const water = trailStr(ns), waterA = lerp(0.3, 0.26, ns / NIGHT_STEPS);
  for (let i = 1; i < tr.length; i += TRAIL_CHUNK) {
    const q = tr[i]!, end = Math.min(tr.length, i + TRAIL_CHUNK);
    const a = Math.max(0, 1 - q.age / 8);
    if (a <= 0) continue;
    ctx.strokeStyle = water; ctx.globalAlpha = waterA * a; ctx.lineWidth = Math.max(0.6, q.r * 0.7 * (0.4 + 0.6 * a));
    ctx.beginPath(); ctx.moveTo(tr[i - 1]!.x, tr[i - 1]!.y);
    for (let j = i; j < end; j++) ctx.lineTo(tr[j]!.x, tr[j]!.y);
    ctx.stroke();
    ctx.strokeStyle = INK_STR; ctx.globalAlpha = 0.14 * a; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(tr[i - 1]!.x + q.r * 0.5, tr[i - 1]!.y);
    for (let j = i; j < end; j++) ctx.lineTo(tr[j]!.x + tr[j]!.r * 0.5, tr[j]!.y);
    ctx.stroke();
  }
}

const inPane = (p: Pane, x: number, y: number): boolean => x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h;

/** Gouttes sur la vitre : buée, traces, gouttes posées, coulures — découpées à chaque vitre. */
export function drawGlass(ctx: CanvasRenderingContext2D, sim: GlassSim, env: { precip: number; daylight: number }, field: LightField, fog: FogMask): void {
  if (sim.panes.length === 0) return;
  FRAME++;
  const ns = nightStepOf(env.daylight);
  const k = scaleOf(ctx);
  ctx.lineCap = 'round';
  for (let i = 0; i < sim.panes.length; i++) {
    const p = sim.panes[i]!;
    if (!(p.w > 0 && p.h > 0)) continue;
    ctx.save();
    ctx.beginPath(); ctx.rect(p.x, p.y, p.w, p.h); ctx.clip();
    ctx.globalAlpha = 1;
    fog.draw(ctx, p, env);
    for (const tr of sim.trails) if (tr.length > 1 && inPane(p, tr[tr.length - 1]!.x, tr[tr.length - 1]!.y)) drawTrail(ctx, tr, ns);
    for (const R of sim.runners) if (R.pane === i) drawTrail(ctx, R.trail, ns);
    ctx.globalAlpha = 1;
    for (const s of sim.statics) if (s.pane === i) drawDropSprite(ctx, field, s.x, s.y, s.r, ns, k, 1);
    // coulures : goutte étirée vers le haut quand elle court (queue), ronde quand elle attend
    for (const R of sim.runners) {
      if (R.pane !== i) continue;
      const run = Math.min(1, R.vy / 40);
      if (run > 0.1) {
        const tail = R.r * (1.5 + 2.5 * run);
        sample(field, R.x, R.y, S_HERE); mixInto(S_TMP, S_HERE, WHITE, 0.3);
        ctx.fillStyle = tintStr(Q_LIT.pack(S_TMP)); ctx.globalAlpha = 0.45;
        ctx.beginPath(); ctx.moveTo(R.x - R.r * 0.6, R.y); ctx.lineTo(R.x, R.y - tail); ctx.lineTo(R.x + R.r * 0.6, R.y); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 1;
      }
      drawDropSprite(ctx, field, R.x, R.y, R.r, ns, k, 1 + 0.25 * run);
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

// ───────────── buée : masque à demi-résolution (1 = buée), effacé par les coulures, repousse à 3 %/s ─────────────
type FogCell = {
  pane: Pane;
  mask: { cv: HTMLCanvasElement; c: CanvasRenderingContext2D } | null;
  fog: { cv: HTMLCanvasElement; c: CanvasRenderingContext2D } | null;
  /** 26 vieilles marques fixes en bas (traces séchées) : [x, y0, y1]. */
  marks: [number, number, number][];
  gradKey: number;
  grad: CanvasGradient | null;
};

const FOG_REGROW = 0.03; // repousse de la buée : 3 %/s
const REGROW_EVERY = 0.5; // s entre deux repeints du masque (pas assez fin sur 8 bits à chaque image)

export function createFogMask(panes: readonly Pane[]): FogMask {
  const cells: FogCell[] = panes.map((p, i) => {
    const ok = p.w > 0 && p.h > 0;
    const mask = ok ? makeCanvas(Math.ceil(p.w / 2), Math.ceil(p.h / 2)) : null;
    if (mask) { mask.c.fillStyle = '#fff'; mask.c.fillRect(0, 0, mask.cv.width, mask.cv.height); }
    const rng = mulberry32(31 + i);
    const marks: [number, number, number][] = [];
    for (let m = 0; m < 26; m++) marks.push([rng() * p.w, p.h * (0.45 + rng() * 0.4), p.h]);
    return { pane: { ...p }, mask, fog: ok ? makeCanvas(Math.ceil(p.w), Math.ceil(p.h)) : null, marks, gradKey: -1, grad: null };
  });
  const find = (x: number, y: number): FogCell | undefined => {
    for (let i = 0; i < cells.length; i++) if (inPane(cells[i]!.pane, x, y)) return cells[i];
    return undefined;
  };
  const same = (a: Pane, b: Pane): boolean => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
  // vitre (objet du moteur) → cellule : cherchée une fois par géométrie, puis retenue
  const byPane = new WeakMap<Pane, FogCell>();
  const cellOf = (pane: Pane): FogCell | undefined => {
    let cell = byPane.get(pane);
    if (cell) return cell;
    for (let i = 0; i < cells.length && !cell; i++) if (same(cells[i]!.pane, pane)) cell = cells[i];
    if (cell) byPane.set(pane, cell);
    return cell;
  };
  let regrowKey = -1, regrowStr = '', regrowAcc = 0;
  return {
    erase(trail) {
      if (trail.length < 2) return;
      const last = trail[trail.length - 1]!;
      const cell = find(last.x, last.y);
      if (!cell?.mask) return;
      const m = cell.mask.c, p = cell.pane;
      m.globalCompositeOperation = 'destination-out';
      m.lineCap = 'round'; m.strokeStyle = '#000'; m.lineWidth = Math.max(0.5, last.r * 0.5);
      const from = Math.max(0, trail.length - 3);
      m.beginPath(); m.moveTo((trail[from]!.x - p.x) / 2, (trail[from]!.y - p.y) / 2);
      for (let i = from + 1; i < trail.length; i++) m.lineTo((trail[i]!.x - p.x) / 2, (trail[i]!.y - p.y) / 2);
      m.stroke();
      m.globalCompositeOperation = 'source-over';
    },
    regrow(dt) {
      // Le masque est sur 8 bits : 0,03 × dt à 30 Hz (0,001 par image) s'arrondissait à 0 et la buée ne repoussait jamais.
      // Le temps est donc cumulé et la buée repeinte toutes les ~0,5 s d'un coup plus fort (≈ 0,015, soit 4 niveaux sur
      // 255), en addition (`lighter`) : la repousse est linéaire (3 %/s) et remonte jusqu'à la buée pleine.
      regrowAcc += Number.isFinite(dt) ? Math.max(0, dt) : 0;
      if (regrowAcc < REGROW_EVERY) return;
      const a = Math.min(1, regrowAcc * FOG_REGROW);
      regrowAcc = 0;
      const key = Math.round(a * 1000); // même chaîne tant que le pas ne change pas (pas d'allocation)
      if (key !== regrowKey) { regrowKey = key; regrowStr = `rgba(255,255,255,${key / 1000})`; }
      for (const cell of cells) {
        if (!cell.mask) continue;
        cell.mask.c.globalCompositeOperation = 'lighter';
        cell.mask.c.fillStyle = regrowStr;
        cell.mask.c.fillRect(0, 0, cell.mask.cv.width, cell.mask.cv.height);
        cell.mask.c.globalCompositeOperation = 'source-over';
      }
    },
    draw(ctx, pane, env) {
      const cell = cellOf(pane);
      if (!cell?.fog || !cell.mask) return;
      const p = cell.pane, f = cell.fog.c;
      const ns = nightStepOf(env.daylight), n = ns / NIGHT_STEPS;
      const P = Math.round(clamp01(env.precip) * 20);
      const key = P * (NIGHT_STEPS + 1) + ns;
      if (key !== cell.gradKey || !cell.grad) { // voile plus dense en bas (0 à 45 % de la hauteur → max en bas) ; teinte et densité en fondu jour → nuit
        const fogC = mixRgb(FOG_DAY, FOG_NIGHT, n), fogA = (0.1 + 0.14 * (P / 20)) * lerp(1, 0.7, n);
        const g = f.createLinearGradient(0, p.h * 0.45, 0, p.h);
        g.addColorStop(0, rgba(fogC, 0)); g.addColorStop(0.7, rgba(fogC, fogA * 0.6)); g.addColorStop(1, rgba(fogC, fogA));
        cell.grad = g; cell.gradKey = key;
      }
      f.globalCompositeOperation = 'source-over';
      f.clearRect(0, 0, cell.fog.cv.width, cell.fog.cv.height);
      f.fillStyle = cell.grad; f.fillRect(0, 0, p.w, p.h);
      // vieilles marques (traces séchées) : fines rayures dans la buée
      f.strokeStyle = 'rgba(255,255,255,0.08)'; f.lineWidth = 1.2; f.beginPath();
      for (const [x, y0, y1] of cell.marks) { f.moveTo(x, y0); f.lineTo(x + 2, y1); }
      f.stroke();
      f.globalCompositeOperation = 'destination-in';
      f.drawImage(cell.mask.cv, 0, 0, p.w, p.h);
      f.globalCompositeOperation = 'source-over';
      ctx.drawImage(cell.fog.cv, p.x, p.y);
    },
  };
}
