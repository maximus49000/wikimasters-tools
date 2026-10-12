import { useEffect, useMemo, useReducer } from 'react';
import type { CityPaintPlan } from '../core/library/paint/city-plan';
import { paintCityTile, TILE, tileCount, tileKey } from '../core/library/paint/city-painter';
import { FALL, type LightBlob, type WetStroke } from '../core/library/city/night-light';
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

// ───────────── Lumière de nuit « deux peintures » (G5, notes §5) ─────────────
// Découpe éclairée : la partie `box` (repère du monde) des tranches de JOUR, repeinte à la même échelle que les tranches
// (px du monde × dpr), teintée (`multiply` puis `screen` léger) puis masquée (`destination-in`) par les taches de lumière en
// dégradé FALL. Posée en <image> hors filtre d'étalonnage, par-dessus la tranche de nuit : près de la lampe, enduits, volets et
// pavés retrouvent leurs couleurs, réchauffées ; loin, le bleu nuit reste. Aucun blanc ajouté.
// `tint` : teinte de la version éclairée ; par défaut l'ambre des lampadaires (réutilisable pour une lumière colorée).
export type LitTint = { multiply: string; screen?: string; screenAlpha?: number };
export const LAMP_TINT: LitTint = { multiply: '#FFD4A0', screen: 'rgb(255,196,112)', screenAlpha: 0.2 };
export type LitPatchPainter = (plan: CityPaintPlan, box: { x: number; y: number; w: number; h: number }, blobs: readonly LightBlob[], tint?: LitTint) => string;

let litOverride: LitPatchPainter | null = null;
export function setLitPatchPainterForTests(painter: LitPatchPainter | null): void {
  litOverride = painter;
}
// Peintre en vigueur (double de test, sinon le canvas).
export const litPatchPainter = (): LitPatchPainter => litOverride ?? paintLitPatch;

const noCanvas = (): boolean => typeof document === 'undefined' || (typeof navigator !== 'undefined' && navigator.userAgent.includes('jsdom'));

// Canvas hors écran réutilisés (peinture synchrone : une image à la fois).
let bufs: CanvasRenderingContext2D[] | null = null;
function buffers(w: number, h: number): CanvasRenderingContext2D[] | null {
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

export const paintLitPatch: LitPatchPainter = (plan, box, blobs, tint = LAMP_TINT) => {
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
    paintCityTile(lit, plan, t);
    lit.restore();
  }
  lit.setTransform(1, 0, 0, 1, 0, 0);
  // Copie de jour : garde l'alpha (les vides du décor restent vides après la teinte).
  day.drawImage(lit.canvas, 0, 0);
  // 2. Version éclairée : multiply, puis léger regain d'éclat en screen.
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
  // 3. Masque d'intensité, dans le repère du monde.
  mask.setTransform(sx, 0, 0, sy, -box.x * sx, -box.y * sy);
  for (const blob of blobs) maskBlob(mask, blob);
  mask.setTransform(1, 0, 0, 1, 0, 0);
  lit.drawImage(mask.canvas, 0, 0);
  lit.globalCompositeOperation = 'source-over';
  return lit.canvas.toDataURL('image/png');
};

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
