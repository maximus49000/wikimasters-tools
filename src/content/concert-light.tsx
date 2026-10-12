import { useEffect, useId, useLayoutEffect, useMemo, useReducer, useRef, type ReactElement } from 'react';
import { BACKS, BACK_Y, LYRES, LYRE_Y, PALS, PARS, beamShape, concertState, flashAlpha, lighten, lyreTarget, paletteIndex, type ConcertState } from '../core/library/city/concert';
import { patchBox, type LightBlob } from '../core/library/city/night-light';
import { PAINT_VERSION } from '../core/library/paint/city-painter';
import type { CityPaintPlan } from '../core/library/paint/city-plan';
import '../core/library/paint/props/music';
import { STAGE, spotLens } from './install-sprites';
import { idle } from './paint-queue';
import { PaintRegistry } from './paint-registry';
import { litPatchPainter } from './painted-city';
import { PropImage } from './prop/prop-host';
import { useWallClockLoop } from './use-wallclock-loop';

// Éclairage de concert de la Fête de la musique en Ghibli (G5, maquette g5-fetes notes §8) : le soir, à la place des faisceaux
// StageBeams. Repère de la scène (centre x = 0, base y = 0 au sol du trottoir, échelle `unit` : chaque groupe porte la
// transformation). Séquence : city/concert.ts (120 bpm, palette par 8 s, hit, strobe 3 Hz, lyres en éventail croisé),
// déterministe en t = horloge murale − `t` (origine, 0 par défaut) : toutes les vues (copies <use> comprises) voient la même
// image.
// `ConcertLight` (partie `crew`, devant les passants) : faisceaux = <polygon> à <linearGradient> le long du faisceau (α source
// → α/2 → 0 ; cœur plus clair et plus étroit) ; contre-jours et têtes de lyre = <circle> à <radialGradient> ; brume = voile
// α 0,07 borné au volume entre les montants et au-dessus du plancher ; hit et strobe = <rect> blanc d'opacité (plafonnée à
// 0,5) ; débordement coloré c0 α 0,09 au sol (ellipse 120 × 40) ; le tout dans UN SEUL groupe en screen (un seul calque de
// mélange : Android). Plancher révélé = 4 images d'accessoire `stage-glow` (une par palette, le plancher repeint dans c1,
// masqué), sous les faisceaux.
// `ConcertCrowd` (partie `back`, SOUS les passants) : public révélé = 4 découpes paintLitPatch de la chaussée devant la scène
// (teinte c0). Opacité 1 pour la palette courante seulement.
// Pas de SMIL : la boucle (useWallClockLoop) réécrit les attributs, seulement ceux qui changent (points et dégradés des lyres à
// chaque image ; couleurs et opacités des révélations au changement de palette ; hit). Mouvement réduit : pose t = 0, aucun
// voile blanc, pas de boucle. Rien le jour (`lit` faux).

type ShowProps = { stageX: number; base: number; unit: number; t?: number; lit: boolean; still: boolean };
type CrowdProps = ShowProps & { plan: CityPaintPlan | null; seed: number };

// Faisceau : source fixe, cible et couleur selon l'état ; `key` : back0..2 (contre-jours), par0..2 (projecteurs de la traverse),
// lyre0..3.
type BeamDef = { key: string; sx: number; sy: number; w0: number; w1: number; a: number; color: (s: ConcertState) => string; target: (s: ConcertState) => readonly [number, number] };
const WARM = '#FFD080';
const BEAMS: readonly BeamDef[] = [
  ...BACKS.map((x, i): BeamDef => ({ key: `back${i}`, sx: x, sy: BACK_Y, w0: 2, w1: 22, a: 0.28, color: (s) => s.pal[0], target: () => [x * 1.6, 16] })),
  ...PARS.map((x, i): BeamDef => {
    const o = spotLens(i);
    return { key: `par${i}`, sx: o.x, sy: o.y, w0: 1.6, w1: 9, a: 0.5, color: (s) => (i === 1 ? WARM : s.pal[1]), target: () => [x, -STAGE.floor] };
  }),
  ...LYRES.map((x, i): BeamDef => {
    const floor = i === 1 || i === 2;
    return { key: `lyre${i}`, sx: x, sy: LYRE_Y, w0: 1.4, w1: floor ? 7 : 16, a: floor ? 0.55 : 0.4, color: (s) => s.lyres[i]!.color, target: (s) => lyreTarget(i, s.lyres[i]!.pan) };
  }),
];
const f2 = (v: number): string => v.toFixed(2);
const stageTransform = (stageX: number, base: number, unit: number): string => `translate(${stageX.toFixed(1)} ${base.toFixed(1)}) scale(${unit.toFixed(3)})`;
// Instant de la séquence au rendu (mouvement réduit : pose t = 0).
const renderT = (still: boolean, origin: number): number => (still ? 0 : Date.now() / 1000 - origin);

// Opacité des révélations : 1 pour la palette courante seule (`data-concert-pal-index`), écrite seulement si elle change.
function showPalette(groups: readonly Element[], k: number): void {
  for (const g of groups) {
    const want = Number(g.getAttribute('data-concert-pal-index')) === k ? '1' : '0';
    if (g.getAttribute('opacity') !== want) g.setAttribute('opacity', want);
  }
}

// ───────────── Spectacle (faisceaux, plancher) ─────────────
// Poignées sur les nœuds réécrits par la boucle (relues après chaque rendu).
type Handles = {
  beams: { def: BeamDef; poly: Element | null; core: Element | null; stops: Element[]; coreStops: Element[]; grads: Element[]; last: string }[];
  heads: Element[][];
  backs: Element[];
  spill: Element[];
  hit: Element | null;
  floor: Element[];
};

export function ConcertLight({ stageX, base, unit, t: origin = 0, lit, still }: ShowProps): ReactElement | null {
  const ids = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const id = (k: string): string => `${ids}-${k}`;
  const root = useRef<SVGGElement | null>(null);
  const handles = useRef<Handles | null>(null);
  const pal = useRef(-1);
  useLayoutEffect(() => {
    handles.current = null;
  });
  const t0 = renderT(still, origin);
  const s0 = concertState(t0);

  const place = useMemo(
    () => (now: number): void => {
      const el = root.current;
      if (still || !lit || !el) return;
      const t = now - origin;
      const s = concertState(t);
      let h = handles.current;
      if (!h) {
        h = {
          beams: BEAMS.map((def) => ({
            def,
            poly: el.querySelector(`[data-concert-beam="${def.key}"]`),
            core: el.querySelector(`[data-concert-beam-core="${def.key}"]`),
            stops: [...el.querySelectorAll(`[data-concert-grad="${def.key}"] stop`)],
            coreStops: [...el.querySelectorAll(`[data-concert-grad="${def.key}c"] stop`)],
            grads: [...el.querySelectorAll(`[data-concert-grad="${def.key}"], [data-concert-grad="${def.key}c"]`)],
            last: '',
          })),
          heads: LYRES.map((_, i) => [...el.querySelectorAll(`[data-concert-grad="head${i}"] stop`)]),
          backs: [...el.querySelectorAll('[data-concert-grad="back"] stop')],
          spill: [...el.querySelectorAll('[data-concert-grad="spill"] stop')],
          hit: el.querySelector('[data-concert-hit]'),
          floor: [...el.querySelectorAll('[data-concert-floor]')],
        };
        handles.current = h;
        pal.current = -1;
      }
      const k = paletteIndex(t);
      const setStops = (stops: readonly Element[], colors: readonly string[]): void => {
        stops.forEach((st, i) => {
          const c = colors[Math.min(i, colors.length - 1)]!;
          if (st.getAttribute('stop-color') !== c) st.setAttribute('stop-color', c);
        });
      };
      if (k !== pal.current) {
        pal.current = k;
        el.setAttribute('data-concert-pal', String(k));
        const [c0] = s.pal;
        setStops(h.backs, [c0]);
        setStops(h.spill, [c0]);
        for (const b of h.beams) {
          const c = b.def.color(s);
          setStops(b.stops, [c]);
          setStops(b.coreStops, [lighten(c, 0.5), c]);
        }
        h.heads.forEach((stops, i) => setStops(stops, ['#FFFFFF', s.lyres[i]!.color, s.lyres[i]!.color]));
        showPalette(h.floor, k);
      }
      for (const b of h.beams) {
        if (!b.def.key.startsWith('lyre')) continue;
        const [tx, ty] = b.def.target(s);
        const shape = beamShape(b.def.sx, b.def.sy, tx, ty, b.def.w0, b.def.w1);
        if (shape.points === b.last) continue;
        b.last = shape.points;
        b.poly?.setAttribute('points', shape.points);
        b.core?.setAttribute('points', shape.core);
        for (const g of b.grads) {
          g.setAttribute('x2', f2(tx));
          g.setAttribute('y2', f2(ty));
        }
      }
      const hit = String(flashAlpha(s));
      if (h.hit && h.hit.getAttribute('opacity') !== hit) h.hit.setAttribute('opacity', hit);
    },
    [still, lit, origin],
  );
  useWallClockLoop(place, [place], { enabled: lit && !still });

  if (!lit) return null;
  const k0 = paletteIndex(t0);
  const [c0] = s0.pal;
  const gradient = (key: string, def: BeamDef, color: string, core: boolean, tx: number, ty: number): ReactElement => (
    <linearGradient key={key} id={id(key)} data-concert-grad={key} gradientUnits="userSpaceOnUse" x1={f2(def.sx)} y1={f2(def.sy)} x2={f2(tx)} y2={f2(ty)}>
      {core ? (
        <>
          <stop offset="0" stopColor={lighten(color, 0.5)} stopOpacity={0.8 * def.a} />
          <stop offset="1" stopColor={color} stopOpacity={0} />
        </>
      ) : (
        <>
          <stop offset="0" stopColor={color} stopOpacity={def.a} />
          <stop offset="0.5" stopColor={color} stopOpacity={0.45 * def.a} />
          <stop offset="1" stopColor={color} stopOpacity={0} />
        </>
      )}
    </linearGradient>
  );
  const beams = BEAMS.map((def) => {
    const [tx, ty] = def.target(s0);
    return { def, color: def.color(s0), tx, ty, shape: beamShape(def.sx, def.sy, tx, ty, def.w0, def.w1) };
  });
  return (
    <g data-concert-light="" data-concert-pal={k0} ref={root} transform={stageTransform(stageX, base, unit)}>
      <defs>
        <radialGradient id={id('haze')} data-concert-grad="haze" cx="0.5" cy="0.4" r="0.65">
          <stop offset="0" stopColor="rgb(170,190,240)" stopOpacity={0.07} />
          <stop offset="1" stopColor="rgb(170,190,240)" stopOpacity={0} />
        </radialGradient>
        <radialGradient id={id('spill')} data-concert-grad="spill">
          <stop offset="0" stopColor={c0} stopOpacity={0.09} />
          <stop offset="1" stopColor={c0} stopOpacity={0} />
        </radialGradient>
        <radialGradient id={id('back')} data-concert-grad="back">
          <stop offset="0" stopColor={c0} stopOpacity={0.8} />
          <stop offset="0.3" stopColor={c0} stopOpacity={0.35} />
          <stop offset="1" stopColor={c0} stopOpacity={0} />
        </radialGradient>
        {LYRES.map((_, i) => (
          <radialGradient key={i} id={id(`head${i}`)} data-concert-grad={`head${i}`}>
            <stop offset="0" stopColor="#FFFFFF" stopOpacity={0.9} />
            <stop offset="0.4" stopColor={s0.lyres[i]!.color} stopOpacity={0.6} />
            <stop offset="1" stopColor={s0.lyres[i]!.color} stopOpacity={0} />
          </radialGradient>
        ))}
        {beams.flatMap((b) => [gradient(b.def.key, b.def, b.color, false, b.tx, b.ty), gradient(`${b.def.key}c`, b.def, b.color, true, b.tx, b.ty)])}
      </defs>
      {/* Plancher repeint dans c1 (image d'accessoire par palette), sous les faisceaux. */}
      <g data-concert-reveal="">
        {PALS.map((_, k) => (
          <g key={k} data-concert-floor="" data-concert-pal-index={k} opacity={k === k0 ? 1 : 0}>
            <PropImage spec={{ id: 'stage-glow', args: { pal: k }, day: 1 }} />
          </g>
        ))}
      </g>
      {/* Un seul calque en screen : brume (bornée aux montants / au-dessus du plancher), débordement, faisceaux, voile blanc. */}
      <g data-concert-screen="" style={{ mixBlendMode: 'screen' }}>
        <rect data-concert-haze="" x={-STAGE.postX} y={-STAGE.truss + 2} width={STAGE.postX * 2} height={STAGE.truss - STAGE.floor - STAGE.deck - 2} fill={`url(#${id('haze')})`} />
        <ellipse data-concert-spill="" cx={0} cy={0} rx={120} ry={40} fill={`url(#${id('spill')})`} />
        {BACKS.map((x, i) => <circle key={i} data-concert-back-glow={i} cx={x} cy={BACK_Y} r={14} fill={`url(#${id('back')})`} />)}
        {beams.map((b) => (
          <g key={b.def.key}>
            <polygon data-concert-beam={b.def.key} points={b.shape.points} fill={`url(#${id(b.def.key)})`} />
            <polygon data-concert-beam-core={b.def.key} points={b.shape.core} fill={`url(#${id(`${b.def.key}c`)})`} />
          </g>
        ))}
        {LYRES.map((x, i) => <circle key={i} data-concert-lyre-head={i} cx={x} cy={LYRE_Y} r={4} fill={`url(#${id(`head${i}`)})`} />)}
        {/* Mouvement réduit : jamais de voile blanc figé. */}
        <rect data-concert-hit="" x={-STAGE.half} y={-STAGE.truss} width={STAGE.half * 2} height={STAGE.truss} fill="#FFFFFF" opacity={still ? 0 : flashAlpha(s0)} />
      </g>
    </g>
  );
}

// ───────────── Public révélé (sous les passants) ─────────────
// Découpes du public : au plus une peinture par image d'animation, partagées par toutes les scènes.
const CROWD_MAX = 24;
let registry = new PaintRegistry('concert-light', { max: CROWD_MAX, perFrame: 1, schedule: (cb) => void idle(cb) });
export function resetConcertLightForTests(): void {
  registry = new PaintRegistry('concert-light', { max: CROWD_MAX, perFrame: 1, schedule: (cb) => void idle(cb) });
}
type Job = { key: string; paint: () => string };
function useImages(jobs: readonly Job[]): void {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const sig = jobs.map((j) => j.key).join('\n');
  useEffect(() => {
    const cancels = jobs.filter((j) => registry.get(j.key) === null).map((j) => registry.want(j.key, j.paint, bump));
    return () => {
      for (const c of cancels) c();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
}

// Disque 70 × 22 u à 14 u devant le bord du trottoir, pic 0,45 (repère du monde).
const crowdBlobs = (stageX: number, base: number, u: number): LightBlob[] => [{ cx: stageX, cy: base + 14 * u, rx: 70 * u, ry: 22 * u, peak: 0.45 }];

export function ConcertCrowd({ stageX, base, unit, t: origin = 0, lit, still, plan, seed }: CrowdProps): ReactElement | null {
  const root = useRef<SVGGElement | null>(null);
  const groups = useRef<Element[] | null>(null);
  const pal = useRef(-1);
  useLayoutEffect(() => {
    groups.current = null;
  });
  const t0 = renderT(still, origin);
  const blobs = useMemo(() => crowdBlobs(stageX, base, unit), [stageX, base, unit]);
  const box = useMemo(() => patchBox(blobs), [blobs]);
  const keyOf = (k: number): string => `concert|${seed}|${plan?.width ?? 0}|${plan?.height ?? 0}|${PAINT_VERSION}|${stageX}|${unit.toFixed(3)}|${k}`;
  const paintPatch = litPatchPainter();
  const jobs: Job[] = lit && plan
    ? PALS.map((p, k) => ({ key: keyOf(k), paint: () => paintPatch(plan, box, blobs, { multiply: lighten(p[0], 0.5), screen: p[0], screenAlpha: 0.12 }) }))
    : [];
  useImages(jobs);
  const place = useMemo(
    () => (now: number): void => {
      const el = root.current;
      if (still || !lit || !el) return;
      const k = paletteIndex(now - origin);
      if (!groups.current) {
        groups.current = [...el.querySelectorAll('[data-concert-crowd]')];
        pal.current = -1;
      }
      if (k === pal.current) return;
      pal.current = k;
      el.setAttribute('data-concert-pal', String(k));
      showPalette(groups.current, k);
    },
    [still, lit, origin],
  );
  useWallClockLoop(place, [place], { enabled: lit && !still });
  if (!lit) return null;
  const k0 = paletteIndex(t0);
  // Découpe (repère du monde → repère de la scène).
  const image = (k: number): ReactElement | null => {
    const url = plan ? registry.get(keyOf(k)) : null;
    return url ? <image href={url} x={f2((box.x - stageX) / unit)} y={f2((box.y - base) / unit)} width={f2(box.w / unit)} height={f2(box.h / unit)} preserveAspectRatio="none" /> : null;
  };
  return (
    <g data-concert-crowd-layer="" data-concert-pal={k0} ref={root} transform={stageTransform(stageX, base, unit)}>
      {PALS.map((_, k) => (
        <g key={k} data-concert-crowd={k} data-concert-pal-index={k} opacity={k === k0 ? 1 : 0}>
          {image(k)}
        </g>
      ))}
    </g>
  );
}
