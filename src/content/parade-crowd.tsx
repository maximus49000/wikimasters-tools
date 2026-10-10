import { memo, useMemo, useRef, useState, type ReactElement } from 'react';
import type { FestivityId } from '../core/library/city/calendar';
import { DOOR_WIDTH, STREET_SCALE, type CityMetrics } from '../core/library/city/metrics';
import { CROWD_ROW_DEPTH, CROWD_TIMES, crowdFor, crowdLevel, spectatorAt, type Spectator, type SpectatorPos } from '../core/library/city/parade';
import type { Sky } from '../core/library/sky';
import { PersonSprite, tone } from './city-sprites';
import { useSceneDayStart } from './parade-layer';
import { useWallClockLoop } from './use-wallclock-loop';

// Foule de spectateurs du 14 juillet (spec §7.4) : massée sur le trottoir, derrière les barrières (dessinées plus tard, sur la
// chaussée), en trois rangs. Personne n'apparaît ni ne disparaît sur place : chaque spectateur arrive à pied (par une entrée
// d'immeuble proche, avec le fondu court de l'encadrement de la porte, ou depuis un bord de la rue, hors champ) le long d'un
// couloir de marche derrière la foule, jusqu'à sa place, et repart de même (moteur pur `spectatorAt`, city/parade.ts).
// Les spectateurs debout sont statiques et mémoïsés ; les marcheurs (peu nombreux à la fois) sont placés à chaque image par la
// boucle de l'horloge murale, qui ne re-rend que lorsque l'ensemble des marcheurs ou le nombre de spectateurs en place change.
// Mouvement réduit : seulement les spectateurs en place au niveau courant (u < crowdLevel), immobiles.
// Hors du plafond des figurants (shopSpriteBudget) : la foule remplace les marcheurs (×0,3 pendant la fermeture) et a sa
// propre densité bornée ; comptée dans le plafond, elle ferait disparaître clients et équipes.

// Échelle selon la profondeur sur le trottoir : les rangs de derrière, plus hauts, sont un peu plus petits (1 ; 0,96 ; 0,92).
const ROW_SCALE = [1, 0.96, 0.92] as const;
const depthScale = (d: number): number => Math.min(1, Math.max(0.85, 1 - ((d - CROWD_ROW_DEPTH[0]) * 0.08) / (CROWD_ROW_DEPTH[2] - CROWD_ROW_DEPTH[0])));
// Marge (min) autour de la fenêtre de la foule : les premiers partent en avance, les derniers finissent leur trajet.
const MARGIN_MIN = 5;

type Props = { width: number; seed: number; sky: Sky; still: boolean; rainy: boolean; dayFests: readonly FestivityId[]; minutes: number; metrics: CityMetrics; doorXs: readonly number[] };

// Bras levé (repère du PersonSprite : épaule vers (4, -26)) tenant un drapeau tricolore, un téléphone ou la main ouverte.
function RaisedArm({ s, sky, still }: { s: Spectator; sky: Sky; still: boolean }): ReactElement {
  const t = (c: string): string => tone(c, sky);
  const dur = 1.1 + s.phase * 0.8;
  return (
    <g data-arm="" data-prop={s.prop}>
      {!still && s.prop !== 'phone' && (
        <animateTransform attributeName="transform" type="rotate" values="-12 4 -26;12 4 -26;-12 4 -26" dur={`${dur.toFixed(2)}s`} begin={`-${(s.phase * dur).toFixed(2)}s`} repeatCount="indefinite" />
      )}
      <path d="M4 -26 L7.2 -37" stroke={t(s.outfit.topColor)} strokeWidth={2.4} strokeLinecap="round" fill="none" />
      <circle cx={7.4} cy={-38} r={s.prop === 'wave' ? 1.7 : 1.3} fill={t(s.outfit.skin)} />
      {s.prop === 'flag' && (
        <>
          <line x1={7.4} y1={-37} x2={7.4} y2={-49} stroke="#6B5B4A" strokeWidth={0.8} />
          <rect x={7.4} y={-49} width={2.4} height={5} fill={t('#2B4FA0')} />
          <rect x={9.8} y={-49} width={2.4} height={5} fill={t('#F2F2F2')} />
          <rect x={12.2} y={-49} width={2.4} height={5} fill={t('#C0302B')} />
        </>
      )}
      {s.prop === 'phone' && (
        <>
          <rect x={5.6} y={-43.5} width={3.6} height={5.4} rx={0.6} fill="#1E1E24" />
          <rect x={6.1} y={-43} width={2.6} height={4.2} fill="#9FD3FF" opacity={0.85} />
        </>
      )}
    </g>
  );
}

// Debout : bras levé (drapeau, téléphone, main). En marche : jambes au pas, le drapeau porté haut sans l'agiter, l'enfant
// reste sur les épaules.
const SpectatorSprite = memo(function SpectatorSprite({ s, sky, still, rainy, walking }: { s: Spectator; sky: Sky; still: boolean; rainy: boolean; walking: boolean }): ReactElement {
  const arm = walking ? (s.prop === 'flag' ? <RaisedArm s={s} sky={sky} still /> : null) : s.prop !== 'none' ? <RaisedArm s={s} sky={sky} still={still} /> : null;
  return (
    <>
      {/* Enfant sur les épaules : dessiné avant l'adulte, dont la tête cache le bas de ses jambes. */}
      {s.kind === 'shoulders' && s.child && (
        <g data-shoulders="" transform="translate(0 -27) scale(0.62)">
          <PersonSprite outfit={s.child} sky={sky} rainy={rainy} umbrella={false} />
        </g>
      )}
      <PersonSprite outfit={s.outfit} sky={sky} rainy={rainy} umbrella={false} stride={walking ? s.phase : null} />
      {arm}
    </>
  );
});

const transformOf = (s: Spectator, p: SpectatorPos, m: CityMetrics, standing: boolean): string => {
  const k = m.unit * STREET_SCALE.person * (standing ? ROW_SCALE[s.row] : depthScale(p.depth)) * (s.kind === 'child' ? 0.7 : 1);
  const y = m.curb - p.depth * m.unit;
  return `translate(${p.x.toFixed(1)} ${y.toFixed(1)}) scale(${(p.dir * k).toFixed(3)} ${k.toFixed(3)})`;
};

export function ParadeCrowd({ width, seed, sky, still, rainy, dayFests, minutes, metrics, doorXs }: Props): ReactElement | null {
  const bastille = dayFests.includes('bastille');
  const doorKey = doorXs.join(',');
  // Devant une entrée, le rang du fond s'écarte : on voit encore la porte entre les têtes.
  const doorClear = DOOR_WIDTH / 2 + 2;
  const all = useMemo(
    () => (bastille ? crowdFor(seed, width, doorXs.map((d) => d + DOOR_WIDTH / 2)) : []).filter((s) => !(s.row === 2 && doorXs.some((d) => Math.abs(d + DOOR_WIDTH / 2 - s.x) < doorClear))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bastille, seed, width, doorKey],
  );
  const on = bastille && minutes >= CROWD_TIMES.arrive - MARGIN_MIN && minutes < CROWD_TIMES.gone + MARGIN_MIN;
  const now = Date.now() / 1000;
  const dayStart = useSceneDayStart(minutes, now);
  const statesAt = (t: number): SpectatorPos[] => all.map((s) => spectatorAt(s, t, dayStart));
  // Signature de ce qui est monté : nombre de spectateurs en place (monotone à l'arrivée comme au départ) et marcheurs.
  const sigOf = (states: readonly SpectatorPos[]): string => {
    let n = 0;
    const w: string[] = [];
    states.forEach((p, i) => {
      if (p.mode === 'standing') n++;
      else if (p.mode === 'walking') w.push(all[i]!.id);
    });
    return `${n}|${w.join(',')}`;
  };
  const [sig, setSig] = useState('');
  const root = useRef<SVGGElement | null>(null);

  const place = useMemo(
    () => (t: number): void => {
      if (still || !on) return;
      const states = statesAt(t);
      const key = sigOf(states);
      if (key !== sig) setSig(key);
      const el = root.current;
      if (!el) return;
      states.forEach((p, i) => {
        if (p.mode !== 'walking') return;
        const node = el.querySelector(`[data-spectator-id="${all[i]!.id}"]`);
        if (!node) return;
        node.setAttribute('transform', transformOf(all[i]!, p, metrics, false));
        node.setAttribute('opacity', (p.fade ?? 1).toFixed(2));
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [all, dayStart, sig, still, on, metrics],
  );
  useWallClockLoop(place, [place]);

  // Rendu : l'état à l'instant présent (mouvement réduit : les spectateurs en place au niveau de la minute).
  const level = crowdLevel(minutes);
  const states = on && !still ? statesAt(now) : [];
  const standing = on ? (still ? all.filter((s) => s.u < level) : all.filter((_, i) => states[i]!.mode === 'standing')) : [];
  const walkers = on && !still ? all.map((s, i) => [s, states[i]!] as const).filter(([, p]) => p.mode === 'walking') : [];
  const standKey = standing.map((s) => s.id).join(',');
  const standNodes = useMemo(
    () =>
      [...standing].sort((a, b) => b.row - a.row).map((s) => (
        <g key={s.id} data-spectator="" data-spectator-id={s.id} data-row={s.row} data-kind={s.kind} data-mode="standing" transform={transformOf(s, { x: s.x, depth: CROWD_ROW_DEPTH[s.row] + s.jitter * 1.2, dir: s.dir, mode: 'standing' }, metrics, true)}>
          <SpectatorSprite s={s} sky={sky} still={still} rainy={rainy} walking={false} />
        </g>
      )),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [standKey, sky, still, rainy, metrics],
  );
  if (!on || (standing.length === 0 && walkers.length === 0)) return null;
  return (
    <g data-parade-crowd="" data-level={level.toFixed(2)} ref={root}>
      {/* Marcheurs : dans le couloir derrière la foule, dessinés avant elle. */}
      {walkers.map(([s, p]) => (
        <g
          key={s.id}
          data-spectator=""
          data-spectator-id={s.id}
          data-row={s.row}
          data-kind={s.kind}
          data-mode="walking"
          data-door={p.fade !== undefined ? 'true' : undefined}
          transform={transformOf(s, p, metrics, false)}
          opacity={(p.fade ?? 1).toFixed(2)}
        >
          <SpectatorSprite s={s} sky={sky} still={still} rainy={rainy} walking />
        </g>
      ))}
      {standNodes}
    </g>
  );
}
