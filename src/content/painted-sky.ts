import { useMemo, useRef } from 'react';
import { TILE, tileCount, tileKey } from '../core/library/paint/city-painter';
import type { CityPaintPlan } from '../core/library/paint/city-plan';
import {
  CLOUD_KINDS, FOG_W, MOON_SIZE, SKY_TEXTURE, SUN_SIZE,
  cloudPalette, cloudShape, paintCloud, paintFogBand, paintMoon, paintSkyTexture, paintSun, stepKey,
  type CloudShape, type CloudStep,
} from '../core/library/paint/sky-painter';
import { SNOW_VERSION, paintSnowTile } from '../core/library/paint/snow-painter';
import { usePaintJobs, type PaintJob } from './paint-queue';

// Ciel peint (vague Ghibli, G2) : travaux de peinture et hooks qui rendent les images prêtes.
// À incrémenter à chaque changement du dessin du ciel : invalide le cache.
export const SKY_VERSION = 2;
const CLOUD_RES = 1.5; // les nuages sont agrandis jusqu'à ×1,9 par la réserve

const res = (): number => Math.min(2, typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1);
const base = (seed: number): string => `sky|${SKY_VERSION}|${seed}`;

export function skyJobs(seed: number): PaintJob[] {
  const r = res();
  return [
    { key: `${base(seed)}|texture`, x: 0, w: SKY_TEXTURE, h: SKY_TEXTURE, res: r, paint: (ctx) => paintSkyTexture(ctx, SKY_TEXTURE, seed) },
    { key: `${base(seed)}|sun-day`, x: 0, w: SUN_SIZE, h: SUN_SIZE, res: r, grain: seed ^ 0x51, paint: (ctx) => paintSun(ctx, false, seed) },
    { key: `${base(seed)}|sun-dusk`, x: 0, w: SUN_SIZE, h: SUN_SIZE, res: r, grain: seed ^ 0x52, paint: (ctx) => paintSun(ctx, true, seed) },
    { key: `${base(seed)}|moon`, x: 0, w: MOON_SIZE, h: MOON_SIZE, res: r, grain: seed ^ 0x53, paint: (ctx) => paintMoon(ctx, seed) },
  ];
}

export function cloudJobs(seed: number, step: CloudStep): PaintJob[] {
  const palette = cloudPalette(step.daylight, step.twilight, step.dark);
  return Array.from({ length: CLOUD_KINDS }, (_, k) => {
    const shape = cloudShape(seed, k);
    return { key: `${base(seed)}|cloud|${stepKey(step)}|${k}`, x: 0, w: shape.w, h: shape.h, res: res() * CLOUD_RES, grain: seed ^ (k + 1), paint: (ctx) => paintCloud(ctx, shape, palette, seed + k) };
  });
}

export const fogJob = (seed: number, h: number): PaintJob => ({
  key: `${base(seed)}|fog|${Math.round(h)}`, x: 0, w: FOG_W, h: Math.round(h), res: res(), paint: (ctx) => paintFogBand(ctx, FOG_W, Math.round(h), seed),
});

export function snowJobs(plan: CityPaintPlan): PaintJob[] {
  return Array.from({ length: tileCount(plan.width) }, (_, t) => ({
    key: `snow|${SNOW_VERSION}|${tileKey(plan, t)}`,
    x: t * TILE,
    w: Math.min(TILE, plan.width - t * TILE),
    h: plan.height,
    res: res(),
    grain: plan.seed ^ (t + 0x5a0),
    paint: (ctx) => paintSnowTile(ctx, plan, t),
  }));
}

export type PaintedSky = { ready: boolean; texture: string; sunDay: string; sunDusk: string; moon: string };

export function usePaintedSky(seed: number, on: boolean): PaintedSky {
  const jobs = useMemo(() => skyJobs(seed), [seed]);
  const ready = usePaintJobs(jobs, on);
  const [texture, sunDay, sunDusk, moon] = jobs.map((j) => ready.get(j.key) ?? '');
  return { ready: jobs.every((j) => ready.has(j.key)), texture: texture!, sunDay: sunDay!, sunDusk: sunDusk!, moon: moon! };
}

export type PaintedClouds = { ready: boolean; urls: string[]; shapes: CloudShape[] };

// Jeu de nuages du cran demandé ; tant qu'il n'est pas complet, le dernier jeu complet reste affiché.
export function usePaintedClouds(seed: number, step: CloudStep | null): PaintedClouds {
  const shapes = useMemo(() => Array.from({ length: CLOUD_KINDS }, (_, k) => cloudShape(seed, k)), [seed]);
  const key = step ? stepKey(step) : '';
  const jobs = useMemo(() => (step ? cloudJobs(seed, step) : []), [seed, key]); // eslint-disable-line react-hooks/exhaustive-deps
  const ready = usePaintJobs(jobs, step !== null);
  const last = useRef<{ seed: number; urls: string[] } | null>(null);
  if (jobs.length > 0 && jobs.every((j) => ready.has(j.key))) last.current = { seed, urls: jobs.map((j) => ready.get(j.key)!) };
  const kept = last.current && last.current.seed === seed ? last.current.urls : null;
  return { ready: kept !== null, urls: kept ?? [], shapes };
}

export function usePaintedFog(seed: number, h: number, on: boolean): string {
  const job = useMemo(() => [fogJob(seed, h)], [seed, h]);
  return usePaintJobs(job, on).get(job[0]!.key) ?? '';
}

export type SnowTile = { x: number; w: number; url: string };

// Tranches de neige posée du plan demandé ; tant que la nouvelle série n'est pas complète (agrandissement), la dernière
// série complète reste affichée (comme les nuages) au lieu de retomber au rectangle actuel.
export function usePaintedSnow(plan: CityPaintPlan | null): { ready: boolean; tiles: SnowTile[] } {
  const jobs = useMemo(() => (plan ? snowJobs(plan) : []), [plan]);
  const ready = usePaintJobs(jobs, plan !== null);
  const last = useRef<{ seed: number; tiles: SnowTile[] } | null>(null);
  const tiles = jobs.map((j) => ({ x: j.x, w: j.w, url: ready.get(j.key) ?? '' }));
  if (plan && tiles.length > 0 && tiles.every((t) => t.url !== '')) last.current = { seed: plan.seed, tiles };
  const kept = plan && last.current && last.current.seed === plan.seed ? last.current.tiles : null;
  return { ready: kept !== null, tiles: kept ?? [] };
}
