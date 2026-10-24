import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { hillCanopyBox, tileCount } from '../core/library/paint/city-painter';
import type { CityPaintPlan } from '../core/library/paint/city-plan';
import type { FondMoment } from '../core/library/paint/fond-time';
import { windOf, type Wind } from '../core/library/paint/fond-vent';
import type { Grade } from '../core/library/paint/grade';
import { HILL_SLICE_ANDROID, HILL_SLICE_DESKTOP, hillSlicesInto, type SliceMove } from '../core/library/paint/hill-wind';
import { gradeSigOf, holdPaintedSources, paintedContext, paintedHillSources, type CanvasImage } from './painted-canvas';
import { useHillTiles, type HillLayer, type HillTile, type PaintedTile } from './painted-city';
import { useWallClockLoop } from './use-wallclock-loop';

// Calque `colline-vent` de la ville peinte (PR 3b, notes de la maquette §3 c) : le feuillage des arbres de la colline ondule au
// vent, par bandes verticales, sans rien écrire dans le SVG de la scène.
// Démarrage (aussi rapide qu'avant la PR) : la ville se montre avec ses tranches complètes ('all', feuillage immobile peint
// dedans). Une fois les arbres de la rue cuits, les tranches sont repeintes en parties en arrière-plan (painted-city.ts,
// `useHillTiles` : tranche 'base' sans houppiers, et par groupe d'arbres — 0 crête, 1 rang 0, 2 rang 1 + échappées — le
// feuillage et l'écran, rognés aux houppiers). Ce calque prépare hors écran les couches de chaque tranche prête (décodage,
// copie étalonnée) puis l'annonce (`onPrepared`) ; alors seulement la tranche passe de 'all' à 'base' sur la toile des
// tranches, et son feuillage est posé ICI dans la même tâche que le dessin de la tranche (`PaintedCanvas.onDrawn` → `sync`),
// au repos (amplitude 0), puis le vent monte de 0 à 1 en 2 s : aucun changement visible, jamais une 'base' sans feuillage.
// Feuillage dessiné = celui des tranches 'base' que la toile des tranches a EFFECTIVEMENT dessinées, à l'étalonnage qu'elle a
// dessiné : une tranche repeinte (date, neige) ou un nouvel arrondi d'étalonnage (crépuscule) change de feuillage dans la même
// image que la tranche. Pour cela la toile des tranches suit l'étalonnage de la dernière préparation du calque (préparée
// avant elle, petites images) : les deux teintes changent ensemble. Les préparations récentes restent en mémoire (au plus 3,
// plus celles encore dessinées) le temps que la toile des tranches suive.
// Ici, UNE toile 2D dans un <foreignObject> (comme la toile des tranches, painted-canvas.tsx, et les arbres de la rue,
// street-trees.tsx), juste au-dessus de la toile des tranches. À 15 Hz (horloge murale), pour chaque groupe dans l'ordre de
// profondeur, sur les seules lignes du groupe : la toile de travail est effacée ; le feuillage y est dessiné bande par bande
// (`hillSlices` : 96 px, 240 px sur Android), chaque bande rognée à [x0 − 2, x1 + 2] et déplacée par le vent local
// (translation `dx`, cisaillement `s` autour du pied du rang) ; puis les écrans du groupe en `destination-out` (une maison du
// rang 1 devant un arbre du rang 0 le reste quand il bouge) ; puis ces lignes de la toile de travail sur la toile visible.
// Fûts, branches et maisons, dans la tranche, ne bougent jamais. `dx` est arrondi au quart de pixel affiché et `s` à ce que
// fait un quart de pixel en haut ou en bas des houppiers : rien n'est redessiné pour un changement invisible (vent calme :
// une seule image). Changement de météo : fondu de 3 s entre l'ancien et le nouveau vent (jamais de saut).
// Mouvement réduit (`prefers-reduced-motion`, `still=1` du banc) ou sans canvas : aucune couche, tranches complètes ; s'il
// change en cours de route, les tranches complètes reviennent d'abord, le calque se retire ensuite (feuillage figé entre-temps).
// Limite connue (comme la pluie et les arbres de la rue) : une copie `<use>` du calque (fenêtre soulevée) ne recopie pas une toile.
const FRAME_MS = 66;
// Débord de chaque bande sur ses voisines (px du monde) : un houppier coupé par une limite n'y laisse pas de fente.
const BAND_PAD = 2;
// Toile : au plus 2 px par unité du monde (résolution des tranches) et 2,5 Mpx (la toile de travail en coûte autant).
const MAX_UNIT_SCALE = 2;
const MAX_PIXELS = 2_500_000;
// Images de la boucle entre deux relevés de la taille affichée (le zoom de la caméra est une transformation : ni `resize` ni
// ResizeObserver), comme la pluie et les arbres de la rue.
const RESIZE_EVERY = 30;
// Montée du vent après le passage d'une tranche en 'base', et fondu entre deux vents (ms).
export const HILL_RAMP_MS = 2000;
export const HILL_BLEND_MS = 3000;
// Préparations gardées (en plus de celles encore dessinées).
const HISTORY = 3;
const JSDOM = typeof navigator !== 'undefined' && navigator.userAgent.includes('jsdom');
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const smooth = (u: number): number => u * u * (3 - 2 * u);

type Area = { x: number; y: number; w: number; h: number };
type Source = CanvasImageSource;

// Canal entre la toile des tranches et ce calque : dernier dessin (urls, signature d'étalonnage), relu au montage, et
// l'abonné qui pose le feuillage dans la même tâche.
export type HillSync = { last: { urls: readonly string[]; gradeSig: string } | null; drawn: (() => void) | null };
// Tranche candidate : sa 'base' prête et ses couches.
export type HillCandidate = { tile: number; base: string; hill: readonly HillLayer[]; from: HillTile };
// Préparation annoncée : étalonnage et tranches 'base' dont toutes les couches sont prêtes à dessiner.
export type HillPrepared = { plan: CityPaintPlan; gradeSig: string; grade: Grade | null; bases: ReadonlySet<string> };

// Une image redessinée de la boucle (bancs d'essai et tests) : une entrée par (bande, couche) dessinée, déplacement effectif.
export type HillDraw = { group: 0 | 1 | 2; x0: number; x1: number; base: string; dx: number; s: number }[];
let frameSink: ((draws: HillDraw) => void) | null = null;
export function setHillFrameSinkForTests(sink: ((draws: HillDraw) => void) | null): void {
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

const sameNums = (a: readonly number[], b: readonly number[]): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};
const sameWind = (a: Wind, b: Wind): boolean => a.wind === b.wind && a.dir === b.dir && a.wet === b.wet && a.storm === b.storm;

// Numéros d'objets (signature de préparation).
const NOS = new WeakMap<object, number>();
let seq = 0;
const no = (o: object): number => {
  let n = NOS.get(o);
  if (n === undefined) NOS.set(o, (n = ++seq));
  return n;
};

// Couche prête à dessiner.
type PLayer = { group: 0 | 1 | 2; box: HillLayer['box']; canopy: Source; screen: Source | null; base: string };
type Prep = { plan: CityPaintPlan; gradeSig: string; byBase: Map<string, PLayer[]>; sources: Source[] };

type Props = {
  plan: CityPaintPlan;
  candidates: readonly HillCandidate[];
  moment: FondMoment;
  // Étalonnage voulu (celui de l'heure) : la préparation suivante le prend.
  grade: Grade | null;
  // Feuillage figé (amplitude 0), aucune boucle : sortie du mode vent.
  still: boolean;
  onPrepared: (p: HillPrepared) => void;
  sync: HillSync;
};

export function HillWindLayer({ plan, candidates, moment, grade, still, onPrepared, sync }: Props): ReactElement {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  // Zone de la toile : toute la largeur, du haut au bas des boîtes de houppiers du plan (indépendantes du jour).
  const area = useMemo<Area>(() => {
    let y0 = Infinity;
    let y1 = -Infinity;
    for (let t = 0; t < tileCount(plan.width); t++)
      for (const g of [0, 1, 2] as const) {
        const b = hillCanopyBox(plan, t, g);
        if (b) ((y0 = Math.min(y0, b.y)), (y1 = Math.max(y1, b.y + b.h)));
      }
    if (y0 > y1) return { x: 0, y: 0, w: plan.width, h: 1 };
    const y = Math.max(0, Math.floor(y0) - 1);
    return { x: 0, y, w: plan.width, h: Math.min(plan.height, Math.ceil(y1) + 1) - y };
  }, [plan]);
  const gradeSig = gradeSigOf(grade);
  const sig = `${no(plan)}#${gradeSig}#${candidates.map((c) => `${c.tile}:${no(c.from)}`).join('|')}`;
  const wind = useMemo(() => windOf(moment.meteo, moment.meteo.wind >= 0.8), [moment]);
  const slice = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent) ? HILL_SLICE_ANDROID : HILL_SLICE_DESKTOP;

  // Préparations (la plus récente en dernier) et couches dessinées par groupe, avec l'instant d'entrée de chaque tranche.
  const preps = useRef<Prep[]>([]);
  const active = useRef<{ layers: PLayer[][]; ranges: number[]; since: Map<string, number>; count: number; used: Set<Prep> }>({
    layers: [[], [], []],
    ranges: [0, 0, 0, 0, 0, 0],
    since: new Map(),
    count: 0,
    used: new Set(),
  });
  // Vent : fondu de l'ancien au nouveau.
  const windNow = useRef<{ from: Wind; to: Wind; since: number }>({ from: wind, to: wind, since: -Infinity });
  // Toile : échelle (0 = à relever), signature de la dernière image, images depuis le relevé, effacement complet à faire,
  // contextes ; tampons réutilisés de la boucle (aucune allocation par image).
  const surface = useRef({
    k: 0,
    sig: [] as number[],
    next: [] as number[],
    frames: 0,
    full: true,
    painted: false,
    ctx: undefined as CanvasRenderingContext2D | null | undefined,
    work: null as HTMLCanvasElement | null,
    wctx: null as CanvasRenderingContext2D | null,
    to: [[], [], []] as SliceMove[][],
    from: [[], [], []] as SliceMove[][],
    qd: [[], [], []] as number[][],
    qs: [[], [], []] as number[][],
    dm: [[], [], []] as number[][],
    amp: new Map<string, number>(),
  });
  const [prepared, setPrepared] = useState<{ count: number; grade: string } | null>(null);
  const planNow = useRef(plan);
  planNow.current = plan;

  // Couches à dessiner : celles des tranches 'base' que la toile des tranches a dessinées (préparation au même étalonnage d'abord).
  // Seules les urls dessinées comptent, pas le plan : après un changement de plan, la toile des tranches montre ses anciennes
  // tranches jusqu'au décodage des nouvelles, et leur feuillage reste avec elles (jamais une 'base' sans feuillage).
  const resolve = useCallback((nowMs: number): void => {
    const a = active.current;
    for (const l of a.layers) l.length = 0;
    a.used.clear();
    a.count = 0;
    const last = sync.last;
    const seen = new Set<string>();
    if (last)
      for (const url of last.urls) {
        let hit: Prep | undefined;
        for (let i = preps.current.length - 1; i >= 0 && !hit; i--) {
          const p = preps.current[i]!;
          if (p.gradeSig === last.gradeSig && p.byBase.has(url)) hit = p;
        }
        for (let i = preps.current.length - 1; i >= 0 && !hit; i--) {
          const p = preps.current[i]!;
          if (p.byBase.has(url)) hit = p;
        }
        if (!hit) continue;
        a.used.add(hit);
        seen.add(url);
        for (const l of hit.byBase.get(url)!) {
          a.layers[l.group]!.push(l);
          a.count++;
        }
        if (!a.since.has(url)) a.since.set(url, nowMs);
      }
    for (const u of [...a.since.keys()]) if (!seen.has(u)) a.since.delete(u);
    a.layers.forEach((list, g) => {
      let y0 = Infinity;
      let y1 = -Infinity;
      for (const l of list) ((y0 = Math.min(y0, l.box.y)), (y1 = Math.max(y1, l.box.y + l.box.h)));
      a.ranges[2 * g] = y0;
      a.ranges[2 * g + 1] = y1;
    });
    surface.current.full = true;
  }, [sync]);

  // Une image de la boucle.
  const place = useMemo(() => {
    return (nowS: number): void => {
      const sf = surface.current;
      const cv = canvas.current;
      if (!cv) return;
      if (sf.ctx === undefined) sf.ctx = paintedContext(cv).ctx;
      const ctx = sf.ctx;
      const a = active.current;
      // Plan d'un autre rendu (image de boucle en retard) : rien.
      if (plan !== planNow.current) return;
      if (!JSDOM && (sf.k === 0 || ++sf.frames % RESIZE_EVERY === 0)) {
        const k = fitCanvas(cv, area);
        if (k !== sf.k) ((sf.k = k), (sf.full = true));
      } else if (sf.k === 0) sf.k = 1;
      const k = sf.k;
      if (a.count === 0) {
        // Plus rien à dessiner : la toile est vidée une fois.
        if (sf.painted && ctx) {
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.clearRect(0, 0, cv.width, cv.height);
          sf.painted = false;
          sf.sig.length = 0;
          frameSink?.([]);
        }
        return;
      }
      const nowMs = nowS * 1000;
      const W = windNow.current;
      const u = still ? 1 : clamp01((nowMs - W.since) / HILL_BLEND_MS);
      const q = 1 / (4 * k);
      const F = sf.next;
      F.length = 0;
      F.push(k);
      for (let g = 0; g < 3; g++) {
        if (!a.layers[g]!.length) continue;
        const to = hillSlicesInto(sf.to[g]!, plan, g as 0 | 1 | 2, slice, nowS, W.to);
        const from = u < 1 ? hillSlicesInto(sf.from[g]!, plan, g as 0 | 1 | 2, slice, nowS, W.from) : to;
        const yA = a.ranges[2 * g]!;
        const yB = a.ranges[2 * g + 1]!;
        const qd = sf.qd[g]!;
        const qs = sf.qs[g]!;
        const dm = sf.dm[g]!;
        qd.length = qs.length = dm.length = to.length;
        for (let i = 0; i < to.length; i++) {
          const b = to[i]!;
          const f = from[i]!;
          const dx = f.dx + (b.dx - f.dx) * u;
          const s = f.s + (b.s - f.s) * u;
          // Plus grand écart au pivot sur la hauteur des houppiers : un pas de `s` y vaut un quart de pixel.
          const d = Math.max(1, Math.abs(yA - b.pivot), Math.abs(yB - b.pivot));
          dm[i] = d;
          qd[i] = Math.round(dx / q) || 0;
          qs[i] = Math.round((s * d) / q) || 0;
          F.push(qd[i]!, qs[i]!);
        }
      }
      // Montée du vent par tranche entrée en 'base' (au quarantième).
      for (const [url, since] of a.since) {
        const amp = still ? 0 : Math.round(smooth(clamp01((nowMs - since) / HILL_RAMP_MS)) * 40) / 40;
        sf.amp.set(url, amp);
        F.push(amp);
      }
      if (!sf.full && sameNums(F, sf.sig)) return;
      if (!ctx) return;
      if (!sf.work) {
        sf.work = document.createElement('canvas');
        sf.wctx = paintedContext(sf.work).ctx;
      }
      const work = sf.work;
      const wc = sf.wctx;
      if (!wc) return;
      if (work.width !== cv.width) work.width = cv.width;
      if (work.height !== cv.height) work.height = cv.height;
      const ox = -area.x * k;
      const oy = -area.y * k;
      const rows = (g: number): [number, number] => {
        const y0 = Math.max(0, Math.floor((a.ranges[2 * g]! - area.y) * k) - 2);
        const y1 = Math.min(cv.height, Math.ceil((a.ranges[2 * g + 1]! - area.y) * k) + 2);
        return [y0, Math.max(0, y1 - y0)];
      };
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      if (sf.full) ctx.clearRect(0, 0, cv.width, cv.height);
      else
        for (let g = 0; g < 3; g++) {
          if (!a.layers[g]!.length) continue;
          const [y0, h] = rows(g);
          ctx.clearRect(0, y0, cv.width, h);
        }
      const draws: HillDraw | null = frameSink ? [] : null;
      for (let g = 0; g < 3; g++) {
        const list = a.layers[g]!;
        if (!list.length) continue;
        const [py0, ph] = rows(g);
        if (ph <= 0) continue;
        const yA = a.ranges[2 * g]!;
        const yB = a.ranges[2 * g + 1]!;
        wc.setTransform(1, 0, 0, 1, 0, 0);
        wc.globalAlpha = 1;
        wc.globalCompositeOperation = 'source-over';
        wc.clearRect(0, py0, work.width, ph);
        const bands = sf.to[g]!;
        for (let i = 0; i < bands.length; i++) {
          const b = bands[i]!;
          const bx0 = b.x0 - BAND_PAD;
          const bx1 = b.x1 + BAND_PAD;
          let open = false;
          for (const l of list) {
            if (l.box.x >= bx1 || l.box.x + l.box.w <= bx0) continue;
            if (!open) {
              wc.save();
              // Rognage de la bande dans le repère du monde (sans cisaillement), aux lignes du groupe.
              wc.setTransform(k, 0, 0, k, ox, oy);
              wc.beginPath();
              wc.rect(bx0, yA - 1, bx1 - bx0, yB - yA + 2);
              wc.clip();
              open = true;
            }
            const amp = sf.amp.get(l.base) ?? 0;
            const dx = sf.qd[g]![i]! * q * amp;
            const s = ((sf.qs[g]![i]! * q) / sf.dm[g]![i]!) * amp;
            // Repère du monde × (1, 0, s, 1, −s·pivot + dx, 0).
            wc.setTransform(k, 0, k * s, k, ox + k * (dx - s * b.pivot), oy);
            wc.drawImage(l.canopy, l.box.x, l.box.y, l.box.w, l.box.h);
            draws?.push({ group: g as 0 | 1 | 2, x0: b.x0, x1: b.x1, base: l.base, dx, s });
          }
          if (open) wc.restore();
        }
        // Écrans du groupe, immobiles : ce que la tranche peint devant ce feuillage le recouvre toujours.
        wc.setTransform(k, 0, 0, k, ox, oy);
        wc.globalCompositeOperation = 'destination-out';
        for (const l of list) if (l.screen) wc.drawImage(l.screen, l.box.x, l.box.y, l.box.w, l.box.h);
        wc.globalCompositeOperation = 'source-over';
        wc.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(work, 0, py0, work.width, ph, 0, py0, work.width, ph);
      }
      sf.full = false;
      sf.painted = true;
      // Échange des tampons : l'image dessinée devient la signature.
      sf.next = sf.sig;
      sf.sig = F;
      if (draws) frameSink!(draws);
    };
  }, [plan, area, slice, still]);
  const placeNow = useRef(place);
  placeNow.current = place;

  // Changement de météo : fondu entre l'ancien et le nouveau vent (même vent : rien).
  useEffect(() => {
    const W = windNow.current;
    if (sameWind(W.to, wind)) return;
    windNow.current = { from: W.to, to: wind, since: Date.now() };
  }, [wind]);

  // Abonnement au dessin de la toile des tranches : le feuillage suit dans la même tâche.
  useEffect(() => {
    const on = (): void => {
      resolve(Date.now());
      placeNow.current(Date.now() / 1000);
    };
    sync.drawn = on;
    on();
    return () => {
      if (sync.drawn === on) sync.drawn = null;
    };
  }, [sync, resolve]);

  // Préparation hors écran des couches de toutes les candidates (feuillage étalonné, écran tel quel), puis annonce.
  const want = useRef({ plan, candidates, grade, gradeSig });
  want.current = { plan, candidates, grade, gradeSig };
  const announce = useRef(onPrepared);
  announce.current = onPrepared;
  useEffect(() => {
    const { plan: forPlan, candidates: list, grade: g, gradeSig: gs } = want.current;
    let cancelled = false;
    void (async () => {
      const items = list.flatMap((c) =>
        c.hill.flatMap((l) => [
          { url: l.canopy, grade: g, key: gs },
          { url: l.screen, grade: null, key: '' },
        ]),
      );
      const asked = items.filter((it) => it.url !== '');
      const got = await paintedHillSources(asked);
      if (cancelled) return;
      let n = 0;
      const srcs = items.map((it) => (it.url !== '' ? (got[n++] ?? null) : null));
      // Sans toile 2D (contexte refusé) : aucune tranche annoncée, toutes restent complètes.
      const cv = canvas.current;
      const c2d = cv ? paintedContext(cv) : { ctx: null, drawable: true };
      const drawable = !c2d.drawable || !!c2d.ctx;
      const byBase = new Map<string, PLayer[]>();
      const sources: Source[] = [];
      let i = 0;
      for (const c of list) {
        const layers: PLayer[] = [];
        let ok = true;
        for (const l of c.hill) {
          const canopy = srcs[i++];
          const screen = srcs[i++];
          // Une couche manque (indécodable) : la tranche entière reste complète.
          if (!canopy || (l.screen && !screen)) ok = false;
          else layers.push({ group: l.group, box: l.box, canopy, screen: screen ?? null, base: c.base });
        }
        if (!ok || !drawable) continue;
        byBase.set(c.base, layers);
        for (const l of layers) sources.push(...(l.screen ? [l.canopy, l.screen] : [l.canopy]));
      }
      const prep: Prep = { plan: forPlan, gradeSig: gs, byBase, sources };
      holdPaintedSources(sources, 1);
      preps.current.push(prep);
      // Au plus HISTORY préparations, plus celles encore dessinées.
      resolve(Date.now());
      while (preps.current.length > HISTORY) {
        const idx = preps.current.findIndex((p) => !active.current.used.has(p));
        if (idx < 0 || idx >= preps.current.length - 1) break;
        const [old] = preps.current.splice(idx, 1);
        holdPaintedSources(old!.sources, -1);
      }
      placeNow.current(Date.now() / 1000);
      setPrepared({ count: byBase.size, grade: gs });
      announce.current({ plan: forPlan, gradeSig: gs, grade: g, bases: new Set(byBase.keys()) });
    })();
    return () => {
      cancelled = true;
    };
  }, [sig, resolve]);

  // Boucle de l'horloge murale (15 images/s) ; feuillage figé : aucune boucle (une image à chaque changement).
  useWallClockLoop(place, [place], { frameMs: FRAME_MS, enabled: !still });
  useEffect(() => {
    if (still) {
      surface.current.full = true;
      place(Date.now() / 1000);
    }
  }, [still, place]);
  // Nouvelle zone ou redimensionnement : tampon à refaire.
  useEffect(() => {
    surface.current.k = 0;
    surface.current.full = true;
    const resized = (): void => {
      surface.current.k = 0;
      surface.current.full = true;
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
      for (const p of preps.current) holdPaintedSources(p.sources, -1);
      preps.current = [];
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

// Branchement dans la scène de la ville (scene-city.tsx) : quelles images la toile des tranches dessine (complète, ou 'base'
// une fois ses couches annoncées par le calque), à quel étalonnage, et les réglages du calque (null : pas de calque).
// `start` : les tranches complètes sont peintes et les arbres de la rue cuits (la colline ne leur prend jamais leur place).
// Par place, l'image montrée : la 'base' courante si annoncée ; sinon l'ancienne 'base' encore annoncée (une tranche repeinte
// garde ses anciennes images jusqu'aux nouvelles) ; sinon la complète ; sinon l'image précédente.
type ShownTile = { url: string; base: boolean };
export function useHillCity({
  plan,
  moment,
  tiles,
  height,
  grade,
  enabled,
  start,
}: {
  plan: CityPaintPlan | null;
  moment: FondMoment;
  tiles: readonly PaintedTile[];
  height: number;
  grade: Grade | null;
  enabled: boolean;
  start: boolean;
}): { images: CanvasImage[]; grade: Grade | null; onDrawn: (urls: readonly string[], gradeSig: string) => void; layer: Props | null } {
  const hillTiles = useHillTiles(plan, moment, enabled && start);
  const candidates = useMemo<HillCandidate[]>(
    () => hillTiles.flatMap((h, tile) => (h ? [{ tile, base: h.url, hill: h.hill, from: h }] : [])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hillTiles.map((h) => (h ? no(h) : 0)).join(',')],
  );
  const [prepared, setPrepared] = useState<HillPrepared | null>(null);
  const sync = useRef<HillSync>({ last: null, drawn: null }).current;
  const [baseDrawn, setBaseDrawn] = useState(false);
  const shown = useRef<{ plan: CityPaintPlan | null; tiles: ShownTile[] }>({ plan: null, tiles: [] });
  if (shown.current.plan !== plan) shown.current = { plan, tiles: [] };
  const prep = enabled && prepared && prepared.plan === plan ? prepared : null;
  const chosen = tiles.map((t, i): ShownTile => {
    const prev = shown.current.tiles[i];
    const h = hillTiles[i];
    if (prep && h && prep.bases.has(h.url)) return h.url === prev?.url ? prev : { url: h.url, base: true };
    if (prep && prev?.base && prep.bases.has(prev.url)) return prev;
    if (t.url) return t.url === prev?.url ? prev : { url: t.url, base: false };
    return prev && (!prev.base || prep?.bases.has(prev.url)) ? prev : { url: '', base: false };
  });
  shown.current.tiles = chosen;
  // Tranches 'base' connues (montrées ou dessinées) : dit si la toile des tranches en dessine encore une.
  const bases = useRef(new Set<string>());
  for (const c of chosen) if (c.base) bases.current.add(c.url);
  const imagesSig = tiles.map((t, i) => `${t.x},${t.w},${chosen[i]!.url}`).join('|');
  const images = useMemo<CanvasImage[]>(
    () => tiles.flatMap((t, i) => (chosen[i]!.url ? [{ x: t.x, y: 0, w: t.w, h: height, url: chosen[i]!.url }] : [])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [imagesSig, height],
  );
  const onDrawn = useCallback(
    (urls: readonly string[], gradeSig: string) => {
      sync.last = { urls, gradeSig };
      sync.drawn?.();
      const keep = new Set(urls);
      for (const c of shown.current.tiles) keep.add(c.url);
      for (const u of [...bases.current]) if (!keep.has(u)) bases.current.delete(u);
      setBaseDrawn(urls.some((u) => bases.current.has(u)));
    },
    [sync],
  );
  const mounted = !!plan && ((enabled && start) || baseDrawn);
  const layer: Props | null = mounted
    ? { plan: plan!, candidates: enabled ? candidates : [], moment, grade, still: !enabled, onPrepared: setPrepared, sync }
    : null;
  // La toile des tranches suit l'étalonnage de la dernière préparation du calque (les deux teintes changent ensemble).
  return { images, grade: prep && mounted ? prep.grade : grade, onDrawn, layer };
}
