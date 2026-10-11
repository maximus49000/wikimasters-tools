import type { GradientLike } from '../../../../src/core/library/paint/paint-ctx';
import type { ShopPaintCtx } from '../../../../src/core/library/paint/shop/ctx';

// Faux contexte (aussi celui des commerces, G4a : transformations et texte enregistrés) : enregistre chaque appel, chaque point touché (boîte englobante pour ellipses, arcs et rectangles) et la
// couleur de chaque remplissage. Le moteur n'utilise aucune transformation : les points sont donc en coordonnées du monde.
export type Op = { op: string; args: number[] };
export type RecordingCtx = ShopPaintCtx & { ops: Op[]; points: [number, number][]; fills: string[]; texts: string[] };

export function recordingCtx(): RecordingCtx {
  const ops: Op[] = [];
  const points: [number, number][] = [];
  const fills: string[] = [];
  const texts: string[] = [];
  const log = (op: string, args: number[] = []): void => void ops.push({ op, args });
  const pt = (x: number, y: number): void => void points.push([x, y]);
  const ctx: RecordingCtx = {
    ops,
    points,
    fills,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    save: () => log('save'),
    restore: () => log('restore'),
    beginPath: () => log('beginPath'),
    closePath: () => log('closePath'),
    moveTo: (x, y) => { log('moveTo', [x, y]); pt(x, y); },
    lineTo: (x, y) => { log('lineTo', [x, y]); pt(x, y); },
    quadraticCurveTo: (cx, cy, x, y) => { log('quadraticCurveTo', [cx, cy, x, y]); pt(cx, cy); pt(x, y); },
    ellipse: (x, y, rx, ry, rot, a0, a1) => { log('ellipse', [x, y, rx, ry, rot, a0, a1]); const m = Math.max(rx, ry); pt(x - m, y - m); pt(x + m, y + m); },
    arc: (x, y, r, a0, a1) => { log('arc', [x, y, r, a0, a1]); pt(x - r, y - r); pt(x + r, y + r); },
    rect: (x, y, w, h) => { log('rect', [x, y, w, h]); pt(x, y); pt(x + w, y + h); },
    fill: () => { log('fill'); fills.push(String(ctx.fillStyle)); },
    stroke: () => log('stroke'),
    clip: () => log('clip'),
    fillRect: (x, y, w, h) => { log('fillRect', [x, y, w, h]); pt(x, y); pt(x + w, y + h); fills.push(String(ctx.fillStyle)); },
    strokeRect: (x, y, w, h) => { log('strokeRect', [x, y, w, h]); pt(x, y); pt(x + w, y + h); },
    texts,
    lineCap: 'butt',
    lineJoin: 'miter',
    font: '10px sans-serif',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    translate: (x, y) => log('translate', [x, y]),
    rotate: (a) => log('rotate', [a]),
    scale: (x, y) => log('scale', [x, y]),
    bezierCurveTo: (a, b, c, d, x, y) => { log('bezierCurveTo', [a, b, c, d, x, y]); pt(a, b); pt(c, d); pt(x, y); },
    roundRect: (x, y, w, h, r) => { log('roundRect', [x, y, w, h, r]); pt(x, y); pt(x + w, y + h); },
    fillText: (s, x, y) => { log('fillText', [x, y]); texts.push(s); fills.push(String(ctx.fillStyle)); },
    strokeText: (_s, x, y) => log('strokeText', [x, y]),
    // Largeur approchée : 0,55 em par caractère (taille lue dans `font`, 10 px par défaut).
    measureText: (s) => ({ width: s.length * 0.55 * Number(/(\d+(?:\.\d+)?)px/.exec(ctx.font)?.[1] ?? 10) }),
    createLinearGradient: (x0, y0, x1, y1): GradientLike => { log('gradient', [x0, y0, x1, y1]); return { addColorStop: () => undefined }; },
  };
  return ctx;
}
