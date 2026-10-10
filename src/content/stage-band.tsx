import { useMemo, useRef, useState, type ReactElement } from 'react';
import { WALK_PACE } from '../core/library/city/metrics';
import type { Outfit } from '../core/library/city/people';
import { WORLD_MARGIN } from '../core/library/scene-world';
import type { Sky } from '../core/library/sky';
import { PersonSprite, tone } from './city-sprites';
import { STAGE, STAGE_STAND, spotLens } from './install-sprites';
import { useSceneDayStart } from './parade-layer';
import { useWallClockLoop } from './use-wallclock-loop';

// Musiciens de la scène de la Fête de la musique et faisceaux des projecteurs (spec §7.3). Repère de la scène : centre x = 0,
// arête avant du plancher à y = -STAGE.floor ; les musiciens ont les pieds sur le dessus du plancher (STAGE_STAND). La nuit,
// ils sont éclairés par les projecteurs (`lit`) : leur teinte reste lisible au lieu de prendre celle de la nuit. Les faisceaux sont des cônes dont la POINTE est la lentille d'un projecteur de la
// traverse (STAGE.spotXs / spotY) et dont la base est sur le plancher sous un musicien : aucun cône flottant.
// Animation (SMIL) seulement hors mouvement réduit : balancement des musiciens, respiration des faisceaux.

export type Instrument = 'guitar' | 'mic' | 'drum';
// Un musicien par projecteur (même index) : guitare / ukulélé, chanteuse au micro sur pied, batteur au tambour.
export const MUSICIANS: readonly { x: number; instrument: Instrument }[] = [
  { x: -24, instrument: 'guitar' },
  { x: 0, instrument: 'mic' },
  { x: 24, instrument: 'drum' },
];
const SCALE = 0.8;
const BEAM_HALF = 9;

function Prop({ kind, sky }: { kind: Instrument; sky: Sky }): ReactElement {
  const t = (c: string): string => tone(c, sky);
  if (kind === 'guitar') {
    return (
      <g data-instrument="guitar">
        <ellipse cx={3} cy={-15} rx={4.2} ry={3.4} fill={t('#B5723A')} transform="rotate(-18 3 -15)" />
        <circle cx={3} cy={-15} r={1} fill={t('#2A1A10')} />
        <line x1={6} y1={-17} x2={15} y2={-24} stroke={t('#5A3A22')} strokeWidth={1.2} strokeLinecap="round" />
      </g>
    );
  }
  if (kind === 'mic') {
    return (
      <g data-instrument="mic">
        <line x1={7} y1={0} x2={7} y2={-26} stroke={t('#2A2D34')} strokeWidth={0.9} />
        <line x1={4} y1={0} x2={10} y2={0} stroke={t('#2A2D34')} strokeWidth={1} strokeLinecap="round" />
        <circle cx={7} cy={-27.5} r={1.7} fill={t('#4A4E58')} />
      </g>
    );
  }
  // Caisse claire sur pied, un peu plus grande que le buste du batteur, baguettes en l'air.
  return (
    <g data-instrument="drum">
      <rect x={4} y={-17} width={16} height={11} rx={1.4} fill={t('#B02A2A')} />
      <rect x={4} y={-17} width={16} height={2.4} rx={1.1} fill={t('#E8E8E0')} />
      <rect x={4} y={-8.2} width={16} height={1.4} fill={t('#E8E8E0')} />
      <line x1={5.5} y1={-6} x2={4.5} y2={0} stroke={t('#2A2D34')} strokeWidth={0.9} />
      <line x1={18.5} y1={-6} x2={19.5} y2={0} stroke={t('#2A2D34')} strokeWidth={0.9} />
      <line x1={1} y1={-26} x2={8} y2={-18} stroke={t('#D8C8A0')} strokeWidth={0.9} strokeLinecap="round" />
      <line x1={-1} y1={-24} x2={5} y2={-17} stroke={t('#D8C8A0')} strokeWidth={0.9} strokeLinecap="round" />
    </g>
  );
}

// ---------- Arrivée et départ à pied ----------
// Les musiciens arrivent à pied par le bord de la rue le plus proche de la scène (hors champ), longent le trottoir, montent sur
// le plancher par le côté et gagnent leur place, l'un après l'autre (le plus éloigné d'abord) entre 16 h 46 et 17 h. À minuit,
// ils repartent de même (le plus proche de la sortie d'abord), de 0 h 01 à 0 h 15, avant l'équipe de nuit. Moteur pur :
// position depuis l'instant (s) et le début du jour de la fête (`dayStartS`).
export type MusicianMode = 'absent' | 'walking' | 'playing';
// `lift` : 0 = pieds sur le trottoir, 1 = pieds sur le plancher ; `trip` : 'in' à l'arrivée, 'out' au départ.
export type MusicianPos = { x: number; lift: number; dir: 1 | -1; mode: MusicianMode; trip?: 'in' | 'out' };
export type StageGeom = { stageX: number; width: number; unit: number };
const ARRIVE_MIN = [16 * 60 + 46, 16 * 60 + 50, 16 * 60 + 54] as const;
const LEAVE_MIN = [24 * 60 + 1, 24 * 60 + 5, 24 * 60 + 9] as const;
export const MUSICIAN_SPEED = 22 * WALK_PACE;
type P = { x: number; y: number };
const sideOf = (g: StageGeom): 1 | -1 => (g.stageX < g.width / 2 ? -1 : 1);
// Chemin (px du monde ; y = hauteur au-dessus du trottoir, en px) du bord de la rue à la place sur le plancher.
function pathTo(i: number, g: StageGeom): P[] {
  const side = sideOf(g);
  const u = g.unit;
  const up = -STAGE_STAND * u;
  return [
    { x: side < 0 ? -WORLD_MARGIN : g.width + WORLD_MARGIN, y: 0 },
    { x: g.stageX + side * (STAGE.half + 4) * u, y: 0 },
    { x: g.stageX + side * (STAGE.half - 6) * u, y: up },
    { x: g.stageX + MUSICIANS[i]!.x * u, y: up },
  ];
}
const segLen = (a: P, b: P): number => Math.hypot(b.x - a.x, b.y - a.y);
const pathLen = (p: readonly P[]): number => p.slice(1).reduce((acc, q, k) => acc + segLen(p[k]!, q), 0);
function pointAt(p: readonly P[], dist: number): P {
  let left = Math.max(0, dist);
  for (let k = 1; k < p.length; k++) {
    const l = segLen(p[k - 1]!, p[k]!);
    if (left <= l && l > 0) return { x: p[k - 1]!.x + ((p[k]!.x - p[k - 1]!.x) * left) / l, y: p[k - 1]!.y + ((p[k]!.y - p[k - 1]!.y) * left) / l };
    left -= l;
  }
  return p[p.length - 1]!;
}
// Rang d'arrivée : le plus éloigné de l'entrée d'abord ; rang de départ : le plus proche de la sortie d'abord.
const rankOf = (i: number, g: StageGeom, first: 'far' | 'near'): number => {
  const side = sideOf(g);
  const order = MUSICIANS.map((m, k) => ({ k, d: side * m.x })).sort((a, b) => (first === 'far' ? a.d - b.d : b.d - a.d));
  return order.findIndex((o) => o.k === i);
};

export function musicianAt(i: number, t: number, dayStartS: number, g: StageGeom): MusicianPos {
  const path = pathTo(i, g);
  const len = pathLen(path);
  const dur = len / MUSICIAN_SPEED;
  const inStart = dayStartS + ARRIVE_MIN[rankOf(i, g, 'far')]! * 60;
  const outStart = dayStartS + LEAVE_MIN[rankOf(i, g, 'near')]! * 60;
  const up = -STAGE_STAND * g.unit;
  const side = sideOf(g);
  const toward = (-side) as 1 | -1;
  const pos = (d: number, dir: 1 | -1, trip: 'in' | 'out'): MusicianPos => {
    const p = pointAt(path, d);
    return { x: p.x, lift: up > 0 ? p.y / up : 0, dir, mode: 'walking', trip };
  };
  if (t < inStart) return { x: path[0]!.x, lift: 0, dir: toward, mode: 'absent' };
  if (t < inStart + dur) return pos((t - inStart) * MUSICIAN_SPEED, toward, 'in');
  if (t < outStart) return { x: path[path.length - 1]!.x, lift: 1, dir: 1, mode: 'playing' };
  if (t < outStart + dur) return pos(len - (t - outStart) * MUSICIAN_SPEED, side, 'out');
  return { x: path[0]!.x, lift: 0, dir: side, mode: 'absent' };
}

type LiveProps = {
  stageX: number; base: number; unit: number; width: number; minutes: number; dayOffset: number;
  outfits: readonly Outfit[]; sky: Sky; rainy: boolean; still: boolean; lit?: boolean; stageId?: string;
};

// Musiciens à l'échelle de la scène (0,8 du repère de la scène), pieds sur le trottoir (`base`) ou sur le plancher. La boucle de
// l'horloge murale place les marcheurs à chaque image et ne re-rend que lorsqu'un musicien change d'état. `dayOffset` : jours
// écoulés depuis le jour de la fête (1 la nuit suivante). `outfits` : trois tenues tirées de la graine par l'appelant (jamais
// Math.random). Mouvement réduit : seulement ceux qui jouent, immobiles.
export function StageBand({ stageX, base, unit, width, minutes, dayOffset, outfits, sky: night, rainy, still, lit = false, stageId = '' }: LiveProps): ReactElement | null {
  const sky = lit ? { ...night, daylight: Math.max(night.daylight, 0.75) } : night;
  const now = Date.now() / 1000;
  const dayStart = useSceneDayStart(minutes, now) - dayOffset * 86400;
  const g = useMemo(() => ({ stageX, width, unit }), [stageX, width, unit]);
  const statesAt = (t: number): MusicianPos[] => MUSICIANS.map((_, i) => musicianAt(i, t, dayStart, g));
  const [sig, setSig] = useState('');
  const root = useRef<SVGGElement | null>(null);
  const k = unit * SCALE;
  const transformOf = (p: MusicianPos): string => `translate(${p.x.toFixed(1)} ${(base + p.lift * STAGE_STAND * unit).toFixed(1)}) scale(${(p.dir * k).toFixed(3)} ${k.toFixed(3)})`;
  const place = useMemo(
    () => (t: number): void => {
      if (still) return;
      const st = statesAt(t);
      const key = st.map((p) => p.mode).join(',');
      if (key !== sig) setSig(key);
      const el = root.current;
      if (!el) return;
      st.forEach((p, i) => {
        if (p.mode === 'walking') el.querySelector(`[data-stage-band="${MUSICIANS[i]!.instrument}"]`)?.setAttribute('transform', transformOf(p));
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dayStart, g, sig, still, base, k],
  );
  useWallClockLoop(place, [place]);
  const states = statesAt(now).map((p) => (still && p.mode !== 'playing' ? { ...p, mode: 'absent' as const } : p));
  if (states.every((p) => p.mode === 'absent')) return null;
  return (
    <g data-stage-band-group={stageId} ref={root}>
      {MUSICIANS.map((m, i) => {
        const p = states[i]!;
        if (p.mode === 'absent') return null;
        const walking = p.mode === 'walking';
        return (
          <g key={m.instrument} data-stage-band={m.instrument} data-mode={p.mode} data-trip={p.trip} data-lit={lit ? 'true' : 'false'} transform={transformOf(p)}>
            <g>
              {!still && !walking && <animateTransform attributeName="transform" type="rotate" values="0 0 0;-2.5 0 0;0 0 0;2.5 0 0;0 0 0" dur={`${(1.1 + i * 0.25).toFixed(2)}s`} repeatCount="indefinite" />}
              <PersonSprite outfit={outfits[i % outfits.length]!} sky={sky} rainy={rainy} umbrella={false} stride={walking ? i * 0.3 : null} />
            </g>
            {/* En marche, l'instrument est porté : le tambour et le pied du micro ne touchent pas le sol. */}
            <g transform={walking ? 'translate(0 -4)' : undefined}>
              <Prop kind={m.instrument} sky={sky} />
            </g>
          </g>
        );
      })}
    </g>
  );
}

// Faisceaux : pointe = lentille du projecteur i, base = sol du plancher sous le musicien i.
export function StageBeams({ still }: { still: boolean }): ReactElement {
  return (
    <g data-stage-beams="">
      {STAGE.spotXs.map((_, i) => {
        const o = spotLens(i);
        const tx = MUSICIANS[i]!.x;
        const ty = -STAGE.floor;
        return (
          <polygon
            key={i}
            data-stage-beam={i}
            data-origin-x={o.x.toFixed(2)}
            data-origin-y={o.y.toFixed(2)}
            data-target-x={tx}
            data-target-y={ty}
            points={`${o.x.toFixed(2)},${o.y.toFixed(2)} ${tx - BEAM_HALF},${ty} ${tx + BEAM_HALF},${ty}`}
            fill="#FFF1B8"
            opacity={0.3}
          >
            {!still && <animate attributeName="opacity" values="0.24;0.36;0.24" dur={`${(2.4 + i * 0.5).toFixed(1)}s`} repeatCount="indefinite" />}
          </polygon>
        );
      })}
    </g>
  );
}
