import type { ReactElement } from 'react';
import type { Outfit } from '../core/library/city/people';
import type { Sky } from '../core/library/sky';
import { PersonSprite, tone } from './city-sprites';
import { STAGE, STAGE_STAND, spotLens } from './install-sprites';

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

// `outfits` : trois tenues tirées de la graine par l'appelant (jamais Math.random).
export function StageBand({ outfits, sky: night, rainy, still, lit = false }: { outfits: readonly Outfit[]; sky: Sky; rainy: boolean; still: boolean; lit?: boolean }): ReactElement {
  const sky = lit ? { ...night, daylight: Math.max(night.daylight, 0.75) } : night;
  return (
    <g data-stage-band-group="">
      {MUSICIANS.map((m, i) => (
        <g key={m.instrument} data-stage-band={m.instrument} data-lit={lit ? 'true' : 'false'} transform={`translate(${m.x} ${STAGE_STAND})`}>
          <g transform={`scale(${SCALE})`}>
            <g>
              {!still && <animateTransform attributeName="transform" type="rotate" values="0 0 0;-2.5 0 0;0 0 0;2.5 0 0;0 0 0" dur={`${(1.1 + i * 0.25).toFixed(2)}s`} repeatCount="indefinite" />}
              <PersonSprite outfit={outfits[i % outfits.length]!} sky={sky} rainy={rainy} umbrella={false} />
            </g>
            <Prop kind={m.instrument} sky={sky} />
          </g>
        </g>
      ))}
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
