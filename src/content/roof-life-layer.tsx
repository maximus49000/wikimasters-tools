import { memo, useLayoutEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import type { FacadeLayout } from '../core/library/city/facade-layout';
import type { Facade } from '../core/library/city/facades';
import { hashString, mulberry32 } from '../core/library/scene-world';
import {
  ROOFER_HIDE, catOutings, catRoofs, catState, catWalkMinutes, dryOutings, homeOccupied, pigeonFlocks, pigeonsOf, rooferAt, rooferRoof,
  smokeAt, smokeWind, walkY, type Outing, type PigeonFlock,
} from '../core/library/city/roof-life';
import { nightness } from '../core/library/city/window-lights';
import type { Sky } from '../core/library/sky';
import { Cat, Pigeon, Roofer, Smoke } from './roof-life-art';
import { sceneMinute, type SceneLife } from './use-scene-life';
import { useWallClockLoop } from './use-wallclock-loop';

// Calque des toits vivants (chantier « vie au-dessus de la rue », spec §5.2) : chat des toits à la Mansart (par la tabatière),
// pigeons des corniches, fumées d'hiver, couvreur du mardi et du jeudi ; moteur pur city/roof-life.ts, dessins de
// roof-life-art.tsx. Sous le ciel animé, au-dessus des tranches des façades (city-life.tsx). Perfs Android : les nœuds sont
// montés pour la journée (changement de jour, de largeur ou de graine seulement), chaque bête ou personnage montant toutes
// ses poses à la fois (celles qui ne servent pas en display none) ; la boucle de l'horloge murale (modèle GullsLayer) calcule
// les poses et ne re-rend une bête que si sa pose arrondie a changé (React n'écrit alors que les attributs qui changent).
// Mouvement réduit : chat assis pendant ses sorties (absent sinon), pigeons posés, couvreur à genoux, fumée immobile.
// Pluie : les bascules du jour sont notées par le calque (le jour de scène ne sait que « humide ») ; une sortie du chat
// commencée au sec se termine par sa rentrée, le couvreur finit ce qu'il fait et redescend.

const FRAME_MS = 66;
// Pigeons montés au plus (toutes volées de la scène).
export const PIGEON_MAX = 8;
// Fondu d'une fumée qui prend ou s'éteint (s).
const SMOKE_FADE_S = 40;
// Pas des bouffées de fumée (s) : elles montent de 0,9 px/s, un pas de 0,5 s reste fluide à cette taille.
const SMOKE_STEP_S = 0.5;
// Fumées montées au plus sur la scène.
export const SMOKE_MAX = 8;
const NIGHT_AT = 0.2;

const CatM = memo(Cat);
const PigeonM = memo(Pigeon);
const RooferM = memo(Roofer);
const SmokeM = memo(Smoke);

const q = (v: number, step: number): number => Math.round(v / step) * step;
const r2 = (v: number): number => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

// Poses poussées par la boucle vers chaque bête (une par id), re-rendue seulement quand sa pose arrondie change.
type Hub = { subs: Map<string, (v: never) => void>; keys: Map<string, string> };
function useSlot<V>(hub: Hub, id: string, init: V): V {
  const [v, setV] = useState<V>(init);
  useLayoutEffect(() => {
    hub.subs.set(id, setV as (v: never) => void);
    return () => {
      hub.subs.delete(id);
      hub.keys.delete(id);
    };
  }, [hub, id]);
  return v;
}
function push<V>(hub: Hub, id: string, v: V): void {
  const k = JSON.stringify(v);
  if (hub.keys.get(id) === k) return;
  hub.keys.set(id, k);
  (hub.subs.get(id) as ((v: V) => void) | undefined)?.(v);
}

type CatV = { pose: 'emerge' | 'walk' | 'sit' | null; x: number; y: number; phase: number; dir: 1 | -1; op: number };
type BirdV = { pose: 'perch' | 'peck' | 'fly' | null; x: number; y: number; phase: number; dir: 1 | -1 };
type SmokeV = { level: number; phase: number };
type RooferV = { pose: 'kneel' | 'walk' | null; x: number; y: number; phase: number; dir: 1 | -1 };
const NO_CAT: CatV = { pose: null, x: 0, y: 0, phase: 0, dir: 1, op: 1 };
const NO_BIRD: BirdV = { pose: null, x: 0, y: 0, phase: 0, dir: 1 };
const NO_SMOKE: SmokeV = { level: 0, phase: 0 };
const NO_ROOFER: RooferV = { pose: null, x: 0, y: 0, phase: 0, dir: 1 };
const CAT_POSES = ['emerge', 'walk', 'sit'] as const;
// Le chat qui sort : tout entier sous le zinc à l'avancement 0 (CAT_RISE) ; il prend corps sur le premier quart.
const CAT_FADE = 0.25;
const vis = (on: boolean): 'inline' | 'none' => (on ? 'inline' : 'none');

function CatSlot({ hub, fi, night }: { hub: Hub; fi: number; night: boolean }): ReactElement {
  const v = useSlot(hub, `cat:${fi}`, NO_CAT);
  return (
    <g data-roof-cat-slot={fi} transform={`translate(${v.x} ${v.y})`} display={vis(v.pose !== null)} opacity={v.op}>
      {CAT_POSES.map((p) => (
        <g key={p} data-pose={p} display={vis(v.pose === p)}>
          <CatM pose={p} phase={v.pose === p ? v.phase : p === 'emerge' ? 1 : 0} night={night} dir={v.pose === p ? v.dir : 1} />
        </g>
      ))}
    </g>
  );
}

function BirdSlot({ hub, id, dark }: { hub: Hub; id: string; dark: number }): ReactElement {
  const v = useSlot(hub, id, NO_BIRD);
  const rest = v.pose === 'perch' || v.pose === 'peck';
  return (
    <g data-roof-pigeon-slot={id} transform={`translate(${v.x} ${v.y})`} display={vis(v.pose !== null)}>
      <g data-pose="rest" display={vis(rest)}>
        <PigeonM pose={rest ? (v.pose as 'perch' | 'peck') : 'perch'} phase={rest ? v.phase : 0} dir={rest ? v.dir : 1} dark={dark} />
      </g>
      <g data-pose="fly" display={vis(v.pose === 'fly')}>
        <PigeonM pose="fly" phase={v.pose === 'fly' ? v.phase : 0} dir={v.pose === 'fly' ? v.dir : 1} dark={dark} />
      </g>
    </g>
  );
}

function SmokeSlot({ hub, id, x, y, wind, night }: { hub: Hub; id: string; x: number; y: number; wind: number; night: boolean }): ReactElement {
  const v = useSlot(hub, id, NO_SMOKE);
  return (
    <g data-roof-smoke-slot={id} transform={`translate(${r2(x)} ${r2(y)})`} display={vis(v.level > 0)} opacity={v.level}>
      <SmokeM phase={v.level > 0 ? v.phase : 0} night={night} wind={wind} />
    </g>
  );
}

// Couvreur : dans une fenêtre SVG (overflow hidden, pas de clip-path) qui s'arrête à la ligne du terrasson : il monte et
// redescend par l'arrière du toit, caché sous le faîtage. Une pose à genoux, une marche (mêmes nœuds dans les deux sens).
function RooferSlot({ hub, l, scale, dark }: { hub: Hub; l: FacadeLayout; scale: number; dark: number }): ReactElement {
  const v = useSlot(hub, 'roofer', NO_ROOFER);
  const y0 = walkY(l);
  const box = { x: r2(l.x - 20), y: r2(y0 - 30), w: r2(l.w + 40), h: 30.3 };
  return (
    <svg data-roof-roofer-slot="" x={box.x} y={box.y} width={box.w} height={box.h} viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} overflow="hidden" display={vis(v.pose !== null)}>
      <g transform={`translate(${v.x} ${v.y}) scale(${scale})`}>
        <g data-pose="kneel" display={vis(v.pose === 'kneel')}>
          <RooferM pose="kneel" phase={v.pose === 'kneel' ? v.phase : 0} dir={v.pose === 'kneel' ? v.dir : 1} dark={dark} />
        </g>
        <g data-pose="walk" display={vis(v.pose === 'walk')}>
          <RooferM pose="walk" phase={v.pose === 'walk' ? v.phase : 0} dir={v.pose === 'walk' ? v.dir : 1} dark={dark} />
        </g>
      </g>
    </svg>
  );
}

type Model = {
  hub: Hub;
  layouts: { fi: number; l: FacadeLayout }[];
  cats: { fi: number; l: FacadeLayout; outings: Outing[]; walk: number }[];
  smokes: { id: string; fi: number; k: number; x: number; y: number; l: FacadeLayout }[];
  birds: { id: string; fi: number; bird: number }[];
  flocks: Map<number, PigeonFlock[]>;
  roofer: { fi: number; l: FacadeLayout; scale: number } | null;
  wind: number;
  homes: Map<number, { id: string; members: number }[]>;
};

// Échelle du couvreur : 0,66 × la hauteur d'étage courante de son immeuble, comme les pantins (dessin de 11 px).
function rooferScale(l: FacadeLayout): number {
  const hs = l.levels.filter((lv) => lv.level !== 'mezz').map((lv) => lv.h).sort((a, b) => a - b);
  const h = hs[Math.floor(hs.length / 2)] ?? 16;
  return r2(clamp((0.66 * h) / 11, 0.85, 1.2));
}

function buildModel(facades: readonly Facade[], life: SceneLife, seed: number): Model {
  const day = life.day;
  const layouts = facades.flatMap((f, fi) => (f.layout ? [{ fi, l: f.layout }] : []));
  const cats = catRoofs(facades.map((f) => f.layout), seed).map((fi) => {
    const l = facades[fi]!.layout!;
    return { fi, l, outings: catOutings(seed, day.iso, fi), walk: catWalkMinutes(l) };
  });
  // Fumées montées : souches qui fumeraient ce jour-là si quelqu'un était chez soi (aucune hors de l'hiver), SMOKE_MAX au
  // plus, tirées du jour (écritures de la boucle : 6 bouffées × 2 attributs par fumée à chaque pas).
  const smokePick = mulberry32(seed ^ hashString(day.iso) ^ hashString('smoke-pick'));
  const smokes = layouts
    .flatMap(({ fi, l }) => smokeAt(l, day, true, seed).flatMap((on, k) => (on ? [{ id: `smoke:${fi}:${k}`, fi, k, x: l.chimneys[k]!.x + 2, y: l.chimneys[k]!.top - 1.3, l }] : [])))
    .map((sm) => ({ sm, r: smokePick() }))
    .sort((a, b) => a.r - b.r)
    .slice(0, SMOKE_MAX)
    .map((o) => o.sm);
  const flocks = new Map<number, PigeonFlock[]>();
  const birds: Model['birds'] = [];
  // Toits visités dans un ordre tiré du jour (les PIGEON_MAX pigeons ne se massent pas toujours à gauche de la scène).
  const pick = mulberry32(seed ^ hashString(day.iso) ^ hashString('pigeon-pick'));
  const order = layouts.map((x) => ({ x, r: pick() })).sort((a, b) => a.r - b.r).map((o) => o.x);
  for (const { fi, l } of order) {
    const fl = pigeonFlocks(l, seed, day.iso, day);
    const n = fl.reduce((s, f) => s + f.birds.length, 0);
    if (n === 0 || birds.length + n > PIGEON_MAX) continue;
    flocks.set(fi, fl);
    for (const f of fl) for (const b of f.birds) birds.push({ id: `pigeon:${fi}:${b.id}`, fi, bird: b.id });
  }
  const front = layouts.map((x) => x.l);
  const ri = rooferRoof(front, seed, day);
  const roofer = ri === null ? null : { fi: layouts[ri]!.fi, l: layouts[ri]!.l, scale: rooferScale(layouts[ri]!.l) };
  const homes = new Map<number, { id: string; members: number }[]>();
  for (const d of life.dwellings) homes.set(d.facade, [...(homes.get(d.facade) ?? []), { id: d.id, members: d.hh.members.length }]);
  return { hub: { subs: new Map(), keys: new Map() }, layouts, cats, smokes, birds, flocks, roofer, wind: r2(smokeWind(seed, day.iso)), homes };
}

export function RoofLifeLayer({ facades, life, sky, minutes, still, seed }: { facades: Facade[]; life: SceneLife; sky: Sky; minutes: number; still: boolean; seed: number }): ReactElement {
  // Nœuds de la journée : remontés quand les façades, le jour (soleil du lieu compris) ou la graine changent (pas à la bascule
  // humide).
  const model = useMemo(() => buildModel(facades, life, seed), [facades, life.day.iso, life.day.sunrise, life.day.sunset, seed]); // eslint-disable-line react-hooks/exhaustive-deps
  // Ambiance de nuit au huitième de jour près (comme la vie aux fenêtres) : re-rendu seulement à ces paliers.
  const dark = r2(nightness(Math.round(sky.daylight * 8) / 8));
  const night = dark > NIGHT_AT;
  const clock = useRef<{ m: number; base: number } | null>(null);
  // Pluie vue par le calque ce jour-là : intervalles [début, fin] (fin = Infinity si elle dure), première minute de pluie
  // (couvreur) ; jour humide dès le montage : pluie « depuis toujours ». Sorties du chat maintenues, recalculées à la bascule.
  const rain = useRef<{ model: Model | null; iso: string; last: boolean; wet: [number, number][]; from: number | undefined; cats: Outing[][] | null }>({ model: null, iso: '', last: false, wet: [], from: undefined, cats: null });
  const homeAt = useRef<{ model: Model | null; minute: number; occupied: Map<number, boolean> }>({ model: null, minute: NaN, occupied: new Map() });
  const smoke = useRef<{ model: Model | null; level: Map<string, number>; at: number }>({ model: null, level: new Map(), at: 0 });

  const place = useMemo(() => (now: number): void => {
    let m: number;
    if (still) m = minutes;
    else {
      const c = sceneMinute(clock.current, minutes, now);
      clock.current = c.clock;
      m = c.minutes + (now - Math.floor(now / 60) * 60) / 60;
    }
    const s = still ? 0 : m * 60;
    const day = life.day;
    const R = rain.current;
    if (R.iso !== day.iso) {
      Object.assign(R, { iso: day.iso, last: day.wet, wet: day.wet ? [[-Infinity, Infinity]] : [], from: day.wet ? -Infinity : undefined, cats: null });
    } else if (R.last !== day.wet) {
      if (day.wet) {
        R.wet.push([m, Infinity]);
        R.from ??= m;
      } else if (R.wet.length > 0) R.wet[R.wet.length - 1]![1] = m;
      R.last = day.wet;
      R.cats = null;
    }
    // Autre modèle (largeur, façades) : les toits à chat ont changé, leurs sorties sont refaites.
    if (R.model !== model) {
      R.model = model;
      R.cats = null;
    }
    R.cats ??= model.cats.map((c) => dryOutings(c.outings, R.wet, c.walk));
    const { hub } = model;

    // Chat.
    model.cats.forEach((c, i) => {
      const st = catState(c.l, R.cats![i]!, m);
      if (!st) return push(hub, `cat:${c.fi}`, NO_CAT);
      if (still) {
        // Mouvement réduit : assis là où il s'assoit (au bout de son chemin), sans bouger.
        const sit = catState(c.l, R.cats![i]!, R.cats![i]!.find((o) => m >= o.start && m <= o.start + o.dur)!.start + c.walk + 1 / 60 + 20 / 60);
        return push(hub, `cat:${c.fi}`, { pose: 'sit', x: r2(sit?.x ?? st.x), y: r2(st.y), phase: 0, dir: sit?.dir ?? st.dir, op: 1 });
      }
      const phase = st.pose === 'emerge' ? q(st.phase, 0.01) : st.pose === 'walk' ? q(st.phase, 1 / 12) : q(st.phase, 0.25);
      push(hub, `cat:${c.fi}`, { pose: st.pose, x: q(st.x, 0.05), y: r2(st.y), phase: r2(phase), dir: st.dir, op: st.pose === 'emerge' ? r2(Math.min(1, st.phase / CAT_FADE)) : 1 });
    });

    // Pigeons.
    for (const [fi, fl] of model.flocks) {
      const here = pigeonsOf(fl, m, day.wet);
      for (const b of model.birds) {
        if (b.fi !== fi) continue;
        const p = here.find((x) => x.id === b.bird);
        if (!p) {
          push(hub, b.id, NO_BIRD);
          continue;
        }
        if (still) {
          const perch = fl.flatMap((f) => f.birds.map((x) => ({ ...x, y: f.y }))).find((x) => x.id === b.bird)!;
          push(hub, b.id, { pose: 'perch', x: r2(perch.x), y: r2(perch.y), phase: 0, dir: perch.dir });
          continue;
        }
        // Seul ce que le dessin lit est poussé : tête qui pointe (sin(phase) > 0,8), plongée du bec en 4 crans (max(0, sin 6·phase)),
        // battement d'ailes en vol.
        const phase = p.pose === 'fly' ? q(p.phase, 0.7) : p.pose === 'peck' ? Math.asin(Math.round(Math.max(0, Math.sin(p.phase * 6)) * 3) / 3) / 6 : Math.sin(p.phase) > 0.8 ? Math.PI / 2 : 0;
        push(hub, b.id, { pose: p.pose, x: q(p.x, 0.05), y: q(p.y, 0.05), phase: r2(phase), dir: p.dir });
      }
    }

    // Fumées : quelqu'un chez soi sous ce toit (relu à chaque minute entière), fondu de SMOKE_FADE_S à la bascule.
    const H = homeAt.current;
    if (H.model !== model || H.minute !== Math.floor(m)) {
      H.model = model;
      H.minute = Math.floor(m);
      H.occupied = new Map();
      for (const sm of model.smokes) {
        if (H.occupied.has(sm.fi)) continue;
        H.occupied.set(sm.fi, (model.homes.get(sm.fi) ?? []).some((h) => {
          const sc = life.today.get(h.id);
          return !!sc && homeOccupied(sc, h.members, m);
        }));
      }
    }
    const S = smoke.current;
    const first = S.model !== model;
    if (first) {
      S.model = model;
      S.level = new Map();
    }
    const dt = first ? 0 : Math.max(0, now - S.at);
    S.at = now;
    for (const sm of model.smokes) {
      // Le modèle ne monte que les souches qui fument ce jour-là (hiver, tirage) : reste la présence sous ce toit.
      const target = H.occupied.get(sm.fi) ? 1 : 0;
      const cur = S.level.get(sm.id);
      const level = cur === undefined || still ? target : target > cur ? Math.min(target, cur + dt / SMOKE_FADE_S) : Math.max(target, cur - dt / SMOKE_FADE_S);
      S.level.set(sm.id, level);
      // Bouffées avancées toutes les SMOKE_STEP_S ; fumée éteinte : phase 0 (rien n'est réécrit).
      push(hub, sm.id, { level: r2(level), phase: level > 0 ? r2(q(s, SMOKE_STEP_S)) : 0 });
    }

    // Couvreur.
    if (model.roofer) {
      const rf = rooferAt(model.layouts.map((x) => x.l), seed, day, m, R.from);
      if (!rf) push(hub, 'roofer', NO_ROOFER);
      else if (still) push(hub, 'roofer', { pose: 'kneel', x: r2(rf.x), y: r2(walkY(model.roofer.l)), phase: 0, dir: rf.dir });
      else {
        // À genoux, le dessin ne lit que le coup porté (sin(5·phase) > 0,5) : marteau levé (phase 0) ou coup (π/10).
        const phase = rf.pose === 'kneel' ? (Math.sin(rf.phase * 5) > 0.5 ? Math.PI / 10 : 0) : q(rf.phase, 0.9 / 12);
        push(hub, 'roofer', { pose: rf.pose, x: q(rf.x, 0.05), y: q(Math.min(rf.y, walkY(model.roofer.l) + ROOFER_HIDE), 0.05), phase: r2(phase), dir: rf.dir });
      }
    }
  }, [model, life, minutes, still, seed]);
  useWallClockLoop(place, [place], { frameMs: FRAME_MS });

  return (
    <g data-roof-life="">
      {model.smokes.map((sm) => <SmokeSlot key={sm.id} hub={model.hub} id={sm.id} x={sm.x} y={sm.y} wind={model.wind} night={night} />)}
      {model.cats.map((c) => <CatSlot key={c.fi} hub={model.hub} fi={c.fi} night={night} />)}
      {model.roofer && <RooferSlot hub={model.hub} l={model.roofer.l} scale={model.roofer.scale} dark={dark} />}
      {model.birds.map((b) => <BirdSlot key={b.id} hub={model.hub} id={b.id} dark={dark} />)}
    </g>
  );
}
