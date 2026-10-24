import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { TILE, hillCanopyBox, tileCount } from '../core/library/paint/city-painter';
import type { CityPaintPlan } from '../core/library/paint/city-plan';
import type { FondMoment } from '../core/library/paint/fond-time';
import { windOf } from '../core/library/paint/fond-vent';
import { HILL_SLICE_ANDROID, HILL_SLICE_DESKTOP, hillSlices } from '../core/library/paint/hill-wind';
import { gradeKey, holdPaintedSources, paintedBroken, paintedContext, paintedHillSources } from './painted-canvas';
import { hillWindEnabled, type HillLayer, type PaintedTile } from './painted-city';
import { useWallClockLoop } from './use-wallclock-loop';

// Calque `colline-vent` de la ville peinte (PR 3b, notes de la maquette §3 c) : le feuillage des arbres de la colline ondule au
// vent, par bandes verticales, sans rien écrire dans le SVG de la scène. Les tranches sont alors peintes SANS les houppiers de
// la colline (painted-city.ts, partie 'base') et rendent, par groupe d'arbres (0 crête, 1 rang 0, 2 rang 1 + échappées), deux
// images rognées à la boîte des houppiers : le feuillage et l'écran (alpha de tout ce que la tranche peint APRÈS ce groupe :
// maisons des rangs suivants, mur du fond, immeubles, rue). Ici, UNE toile 2D dans un <foreignObject> (comme la toile des
// tranches, painted-canvas.tsx, et les arbres de la rue, street-trees.tsx), juste au-dessus de la toile des tranches.
// À 15 Hz (horloge murale), pour chaque groupe dans l'ordre de profondeur : la toile de travail est effacée ; le feuillage y est
// dessiné bande par bande (`hillSlices` : 96 px, 240 px sur Android), chaque bande rognée à [x0 − 6, x1 + 6] et déplacée par
// le vent local (translation `dx`, cisaillement `s` autour du pied du rang) ; puis les écrans du groupe en `destination-out`
// (une maison du rang 1 devant un arbre du rang 0 le reste quand il bouge) ; puis la toile de travail sur la toile visible.
// Les fûts, branches et maisons, dans la tranche, ne bougent jamais.
// Étalonnage jour/nuit : copies étalonnées aux pixels du cache de painted-canvas.tsx (même `gradeKey` que les tranches : le
// feuillage a exactement la teinte de la colline), les écrans décodés tels quels (seul l'alpha sert). Préparation (décodage,
// étalonnage) hors écran ; la toile n'est touchée qu'une fois TOUTES les couches prêtes (jamais une toile à moitié vide) ; les
// anciennes couches restent dessinées jusque-là. Rien n'est redessiné tant que toutes les bandes gardent `dx` et `s` au
// centième et que couches, étalonnage et échelle n'ont pas changé (vent calme : une seule image).
// `onReady(true)` quand les couches de la liste ont été dessinées une fois (la ville peinte attend ce signal : des tranches
// sans houppiers ne sont jamais montrées sans leur feuillage) ; ensuite le signal reste vrai pour ce plan (une nouvelle
// génération de couches remplace l'ancienne sans masquer la ville).
// Mouvement réduit ou sans canvas (`hillWindEnabled` faux) : aucun calque (null), les tranches sont complètes.
// Limite connue (comme la pluie et les arbres de la rue) : une copie `<use>` du calque (fenêtre soulevée) ne recopie pas une toile.
const FRAME_MS = 66;
// Débord de chaque bande sur ses voisines (px du monde) : un houppier coupé par une limite n'y laisse pas de fente.
const BAND_PAD = 6;
// Toile : au plus 2 px par unité du monde (résolution des tranches) et 2,5 Mpx (la toile de travail en coûte autant).
const MAX_UNIT_SCALE = 2;
const MAX_PIXELS = 2_500_000;
// Images de la boucle entre deux relevés de la taille affichée (le zoom de la caméra est une transformation : ni `resize` ni
// ResizeObserver), comme la pluie et les arbres de la rue.
const RESIZE_EVERY = 30;
const JSDOM = typeof navigator !== 'undefined' && navigator.userAgent.includes('jsdom');
const rnd = (v: number): number => Math.round(v * 100) / 100 || 0;
const NONE: readonly HillLayer[] = [];

type Area = { x: number; y: number; w: number; h: number };
// `id` : place de la couche (tranche, groupe) ; `from` : la couche publiée par painted-city.ts (son numéro signe la préparation).
type Layer = HillLayer & { id: string; from: HillLayer };
const LAYER_NOS = new WeakMap<HillLayer, number>();
let layerSeq = 0;
function layerNo(l: HillLayer): number {
  let n = LAYER_NOS.get(l);
  if (n === undefined) LAYER_NOS.set(l, (n = ++layerSeq));
  return n;
}
// Numéro d'un plan : la préparation, le dessin et le signal de prêt portent le plan pour lequel ils valent (après un changement
// de plan, cache chaud compris, rien de l'ancien plan n'est dessiné ni compté comme prêt).
const PLAN_NOS = new WeakMap<CityPaintPlan, number>();
let planSeq = 0;
function planNo(p: CityPaintPlan): number {
  let n = PLAN_NOS.get(p);
  if (n === undefined) PLAN_NOS.set(p, (n = ++planSeq));
  return n;
}
type Placed = { layer: Layer; canopy: CanvasImageSource; screen: CanvasImageSource | null };

// Une image redessinée de la boucle (bancs d'essai et tests) : bandes dessinées par groupe.
export type HillDraw = { group: 0 | 1 | 2; x0: number; x1: number; dx: number; s: number }[];
let frameSink: ((bands: HillDraw) => void) | null = null;
export function setHillFrameSinkForTests(sink: ((bands: HillDraw) => void) | null): void {
  frameSink = sink;
}

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

const sameNums = (a: readonly number[], b: readonly number[]): boolean => a.length === b.length && a.every((v, i) => v === b[i]);

type Props = {
  plan: CityPaintPlan;
  tiles: readonly PaintedTile[];
  moment: FondMoment;
  daylight: number;
  twilight: number;
  gloom: boolean;
  onReady?: (ready: boolean) => void;
};

// Tranches à donner au calque : pour chaque place, la tranche que la toile des tranches a DESSINÉE (`drawn` : urls posées, remontées
// par `PaintedCanvas.onDrawn`). Une tranche repeinte garde ses anciennes couches tant que sa nouvelle image (sans houppiers) n'est
// pas sur la toile : le nouveau feuillage n'apparaît jamais avant sa tranche. Une place jamais dessinée : sans image.
export function useTilesDrawn(tiles: readonly PaintedTile[], drawn: ReadonlySet<string>): PaintedTile[] {
  const held = useRef<PaintedTile[]>([]);
  return useMemo(() => {
    const out = tiles.map((t, i) => {
      if (t.url && drawn.has(t.url)) return t;
      const prev = held.current[i];
      return prev && prev.x === t.x && prev.url && drawn.has(prev.url) ? prev : { ...t, url: '', hill: NONE as HillLayer[] };
    });
    // Même liste qu'avant (mêmes tranches) : même référence.
    const same = out.length === held.current.length && out.every((t, i) => t === held.current[i] || (t.url === '' && held.current[i]?.url === '' && t.x === held.current[i]?.x));
    if (!same) held.current = out;
    return held.current;
  }, [tiles, drawn]);
}

export function HillWindLayer(props: Props): ReactElement | null {
  if (!hillWindEnabled()) return null;
  return <HillWindCanvas {...props} />;
}

function HillWindCanvas({ plan, tiles, moment, daylight, twilight, gloom, onReady }: Props): ReactElement {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  // Zone de la toile : toute la largeur, du haut au bas des boîtes de houppiers du plan (indépendantes du jour : la toile ne
  // bouge pas quand une saison ajoute ou retire des couches).
  const area = useMemo<Area>(() => {
    let y0 = Infinity;
    let y1 = -Infinity;
    for (let t = 0; t < tileCount(plan.width); t++)
      for (const g of [0, 1, 2] as const) {
        const b = hillCanopyBox(plan, t, g);
        if (b) ((y0 = Math.min(y0, b.y)), (y1 = Math.max(y1, b.y + b.h)));
      }
    if (y0 > y1) return { x: 0, y: 0, w: plan.width, h: 1 };
    // Pixels de la grille des tranches (les couches y sont calées) : une demi-unité de marge suffit.
    const y = Math.max(0, Math.floor(y0) - 1);
    return { x: 0, y, w: plan.width, h: Math.min(plan.height, Math.ceil(y1) + 1) - y };
  }, [plan]);
  // Couches des tranches affichées (celles de l'ancienne image tant qu'une tranche à repeindre la garde, painted-city.ts). Même
  // liste de tableaux (références du cache) : même liste de couches.
  const prevHills = useRef<{ arrays: readonly (readonly HillLayer[])[]; layers: Layer[] }>({ arrays: [], layers: [] });
  const arrays = tiles.map((t) => (t.url ? t.hill : NONE));
  if (arrays.length !== prevHills.current.arrays.length || arrays.some((a, i) => a !== prevHills.current.arrays[i])) {
    prevHills.current = { arrays, layers: arrays.flatMap((list, t) => list.map((l) => ({ ...l, id: `${Math.round(tiles[t]!.x / TILE)}|${l.group}`, from: l }))) };
  }
  const layers = prevHills.current.layers;
  const gk = gradeKey(daylight, twilight, gloom);
  const sig = `${planNo(plan)}#${gk.key}#${layers.map((l) => `${l.id}:${layerNo(l.from)}`).join('|')}`;
  const wind = useMemo(() => windOf(moment.meteo, moment.meteo.wind >= 0.8), [moment]);
  const slice = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent) ? HILL_SLICE_ANDROID : HILL_SLICE_DESKTOP;

  // Couches prêtes à dessiner (sources décodées et étalonnées) et version de cette préparation (signature du dessin).
  const shown = useRef<{ plan: CityPaintPlan | null; placed: Placed[]; version: number }>({ plan: null, placed: [], version: 0 });
  // Toile : échelle du tampon (0 = à relever), signature de la dernière image, images depuis le dernier relevé, contextes.
  const surface = useRef<{ k: number; sig: number[]; frames: number; ctx: CanvasRenderingContext2D | null | undefined; work: HTMLCanvasElement | null; wctx: CanvasRenderingContext2D | null }>({
    k: 0,
    sig: [],
    frames: 0,
    ctx: undefined,
    work: null,
    wctx: null,
  });
  const next = useRef<number[]>([]);
  const [prepared, setPrepared] = useState<{ plan: CityPaintPlan; count: number; grade: string; ids: ReadonlySet<string> } | null>(null);
  // Plan pour lequel le signal de prêt est acquis.
  const [readyFor, setReadyFor] = useState<CityPaintPlan | null>(null);

  // Une image de la boucle : bandes de chaque groupe qui a des couches ; redessin seulement si une valeur a changé.
  const place = useMemo(() => {
    return (now: number): boolean => {
      const { placed, version } = shown.current;
      const sf = surface.current;
      const cv = canvas.current;
      // Rien de préparé encore pour ce plan : la toile n'est pas touchée (jamais le feuillage d'un autre plan).
      if (!cv || version === 0) return false;
      if (shown.current.plan !== planNow.current || plan !== planNow.current) {
        // Feuillage d'un autre plan encore sur la toile : effacé une fois.
        if (sf.sig.length && sf.ctx) {
          sf.ctx.setTransform(1, 0, 0, 1, 0, 0);
          sf.ctx.clearRect(0, 0, cv.width, cv.height);
          sf.sig = [];
        }
        return false;
      }
      if (sf.ctx === undefined) sf.ctx = paintedContext(cv).ctx;
      // Relevé de la taille affichée : au premier dessin, après un redimensionnement, et toutes les RESIZE_EVERY images (zoom).
      if (!JSDOM && (sf.k === 0 || ++sf.frames % RESIZE_EVERY === 0)) sf.k = fitCanvas(cv, area);
      else if (sf.k === 0) sf.k = 1;
      const k = sf.k;
      const groups = [0, 1, 2].map((g) => placed.filter((p) => p.layer.group === g));
      const bands = groups.map((list, g) => (list.length ? hillSlices(plan, g as 0 | 1 | 2, slice, now, wind) : []));
      const F = next.current;
      F.length = 0;
      F.push(version, k);
      for (const list of bands) for (const b of list) F.push(rnd(b.dx), rnd(b.s));
      if (sameNums(F, sf.sig)) return true;
      const ctx = sf.ctx;
      if (!ctx) return false;
      if (!sf.work) {
        sf.work = document.createElement('canvas');
        sf.wctx = paintedContext(sf.work).ctx;
      }
      const work = sf.work;
      const wc = sf.wctx;
      if (!wc) return false;
      if (work.width !== cv.width) work.width = cv.width;
      if (work.height !== cv.height) work.height = cv.height;
      const ox = -area.x * k;
      const oy = -area.y * k;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, cv.width, cv.height);
      const drawn: HillDraw = [];
      groups.forEach((list, g) => {
        if (!list.length) return;
        wc.setTransform(1, 0, 0, 1, 0, 0);
        wc.globalAlpha = 1;
        wc.globalCompositeOperation = 'source-over';
        wc.clearRect(0, 0, work.width, work.height);
        for (const b of bands[g]!) {
          const bx0 = b.x0 - BAND_PAD;
          const bx1 = b.x1 + BAND_PAD;
          const hit = list.filter((p) => p.layer.box.x < bx1 && p.layer.box.x + p.layer.box.w > bx0);
          if (!hit.length) continue;
          const dx = rnd(b.dx);
          const s = rnd(b.s);
          drawn.push({ group: g as 0 | 1 | 2, x0: b.x0, x1: b.x1, dx, s });
          wc.save();
          // Rognage de la bande dans le repère du monde (sans cisaillement), puis repère du monde × (1, 0, s, 1, −s·pivot + dx, 0).
          wc.setTransform(k, 0, 0, k, ox, oy);
          wc.beginPath();
          wc.rect(bx0, area.y, bx1 - bx0, area.h);
          wc.clip();
          wc.setTransform(k, 0, k * s, k, ox + k * (dx - s * b.pivot), oy);
          for (const p of hit) wc.drawImage(p.canopy, p.layer.box.x, p.layer.box.y, p.layer.box.w, p.layer.box.h);
          wc.restore();
        }
        // Écrans du groupe, immobiles : ce que la tranche peint devant ce feuillage le recouvre toujours.
        wc.setTransform(k, 0, 0, k, ox, oy);
        wc.globalCompositeOperation = 'destination-out';
        for (const p of list) if (p.screen) wc.drawImage(p.screen, p.layer.box.x, p.layer.box.y, p.layer.box.w, p.layer.box.h);
        wc.globalCompositeOperation = 'source-over';
        wc.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(work, 0, 0);
      });
      // Échange des tampons : l'image dessinée devient la signature.
      next.current = sf.sig;
      sf.sig = F;
      frameSink?.(drawn);
      return true;
    };
  }, [plan, area, slice, wind]);
  const placeNow = useRef(place);
  // Plan du dernier rendu : une image de boucle en retard (ancienne fermeture) ne dessine jamais un autre plan.
  const planNow = useRef(plan);
  planNow.current = plan;
  placeNow.current = place;

  // Préparation hors écran de toutes les couches (feuillage étalonné, écran tel quel), puis dessin d'un coup.
  const want = useRef({ plan, layers, grade: gk.grade, key: gk.key });
  want.current = { plan, layers, grade: gk.grade, key: gk.key };
  useEffect(() => {
    const { plan: forPlan, layers: list, grade, key } = want.current;
    let cancelled = false;
    void (async () => {
      // Deux sources par couche (feuillage étalonné, écran tel quel) ; une url vide n'est pas demandée.
      const items = list.flatMap((l) => [
        { url: l.canopy, grade, key },
        { url: l.screen, grade: null, key: '' },
      ]);
      const asked = items.filter((it) => it.url !== '');
      const ready = await paintedHillSources(asked);
      if (cancelled) return;
      let n = 0;
      const got = items.map((it) => (it.url !== '' ? (ready[n++] ?? null) : null));
      const before = shown.current.placed;
      // Repli sur l'ancienne couche de la même place : seulement dans le même plan.
      const old = new Map(shown.current.plan === forPlan ? before.map((p) => [p.layer.id, p]) : []);
      const placed: Placed[] = [];
      const ids = new Set<string>();
      list.forEach((layer, i) => {
        const canopy = layer.canopy ? got[2 * i] : null;
        const screen = layer.screen ? got[2 * i + 1] : null;
        const prev = old.get(layer.id);
        // Feuillage indisponible : l'ancien de la même place reste (s'il y en a un) ; abandonné sans ancien, la place compte
        // comme réglée (sinon la ville resterait masquée). Écran indisponible : l'ancien écran, sinon le feuillage sans écran.
        if (canopy) placed.push({ layer, canopy, screen: screen ?? (layer.screen && prev?.screen ? prev.screen : null) });
        else if (prev) placed.push(prev);
        if (canopy || prev || paintedBroken(layer.canopy)) ids.add(layer.id);
      });
      const sources = (ps: readonly Placed[]): CanvasImageSource[] => ps.flatMap((p) => (p.screen ? [p.canopy, p.screen] : [p.canopy]));
      holdPaintedSources(sources(placed), 1);
      holdPaintedSources(sources(before), -1);
      shown.current = { plan: forPlan, placed, version: shown.current.version + 1 };
      // Dessin tout de suite (sans attendre l'image suivante de la boucle). Vraie toile sans contexte 2D : rien n'est noté comme
      // dessiné (la ville ne serait jamais montrée sans son feuillage) ; le prochain changement réessaie.
      const cv = canvas.current;
      const drawable = cv ? paintedContext(cv).drawable : false;
      const ok = placeNow.current(Date.now() / 1000);
      if (drawable && !ok) return;
      setPrepared({ plan: forPlan, count: placed.length, grade: key, ids });
    })();
    return () => {
      cancelled = true;
    };
  }, [sig]);
  const ready = useMemo(() => prepared !== null && prepared.plan === plan && layers.every((l) => prepared.ids.has(l.id)), [prepared, plan, layers]);
  // Le signal ne reste acquis qu'une fois TOUTES les tranches peintes et leurs couches dessinées (une tranche peinte après coup
  // apporte des couches que la ville doit attendre).
  const complete = tiles.length > 0 && tiles.every((t) => t.url !== '');
  useEffect(() => {
    if (ready && complete) setReadyFor(plan);
  }, [ready, complete, plan]);
  const readyOnce = readyFor === plan;
  useEffect(() => {
    onReady?.(ready || readyOnce);
  }, [ready, readyOnce, onReady]);

  // Boucle de l'horloge murale (15 images/s).
  useWallClockLoop((now) => void place(now), [place], { frameMs: FRAME_MS });
  // Nouvelle zone ou redimensionnement : tampon à refaire.
  useEffect(() => {
    surface.current.k = 0;
    surface.current.sig = [];
    const resized = (): void => {
      surface.current.k = 0;
      surface.current.sig = [];
    };
    window.addEventListener('resize', resized);
    const ro = typeof ResizeObserver === 'function' && canvas.current ? new ResizeObserver(resized) : null;
    if (ro && canvas.current) ro.observe(canvas.current);
    return () => {
      window.removeEventListener('resize', resized);
      ro?.disconnect();
    };
  }, [area]);
  // Démontage : tampons de la toile et de la toile de travail rendus tout de suite (WebView : mémoire), couches libérées.
  // (La toile est lue au montage : React vide la référence avant le nettoyage.)
  useEffect(() => {
    const cv = canvas.current;
    const sf = surface.current;
    return () => {
      if (cv) ((cv.width = 0), (cv.height = 0));
      if (sf.work) ((sf.work.width = 0), (sf.work.height = 0));
      sf.work = null;
      sf.wctx = null;
      sf.ctx = undefined;
      const ps = shown.current.placed;
      holdPaintedSources(ps.flatMap((p) => (p.screen ? [p.canopy, p.screen] : [p.canopy])), -1);
      shown.current = { plan: null, placed: [], version: shown.current.version + 1 };
    };
  }, []);
  // Une toile 2D dans le <svg> : le vent n'écrit rien dans le SVG de la scène (attributs posés seulement à la préparation).
  return (
    <foreignObject
      data-colline-vent=""
      data-couches={prepared ? prepared.count : 0}
      data-grade={prepared ? prepared.grade : ''}
      x={area.x}
      y={area.y}
      width={area.w}
      height={area.h}
      style={{ pointerEvents: 'none' }}
    >
      <canvas ref={canvas} style={{ width: '100%', height: '100%', display: 'block' }} />
    </foreignObject>
  );
}
