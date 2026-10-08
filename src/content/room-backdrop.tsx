import type { ReactElement } from 'react';
import type { StyleId } from '../core/library/library-types';
import type { PxRect } from '../core/library/room-grid';
import { decorOf, paletteOf, type FloorPattern, type WallPattern } from '../core/library/styles';

type BackdropProps = { style: StyleId; width: number; height: number; wallH: number };

// Motif de mur : le contenu d'un <pattern> (traits dans la couleur d'accent du style).
function wallPattern(kind: WallPattern, accent: string, wall: string, wallH: number): ReactElement | null {
  const line = { stroke: accent, strokeWidth: 1.5, opacity: 0.35, fill: 'none' };
  switch (kind) {
    case 'bands':
      return <pattern id="wmt-wall-pat" patternUnits="userSpaceOnUse" width={10} height={60}><rect width={10} height={4} fill={accent} opacity={0.35} /></pattern>;
    case 'bricks':
      return <pattern id="wmt-wall-pat" patternUnits="userSpaceOnUse" width={60} height={30}><path d="M0 0H60M0 15H60M0 30H60M30 0V15M0 15V30M60 15V30" {...line} /></pattern>;
    case 'leaves':
      return (
        <pattern id="wmt-wall-pat" patternUnits="userSpaceOnUse" width={48} height={48}>
          <ellipse cx={12} cy={12} rx={4} ry={9} transform="rotate(-30 12 12)" fill={accent} opacity={0.35} />
          <ellipse cx={36} cy={36} rx={4} ry={9} transform="rotate(30 36 36)" fill={accent} opacity={0.35} />
        </pattern>
      );
    case 'stripes':
      return <pattern id="wmt-wall-pat" patternUnits="userSpaceOnUse" width={40} height={10}><rect width={20} height={10} fill={accent} opacity={0.35} /></pattern>;
    case 'slats':
      return <pattern id="wmt-wall-pat" patternUnits="userSpaceOnUse" width={14} height={10}><path d="M0 0V10" {...line} /></pattern>;
    case 'brass': {
      const rivets: ReactElement[] = [];
      for (let y = 20; y < wallH; y += 40) rivets.push(<circle key={y} cx={4} cy={y} r={1.6} fill={wall} opacity={0.8} />);
      return (
        <pattern id="wmt-wall-pat" patternUnits="userSpaceOnUse" width={120} height={wallH}>
          <rect width={8} height={wallH} fill={accent} />
          {rivets}
        </pattern>
      );
    }
    default:
      return null;
  }
}

// Motif de sol.
function floorPattern(kind: FloorPattern, accent: string): ReactElement | null {
  const line = { stroke: accent, strokeWidth: 1.5, opacity: 0.35, fill: 'none' };
  switch (kind) {
    case 'boards':
      return <pattern id="wmt-floor-pat" patternUnits="userSpaceOnUse" width={80} height={16}><path d="M0 0H80M0 8H80M20 0V8M60 8V16" {...line} /></pattern>;
    case 'concrete':
      return (
        <pattern id="wmt-floor-pat" patternUnits="userSpaceOnUse" width={30} height={30}>
          <circle cx={6} cy={8} r={1} fill={accent} opacity={0.4} />
          <circle cx={21} cy={14} r={1} fill={accent} opacity={0.4} />
          <circle cx={12} cy={25} r={1} fill={accent} opacity={0.4} />
        </pattern>
      );
    case 'checker':
      return (
        <pattern id="wmt-floor-pat" patternUnits="userSpaceOnUse" width={40} height={20}>
          <rect width={20} height={10} fill={accent} opacity={0.45} />
          <rect x={20} y={10} width={20} height={10} fill={accent} opacity={0.45} />
        </pattern>
      );
    case 'tatami':
      return (
        <pattern id="wmt-floor-pat" patternUnits="userSpaceOnUse" width={120} height={30}>
          <rect width={120} height={30} {...line} />
          <path d="M60 0V30" {...line} />
        </pattern>
      );
    case 'tiles':
      return <pattern id="wmt-floor-pat" patternUnits="userSpaceOnUse" width={40} height={20}><rect width={40} height={20} fill="none" stroke={accent} strokeWidth={1.5} opacity={0.5} /></pattern>;
    case 'plates':
      return (
        <pattern id="wmt-floor-pat" patternUnits="userSpaceOnUse" width={60} height={30}>
          <rect width={60} height={30} {...line} />
          {[[4, 4], [56, 4], [4, 26], [56, 26]].map(([cx, cy]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={1.4} fill={accent} opacity={0.6} />)}
        </pattern>
      );
    default:
      return null;
  }
}

// Mur, motif de mur, sol, motif de sol et plinthe du style de la pièce.
export function RoomBackdrop({ style, width, height, wallH }: BackdropProps) {
  const palette = paletteOf(style);
  const decor = decorOf(style);
  const wallPat = wallPattern(decor.wall, decor.accent, palette.wall, wallH);
  const floorPat = floorPattern(decor.floor, decor.accent);
  return (
    <g>
      {(wallPat || floorPat) && <defs>{wallPat}{floorPat}</defs>}
      <rect data-backdrop="wall" width={width} height={wallH} fill={palette.wall} />
      <rect data-wall-pattern={decor.wall} width={width} height={wallH} fill={wallPat ? 'url(#wmt-wall-pat)' : 'none'} />
      <rect data-backdrop="floor" y={wallH} width={width} height={height - wallH} fill={palette.floor} />
      <rect data-floor-pattern={decor.floor} y={wallH} width={width} height={height - wallH} fill={floorPat ? 'url(#wmt-floor-pat)' : 'none'} />
      <rect data-backdrop="skirt" y={wallH - 4} width={width} height={5} fill={palette.skirt} opacity={0.6} />
    </g>
  );
}

// Halo lumineux du style Néon.
export function NeonDefs() {
  return (
    <defs>
      <filter id="wmt-neon-glow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="3" result="b" />
        <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
    </defs>
  );
}

// Liseré lumineux autour d'un meuble (marge de 1 px).
export function neonOutline(rect: PxRect, color: string): ReactElement {
  return (
    <rect
      data-neon-outline
      x={rect.x - 1}
      y={rect.y - 1}
      width={rect.w + 2}
      height={rect.h + 2}
      rx={4}
      fill="none"
      stroke={color}
      strokeWidth={2}
      filter="url(#wmt-neon-glow)"
      style={{ pointerEvents: 'none' }}
    />
  );
}
