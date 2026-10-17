import type { ReactElement, ReactNode } from 'react';
import { REINDEER_CYCLE_S, REINDEER_IDLE_S, TRAIL_CYCLE_S } from '../core/library/paint/props/santa';
import type { SantaPose } from '../core/library/city/santa';
import type { Sky } from '../core/library/sky';
import { tone } from './city-sprites';
import { CycledProp, PropImage, PropInMirror, type PropSpec } from './prop/prop-host';

// Le traîneau du père Noël. Repère : bas du traîneau (patins) à y = 0, centré en x = 0, tourné vers +x (le calque applique
// `scale(dir, 1)`) ; les rennes sont devant (x > 0), la traînée derrière. Aucun id SVG fixe ; une animation SMIL par élément
// scintillant, aucune en mouvement réduit.
// `santa` : à bord, à pied sur le toit (avec sa hotte), ou dans la maison. `lit` : lanterne du traîneau allumée (la nuit).
// `landed` : posé sur un toit (pas de traînée, rennes aux sabots posés). `walker` : le père Noël à pied (et, en Ghibli, aussi
// à bord), posé par le calque et dessiné AVANT la caisse du traîneau : à sa place, la caisse lui cache les jambes.
// `seated` : dessin classique à bord, après la caisse comme avant (faux en Ghibli, où le pantin de `walker` est à bord).
type Props = { sky: Sky; still: boolean; santa: SantaPose['santa']; lit: boolean; landed?: boolean; walker?: ReactNode; seated?: boolean };

const RED = '#C8283A';
const GOLD = '#E8B93A';
const FUR = '#8A5A34';
const SKIN = '#F0C8A0';

// Un renne : corps, tête, bois, nez rouge pour le meneur, clochette. `legs` : pattes tendues en vol, repliées au sol.
export function Reindeer({ x, y, lead, landed, t }: { x: number; y: number; lead: boolean; landed: boolean; t: (c: string) => string }): ReactElement {
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

export function SantaSprite({ sky, still, santa, lit, landed = false, walker, seated = true }: Props): ReactElement {
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
  return (
    <g data-santa-sprite="" transform={landed ? 'translate(-14 0)' : undefined}>
      {!landed && <g data-santa-trail="">{trail}</g>}
      {/* Traits de harnais : deux rangs de rennes reliés au traîneau. */}
      <path d={landed ? 'M8 -7 H50 M8 -4 H40' : 'M8 -7 H70 M8 -4 H58'} stroke={t(GOLD)} strokeWidth={0.6} fill="none" />
      {team.map(([x, y, lead]) => (
        <Reindeer key={`${x}-${y}`} x={x} y={y} lead={lead} landed={landed} t={t} />
      ))}
      {walker}
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
      {santa === 'aboard' && seated && (
        <g data-santa-figure="" data-santa-where="aboard">
          <SantaSack t={t} />
          <rect x={-8} y={-17} width={7} height={9} rx={2} fill={t(RED)} />
          <circle cx={-4.5} cy={-20} r={2.4} fill={t(SKIN)} />
          <path d="M-7 -19.5 Q-4.5 -14 -2 -19.5 Z" fill={t('#FFFFFF')} />
          <path d="M-7.2 -21 L-4.5 -26 L-1.8 -21Z" fill={t(RED)} />
          <circle cx={-4.5} cy={-26.2} r={1} fill={t('#FFFFFF')} />
        </g>
      )}
    </g>
  );
}

// Hotte (repère : fond du sac à y = -2, centré en x = 0).
export function SantaSack({ t }: { t: (c: string) => string }): ReactElement {
  return (
    <g data-santa-sack="">
      <path d="M-3 -2 Q-8 -10 -1 -13 Q5 -10 3 -2Z" fill={t('#8A6A3E')} />
      <path d="M-3 -11 Q-1 -14 2 -11" stroke={t('#5A3A20')} strokeWidth={0.8} fill="none" />
    </g>
  );
}

// Père Noël classique à pied (pieds à l'origine), hotte à l'épaule ; le calque le pose sur son chemin.
export function ClassicSantaWalker({ sky }: { sky: Sky }): ReactElement {
  const t = (c: string): string => tone(c, sky);
  return (
    <>
      <path d="M-2 -10 V0 M2 -10 V0" stroke={t('#3A2A1E')} strokeWidth={1.6} />
      <rect x={-4} y={-20} width={8} height={11} rx={2} fill={t(RED)} />
      <rect x={-4} y={-12} width={8} height={1.4} fill={t('#2A1A10')} />
      <circle cx={0} cy={-23} r={2.6} fill={t(SKIN)} />
      <path d="M-3 -22.5 Q0 -16 3 -22.5Z" fill={t('#FFFFFF')} />
      <path d="M-3.2 -24 L0 -29.5 L3.2 -24Z" fill={t(RED)} />
      <circle cx={0} cy={-29.8} r={1.1} fill={t('#FFFFFF')} />
      <g transform="translate(-5 -6) scale(1.2)">
        <SantaSack t={t} />
      </g>
    </>
  );
}

// ---------- Ghibli (G5) : attelage, traîneau, traînée et hotte en images peintes (paint/props/santa.ts) ----------
// Les images sont posées dans le repère du sprite classique (patins à y = 0, rennes vers +x). L'hôte retourne le repère
// avec le sens du traîneau (`scale(dir 1)`) : chaque image est cuite dans le sens `dir` (lumière juste) et annule ce miroir
// autour d'elle (PropInMirror) ; jamais d'image retournée. Tant qu'une image n'est pas cuite, le dessin classique correspondant
// reste affiché (sans animation SMIL : poses fixes). `far` : teinte lointaine du groupe posé sur la colline.
type GhibliBase = { sky: Sky; dir: 1 | -1; still: boolean; far?: number };
const specOf = (id: string, g: GhibliBase, args: Record<string, string | number | boolean> = {}): Omit<PropSpec, 'frame'> => ({
  id,
  args: g.far ? { ...args, far: g.far } : args,
  dir: g.dir,
  day: g.sky.daylight,
  lit: true,
});
// Image cyclique dans le repère retourné par l'hôte (même règle que PropInMirror).
function CycledInMirror({ spec, period, phase, fallback }: { spec: Omit<PropSpec, 'frame'>; period: number; phase: number; fallback: ReactNode }): ReactElement {
  if ((spec.dir ?? 1) === 1) return <CycledProp spec={spec} period={period} phase={phase} fallback={fallback} />;
  return (
    <g transform="scale(-1 1)">
      <CycledProp spec={spec} period={period} phase={phase} fallback={<g transform="scale(-1 1)">{fallback}</g>} />
    </g>
  );
}

// Positions de l'attelage dans le repère du traîneau (unités), en vol et posé sur un immeuble (classique, inchangé) ; sur la
// colline, le calque étage les rennes sur la pente à partir des mêmes x (santa-layer).
export type TeamSpot = { x: number; y: number; lead: boolean };
export const TEAM_FLIGHT: readonly TeamSpot[] = [{ x: 28, y: -11, lead: false }, { x: 46, y: -11, lead: false }, { x: 22, y: -5, lead: false }, { x: 40, y: -5, lead: false }, { x: 62, y: -7, lead: true }];
export const TEAM_LANDED: readonly TeamSpot[] = [{ x: 24, y: -11, lead: false }, { x: 35, y: -11, lead: false }, { x: 20, y: -5, lead: false }, { x: 31, y: -5, lead: false }, { x: 46, y: -7, lead: true }];
// Traits de harnais (repère du traîneau, unités) : du devant de la caisse (8, y) aux deux rangs.
export const HARNESS_FLIGHT: readonly (readonly [number, number])[] = [[70, -7], [58, -4]];

// Un renne : galop (8 poses sur REINDEER_CYCLE_S, décalé de `phase` cycles) ou posé (4 poses de vie sur REINDEER_IDLE_S) ;
// mouvement réduit : pose 0 sans nœud cyclique. `k` : échelle (px par unité) appliquée autour de (x, y).
export function GhibliReindeer({ x, y, k, lead, landed, phase, g }: { x: number; y: number; k: number; lead: boolean; landed: boolean; phase: number; g: GhibliBase }): ReactElement {
  const t = (c: string): string => tone(c, g.sky);
  const spec = specOf('reindeer', g, { lead, landed });
  const fallback = <Reindeer x={0} y={0} lead={lead} landed={landed} t={t} />;
  return (
    <g transform={`translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${k})`} data-santa-reindeer="">
      {g.still ? <PropInMirror spec={{ ...spec, frame: 0 }} fallback={fallback} /> : <CycledInMirror spec={spec} period={landed ? REINDEER_IDLE_S : REINDEER_CYCLE_S} phase={phase} fallback={fallback} />}
    </g>
  );
}

// Traînée derrière le traîneau (en vol seulement) : 8 poses bouclées sur TRAIL_CYCLE_S.
export function GhibliTrail({ k, g }: { k: number; g: GhibliBase }): ReactElement {
  const spec = specOf('santa-trail', g);
  const fallback = (
    <g>
      {[[-30, -9, 1.6], [-40, -7, 1.2], [-51, -10, 1.4], [-62, -8, 1], [-72, -9.5, 0.8]].map(([cx, cy, r]) => (
        <circle key={cx} cx={cx} cy={cy} r={r} fill="#FFF3B0" opacity={0.85} />
      ))}
    </g>
  );
  return (
    <g data-santa-trail="" transform={`scale(${k})`}>
      {g.still ? <PropInMirror spec={{ ...spec, frame: 0 }} fallback={fallback} /> : <CycledInMirror spec={spec} period={TRAIL_CYCLE_S} phase={0} fallback={fallback} />}
    </g>
  );
}

// Caisse, patins et lanterne (allumée : lanterne dans glowing). L'hôte l'incline avec la pente (rotate sur son parent).
export function GhibliSleighBody({ k, g }: { k: number; g: GhibliBase }): ReactElement {
  const t = (c: string): string => tone(c, g.sky);
  const fallback = (
    <g>
      <path d="M-18 -8 Q-19 -14 -14 -14 L-12 -9 L10 -9 Q12 -7 9 -4 L-14 -4 Q-18 -4 -18 -8Z" fill={t(RED)} />
      <path d="M-20 0 Q-22 -2 -19 -3 H9 Q13 -3 13 -7 M-16 -3 V0 M0 -3 V0" stroke={t(GOLD)} strokeWidth={1.4} fill="none" />
    </g>
  );
  return (
    <g data-santa-body="" transform={`scale(${k})`}>
      <PropInMirror spec={{ ...specOf('sleigh', g), frame: 0 }} fallback={fallback} />
    </g>
  );
}

// Hotte peinte (repère de SantaSack) ; `mirror` : dans un repère retourné par l'hôte (sinon repère du pantin, déjà redressé).
export function GhibliSack({ g, mirror }: { g: GhibliBase; mirror: boolean }): ReactElement {
  const t = (c: string): string => tone(c, g.sky);
  const spec: PropSpec = { ...specOf('santa-sack', g), dir: mirror ? g.dir : 1, frame: 0 };
  return mirror ? <PropInMirror spec={spec} fallback={<SantaSack t={t} />} /> : <PropImage spec={spec} fallback={<SantaSack t={t} />} />;
}

// Traits de harnais rouges cernés d'encre, du devant de la caisse (8, −7) / (8, −4) aux bouts `ends` (px, repère du traîneau).
export function GhibliHarness({ k, ends }: { k: number; ends: readonly (readonly [number, number])[] }): ReactElement {
  const d = ends.map(([x1, y1], i) => `M${(8 * k).toFixed(2)} ${((i === 0 ? -7 : -4) * k).toFixed(2)} L${x1.toFixed(2)} ${y1.toFixed(2)}`).join(' ');
  return (
    <g data-santa-harness="">
      <path d={d} stroke={INK_HARNESS} strokeWidth={1.1 * k} fill="none" />
      <path d={d} stroke="#A02030" strokeWidth={0.6 * k} fill="none" />
    </g>
  );
}
const INK_HARNESS = '#2A1A18';
