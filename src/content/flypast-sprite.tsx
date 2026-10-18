import { useContext, useMemo, useRef, type ReactElement } from 'react';
import type { FestivityId } from '../core/library/city/calendar';
import { flypastWindow } from '../core/library/city/parade';
import { HELI_CYCLE_S } from '../core/library/paint/props/sky';
import type { Sky } from '../core/library/sky';
import { ArtGroup, contrailArt, syncArt, type Art } from './city-event-art';
import { tone } from './city-sprites';
import { useSceneDayStart } from './parade-layer';
import { CycledProp, PropContext, PropImage, collectCycles, placeCycles, type CycledNode } from './prop/prop-host';
import { useWallClockLoop } from './use-wallclock-loop';

// Défilé aérien du 14 juillet (spec §7.4) : la Patrouille de France (7 avions en flèche, traînées bleu, blanc, rouge) traverse
// le ciel en ~40 s à 10 h (`flypastWindow`), puis deux hélicoptères passent plus bas, plus lentement. Monté dans le calque
// du ciel (derrière les immeubles proches). Mouvement réduit : rien. Les positions sont posées par la boucle (transform).
// Ghibli (G5) : avions en image `jet`, fumées tricolores en particules (comme la traînée de l'avion de ligne, teintées) que
// la boucle fait onduler ; hélicoptères en poses cycliques `helicopter` (vert armée, cocarde), posées par la même boucle.

const BLUE = '#2B4FA0';
const WHITE = '#F2F2F2';
const RED = '#C0302B';
const HELI_S = 60; // traversée des hélicoptères, après la patrouille
// Flèche de la patrouille (repère du chef : x vers l'avant), et couleur de la traînée selon la hauteur (haut → bas).
const FORMATION: readonly { dx: number; dy: number; smoke: string }[] = [
  { dx: -18, dy: -10, smoke: BLUE },
  { dx: -9, dy: -5, smoke: BLUE },
  { dx: -27, dy: -2.5, smoke: WHITE },
  { dx: 0, dy: 0, smoke: WHITE },
  { dx: -27, dy: 2.5, smoke: WHITE },
  { dx: -9, dy: 5, smoke: RED },
  { dx: -18, dy: 10, smoke: RED },
];
const SPAN = 30; // demi-largeur de la flèche (hors traînées), unités du dessin
const TRAIL = 220; // longueur des traînées
const JET_SCALE = 1.3; // avions (et traînées, et flèche) agrandis par rapport à l'échelle du ciel

// Fumée d'un avion (Ghibli) : les particules de la traînée de condensation (2 × 42 disques nés derrière les réacteurs, à
// y 7 et 10), ramenées derrière la tuyère (y 0) et étirées sur la longueur TRAIL, dans la couleur du rang.
const SMOKE_K = TRAIL / 150;
function smokeArt(t: number, smoke: string): Art[] {
  return contrailArt(t).map((c) => ({ tag: 'circle', attrs: { cx: ((Number(c.attrs.cx) + 14) * SMOKE_K - 5).toFixed(1), cy: ((Number(c.attrs.cy) - 8.5) * 0.5).toFixed(2), r: (Number(c.attrs.r) * 1.1).toFixed(2), fill: smoke, opacity: c.attrs.opacity! } }));
}
// Pose des fumées de la patrouille à l'instant t (boucle du calque ; exporté pour les tests).
export function poseSmoke(root: Element, t: number): void {
  for (const g of root.querySelectorAll('[data-smoke]')) syncArt(g, smokeArt(t, g.getAttribute('data-smoke')!));
}

function Jet({ sky, smoke, ghibli, t }: { sky: Sky; smoke: string; ghibli: boolean; t: number }): ReactElement {
  const tn = (c: string): string => tone(c, sky);
  const classic = (
    <>
      <path d="M-5 0 L5 -0.9 Q8 0 5 0.9Z" fill={tn(BLUE)} />
      <path d="M0 0 L-3.5 2.6 L-1.8 2.6 L2 0Z M0 0 L-3.5 -2.6 L-1.8 -2.6 L2 0Z" fill={tn(BLUE)} />
      <path d="M-5 0 L-6.4 -2.6 L-4.6 -2.6 L-3.2 -0.4Z" fill={tn(RED)} />
      <rect x={-2} y={-0.3} width={5} height={0.6} fill={tn(WHITE)} />
    </>
  );
  return (
    <g data-jet="">
      {/* Traînée qui se dissipe vers l'arrière */}
      {ghibli ? (
        <ArtGroup data-smoke={smoke} arts={smokeArt(t, smoke)} />
      ) : (
        [0.8, 0.55, 0.32, 0.14].map((o, i) => <rect key={i} x={-5 - (TRAIL / 4) * (i + 1)} y={-1.1} width={TRAIL / 4 + 0.5} height={2.2} fill={smoke} opacity={o} />)
      )}
      {ghibli ? <PropImage spec={{ id: 'jet', day: sky.daylight }} fallback={<g>{classic}</g>} /> : classic}
    </g>
  );
}

function Helicopter({ sky, still, ghibli, phase }: { sky: Sky; still: boolean; ghibli: boolean; phase: number }): ReactElement {
  const t = (c: string): string => tone(c, sky);
  const c = t('#4B5320');
  const classic = (
    <>
      <ellipse cx={0} cy={0} rx={11} ry={5.5} fill={c} />
      <rect x={-26} y={-1.6} width={16} height={2.6} fill={c} />
      <path d="M-26 -1.6 L-28 -6 H-25 L-23 -1.6Z" fill={c} />
      <circle cx={6} cy={-0.8} r={3.2} fill={t('#CFE4F2')} />
      <path d="M-6 7 H9 M-4 5.5 V7 M7 5.5 V7" stroke="#333" fill="none" />
      <line x1={0} y1={-5.5} x2={0} y2={-8} stroke="#333" />
      <line x1={-19} y1={-8} x2={19} y2={-8} stroke="#333" strokeWidth={1.3}>
        {!still && !ghibli && <animateTransform attributeName="transform" type="scale" values="1 1;0.1 1;1 1" dur="0.22s" repeatCount="indefinite" />}
      </line>
      {/* Cocarde */}
      <circle cx={-14} cy={-0.3} r={1.6} fill={t(BLUE)} />
      <circle cx={-14} cy={-0.3} r={1} fill={t(WHITE)} />
      <circle cx={-14} cy={-0.3} r={0.5} fill={t(RED)} />
    </>
  );
  return (
    <g data-flypast-helicopter="">
      {ghibli ? <CycledProp spec={{ id: 'helicopter', args: { c: '#4B5320', roundel: true }, day: sky.daylight, lit: sky.daylight < 0.3 }} period={HELI_CYCLE_S} phase={phase} fallback={<g>{classic}</g>} /> : classic}
    </g>
  );
}

type Props = { width: number; height: number; sky: Sky; still: boolean; dayFests: readonly FestivityId[]; minutes: number; ghibli?: boolean };

export function FlypastLayer({ width, height, sky, still, dayFests, minutes, ghibli = false }: Props): ReactElement | null {
  // La fenêtre (10 h 00, 40 s de patrouille puis une minute d'hélicoptères) tient dans les minutes 600 à 601.
  const on = !still && dayFests.includes('bastille') && minutes >= 600 && minutes < 602;
  const now = Date.now() / 1000;
  const dayStart = useSceneDayStart(minutes, now);
  const win = useMemo(() => flypastWindow(dayStart), [dayStart]);
  const k = height / 340;
  const jets = useRef<SVGGElement | null>(null);
  const helis = useRef<SVGGElement | null>(null);
  const root = useRef<SVGGElement | null>(null);
  const props = useContext(PropContext);

  // Position des deux groupes à l'instant t (null hors de leur passage).
  const jetsAt = (t: number): string | null => {
    if (t < win.start || t > win.end) return null;
    const kj = k * JET_SCALE;
    const x = -SPAN * kj + ((t - win.start) / (win.end - win.start)) * (width + 2 * SPAN * kj);
    return `translate(${x.toFixed(1)} ${(height * 0.13).toFixed(1)}) scale(${kj.toFixed(3)})`;
  };
  const helisAt = (t: number): string | null => {
    const s = win.end;
    if (t < s || t > s + HELI_S) return null;
    const x = -40 * k + ((t - s) / HELI_S) * (width + 80 * k);
    return `translate(${x.toFixed(1)} ${(height * 0.24).toFixed(1)}) scale(${k.toFixed(3)})`;
  };
  const place = useMemo(
    () => {
      // Ghibli : nœuds cycliques des hélicoptères, relus si le calque a été remonté.
      let cycles: CycledNode[] | null = null;
      return (t: number): void => {
        for (const [el, tr] of [[jets.current, jetsAt(t)], [helis.current, helisAt(t)]] as const) {
          if (!el) continue;
          el.setAttribute('display', tr ? 'inline' : 'none');
          if (tr) el.setAttribute('transform', tr);
        }
        if (!ghibli || !root.current) return;
        if (jets.current && jetsAt(t)) poseSmoke(jets.current, t);
        if (!cycles || cycles.some((c) => !c.node.isConnected)) cycles = collectCycles(root.current);
        if (helisAt(t)) placeCycles(cycles, t, props);
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [win, width, height, ghibli, props],
  );
  useWallClockLoop(place, [place]);

  if (!on) return null;
  const j = jetsAt(now);
  const h = helisAt(now);
  return (
    <g data-flypast="" ref={root}>
      <g ref={jets} data-flypast-jets="" display={j ? 'inline' : 'none'} transform={j ?? undefined}>
        {FORMATION.map((p, i) => (
          <g key={i} transform={`translate(${p.dx} ${p.dy})`}>
            <Jet sky={sky} smoke={p.smoke} ghibli={ghibli} t={now} />
          </g>
        ))}
      </g>
      <g ref={helis} data-flypast-helicopters="" display={h ? 'inline' : 'none'} transform={h ?? undefined}>
        <Helicopter sky={sky} still={still} ghibli={ghibli} phase={0} />
        <g transform="translate(-48 5) scale(0.9)">
          <Helicopter sky={sky} still={still} ghibli={ghibli} phase={0.5} />
        </g>
      </g>
    </g>
  );
}
