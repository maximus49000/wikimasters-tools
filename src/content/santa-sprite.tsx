import type { ReactElement } from 'react';
import type { SantaPose } from '../core/library/city/santa';
import type { Sky } from '../core/library/sky';
import { tone } from './city-sprites';

// Le traîneau du père Noël. Repère : bas du traîneau (patins) à y = 0, centré en x = 0, tourné vers +x (le calque applique
// `scale(dir, 1)`) ; les rennes sont devant (x > 0), la traînée derrière. Aucun id SVG fixe ; une animation SMIL par élément
// scintillant, aucune en mouvement réduit.
// `santa` : à bord, debout à côté du traîneau (avec sa hotte), ou caché derrière la cheminée. `lit` : lanterne du traîneau
// allumée (la nuit). `landed` : posé sur un toit (pas de traînée, rennes aux sabots posés).
type Props = { sky: Sky; still: boolean; santa: SantaPose['santa']; lit: boolean; landed?: boolean };

const RED = '#C8283A';
const GOLD = '#E8B93A';
const FUR = '#8A5A34';
const SKIN = '#F0C8A0';

// Un renne : corps, tête, bois, nez rouge pour le meneur, clochette. `legs` : pattes tendues en vol, repliées au sol.
function Reindeer({ x, y, lead, landed, t }: { x: number; y: number; lead: boolean; landed: boolean; t: (c: string) => string }): ReactElement {
  const fur = t(FUR);
  return (
    <g transform={`translate(${x} ${y})`} data-reindeer="">
      {landed ? (
        <path d="M-3 2 V6 M3 2 V6" stroke={fur} strokeWidth={1.2} />
      ) : (
        <path d="M-3 2 L-7 5 M3 2 L8 4" stroke={fur} strokeWidth={1.2} fill="none" />
      )}
      <ellipse cx={0} cy={0} rx={5} ry={2.8} fill={fur} />
      <path d="M4 -1 L8 -4" stroke={fur} strokeWidth={2} />
      <circle cx={9} cy={-4.5} r={2} fill={fur} />
      <path d="M8.5 -6 L7 -9 M8.5 -6 L10.5 -9 M7 -9 L5.5 -8.5 M10.5 -9 L12 -8.5" stroke={t('#5A3A20')} strokeWidth={0.8} fill="none" />
      <circle cx={10.8} cy={-4.2} r={lead ? 1 : 0.5} fill={lead ? '#FF3B3B' : t('#2A1A10')} />
      <circle cx={4.5} cy={0.5} r={0.9} fill={t(GOLD)} />
    </g>
  );
}

export function SantaSprite({ sky, still, santa, lit, landed = false }: Props): ReactElement {
  const t = (c: string): string => tone(c, sky);
  const sparkle = (cx: number, cy: number, r: number, dur: number): ReactElement => (
    <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill="#FFF3B0" opacity={0.85}>
      {!still && <animate attributeName="opacity" values="0.9;0.15;0.9" dur={`${dur}s`} repeatCount="indefinite" />}
    </circle>
  );
  // Posé, l'attelage se resserre et l'ensemble se recentre sur le toit (les toits proches font 28 à 54 px de large).
  const team: readonly (readonly [number, number, boolean])[] = landed
    ? [[24, -11, false], [35, -11, false], [20, -5, false], [31, -5, false], [46, -7, true]]
    : [[28, -11, false], [46, -11, false], [22, -5, false], [40, -5, false], [62, -7, true]];
  const trail = [sparkle(-30, -9, 1.6, 0.7), sparkle(-40, -7, 1.2, 0.9), sparkle(-51, -10, 1.4, 0.6), sparkle(-62, -8, 1, 1.1), sparkle(-72, -9.5, 0.8, 0.8)];
  const sack = (
    <g data-santa-sack="">
      <path d="M-3 -2 Q-8 -10 -1 -13 Q5 -10 3 -2Z" fill={t('#8A6A3E')} />
      <path d="M-3 -11 Q-1 -14 2 -11" stroke={t('#5A3A20')} strokeWidth={0.8} fill="none" />
    </g>
  );
  return (
    <g data-santa-sprite="" transform={landed ? 'translate(-14 0)' : undefined}>
      {!landed && <g data-santa-trail="">{trail}</g>}
      {/* Traits de harnais : deux rangs de rennes reliés au traîneau. */}
      <path d={landed ? 'M8 -7 H50 M8 -4 H40' : 'M8 -7 H70 M8 -4 H58'} stroke={t(GOLD)} strokeWidth={0.6} fill="none" />
      {team.map(([x, y, lead]) => (
        <Reindeer key={`${x}-${y}`} x={x} y={y} lead={lead} landed={landed} t={t} />
      ))}
      {/* Traîneau : caisse rouge, dossier relevé, patins dorés. */}
      <path d="M-18 -8 Q-19 -14 -14 -14 L-12 -9 L10 -9 Q12 -7 9 -4 L-14 -4 Q-18 -4 -18 -8Z" fill={t(RED)} />
      <path d="M-14 -9 H9" stroke={t(GOLD)} strokeWidth={1} />
      <path d="M-20 0 Q-22 -2 -19 -3 H9 Q13 -3 13 -7 M-16 -3 V0 M0 -3 V0" stroke={t(GOLD)} strokeWidth={1.4} fill="none" />
      <circle cx={13} cy={-7} r={0.9} fill={t(GOLD)} />
      {lit && (
        <g data-santa-lantern="">
          <circle cx={11} cy={-11} r={3} fill="#FFE08A" opacity={0.35} />
          <circle cx={11} cy={-11} r={1.2} fill="#FFF3B0" />
        </g>
      )}
      {santa === 'aboard' && (
        <g data-santa-figure="" data-santa-where="aboard">
          {sack}
          <rect x={-8} y={-17} width={7} height={9} rx={2} fill={t(RED)} />
          <circle cx={-4.5} cy={-20} r={2.4} fill={t(SKIN)} />
          <path d="M-7 -19.5 Q-4.5 -14 -2 -19.5 Z" fill={t('#FFFFFF')} />
          <path d="M-7.2 -21 L-4.5 -26 L-1.8 -21Z" fill={t(RED)} />
          <circle cx={-4.5} cy={-26.2} r={1} fill={t('#FFFFFF')} />
        </g>
      )}
      {santa === 'walking' && (
        <g data-santa-figure="" data-santa-where="walking" transform="translate(-28 0)">
          <path d="M-2 -10 V0 M2 -10 V0" stroke={t('#3A2A1E')} strokeWidth={1.6} />
          <rect x={-4} y={-20} width={8} height={11} rx={2} fill={t(RED)} />
          <rect x={-4} y={-12} width={8} height={1.4} fill={t('#2A1A10')} />
          <circle cx={0} cy={-23} r={2.6} fill={t(SKIN)} />
          <path d="M-3 -22.5 Q0 -16 3 -22.5Z" fill={t('#FFFFFF')} />
          <path d="M-3.2 -24 L0 -29.5 L3.2 -24Z" fill={t(RED)} />
          <circle cx={0} cy={-29.8} r={1.1} fill={t('#FFFFFF')} />
          <g transform="translate(-5 -6) scale(1.2)">{sack}</g>
        </g>
      )}
    </g>
  );
}
