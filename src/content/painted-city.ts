import { useEffect, useMemo, useReducer } from 'react';
import type { CityPaintPlan } from '../core/library/paint/city-plan';
import { paintCityTile, TILE, tileCount, tileKey } from '../core/library/paint/city-painter';
import { mulberry32 } from '../core/library/scene-world';

// Peinture des tranches de la ville (vague Ghibli) : canvas hors écran pendant les temps morts, une tranche par créneau,
// image PNG en URL d'objet, cache mémoire (64 tranches au plus, les plus anciennes libérées).
export type PaintedTile = { x: number; w: number; url: string };
export type TilePainter = (plan: CityPaintPlan, tile: number) => Promise<string | null>;

const CACHE_MAX = 64;
const cache = new Map<string, string>();
const failed = new Set<string>();
let override: TilePainter | null = null;

function remember(key: string, url: string): void {
  cache.delete(key);
  cache.set(key, url);
  while (cache.size > CACHE_MAX) {
    const [oldKey, oldUrl] = cache.entries().next().value as [string, string];
    cache.delete(oldKey);
    if (oldUrl.startsWith('blob:') && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(oldUrl);
  }
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
  failed.clear();
}

// Grain de papier : léger bruit sur les pixels peints (le ciel transparent reste intact).
function paperGrain(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number): void {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const rng = mulberry32(seed);
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const n = (rng() - 0.5) * 14;
    d[i] = d[i]! + n;
    d[i + 1] = d[i + 1]! + n;
    d[i + 2] = d[i + 2]! + n;
  }
  ctx.putImageData(img, 0, 0);
}

export const canvasTilePainter: TilePainter = async (plan, tile) => {
  if (typeof document === 'undefined' || (typeof navigator !== 'undefined' && navigator.userAgent.includes('jsdom'))) return null;
  const x0 = tile * TILE;
  const w = Math.min(TILE, plan.width - x0);
  if (w <= 0) return null;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(w * dpr);
  canvas.height = Math.ceil(plan.height * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, -x0 * dpr, 0);
  paintCityTile(ctx, plan, tile);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  paperGrain(ctx, canvas.width, canvas.height, plan.seed ^ (tile + 1));
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  return blob ? URL.createObjectURL(blob) : null;
};

const idle = (fn: () => void): (() => void) => {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(fn, { timeout: 1500 });
    return () => window.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(fn, 16);
  return () => window.clearTimeout(id);
};

// Tranches de la ville peinte pour ce plan. `ready` : toutes peintes. Sans plan : rien.
export function usePaintedCity(plan: CityPaintPlan | null): { ready: boolean; tiles: PaintedTile[] } {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const keys = useMemo(() => (plan ? Array.from({ length: tileCount(plan.width) }, (_, t) => tileKey(plan, t)) : []), [plan]);
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
        void painter(plan, t).then((url) => {
          if (url) remember(keys[t]!, url);
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
  }, [plan, keys]);
  if (!plan) return { ready: false, tiles: [] };
  const tiles = keys.map((k, t) => ({ x: t * TILE, w: Math.min(TILE, plan.width - t * TILE), url: touch(k) }));
  return { ready: tiles.every((t) => t.url !== ''), tiles };
}
