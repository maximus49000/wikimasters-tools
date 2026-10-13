// Dessin provisoire Opus — reprise Fable prévue.
import { memo, type ReactElement } from 'react';
import type { Angle } from '../core/library/footprint';
import { FURNITURE_MODELS, STEAMPUNK_TRIM } from '../core/library/furniture-models';
import { CELL_H, CELL_W, renderModel, type Fill } from '../core/library/furniture-render3d';
import type { StandingKind } from '../core/library/library-types';
import type { PxRect } from '../core/library/room-grid';
import type { Palette } from '../core/library/styles';

const LIT_SHADE = '#FFE9A8';

// Éclaircit (> 1) ou assombrit (< 1) une couleur #RRGGBB.
export function shadeHex(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1, 7), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * factor))).toString(16).padStart(2, '0');
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}

// Coordonnées au dixième de pixel : attributs SVG courts (le rendu ne change pas à l'œil).
const r1 = (v: number): number => Math.round(v * 10) / 10;
const pts = (points: [number, number][]): string => points.map(([x, y]) => `${r1(x)},${r1(y)}`).join(' ');

// Formes prêtes à dessiner (attributs déjà arrondis) ; `ink` : 'none' aplat sans trait, 'only' trait seul.
type Drawn =
  | { tag: 'polygon'; points: string; fill: Fill; shade: number; ink?: 'none' | 'only' }
  | { tag: 'polyline'; points: string; fill: Fill; shade: number }
  | { tag: 'ellipse'; cx: number; cy: number; rx: number; ry: number; fill: Fill; shade: number };
type Geometry = { shapes: Drawn[]; cols: number; rows: number; halo: { cx: number; cy: number; rx: number; ry: number } | null };

// Géométrie par (meuble, angle, garnitures Steampunk), calculée une fois : la pièce se redessine à chaque mouvement du doigt.
const geometryCache = new Map<string, Geometry>();
function geometryOf(kind: StandingKind, angle: Angle, steampunk: boolean): Geometry {
  const key = `${kind}:${angle}:${steampunk ? 1 : 0}`;
  const hit = geometryCache.get(key);
  if (hit) return hit;
  const base = FURNITURE_MODELS[kind];
  const trim = steampunk ? (STEAMPUNK_TRIM[kind] ?? []) : [];
  const r = renderModel(trim.length > 0 ? { ...base, pieces: [...base.pieces, ...trim] } : base, angle);
  const shapes: Drawn[] = r.shapes.map((s): Drawn => (s.kind === 'poly' ? { tag: 'polygon', points: pts(s.points), fill: s.fill, shade: s.shade, ink: s.ink }
    : s.kind === 'line' ? { tag: 'polyline', points: pts(s.points), fill: s.fill, shade: s.shade }
      : { tag: 'ellipse', cx: r1(s.cx), cy: r1(s.cy), rx: r1(s.rx), ry: r1(s.ry), fill: s.fill, shade: s.shade }));
  // Halo d'une lampe allumée : autour de son abat-jour, quel que soit l'angle.
  let halo: Geometry['halo'] = null;
  if (kind === 'lamp') {
    const xy = r.shapes.flatMap((s): [number, number][] => (s.fill !== 'shade' ? [] : s.kind === 'ellipse' ? [[s.cx - s.rx, s.cy - s.ry], [s.cx + s.rx, s.cy + s.ry]] : s.points));
    if (xy.length > 0) {
      const [x0, x1] = [Math.min(...xy.map((p) => p[0])), Math.max(...xy.map((p) => p[0]))];
      const [y0, y1] = [Math.min(...xy.map((p) => p[1])), Math.max(...xy.map((p) => p[1]))];
      halo = { cx: r1((x0 + x1) / 2), cy: r1((y0 + y1) / 2), rx: r1((x1 - x0) * 1.1), ry: r1(y1 - y0) };
    }
  }
  const g = { shapes, cols: r.cols, rows: r.rows, halo };
  geometryCache.set(key, g);
  return g;
}

type Props = { kind: StandingKind; angle: Angle; rect: PxRect; palette: Palette; lit?: boolean; steampunk?: boolean };

// Meuble dessiné depuis son modèle 3D (vraies proportions), mis à l'échelle de son rectangle.
function Model3DArtImpl({ kind, angle, rect, palette, lit = true, steampunk = false }: Props): ReactElement {
  const g = geometryOf(kind, angle, steampunk);
  const sx = rect.w / (g.cols * CELL_W);
  const sy = rect.h / (g.rows * CELL_H);
  const color = (fill: Fill, shade: number) => shadeHex(kind === 'lamp' && fill === 'shade' && lit ? LIT_SHADE : palette[fill], shade);
  return (
    <g data-model3d="" transform={`translate(${r1(rect.x)} ${r1(rect.y)}) scale(${sx} ${sy})`}>
      {lit && g.halo && <ellipse data-lamp-halo="" pointerEvents="none" cx={g.halo.cx} cy={g.halo.cy} rx={g.halo.rx} ry={g.halo.ry} fill="#FFD38A" opacity={0.35} />}
      {g.shapes.map((s, i) => (s.tag === 'polygon'
        ? <polygon key={i} points={s.points} fill={s.ink === 'only' ? 'none' : color(s.fill, s.shade)} stroke={s.ink === 'none' ? 'none' : palette.edge} strokeWidth={1.2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        : s.tag === 'polyline'
          ? <polyline key={i} points={s.points} fill="none" stroke={color(s.fill, s.shade)} strokeWidth={1} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          : <ellipse key={i} cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} fill={color(s.fill, s.shade)} stroke={palette.edge} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />))}
    </g>
  );
}

// Redessiné seulement si le meuble change (le rectangle arrive neuf à chaque rendu : comparé par valeur).
export const Model3DArt = memo(Model3DArtImpl, (a, b) => a.kind === b.kind && a.angle === b.angle && a.palette === b.palette && a.lit === b.lit
  && a.steampunk === b.steampunk && a.rect.x === b.rect.x && a.rect.y === b.rect.y && a.rect.w === b.rect.w && a.rect.h === b.rect.h);

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
