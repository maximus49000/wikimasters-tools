import { useEffect, useMemo, useReducer, useRef, type ReactElement } from 'react';
import { lampsFor } from '../core/library/city/lamps';
import type { CityPaintPlan } from '../core/library/paint/city-plan';
import { foliageOf, type FondMoment } from '../core/library/paint/fond-time';
import { windOf, type Wind } from '../core/library/paint/fond-vent';
import { gradeFor, type Grade } from '../core/library/paint/grade';
import type { RuePit } from '../core/library/paint/rue-verte-plan';
import { rueTreeModel, rueWet } from '../core/library/paint/rue-verte-painter';
import { gradePixels, paintRueLampWash, paintRueLayer, rueLampWash, rueLayers, rueSpriteBox, rueTreePose, type RueLampWash, type RueLayerName } from '../core/library/paint/rue-sprites';
import type { TreeModel } from '../core/library/paint/hill-trees';
import { idle } from './paint-queue';
import { setIfChanged } from './svg-write';
import { useWallClockLoop } from './use-wallclock-loop';

// Calque `arbres-rue` de la ville peinte (PR 3, notes de la maquette §3 c, §3 d) : les arbres des fosses de la rue, au vent.
// Par fosse plantée, un <g data-rue-arbre> d'<image> cuites (rue-sprites.ts) : ombre des masses, fût + charpentières (jamais
// transformés), rameaux fins (cisaillement), une image par grappe (translation), rehauts et rehauts pâles (opacité). Nœuds
// constants pour la vie de la scène ; la boucle de l'horloge murale (15 images/s) n'écrit que les attributs qui changent.
// Cuisson hors écran en temps mort (`idle` de paint-queue), une fosse par créneau, par (fosse, date, pluie, neige, étalonnage
// arrondi au vingtième, lavis des lampadaires) ; l'ancienne image reste jusqu'à la nouvelle. L'étalonnage (matrice `gradeFor`)
// est appliqué aux pixels à la cuisson : pas de filtre SVG animé (trop cher sur Android). Images en data URL PNG, comme toutes
// les images cuites de la scène : la CSP du site refuse blob:.
// Mouvement réduit (`prefers-reduced-motion` ou `still`) : arbres dessinés, aucune transformation ne change jamais.
const FRAME_MS = 66;
const CACHE_MAX = 96;
const q20 = (v: number): number => Math.round(Math.max(0, Math.min(1, v)) * 20) / 20;
const reducedMotion = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const CALM: Wind = { wind: 0, dir: 1, wet: 0, storm: false };
// Nombre écrit à `d` décimales, zéro (même « -0,00 ») écrit « 0 ».
const num = (v: number, d = 2): string => {
  const s = v.toFixed(d);
  return Number(s) === 0 ? '0' : s;
};

export type RueSprites = Partial<Record<RueLayerName, string>>;
// Travail de cuisson d'une fosse : `grade` null = jour sans étalonnage ; `res` px de canvas par px du monde.
export type RueBakeJob = { key: string; pit: RuePit; layers: RueLayerName[]; box: { x: number; y: number; w: number; h: number }; moment: FondMoment; grade: Grade | null; washes: RueLampWash[]; res: number };
export type RueSpritePainter = (job: RueBakeJob) => Promise<RueSprites | null>;

const cache = new Map<string, RueSprites>();
const failed = new Set<string>();
let override: RueSpritePainter | null = null;

export function setRueSpritePainterForTests(painter: RueSpritePainter | null): void {
  override = painter;
}
export function resetStreetTreesForTests(): void {
  cache.clear();
  failed.clear();
}

function remember(key: string, s: RueSprites): void {
  cache.delete(key);
  cache.set(key, s);
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
}

// Peintre réel : un seul canvas, une couche après l'autre (peinte, étalonnée, lavis des lampes, PNG).
export const canvasRueSpritePainter: RueSpritePainter = async (job) => {
  if (typeof document === 'undefined' || (typeof navigator !== 'undefined' && navigator.userAgent.includes('jsdom'))) return null;
  const { box, res } = job;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(box.w * res));
  canvas.height = Math.max(1, Math.ceil(box.h * res));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const out: RueSprites = {};
  for (const layer of job.layers) {
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
    out[layer] = canvas.toDataURL('image/png');
  }
  return out;
};

type Tree = { v: RuePit; m: TreeModel; box: { x: number; y: number; w: number; h: number }; layers: RueLayerName[]; masses: number };

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
  // Heure fixe (décimale) : banc et tests ; sans elle, le vent suit l'horloge murale.
  at?: number;
};

export function StreetTrees({ plan, moment, daylight, twilight, gloom, dim, minutes, still: stillProp, at }: Props): ReactElement {
  const root = useRef<SVGGElement | null>(null);
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
  const sprites = useRueSprites(jobs);

  // Pose à 15 Hz : écrit les transformations et opacités des couches mobiles.
  const els = useRef<{ trees: Tree[] | null; list: { twigs: Element; cs: Element[]; hi: Element; pale: Element }[] }>({ trees: null, list: [] });
  const bare = useMemo(() => trees.map((tr) => foliageOf(D, 'rue' + Math.round(tr.v.x), tr.v.species).d <= 0.1), [trees, D]);
  const wind = useMemo(() => windOf(D.meteo, D.meteo.wind >= 0.8), [D]);
  const place = useMemo(() => {
    let zeroed = false;
    return (now: number): void => {
      const el = root.current;
      if (!el) return;
      if (els.current.trees !== trees) {
        const groups = el.querySelectorAll('[data-rue-arbre]');
        els.current = {
          trees,
          list: trees.map((tr, i) => {
            const g = groups[i]!;
            const pick = (l: string): Element => g.querySelector(`[data-rue-couche="${l}"]`)!;
            return { twigs: pick('twigs'), cs: Array.from({ length: tr.masses }, (_, k) => pick(`c${k}`)), hi: pick('hi'), pale: pick('pale') };
          }),
        };
        zeroed = false;
      }
      // Mouvement réduit : pose nulle écrite une fois, jamais modifiée ensuite.
      if (still && zeroed) return;
      zeroed = still;
      const t = still ? 0 : at !== undefined ? at * 3600 : now;
      const w = still ? CALM : wind;
      trees.forEach((tr, i) => {
        const node = els.current.list[i];
        if (!node) return;
        const p = rueTreePose(tr.v, tr.m, t, w, plan.width);
        const s = p.twigShear;
        setIfChanged(node.twigs, 'transform', `matrix(1 0 ${num(s, 4)} 1 ${num(-s * tr.m.rootY)} 0)`);
        p.masses.forEach((g, k) => {
          if (node.cs[k]) setIfChanged(node.cs[k], 'transform', `translate(${num(g.dx)} ${num(g.dy)})`);
        });
        const off = bare[i];
        setIfChanged(node.hi, 'opacity', off ? '0' : num(p.hiAlpha));
        setIfChanged(node.hi, 'transform', `translate(${num(p.hiDx)} 0)`);
        setIfChanged(node.pale, 'opacity', off ? '0' : num(p.paleAlpha));
        setIfChanged(node.pale, 'transform', `translate(${num(p.paleDx)} 0)`);
      });
    };
  }, [trees, still, at, wind, bare, plan.width]);
  useWallClockLoop(place, [place], { frameMs: FRAME_MS, enabled: true });

  return (
    <g data-arbres-rue="" ref={root}>
      {trees.map((tr, i) => (
        <g key={`${tr.v.x}|${tr.v.y}`} data-rue-arbre={i}>
          {tr.layers.map((l) => (
            <image
              key={l}
              data-rue-couche={l}
              href={sprites[i]?.[l]}
              x={tr.box.x}
              y={tr.box.y}
              width={tr.box.w}
              height={tr.box.h}
              preserveAspectRatio="none"
              opacity={l === 'hi' || l === 'pale' ? 0 : undefined}
            />
          ))}
        </g>
      ))}
      {/* Tâche 7 : pool fixe de particules (feuilles, pétales, gouttes, neige, graines) et oiseaux, nœuds constants ici. */}
      <g data-arbres-rue-particules="" />
    </g>
  );
}

// Sprites prêts par fosse (dans l'ordre des travaux) : cuits l'un après l'autre en temps mort ; une fosse dont la clé change
// garde son image précédente jusqu'à la nouvelle.
function useRueSprites(jobs: readonly RueBakeJob[]): (RueSprites | undefined)[] {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const signature = jobs.map((j) => j.key).join('\n');
  useEffect(() => {
    const painter = override ?? canvasRueSpritePainter;
    let cancelled = false;
    let cancelIdle: (() => void) | null = null;
    const next = (): void => {
      if (cancelled) return;
      const job = jobs.find((j) => !cache.has(j.key) && !failed.has(j.key));
      if (!job) return;
      cancelIdle = idle(() => {
        void painter(job)
          .catch(() => null)
          .then((s) => {
            if (s) remember(job.key, s);
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
  const last = useRef<Map<string, RueSprites>>(new Map());
  return jobs.map((j) => {
    const id = `${j.pit.x}|${j.pit.y}`;
    const fresh = cache.get(j.key);
    if (fresh) {
      // Remonte l'image affichée en tête du cache (jamais libérée pendant qu'on la montre).
      cache.delete(j.key);
      cache.set(j.key, fresh);
      last.current.set(id, fresh);
      return fresh;
    }
    return last.current.get(id);
  });
}
