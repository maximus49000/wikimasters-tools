import { useCallback, useEffect, useMemo, useReducer, useRef, useSyncExternalStore } from 'react';
import type { CityPaintPlan } from '../core/library/paint/city-plan';
import { DEFAULT_MOMENT, type FondMoment } from '../core/library/paint/fond-time';
import { hillCanopyBox, paintCityTile, TILE, tileCount, tileKey } from '../core/library/paint/city-painter';
import type { PaintCtx } from '../core/library/paint/paint-ctx';
import { FALL, type LightBlob, type WetStroke } from '../core/library/city/night-light';
import { alphaTopProfile } from '../core/library/paint/sky-clip';
import { idle } from './paint-queue';

// Peinture des tranches de la ville (vague Ghibli) : canvas hors écran pendant les temps morts, une tranche par créneau,
// image PNG en data URL, cache mémoire (20 tranches au plus, les plus anciennes libérées).
// Colline au vent (PR 3b) : quand le vent anime la colline (`hillWindEnabled`), la tranche est peinte SANS les houppiers des
// arbres de la colline ('base') et rend à côté, par groupe d'arbres qui a quelque chose à peindre (crête, rang 0, rang 1 +
// échappées), deux images rognées à la boîte des houppiers (`hillCanopyBox`), à la résolution de la tranche : le feuillage
// (`canopy`) et l'écran (`screen` : ce que la tranche peint APRÈS ce groupe, dont seul l'alpha sert). Le calque `colline-vent`
// (hill-wind-layer.tsx) les redessine au vent. Sans vent (mouvement réduit, sans canvas) : tranche complète ('all'), `hill` vide.
// `box` : rectangle du monde des deux images, calé sur la grille de pixels de la tranche (les pixels se superposent exactement).
export type HillLayer = { group: 0 | 1 | 2; box: { x: number; y: number; w: number; h: number }; canopy: string; screen: string };
export type PaintedTile = { x: number; w: number; url: string; hill: HillLayer[] };
// `moment` : instant du fond vivant (date, météo, tranche de 10 min) ; absent = instant par défaut.
// Le peintre rend l'URL de l'image, ou l'URL et le profil alpha du haut de la tranche (haut opaque de chaque px CSS, pour
// découper les nuages au pixel, sky-clip.ts) ; une URL seule (peintre de test) : pas de profil, découpe de repli. `hill` :
// couches de la colline au vent (absent : aucune).
export type PaintedImage = { url: string; profile: Float32Array | null; hill?: HillLayer[] };
export type TilePainter = (plan: CityPaintPlan, tile: number, moment?: FondMoment) => Promise<string | PaintedImage | null>;

const CACHE_MAX = 20;
const cache = new Map<string, string>();
// Profils et couches de la colline des tranches du cache (même clé, même éviction).
const profiles = new Map<string, Float32Array>();
const hills = new Map<string, HillLayer[]>();
const NO_HILL: HillLayer[] = [];
const failed = new Set<string>();
let override: TilePainter | null = null;

function remember(key: string, url: string, profile: Float32Array | null, hill: HillLayer[]): void {
  cache.delete(key);
  cache.set(key, url);
  if (profile) profiles.set(key, profile);
  else profiles.delete(key);
  if (hill.length) hills.set(key, hill);
  else hills.delete(key);
  while (cache.size > CACHE_MAX) {
    const oldKey = cache.keys().next().value as string;
    cache.delete(oldKey);
    profiles.delete(oldKey);
    hills.delete(oldKey);
  }
}

// Colline au vent active : canvas disponible et mouvement non réduit (`prefers-reduced-motion`, l'équivalent du `still` des
// arbres de la rue) ; forcée par les tests (`setHillWindForTests`).
const reducedMotion = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let hillWindOverride: boolean | null = null;
export function setHillWindForTests(on: boolean | null): void {
  hillWindOverride = on;
}
export function hillWindEnabled(): boolean {
  if (hillWindOverride !== null) return hillWindOverride;
  return !noCanvas() && !reducedMotion();
}
// Clé de cache d'une tranche : `tileKey`, plus `|v` quand la colline est au vent (tranche sans houppiers, avec ses couches).
export function paintedTileKey(plan: CityPaintPlan, tile: number, moment: FondMoment | undefined, wind = hillWindEnabled()): string {
  return tileKey(plan, tile, moment) + (wind ? '|v' : '');
}

// Profils des tranches AFFICHÉES, par ville (graine, largeur, hauteur : le plan en découle), et instant du fond vivant
// qu'elles montrent : publiés par usePaintedCity après chaque rendu, lus par usePaintedSkyline et usePaintedMoment (découpe
// des nuages, scene-weather.tsx) via un petit magasin de module (useSyncExternalStore : un abonné monté après la
// publication relit l'état courant, rien n'est manqué).
const shown = new Map<string, readonly (Float32Array | null)[]>();
const shownMoment = new Map<string, FondMoment>();
const assembled = new Map<string, Float32Array | null>();
const listeners = new Set<() => void>();
const citySig = (plan: CityPaintPlan): string => `${plan.seed}|${plan.width}|${plan.height}`;
const subscribe = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

function publishShown(sig: string, list: readonly (Float32Array | null)[], moment: FondMoment): void {
  const prev = shown.get(sig);
  const sameList = !!prev && prev.length === list.length && prev.every((p, i) => p === list[i]);
  const sameMoment = shownMoment.get(sig) === moment;
  if (sameList && sameMoment) return;
  if (!sameList) {
    shown.set(sig, list);
    assembled.delete(sig);
  }
  shownMoment.set(sig, moment);
  for (const l of [...listeners]) l();
}

function assemble(plan: CityPaintPlan): Float32Array | null {
  const sig = citySig(plan);
  const hit = assembled.get(sig);
  if (hit !== undefined) return hit;
  const list = shown.get(sig);
  const n = tileCount(plan.width);
  let out: Float32Array | null = null;
  if (list && list.length === n && list.every((p) => p !== null)) {
    out = new Float32Array(Math.ceil(plan.width)).fill(plan.height);
    list.forEach((p, t) => {
      const x0 = t * TILE;
      out!.set(p!.subarray(0, Math.max(0, Math.min(p!.length, Math.min(TILE, plan.width - x0), out!.length - x0))), x0);
    });
  }
  assembled.set(sig, out);
  return out;
}

// Remonte les tranches affichées en tête du cache (elles ne sont jamais libérées pendant qu'on les montre).
function touch(key: string): string {
  const url = cache.get(key);
  if (url === undefined) return '';
  cache.delete(key);
  cache.set(key, url);
  return url;
}

export function setTilePainterForTests(painter: TilePainter | null): void {
  override = painter;
}

export function resetPaintedCacheForTests(): void {
  cache.clear();
  profiles.clear();
  hills.clear();
  failed.clear();
  forgetShownForTests();
}

// Oublie les tranches publiées comme affichées (les images et les profils restent en cache) : cache chaud, rien de publié.
export function forgetShownForTests(): void {
  shown.clear();
  shownMoment.clear();
  assembled.clear();
}

// Profil alpha d'un canvas de tranche ; null si la lecture des pixels échoue (mémoire, canvas protégé) : la tranche reste
// affichée, la découpe des nuages retombe sur les boîtes.
export function safeAlphaProfile(ctx: Pick<CanvasRenderingContext2D, 'getImageData'>, w: number, h: number, dpr: number): Float32Array | null {
  try {
    return alphaTopProfile(ctx.getImageData(0, 0, w, h).data, w, h, dpr);
  } catch {
    return null;
  }
}

// Contexte qui ne dessine rien et compte les appels de méthode (propriétés acceptées) : dit si un flux de la colline
// (`{ canopy: g }`) peint quelque chose. Le flux d'un groupe nu (hiver) est vide alors que sa boîte existe (`hillCanopyBox` ne
// dépend pas du jour) : sans ce test, deux images vides et des dessins inutiles à chaque image de la boucle, par groupe.
function countingCtx(): { ctx: PaintCtx; calls: () => number } {
  let n = 0;
  const props = new Map<PropertyKey, unknown>();
  const gradient = { addColorStop: () => undefined };
  const ctx = new Proxy({} as PaintCtx, {
    get: (_t, k) => {
      if (props.has(k)) return props.get(k);
      if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => gradient;
      if (k === 'measureText') return () => ({ width: 0 });
      if (typeof k === 'symbol' || k === 'then') return undefined;
      return () => void n++;
    },
    set: (_t, k, v) => {
      props.set(k, v);
      return true;
    },
  });
  return { ctx, calls: () => n };
}

// Groupes de la colline qui ont un feuillage à peindre dans la tranche (boîte non nulle ET flux `{ canopy: g }` non vide), avec
// leur boîte : ceux-là, et eux seuls, reçoivent des couches.
export type HillGroup = { group: 0 | 1 | 2; box: { x: number; y: number; w: number; h: number } };
export function hillGroups(plan: CityPaintPlan, tile: number, moment?: FondMoment): HillGroup[] {
  const out: HillGroup[] = [];
  for (const group of [0, 1, 2] as const) {
    const box = hillCanopyBox(plan, tile, group);
    if (!box) continue;
    const c = countingCtx();
    paintCityTile(c.ctx, plan, tile, moment, { canopy: group });
    if (c.calls() > 0) out.push({ group, box });
  }
  return out;
}

const idleSlot = (): Promise<void> => new Promise((resolve) => void idle(resolve));

export const canvasTilePainter: TilePainter = async (plan, tile, moment) => {
  if (typeof document === 'undefined' || (typeof navigator !== 'undefined' && navigator.userAgent.includes('jsdom'))) return null;
  const x0 = tile * TILE;
  const w = Math.min(TILE, plan.width - x0);
  if (w <= 0) return null;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(w * dpr);
  canvas.height = Math.ceil(plan.height * dpr);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const wind = hillWindEnabled();
  ctx.setTransform(dpr, 0, 0, dpr, -x0 * dpr, 0);
  // Cellulo : aplats francs, pas de grain de papier. Au vent : la tranche sans les houppiers de la colline.
  paintCityTile(ctx, plan, tile, moment, wind ? 'base' : 'all');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (!wind) {
    // Haut opaque de chaque px CSS (le contexte est en lecture fréquente) : découpe des nuages au pixel.
    const profile = safeAlphaProfile(ctx, canvas.width, canvas.height, dpr);
    return { url: canvas.toDataURL('image/png'), profile };
  }
  // Image de la tranche prise AVANT d'y poser les feuillages (posés ensuite pour le seul profil des nuages).
  const url = canvas.toDataURL('image/png');
  const hill: HillLayer[] = [];
  const crop = document.createElement('canvas');
  const cc = crop.getContext('2d');
  for (const { group, box } of cc ? hillGroups(plan, tile, moment) : []) {
    // Un groupe par créneau de temps mort (son écran repeint presque toute la tranche) : jamais une image bloquée.
    await idleSlot();
    // Boîte calée sur la grille de pixels de la tranche : mêmes pixels que la tranche, sans rééchantillonnage.
    const px0 = Math.max(0, Math.floor((box.x - x0) * dpr));
    const py0 = Math.max(0, Math.floor(box.y * dpr));
    const px1 = Math.min(canvas.width, Math.ceil((box.x + box.w - x0) * dpr));
    const py1 = Math.min(canvas.height, Math.ceil((box.y + box.h) * dpr));
    if (px1 <= px0 || py1 <= py0) continue;
    crop.width = px1 - px0;
    crop.height = py1 - py0;
    const paint = (part: { canopy: 0 | 1 | 2 } | { after: 0 | 1 | 2 }): string => {
      cc!.setTransform(1, 0, 0, 1, 0, 0);
      cc!.clearRect(0, 0, crop.width, crop.height);
      cc!.setTransform(dpr, 0, 0, dpr, -x0 * dpr - px0, -py0);
      paintCityTile(cc!, plan, tile, moment, part);
      cc!.setTransform(1, 0, 0, 1, 0, 0);
      return crop.toDataURL('image/png');
    };
    const canopy = paint({ canopy: group });
    // Feuillage posé sur la tranche : la crête compte dans le profil des nuages (sinon ils passeraient devant les houppiers).
    ctx.drawImage(crop, px0, py0);
    const screen = paint({ after: group });
    hill.push({ group, box: { x: x0 + px0 / dpr, y: py0 / dpr, w: crop.width / dpr, h: crop.height / dpr }, canopy, screen });
  }
  // Tampon de rognage rendu tout de suite (WebView : la mémoire des toiles n'est rendue qu'au ramasse-miettes).
  crop.width = 0;
  crop.height = 0;
  const profile = safeAlphaProfile(ctx, canvas.width, canvas.height, dpr);
  return { url, profile, hill };
};

// Tranches de la ville peinte pour ce plan. `ready` : toutes peintes. Sans plan : rien. `moment` (fond vivant) : la clé d'une
// tranche ne change que si ses poses lentes changent (date, neige, volets, linge, parasols, étals) ; une tranche à repeindre
// garde son image précédente jusqu'à la nouvelle (une par créneau de repos, jamais un retour au décor classique).
// Colline au vent : la clé porte `|v` (tranche peinte sans houppiers, avec ses couches) ; `hill` de chaque tranche = couches de
// l'image AFFICHÉE (celles de l'ancienne tant que la nouvelle n'est pas peinte : tranche et feuillage changent ensemble).
export function usePaintedCity(plan: CityPaintPlan | null, moment?: FondMoment): { ready: boolean; tiles: PaintedTile[] } {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const momentSig = moment ? JSON.stringify(moment) : '';
  const wind = hillWindEnabled();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const keys = useMemo(() => (plan ? Array.from({ length: tileCount(plan.width) }, (_, t) => paintedTileKey(plan, t, moment, wind)) : []), [plan, momentSig, wind]);
  const keysSig = keys.join('\n');
  const last = useRef<{ plan: CityPaintPlan | null; urls: string[]; profiles: (Float32Array | null)[]; hills: HillLayer[][] }>({ plan: null, urls: [], profiles: [], hills: [] });
  useEffect(() => {
    if (!plan) return;
    const painter = override ?? canvasTilePainter;
    let cancelled = false;
    let cancelIdle: (() => void) | null = null;
    const next = (): void => {
      if (cancelled) return;
      const t = keys.findIndex((k) => !cache.has(k) && !failed.has(k));
      if (t < 0) return;
      cancelIdle = idle(() => {
        void painter(plan, t, moment).catch(() => null).then((got) => {
          const url = typeof got === 'string' ? got : got?.url;
          if (url) remember(keys[t]!, url, typeof got === 'string' ? null : (got?.profile ?? null), typeof got === 'string' ? NO_HILL : (got?.hill ?? NO_HILL));
          else failed.add(keys[t]!);
          if (!cancelled) {
            bump();
            next();
          }
        });
      });
    };
    next();
    return () => {
      cancelled = true;
      cancelIdle?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, keysSig]);
  // Profils des tranches affichées (celui de l'image précédente tant qu'une tranche à repeindre la garde), publiés après le rendu.
  const shownProfiles = useRef<(Float32Array | null)[]>([]);
  useEffect(() => {
    if (plan) publishShown(citySig(plan), shownProfiles.current, moment ?? DEFAULT_MOMENT);
  });
  if (!plan) return { ready: false, tiles: [] };
  if (last.current.plan !== plan) last.current = { plan, urls: [], profiles: [], hills: [] };
  const tiles = keys.map((k, t) => {
    const fresh = touch(k);
    const url = fresh || last.current.urls[t] || '';
    if (fresh) {
      last.current.profiles[t] = profiles.get(k) ?? null;
      last.current.hills[t] = hills.get(k) ?? NO_HILL;
    }
    last.current.urls[t] = url;
    return { x: t * TILE, w: Math.min(TILE, plan.width - t * TILE), url, hill: (url && last.current.hills[t]) || NO_HILL };
  });
  const list = keys.map((_, t) => (tiles[t]!.url ? (last.current.profiles[t] ?? null) : null));
  // Même liste (mêmes profils) : la référence ne change pas, rien n'est republié.
  const prev = shownProfiles.current;
  if (prev.length !== list.length || prev.some((p, i) => p !== list[i])) shownProfiles.current = list;
  return { ready: tiles.every((t) => t.url !== ''), tiles };
}

// Profil alpha du haut de la ville peinte (haut opaque de chaque px CSS, toute la largeur), assemblé à partir des tranches
// affichées par usePaintedCity pour la même ville ; null tant qu'une tranche manque ou n'a pas de profil (peintre de test).
export function usePaintedSkyline(plan: CityPaintPlan | null): Float32Array | null {
  const read = useCallback(() => (plan ? assemble(plan) : null), [plan]);
  return useSyncExternalStore(subscribe, read, read);
}

// Instant du fond vivant des tranches affichées pour cette ville (grue montée ou non, découpe des nuages) ; null avant la
// première publication.
export function usePaintedMoment(plan: CityPaintPlan | null): FondMoment | null {
  const read = useCallback(() => (plan ? (shownMoment.get(citySig(plan)) ?? null) : null), [plan]);
  return useSyncExternalStore(subscribe, read, read);
}

// ───────────── Lumière de nuit « deux peintures » (G5, notes §5) ─────────────
// Découpe éclairée : la partie `box` (repère du monde) des tranches de JOUR, repeinte à la même échelle que les tranches
// (px du monde × dpr), teintée (`multiply` puis `screen` léger) puis masquée (`destination-in`) par les taches de lumière en
// dégradé FALL. Posée en <image> hors filtre d'étalonnage, par-dessus la tranche de nuit : près de la lampe, enduits, volets et
// pavés retrouvent leurs couleurs, réchauffées ; loin, le bleu nuit reste. Aucun blanc ajouté.
// `tint` : teinte de la version éclairée ; par défaut l'ambre des lampadaires (réutilisable pour une lumière colorée).
export type LitTint = { multiply: string; screen?: string; screenAlpha?: number };
export const LAMP_TINT: LitTint = { multiply: '#FFD4A0', screen: 'rgb(255,196,112)', screenAlpha: 0.2 };
// `moment` : instant du fond vivant des tranches de jour repeintes (mêmes volets et linge que les tranches affichées).
export type LitPatchPainter = (plan: CityPaintPlan, box: { x: number; y: number; w: number; h: number }, blobs: readonly LightBlob[], tint?: LitTint, moment?: FondMoment) => string;

let litOverride: LitPatchPainter | null = null;
export function setLitPatchPainterForTests(painter: LitPatchPainter | null): void {
  litOverride = painter;
}
// Peintre en vigueur (double de test, sinon le canvas).
export const litPatchPainter = (): LitPatchPainter => litOverride ?? paintLitPatch;

export const noCanvas = (): boolean => typeof document === 'undefined' || (typeof navigator !== 'undefined' && navigator.userAgent.includes('jsdom'));

// Canvas hors écran réutilisés (peinture synchrone : une image à la fois), remis à w × h px, repère identité, sans fusion.
// Partagés avec la lueur des devantures (shop/shop-host.tsx, paintShopGlow).
let bufs: CanvasRenderingContext2D[] | null = null;
export function buffers(w: number, h: number): CanvasRenderingContext2D[] | null {
  if (!bufs) {
    const made: CanvasRenderingContext2D[] = [];
    for (let i = 0; i < 3; i++) {
      const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: false });
      if (!ctx) return null;
      made.push(ctx);
    }
    bufs = made;
  }
  for (const c of bufs) {
    c.canvas.width = w;
    c.canvas.height = h;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
  }
  return bufs;
}

// Une tache dans le masque d'intensité (alpha = intensité), repère du monde.
function maskBlob(m: CanvasRenderingContext2D, b: LightBlob): void {
  m.save();
  if (b.flare !== undefined) {
    const g = m.createLinearGradient(0, b.cy, 0, b.cy + b.ry);
    g.addColorStop(0, `rgba(255,255,255,${b.peak})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    m.fillStyle = g;
    m.beginPath();
    m.moveTo(b.cx - b.rx, b.cy);
    m.lineTo(b.cx + b.rx, b.cy);
    m.lineTo(b.cx + b.rx + b.flare, b.cy + b.ry);
    m.lineTo(b.cx - b.rx - b.flare, b.cy + b.ry);
    m.closePath();
    m.fill();
    m.restore();
    return;
  }
  if (b.clipTop !== undefined) {
    m.beginPath();
    m.rect(b.cx - b.rx - 1, b.clipTop, 2 * b.rx + 2, b.cy + b.ry - b.clipTop + 1);
    m.clip();
  }
  m.translate(b.cx, b.cy);
  m.scale(1, b.ry / b.rx);
  const g = m.createRadialGradient(0, 0, 0, 0, 0, b.rx);
  for (const [o, f] of FALL) g.addColorStop(o, `rgba(255,255,255,${f * b.peak})`);
  m.fillStyle = g;
  m.beginPath();
  m.arc(0, 0, b.rx, 0, Math.PI * 2);
  m.fill();
  m.restore();
}

export const paintLitPatch: LitPatchPainter = (plan, box, blobs, tint = LAMP_TINT, moment) => {
  if (noCanvas() || box.w <= 0 || box.h <= 0) return '';
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const pw = Math.max(1, Math.round(box.w * dpr));
  const ph = Math.max(1, Math.round(box.h * dpr));
  const b = buffers(pw, ph);
  if (!b) return '';
  const [lit, day, mask] = b as [CanvasRenderingContext2D, CanvasRenderingContext2D, CanvasRenderingContext2D];
  const sx = pw / box.w;
  const sy = ph / box.h;
  // 1. Tranches de jour sous la boîte, chacune rognée à sa largeur (une tranche peint aussi ce qui la déborde).
  lit.setTransform(sx, 0, 0, sy, -box.x * sx, -box.y * sy);
  const t0 = Math.max(0, Math.floor(box.x / TILE));
  const t1 = Math.min(tileCount(plan.width) - 1, Math.floor((box.x + box.w) / TILE));
  for (let t = t0; t <= t1; t++) {
    lit.save();
    lit.beginPath();
    lit.rect(t * TILE, 0, Math.min(TILE, plan.width - t * TILE), plan.height);
    lit.clip();
    paintCityTile(lit, plan, t, moment);
    lit.restore();
  }
  lit.setTransform(1, 0, 0, 1, 0, 0);
  // 2-3. Version éclairée découpée par le masque, dans le repère du monde.
  tintAndMask([lit, day, mask], blobs, tint, [sx, sy, -box.x * sx, -box.y * sy]);
  return lit.canvas.toDataURL('image/png');
};

// « Deux peintures », étapes 2 et 3, partagées par la découpe du décor (paintLitPatch) et la lueur des devantures
// (shop/shop-host.tsx, paintShopGlow). `lit` porte la scène DE JOUR (pixels, alpha compris, repère identité) ; elle devient
// la version éclairée (multiply de la teinte, léger regain d'éclat en screen, alpha de jour rendu), puis est découpée par le
// masque d'intensité des taches `blobs`, peintes dans le repère `toPx` = [échelle x, échelle y, décalage x, décalage y].
export function tintAndMask(
  [lit, day, mask]: readonly [CanvasRenderingContext2D, CanvasRenderingContext2D, CanvasRenderingContext2D],
  blobs: readonly LightBlob[],
  tint: LitTint,
  [sx, sy, ox, oy]: readonly [number, number, number, number],
): void {
  const pw = lit.canvas.width;
  const ph = lit.canvas.height;
  // Copie de jour : garde l'alpha (les vides restent vides après la teinte).
  day.drawImage(lit.canvas, 0, 0);
  lit.globalCompositeOperation = 'multiply';
  lit.fillStyle = tint.multiply;
  lit.fillRect(0, 0, pw, ph);
  if (tint.screen) {
    lit.globalCompositeOperation = 'screen';
    lit.globalAlpha = tint.screenAlpha ?? 1;
    lit.fillStyle = tint.screen;
    lit.fillRect(0, 0, pw, ph);
    lit.globalAlpha = 1;
  }
  lit.globalCompositeOperation = 'destination-in';
  lit.drawImage(day.canvas, 0, 0);
  mask.setTransform(sx, 0, 0, sy, ox, oy);
  for (const blob of blobs) maskBlob(mask, blob);
  mask.setTransform(1, 0, 0, 1, 0, 0);
  lit.drawImage(mask.canvas, 0, 0);
  lit.globalCompositeOperation = 'source-over';
}

// Pluie : colonne de lumière (traits de `wetStrokes`), image de `w` × `h` px du monde, axe au milieu, haut = bord du trottoir.
export const AMBER = 'rgb(255,196,112)';
export const AMBER_CORE = 'rgb(255,230,170)';
export function paintWetColumn(strokes: readonly WetStroke[], w: number, h: number, color = AMBER): string {
  if (noCanvas() || w <= 0 || h <= 0) return '';
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const pw = Math.max(1, Math.round(w * dpr));
  const ph = Math.max(1, Math.round(h * dpr));
  const b = buffers(pw, ph);
  if (!b) return '';
  const c = b[0]!;
  c.setTransform(pw / w, 0, 0, ph / h, (w / 2) * (pw / w), 0);
  for (const s of strokes) {
    c.globalAlpha = s.a;
    c.fillStyle = s.core ? AMBER_CORE : color;
    c.fillRect(s.x, s.y, s.w, s.h);
  }
  c.globalAlpha = 1;
  return c.canvas.toDataURL('image/png');
}
