// Dessin provisoire Opus — reprise Fable prévue.
import type { ReactElement } from 'react';
import type { Angle } from '../core/library/footprint';
import { FURNITURE_MODELS, STEAMPUNK_TRIM } from '../core/library/furniture-models';
import { renderModel } from '../core/library/furniture-render3d';
import type { StandingKind } from '../core/library/library-types';
import type { PxRect } from '../core/library/room-grid';
import type { Palette } from '../core/library/styles';

const CELL_W = 30;
const CELL_H = 510 / 18;
const LIT_SHADE = '#FFE9A8';

// Éclaircit (> 1) ou assombrit (< 1) une couleur #RRGGBB.
export function shadeHex(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1, 7), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * factor))).toString(16).padStart(2, '0');
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}

// Meuble dessiné depuis son modèle 3D (vraies proportions), mis à l'échelle de son rectangle.
export function Model3DArt({ kind, angle, rect, palette, lit = true, steampunk = false }: { kind: StandingKind; angle: Angle; rect: PxRect; palette: Palette; lit?: boolean; steampunk?: boolean }): ReactElement {
  const base = FURNITURE_MODELS[kind];
  const trim = steampunk ? (STEAMPUNK_TRIM[kind] ?? []) : [];
  const model = trim.length > 0 ? { ...base, pieces: [...base.pieces, ...trim] } : base;
  const r = renderModel(model, angle);
  const sx = rect.w / (r.cols * CELL_W);
  const sy = rect.h / (r.rows * CELL_H);
  const color = (fill: keyof Palette, shade: number) => shadeHex(kind === 'lamp' && fill === 'shade' && lit ? LIT_SHADE : palette[fill], shade);
  return (
    <g data-model3d="" transform={`translate(${rect.x} ${rect.y}) scale(${sx} ${sy})`}>
      {r.shapes.map((s, i) => (s.kind === 'poly'
        ? <polygon key={i} points={s.points.map(([x, y]) => `${x},${y}`).join(' ')} fill={color(s.fill, s.shade)} stroke={palette.edge} strokeWidth={1.2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        : <ellipse key={i} cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} fill={color(s.fill, s.shade)} stroke={palette.edge} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />))}
    </g>
  );
}
