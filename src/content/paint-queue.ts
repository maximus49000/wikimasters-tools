import { useEffect, useReducer } from 'react';
import type { PaintCtx } from '../core/library/paint/paint-ctx';
import { mulberry32 } from '../core/library/scene-world';

// File de peinture (vague Ghibli) : chaque travail peint une petite image hors écran pendant les temps morts, un travail par
// créneau, rendue en data URL PNG (pas de blob : la CSP du site les refuse). Cache mémoire commun, les plus anciennes libérées.
// `x` : bord gauche du travail dans le monde (le canvas est décalé) ; `res` : px de canvas par px du monde.
export type PaintJob = { key: string; x: number; w: number; h: number; res: number; grain?: number; paint(ctx: PaintCtx): void };
export type JobRunner = (job: PaintJob) => Promise<string | null>;

const CACHE_MAX = 80;
const cache = new Map<string, string>();
const failed = new Set<string>();
let override: JobRunner | null = null;

export function setJobRunnerForTests(runner: JobRunner | null): void {
  override = runner;
}

export function resetPaintQueueForTests(): void {
  cache.clear();
  failed.clear();
}

function remember(key: string, url: string): void {
  cache.delete(key);
  cache.set(key, url);
  while (cache.size > CACHE_MAX) {
    const oldKey = cache.keys().next().value as string;
    cache.delete(oldKey);
  }
}

// Remonte une image affichée en tête du cache (jamais libérée pendant qu'on la montre) ; '' si absente.
function touch(key: string): string {
  const url = cache.get(key);
  if (url === undefined) return '';
  cache.delete(key);
  cache.set(key, url);
  return url;
}

// Grain de papier : léger bruit sur les pixels peints (le transparent reste intact).
export function paperGrain(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number): void {
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

export const idle = (fn: () => void): (() => void) => {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(fn, { timeout: 1500 });
    return () => window.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(fn, 16);
  return () => window.clearTimeout(id);
};

export const canvasJobRunner: JobRunner = async (job) => {
  if (typeof document === 'undefined' || (typeof navigator !== 'undefined' && navigator.userAgent.includes('jsdom'))) return null;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(job.w * job.res));
  canvas.height = Math.max(1, Math.ceil(job.h * job.res));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(job.res, 0, 0, job.res, -job.x * job.res, 0);
  job.paint(ctx);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (job.grain !== undefined) paperGrain(ctx, canvas.width, canvas.height, job.grain);
  return canvas.toDataURL('image/png');
};

// Images prêtes des travaux demandés (clé → URL), peintes dans l'ordre de la liste. `enabled` faux : rien n'est peint,
// mais ce qui est déjà en cache est rendu (permet le fondu de sortie).
export function usePaintJobs(jobs: readonly PaintJob[], enabled = true): ReadonlyMap<string, string> {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const signature = enabled ? jobs.map((j) => j.key).join('\n') : '';
  useEffect(() => {
    if (signature === '') return;
    const runner = override ?? canvasJobRunner;
    let cancelled = false;
    let cancelIdle: (() => void) | null = null;
    const next = (): void => {
      if (cancelled) return;
      const job = jobs.find((j) => !cache.has(j.key) && !failed.has(j.key));
      if (!job) return;
      cancelIdle = idle(() => {
        void runner(job)
          .catch(() => null)
          .then((url) => {
            if (url) remember(job.key, url);
            else failed.add(job.key);
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
    // La signature résume les travaux : mêmes clés, mêmes travaux.
  }, [signature]); // eslint-disable-line react-hooks/exhaustive-deps
  const out = new Map<string, string>();
  for (const j of jobs) {
    const url = touch(j.key);
    if (url !== '') out.set(j.key, url);
  }
  return out;
}
