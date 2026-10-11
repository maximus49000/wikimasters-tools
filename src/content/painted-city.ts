import { useEffect, useMemo, useReducer } from 'react';
import type { CityPaintPlan } from '../core/library/paint/city-plan';
import { paintCityTile, TILE, tileCount, tileKey } from '../core/library/paint/city-painter';
import { idle } from './paint-queue';

// Peinture des tranches de la ville (vague Ghibli) : canvas hors écran pendant les temps morts, une tranche par créneau,
// image PNG en data URL, cache mémoire (20 tranches au plus, les plus anciennes libérées).
export type PaintedTile = { x: number; w: number; url: string };
export type TilePainter = (plan: CityPaintPlan, tile: number) => Promise<string | null>;

const CACHE_MAX = 20;
const cache = new Map<string, string>();
const failed = new Set<string>();
let override: TilePainter | null = null;

function remember(key: string, url: string): void {
  cache.delete(key);
  cache.set(key, url);
  while (cache.size > CACHE_MAX) {
    const oldKey = cache.keys().next().value as string;
    cache.delete(oldKey);
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

export const canvasTilePainter: TilePainter = async (plan, tile) => {
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
  ctx.setTransform(dpr, 0, 0, dpr, -x0 * dpr, 0);
  // Cellulo : aplats francs, pas de grain de papier.
  paintCityTile(ctx, plan, tile);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return canvas.toDataURL('image/png');
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
        void painter(plan, t).catch(() => null).then((url) => {
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
