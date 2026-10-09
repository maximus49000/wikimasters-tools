import type { ReactElement } from 'react';
import type { StandingKind } from '../core/library/library-types';
import type { PxRect } from '../core/library/room-grid';
import type { Palette } from '../core/library/styles';

const NO_REFERRER = { referrerPolicy: 'no-referrer' } as object;

// Meubles d'une pièce Steampunk qui prennent un dessin propre (les autres types gardent leur dessin habituel).
export const STEAMPUNK_REDRAWN: readonly StandingKind[] = ['desk', 'armchair', 'lamp'];

// Vrai quand la personne a demandé moins de mouvement : aucune animation n'est alors rendue.
function reducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

type Props = { rect: PxRect; palette: Palette };

// Établi de laiton : plateau épais, deux pieds en tubes à brides, étagère basse, quatre rivets.
function Desk({ rect: { x, y, w, h }, palette: p }: Props): ReactElement {
  const legW = w * 0.06;
  const legs: [number, number] = [x + w * 0.08, x + w * 0.92 - legW];
  return (
    <g data-steampunk-art="desk">
      {legs.map((lx, i) => (
        <g key={i}>
          <rect x={lx} y={y + 10} width={legW} height={h - 10} fill={p.metal} stroke={p.woodDark} strokeWidth={1} />
          <rect x={lx - 3} y={y + 10} width={legW + 6} height={4} fill={p.edge} stroke={p.woodDark} strokeWidth={1} />
          <rect x={lx - 3} y={y + h - 5} width={legW + 6} height={5} fill={p.edge} stroke={p.woodDark} strokeWidth={1} />
        </g>
      ))}
      <rect x={legs[0] + legW} y={y + h * 0.62} width={legs[1] - legs[0] - legW} height={5} fill={p.wood} stroke={p.woodDark} strokeWidth={1} />
      <rect x={x} y={y} width={w} height={10} rx={2} fill={p.edge} stroke={p.woodDark} strokeWidth={1.5} />
      {[0.06, 0.35, 0.65, 0.94].map((f) => (
        <circle key={f} cx={x + w * f} cy={y + 5} r={1.6} fill={p.woodDark} />
      ))}
    </g>
  );
}

// Fauteuil club en cuir : dossier arrondi, assise, accoudoirs, clous de laiton, pieds en boules.
function Armchair({ rect: { x, y, w, h }, palette: p }: Props): ReactElement {
  return (
    <g data-steampunk-art="armchair">
      <rect x={x + w * 0.04} y={y + h * 0.04} width={w * 0.92} height={h * 0.72} rx={h * 0.28} fill={p.fabric} />
      {Array.from({ length: 7 }, (_, i) => (
        <circle key={i} cx={x + w * (0.2 + i * 0.1)} cy={y + h * 0.2} r={1.4} fill={p.edge} />
      ))}
      <rect x={x + w * 0.16} y={y + h * 0.42} width={w * 0.68} height={h * 0.38} rx={h * 0.1} fill={p.fabricLight} />
      <rect x={x} y={y + h * 0.34} width={w * 0.19} height={h * 0.5} rx={h * 0.16} fill={p.fabricDark} />
      <rect x={x + w * 0.81} y={y + h * 0.34} width={w * 0.19} height={h * 0.5} rx={h * 0.16} fill={p.fabricDark} />
      {[0.4, 0.55, 0.7].map((f) => (
        <g key={f}>
          <circle cx={x + w * 0.09} cy={y + h * f} r={1.4} fill={p.edge} />
          <circle cx={x + w * 0.91} cy={y + h * f} r={1.4} fill={p.edge} />
        </g>
      ))}
      <circle cx={x + w * 0.12} cy={y + h * 0.93} r={h * 0.06} fill={p.edge} />
      <circle cx={x + w * 0.88} cy={y + h * 0.93} r={h * 0.06} fill={p.edge} />
    </g>
  );
}

// Lampe à gaz : pied et tige de cuivre, globe de verre qui vacille, petit halo.
function Lamp({ rect: { x, y, w, h }, palette: p, lit = true }: Props & { lit?: boolean }): ReactElement {
  const cx = x + w / 2;
  const motion = !reducedMotion();
  return (
    <g data-steampunk-art="lamp">
      {lit && <circle data-lamp-halo="" pointerEvents="none" cx={cx} cy={y + h * 0.17} r={Math.min(w, h) * 0.5} fill="#FFD38A" opacity={0.3} />}
      <ellipse cx={cx} cy={y + h - 4} rx={w * 0.4} ry={4} fill={p.metal} stroke={p.woodDark} strokeWidth={1} />
      <rect x={cx - 2} y={y + h * 0.3} width={4} height={h * 0.7 - 6} fill={p.metal} />
      <rect x={cx - 4} y={y + h * 0.55} width={8} height={3} fill={p.edge} />
      <rect x={cx - w * 0.2} y={y + h * 0.27} width={w * 0.4} height={4} fill={p.edge} stroke={p.woodDark} strokeWidth={1} />
      <circle cx={cx} cy={y + h * 0.17} r={Math.min(w * 0.3, h * 0.1)} fill={p.shade} stroke={p.edge} strokeWidth={1}>
        {motion && lit && <animate attributeName="opacity" values="1;0.8;0.95;0.75;1" dur="2.4s" repeatCount="indefinite" />}
      </circle>
      {!lit && <circle cx={cx} cy={y + h * 0.17} r={Math.min(w * 0.3, h * 0.1)} fill="#1B1B24" opacity={0.55} />}
    </g>
  );
}

// Globe mécanique : socle, pied, méridien de laiton incliné, sphère et continents, engrenage au pied.
function Globe({ rect: { x, y, w, h }, palette: p }: Props): ReactElement {
  const cx = x + w / 2;
  const r = Math.min(w, h) * 0.34;
  const cy = y + h * 0.36;
  const gy = y + h * 0.8;
  return (
    <g data-steampunk-art="globe">
      <rect x={x + w * 0.2} y={y + h * 0.88} width={w * 0.6} height={h * 0.12} rx={3} fill={p.woodDark} stroke={p.edge} strokeWidth={1} />
      <rect x={cx - 3} y={cy + r} width={6} height={y + h * 0.9 - cy - r} fill={p.metal} />
      <circle cx={cx} cy={cy} r={r} fill={p.fabricLight} stroke={p.edge} strokeWidth={1.5} />
      <path d={`M${cx - r * 0.55} ${cy - r * 0.4} q${r * 0.4} ${-r * 0.3} ${r * 0.7} 0 q${-r * 0.1} ${r * 0.5} ${-r * 0.5} ${r * 0.5} z`} fill={p.leaf} />
      <path d={`M${cx + r * 0.1} ${cy + r * 0.15} q${r * 0.5} ${-r * 0.1} ${r * 0.55} ${r * 0.35} q${-r * 0.3} ${r * 0.3} ${-r * 0.5} ${r * 0.1} z`} fill={p.leaf} />
      <ellipse cx={cx} cy={cy} rx={r * 1.12} ry={r * 1.12} fill="none" stroke={p.edge} strokeWidth={2} transform={`rotate(-23 ${cx} ${cy})`} strokeDasharray={`${r * 5} ${r * 2}`} />
      <g data-gear>
        <circle cx={cx} cy={gy} r={h * 0.07} fill={p.edge} stroke={p.woodDark} strokeWidth={1} />
        {Array.from({ length: 6 }, (_, i) => (
          <rect key={i} x={cx - 1.5} y={gy - h * 0.07 - 2} width={3} height={3} fill={p.edge} transform={`rotate(${i * 60} ${cx} ${gy})`} />
        ))}
        <circle cx={cx} cy={gy} r={h * 0.025} fill={p.woodDark} />
      </g>
    </g>
  );
}

// Télescope : trépied de laiton, tube de cuivre incliné avec bagues, oculaire.
function Telescope({ rect: { x, y, w, h }, palette: p }: Props): ReactElement {
  const cx = x + w * 0.5;
  const pivotY = y + h * 0.55;
  return (
    <g data-steampunk-art="telescope">
      <line x1={cx} y1={pivotY} x2={x + w * 0.12} y2={y + h} stroke={p.edge} strokeWidth={3} strokeLinecap="round" />
      <line x1={cx} y1={pivotY} x2={x + w * 0.88} y2={y + h} stroke={p.edge} strokeWidth={3} strokeLinecap="round" />
      <line x1={cx} y1={pivotY} x2={cx} y2={y + h} stroke={p.edge} strokeWidth={3} strokeLinecap="round" />
      <g transform={`rotate(-35 ${cx} ${pivotY})`}>
        <rect x={cx - w * 0.45} y={pivotY - h * 0.05} width={w * 0.9} height={h * 0.1} rx={2} fill={p.metal} stroke={p.woodDark} strokeWidth={1} />
        {[-0.25, 0.05, 0.3].map((f) => (
          <rect key={f} x={cx + w * f} y={pivotY - h * 0.065} width={4} height={h * 0.13} fill={p.edge} stroke={p.woodDark} strokeWidth={0.8} />
        ))}
        <rect x={cx + w * 0.45} y={pivotY - h * 0.03} width={w * 0.1} height={h * 0.06} rx={1} fill={p.woodDark} />
        <ellipse cx={cx - w * 0.45} cy={pivotY} rx={2} ry={h * 0.06} fill={p.shade} stroke={p.edge} strokeWidth={1} />
      </g>
      <circle cx={cx} cy={pivotY} r={4} fill={p.edge} stroke={p.woodDark} strokeWidth={1} />
    </g>
  );
}

// Automate de bureau : tête ronde à lunettes, corps de laiton, manivelle qui tourne lentement, clé de remontage.
function Automaton({ rect: { x, y, w, h }, palette: p }: Props): ReactElement {
  const cx = x + w / 2;
  const motion = !reducedMotion();
  const crankX = x + w * 0.9;
  const crankY = y + h * 0.7;
  return (
    <g data-steampunk-art="automaton">
      <rect x={x + w * 0.2} y={y + h * 0.4} width={w * 0.6} height={h * 0.5} rx={4} fill={p.edge} stroke={p.woodDark} strokeWidth={1.5} />
      <rect x={x + w * 0.15} y={y + h * 0.9} width={w * 0.7} height={h * 0.1} rx={2} fill={p.woodDark} />
      <circle cx={cx} cy={y + h * 0.25} r={Math.min(w, h) * 0.24} fill={p.metal} stroke={p.woodDark} strokeWidth={1.5} />
      <circle cx={cx - w * 0.12} cy={y + h * 0.24} r={4} fill="#F4F0E0" stroke={p.woodDark} strokeWidth={1} />
      <circle cx={cx + w * 0.12} cy={y + h * 0.24} r={4} fill="#F4F0E0" stroke={p.woodDark} strokeWidth={1} />
      <line x1={cx - w * 0.04} y1={y + h * 0.24} x2={cx + w * 0.04} y2={y + h * 0.24} stroke={p.woodDark} strokeWidth={1} />
      <circle cx={cx - w * 0.12} cy={y + h * 0.24} r={1.4} fill={p.woodDark} />
      <circle cx={cx + w * 0.12} cy={y + h * 0.24} r={1.4} fill={p.woodDark} />
      <circle cx={cx} cy={y + h * 0.65} r={h * 0.07} fill={p.metal} stroke={p.woodDark} strokeWidth={1} />
      <g data-crank>
        <line x1={crankX} y1={crankY} x2={crankX} y2={crankY - h * 0.14} stroke={p.metal} strokeWidth={2.5} strokeLinecap="round" />
        <circle cx={crankX} cy={crankY - h * 0.14} r={2.5} fill={p.edge} stroke={p.woodDark} strokeWidth={0.8} />
        {motion && <animateTransform attributeName="transform" type="rotate" from={`0 ${crankX} ${crankY}`} to={`360 ${crankX} ${crankY}`} dur="6s" repeatCount="indefinite" />}
      </g>
      <rect x={x + w * 0.04} y={y + h * 0.58} width={w * 0.18} height={3} fill={p.edge} stroke={p.woodDark} strokeWidth={0.8} />
      <circle cx={x + w * 0.04} cy={y + h * 0.58 + 1.5} r={3} fill={p.edge} stroke={p.woodDark} strokeWidth={0.8} />
    </g>
  );
}

export function SteampunkArt({ kind, rect, palette, lit }: { lit?: boolean; kind: 'desk' | 'armchair' | 'lamp' | 'globe' | 'telescope' | 'automaton'; rect: PxRect; palette: Palette }): ReactElement {
  switch (kind) {
    case 'desk': return <Desk rect={rect} palette={palette} />;
    case 'armchair': return <Armchair rect={rect} palette={palette} />;
    case 'lamp': return <Lamp rect={rect} palette={palette} lit={lit} />;
    case 'globe': return <Globe rect={rect} palette={palette} />;
    case 'telescope': return <Telescope rect={rect} palette={palette} />;
    case 'automaton': return <Automaton rect={rect} palette={palette} />;
  }
}

// Machine analytique : coffre de cuivre, écran à tube (image de la carte), cadrans à droite, clavier à touches rondes.
// Mêmes proportions que ComputerArt : la zone touchable de l'écran (RoomView) tombe dans le tube.
export function AnalyticalEngineArt({ rect: { x, y, w, h }, imageUrl }: { rect: PxRect; imageUrl?: string }): ReactElement {
  const bodyH = h - 12;
  const dialsX = x + w * 0.88;
  return (
    <g data-steampunk-art="analytical-engine">
      <rect x={x} y={y} width={w} height={bodyH} rx={5} fill="#B87333" stroke="#8A6A22" strokeWidth={1.5} />
      <rect x={x + 5} y={y + 5} width={w - 10} height={bodyH - 10} rx={4} fill="#1D1D22" />
      {imageUrl && <image href={imageUrl} x={x + 5} y={y + 5} width={w - 10} height={bodyH - 10} {...NO_REFERRER} preserveAspectRatio="xMidYMid slice" />}
      {[0.3, 0.7].map((f) => (
        <g key={f}>
          <circle cx={dialsX} cy={y + bodyH * f} r={Math.min(5, w * 0.045)} fill="#F4F0E0" stroke="#8A6A22" strokeWidth={1} />
          <line x1={dialsX} y1={y + bodyH * f} x2={dialsX + 2} y2={y + bodyH * f - 3} stroke="#3A2A12" strokeWidth={1} />
        </g>
      ))}
      <rect x={x + w * 0.1} y={y + bodyH} width={w * 0.8} height={12} rx={3} fill="#8A6A22" />
      {Array.from({ length: 7 }, (_, i) => (
        <circle key={i} cx={x + w * (0.17 + i * 0.11)} cy={y + bodyH + 6} r={2.4} fill="#C9A24B" stroke="#3A2A12" strokeWidth={0.6} />
      ))}
    </g>
  );
}
