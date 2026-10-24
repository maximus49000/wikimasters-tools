import { createElement, useId, useMemo, useRef, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { gullMinutes } from '../core/library/city/gulls';
import type { WindowDay } from '../core/library/city/window-lights';
import type { CityPaintPlan } from '../core/library/paint/city-plan';
import type { FondMoment } from '../core/library/paint/fond-time';
import { gradeHex, millAngle, vieDay, vieFrame, vieModel, type VieEl, type VieGroup, type VieNode } from '../core/library/paint/fond-vie';
import { gradeFor } from '../core/library/paint/grade';
import { mixHex } from '../core/library/sky';
import { useFondSkyHost, veilAlphaAt, type FondSkyHost } from './fond-sky-slot';
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
// Avec le calque météo, la grue et les ailes des moulins sont rendues par un portail dans son emplacement, devant les nuages
// (fond-sky-slot.tsx) : mêmes nœuds, même boucle.
const FRAME_MS = 66;
const FADE = 'opacity 4s ease';
const reducedMotion = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// Attributs SVG à trait d'union : nom React.
const REACT_NAME: Record<string, string> = { 'stroke-width': 'strokeWidth', 'stroke-opacity': 'strokeOpacity', 'fill-opacity': 'fillOpacity', 'clip-path': 'clipPath' };
const COLOR = new Set(['fill', 'stroke']);
// Nœuds dessinés devant les nuages quand la météo a son emplacement (fond-sky-slot.tsx) : grue (mât, flèche, haubans, charge),
// son feu, ailes des moulins.
const SKY_NODE = /^(grue|grue-feu|moulin)-(\d+)$/;
// Opacité du voile mêlée aux couleurs : au 64e (une écriture seulement quand elle change d'un cran).
const veilStep = (a: number): number => Math.round(a * 64) / 64;
const putColor = (el: Element, name: string, value: string): void => {
  if (el.getAttribute(name) !== value) el.setAttribute(name, value);
};

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
  // Grue et ailes devant les nuages : ville (fondSig) dont l'emplacement est cherché dans le calque météo, visibilité et
  // fondu de la ville peinte (le portail n'est pas dans le groupe de la ville peinte) ; sans lui, tout reste dans vie-fond.
  sky?: { sig: string; shown: boolean; fade: string };
};

export function FondLife({ plan, moment, minutes, daylight, twilight, gloom, dim, forcedNight = false, day, fog = 0, at, still: stillProp, sky }: Props): ReactElement {
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
  const host = useFondSkyHost(sky?.sig ?? null);
  // Hauteur de chaque nœud du ciel (dégradé du voile) : haut du mât de la grue et de son feu, moyeu des ailes.
  const skyY = useMemo(() => {
    const out = new Map<string, number>();
    for (const n of model.nodes) {
      const m = SKY_NODE.exec(n.id);
      if (!m) continue;
      const e = model.escapes[Number(m[2])]!.e;
      out.set(n.id, m[1] === 'moulin' && e.mill ? e.mill.y - 13 * e.mill.s : e.crane.base - e.crane.mast);
    }
    return out;
  }, [model]);
  // Couleur d'un nœud du ciel sous le voile de la météo (étalonnée d'abord, sauf les lumières), comme si le voile était posé
  // dessus : couleur × (1 − a) + voile × a.
  const veiled = useMemo(() => {
    const cache = new Map<string, string>();
    return (c: string, light: boolean | undefined, h: FondSkyHost, y: number): string => {
      if (c[0] !== '#') return c;
      const a = veilStep(veilAlphaAt(h.veil, y, h.height));
      const key = `${c}|${light ? 1 : 0}|${h.veil.color}|${a}`;
      let v = cache.get(key);
      if (v === undefined) {
        if (cache.size > 512) cache.clear();
        cache.set(key, (v = mixHex(light ? c : graded(c), h.veil.color, a)));
      }
      return v;
    };
  }, [graded]);
  const els = useRef<{ model: unknown; host: unknown; list: Element[] }>({ model: null, host: null, list: [] });
  const clock = useRef<{ m: number; base: number } | null>(null);
  const mill = useRef<{ wind: number; offset: number[] } | null>(null);
  const lit = useRef<unknown>(null);
  const place = useMemo(() => {
    // Voile déjà mêlé aux couleurs des nœuds du ciel (clé couleur | opacité au 64e) ; vide : à réécrire.
    let lastVeil = '';
    return (now: number): void => {
      const el = root.current;
      if (!el) return;
      if (els.current.model !== model || els.current.host !== host) {
        const byId = new Map<string, Element>();
        el.querySelectorAll('[data-vie]').forEach((n) => byId.set(n.getAttribute('data-vie')!, n));
        host?.el.querySelectorAll('[data-vie]').forEach((n) => byId.set(n.getAttribute('data-vie')!, n));
        els.current = { model, host, list: model.nodes.map((n) => byId.get(n.id)!) };
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
      // Voile de la météo sur la grue et les ailes : couleurs réécrites seulement quand il change d'un cran (rare).
      if (host) {
        const key = `${host.veil.color}|${Math.round(host.veil.alpha * 64)}`;
        if (key !== lastVeil) {
          lastVeil = key;
          model.nodes.forEach((n, i) => {
            const y = skyY.get(n.id);
            const node = list[i];
            if (y === undefined || !node) return;
            for (const [k, v] of Object.entries(n.attrs)) if (COLOR.has(k)) putColor(node, k, veiled(v, n.light, host, y));
            n.kids?.forEach((tpl, j) => {
              const kid = node.children[j];
              if (kid) for (const [k, v] of Object.entries(tpl.attrs)) if (COLOR.has(k)) putColor(kid, k, veiled(v, tpl.light, host, y));
            });
          });
        }
      }
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
  }, [model, D, at, minutes, daylight, gloom, dim, forcedNight, still, day, graded, host, skyY, veiled]);
  useWallClockLoop(place, [place], { frameMs: FRAME_MS, enabled: true });

  // `y` : nœud du ciel rendu dans l'emplacement de la météo (couleurs sous son voile, lu au rendu ; la boucle suit ensuite).
  const render = (e: VieEl, key: string | number, id?: string, y?: number): ReactNode => {
    const props: Record<string, unknown> = { key };
    if (id) props['data-vie'] = id;
    for (const [k, v] of Object.entries(e.attrs)) props[REACT_NAME[k] ?? k] = !COLOR.has(k) ? v : host && y !== undefined ? veiled(v, e.light, host, y) : e.light ? v : graded(v);
    if (e.fade && !still) props.style = { transition: FADE };
    return createElement(e.tag, props, e.kids?.map((kid, j) => render(kid, j, undefined, y)));
  };
  const inSky = (n: VieNode): boolean => host !== null && skyY.has(n.id);
  const group = (g: VieGroup): ReactNode[] => model.nodes.filter((n: VieNode) => n.group === g && !inSky(n)).map((n) => render(n, n.id, n.id));
  const skyGroup = (g: VieGroup): ReactNode[] => model.nodes.filter((n: VieNode) => n.group === g && inSky(n)).map((n) => render(n, n.id, n.id, skyY.get(n.id)));
  const hill = `vh${uid}`;
  const wall = `vw${uid}`;
  const skyClip = `vc${uid}`;
  // Devant les nuages : même découpe que la vie de la colline (au-dessus du premier plan et du mur du fond), même ordre (grue
  // et ailes, puis le feu de la grue), visibilité et fondu de la ville peinte.
  const portal =
    host &&
    createPortal(
      <g data-vie-fond-ciel="" style={{ opacity: sky?.shown === false ? 0 : 1, transition: sky?.fade }}>
        <defs>
          <clipPath id={skyClip} clipPathUnits="userSpaceOnUse">
            <path d={model.clipHill} />
          </clipPath>
        </defs>
        <g clipPath={`url(#${skyClip})`}>
          {skyGroup('hill')}
          {skyGroup('lights')}
        </g>
      </g>,
      host.el,
    );
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
      {portal}
    </g>
  );
}
