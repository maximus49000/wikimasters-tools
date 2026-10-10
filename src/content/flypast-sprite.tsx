import { useMemo, useRef, type ReactElement } from 'react';
import type { FestivityId } from '../core/library/city/calendar';
import { flypastWindow } from '../core/library/city/parade';
import type { Sky } from '../core/library/sky';
import { tone } from './city-sprites';
import { useSceneDayStart } from './parade-layer';
import { useWallClockLoop } from './use-wallclock-loop';

// Défilé aérien du 14 juillet (spec §7.4) : la Patrouille de France (7 avions en flèche, traînées bleu, blanc, rouge) traverse
// le ciel en ~40 s à 10 h (`flypastWindow`), puis deux hélicoptères passent plus bas, plus lentement. Monté dans le calque
// du ciel (derrière les immeubles proches). Mouvement réduit : rien. Les positions sont posées par la boucle (transform).

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

function Jet({ sky, smoke }: { sky: Sky; smoke: string }): ReactElement {
  const t = (c: string): string => tone(c, sky);
  return (
    <g data-jet="">
      {/* Traînée qui se dissipe vers l'arrière */}
      {[0.8, 0.55, 0.32, 0.14].map((o, i) => (
        <rect key={i} x={-5 - (TRAIL / 4) * (i + 1)} y={-1.1} width={TRAIL / 4 + 0.5} height={2.2} fill={smoke} opacity={o} />
      ))}
      <path d="M-5 0 L5 -0.9 Q8 0 5 0.9Z" fill={t(BLUE)} />
      <path d="M0 0 L-3.5 2.6 L-1.8 2.6 L2 0Z M0 0 L-3.5 -2.6 L-1.8 -2.6 L2 0Z" fill={t(BLUE)} />
      <path d="M-5 0 L-6.4 -2.6 L-4.6 -2.6 L-3.2 -0.4Z" fill={t(RED)} />
      <rect x={-2} y={-0.3} width={5} height={0.6} fill={t(WHITE)} />
    </g>
  );
}

function Helicopter({ sky, still }: { sky: Sky; still: boolean }): ReactElement {
  const t = (c: string): string => tone(c, sky);
  const c = t('#4B5320');
  return (
    <g data-flypast-helicopter="">
      <ellipse cx={0} cy={0} rx={11} ry={5.5} fill={c} />
      <rect x={-26} y={-1.6} width={16} height={2.6} fill={c} />
      <path d="M-26 -1.6 L-28 -6 H-25 L-23 -1.6Z" fill={c} />
      <circle cx={6} cy={-0.8} r={3.2} fill={t('#CFE4F2')} />
      <path d="M-6 7 H9 M-4 5.5 V7 M7 5.5 V7" stroke="#333" fill="none" />
      <line x1={0} y1={-5.5} x2={0} y2={-8} stroke="#333" />
      <line x1={-19} y1={-8} x2={19} y2={-8} stroke="#333" strokeWidth={1.3}>
        {!still && <animateTransform attributeName="transform" type="scale" values="1 1;0.1 1;1 1" dur="0.22s" repeatCount="indefinite" />}
      </line>
      {/* Cocarde */}
      <circle cx={-14} cy={-0.3} r={1.6} fill={t(BLUE)} />
      <circle cx={-14} cy={-0.3} r={1} fill={t(WHITE)} />
      <circle cx={-14} cy={-0.3} r={0.5} fill={t(RED)} />
    </g>
  );
}

type Props = { width: number; height: number; sky: Sky; still: boolean; dayFests: readonly FestivityId[]; minutes: number };

export function FlypastLayer({ width, height, sky, still, dayFests, minutes }: Props): ReactElement | null {
  // La fenêtre (10 h 00, 40 s de patrouille puis une minute d'hélicoptères) tient dans les minutes 600 à 601.
  const on = !still && dayFests.includes('bastille') && minutes >= 600 && minutes < 602;
  const now = Date.now() / 1000;
  const dayStart = useSceneDayStart(minutes, now);
  const win = useMemo(() => flypastWindow(dayStart), [dayStart]);
  const k = height / 340;
  const jets = useRef<SVGGElement | null>(null);
  const helis = useRef<SVGGElement | null>(null);

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
    () => (t: number): void => {
      for (const [el, tr] of [[jets.current, jetsAt(t)], [helis.current, helisAt(t)]] as const) {
        if (!el) continue;
        el.setAttribute('display', tr ? 'inline' : 'none');
        if (tr) el.setAttribute('transform', tr);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [win, width, height],
  );
  useWallClockLoop(place, [place]);

  if (!on) return null;
  const j = jetsAt(now);
  const h = helisAt(now);
  return (
    <g data-flypast="">
      <g ref={jets} data-flypast-jets="" display={j ? 'inline' : 'none'} transform={j ?? undefined}>
        {FORMATION.map((p, i) => (
          <g key={i} transform={`translate(${p.dx} ${p.dy})`}>
            <Jet sky={sky} smoke={p.smoke} />
          </g>
        ))}
      </g>
      <g ref={helis} data-flypast-helicopters="" display={h ? 'inline' : 'none'} transform={h ?? undefined}>
        <Helicopter sky={sky} still={still} />
        <g transform="translate(-48 5) scale(0.9)">
          <Helicopter sky={sky} still={still} />
        </g>
      </g>
    </g>
  );
}
