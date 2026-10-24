import { createElement, useId, useMemo, useRef, type ReactElement, type ReactNode } from 'react';
import { gullMinutes } from '../core/library/city/gulls';
import type { WindowDay } from '../core/library/city/window-lights';
import type { CityPaintPlan } from '../core/library/paint/city-plan';
import type { FondMoment } from '../core/library/paint/fond-time';
import { gradeHex, millAngle, vieDay, vieFrame, vieModel, type VieEl, type VieGroup, type VieNode } from '../core/library/paint/fond-vie';
import { gradeFor } from '../core/library/paint/grade';
import { setIfChanged } from './svg-write';
import { useWallClockLoop } from './use-wallclock-loop';

// Calque `vie-fond` de la ville peinte (chantier « fond vivant », PR 2b) : la vie animée de la colline et du mur du fond
// (fond-vie.ts, port de `04-vie-fond.js` de la maquette). Entre les tranches peintes et la lumière de nuit, comme dans la
// maquette (notes.md §3). Nœuds constants : `vieModel` donne la liste fixe des nœuds, montée une fois ; la boucle de l'horloge
// murale (15 images/s) n'écrit que les attributs qui changent (modèle : GullsLayer). Deux découpes fixes : « au-dessus du
// premier plan et du mur du fond » (vie de la colline, lumières) et « au-dessus du premier plan » (fumées du mur du fond).
// Étalonnage : au lieu d'un filtre (le recalculer à chaque image sur toute la largeur coûterait trop sur Android), les couleurs
// sont passées dans la matrice de grade.ts (gradeHex) ; les lumières (fenêtres, réverbères, phares, cabines) ne le sont pas.
// Mouvement réduit : poses fixes, ni voitures, ni piétons, ni oiseaux en route (fond-vie.ts).
const FRAME_MS = 66;
const FADE = 'opacity 4s ease';
const reducedMotion = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// Attributs SVG à trait d'union : nom React.
const REACT_NAME: Record<string, string> = { 'stroke-width': 'strokeWidth', 'stroke-opacity': 'strokeOpacity', 'fill-opacity': 'fillOpacity', 'clip-path': 'clipPath' };
const COLOR = new Set(['fill', 'stroke']);

type Props = {
  plan: CityPaintPlan;
  moment: FondMoment;
  minutes: number;
  daylight: number;
  twilight: number;
  gloom: boolean;
  // Intensité des lumières de la ville (nuit ou ciel couvert), comme les fenêtres.
  dim: number;
  forcedNight?: boolean;
  // Jour de la ville (type de jour : trafic, grasses matinées), et brouillard de la météo (brume).
  day?: WindowDay;
  fog?: number;
  // Heure fixe (décimale, secondes comprises) : banc et tests ; sans elle, l'heure de la scène avance avec l'horloge murale.
  at?: number;
  still?: boolean;
};

export function FondLife({ plan, moment, minutes, daylight, twilight, gloom, dim, forcedNight = false, day, fog = 0, at, still: stillProp }: Props): ReactElement {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const root = useRef<SVGGElement | null>(null);
  const model = useMemo(() => vieModel(plan), [plan]);
  const D = useMemo(() => vieDay(moment, { kind: day?.kind, fog }), [moment, day?.kind, fog]);
  const still = stillProp ?? reducedMotion();
  const grade = useMemo(() => gradeFor(daylight, twilight, gloom), [daylight, twilight, gloom]);
  // Couleurs étalonnées déjà calculées (au plus quelques dizaines de teintes par minute).
  const graded = useMemo(() => {
    const cache = new Map<string, string>();
    return (c: string): string => {
      if (c[0] !== '#') return c;
      let v = cache.get(c);
      if (v === undefined) cache.set(c, (v = gradeHex(c, grade)));
      return v;
    };
  }, [grade]);
  const els = useRef<{ model: unknown; list: Element[] }>({ model: null, list: [] });
  const clock = useRef<{ m: number; base: number } | null>(null);
  const mill = useRef<{ wind: number; offset: number[] } | null>(null);
  const lit = useRef<unknown>(null);
  const place = useMemo(() => {
    return (now: number): void => {
      const el = root.current;
      if (!el) return;
      if (els.current.model !== model) {
        const byId = new Map<string, Element>();
        el.querySelectorAll('[data-vie]').forEach((n) => byId.set(n.getAttribute('data-vie')!, n));
        els.current = { model, list: model.nodes.map((n) => byId.get(n.id)!) };
      }
      let T: number;
      if (at !== undefined) T = at;
      else {
        const c = gullMinutes(clock.current, minutes, now);
        clock.current = c.clock;
        T = c.minutes / 60;
      }
      // Ailes du moulin : quand le vent change, l'angle reste continu (décalage gardé par échappée).
      const S = T * 3600;
      const wind = D.meteo.wind;
      const ms = mill.current;
      if (!ms) mill.current = { wind, offset: model.escapes.map(() => 0) };
      else if (ms.wind !== wind) {
        model.escapes.forEach((ve, k) => {
          if (ve.e.mill) ms.offset[k] = (ms.offset[k] ?? 0) + millAngle(ve.e.mill.phase, ms.wind, S) - millAngle(ve.e.mill.phase, wind, S);
        });
        ms.wind = wind;
      }
      // Lumières (nœuds fixes) : relues seulement quand la minute ou la lumière changent.
      const lights = lit.current !== place;
      lit.current = place;
      const frame = vieFrame(model, { T, D, daylight, gloom, dim, minutes, forcedNight, still, millOffset: mill.current!.offset, day, lights });
      const list = els.current.list;
      model.nodes.forEach((n, i) => {
        const node = list[i];
        const pose = frame[i]!;
        if (!node || (!lights && !n.mobile)) return;
        for (const [k, v] of Object.entries(pose.a)) setIfChanged(node, k, COLOR.has(k) && !n.light ? graded(v) : v);
        if (pose.k) pose.k.forEach((attrs, j) => {
          const kid = node.children[j];
          const tpl = n.kids?.[j];
          if (!kid) return;
          for (const [k, v] of Object.entries(attrs)) setIfChanged(kid, k, COLOR.has(k) && !tpl?.light ? graded(v) : v);
        });
      });
    };
  }, [model, D, at, minutes, daylight, gloom, dim, forcedNight, still, day, graded]);
  useWallClockLoop(place, [place], { frameMs: FRAME_MS, enabled: true });

  const render = (e: VieEl, key: string | number, id?: string): ReactNode => {
    const props: Record<string, unknown> = { key };
    if (id) props['data-vie'] = id;
    for (const [k, v] of Object.entries(e.attrs)) props[REACT_NAME[k] ?? k] = COLOR.has(k) && !e.light ? graded(v) : v;
    if (e.fade && !still) props.style = { transition: FADE };
    return createElement(e.tag, props, e.kids?.map((kid, j) => render(kid, j)));
  };
  const group = (g: VieGroup): ReactNode[] => model.nodes.filter((n: VieNode) => n.group === g).map((n) => render(n, n.id, n.id));
  const hill = `vh${uid}`;
  const wall = `vw${uid}`;
  return (
    <g data-vie-fond="" ref={root}>
      <defs>
        <clipPath id={hill} clipPathUnits="userSpaceOnUse">
          <path d={model.clipHill} />
        </clipPath>
        <clipPath id={wall} clipPathUnits="userSpaceOnUse">
          <path d={model.clipWall} />
        </clipPath>
      </defs>
      <g data-vie-colline="" clipPath={`url(#${hill})`}>
        {group('hill')}
        <g data-vie-lumieres="">{group('lights')}</g>
        {group('top')}
      </g>
      <g data-vie-mur="" clipPath={`url(#${wall})`}>
        {group('wall')}
      </g>
    </g>
  );
}
