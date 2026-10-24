import { useEffect, useMemo, useReducer, useRef, useState, type ReactElement } from 'react';
import { lampsFor } from '../core/library/city/lamps';
import type { CityPaintPlan } from '../core/library/paint/city-plan';
import { foliageOf, type FondMoment } from '../core/library/paint/fond-time';
import { windOf, type Wind } from '../core/library/paint/fond-vent';
import { gradeFor, type Grade } from '../core/library/paint/grade';
import type { RuePit } from '../core/library/paint/rue-verte-plan';
import { rueTreeModel, rueWet } from '../core/library/paint/rue-verte-painter';
import {
  RUE_CAP_OF,
  birdAway,
  gradePixels,
  nextBirdAway,
  paintRueLampWash,
  paintRueLayer,
  rueBird,
  rueLampWash,
  rueLayers,
  rueParticles,
  rueSpriteBox,
  rueTreePose,
  type BirdAway,
  type RueLampWash,
  type RueLayerName,
  type RueParticleKind,
  type RueWeather,
} from '../core/library/paint/rue-sprites';
import { gradeHex } from '../core/library/paint/fond-vie';
import { INK } from '../core/library/paint/cel';
import type { TreeModel } from '../core/library/paint/hill-trees';
import { useWallClockLoop } from './use-wallclock-loop';

// Calque `arbres-rue` de la ville peinte (PR 3, notes de la maquette §3 c, §3 d) : les arbres des fosses de la rue, au vent.
// Par fosse plantée, des couches cuites (rue-sprites.ts) : ombre des masses, fût + charpentières (jamais transformés), rameaux
// fins (cisaillement), une image par grappe (translation), rehauts et rehauts pâles (opacité), puis particules et oiseau. Le
// tout est dessiné sur UNE toile 2D placée dans le <svg> par <foreignObject> (comme la pluie, rain-canvas.tsx), à la même
// profondeur que l'ancien calque SVG : la boucle de l'horloge murale (15 images/s) redessine la toile seule, sans toucher au
// SVG de la scène, et ne redessine rien quand l'image ne change pas (vent calme, aucune particule).
// Cuisson hors écran en temps mort (requestIdleCallback, échéance respectée : une ou quelques couches par créneau, jamais une
// image bloquée), une fosse après l'autre, par (fosse, date, pluie, neige, étalonnage arrondi au vingtième, lavis des
// lampadaires) ; l'ancienne image reste jusqu'à la nouvelle (décodée). Une cuisson ratée est retentée (3 essais) ; une fosse
// sans image après ses essais est marquée `data-rue-echec` et signalée une fois dans la console. Les arbres font partie du
// décor : `onReady` dit quand toutes les fosses ont leur image (scene-city attend ce signal pour montrer la ville peinte) ; un
// arbre cuit après coup apparaît en fondu (jamais sur place). L'étalonnage (matrice `gradeFor`)
// est appliqué aux pixels à la cuisson : pas de filtre SVG animé (trop cher sur Android). Images en data URL PNG, comme toutes
// les images cuites de la scène : la CSP du site refuse blob:.
// Mouvement réduit (`prefers-reduced-motion` ou `still`) : arbres dessinés en pose nulle, sans fondu, aucune boucle.
// Limite connue (comme la pluie) : une copie `<use>` du calque (fenêtre soulevée de la pièce) ne recopie pas une toile.
const FRAME_MS = 66;
// Cache : au moins deux générations de sprites (l'affichée et la suivante) pour tous les arbres de la scène.
const CACHE_MIN = 24;
let cacheMax = CACHE_MIN;
// Essais de cuisson d'une même clé.
export const RUE_BAKE_TRIES = 3;
// Particules (feuilles, pétales, gouttes, neige, graines) : géométrie (repère de la particule) et opacité par genre.
const PART_SHAPE: Record<RueParticleKind, { x: number; y: number; w: number; h: number; rx?: number; op: number }> = {
  feuille: { x: -0.9, y: -0.5, w: 1.8, h: 1, op: 1 },
  petale: { x: -0.9, y: -0.5, w: 1.8, h: 1, op: 1 },
  goutte: { x: -0.25, y: -1.2, w: 0.5, h: 1.4, op: 0.9 },
  neige: { x: -0.9, y: -0.9, w: 1.8, h: 1.8, rx: 0.9, op: 0.95 },
  graine: { x: -0.45, y: -0.45, w: 0.9, h: 0.9, rx: 0.45, op: 0.85 },
};
// Marge minimale par créneau de temps mort avant d'y cuire une couche de plus (ms).
const SLOT_MARGIN_MS = 6;
const q20 = (v: number): number => Math.round(Math.max(0, Math.min(1, v)) * 20) / 20;
const reducedMotion = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const CALM: Wind = { wind: 0, dir: 1, wet: 0, storm: false };
// Arrondi (au centième par défaut) des valeurs dessinées, « -0 » ramené à 0 : la signature de l'image ne change qu'au centième.
const rnd = (v: number, d = 2): number => {
  const f = 10 ** d;
  return Math.round(v * f) / f || 0;
};

export type RueSprites = Partial<Record<RueLayerName, string>>;
// Travail de cuisson d'une fosse : `grade` null = jour sans étalonnage ; `res` px de canvas par px du monde.
export type RueBakeJob = { key: string; pit: RuePit; layers: RueLayerName[]; box: { x: number; y: number; w: number; h: number }; moment: FondMoment; grade: Grade | null; washes: RueLampWash[]; res: number };
export type RueSpritePainter = (job: RueBakeJob) => Promise<RueSprites | null>;

const cache = new Map<string, RueSprites>();
// Échecs par clé (retentée tant que < RUE_BAKE_TRIES).
const failed = new Map<string, number>();
let warned = false;
let override: RueSpritePainter | null = null;

export function setRueSpritePainterForTests(painter: RueSpritePainter | null): void {
  override = painter;
}
export function resetStreetTreesForTests(): void {
  cache.clear();
  failed.clear();
  warned = false;
}

function remember(key: string, s: RueSprites): void {
  cache.delete(key);
  cache.set(key, s);
  while (cache.size > cacheMax) cache.delete(cache.keys().next().value as string);
}

// Créneau de temps mort avec son échéance (repli sans requestIdleCallback : un créneau de 16 ms sans marge, une couche).
type Slot = { timeRemaining(): number };
function idleSlot(): Promise<Slot> {
  return new Promise((resolve) => {
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback((d) => resolve(d), { timeout: 1500 });
    else window.setTimeout(() => resolve({ timeRemaining: () => 0 }), 16);
  });
}

// Emprise d'une couche dans le monde (unités) : chaque image est rognée à ses pixels peints (une grappe ne couvre qu'une petite
// part de la boîte de l'arbre ; mémoire décodée divisée d'autant sur Android). Jeu sans emprise (peintre des tests) : la
// boîte entière de l'arbre.
export type RueCrop = { x: number; y: number; w: number; h: number };
const CROPS = new WeakMap<RueSprites, Partial<Record<RueLayerName, RueCrop>>>();
// Marge (px du canvas) gardée autour des pixels peints : le lissage d'une couche cisaillée n'étire jamais un bord opaque.
const CROP_PAD = 1;
// Plus petit rectangle des pixels non transparents (± CROP_PAD, borné au canvas), null si la couche est vide.
export function opaqueBounds(data: Uint8ClampedArray, w: number, h: number): { x: number; y: number; w: number; h: number } | null {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < w; x++) {
      if (data[row + x * 4 + 3] === 0) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      y1 = y;
    }
  }
  if (x1 < 0) return null;
  x0 = Math.max(0, x0 - CROP_PAD);
  y0 = Math.max(0, y0 - CROP_PAD);
  x1 = Math.min(w - 1, x1 + CROP_PAD);
  y1 = Math.min(h - 1, y1 + CROP_PAD);
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

// Peintre réel : un seul canvas, une couche après l'autre (peinte, étalonnée, lavis des lampes, rognée à ses pixels peints,
// PNG), réparties sur les créneaux de temps mort : au moins une couche par créneau, une de plus tant qu'il reste
// SLOT_MARGIN_MS avant l'échéance.
export const canvasRueSpritePainter: RueSpritePainter = async (job) => {
  if (typeof document === 'undefined' || (typeof navigator !== 'undefined' && navigator.userAgent.includes('jsdom'))) return null;
  const { box, res } = job;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(box.w * res));
  canvas.height = Math.max(1, Math.ceil(box.h * res));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const out: RueSprites = {};
  const crops: Partial<Record<RueLayerName, RueCrop>> = {};
  const cut = document.createElement('canvas');
  const cutCtx = cut.getContext('2d');
  if (!cutCtx) return null;
  let slot: Slot | null = null;
  let inSlot = 0;
  for (const layer of job.layers) {
    if (!slot || (inSlot > 0 && slot.timeRemaining() < SLOT_MARGIN_MS)) {
      slot = await idleSlot();
      inSlot = 0;
    }
    inSlot++;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const world = (): void => ctx.setTransform(res, 0, 0, res, -box.x * res, -box.y * res);
    world();
    paintRueLayer(ctx, job.pit, layer, job.moment);
    if (job.grade) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      gradePixels(img.data, job.grade);
      ctx.putImageData(img, 0, 0);
      world();
    }
    // Lavis chaud par-dessus l'étalonnage (lumière des lampadaires, hors nuit bleue).
    paintRueLampWash(ctx, job.pit, layer, job.washes);
    const b = opaqueBounds(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
    // Couche vide (rien de peint à ce moment) : aucune image.
    if (!b) {
      out[layer] = '';
      continue;
    }
    crops[layer] = { x: box.x + b.x / res, y: box.y + b.y / res, w: b.w / res, h: b.h / res };
    if (b.w === canvas.width && b.h === canvas.height) {
      out[layer] = canvas.toDataURL('image/png');
      continue;
    }
    cut.width = b.w;
    cut.height = b.h;
    cutCtx.clearRect(0, 0, b.w, b.h);
    cutCtx.drawImage(canvas, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
    out[layer] = cut.toDataURL('image/png');
  }
  CROPS.set(out, crops);
  return out;
};

type Tree = { v: RuePit; m: TreeModel; box: { x: number; y: number; w: number; h: number }; layers: RueLayerName[]; masses: number };

// Une image de la boucle, en ordres de dessin dans le repère du monde (bancs d'essai et tests : `setRueFrameSinkForTests`).
// `m` : matrice (a b c d e f) de la couche, comme l'ancien attribut `transform` ; `alpha` : fondu d'entrée de l'arbre × opacité
// de la couche (rehauts).
export type RueDraw =
  | { op: 'layer'; tree: number; layer: RueLayerName; href: string; m: readonly number[]; alpha: number }
  | { op: 'part'; kind: RueParticleKind; x: number; y: number; rot: number; color: string; alpha: number }
  | { op: 'bird'; x: number; y: number; flying: boolean; flap: number; dir: 1 | -1 };
let frameSink: ((ops: readonly RueDraw[]) => void) | null = null;
export function setRueFrameSinkForTests(sink: ((ops: readonly RueDraw[]) => void) | null): void {
  frameSink = sink;
}

// Images décodées des sprites (une par couche), gardées tant que leur jeu de sprites l'est (cache ou arbre affiché).
// Un jeu dont une image ne se décode pas est jeté comme une cuisson ratée (retentée, puis `data-rue-echec`).
const JSDOM = typeof navigator !== 'undefined' && navigator.userAgent.includes('jsdom');
const IMAGES = new WeakMap<RueSprites, Partial<Record<RueLayerName, HTMLImageElement>>>();
const BROKEN = new WeakSet<RueSprites>();
const decodedListeners = new Set<() => void>();
const brokenListeners = new Set<() => void>();
function breakSet(s: RueSprites): void {
  if (BROKEN.has(s)) return;
  BROKEN.add(s);
  for (const [key, v] of cache)
    if (v === s) {
      cache.delete(key);
      failed.set(key, (failed.get(key) ?? 0) + 1);
    }
  brokenListeners.forEach((f) => f());
}
function imagesOf(s: RueSprites): Partial<Record<RueLayerName, HTMLImageElement>> {
  let imgs = IMAGES.get(s);
  if (!imgs) {
    imgs = {};
    for (const [l, url] of Object.entries(s) as [RueLayerName, string][]) {
      if (JSDOM || !url) continue;
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => decodedListeners.forEach((f) => f());
      img.onerror = () => breakSet(s);
      img.src = url;
      imgs[l] = img;
    }
    IMAGES.set(s, imgs);
  }
  return imgs;
}
// Numéro d'un jeu de sprites (signature de l'image : une nouvelle cuisson se redessine).
const SET_IDS = new WeakMap<RueSprites, number>();
let setSeq = 0;
function setId(s: RueSprites): number {
  let n = SET_IDS.get(s);
  if (n === undefined) SET_IDS.set(s, (n = ++setSeq));
  return n;
}
// Image de la boucle en tampon plat réutilisé (aucun objet par image) : des enregistrements de STRIDE nombres,
//   couche : [0, arbre, rang de la couche, c, e, f, alpha] (matrice 1 0 c 1 e f) ;
//   particule : [1, genre, x, y, rotation, couleur, alpha] ; oiseau : [2, x, y, en vol, battement, sens, 0] ;
//   arbre : [3, arbre, numéro du jeu, fondu, 0, 0, 0] avant ses couches (une nouvelle cuisson change l'image) ; les couches
//   portent leur seule opacité (rehauts), le fondu s'applique à l'arbre entier.
// Le même tampon sert de signature : une image identique à la précédente n'est pas redessinée.
const STRIDE = 7;
const KINDS: readonly RueParticleKind[] = ['feuille', 'petale', 'goutte', 'neige', 'graine'];
const KIND_ID: Record<RueParticleKind, number> = { feuille: 0, petale: 1, goutte: 2, neige: 3, graine: 4 };
// Couleurs étalonnées des particules, numérotées (vidées au-delà de MAX_COLORS : l'étalonnage suit le jour en continu).
const MAX_COLORS = 2048;
const COLORS: string[] = [];
const COLOR_IDS = new Map<string, number>();
const colorId = (c: string): number => {
  let n = COLOR_IDS.get(c);
  if (n === undefined) COLOR_IDS.set(c, (n = COLORS.push(c) - 1));
  return n;
};
function sameFrame(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
// Ordres de dessin lisibles (tests et bancs d'essai seulement).
function opsOf(F: readonly number[], trees: readonly Tree[], sets: readonly (RueSprites | undefined)[]): RueDraw[] {
  const ops: RueDraw[] = [];
  let fade = 1;
  for (let o = 0; o < F.length; o += STRIDE) {
    const kind = F[o];
    if (kind === 3) fade = F[o + 3]!;
    else if (kind === 0) {
      const i = F[o + 1]!;
      const layer = trees[i]!.layers[F[o + 2]!]!;
      ops.push({ op: 'layer', tree: i, layer, href: sets[i]?.[layer] ?? '', m: [1, 0, F[o + 3]!, 1, F[o + 4]!, F[o + 5]!], alpha: rnd(fade * F[o + 6]!, 3) });
    } else if (kind === 1) ops.push({ op: 'part', kind: KINDS[F[o + 1]!]!, x: F[o + 2]!, y: F[o + 3]!, rot: F[o + 4]!, color: COLORS[F[o + 5]!]!, alpha: F[o + 6]! });
    else if (kind === 2) ops.push({ op: 'bird', x: F[o + 1]!, y: F[o + 2]!, flying: F[o + 3] === 1, flap: F[o + 4]!, dir: F[o + 5]! < 0 ? -1 : 1 });
  }
  return ops;
}
// Toutes les couches d'un jeu de sprites sont prêtes à dessiner (jsdom : rien à décoder).
function decoded(s: RueSprites): boolean {
  if (BROKEN.has(s)) return false;
  if (JSDOM) return true;
  const imgs = imagesOf(s);
  return (Object.keys(s) as RueLayerName[]).every((l) => !s[l] || (imgs[l]?.complete === true && imgs[l]!.naturalWidth > 0));
}

// Courbe CSS `ease` (cubic-bezier(.25, .1, .25, 1)) : y pour x ∈ [0, 1] (t essayé à x, puis dichotomie, 20 pas au plus).
function cssEase(x: number): number {
  const bx = (t: number): number => 3 * (1 - t) * (1 - t) * t * 0.25 + 3 * (1 - t) * t * t * 0.25 + t * t * t;
  const by = (t: number): number => 3 * (1 - t) * (1 - t) * t * 0.1 + 3 * (1 - t) * t * t + t * t * t;
  let lo = 0;
  let hi = 1;
  let t = x;
  for (let i = 0; i < 20; i++) {
    const v = bx(t) - x;
    if (Math.abs(v) < 1e-5) break;
    if (v > 0) hi = t;
    else lo = t;
    t = (lo + hi) / 2;
  }
  return by(t);
}

// Toile des arbres : tampon = taille affichée × dpr, au plus 2 px par unité de monde (résolution des sprites, donc aussi en
// vue zoomée ×4) et 2,5 Mpx (10 Mo) : une scène de 2 880 unités (bande des arbres ≈ 185 unités de haut) tient à 2 px/unité
// (≈ 2,1 Mpx, 8,5 Mo) ; au-delà, la résolution baisse.
const MAX_UNIT_SCALE = 2;
const MAX_PIXELS = 2_500_000;
// Images de la boucle entre deux relevés de la taille affichée (le zoom de la caméra est une transformation : ni `resize` ni
// ResizeObserver), comme la pluie (rain-canvas.tsx).
const RESIZE_EVERY = 30;
type Area = { x: number; y: number; w: number; h: number };
function fitCanvas(cv: HTMLCanvasElement, area: Area): number {
  const r = cv.getBoundingClientRect();
  const dpr = typeof window !== 'undefined' && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
  let k = r.width > 0 ? (r.width / area.w) * dpr : dpr;
  k = Math.min(k, MAX_UNIT_SCALE);
  if (area.w * area.h * k * k > MAX_PIXELS) k = Math.sqrt(MAX_PIXELS / (area.w * area.h));
  k = Math.max(0.25, Math.round(k * 8) / 8);
  const w = Math.max(1, Math.round(area.w * k));
  const h = Math.max(1, Math.round(area.h * k));
  if (cv.width !== w) cv.width = w;
  if (cv.height !== h) cv.height = h;
  return k;
}

// Dessine une image de la boucle (efface tout, puis les enregistrements dans l'ordre : arbres, particules, oiseau).
// Marge (unités) autour de la boîte d'un arbre sur la toile de travail du fondu (cisaillement des rameaux, grappes).
const FADE_PAD = 12;
let scratch: HTMLCanvasElement | null = null;
function paintFrame(main: CanvasRenderingContext2D, cv: HTMLCanvasElement, k: number, area: Area, F: readonly number[], trees: readonly Tree[], imgs: readonly (Partial<Record<RueLayerName, HTMLImageElement>> | undefined)[], sets: readonly (RueSprites | undefined)[]): void {
  main.setTransform(1, 0, 0, 1, 0, 0);
  main.globalAlpha = 1;
  main.clearRect(0, 0, cv.width, cv.height);
  let ctx = main;
  let ox = -area.x * k;
  let oy = -area.y * k;
  // Arbre en fondu : ses couches sont composées à part, puis posées d'un seul coup à l'opacité du fondu (comme l'opacité d'un
  // groupe SVG : le fût ne transparaît pas à travers les masses).
  let fading: { fade: number; x: number; y: number; w: number; h: number } | null = null;
  const flush = (): void => {
    if (!fading || !scratch) return;
    main.setTransform(1, 0, 0, 1, 0, 0);
    main.globalAlpha = fading.fade;
    main.drawImage(scratch, 0, 0, fading.w, fading.h, Math.round((fading.x - area.x) * k), Math.round((fading.y - area.y) * k), fading.w, fading.h);
    fading = null;
    ctx = main;
    ox = -area.x * k;
    oy = -area.y * k;
  };
  for (let o = 0; o < F.length; o += STRIDE) {
    const kind = F[o];
    if (kind !== 0) flush();
    if (kind === 3) {
      const fade = F[o + 3]!;
      if (fade >= 1) continue;
      const b = trees[F[o + 1]!]!.box;
      const x = b.x - FADE_PAD;
      const y = b.y - FADE_PAD;
      const w = Math.ceil((b.w + 2 * FADE_PAD) * k);
      const h = Math.ceil((b.h + 2 * FADE_PAD) * k);
      scratch ??= document.createElement('canvas');
      if (scratch.width < w) scratch.width = w;
      if (scratch.height < h) scratch.height = h;
      const sc = scratch.getContext('2d');
      if (!sc) continue;
      sc.setTransform(1, 0, 0, 1, 0, 0);
      sc.globalAlpha = 1;
      sc.clearRect(0, 0, w, h);
      fading = { fade, x, y, w, h };
      ctx = sc;
      // Origine de la toile de travail au pixel près de la toile principale (aucun décalage au moment de poser l'arbre).
      ox = -area.x * k - Math.round((x - area.x) * k);
      oy = -area.y * k - Math.round((y - area.y) * k);
    } else if (kind === 0) {
      const tr = trees[F[o + 1]!]!;
      const img = imgs[F[o + 1]!]?.[tr.layers[F[o + 2]!]!];
      if (!img) continue;
      // Repère du monde × matrice de la couche (1 0 c 1 e f).
      const c = F[o + 3]!;
      ctx.setTransform(k, 0, k * c, k, ox + k * F[o + 4]!, oy + k * F[o + 5]!);
      ctx.globalAlpha = F[o + 6]!;
      // Image rognée à son emprise (CROPS), sinon (peintre des tests) la boîte entière de l'arbre.
      const set = sets[F[o + 1]!];
      const b = (set && CROPS.get(set)?.[tr.layers[F[o + 2]!]!]) ?? tr.box;
      ctx.drawImage(img, b.x, b.y, b.w, b.h);
    } else if (kind === 1) {
      const sh = PART_SHAPE[KINDS[F[o + 1]!]!];
      ctx.setTransform(k, 0, 0, k, ox + k * F[o + 2]!, oy + k * F[o + 3]!);
      const rot = F[o + 4]!;
      if (rot) ctx.rotate((rot * Math.PI) / 180);
      ctx.globalAlpha = F[o + 6]!;
      ctx.fillStyle = COLORS[F[o + 5]!]!;
      if (sh.rx) {
        ctx.beginPath();
        ctx.arc(sh.x + sh.w / 2, sh.y + sh.h / 2, sh.rx, 0, Math.PI * 2);
        ctx.fill();
      } else ctx.fillRect(sh.x, sh.y, sh.w, sh.h);
    } else if (kind === 2) {
      // En vol : trait en V ; posé : corps et tête (tournée dans le sens d'arrivée), en aplat sans trait.
      const x = F[o + 1]!;
      const y = F[o + 2]!;
      const flap = F[o + 4]!;
      ctx.setTransform(k, 0, 0, k, ox, oy);
      ctx.globalAlpha = 0.85;
      if (F[o + 3] === 1) {
        ctx.beginPath();
        ctx.moveTo(x - 1.3, y - flap);
        ctx.lineTo(x, y + 0.3);
        ctx.lineTo(x + 1.3, y - flap);
        ctx.strokeStyle = INK;
        ctx.lineWidth = 0.6;
        ctx.stroke();
      } else {
        // Corps et tête en un seul tracé (un seul remplissage : pas de recouvrement plus foncé).
        const hx = x + F[o + 5]! * 0.6 - 0.45;
        ctx.fillStyle = INK;
        ctx.beginPath();
        ctx.rect(x - 0.7, y - 1.1, 1.4, 1.1);
        ctx.moveTo(hx + 0.9, y - 1.3);
        ctx.arc(hx + 0.45, y - 1.3, 0.45, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  flush();
  main.globalAlpha = 1;
}

type Props = {
  plan: CityPaintPlan;
  moment: FondMoment;
  daylight: number;
  twilight: number;
  gloom: boolean;
  // Intensité des lumières de la ville (nuit ou ciel couvert) : force du lavis des lampadaires.
  dim: number;
  minutes: number;
  still?: boolean;
  // Toutes les fosses ont leur image (ou ont épuisé leurs essais) : appelé à chaque changement.
  onReady?: (ready: boolean) => void;
  // Heure fixe (décimale) : banc et tests ; sans elle, le vent suit l'horloge murale.
  at?: number;
};

export function StreetTrees({ plan, moment, daylight, twilight, gloom, dim, minutes, still: stillProp, at, onReady }: Props): ReactElement {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const still = stillProp ?? reducedMotion();
  const trees = useMemo<Tree[]>(
    () =>
      plan.rue
        .filter((v): v is RuePit => v.kind === 'pit' && !v.empty)
        .map((v) => {
          const m = rueTreeModel(v);
          const layers = rueLayers(m);
          return { v, m, box: rueSpriteBox(v), layers, masses: layers.filter((l) => l[0] === 'c').length };
        }),
    [plan],
  );
  // Zone de la toile : toute la largeur, des houppiers (et de l'envol de l'oiseau, 30 unités plus haut) jusqu'au sol des fosses.
  const area = useMemo<Area>(() => {
    if (!trees.length) return { x: 0, y: 0, w: 1, h: 1 };
    const top = Math.min(...trees.map((tr) => tr.box.y)) - 36;
    const bottom = Math.max(...trees.map((tr) => Math.max(tr.box.y + tr.box.h, tr.v.y + 3)));
    const y = Math.floor(Math.max(0, top));
    return { x: 0, y, w: plan.width, h: Math.ceil(Math.min(plan.height, bottom)) - y };
  }, [trees, plan.width, plan.height]);
  const lamps = useMemo(() => lampsFor(plan.width, plan.seed), [plan]);
  const qd = q20(daylight);
  const qt = q20(twilight);
  const grade = useMemo(() => (qd >= 1 && qt <= 0 && !gloom ? null : gradeFor(qd, qt, gloom)), [qd, qt, gloom]);
  const res = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1;
  const D = moment;
  const base = `${plan.seed}|${D.date}|${rueWet(D)}|${D.meteo.snow ? 1 : 0}|${qd}|${qt}|${gloom ? 1 : 0}|${res}`;
  const jobs = useMemo<RueBakeJob[]>(
    () =>
      trees.map((tr) => {
        const washes = rueLampWash(tr.v, lamps, minutes, daylight, dim);
        const key = `${base}|${Math.round(tr.v.x * 10)}|${tr.v.y.toFixed(1)}|${washes.map((w) => `${w.k}${w.side}`).join(',')}`;
        return { key, pit: tr.v, layers: tr.layers, box: tr.box, moment: D, grade, washes, res };
      }),
    // Recalculés à chaque minute, mais leur clé ne change qu'avec l'allumage des lampes (lavis) : pas de recuisson.
    [trees, lamps, base, minutes, daylight, dim, D, grade, res],
  );
  cacheMax = Math.max(CACHE_MIN, 2 * trees.length);
  const { sprites, lost } = useRueSprites(jobs);
  const ready = trees.every((_, i) => !!sprites[i] || lost[i]);
  useEffect(() => {
    onReady?.(ready);
  }, [ready, onReady]);
  // Dernier rendu, lu par la boucle (pas de nouvelle boucle à chaque cuisson).
  const spritesNow = useRef(sprites);
  spritesNow.current = sprites;

  const pits = useMemo(() => trees.map((tr) => tr.v), [trees]);
  // Particules et oiseau : couleurs passées dans l'étalonnage courant (comme fond-life.tsx), mémorisées par teinte.
  const graded = useMemo(() => {
    const g = gradeFor(daylight, twilight, gloom);
    const memo = new Map<string, string>();
    return (c: string): string => {
      let v = memo.get(c);
      if (v === undefined) memo.set(c, (v = gradeHex(c, g)));
      return v;
    };
  }, [daylight, twilight, gloom]);
  const dark = daylight < 0.45;
  // Météos successives (instant de changement) : chaque particule garde celle de sa naissance (rue-sprites.ts).
  const weathers = useRef<RueWeather[]>([]);
  // Instant depuis lequel l'oiseau reste à l'écart (nuit, forte pluie) : `undefined` avant la première image.
  const birdAwayRef = useRef<BirdAway | undefined>(undefined);
  const bare = useMemo(() => trees.map((tr) => foliageOf(D, 'rue' + Math.round(tr.v.x), tr.v.species).d <= 0.1), [trees, D]);
  const wind = useMemo(() => windOf(D.meteo, D.meteo.wind >= 0.8), [D]);
  // Par fosse : jeu de sprites dessiné (l'ancien reste tant que le nouveau n'est pas décodé) et début de son fondu d'entrée.
  const shownRef = useRef(new Map<string, { s: RueSprites; since: number }>());
  // Toile : échelle du tampon (0 = à recalculer) et signature de la dernière image dessinée (image identique : rien à faire).
  const surface = useRef<{ k: number; sig: number[]; fresh: boolean; frames: number; ctx: CanvasRenderingContext2D | null | undefined }>({ k: 0, sig: [], fresh: true, frames: 0, ctx: undefined });
  // Tampons réutilisés d'une image à l'autre : image en cours, images décodées et jeux dessinés par fosse.
  const work = useRef<{ F: number[]; imgs: (Partial<Record<RueLayerName, HTMLImageElement>> | undefined)[]; sets: (RueSprites | undefined)[] }>({ F: [], imgs: [], sets: [] });
  const ids = useMemo(() => trees.map((tr) => `${tr.v.x}|${tr.v.y}`), [trees]);
  const place = useMemo(() => {
    return (now: number): void => {
      // Mouvement réduit : pose nulle (vent calme), aucune particule, aucun oiseau, aucun fondu.
      const t = still ? 0 : at !== undefined ? at * 3600 : now;
      const w = still ? CALM : wind;
      const nowMs = Date.now();
      const sp = spritesNow.current;
      const shown = shownRef.current;
      const { F, imgs, sets } = work.current;
      F.length = 0;
      const sf = surface.current;
      if (COLORS.length > MAX_COLORS) {
        COLORS.length = 0;
        COLOR_IDS.clear();
        sf.fresh = true;
      }
      for (let i = 0; i < trees.length; i++) {
        const tr = trees[i]!;
        const id = ids[i]!;
        const cur = sp[i];
        const was = shown.get(id);
        if (cur && was?.s !== cur && decoded(cur)) shown.set(id, { s: cur, since: was ? was.since : still ? -Infinity : nowMs });
        const on = shown.get(id);
        imgs[i] = undefined;
        sets[i] = on?.s;
        if (!on) continue;
        // Fondu d'entrée (1 s, courbe CSS `ease`, sur l'arbre entier) : un arbre cuit après coup n'apparaît jamais sur place.
        const f = Math.max(0, Math.min(1, (nowMs - on.since) / 1000));
        const fade = f >= 1 ? 1 : rnd(cssEase(f), 3);
        if (fade <= 0) continue;
        imgs[i] = imagesOf(on.s);
        F.push(3, i, setId(on.s), fade, 0, 0, 0);
        const p = rueTreePose(tr.v, tr.m, t, w, plan.width);
        const sh = rnd(p.twigShear, 4);
        const off = bare[i];
        const hi = off ? 0 : rnd(p.hiAlpha);
        const pale = off ? 0 : rnd(p.paleAlpha);
        let k = 0;
        for (let li = 0; li < tr.layers.length; li++) {
          const l = tr.layers[li]!;
          let c = 0;
          let e = 0;
          let g = 0;
          let a = 1;
          if (l === 'twigs') ((c = sh), (e = rnd(-sh * tr.m.rootY)));
          else if (l === 'hi') ((a = hi), (e = rnd(p.hiDx)));
          else if (l === 'pale') ((a = pale), (e = rnd(p.paleDx)));
          else if (l[0] === 'c') {
            const mv = p.masses[k++];
            if (mv) ((e = rnd(mv.dx)), (g = rnd(mv.dy)));
          }
          if (a <= 0) continue;
          F.push(0, i, li, c, e, g, a);
        }
      }
      imgs.length = trees.length;
      sets.length = trees.length;
      // Particules : chaque genre a sa part du pool (plafonds RUE_CAP_OF). Mouvement réduit : rien du tout.
      const hist = weathers.current;
      if (!still) {
        const last = hist[hist.length - 1];
        if (!last) hist.push({ from: -Infinity, w, meteo: D.meteo });
        else if (last.w.wind !== w.wind || last.w.dir !== w.dir || last.w.wet !== w.wet || last.w.storm !== w.storm || last.meteo.precip !== D.meteo.precip || last.meteo.snow !== D.meteo.snow)
          hist.push({ from: t, w, meteo: D.meteo });
        // Au-delà de la vie la plus longue (≈ 2 min), les anciennes météos ne servent plus.
        while (hist.length > 1 && hist[1]!.from < t - 300) hist.shift();
      }
      if (!still)
        for (const p of rueParticles(pits, D, t, w, plan.width, hist)) {
          if (p.slot >= RUE_CAP_OF[p.kind]) continue;
          const alpha = rnd(PART_SHAPE[p.kind].op * p.alpha);
          if (alpha > 0) F.push(1, KIND_ID[p.kind], rnd(p.x), rnd(p.y), rnd(p.rot % 360, 0), colorId(graded(p.color)), alpha);
        }
      let b = null;
      if (!still) {
        birdAwayRef.current = nextBirdAway(birdAwayRef.current, birdAway(D, dark), t);
        b = rueBird(pits, D, t, plan.width, birdAwayRef.current?.since ?? null);
      }
      if (b) F.push(2, rnd(b.x), rnd(b.y), b.flying ? 1 : 0, rnd(b.flap), b.dir, 0);
      if (frameSink) frameSink(opsOf(F, trees, sets));
      const cv = canvas.current;
      if (!cv || JSDOM) return;
      // Relevé de la taille affichée : au premier dessin, après un redimensionnement, et toutes les RESIZE_EVERY images (zoom).
      if (sf.k === 0 || ++sf.frames % RESIZE_EVERY === 0) {
        const k = fitCanvas(cv, area);
        if (k !== sf.k) ((sf.k = k), (sf.fresh = true));
      }
      // Image identique à la précédente (vent calme, aucune particule) : la toile garde son dessin.
      if (!sf.fresh && sameFrame(F, sf.sig)) return;
      if (sf.ctx === undefined) {
        try {
          sf.ctx = cv.getContext('2d');
        } catch {
          sf.ctx = null;
        }
      }
      if (!sf.ctx) return;
      sf.fresh = false;
      // Échange des tampons : l'image dessinée devient la signature, l'ancienne signature servira à l'image suivante.
      work.current.F = sf.sig;
      sf.sig = F;
      paintFrame(sf.ctx, cv, sf.k, area, F, trees, imgs, sets);
    };
  }, [trees, ids, still, at, wind, bare, plan.width, pits, D, dark, graded, area]);
  // Nouvelle zone : tampon à refaire.
  useEffect(() => {
    surface.current.k = 0;
  }, [area]);
  // Fosses disparues (autre largeur de scène) : leurs jeux de sprites et images décodées ne sont plus retenus.
  useEffect(() => {
    const keep = new Set(ids);
    for (const id of [...shownRef.current.keys()]) if (!keep.has(id)) shownRef.current.delete(id);
  }, [ids]);
  // Mouvement réduit : aucune boucle ; une image à chaque cuisson, à chaque image décodée et à chaque redimensionnement.
  useWallClockLoop(place, [place], { frameMs: FRAME_MS, enabled: !still });
  useEffect(() => {
    if (still) place(0);
  }, [still, place, sprites]);
  useEffect(() => {
    const redraw = (): void => {
      if (still) place(0);
    };
    const resized = (): void => {
      surface.current.k = 0;
      redraw();
    };
    decodedListeners.add(redraw);
    window.addEventListener('resize', resized);
    const ro = typeof ResizeObserver === 'function' && canvas.current ? new ResizeObserver(resized) : null;
    if (ro && canvas.current) ro.observe(canvas.current);
    // Mouvement réduit (pas de boucle) : relevé de la taille affichée toutes les 2 s (zoom de la caméra), redessin s'il change.
    const zoom = still && !JSDOM ? window.setInterval(() => {
      const cv = canvas.current;
      if (cv && surface.current.k !== 0 && fitCanvas(cv, area) !== surface.current.k) resized();
    }, 2000) : 0;
    return () => {
      decodedListeners.delete(redraw);
      window.removeEventListener('resize', resized);
      ro?.disconnect();
      if (zoom) window.clearInterval(zoom);
    };
  }, [still, place, area]);

  // Une toile 2D dans le <svg> (foreignObject, comme la pluie de rain-canvas.tsx) : le vent n'écrit plus rien dans le SVG de la
  // scène. Chaque écriture d'attribut y coûtait une repeinture et une stratification (Layerize) de TOUTE la scène (≈ 4 000
  // éléments) : ≈ 40 ms par image à CPU ×4, donc saturé à 15 Hz. La toile, composée à part, se redessine seule (≈ 3 ms).
  // Les groupes `data-rue-arbre` (vides, rien n'y est peint) disent l'état de chaque fosse : image cuite (`data-rue-pret`),
  // cuisson abandonnée (`data-rue-echec`).
  return (
    <g data-arbres-rue="">
      {trees.map((tr, i) => (
        <g key={`${tr.v.x}|${tr.v.y}`} data-rue-arbre={i} data-rue-pret={sprites[i] ? '' : undefined} data-rue-echec={lost[i] && !sprites[i] ? '' : undefined} />
      ))}
      <foreignObject data-arbres-rue-toile="" x={area.x} y={area.y} width={area.w} height={area.h} style={{ pointerEvents: 'none' }}>
        <canvas ref={canvas} style={{ width: '100%', height: '100%', display: 'block' }} />
      </foreignObject>
    </g>
  );
}

// Sprites prêts par fosse (dans l'ordre des travaux) : cuits l'un après l'autre en temps mort ; une fosse dont la clé change
// garde son image précédente jusqu'à la nouvelle. `lost` : fosse sans image après RUE_BAKE_TRIES essais.
function useRueSprites(jobs: readonly RueBakeJob[]): { sprites: (RueSprites | undefined)[]; lost: boolean[] } {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  // Une image de sprite indécodable relance les cuissons (le jeu a été retiré du cache, l'essai compté).
  const [broken, setBroken] = useState(0);
  useEffect(() => {
    const on = (): void => setBroken((n) => n + 1);
    brokenListeners.add(on);
    return () => void brokenListeners.delete(on);
  }, []);
  const signature = jobs.map((j) => j.key).join('\n');
  useEffect(() => {
    const painter = override ?? canvasRueSpritePainter;
    let cancelled = false;
    const next = (): void => {
      if (cancelled) return;
      const job = jobs.find((j) => !cache.has(j.key) && (failed.get(j.key) ?? 0) < RUE_BAKE_TRIES);
      if (!job) return;
      // Le peintre réel attend lui-même ses créneaux de temps mort (une ou quelques couches par créneau).
      void painter(job)
        .catch(() => null)
        .then((s) => {
          if (s) {
            remember(job.key, s);
            failed.delete(job.key);
          } else {
            const n = (failed.get(job.key) ?? 0) + 1;
            failed.set(job.key, n);
            if (n >= RUE_BAKE_TRIES && !warned && !(typeof navigator !== 'undefined' && navigator.userAgent.includes('jsdom'))) {
              warned = true;
              console.warn('[arbres-rue] cuisson impossible après plusieurs essais :', job.key);
            }
          }
          if (!cancelled) {
            bump();
            next();
          }
        });
    };
    next();
    return () => {
      cancelled = true;
    };
    // La signature résume les travaux : mêmes clés, mêmes travaux.
  }, [signature, broken]); // eslint-disable-line react-hooks/exhaustive-deps
  const last = useRef<Map<string, RueSprites>>(new Map());
  // Fosses disparues (autre largeur de scène) : plus retenues.
  if (last.current.size > jobs.length) {
    const keep = new Set(jobs.map((j) => `${j.pit.x}|${j.pit.y}`));
    for (const id of [...last.current.keys()]) if (!keep.has(id)) last.current.delete(id);
  }
  const sprites = jobs.map((j) => {
    const id = `${j.pit.x}|${j.pit.y}`;
    const fresh = cache.get(j.key);
    if (fresh) {
      // Remonte l'image affichée en tête du cache (jamais libérée pendant qu'on la montre).
      cache.delete(j.key);
      cache.set(j.key, fresh);
      last.current.set(id, fresh);
      return fresh;
    }
    const prev = last.current.get(id);
    return prev && !BROKEN.has(prev) ? prev : undefined;
  });
  return { sprites, lost: jobs.map((j) => (failed.get(j.key) ?? 0) >= RUE_BAKE_TRIES) };
}
