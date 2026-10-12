import { COOL, INK, SUN } from '../cel';
import { hexRgb, mixRgb, rgba } from '../color';
import { parseColor, type ShopPaintCtx } from './ctx';

// Primitives cellulo des commerces (G4a), portées de la maquette validée (docs/superpowers/maquettes/g4-commerces/) :
// forme = aplat, ombre nette à droite teintée violet-bleu, rehaut à gauche, trait encré brun. Couleurs : chaînes CSS
// (#rrggbb ou rgba) ; la teinte de nuit est appliquée par le contexte (tintedCtx), jamais ici.
export { INK };
export type Box = [number, number, number, number];
export type CelOpts = { box?: Box; s?: number; sx?: number; l?: number; lx?: number; lw?: number; a?: number; rot?: number };

const rgbOf = (c: string): [number, number, number] => parseColor(c)?.rgb ?? [...hexRgb('#888888')] as [number, number, number];
const alphaOf = (c: string): number => parseColor(c)?.a ?? 1;
export const shadeOf = (c: string, t = 0.3): string => rgba(mixRgb(rgbOf(c), COOL, t), alphaOf(c));
export const lightOf = (c: string, t = 0.3): string => rgba(mixRgb(rgbOf(c), SUN, t), alphaOf(c));
export const withAlpha = (c: string, a: number): string => (a >= 1 ? c : rgba(rgbOf(c), a * alphaOf(c)));

// Forme : chemin `path` rempli, puis (si `box`) ombre et rehaut rognés au chemin, puis contour encré.
export function cel(x: ShopPaintCtx, path: () => void, c: string, { box, s = 0.28, sx = 0.66, l = 0.2, lx = 0.2, lw = 0.2, a = 1 }: CelOpts = {}): void {
  x.beginPath();
  path();
  x.fillStyle = withAlpha(c, a);
  x.fill();
  if (box && (s || l)) {
    x.save();
    x.beginPath();
    path();
    x.clip();
    if (s) {
      x.fillStyle = withAlpha(shadeOf(c, s), a);
      x.fillRect(box[0] + box[2] * sx, box[1] - 1, box[2] + 1, box[3] + 2);
    }
    if (l) {
      x.fillStyle = withAlpha(lightOf(c, l), a);
      x.fillRect(box[0] - 1, box[1] - 1, box[2] * lx + 1, box[3] + 2);
    }
    x.restore();
  }
  if (lw) {
    x.beginPath();
    path();
    x.strokeStyle = INK;
    x.lineWidth = lw;
    x.stroke();
  }
}

export const R = (x: ShopPaintCtx, x0: number, y0: number, w: number, h: number, c: string, o: CelOpts = {}): void =>
  cel(x, () => x.rect(x0, y0, w, h), c, { box: [x0, y0, w, h], ...o });
export const RR = (x: ShopPaintCtx, x0: number, y0: number, w: number, h: number, r: number, c: string, o: CelOpts = {}): void =>
  cel(x, () => x.roundRect(x0, y0, w, h, r), c, { box: [x0, y0, w, h], ...o });
export const E = (x: ShopPaintCtx, cx: number, cy: number, rx: number, ry: number, c: string, o: CelOpts = {}): void =>
  cel(x, () => x.ellipse(cx, cy, rx, ry, o.rot ?? 0, 0, Math.PI * 2), c, { box: [cx - rx, cy - ry, rx * 2, ry * 2], ...o });
export function P(x: ShopPaintCtx, pts: readonly (readonly [number, number])[], c: string, o: CelOpts = {}): void {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const box: Box = [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
  cel(
    x,
    () => {
      pts.forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py)));
      x.closePath();
    },
    c,
    { box, ...o },
  );
}
export function L(x: ShopPaintCtx, x1: number, y1: number, x2: number, y2: number, c = INK, lw = 0.2): void {
  x.strokeStyle = c;
  x.lineWidth = lw;
  x.lineCap = 'round';
  x.beginPath();
  x.moveTo(x1, y1);
  x.lineTo(x2, y2);
  x.stroke();
}
export function F(x: ShopPaintCtx, x0: number, y0: number, w: number, h: number, c: string, a = 1): void {
  x.fillStyle = withAlpha(c, a);
  x.fillRect(x0, y0, w, h);
}
export function dot(x: ShopPaintCtx, cx: number, cy: number, r: number, c: string, a = 1): void {
  x.fillStyle = withAlpha(c, a);
  x.beginPath();
  x.arc(cx, cy, r, 0, Math.PI * 2);
  x.fill();
}

// Reflet diagonal blanc d'une vitre (deux bandes, rognées à la vitre).
export function glint(x: ShopPaintCtx, x0: number, y0: number, w: number, h: number, a = 0.22): void {
  x.save();
  x.beginPath();
  x.rect(x0, y0, w, h);
  x.clip();
  x.fillStyle = `rgba(255,255,255,${a})`;
  const b = x0 + w * 0.12;
  for (const [o, k] of [[0, 3], [5, 1]] as const) {
    x.beginPath();
    x.moveTo(b + o, y0 + h);
    x.lineTo(b + o + h * 0.5, y0);
    x.lineTo(b + o + h * 0.5 + k, y0);
    x.lineTo(b + o + k, y0 + h);
    x.fill();
  }
  x.restore();
}

export type TextOpts = { font?: 'serif' | 'sans' | 'neon'; bold?: boolean; w?: number; stroke?: string | null };

// Texte centré en (cx, cy), comprimé horizontalement pour tenir dans `w` (jamais élargi).
export function fitText(x: ShopPaintCtx, s: string, cx: number, cy: number, size: number, color: string, { font = 'sans', bold = false, w, stroke = null }: TextOpts = {}): void {
  x.save();
  const family = font === 'serif' ? 'serif' : font === 'neon' ? 'cursive' : 'sans-serif';
  x.font = `${font === 'neon' ? 'italic ' : ''}${bold ? 'bold ' : ''}${size}px ${family}`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  const m = x.measureText(s).width;
  const k = w !== undefined && m > w ? w / m : 1;
  x.translate(cx, cy);
  x.scale(k, 1);
  if (stroke) {
    x.strokeStyle = stroke;
    x.lineWidth = size * 0.22;
    x.lineJoin = 'round';
    x.strokeText(s, 0, 0);
  }
  x.fillStyle = color;
  x.fillText(s, 0, 0);
  x.restore();
}
