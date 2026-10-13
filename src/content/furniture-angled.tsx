// Dessin provisoire Opus — reprise Fable prévue.
import type { ReactElement } from 'react';
import type { Angle } from '../core/library/footprint';
import { projectParts } from '../core/library/furniture-projection';
import { VOLUMES } from '../core/library/furniture-volumes';
import type { StandingKind } from '../core/library/library-types';
import type { PxRect } from '../core/library/room-grid';
import type { Palette } from '../core/library/styles';

// Éclaircit (> 1) ou assombrit (< 1) une couleur #RRGGBB.
export function shadeHex(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1, 7), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * factor))).toString(16).padStart(2, '0');
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}

// Meuble tourné (angles 1 à 7) : faces projetées, aplats + trait encré (style cellulo).
export function AngledFurnitureArt({ kind, angle, rect, palette, lit = true }: { kind: StandingKind; angle: Angle; rect: PxRect; palette: Palette; lit?: boolean }): ReactElement {
  if (kind === 'rug') {
    // Tapis : un losange au sol en diagonale, un rectangle sinon.
    const { x, y, w, h } = rect;
    const pts = angle % 2 === 1 ? `${x + w * 0.25},${y} ${x + w},${y + h * 0.3} ${x + w * 0.75},${y + h} ${x},${y + h * 0.7}` : `${x},${y} ${x + w},${y} ${x + w},${y + h} ${x},${y + h}`;
    return <polygon points={pts} fill={palette.rug} stroke={palette.edge} strokeWidth={1.5} strokeLinejoin="round" />;
  }
  const faces = projectParts(VOLUMES[kind], angle, rect);
  return (
    <g>
      {faces.map((f, i) => (
        <polygon key={i} data-face="" points={f.points.map(([px, py]) => `${px},${py}`).join(' ')}
          fill={shadeHex(kind === 'lamp' && f.fill === 'shade' && lit ? '#FFE9A8' : palette[f.fill], f.shade)}
          stroke={palette.edge} strokeWidth={1.2} strokeLinejoin="round" />
      ))}
    </g>
  );
}

// Écran vu de dos (gris, sans image) ou de profil (tranche fine).
export function ComputerBackArt({ rect, side }: { rect: PxRect; side: boolean }): ReactElement {
  const w = side ? 6 : rect.w;
  const x = rect.x + (rect.w - w) / 2;
  const screenH = rect.h - 12;
  return (
    <g data-computer-back="">
      <rect x={x} y={rect.y} width={w} height={screenH} rx={3} fill="#3A3A40" stroke="#1D1D22" strokeWidth={1} />
      <rect x={rect.x + rect.w / 2 - 4} y={rect.y + screenH} width={8} height={rect.h - screenH - 4} fill="#555555" />
      <rect x={rect.x + rect.w / 2 - (side ? 6 : 17)} y={rect.y + rect.h - 4} width={side ? 12 : 34} height={4} rx={2} fill="#555555" />
    </g>
  );
}
